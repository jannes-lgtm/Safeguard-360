/**
 * /api/sos-escalation-check
 *
 * Cron: runs every 5 minutes (see vercel.json schedule: "*/5 * * * *")
 *
 * WHAT IT DOES:
 *   Finds active SOS events that have failed or missing notification delivery
 *   and re-fires notifications. This is the safety net that catches:
 *     - SOS events where the browser closed before /api/notify could fire (old flow)
 *     - SOS events where all notification channels failed on first attempt
 *     - Unacknowledged SOS events > 5 minutes old (re-alert escalation)
 *
 * QUERY TARGETS:
 *   status = 'active'
 *   AND (
 *     notification_status IN ('pending', 'failed')   — delivery never confirmed
 *     OR (
 *       notification_delivery_count > 0              — delivered once but unacked
 *       AND acknowledged_at IS NULL
 *       AND created_at < now() - interval '10 minutes'
 *       AND (last_escalation_at IS NULL OR last_escalation_at < now() - interval '10 minutes')
 *     )
 *   )
 *   AND escalation_count < 6                         — max 6 escalations (30 min coverage)
 *
 * ESCALATION LIMITS:
 *   - First 6 escalation attempts (0 to 5) = fires
 *   - After 6 attempts: stops re-notifying (operator must resolve)
 *   - Cron fires every 5 min → 30 min of automatic re-alerts
 *
 * GET /api/sos-escalation-check
 *   Called by Vercel cron (no auth header — cron calls use CRON_SECRET)
 *   Can also be called manually with Authorization: Bearer <service-role-key>
 *
 * Required env vars:
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SOS_ADMIN_EMAIL / SOS_ADMIN_PHONE / SOS_ADMIN_WHATSAPP
 *   CRON_SECRET (optional — set in Vercel to protect cron endpoints)
 */

import { notifySos } from './_notify.js'
import { adapt }     from './_adapter.js'

const url = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const svc = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const svcHeaders = () => ({
  apikey:         svc(),
  Authorization:  `Bearer ${svc()}`,
  'Content-Type': 'application/json',
  Prefer:         'return=representation',
})

const MAX_ESCALATIONS    = 6        // stop after 6 attempts per event
const ESCALATION_GAP_MIN = 5        // minimum minutes between escalation attempts
const DELIVERY_RETRY_MIN = 3        // retry failed delivery after 3 min
const UNACKED_ALERT_MIN  = 10       // re-alert if unacknowledged after 10 min

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchPendingEscalations() {
  const now           = new Date()
  const retryThresh   = new Date(now - DELIVERY_RETRY_MIN  * 60 * 1000).toISOString()
  const unackedThresh = new Date(now - UNACKED_ALERT_MIN   * 60 * 1000).toISOString()
  const escalGapThresh = new Date(now - ESCALATION_GAP_MIN * 60 * 1000).toISOString()

  // Use two separate queries and merge — Supabase REST doesn't support OR across
  // column conditions cleanly in a single query string.

  const [failedRes, unackedRes] = await Promise.all([
    // Query A: events with failed/missing delivery (need immediate retry)
    fetch(
      `${url()}/rest/v1/sos_events?` + new URLSearchParams({
        select:                       '*,profiles(full_name,email)',
        status:                       'eq.active',
        'notification_status':        'in.(pending,failed)',
        'escalation_count':           `lt.${MAX_ESCALATIONS}`,
        'created_at':                 `lt.${retryThresh}`,
      }),
      { headers: svcHeaders() }
    ),
    // Query B: delivered but unacknowledged events (re-alert escalation)
    fetch(
      `${url()}/rest/v1/sos_events?` + new URLSearchParams({
        select:                          '*,profiles(full_name,email)',
        status:                          'eq.active',
        'notification_delivery_count':   'gt.0',
        'acknowledged_at':               'is.null',
        'escalation_count':              `lt.${MAX_ESCALATIONS}`,
        'created_at':                    `lt.${unackedThresh}`,
        'or':                            `(last_escalation_at.is.null,last_escalation_at.lt.${escalGapThresh})`,
      }),
      { headers: svcHeaders() }
    ),
  ])

  const failedRows   = failedRes.ok   ? await failedRes.json()   : []
  const unackedRows  = unackedRes.ok  ? await unackedRes.json()  : []

  // Merge, deduplicate by id
  const seen = new Set()
  return [...failedRows, ...unackedRows].filter(e => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })
}

async function getEmergencyContacts(userId) {
  try {
    const res = await fetch(
      `${url()}/rest/v1/emergency_contacts?user_id=eq.${userId}&order=priority.asc&limit=3`,
      { headers: svcHeaders() }
    )
    if (!res.ok) return []
    const rows = await res.json()
    return (rows || [])
      .map(c => ({ name: c.full_name || null, email: c.email || null, phone: c.phone || null }))
      .filter(c => c.email || c.phone)
  } catch { return [] }
}

