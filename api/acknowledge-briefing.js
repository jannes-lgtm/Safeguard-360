/**
 * /api/acknowledge-briefing
 *
 * Records a traveller's formal acknowledgement of their pre-travel security briefing.
 * On acknowledgement: notifies the travel administrator / line manager by email
 * and writes an audit log entry.
 *
 * POST /api/acknowledge-briefing
 *   Authorization: Bearer <supabase-jwt>
 *   Body: { briefing_id: uuid, acknowledged_name: string }
 *
 * Returns: { ok, acknowledged_at, document_ref }
 */

import { sendEmail } from './_notify.js'
import { adapt } from './_adapter.js'
import { getSupabaseAdmin } from './_supabase.js'

const APP_URL = process.env.APP_URL || 'https://safeguard360.co.za'
const SUPABASE_URL = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const ANON_KEY     = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

async function getUser(token) {
  const res = await fetch(`${SUPABASE_URL()}/auth/v1/user`, {
    headers: { apikey: ANON_KEY(), Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(4000),
  })
  if (!res.ok) return null
  return res.json()
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg',
  }) + ' SAST'
}

function buildAdminEmail({ traveller, orgName, briefing, acknowledgedAt, adminName }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Briefing Acknowledged — Safeguard 360</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

  <tr><td style="background:#0118A1;padding:24px 28px;border-radius:10px 10px 0 0;">
    <h1 style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">✅ Pre-Travel Briefing Acknowledged</h1>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.7);">Safeguard 360 — ISO 31030:2021 Compliance</p>
  </td></tr>

  <tr><td style="background:#ffffff;padding:28px;border:1px solid #e5e7eb;border-top:none;">

    <p style="margin:0 0 20px;font-size:13px;color:#374151;line-height:1.6;">
      Hi${adminName ? ` ${adminName}` : ''},<br/><br/>
      This is to confirm that <strong>${traveller}</strong> has formally acknowledged their
      pre-travel security briefing in compliance with <strong>ISO 31030:2021</strong>.
      This acknowledgement forms part of the organisation's duty of care audit trail.
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Acknowledgement Record</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#9ca3af;width:160px;">Document Reference</td>
          <td style="padding:5px 0;font-size:13px;font-weight:700;color:#111827;font-family:monospace;">${briefing.document_ref}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#9ca3af;">ISO Standard</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">ISO 31030:2021 — Travel Risk Management</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#9ca3af;">Traveller</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${traveller}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#9ca3af;">Organisation</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${orgName}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#9ca3af;">Destination</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${briefing.destination}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#9ca3af;">Travel Dates</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${briefing.depart_date} → ${briefing.return_date}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#9ca3af;">Risk Level</td>
          <td style="padding:5px 0;font-size:13px;font-weight:600;color:#111827;">${briefing.risk_level || '—'}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#9ca3af;">Acknowledged At</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${fmtDate(acknowledgedAt)}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#9ca3af;">Acknowledged Name</td>
          <td style="padding:5px 0;font-size:13px;font-weight:600;color:#111827;">${briefing.acknowledged_name}</td>
        </tr>
      </table>
    </div>

    <div style="background:#ECFDF5;border:1px solid #BBF7D0;border-radius:8px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#065F46;font-weight:600;">
        ✅ This record satisfies the ISO 31030:2021 Clause 6.2 requirement for documented pre-travel traveller briefing and acknowledgement.
      </p>
    </div>

    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
      This acknowledgement is stored in the Safeguard 360 audit trail. Log in to download a PDF copy or view the full briefing document.
    </p>

  </td></tr>

  <tr><td style="background:#f9fafb;padding:14px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      Safeguard 360 &mdash; ISO 31030:2021 Travel Risk Management &mdash;
      <a href="${APP_URL}" style="color:#6b7280;">${APP_URL.replace('https://', '')}</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`
}

function buildTravellerConfirmEmail({ traveller, briefing }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Briefing Confirmed — Safeguard 360</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <tr><td style="background:#059669;padding:24px 28px;border-radius:10px 10px 0 0;">
    <h1 style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">✅ Briefing Acknowledged</h1>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.8);">Your pre-travel security briefing is on record</p>
  </td></tr>

  <tr><td style="background:#ffffff;padding:28px;border:1px solid #e5e7eb;border-top:none;">

    <p style="margin:0 0 16px;font-size:13px;color:#374151;line-height:1.6;">
      Hi ${traveller},<br/><br/>
      You've successfully acknowledged your Pre-Travel Security Briefing for your trip to
      <strong>${briefing.destination}</strong>. A copy has been sent to your travel administrator.
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#9ca3af;width:140px;">Reference</td>
          <td style="padding:4px 0;font-size:12px;font-weight:700;color:#111827;font-family:monospace;">${briefing.document_ref}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#9ca3af;">Destination</td>
          <td style="padding:4px 0;font-size:13px;color:#374151;">${briefing.destination}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#9ca3af;">Travel Dates</td>
          <td style="padding:4px 0;font-size:13px;color:#374151;">${briefing.depart_date} → ${briefing.return_date}</td>
        </tr>
      </table>
    </div>

    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
      Keep your reference number for your records. Safe travels.
    </p>

  </td></tr>

  <tr><td style="background:#f9fafb;padding:14px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">Safeguard 360 — Travel Risk Management</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`
}

