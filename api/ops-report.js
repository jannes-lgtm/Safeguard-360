/**
 * /api/ops-report
 * GET — Returns the current operational intelligence report.
 * Auth: Supabase JWT (admin/developer only enforced at route level)
 *
 * Returns:
 *   health_score, active_anomalies, feed_reliability, regional_connectivity,
 *   notification_delivery, escalation_stats, latest_trend, predictive_warnings
 */

import { adapt } from './_adapter.js'
import { getSupabaseAdmin } from './_supabase.js'
import { checkRateLimit } from './_rateLimit.js'

async function _handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end()
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    // Light rate limit (report can be refreshed frequently from the dashboard)
    const { allowed } = checkRateLimit(req, 'ops-report', { max: 60, windowMs: 3_600_000 })
    if (!allowed) return res.status(429).json({ error: 'Rate limit exceeded' })

    let sb
    try { sb = getSupabaseAdmin() } catch (e) {
      return res.status(503).json({ error: e.message })
    }

    const now     = new Date()
    const h24ago  = new Date(now - 24 * 3_600_000).toISOString()
    const d7ago   = new Date(now - 7  * 86_400_000).toISOString()

    // Fetch all data in parallel
    const [
      { data: anomalies },
      { data: feeds },
      { data: regions },
      { data: notifRecent },
      { data: escalations },
      { data: latestTrend },
      { data: wsDisco },
    ] = await Promise.all([
      // Active unresolved anomalies
      sb.from('ops_anomalies')
        .select('*')
        .is('resolved_at', null)
        .order('detected_at', { ascending: false })
        .limit(50),

      // Feed reliability scores
      sb.from('feed_reliability')
        .select('*')
        .order('reliability_score', { ascending: true })
        .limit(100),

      // Regional connectivity
      sb.from('regional_connectivity')
        .select('*')
        .order('connectivity_score', { ascending: true, nullsFirst: true })
        .limit(50),

      // Notification delivery last 24h
      sb.from('notification_delivery')
        .select('channel, notification_type, success, duration_ms, ts')
        .gte('ts', h24ago)
        .eq('is_synthetic', false),

      // Escalation failures last 7d
      sb.from('escalation_failures')
        .select('escalation_type, contacts_attempted, contacts_reached, region, ts')
        .gte('ts', d7ago)
        .eq('is_synthetic', false)
        .order('ts', { ascending: false })
        .limit(50),

      // Latest trend summary
      sb.from('ops_trend_summaries')
        .select('*')
        .order('generated_at', { ascending: false })
        .limit(1)
        .single(),

      // WS disconnects last 24h
      sb.from('ws_disconnects')
        .select('page, status, reconnected, reconnect_ms, ts')
        .gte('ts', h24ago)
        .order('ts', { ascending: false })
        .limit(100),
    ])

    // ── Notification delivery breakdown ──────────────────────────────────────
    const notifStats = {}
    for (const n of notifRecent || []) {
      if (!notifStats[n.channel]) notifStats[n.channel] = { total: 0, success: 0, failed: 0, avg_ms: [] }
      notifStats[n.channel].total++
      if (n.success) notifStats[n.channel].success++
      else notifStats[n.channel].failed++
      if (n.duration_ms) notifStats[n.channel].avg_ms.push(n.duration_ms)
    }
    const notifByChannel = Object.fromEntries(
      Object.entries(notifStats).map(([ch, s]) => [ch, {
        total:        s.total,
        success:      s.success,
        failed:       s.failed,
        delivery_rate: s.total > 0 ? +(s.success / s.total).toFixed(3) : null,
        avg_ms:       s.avg_ms.length > 0 ? Math.round(s.avg_ms.reduce((a, b) => a + b, 0) / s.avg_ms.length) : null,
      }])
    )

    // ── Escalation summary ────────────────────────────────────────────────────
    const escalStats = {
      total_7d:          escalations?.length || 0,
      zero_reach_7d:     escalations?.filter(e => e.contacts_reached === 0).length || 0,
      partial_reach_7d:  escalations?.filter(e => e.contacts_reached > 0 && e.contacts_reached < e.contacts_attempted).length || 0,
      by_type:           {},
    }
    for (const e of escalations || []) {
      escalStats.by_type[e.escalation_type] = (escalStats.by_type[e.escalation_type] || 0) + 1
    }

    // ── WS stats ──────────────────────────────────────────────────────────────
    const wsStats = {
      total_24h:       wsDisco?.length || 0,
      reconnected_24h: wsDisco?.filter(w => w.reconnected).length || 0,
      avg_reconnect_ms: wsDisco?.filter(w => w.reconnect_ms).length > 0
        ? Math.round(wsDisco.filter(w => w.reconnect_ms).reduce((a, w) => a + w.reconnect_ms, 0) / wsDisco.filter(w => w.reconnect_ms).length)
        : null,
    }

    // ── Health score ──────────────────────────────────────────────────────────
    const latestScore = latestTrend?.health_score ?? null

    // Severity distribution of active anomalies
    const anomalyDist = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const a of anomalies || []) {
      if (anomalyDist[a.severity] != null) anomalyDist[a.severity]++
    }

    return res.json({
      ok:              true,
      generated_at:    now.toISOString(),
      health_score:    latestScore,
      last_analysis:   latestTrend?.generated_at || null,
      anomalies: {
        active:        anomalies?.length || 0,
        distribution:  anomalyDist,
        items:         (anomalies || []).slice(0, 20),  // return top 20
      },
      feed_reliability:     feeds         || [],
      regional_connectivity: regions      || [],
      notification_delivery: notifByChannel,
      escalation_stats:      escalStats,
      websocket_stats:       wsStats,
      trend_summary:         latestTrend?.summary || null,
      predictive_warnings:   latestTrend?.predictive_warnings || [],
    })

  } catch (err) {
    console.error('[ops-report] error:', err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const handler = adapt(_handler)
export default handler
