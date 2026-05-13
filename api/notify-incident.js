/**
 * /api/notify-incident
 * Called after an incident is submitted.
 * Emails org admin(s) for any severity; also emails control room for Critical/High.
 *
 * POST body: { incident_id: uuid }
 * Auth: Supabase JWT (traveller's own token)
 */

import { sendEmail } from './_notify.js'
import { adapt } from './_adapter.js'
import { getSupabaseAdmin } from './_supabase.js'

const APP_URL            = process.env.APP_URL || 'https://www.risk360.co'
const CONTROL_ROOM_EMAIL = process.env.CONTROL_ROOM_EMAIL || 'control@risk360.co'

function getAnon() {
  return {
    url:  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    anon: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  }
}

async function getUser(token) {
  const { url, anon } = getAnon()
  if (!url || !anon) return null
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    })
    return res.ok ? res.json() : null
  } catch { return null }
}

const SEV_COLOR = {
  Critical: '#DC2626',
  High:     '#EA580C',
  Medium:   '#D97706',
  Low:      '#059669',
}

const TYPE_LABEL = {
  security:        'Security Threat',
  health:          'Health / Medical',
  near_miss:       'Near Miss',
  accident:        'Accident / Injury',
  theft:           'Theft / Crime',
  political:       'Political Unrest',
  natural_disaster:'Natural Disaster',
  other:           'Other',
}

function buildEmail({ incident, traveller, trip }) {
  const travName  = traveller?.full_name || traveller?.email || 'A traveller'
  const sev       = incident.severity
  const sevColor  = SEV_COLOR[sev] || SEV_COLOR.Medium
  const typeLabel = TYPE_LABEL[incident.type] || incident.type
  const location  = [incident.city, incident.country].filter(Boolean).join(', ') || '—'
  const emoji     = sev === 'Critical' ? '🚨' : '⚠️'

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <tr><td style="background:${sevColor};padding:24px 28px;border-radius:10px 10px 0 0;">
    <p style="margin:0;font-size:20px;font-weight:800;color:#fff;">Safeguard 360</p>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.7);">Incident Report — ${sev} Severity</p>
  </td></tr>

  <tr><td style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">

    <div style="background:${sevColor}10;border:1px solid ${sevColor}40;border-radius:8px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;font-weight:700;color:${sevColor};">
        ${emoji} ${sev} incident reported — immediate review required
      </p>
    </div>

    <p style="margin:0 0 20px;font-size:13px;color:#374151;line-height:1.6;">
      <strong>${travName}</strong> has submitted an incident report that requires your attention.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;margin-bottom:20px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 10px;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.08em;">Incident Details</p>
        <p style="margin:0;font-size:13px;color:#111827;line-height:2;">
          Type: <strong>${typeLabel}</strong><br/>
          Severity: <strong style="color:${sevColor};">${sev}</strong><br/>
          Title: <strong>${incident.title}</strong><br/>
          Location: <strong>${location}</strong><br/>
          Date: <strong>${incident.incident_date}</strong><br/>
          Traveller: <strong>${travName}</strong>
          ${traveller?.phone ? `<br/>Phone: <strong>${traveller.phone}</strong>` : ''}
          ${trip ? `<br/>Trip: <strong>${trip.trip_name} → ${trip.arrival_city || ''}</strong>` : ''}
        </p>
      </td></tr>
    </table>

    ${incident.description ? `
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.08em;">Description</p>
        <p style="margin:0;font-size:13px;color:#374151;line-height:1.7;">${incident.description}</p>
      </td></tr>
    </table>` : ''}

    <div style="text-align:center;margin-bottom:24px;">
      <a href="${APP_URL}/incidents"
        style="display:inline-block;background:#0118A1;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 32px;border-radius:10px;">
        View in Platform →
      </a>
    </div>

    <p style="margin:0;font-size:11px;color:#9CA3AF;line-height:1.6;">
      This notification was sent automatically when ${travName} submitted an incident report on Safeguard 360.
    </p>

  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
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

    const { incident_id } = req.body || {}
    if (!incident_id) return res.status(400).json({ error: 'incident_id required' })

    const { data: incident } = await sb
      .from('incidents')
      .select('*')
      .eq('id', incident_id)
      .eq('user_id', user.id)
      .single()

    if (!incident) return res.status(404).json({ error: 'Incident not found' })

    const [{ data: traveller }, { data: trip }] = await Promise.all([
      sb.from('profiles').select('full_name, email, phone, org_id').eq('id', user.id).single(),
      incident.trip_id
        ? sb.from('itineraries').select('trip_name, arrival_city').eq('id', incident.trip_id).single().then(r => r)
        : Promise.resolve({ data: null }),
    ])

    const html    = buildEmail({ incident, traveller, trip: trip || null })
    const subject = `${incident.severity === 'Critical' ? '🚨' : '⚠️'} ${incident.severity} incident — ${incident.title} (${traveller?.full_name || 'Traveller'})`
    const sends   = []

    // Notify org admin(s)
    if (traveller?.org_id) {
      const { data: orgAdmins } = await sb
        .from('profiles')
        .select('email')
        .eq('org_id', traveller.org_id)
        .eq('role', 'org_admin')
      for (const admin of (orgAdmins || []).filter(a => a.email)) {
        sends.push(sendEmail(admin.email, subject, html))
      }
    }

    // Notify control room for Critical or High
    if (incident.severity === 'Critical' || incident.severity === 'High') {
      sends.push(sendEmail(CONTROL_ROOM_EMAIL, subject, html))
    }

    await Promise.allSettled(sends)

    console.log(`[notify-incident] Sent ${sends.length} notifications for incident ${incident_id} (${incident.severity})`)
    return res.json({ ok: true, sent: sends.length })
  } catch (err) {
    console.error('[notify-incident] unhandled error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const handler = adapt(_handler)
export default handler