async function _handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let supabaseAdmin
  try { supabaseAdmin = getSupabaseAdmin() } catch (e) {
    return res.status(503).json({ error: e.message })
  }

  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Missing auth token' })

  const user = await getUser(token)
  if (!user?.id) return res.status(401).json({ error: 'Invalid token' })

  const { briefing_id, acknowledged_name } = req.body || {}
  if (!briefing_id || !acknowledged_name?.trim()) {
    return res.status(400).json({ error: 'briefing_id and acknowledged_name required' })
  }

  // Load briefing
  const { data: briefing, error: bErr } = await supabaseAdmin
    .from('travel_briefings')
    .select('*')
    .eq('id', briefing_id)
    .single()

  if (bErr || !briefing) return res.status(404).json({ error: 'Briefing not found' })
  if (briefing.user_id !== user.id) return res.status(403).json({ error: 'Forbidden' })
  if (briefing.acknowledged_at) {
    return res.status(200).json({ ok: true, already_acknowledged: true, acknowledged_at: briefing.acknowledged_at })
  }

  const acknowledgedAt = new Date().toISOString()
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null

  // Record acknowledgement
  await supabaseAdmin.from('travel_briefings').update({
    acknowledged_at:   acknowledgedAt,
    acknowledged_name: acknowledged_name.trim(),
    acknowledged_ip:   ip,
  }).eq('id', briefing_id)

  // Load traveller profile + admin details
  const [{ data: profile }, { data: trip }] = await Promise.all([
    supabaseAdmin.from('profiles').select('full_name, email').eq('id', user.id).single(),
    supabaseAdmin.from('itineraries').select('*').eq('id', briefing.trip_id).single(),
  ])

  const traveller = profile?.full_name || user.email || 'Traveller'
  const orgName   = briefing.org_name || 'Independent Traveller'

  // Find admin to notify: approved_by or org admin
  let adminEmail = null
  let adminName  = null

  if (trip?.approved_by) {
    const { data: approver } = await supabaseAdmin
      .from('profiles').select('full_name, email').eq('id', trip.approved_by).single()
    adminEmail = approver?.email || null
    adminName  = approver?.full_name || null
  }

  if (!adminEmail && briefing.org_id) {
    const { data: orgAdmin } = await supabaseAdmin
      .from('profiles').select('full_name, email')
      .eq('org_id', briefing.org_id).in('role', ['admin', 'org_admin'])
      .limit(1).single()
    adminEmail = orgAdmin?.email || null
    adminName  = orgAdmin?.full_name || null
  }

  // Fallback: control room
  if (!adminEmail) adminEmail = process.env.CONTROL_ROOM_EMAIL || null

  const updatedBriefing = { ...briefing, acknowledged_at: acknowledgedAt, acknowledged_name: acknowledged_name.trim() }

  // Send emails in parallel
  await Promise.allSettled([
    // Admin / approver notification
    adminEmail && sendEmail(
      adminEmail,
      `✅ Briefing Acknowledged — ${traveller} — ${briefing.destination} (${briefing.document_ref})`,
      buildAdminEmail({ traveller, orgName, briefing: updatedBriefing, acknowledgedAt, adminName })
    ),
    // Traveller confirmation
    user.email && sendEmail(
      user.email,
      `✅ Pre-Travel Briefing Confirmed — ${briefing.destination} — ${briefing.document_ref}`,
      buildTravellerConfirmEmail({ traveller, briefing: updatedBriefing })
    ),
  ])

  // Audit log
  await supabaseAdmin.from('audit_log').insert({
    user_id:   user.id,
    action:    'briefing_acknowledged',
    target_id: briefing_id,
    details:   {
      document_ref:     briefing.document_ref,
      destination:      briefing.destination,
      acknowledged_name: acknowledged_name.trim(),
      acknowledged_at:  acknowledgedAt,
      trip_id:          briefing.trip_id,
      admin_notified:   adminEmail || null,
    },
  }).catch(() => {})

  return res.status(200).json({
    ok: true,
    acknowledged_at:  acknowledgedAt,
    document_ref:     briefing.document_ref,
    admin_notified:   !!adminEmail,
  })
}

export const handler = adapt(_handler)
export default handler
