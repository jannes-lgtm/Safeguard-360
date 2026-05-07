/**
 * /api/notify
 *
 * HTTP wrapper for the shared _notify module.
 * Called from the frontend (SOS page) after an SOS is triggered.
 * Also callable for alert notifications if needed.
 *
 * POST /api/notify
 *   Authorization: Bearer <supabase-jwt>
 *   Body: { type: 'sos'|'alert', ...payload }
 *
 * Required env vars (in addition to those in _notify.js):
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SOS_ADMIN_EMAIL
 *   SOS_ADMIN_PHONE
 */

import { notifyAlert, notifySos } from './_notify.js'

const SUPABASE_URL  = () => process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL  || ''
const ANON_KEY      = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const SERVICE_KEY   = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// ── Verify JWT and return user ────────────────────────────────────────────────
async function getUser(token) {
  const res = await fetch(`${SUPABASE_URL()}/auth/v1/user`, {
    headers: {
      apikey:        ANON_KEY(),
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(4000),
  })
  if (!res.ok) return null
  return res.json()
}

// ── Fetch profile row ─────────────────────────────────────────────────────────
async function getProfile(userId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL()}/rest/v1/profiles?id=eq.${userId}&select=*&limit=1`,
      {
        headers: {
          apikey:        SERVICE_KEY(),
          Authorization: `Bearer ${SERVICE_KEY()}`,
        },
      }
    )
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0] || null
  } catch {
    return null
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
async function _handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' })

  let user
  try {
    user = await getUser(token)
    if (!user?.id) throw new Error('no user id')
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { type, ...data } = req.body || {}

  // ── SOS notification ────────────────────────────────────────────────────────
  if (type === 'sos') {
    // Fetch profile so we can pull emergency contact emails
    const profile = await getProfile(user.id)

    const contacts = [
      {
        name:  profile?.emergency_contact_1_name  || null,
        email: profile?.emergency_contact_1_email || null,
        phone: profile?.emergency_contact_1_phone || null,
      },
      {
        name:  profile?.emergency_contact_2_name  || null,
        email: profile?.emergency_contact_2_email || null,
        phone: profile?.emergency_contact_2_phone || null,
      },
    ].filter(c => c.email || c.phone)

    const sent = await notifySos({
      event: {
        ...data,
        full_name: profile?.full_name || user.email || 'Unknown',
      },
      contacts,
      adminEmail: process.env.SOS_ADMIN_EMAIL || null,
      adminPhone: process.env.SOS_ADMIN_PHONE || null,
    })

    return res.status(200).json({ ok: true, sent })
  }

  // ── Alert notification ──────────────────────────────────────────────────────
  if (type === 'alert') {
    const profile = await getProfile(user.id)
    await notifyAlert({
      userEmail: user.email,
      userPhone: profile?.phone || profile?.whatsapp_number || null,
      alerts:    data.alerts || [],
      tripName:  data.tripName || null,
      city:      data.city || null,
    })
    return res.status(200).json({ ok: true })
  }

  return res.status(400).json({ error: 'Unknown notification type. Use "sos" or "alert".' })
}

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default handler
