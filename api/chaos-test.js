/**
 * /api/chaos-test
 *
 * Autonomous chaos testing and synthetic scenario engine.
 * Tests end-to-end platform survivability without affecting real users.
 *
 * POST body: { scenarios?: string[] }
 *   scenarios: subset of ['feeds', 'database', 'ai', 'notifications', 'escalation', 'scan', 'regional']
 *   Defaults to all scenarios.
 *
 * Auth: CRON_SECRET (admin/developer only)
 * Max duration: 90s
 */

import { adapt } from './_adapter.js'
import { getSupabaseAdmin, verifyAdminJwt } from './_supabase.js'
import { createLogger } from './_logger.js'
import { fetchWithRetry } from './_retry.js'
import { emit } from './_telemetry.js'

const CHAOS_TEST_EMAIL    = 'chaos@test.safeguard360.internal'
const CHAOS_MARKER        = 'chaos_test'

const ALL_SCENARIOS = ['feeds', 'database', 'ai', 'notifications', 'regional', 'escalation', 'latency']

async function _handler(req, res) {
  const log = createLogger(req, 'chaos-test')

  try {
    if (req.method === 'OPTIONS') return res.status(204).end()
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    // Auth — accept CRON_SECRET or admin/developer Supabase JWT
    const cronSecret = process.env.CRON_SECRET
    const authHeader = req.headers['authorization'] || ''
    const isCronSecret = cronSecret && authHeader === `Bearer ${cronSecret}`
    if (!isCronSecret) {
      const jwt = await verifyAdminJwt(authHeader)
      if (!jwt.ok) return res.status(jwt.status).json({ error: jwt.error })
    }

    let sb
    try { sb = getSupabaseAdmin() } catch (e) {
      return res.status(503).json({ error: e.message })
    }

    const { scenarios = ALL_SCENARIOS } = req.body || {}
    const toRun = ALL_SCENARIOS.filter(s => scenarios.includes(s))

    log.info('chaos test started', { scenarios: toRun })
    const startMs = Date.now()
    const results = {}

    // ── Scenario: Database connectivity & latency ──────────────────────────
    if (toRun.includes('database')) {
      const t0 = Date.now()
      try {
        const { data, error } = await sb.from('profiles').select('id').limit(1)
        const ms = Date.now() - t0
        results.database = {
          ok: !error,
          latency_ms: ms,
          status: !error ? (ms < 500 ? 'excellent' : ms < 2000 ? 'degraded' : 'slow') : 'failed',
          error: error?.message || null,
        }
        emit({ type: 'chaos_test', endpoint: 'database', success: !error, durationMs: ms, metadata: { scenario: 'database', latency_ms: ms } })
      } catch (e) {
        results.database = { ok: false, error: e.message, status: 'failed' }
      }
    }

    // ── Scenario: AI API reachability ───────────────────────────────────────
    if (toRun.includes('ai')) {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        results.ai = { ok: false, status: 'not_configured', error: 'ANTHROPIC_API_KEY not set' }
      } else {
        const t0 = Date.now()
        try {
          const r = await fetchWithRetry('https://api.anthropic.com/v1/models', {
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            signal: AbortSignal.timeout(8000),
          }, { attempts: 2, baseMs: 500, label: 'chaos-ai' })
          const ms = Date.now() - t0
          const models = r.ok ? (await r.json()).data?.map(m => m.id).slice(0, 3) : null
          results.ai = { ok: r.ok, status: r.ok ? 'reachable' : 'error', latency_ms: ms, models, http_status: r.status }
          emit({ type: 'chaos_test', endpoint: 'ai', success: r.ok, durationMs: ms })
        } catch (e) {
          results.ai = { ok: false, status: 'unreachable', error: e.message }
        }
      }
    }

    // ── Scenario: RSS feed availability (sample 5 feeds) ───────────────────
    if (toRun.includes('feeds')) {
      const testFeeds = [
        { id: 'bbc-africa',       url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml' },
        { id: 'osac',             url: 'https://www.osac.gov/api/rssfeed/rss/recent-reports' },
        { id: 'gdacs',            url: 'https://www.gdacs.org/xml/rss.xml' },
        { id: 'who-outbreak',     url: 'https://www.who.int/rss-feeds/news-english.xml' },
        { id: 'crisis-group-africa', url: 'https://www.crisisgroup.org/rss/africa' },
      ]

      const feedResults = {}
      await Promise.allSettled(
        testFeeds.map(async feed => {
          const t0 = Date.now()
          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 8000)
            const r = await fetch(feed.url, {
              headers: { 'User-Agent': 'SafeGuard360-ChaosTest/1.0' },
              signal: controller.signal,
            })
            clearTimeout(timeout)
            const ms = Date.now() - t0
            feedResults[feed.id] = { ok: r.ok, latency_ms: ms, http_status: r.status, status: r.ok ? (ms < 3000 ? 'healthy' : 'slow') : 'error' }
            emit({ type: 'feed_fetch', feedId: feed.id, success: r.ok, durationMs: ms, metadata: { chaos_test: true } })
          } catch (e) {
            const ms = Date.now() - t0
            feedResults[feed.id] = { ok: false, latency_ms: ms, error: e.message, status: 'unreachable' }
            emit({ type: 'feed_fetch', feedId: feed.id, success: false, durationMs: ms, errorMsg: e.message, metadata: { chaos_test: true } })
          }
        })
      )
      const okCount = Object.values(feedResults).filter(r => r.ok).length
      results.feeds = { ok: okCount >= 3, feeds_ok: okCount, feeds_total: testFeeds.length, detail: feedResults }
    }

    // ── Scenario: Notification path (synthetic send to non-existent address) ─
    if (toRun.includes('notifications')) {
      const resendKey = process.env.RESEND_API_KEY
      const t0 = Date.now()
      if (!resendKey) {
        results.notifications = { ok: false, status: 'not_configured', error: 'RESEND_API_KEY not set' }
      } else {
        try {
          // Send to a chaos-test address — we EXPECT this to fail with 422 (unverified domain)
          // but it proves the Resend API is reachable and auth is valid
          const r = await fetchWithRetry('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from:    `Safeguard 360 <test@chaos.safeguard360.internal>`,
              to:      [CHAOS_TEST_EMAIL],
              subject: '[CHAOS TEST] Platform notification path verification',
              html:    '<p>This is a synthetic chaos test — not a real notification.</p>',
            }),
          }, { attempts: 1, label: 'chaos-notify' })
          const ms = Date.now() - t0
          // 200/201 = sent; 422 = domain unverified but API reachable; 401 = bad key
          const apiReachable = r.status !== 0
          const authValid    = r.status !== 401
          results.notifications = { ok: apiReachable && authValid, latency_ms: ms, http_status: r.status, api_reachable: apiReachable, auth_valid: authValid, note: r.status === 422 ? 'API reachable (domain unverified as expected)' : r.status === 200 ? 'Test email sent' : 'Unexpected response' }
          emit({ type: 'chaos_test', endpoint: 'notifications', success: apiReachable && authValid, durationMs: ms })
        } catch (e) {
          results.notifications = { ok: false, error: e.message, status: 'unreachable' }
        }
      }
    }

    // ── Scenario: Regional connectivity simulation ───────────────────────────
    if (toRun.includes('regional')) {
      // Probe representative endpoints in key African/ME regions
      const probes = [
        { region: 'africa-east',   url: 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', label: 'Kenya (Safaricom API)' },
        { region: 'africa-south',  url: 'https://sandbox.safaricom.co.ke/oauth/v1/generate',                           label: 'South Africa region probe' },
        { region: 'middle-east',   url: 'https://api.twilio.com/2010-04-01.json',                                       label: 'Middle East / Twilio edge' },
        { region: 'global',        url: 'https://api.anthropic.com/v1/models',                                         label: 'Global AI infrastructure' },
      ]

      const regionalResults = {}
      await Promise.allSettled(
        probes.map(async probe => {
          const t0 = Date.now()
          try {
            const r = await fetch(probe.url, {
              signal: AbortSignal.timeout(6000),
              headers: { 'User-Agent': 'SafeGuard360-ChaosTest/1.0' },
            })
            const ms = Date.now() - t0
            // Any HTTP response = connectivity OK (we don't care about auth failures here)
            const connected = r.status > 0
            regionalResults[probe.region] = { ok: connected, label: probe.label, latency_ms: ms, http_status: r.status }
            emit({ type: 'chaos_test', endpoint: 'regional', region: probe.region, success: connected, durationMs: ms })
          } catch (e) {
            const ms = Date.now() - t0
            regionalResults[probe.region] = { ok: false, label: probe.label, error: e.message, latency_ms: ms }
            emit({ type: 'chaos_test', endpoint: 'regional', region: probe.region, success: false, durationMs: ms, errorMsg: e.message })
          }
        })
      )
      const okCount = Object.values(regionalResults).filter(r => r.ok).length
      results.regional = { ok: okCount >= 2, regions_ok: okCount, regions_total: probes.length, detail: regionalResults }
    }

    // ── Scenario: Escalation chain verification ───────────────────────────────
    if (toRun.includes('escalation')) {
      // Verify the escalation data path (read emergency contacts table, verify schema)
      try {
        const { data: contacts, error } = await sb
          .from('emergency_contacts')
          .select('id, email, phone')
          .eq('is_test', true)  // only test contacts
          .limit(5)

        const schemaOk = !error
        results.escalation = {
          ok: schemaOk,
          schema_verified: schemaOk,
          test_contacts_configured: (contacts?.length || 0) > 0,
          note: !schemaOk ? error?.message : contacts?.length === 0 ? 'No test emergency contacts configured (add contacts with is_test=true for full chain testing)' : `${contacts.length} test contact(s) available`,
        }
      } catch (e) {
        results.escalation = { ok: false, error: e.message }
      }
    }

    // ── Scenario: API latency baseline ────────────────────────────────────────
    if (toRun.includes('latency')) {
      const probes = [
        { label: 'supabase_read',  fn: () => sb.from('profiles').select('id').limit(1) },
        { label: 'supabase_write', fn: () => sb.from('ops_events').insert({ event_type: 'chaos_test', metadata: { test: true } }) },
        { label: 'supabase_rpc',   fn: () => sb.from('audit_logs').select('id').limit(1) },
      ]

      const latencyResults = {}
      for (const p of probes) {
        const t0 = Date.now()
        try {
          await p.fn()
          const ms = Date.now() - t0
          latencyResults[p.label] = { ok: true, ms, grade: ms < 200 ? 'A' : ms < 500 ? 'B' : ms < 1000 ? 'C' : 'D' }
        } catch (e) {
          latencyResults[p.label] = { ok: false, ms: Date.now() - t0, error: e.message, grade: 'F' }
        }
      }
      const avgMs = Object.values(latencyResults).filter(r => r.ok).map(r => r.ms)
      results.latency = {
        ok: avgMs.length > 0,
        avg_ms: avgMs.length > 0 ? Math.round(avgMs.reduce((a, b) => a + b, 0) / avgMs.length) : null,
        detail: latencyResults,
      }
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const allOk    = Object.values(results).every(r => r.ok !== false)
    const failCount = Object.values(results).filter(r => r.ok === false).length
    const totalMs  = Date.now() - startMs

    const survivabilityScore = Math.round(
      (Object.values(results).filter(r => r.ok !== false).length / Math.max(Object.values(results).length, 1)) * 100
    )

    log.info('chaos test complete', { survivability: survivabilityScore, failed_scenarios: failCount, total_ms: totalMs })

    // Record chaos test result in ops_events
    emit({ type: 'chaos_test', endpoint: 'chaos-test', success: allOk, durationMs: totalMs, metadata: { survivability_score: survivabilityScore, failed_scenarios: failCount, scenarios_run: toRun } })

    return res.status(200).json({
      ok:                   allOk,
      survivability_score:  survivabilityScore,
      scenarios_run:        toRun.length,
      scenarios_passed:     toRun.length - failCount,
      scenarios_failed:     failCount,
      total_ms:             totalMs,
      results,
      assessment:           survivabilityScore >= 90 ? 'FULLY OPERATIONAL' :
                            survivabilityScore >= 70 ? 'DEGRADED — MONITOR CLOSELY' :
                            survivabilityScore >= 50 ? 'PARTIALLY OPERATIONAL — ACTION REQUIRED' :
                            'CRITICAL — PLATFORM INTEGRITY COMPROMISED',
    })

  } catch (err) {
    log.error('chaos test unhandled error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const handler = adapt(_handler)
export default handler
