/**
 * /api/missed-checkins
 * Run by Vercel cron every hour.
 * Scans scheduled_checkins for overdue, un-notified entries.
 * For each: emails emergency contacts + control room, marks missed_notified_at.
 */
import { createClient } from '@supabase/supabase-js'
import { sendEmail, sendSms, sendWhatsApp } from './_notify.js'
import { adapt } from './_adapter.js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const APP_URL                = process.env.APP_URL || 'https://www.risk360.co'
const CONTROL_ROOM_EMAIL     = process.env.CONTROL_ROOM_EMAIL || 'control@risk360.co'
const CONTROL_ROOM_PHONE     = process.env.CONTROL_ROOM_PHONE || ''
const CONTROL_ROOM_WHATSAPP  = process.env.CONTROL_ROOM_WHATSAPP || ''
const CRON_SECRET            = process.env.CRON_SECRET

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg',
  }) + ' SAST'
}

function minsOverdue(due_at, window_hours) {
  const deadline = new Date(due_at).getTime() + window_hours * 3600000
  return Math.max(0, Math.floor((Date.now() - deadline) / 60000))
}

function buildContactEmail({ traveller, trip, contact, overdueMins, scheduledLabel }) {
  const name    = traveller.full_name || traveller.email || 'Your contact'
  const first   = name.split(' ')[0]
  const h       = Math.floor(overdueMins / 60)
  const m       = overdueMins % 60
  const overdueStr = h > 0 ? `${h}h ${m}m` : `${m} minutes`

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Missed Check-in Alert — Safeguard 360</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#b91c1c;padding:24px 28px;border-radius:10px 10px 0 0;">
    <h1 style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">⚠️ Missed Check-in Alert</h1>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.8);">Safeguard 360 — Travel Safety Platform</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#ffffff;padding:28px;border:1px solid #e5e7eb;border-top:none;">

    <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Hi ${contact.full_name || 'there'},</p>
    <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111827;">
      ${name} has missed a scheduled safety check-in.
    </h2>

    <p style="margin:0 0 20px;font-size:13px;color:#374151;line-height:1.6;">
      ${first} was due to check in <strong>${overdueStr} ago</strong> and has not confirmed their safety.
      This may mean nothing — they could simply be busy or without signal. However, as their emergency contact,
      we want you to be aware immediately.
    </p>

    <!-- Overdue alert box -->
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:.05em;">Missed Check-in Details</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#9ca3af;width:130px;vertical-align:top;">Scheduled check-in</td>
          <td style="padding:4px 0;font-size:13px;font-weight:600;color:#111827;">${scheduledLabel}</td>
        </tr>
        ${trip ? `
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#9ca3af;vertical-align:top;">Trip</td>
          <td style="padding:4px 0;font-size:13px;color:#374151;">${trip.trip_name || '—'}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#9ca3af;vertical-align:top;">Location</td>
          <td style="padding:4px 0;font-size:13px;color:#374151;">${trip.arrival_city || '—'}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#9ca3af;vertical-align:top;">Overdue by</td>
          <td style="padding:4px 0;font-size:13px;font-weight:700;color:#b91c1c;">${overdueStr}</td>
        </tr>
      </table>
    </div>

    <!-- What to do -->
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.05em;">What to do</p>
      <ol style="margin:0;padding-left:18px;font-size:13px;color:#78350f;line-height:1.8;">
        <li>Try to reach ${first} directly — call, WhatsApp, or message.</li>
        <li>If no response within 30 minutes, contact other people who may know their whereabouts.</li>
        <li>If you are genuinely unable to make contact, treat this as an emergency and contact local authorities or emergency services in ${trip?.arrival_city || 'the destination'}.</li>
      </ol>
    </div>

    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
      You are receiving this because ${name} listed you as an emergency contact on Safeguard 360.
      The Safeguard 360 control room has also been notified.
    </p>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f9fafb;padding:14px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      Safeguard 360 &mdash; Travel Risk Intelligence &mdash;
      <a href="${APP_URL}" style="color:#6b7280;">${APP_URL.replace('https://', '')}</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`
}

function buildControlRoomEmail({ traveller, trip, checkin, overdueMins }) {
  const name      = traveller.full_name || traveller.email || 'Unknown traveller'
  const h         = Math.floor(overdueMins / 60)
  const m         = overdueMins % 60
  const overdueStr = h > 0 ? `${h}h ${m}m` : `${m} minutes`

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Missed Check-in — Control Room</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <tr><td style="background:#7c2d12;padding:24px 28px;border-radius:10px 10px 0 0;">
    <h1 style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">🔴 CONTROL ROOM — Missed Check-in</h1>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.7);">Safeguard 360 Internal Alert</p>
  </td></tr>

  <tr><td style="background:#ffffff;padding:28px;border:1px solid #e5e7eb;border-top:none;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:5px 0;font-size:12px;color:#9ca3af;width:140px;">Traveller</td>
          <td style="padding:5px 0;font-size:13px;font-weight:700;color:#111827;">${name}</td></tr>
      <tr><td style="padding:5px 0;font-size:12px;color:#9ca3af;">Email</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${traveller.email || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-size:12px;color:#9ca3af;">Phone</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${traveller.phone || '—'}</td></tr>
      ${trip ? `
      <tr><td style="padding:5px 0;font-size:12px;color:#9ca3af;">Trip</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${trip.trip_name || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-size:12px;color:#9ca3af;">Destination</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${trip.arrival_city || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-size:12px;color:#9ca3af;">Departs / Returns</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${trip.depart_date || '—'} — ${trip.return_date || '—'}</td></tr>
      ` : ''}
      <tr><td style="padding:5px 0;font-size:12px;color:#9ca3af;">Check-in label</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${checkin.label || 'Scheduled check-in'}</td></tr>
      <tr><td style="padding:5px 0;font-size:12px;color:#9ca3af;">Due at</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${fmtDate(checkin.due_at)}</td></tr>
      <tr><td style="padding:5px 0;font-size:12px;color:#9ca3af;">Overdue by</td>
          <td style="padding:5px 0;font-size:13px;font-weight:700;color:#b91c1c;">${overdueStr}</td></tr>
      <tr><td style="padding:5px 0;font-size:12px;color:#9ca3af;">Emergency contacts</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${traveller.contactCount || 0} notified</td></tr>
    </table>

    <div style="margin-top:20px;padding:14px 18px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca;">
      <p style="margin:0;font-size:13px;color:#991b1b;font-weight:600;">
        Log into the control room to review this traveller's status and take action if required.
      </p>
    </div>
  </td></tr>

  <tr><td style="background:#f9fafb;padding:14px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">Safeguard 360 — Internal Use Only</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`
}

async function _handler(req, res) {
  // Allow GET (Vercel cron) or POST (manual trigger)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify cron secret to prevent unauthorised triggers
  const authHeader = req.headers.authorization || ''
  const secret = authHeader.replace('Bearer ', '')
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' })
  }

  const now = new Date().toISOString()

  // Find all overdue, unnotified scheduled check-ins
  // "Overdue" = due_at + window_hours has passed
  const { data: missed, error: fetchErr } = await supabaseAdmin.rpc('get_missed_checkins')
  if (fetchErr) {
    console.error('[missed-checkins] RPC error:', fetchErr)
    // Fallback: raw query
    const { data: fallback } = await supabaseAdmin
      .from('scheduled_checkins')
      .select('*')
      .eq('completed', false)
      .is('missed_notified_at', null)
      .lt('due_at', now)

    // Filter to those where the window has also expired
    const overdue = (fallback || []).filter(sc => {
      const deadline = new Date(sc.due_at).getTime() + (sc.window_hours || 24) * 3600000
      return Date.now() > deadline
    })

    if (!overdue.length) {
      console.log('[missed-checkins] No overdue check-ins found.')
      return res.json({ ok: true, processed: 0 })
    }

    return processMissed(overdue, res)
  }

  if (!missed?.length) {
    console.log('[missed-checkins] No overdue check-ins found.')
    return res.json({ ok: true, processed: 0 })
  }

  return processMissed(missed, res)
}

async function processMissed(missed, res) {
  let processed = 0
  let notified  = 0

  for (const checkin of missed) {
    try {
      const [{ data: traveller }, { data: contacts }, { data: trip }] = await Promise.all([
        supabaseAdmin.from('profiles').select('full_name, email, phone, whatsapp, org_id, role').eq('id', checkin.user_id).single(),
        supabaseAdmin.from('emergency_contacts').select('*').eq('user_id', checkin.user_id).order('priority'),
        supabaseAdmin.from('itineraries').select('trip_name, arrival_city, depart_date, return_date').eq('id', checkin.trip_id).single(),
      ])

      const overdueMins_ = minsOverdue(checkin.due_at, checkin.window_hours || 24)
      const h = Math.floor(overdueMins_ / 60)
      const m = overdueMins_ % 60
      const overdueStr = h > 0 ? `${h}h ${m}m` : `${m} min`

      const travName  = traveller?.full_name || 'Traveller'
      const tripName  = trip?.trip_name || 'Active trip'
      const city      = trip?.arrival_city || 'destination'
      const emailSubjectContact = `⚠️ MISSED CHECK-IN — ${travName} — ${tripName}`
      const emailSubjectCR      = `🔴 CONTROL ROOM — Missed check-in: ${travName}`
      const emailSubjectAdmin   = `🔴 Missed check-in — ${travName} — ${tripName}`

      // SMS bodies
      const smsTraveller = `S360 ALERT: You missed your safety check-in for "${tripName}" (${city}). Please log in and confirm you're safe: ${APP_URL}/checkin`
      const smsContact   = `S360 ALERT: ${travName} missed their check-in for "${tripName}" in ${city}. Overdue by ${overdueStr}. Please try to contact them directly.`
      const smsCR        = `S360 CONTROL ROOM: ${travName} missed check-in — ${tripName} in ${city}. Overdue ${overdueStr}. Emergency contacts notified.`

      // WhatsApp bodies
      const waTraveller = `*Safeguard 360 — Missed Check-in*\n\nYou missed your scheduled safety check-in for *${tripName}* (${city}).\n\nPlease confirm you are safe: ${APP_URL}/checkin`
      const waContact   = `*Safeguard 360 Alert*\n\n*${travName}* has missed their safety check-in.\n\nTrip: *${tripName}* → ${city}\nOverdue by: *${overdueStr}*\n\nPlease try to contact them directly.\n\n_You are listed as their emergency contact on Safeguard 360._`
      const waCR        = `*S360 CONTROL ROOM — Missed Check-in*\n\nTraveller: *${travName}*\nTrip: ${tripName} → ${city}\nOverdue: *${overdueStr}*\n\nLog into the control room to action.`

      const sends = []

      // ── 1. Alert the traveller themselves via SMS + WhatsApp ──────────────────
      if (traveller?.phone)    sends.push(sendSms(traveller.phone, smsTraveller).catch(() => false))
      if (traveller?.whatsapp) sends.push(sendWhatsApp(traveller.whatsapp, waTraveller).catch(() => false))

      // ── 2. Notify each emergency contact (email + SMS + WhatsApp) ─────────────
      const contactEmail = buildContactEmail({
        traveller: traveller || {}, trip, contact: {},
        overdueMins: overdueMins_, scheduledLabel: checkin.label || 'Scheduled check-in',
      })
      for (const contact of (contacts || [])) {
        if (contact.email)    sends.push(sendEmail(contact.email, emailSubjectContact, buildContactEmail({ traveller: traveller || {}, trip, contact, overdueMins: overdueMins_, scheduledLabel: checkin.label || 'Scheduled check-in' })).catch(() => false))
        if (contact.phone)    sends.push(sendSms(contact.phone, smsContact).catch(() => false))
        if (contact.whatsapp) sends.push(sendWhatsApp(contact.whatsapp, waContact).catch(() => false))
      }

      // ── 3. Control room (email + SMS + WhatsApp) ──────────────────────────────
      const crEmail = buildControlRoomEmail({
        traveller: { ...traveller, contactCount: (contacts || []).filter(c => c.email || c.phone).length },
        trip, checkin, overdueMins: overdueMins_,
      })
      sends.push(sendEmail(CONTROL_ROOM_EMAIL, emailSubjectCR, crEmail).catch(() => false))
      if (CONTROL_ROOM_PHONE)    sends.push(sendSms(CONTROL_ROOM_PHONE, smsCR).catch(() => false))
      if (CONTROL_ROOM_WHATSAPP) sends.push(sendWhatsApp(CONTROL_ROOM_WHATSAPP, waCR).catch(() => false))

      // ── 4. Org admins (email + SMS + WhatsApp) ────────────────────────────────
      if (traveller?.org_id) {
        const { data: orgAdmins } = await supabaseAdmin
          .from('profiles')
          .select('full_name, email, phone, whatsapp')
          .eq('org_id', traveller.org_id)
          .eq('role', 'org_admin')
        const adminEmail = buildControlRoomEmail({
          traveller: { ...traveller, contactCount: (contacts || []).filter(c => c.email || c.phone).length },
          trip, checkin, overdueMins: overdueMins_,
        })
        for (const admin of (orgAdmins || [])) {
          if (admin.email)    sends.push(sendEmail(admin.email, emailSubjectAdmin, adminEmail).catch(() => false))
          if (admin.phone)    sends.push(sendSms(admin.phone, smsCR).catch(() => false))
          if (admin.whatsapp) sends.push(sendWhatsApp(admin.whatsapp, waCR).catch(() => false))
        }
      }

      const results = await Promise.allSettled(sends)
      const sentCount = results.filter(r => r.status === 'fulfilled' && r.value !== false).length
      notified += sentCount

      // Mark as notified
      await supabaseAdmin
        .from('scheduled_checkins')
        .update({ missed_notified_at: new Date().toISOString() })
        .eq('id', checkin.id)

      console.log(`[missed-checkins] Processed ${checkin.id}: ${sentCount}/${sends.length} notifications sent, overdue ${overdueMins_}m`)
      processed++
    } catch (err) {
      console.error(`[missed-checkins] Error processing checkin ${checkin.id}:`, err.message)
    }
  }

  return res.json({ ok: true, processed, notified })
}

export const handler = adapt(_handler)
export default handler
