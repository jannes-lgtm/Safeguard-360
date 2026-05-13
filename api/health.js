/**
 * GET /api/health
 * Operational health check — verifies DB connectivity, env var presence,
 * and feed freshness. Used by monitoring, uptime checks, and cron pre-flight.
 *
 * Returns 200 if healthy, 503 if degraded.
 */
import { adapt } from './_adapter.js'

async function _handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const checks = {}
  let healthy = true

  // ── 1. Environment variables ─────────────────────────────────────────────
  const required = {
    SUPABASE_URL:           process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_KEY:   process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY:      process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
    ANTHROPIC_API_KEY:      process.env.ANTHROPIC_API_KEY,
    SCAN_SECRET:            process.env.SCAN_SECRET,
    CRON_SECRET:            process.env.CRON_SECRET,
  }
  const optional = {
    RESEND_API_KEY:         process.env.RESEND_API_KEY,
    TWILIO_ACCOUNT_SID:     process.env.TWILIO_ACCOUNT_SID,
    ESKOMSEPUSH_API_KEY:    process.env.ESKOMSEPUSH_API_KEY,
    ACLED_API_KEY:          process.env.ACLED_API_KEY,
    FLIGHTAWARE_API_KEY:    process.env.FLIGHTAWARE_API_KEY,
  }

  const missingRequired = Object.entries(required).filter(([, v]) => !v).map(([k]) => k)
  const missingOptional = Object.entries(optional).filter(([, v]) => !v).map(([k]) => k)

  checks.env = {
    ok:              missingRequired.length === 0,
    missing_required: missingRequired,
    missing_optional: missingOptional,
  }
  if (!checks.env.ok) healthy = false

  // ── 2. Supabase DB connectivity ──────────────────────────────────────────
  const supabaseUrl  = required.SUPABASE_URL
  const supabaseKey  = required.SUPABASE_ANON_KEY
  if (supabaseUrl && supabaseKey) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const r = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id&limit=1`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        signal: controller.signal,
      })
      clearTimeout(timeout)
      checks.supabase = { ok: r.ok, status: r.status }
      if (!r.ok) healthy = false
    } catch (e) {
      checks.supabase = { ok: false, error: e.message }
      healthy = false
    }
  } else {
    checks.supabase = { ok: false, error: 'SUPABASE_URL or ANON_KEY not set' }
    healthy = false
  }

  // ── 3. Anthropic API reachability ────────────────────────────────────────
  if (required.ANTHROPIC_API_KEY) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const r = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': required.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        signal: controller.signal,
      })
      clearTimeout(timeout)
      checks.anthropic = { ok: r.ok, status: r.status }
      if (!r.ok) healthy = false
    } catch (e) {
      checks.anthropic = { ok: false, error: e.message }
    }
  } else {
    checks.anthropic = { ok: false, error: 'ANTHROPIC_API_KEY not set' }
    healthy = false
  }

  // ── 4. Feed freshness (spot-check one RSS feed) ──────────────────────────
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const r = await fetch('https://feeds.bbci.co.uk/news/world/africa/rss.xml', {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    checks.feeds = { ok: r.ok, status: r.status, tested: 'BBC Africa RSS' }
  } catch (e) {
    checks.feeds = { ok: false, error: e.message }
  }

  const status = healthy ? 200 : 503
  return res.status(status).json({
    ok:        healthy,
    timestamp: new Date().toISOString(),
    version:   process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown',
    checks,
  })
}

export const handler = adapt(_handler)
export default handler
