/**
 * /api/notify-trip-contacts
 * Called when a solo traveller creates a trip.
 * 1. Generates a secure share token + passcode on the itinerary
 * 2. Emails all emergency contacts the trip details + share link
 */
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './_notify.js'
import { adapt } from './_adapter.js'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const APP_URL = process.env.APP_URL || 'https://www.risk360.co'

function generateToken() {
  return crypto.randomBytes(24).toString('hex')
}

function generatePasscode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function buildContactEmail({ traveller, trip, contact, shareUrl, passcode }) {
  const name = traveller.full_name || traveller.email || 'Your contact'
  const dest = [trip.arrival_city, trip.departure_city].filter(Boolean).join(' ← ')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Trip Notification — Safeguard 360</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#0118A1;padding:24px 28px;border-radius:10px 10px 0 0;">
    <h1 style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">Safeguard 360</h1>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.75);">Travel Safety Platform</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#ffffff;padding:28px;border:1px solid #e5e7eb;border-top:none;">

    <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Hi ${contact.full_name || 'there'},</p>
    <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111827;">
      ${name} is travelling — you're listed as an emergency contact.
    </h2>

    <p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.6;">
      ${name} has registered a trip on Safeguard 360 and added you as an emergency contact.
      You'll be notified automatically if a scheduled check-in is missed.
      No account is needed to receive these notifications.
    </p>

    <!-- Trip summary card -->
    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;">Trip Details</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#9ca3af;width:110px;vertical-align:top;">Trip</td>
          <td style="padding:5px 0;font-size:13px;font-weight:600;color:#111827;">${trip.trip_name}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#9ca3af;vertical-align:top;">Destination</td>
          <td style="padding:5px 0;font-size:13px;font-weight:600;color:#111827;">${dest || '—'}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#9ca3af;vertical-align:top;">Departs</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${fmtDate(trip.depart_date)}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#9ca3af;vertical-align:top;">Returns</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${fmtDate(trip.return_date)}</td>
        </tr>
        ${trip.flight_number ? `<tr>
          <td style="padding:5px 0;font-size:12px;color:#9ca3af;vertical-align:top;">Flight</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${trip.flight_number}</td>
        </tr>` : ''}
        ${trip.hotel_name ? `<tr>
          <td style="padding:5px 0;font-size:12px;color:#9ca3af;vertical-align:top;">Hotel</td>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${trip.hotel_name}</td>
        </tr>` : ''}
      </table>
    </div>

    <!-- Share link -->
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#0369a1;">Secure Itinerary Link</p>
      <p style="margin:0 0 12px;font-size:13px;color:#374151;line-height:1.5;">
        View the full itinerary using the link and passcode below. Keep the passcode confidential — only share with people you trust.
      </p>
      <p style="margin:0 0 6px;font-size:13px;color:#374151;">
        <strong>Link:</strong>
        <a href="${shareUrl}" style="color:#0118A1;word-break:break-all;">${shareUrl}</a>
      </p>
      <p style="margin:0;font-size:13px;color:#374151;">
        <strong>Passcode:</strong>
        <span style="font-size:20px;font-weight:900;letter-spacing:.15em;color:#0118A1;font-family:monospace;">${passcode}</span>
      </p>
    </div>

    <!-- Missed check-in notice -->
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
        <strong>⚠️ Missed check-in alerts:</strong> If ${name.split(' ')[0]} misses a scheduled safety check-in,
        you will receive an automatic notification by email${traveller.phone ? ' and SMS' : ''}.
        No action is needed unless you are genuinely unable to contact them.
      </p>
    </div>

    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
      You were added as an emergency contact by ${name}. If you believe this was sent in error, please disregard this email.
    </p>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f9fafb;padding:14px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      Safeguard 360 &mdash; Travel Risk Intelligence &mdash;
      <a href="https://www.risk360.co" style="color:#6b7280;">risk360.co</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`
}

async function _handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { trip_id } = req.body
  if (!trip_id) return res.status(400).json({ error: 'trip_id required' })

  // Load trip
  const { data: trip } = await supabaseAdmin
    .from('itineraries')
    .select('*')
    .eq('id', trip_id)
    .eq('user_id', user.id)
    .single()
  if (!trip) return res.status(404).json({ error: 'Trip not found' })

  // Load traveller profile
  const { data: traveller } = await supabaseAdmin
    .from('profiles')
    .select('full_name, email, phone')
    .eq('id', user.id)
    .single()

  // Load emergency contacts
  const { data: contacts } = await supabaseAdmin
    .from('emergency_contacts')
    .select('*')
    .eq('user_id', user.id)
    .order('priority')

  if (!contacts?.length) return res.json({ ok: true, sent: 0, message: 'No emergency contacts found' })

  // Generate share token + passcode if not already set
  let shareToken   = trip.share_token
  let sharePasscode = trip.share_passcode
  if (!shareToken) {
    shareToken    = generateToken()
    sharePasscode = generatePasscode()
    await supabaseAdmin
      .from('itineraries')
      .update({ share_token: shareToken, share_passcode: sharePasscode })
      .eq('id', trip_id)
  }

  const shareUrl = `${APP_URL}/trip-share/${shareToken}`

  // Email each contact
  const contactProfiles = contacts.filter(c => c.email)
  const results = await Promise.allSettled(
    contactProfiles.map(contact =>
      sendEmail(
        contact.email,
        `✈️ ${traveller?.full_name || 'Your contact'} is travelling to ${trip.arrival_city || 'a new destination'} — Safeguard 360`,
        buildContactEmail({ traveller, trip, contact, shareUrl, passcode: sharePasscode })
      )
    )
  )

  const sent = results.filter(r => r.status === 'fulfilled' && r.value).length
  console.log(`[notify-trip-contacts] Sent ${sent}/${contactProfiles.length} emails for trip ${trip_id}`)

  return res.json({ ok: true, sent, contacts: contactProfiles.length, shareUrl })
}

export const handler = adapt(_handler)
export default handler
