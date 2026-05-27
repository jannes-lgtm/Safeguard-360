/**
 * /api/sos-trigger
 *
 * Server-side SOS creation + notification dispatch.
 * Replaces the old two-step client flow (client DB insert → POST /api/notify).
 *
 * WHY SERVER-SIDE:
 *   The old flow had a critical failure mode: the SOS event was stored in the DB
 *   client-side, then a best-effort fire-and-forget POST /api/notify was fired.
 *   If the browser closed, lost connectivity, or the request failed after the DB
 *   insert, notifications were silently dropped. The traveller saw "SOS Alert Sent"
 *   but no-one was notified.
 *
 *   This endpoint atomically: creates the event, fires notifications, records
 *   delivery status, and returns a verified delivery confirmation to the client.
 *   The client only shows a confirmed "sent" state when delivery_count > 0.
 *
 * POST /api/sos-trigger
 *   Authorization: Bearer <supabase-jwt>
 *   Body: { message?, latitude?, longitude?, accuracy?, trip_name?, arrival_city? }
 *
 * Response:
 *   200 { ok: true,  sosId, delivered, total, status, message }
 *   207 { ok: false, sosId, delivered: 0, total, status: 'failed'|'pending', message }
 *       — SOS was recorded but notification delivery failed or no channels configured.
 *         The escalation cron (api/sos-escalation-check.js) will retry within 5 min.
 *   401 auth error
 *   500 DB error (SOS was NOT stored — client should display hard error)
 *
 * Required env vars:
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SOS_ADMIN_EMAIL / SOS_ADMIN_PHONE / SOS_ADMIN_WHATSAPP
 */

import { notifySos } from './_notify.js'
import { adapt }     from './_adapter.js'