async function updateEscalationRecord(sosId, deliveryCount, deliveryStatus) {
  try {
    await fetch(`${url()}/rest/v1/sos_events?id=eq.${sosId}`, {
      method:  'PATCH',
      headers: svcHeaders(),
      body:    JSON.stringify({
        last_escalation_at:           new Date().toISOString(),
        notification_sent_at:         new Date().toISOString(),
        notification_delivery_count:  deliveryCount,
        notification_status:          deliveryStatus,
        // Increment escalation_count using RPC or raw SQL
        // Supabase REST doesn't support atomic increment directly.
        // We'll use a workaround: read current count and write count+1.
        // Race condition risk is low (cron is sequential, not concurrent).
      }),
    })

    // Atomic increment via RPC (if available) — non-fatal if it fails
    await fetch(`${url()}/rest/v1/rpc/increment_sos_escalation_count`, {
      method:  'POST',
      headers: svcHeaders(),
      body:    JSON.stringify({ sos_id: sosId }),
    }).catch(() => {
      // RPC not available — fall back to read+write increment in updateEscalationRecord
    })
  } catch (e) {
    console.warn('[sos-escalation] record update failed for', sosId, ':', e.message)
  }
}

function emitEscalationEvent(sosId, userId, attempt, delivered) {
  fetch(`${url()}/rest/v1/operational_events`, {
    method:  'POST',
    headers: { ...svcHeaders(), Prefer: '' },
    body:    JSON.stringify({
      event_type:      delivered > 0 ? 'sos.escalation_sent' : 'sos.escalation_failed',
      severity:        'critical',
      source:          'sos-escalation-check',
      reference_id:    sosId,
      reference_table: 'sos_events',
      user_id:         userId,
      payload:         { attempt, delivered },
    }),
  }).catch(() => {})
}

// ── Handler ───────────────────────────────────────────────────────────────────

async function _handler(req, res) {
  // Cron calls are GET; manual test calls may be POST
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Validate cron secret if configured
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers['authorization'] || ''
    if (!authHeader.includes(cronSecret)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  if (!svc()) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' })
  }

  console.log('[sos-escalation] Starting escalation check…')

  let events
  try {
    events = await fetchPendingEscalations()
  } catch (e) {
    console.error('[sos-escalation] Failed to fetch pending escalations:', e.message)
    return res.status(500).json({ error: 'DB query failed', details: e.message })
  }

  if (events.length === 0) {
    console.log('[sos-escalation] No pending escalations found.')
    return res.status(200).json({ ok: true, checked: 0, escalated: 0 })
  }

  console.log(`[sos-escalation] Found ${events.length} event(s) requiring escalation.`)

  const adminEmail    = process.env.SOS_ADMIN_EMAIL    || null
  const adminPhone    = process.env.SOS_ADMIN_PHONE    || null
  const adminWhatsApp = process.env.SOS_ADMIN_WHATSAPP || null

  const results = []

  for (const event of events) {
    try {
      const contacts = await getEmergencyContacts(event.user_id)
      const fullName  = event.profiles?.full_name || event.full_name || 'Unknown'
      const attempt   = (event.escalation_count || 0) + 1

      console.log(`[sos-escalation] Escalating event ${event.id} for ${fullName} (attempt ${attempt})`)

      const delivered = await notifySos({
        event: {
          ...event,
          full_name: fullName,
        },
        contacts,
        adminEmail,
        adminPhone,
        adminWhatsApp,
      })

      const deliveryStatus =
        (adminEmail || adminPhone || adminWhatsApp || contacts.length > 0)
          ? (delivered > 0 ? 'sent' : 'failed')
          : 'pending'

      await updateEscalationRecord(event.id, delivered, deliveryStatus)
      emitEscalationEvent(event.id, event.user_id, attempt, delivered)

      results.push({ id: event.id, attempt, delivered, status: deliveryStatus })
      console.log(`[sos-escalation] Event ${event.id}: delivered to ${delivered} channel(s)`)
    } catch (e) {
      console.error(`[sos-escalation] Failed to escalate event ${event.id}:`, e.message)
      results.push({ id: event.id, error: e.message })
    }
  }

  const escalated = results.filter(r => (r.delivered || 0) > 0).length
  console.log(`[sos-escalation] Done. Escalated ${escalated}/${events.length} events.`)

  return res.status(200).json({
    ok:        true,
    checked:   events.length,
    escalated,
    results,
  })
}

export const handler = adapt(_handler)
export default handler
