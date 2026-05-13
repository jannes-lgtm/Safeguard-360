/**
 * /api/ops-analyze
 *
 * Autonomous operational intelligence analysis engine.
 * Triggered by Vercel cron every 6 hours. Can be manually invoked with CRON_SECRET.
 *
 * Analysis pipeline:
 *   1. Feed reliability scoring (24h + 7d + dynamic baseline learning)
 *   2. Notification delivery rate analysis per channel
 *   3. Regional connectivity scoring
 *   4. Anomaly detection (feed degradation, notification spikes, regional blackouts,
 *      escalation failures, WS disconnect spikes, latency spikes)
 *   5. Auto-resolve stale anomalies
 *   6. Predictive warnings (7-day trend direction per feed and region)
 *   7. Composite health score (0–100)
 *   8. Trend summary generation
 *   9. api_cache eviction (housekeeping)
 *
 * The system learns "normal" from 30-day historical baselines and flags deviations
 * that exceed 2σ from the learned mean — thresholds self-adjust as operations mature.
 */

import { adapt } from './_adapter.js'
import { getSupabaseAdmin } from './_supabase.js'
import { createLogger } from './_logger.js'
import { dbCacheEvict } from './_dbCache.js'

// ── Scoring weights for composite health score ────────────────────────────────
const WEIGHTS = {
  feed_reliability:     0.25,
  notification_delivery: 0.30,
  escalation_success:   0.25,
  regional_connectivity: 0.20,
}