const url  = () => process.env.SUPABASE_URL      || process.env.VITE_SUPABASE_URL      || ''
const anon = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const svc  = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const svcHeaders = () => ({
  apikey:         svc(),
  Authorization:  `Bearer ${svc()}`,
  'Content-Type': 'application/json',
  Prefer:         'return=representation',
})

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function verifyUser(token) {
  const res = await fetch(`${url()}/auth/v1/user`, {
    headers: { apikey: anon(), Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(4000),
  })
  if (!res.ok) return null
  return res.json()
}

async function getProfile(userId) {
  try {
    const res = await fetch(
      `${url()}/rest/v1/profiles?id=eq.${userId}&select=*&limit=1`,
      { headers: svcHeaders() }
    )
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0] || null
  } catch { return null }
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

async function insertSosEvent(payload) {
  const res = await fetch(`${url()}/rest/v1/sos_events`, {
    method:  'POST',
    headers: svcHeaders(),
    body:    JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`sos_events insert failed [${res.status}]: ${err}`)
  }
  const rows = await res.json()
  return rows?.[0] || null
}

// Update delivery status — uses IF columns exist pattern:
// if the migration hasn't been applied yet, the insert still succeeded;
// we just can't track delivery until the migration is run.
async function recordDelivery(sosId, deliveryCount, deliveryStatus, channels) {
  if (!sosId) return
  try {
    await fetch(`${url()}/rest/v1/sos_events?id=eq.${sosId}`, {
      method:  'PATCH',
      headers: svcHeaders(),
      body:    JSON.stringify({
        notification_status:          deliveryStatus,
        notification_sent_at:         new Date().toISOString(),
        notification_delivery_count:  deliveryCount,
        notification_channels:        channels,
      }),
    })
  } catch (e) {
    // Non-fatal — delivery already happened, tracking update failed
    console.warn('[sos-trigger] delivery status update failed:', e.message)
  }
}

// Also create a Critical alert in the alerts feed (fire-and-forget)
function createAlertFeedEntry(fullName, arrivalCity, locationLabel, message) {
  fetch(`${url()}/rest/v1/alerts`, {
    method:  'POST',
    headers: { ...svcHeaders(), Prefer: '' },
    body:    JSON.stringify({
      title:       `🆘 SOS — ${fullName}`,
      description: message?.trim()
        || `SOS triggered by ${fullName}${arrivalCity ? ` in ${arrivalCity}` : ''}. Immediate response required.`,
      country:     arrivalCity || 'Unknown',
      location:    locationLabel || arrivalCity || null,
      severity:    'Critical',
      status:      'Active',
      date_issued: new Date().toISOString().split('T')[0],
    }),
  }).catch(() => {})
}

// Emit to operational_events log (fire-and-forget)
function emitOperationalEvent(type, sosId, userId, payload) {
  fetch(`${url()}/rest/v1/operational_events`, {
    method:  'POST',
    headers: { ...svcHeaders(), Prefer: '' },
    body:    JSON.stringify({
      event_type:      type,
      severity:        'critical',
      source:          'sos-trigger',
      reference_id:    sosId,
      reference_table: 'sos_events',
      user_id:         userId,
      payload,
    }),
  }).catch(() => {})
}

// ── Handler ───────────────────────────────────────────────────────────────────

async function _handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── 1. Verify session (server-verified JWT) ────────────────────────────────
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' })

  let user
  try {
    user = await verifyUser(token)
    if (!user?.id) throw new Error('no user id')
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const {
    message,
    latitude, longitude, accuracy,
    trip_name, arrival_city,
  } = req.body || {}

  // ── 2. Load profile + emergency contacts in parallel ───────────────────────
  const [profile, contacts] = await Promise.all([
    getProfile(user.id),
    getEmergencyContacts(user.id),
  ])

  const fullName      = profile?.full_name || user.email || 'Unknown'
  const locationLabel = (latitude && longitude)
    ? `${parseFloat(latitude).toFixed(5)}, ${parseFloat(longitude).toFixed(5)}`
    : null

  // ── 3. Insert SOS event (server-side, authoritative) ──────────────────────
  let sosEvent
  try {
    sosEvent = await insertSosEvent({
      user_id:                     user.id,
      full_name:                   fullName,
      latitude:                    latitude  || null,
      longitude:                   longitude || null,
      accuracy:                    accuracy  || null,
      location_label:              locationLabel,
      message:                     message?.trim() || null,
      trip_name:                   trip_name    || null,
      arrival_city:                arrival_city || null,
      status:                      'active',
      notification_status:         'pending',
      notification_delivery_count: 0,
    })
  } catch (e) {
    console.error('[sos-trigger] SOS insert failed:', e.message)
    // Hard failure — no SOS record created, client must see error
    return res.status(500).json({
      error:   'Failed to record SOS event. Please call emergency services directly.',
      details: e.message,
    })
  }

  const sosId = sosEvent?.id

  // ── 4. Secondary: create alert feed entry + emit operational event ─────────
  createAlertFeedEntry(fullName, arrival_city, locationLabel, message)
  if (sosId) {
    emitOperationalEvent('sos.created', sosId, user.id, {
      full_name:    fullName,
      arrival_city: arrival_city || null,
      has_gps:      !!(latitude && longitude),
      has_message:  !!(message?.trim()),
    })
  }

  // ── 5. Dispatch notifications ──────────────────────────────────────────────
  const adminEmail    = process.env.SOS_ADMIN_EMAIL    || null
  const adminPhone    = process.env.SOS_ADMIN_PHONE    || null
  const adminWhatsApp = process.env.SOS_ADMIN_WHATSAPP || null

  // Count total configured channels
  const totalChannels =
    (adminEmail    ? 1 : 0) +
    (adminPhone    ? 1 : 0) +
    (adminWhatsApp ? 1 : 0) +
    contacts.reduce((acc, c) => acc + (c.email ? 1 : 0) + (c.phone ? 1 : 0), 0)

  let delivered = 0
  const channelLog = []

  if (totalChannels > 0) {
    try {
      delivered = await notifySos({
        event: {
          full_name:      fullName,
          latitude,
          longitude,
          location_label: locationLabel,
          message:        message?.trim() || null,
          trip_name,
          arrival_city,
        },
        contacts,
        adminEmail,
        adminPhone,
        adminWhatsApp,
      })

      // Build a channel log for visibility (not per-channel resolution — notifySos
      // returns aggregate count; per-channel tracking is a P2 refactor of _notify.js)
      if (adminEmail)    channelLog.push({ type: 'email',    label: 'Admin',   status: delivered > 0 ? 'attempted' : 'failed' })
      if (adminPhone)    channelLog.push({ type: 'sms',      label: 'Admin',   status: delivered > 0 ? 'attempted' : 'failed' })
      if (adminWhatsApp) channelLog.push({ type: 'whatsapp', label: 'Admin',   status: delivered > 0 ? 'attempted' : 'failed' })
      contacts.forEach(c => {
        if (c.email) channelLog.push({ type: 'email', label: c.name || 'Contact', status: delivered > 0 ? 'attempted' : 'failed' })
        if (c.phone) channelLog.push({ type: 'sms',   label: c.name || 'Contact', status: delivered > 0 ? 'attempted' : 'failed' })
      })
    } catch (e) {
      console.error('[sos-trigger] notification dispatch error:', e.message)
    }
  }

  // ── 6. Record delivery outcome ─────────────────────────────────────────────
  const deliveryStatus =
    totalChannels === 0  ? 'pending'   // no channels configured — escalation cron will retry once configured
    : delivered === 0    ? 'failed'
    : delivered < totalChannels ? 'partial'
    : 'sent'

  await recordDelivery(sosId, delivered, deliveryStatus, channelLog)

  // Emit delivery failure event so GSOC WatchBoard can surface it
  if (delivered === 0 && totalChannels > 0 && sosId) {
    emitOperationalEvent('sos.delivery_failed', sosId, user.id, {
      total_channels: totalChannels,
      attempted:      channelLog.length,
    })
  }

  // ── 7. Return verified delivery status to client ──────────────────────────
  const ok = delivered > 0 || totalChannels === 0

  const humanMessage = totalChannels === 0
    ? 'SOS recorded. No notification channels are configured — contact your security team directly.'
    : delivered > 0
    ? `Alert sent to ${delivered} of ${totalChannels} notification channel${totalChannels !== 1 ? 's' : ''}.`
    : 'SOS recorded. Notification delivery failed — escalation will automatically retry within 5 minutes.'

  return res.status(ok ? 200 : 207).json({
    ok,
    sosId,
    delivered,
    total:   totalChannels,
    status:  deliveryStatus,
    message: humanMessage,
  })
}

export const handler = adapt(_handler)
export default handler
