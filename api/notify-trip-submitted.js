/**
 * /api/notify-trip-submitted
 *
 * Called when an org traveller submits a new trip for approval.
 * Emails the org admin so they can act immediately — without having
 * to discover the request by checking the approvals page.
 *
 * POST body: { trip_id: uuid }
 * Auth: Supabase JWT (traveller's own token)
 */

import { sendEmail } from './_notify.js'
import { adapt } from './_adapter.js'
import { getSupabaseAdmin } from './_supabase.js'

const APP_URL = process.env.APP_URL || 'https://www.risk360.co'

async function getUser(token) {
  const url  = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  if (!url || !anon) return null
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    })
    return res.ok ? res.json() : null
  } catch { return null }
}

const RISK_COLOUR = {
  Critical: '#DC2626',
  High:     '#EA580C',
  Medium:   '#D97706',
  Low:      '#059669',
}

async function _handler(req, res) {
  try {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let sb
  try { sb = getSupabaseAdmin() } catch (e) {
    return res.status(503).json({ error: e.message })
  }

  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Missing auth token' })

  const user = await getUser(token)
  if (!user?.id) return res.status(401).json({ error: 'Invalid token' })

  const { trip_id } = req.body || {}
  if (!trip_id) return res.status(400).json({ error: 'trip_id required' })

  // Load trip (verify ownership)
  const { data: trip } = await sb
    .from('itineraries')
    .select('*')
    .eq('id', trip_id)
    .eq('user_id', user.id)
    .single()

  if (!trip) return res.status(404).json({ error: 'Trip not found' })

  // Load traveller profile + org
  const { data: traveller } = await sb
    .from('profiles')
    .select('full_name, email, org_id, role')
    .eq('id', user.id)
    .single()

  if (!traveller?.org_id) return res.json({ ok: true, sent: 0, reason: 'Solo traveller — no org admin to notify' })

  // Find org admin
  const [{ data: org }, { data: adminProfiles }] = await Promise.all([
    sb.from('organisations').select('name').eq('id', traveller.org_id).single(),
    sb.from('profiles').select('full_name, email').eq('org_id', traveller.org_id).eq('role', 'org_admin'),
  ])

  const admins = (adminProfiles || []).filter(a => a.email)
  if (!admins.length) return res.json({ ok: true, sent: 0, reason: 'No org admin email found' })

  const orgName    = org?.name || 'Your organisation'
  const travName   = traveller.full_name || traveller.email || 'A traveller'
  const dest       = trip.arrival_city || trip.trip_name
  const riskColour = RISK_COLOUR[trip.risk_level] || RISK_COLOUR.Medium
  const riskLevel  = trip.risk_level || 'Medium'

  const subject = `✈️ New travel request — ${trip.trip_name} (Action Required)`

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <tr><td style="background:#0118A1;padding:24px 28px;border-radius:10px 10px 0 0;">
    <p style="margin:0;font-size:20px;font-weight:800;color:#fff;">Safeguard 360</p>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.7);">Travel Approvals · ${orgName}</p>
  </td></tr>

  <tr><td style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">

    <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;font-weight:700;color:#1D4ED8;">🔔 New travel request submitted for approval</p>
    </div>

    <p style="margin:0 0 20px;font-size:13px;color:#374151;line-height:1.6;">
      <strong>${travName}</strong> has submitted a travel request that requires your approval.
      Please review and action it before their departure date.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.08em;">Trip Details</p>
        <p style="margin:0;font-size:13px;color:#111827;line-height:1.9;">
          Trip: <strong>${trip.trip_name}</strong><br/>
          Traveller: <strong>${travName}</strong><br/>
          Destination: <strong>${dest}</strong><br/>
          Dates: <strong>${trip.depart_date} → ${trip.return_date}</strong><br/>
          ${trip.flight_number ? `Flight: <strong>${trip.flight_number}</strong><br/>` : ''}
          ${trip.hotel_name ? `Hotel: <strong>${trip.hotel_name}</strong><br/>` : ''}
          Risk Level: <strong style="color:${riskColour};">${riskLevel}</strong>
        </p>
      </td></tr>
    </table>

    <div style="text-align:center;margin-bottom:24px;">
      <a href="${APP_URL}/approvals"
        style="display:inline-block;background:#AACC00;color:#0118A1;text-decoration:none;font-weight:700;font-size:14px;padding:14px 32px;border-radius:10px;">
        Review &amp; Approve →
      </a>
    </div>

    <p style="margin:0;font-size:11px;color:#9CA3AF;line-height:1.6;">
      This notification was sent automatically when ${travName} submitted a travel request on Safeguard 360.
      Log in to the platform to approve, reject, or request changes.
    </p>

  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

  const results = await Promise.allSettled(
    admins.map(admin => sendEmail(admin.email, subject, html))
  )

  const sent = results.filter(r => r.status === 'fulfilled' && r.value).length
  console.log(`[notify-trip-submitted] Sent to ${sent}/${admins.length} admins for trip ${trip_id}`)

  return res.json({ ok: true, sent, admins: admins.length })
  } catch (err) {
    console.error('[notify-trip-submitted] unhandled error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const handler = adapt(_handler)
export default handler