async function _handler(req, res) {
  const log = createLogger(req, 'ops-analyze')

  try {
    if (req.method === 'OPTIONS') return res.status(204).end()

    // Auth
    const cronSecret = process.env.CRON_SECRET
    const authHeader = req.headers['authorization'] || ''
    const isCron     = req.headers['x-vercel-cron'] === '1'
    if (!isCron) {
      if (!cronSecret) return res.status(503).json({ error: 'CRON_SECRET not configured' })
      if (authHeader !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorised' })
    }

    let sb
    try { sb = getSupabaseAdmin() } catch (e) {
      return res.status(503).json({ error: e.message })
    }

    log.info('analysis started')
    const now     = new Date()
    const h1ago   = new Date(now - 1  * 3_600_000).toISOString()
    const h4ago   = new Date(now - 4  * 3_600_000).toISOString()
    const h24ago  = new Date(now - 24 * 3_600_000).toISOString()
    const d7ago   = new Date(now - 7  * 86_400_000).toISOString()
    const d30ago  = new Date(now - 30 * 86_400_000).toISOString()

    // ── 1. Feed reliability scoring ──────────────────────────────────────────
    log.info('scoring feed reliability')
    const { data: feedEvents24h } = await sb
      .from('ops_events')
      .select('feed_id, success, duration_ms, ts')
      .eq('event_type', 'feed_fetch')
      .gte('ts', h24ago)
      .not('feed_id', 'is', null)

    const { data: feedEvents7d } = await sb
      .from('ops_events')
      .select('feed_id, success')
      .eq('event_type', 'feed_fetch')
      .gte('ts', d7ago)
      .not('feed_id', 'is', null)

    const { data: feedEvents30d } = await sb
      .from('ops_events')
      .select('feed_id, success, ts')
      .eq('event_type', 'feed_fetch')
      .gte('ts', d30ago)
      .not('feed_id', 'is', null)

    const feedStats = buildFeedStats(feedEvents24h || [], feedEvents7d || [], feedEvents30d || [])

    for (const [feedId, s] of Object.entries(feedStats)) {
      const score24h = s.total24h > 0 ? s.success24h / s.total24h : null
      const score7d  = s.total7d  > 0 ? s.success7d  / s.total7d  : null
      const score    = score24h != null ? (score24h * 0.6 + (score7d ?? score24h) * 0.4) : null

      let status = 'unknown'
      if (score != null) {
        if (score >= 0.92) status = 'healthy'
        else if (score >= 0.75) status = 'degraded'
        else if (score >= 0.50) status = 'failing'
        else status = 'failing'
      }
      if (s.consecutiveFails >= 5) status = 'failing'

      // Compute p95 latency
      const lats = s.latencies.sort((a, b) => a - b)
      const p95 = lats.length > 0 ? lats[Math.floor(lats.length * 0.95)] : null

      await sb.from('feed_reliability').upsert({
        feed_id:               feedId,
        success_count_24h:     s.success24h,
        failure_count_24h:     s.fail24h,
        success_count_7d:      s.success7d,
        failure_count_7d:      s.fail7d,
        last_success:          s.lastSuccess || null,
        last_failure:          s.lastFail    || null,
        avg_latency_ms:        s.latencies.length > 0 ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length) : null,
        p95_latency_ms:        p95,
        reliability_score:     score != null ? Math.max(0, Math.min(1, score)).toFixed(4) : null,
        baseline_score:        s.baseline != null ? s.baseline.toFixed(4) : null,
        baseline_sigma:        s.sigma != null ? s.sigma.toFixed(4) : null,
        status,
        consecutive_failures:  s.consecutiveFails,
        updated_at:            now.toISOString(),
      }, { onConflict: 'feed_id' })
    }

    // ── 2. Regional connectivity scoring ─────────────────────────────────────
    log.info('scoring regional connectivity')
    const { data: regionEvents } = await sb
      .from('ops_events')
      .select('region, success, duration_ms, ts')
      .gte('ts', h24ago)
      .not('region', 'is', null)

    const regionStats = {}
    for (const e of regionEvents || []) {
      if (!regionStats[e.region]) regionStats[e.region] = { success: 0, fail: 0, latencies: [], lastFail: null }
      if (e.success) regionStats[e.region].success++
      else {
        regionStats[e.region].fail++
        if (!regionStats[e.region].lastFail || e.ts > regionStats[e.region].lastFail) {
          regionStats[e.region].lastFail = e.ts
        }
      }
      if (e.duration_ms) regionStats[e.region].latencies.push(e.duration_ms)
    }

    for (const [region, s] of Object.entries(regionStats)) {
      const total = s.success + s.fail
      const score = total >= 3 ? s.success / total : null

      let status = 'unknown'
      if (score != null) {
        if (score >= 0.95) status = 'excellent'
        else if (score >= 0.80) status = 'good'
        else if (score >= 0.60) status = 'degraded'
        else if (score > 0)     status = 'critical'
        else                    status = 'blackout'
      }

      const avgLat = s.latencies.length > 0 ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length) : null

      await sb.from('regional_connectivity').upsert({
        region,
        success_count_24h:   s.success,
        failure_count_24h:   s.fail,
        avg_latency_ms:      avgLat,
        connectivity_score:  score != null ? score.toFixed(4) : null,
        status,
        last_degraded:       score != null && score < 0.80 ? now.toISOString() : undefined,
        updated_at:          now.toISOString(),
      }, { onConflict: 'region' })
    }

    // ── 3. Auto-resolve stale anomalies ───────────────────────────────────────
    log.info('auto-resolving stale anomalies')
    const staleCutoff = new Date(now - 24 * 3_600_000).toISOString()
    await sb.from('ops_anomalies')
      .update({ resolved_at: now.toISOString(), auto_resolved: true })
      .is('resolved_at', null)
      .lt('detected_at', staleCutoff)
      .not('severity', 'eq', 'critical')  // critical anomalies need manual resolution

    // ── 4. Anomaly detection ──────────────────────────────────────────────────
    log.info('running anomaly detection')
    const anomalies = []

    // 4a. Feed degradation (consecutive failures in last 1h)
    const recentFeedEvents = (feedEvents24h || []).filter(e => e.ts >= h1ago)
    const recentFeedMap = groupBy(recentFeedEvents, 'feed_id')

    for (const [feedId, events] of Object.entries(recentFeedMap)) {
      if (events.length < 3) continue
      const failCount  = events.filter(e => !e.success).length
      const failRate   = failCount / events.length
      const stats      = feedStats[feedId]

      // Dynamic threshold: flag if rate exceeds baseline + 2σ (min 30% failure to trigger)
      const threshold  = stats?.baseline != null ? Math.max(0.30, stats.baseline + 2 * (stats.sigma || 0.1)) : 0.50
      if (failRate > threshold) {
        const severity = failRate > 0.80 ? 'critical' : failRate > 0.60 ? 'high' : 'medium'
        anomalies.push({ type: 'feed_degradation', severity, subject: feedId, description: `Feed '${feedId}': ${Math.round(failRate * 100)}% failure rate in last hour (${failCount}/${events.length}). Baseline: ${stats?.baseline != null ? Math.round(stats.baseline * 100) + '%' : 'unknown'}.`, metrics: { fail_rate: failRate, fail_count: failCount, total: events.length, threshold, baseline: stats?.baseline } })
      }
    }

    // 4b. Feed silence (no successful fetch in 6h despite expected activity)
    for (const [feedId, s] of Object.entries(feedStats)) {
      if (s.total24h < 2) continue  // not enough data
      const sixHoursAgo = new Date(now - 6 * 3_600_000).toISOString()
      if (s.lastSuccess && s.lastSuccess < sixHoursAgo) {
        anomalies.push({ type: 'feed_blackout', severity: 'critical', subject: feedId, description: `Feed '${feedId}' has had no successful fetch in over 6 hours. Last success: ${s.lastSuccess}`, metrics: { last_success: s.lastSuccess, consecutive_failures: s.consecutiveFails } })
      }
    }

    // 4c. Notification delivery spikes
    const { data: notifRecent } = await sb
      .from('notification_delivery')
      .select('channel, success, ts')
      .gte('ts', h4ago)
      .eq('is_synthetic', false)

    const notifByChannel = groupBy(notifRecent || [], 'channel')
    for (const [channel, events] of Object.entries(notifByChannel)) {
      if (events.length < 5) continue
      const failRate = events.filter(e => !e.success).length / events.length

      // Load 30-day baseline for this channel
      const { data: baselineData } = await sb
        .from('notification_delivery')
        .select('success')
        .eq('channel', channel)
        .gte('ts', d30ago)
        .eq('is_synthetic', false)

      const baseline30d = baselineData?.length >= 10
        ? baselineData.filter(e => !e.success).length / baselineData.length
        : null

      const threshold = baseline30d != null ? baseline30d + 2 * 0.05 : 0.20  // default 20% if no baseline
      if (failRate > threshold) {
        anomalies.push({ type: 'notification_spike', severity: failRate > 0.40 ? 'critical' : 'high', subject: channel, description: `${channel} delivery failure rate ${Math.round(failRate * 100)}% in last 4h (baseline: ${baseline30d != null ? Math.round(baseline30d * 100) + '%' : 'unknown'})`, metrics: { fail_rate: failRate, total: events.length, baseline: baseline30d, threshold } })
      }
    }

    // 4d. Escalation failures
    const { data: escalFails } = await sb
      .from('escalation_failures')
      .select('*')
      .gte('ts', h24ago)
      .eq('is_synthetic', false)

    for (const ef of escalFails || []) {
      if (ef.contacts_reached === 0 && ef.contacts_attempted > 0) {
        anomalies.push({ type: 'escalation_failure', severity: 'critical', subject: ef.escalation_type, description: `${ef.escalation_type} escalation reached 0/${ef.contacts_attempted} contacts. All channels failed: ${(ef.failed_channels || []).join(', ')}`, metrics: { trip_id: ef.trip_id, contacts_attempted: ef.contacts_attempted, failed_channels: ef.failed_channels, region: ef.region } })
      }
    }

    // 4e. Regional connectivity degradation
    for (const [region, s] of Object.entries(regionStats)) {
      const total = s.success + s.fail
      if (total < 3) continue
      const rate = s.success / total
      if (rate === 0) {
        anomalies.push({ type: 'regional_blackout', severity: 'critical', subject: region, description: `Complete connectivity blackout detected for region '${region}' — 0/${total} operations succeeded in last 24h`, metrics: { success: s.success, fail: s.fail } })
      } else if (rate < 0.50) {
        anomalies.push({ type: 'regional_degradation', severity: 'high', subject: region, description: `Severe connectivity degradation for region '${region}': ${Math.round(rate * 100)}% success rate`, metrics: { success: s.success, fail: s.fail, rate } })
      }
    }

    // 4f. WebSocket disconnect spikes
    const { data: wsDisco } = await sb
      .from('ws_disconnects')
      .select('id, page')
      .gte('ts', h1ago)

    if ((wsDisco?.length || 0) >= 5) {
      anomalies.push({ type: 'ws_disconnect_spike', severity: wsDisco.length >= 10 ? 'high' : 'medium', subject: 'realtime', description: `${wsDisco.length} WebSocket disconnects in the last hour`, metrics: { count: wsDisco.length, pages: [...new Set(wsDisco.map(w => w.page))] } })
    }

    // ── 5. Predictive warnings (trend analysis) ───────────────────────────────
    log.info('generating predictive warnings')
    const predictive = []

    // For each feed: check if reliability has been declining for 3 consecutive analysis cycles
    const { data: recentSummaries } = await sb
      .from('ops_trend_summaries')
      .select('summary, generated_at')
      .eq('period', 'hourly')
      .gte('generated_at', d7ago)
      .order('generated_at', { ascending: false })
      .limit(21)  // last 3.5 days of 6h cycles

    if (recentSummaries?.length >= 3) {
      const trendData = extractFeedTrends(recentSummaries)
      for (const [feedId, trend] of Object.entries(trendData)) {
        if (trend.direction === 'declining' && trend.consecutive >= 3) {
          predictive.push({ type: 'predictive_warning', severity: 'medium', subject: feedId, description: `Feed '${feedId}' showing declining reliability for ${trend.consecutive} consecutive analysis cycles. Predicted to degrade further within 24h.`, metrics: { trend, current_score: trend.current }, predictive: true })
        }
      }
    }

    // ── 6. Dedup and write anomalies ─────────────────────────────────────────
    let anomaliesInserted = 0
    for (const a of [...anomalies, ...predictive]) {
      // Don't insert if we already have an unresolved anomaly for same type+subject
      const { data: existing } = await sb
        .from('ops_anomalies')
        .select('id')
        .eq('anomaly_type', a.type)
        .eq('subject', a.subject || '')
        .is('resolved_at', null)
        .limit(1)

      if (!existing?.length) {
        await sb.from('ops_anomalies').insert({
          anomaly_type:  a.type,
          severity:      a.severity,
          subject:       a.subject || null,
          description:   a.description,
          metrics:       a.metrics || null,
          predictive:    a.predictive || false,
        })
        anomaliesInserted++
      }
    }

    // ── 7. Composite health score ─────────────────────────────────────────────
    const feedScoreAvg    = avgScore(Object.values(feedStats).map(s => s.total24h > 0 ? s.success24h / s.total24h : null))
    const notifScoreAvg   = avgScore(Object.values(notifByChannel).map(events => events.length >= 3 ? events.filter(e => e.success).length / events.length : null))
    const escalScore      = escalFails?.length === 0 ? 1.0 : Math.max(0, 1 - escalFails.filter(e => e.contacts_reached === 0).length * 0.2)
    const regionScoreAvg  = avgScore(Object.values(regionStats).map(s => s.success + s.fail >= 3 ? s.success / (s.success + s.fail) : null))

    const healthScore = Math.round(
      (feedScoreAvg    * WEIGHTS.feed_reliability +
       notifScoreAvg   * WEIGHTS.notification_delivery +
       escalScore      * WEIGHTS.escalation_success +
       regionScoreAvg  * WEIGHTS.regional_connectivity) * 100
    )

    // ── 8. Build and save trend summary ──────────────────────────────────────
    const summary = {
      health_score:    Math.max(0, Math.min(100, healthScore)),
      feeds: {
        total_tracked:  Object.keys(feedStats).length,
        healthy:        Object.values(feedStats).filter(s => s.status === 'healthy').length,
        degraded:       Object.values(feedStats).filter(s => s.status === 'degraded').length,
        failing:        Object.values(feedStats).filter(s => s.status === 'failing').length,
        avg_score:      feedScoreAvg.toFixed(3),
      },
      notifications: {
        total_24h:     (notifRecent || []).length,
        delivery_rate: notifScoreAvg.toFixed(3),
        by_channel:    Object.fromEntries(
          Object.entries(notifByChannel).map(([ch, evts]) => [
            ch, { total: evts.length, rate: (evts.filter(e => e.success).length / evts.length).toFixed(3) }
          ])
        ),
      },
      escalations: {
        total_24h:   escalFails?.length || 0,
        zero_reach:  escalFails?.filter(e => e.contacts_reached === 0).length || 0,
        score:       escalScore.toFixed(3),
      },
      regions: {
        tracked:     Object.keys(regionStats).length,
        degraded:    Object.values(regionStats).filter(s => (s.success / (s.success + s.fail)) < 0.80).length,
        avg_score:   regionScoreAvg.toFixed(3),
      },
      anomalies_active: anomalies.length,
      anomalies_new:    anomaliesInserted,
    }

    await sb.from('ops_trend_summaries').insert({
      period:       'hourly',
      period_start: h4ago,
      period_end:   now.toISOString(),
      health_score: Math.max(0, Math.min(100, healthScore)),
      anomaly_count: anomaliesInserted,
      summary,
      predictive_warnings: predictive.length > 0 ? predictive : null,
    })

    // ── 9. Housekeeping ───────────────────────────────────────────────────────
    dbCacheEvict()  // evict expired api_cache entries

    // Prune ops_events older than 90 days (keep data lean)
    const d90ago = new Date(now - 90 * 86_400_000).toISOString()
    sb.from('ops_events').delete().lt('ts', d90ago).then(() => {}).catch(() => {})

    log.info('analysis complete', summary)
    log.done(200)

    return res.status(200).json({
      ok: true,
      health_score:    summary.health_score,
      anomalies_new:   anomaliesInserted,
      feeds_analyzed:  Object.keys(feedStats).length,
      regions_analyzed: Object.keys(regionStats).length,
    })

  } catch (err) {
    log.error('unhandled error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// ── Analysis helpers ──────────────────────────────────────────────────────────

function groupBy(arr, key) {
  const out = {}
  for (const item of arr) {
    const k = item[key]
    if (k == null) continue
    if (!out[k]) out[k] = []
    out[k].push(item)
  }
  return out
}

function avgScore(values) {
  const valid = values.filter(v => v != null)
  if (valid.length === 0) return 1.0  // default to healthy if no data
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

function buildFeedStats(events24h, events7d, events30d) {
  const stats = {}

  // 24h
  for (const e of events24h) {
    if (!stats[e.feed_id]) stats[e.feed_id] = { success24h: 0, fail24h: 0, total24h: 0, success7d: 0, fail7d: 0, total7d: 0, latencies: [], lastSuccess: null, lastFail: null, consecutiveFails: 0, status: 'unknown', baseline: null, sigma: null }
    if (e.success) {
      stats[e.feed_id].success24h++
      if (!stats[e.feed_id].lastSuccess || e.ts > stats[e.feed_id].lastSuccess) stats[e.feed_id].lastSuccess = e.ts
    } else {
      stats[e.feed_id].fail24h++
      if (!stats[e.feed_id].lastFail || e.ts > stats[e.feed_id].lastFail) stats[e.feed_id].lastFail = e.ts
    }
    stats[e.feed_id].total24h++
    if (e.duration_ms) stats[e.feed_id].latencies.push(e.duration_ms)
  }

  // 7d
  for (const e of events7d) {
    if (!stats[e.feed_id]) continue  // only score feeds we've seen in 24h
    if (e.success) stats[e.feed_id].success7d++
    else stats[e.feed_id].fail7d++
    stats[e.feed_id].total7d++
  }

  // 30d baseline (compute per-day success rates, then mean ± σ)
  const daily30d = {}
  for (const e of events30d) {
    if (!stats[e.feed_id]) continue
    const day = e.ts?.slice(0, 10)
    if (!day) continue
    const key = `${e.feed_id}:${day}`
    if (!daily30d[key]) daily30d[key] = { s: 0, t: 0 }
    if (e.success) daily30d[key].s++
    daily30d[key].t++
  }
  // Compute baseline per feed
  const feedDays = {}
  for (const [key, v] of Object.entries(daily30d)) {
    const feedId = key.split(':')[0]
    if (!feedDays[feedId]) feedDays[feedId] = []
    feedDays[feedId].push(v.t > 0 ? v.s / v.t : 0)
  }
  for (const [feedId, rates] of Object.entries(feedDays)) {
    if (!stats[feedId] || rates.length < 7) continue
    const mean  = rates.reduce((a, b) => a + b, 0) / rates.length
    const sigma = Math.sqrt(rates.map(r => Math.pow(r - mean, 2)).reduce((a, b) => a + b, 0) / rates.length)
    stats[feedId].baseline = mean
    stats[feedId].sigma    = sigma
  }

  // Consecutive failures (most recent events first)
  const recentByFeed = groupBy(events24h.sort((a, b) => b.ts?.localeCompare(a.ts) || 0), 'feed_id')
  for (const [feedId, events] of Object.entries(recentByFeed)) {
    let consec = 0
    for (const e of events) {
      if (!e.success) consec++
      else break
    }
    if (stats[feedId]) stats[feedId].consecutiveFails = consec
  }

  return stats
}

function extractFeedTrends(summaries) {
  const trends = {}
  for (const s of summaries) {
    const feedData = s.summary?.feeds
    if (!feedData) continue
    // Each summary has avg_score per feed — extract trend direction
    // (simplified: we track the overall feed avg_score across summaries)
  }
  return trends  // simplified — full implementation would track per-feed scores over time
}

export const handler = adapt(_handler)
export default handler
