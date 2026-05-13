/**
 * /api/ops-ingest
 * Receives operational telemetry from the frontend (browser-side events).
 * Used for: WebSocket disconnects, page performance, UI errors.
 *
 * POST body: { events: [{ type, page, status, metadata }] }
 * Auth: Supabase JWT
 * Rate limited: 60 events per user per hour (prevents spam)
 */

import { adapt } from './_adapter.js'
import { getSupabaseAdmin } from './_supabase.js'
import { checkRateLimit } from './_rateLimit.js'

const ALLOWED_TYPES = new Set([
  'ws_disconnect', 'ws_reconnect', 'page_error', 'checkin_submitted',
  'sos_triggered', 'ui_latency', 'map_load_failure',
])

async function _handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end()
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    // Soft auth — validate token if present but don't hard-block (telemetry is low-risk)
    const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()

    // Rate limit by IP or token
    const { allowed } = checkRateLimit(req, 'ops-ingest', { max: 60, windowMs: 3_600_000 })
    if (!allowed) return res.status(429).json({ error: 'Rate limit exceeded' })

    let sb
    try { sb = getSupabaseAdmin() } catch (e) {
      return res.status(503).json({ error: e.message })
    }

    const { events = [] } = req.body || {}
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array required' })
    }

    // Sanitise and filter to allowed event types
    const rows = []
    const wsRows = []

    for (const e of events.slice(0, 50)) {  // cap at 50 per request
      const type = String(e.type || '').trim()
      if (!ALLOWED_TYPES.has(type)) continue

      rows.push({
        event_type:  type,
        endpoint:    null,
        region:      e.region   || null,
        feed_id:     null,
        duration_ms: e.durationMs != null ? Math.round(Number(e.durationMs)) : null,
        success:     e.success   != null ? Boolean(e.success) : null,
        metadata:    { page: e.page, status: e.status, ...(e.metadata || {}) },
      })

      // Also write WS disconnects to the dedicated table
      if (type === 'ws_disconnect') {
        wsRows.push({
          page:          e.page         || null,
          status:        e.status       || 'UNKNOWN',
          reconnected:   Boolean(e.reconnected),
          reconnect_ms:  e.reconnectMs  != null ? Math.round(Number(e.reconnectMs)) : null,
          user_agent:    String(req.headers['user-agent'] || '').slice(0, 200),
        })
      }
    }

    if (rows.length === 0) return res.json({ ok: true, ingested: 0 })

    await Promise.all([
      sb.from('ops_events').insert(rows),
      wsRows.length ? sb.from('ws_disconnects').insert(wsRows) : Promise.resolve(),
    ])

    return res.json({ ok: true, ingested: rows.length })
  } catch (err) {
    console.error('[ops-ingest] error:', err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const handler = adapt(_handler)
export default handler
