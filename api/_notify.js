/**
 * api/_notify.js — Shared notification module (underscore = not a Vercel route)
 *
 * Required env vars:
 *   RESEND_API_KEY           — email delivery via Resend (resend.com)
 *   RESEND_FROM_EMAIL        — verified sender address (default: alerts@risk360.co)
 *   TWILIO_ACCOUNT_SID       — Twilio account SID
 *   TWILIO_AUTH_TOKEN        — Twilio auth token
 *   TWILIO_FROM_NUMBER       — Twilio phone number in E.164 format e.g. +27123456789
 *   TWILIO_WHATSAPP_FROM     — WhatsApp-enabled number, e.g. whatsapp:+14155238886 (sandbox)
 *                              or whatsapp:+27XXXXXXXXX (approved business number)
 *   SOS_ADMIN_EMAIL          — email address that receives all SOS alerts
 *   SOS_ADMIN_PHONE          — phone number that receives SOS SMS (E.164 format)
 *   SOS_ADMIN_WHATSAPP       — WhatsApp number for SOS (E.164 format, no "whatsapp:" prefix)
 *
 * Exports:
 *   sendEmail(to, subject, html)
 *   sendSms(to, body)
 *   sendWhatsApp(to, body)
 *   notifyAlert({ userEmail, userPhone, userWhatsApp, alerts, tripName, city })
 *   notifySos({ event, contacts, adminEmail, adminPhone, adminWhatsApp })
 */

import { fetchWithRetry } from './_retry.js'

const FROM_NAME = 'Safeguard 360'

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Email via Resend ──────────────────────────────────────────────────────────
export async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY
  const from   = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
  if (!apiKey || !to) return false

  try {
    const res = await fetchWithRetry(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${from}>`,
          to:   Array.isArray(to) ? to : [to],
          subject,
          html,
        }),
      },
      { attempts: 3, baseMs: 800, retryCodes: [429, 502, 503, 504], label: 'resend-email' }
    )
    if (!res.ok) {
      const err = await res.text()
      console.error(JSON.stringify({ level: 'error', msg: 'Resend error', status: res.status, to, err }))
      return false
    }
    return true
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', msg: 'sendEmail failed', error: e.message, to }))
    return false
  }
}

// ── SMS via Twilio ────────────────────────────────────────────────────────────
export async function sendSms(to, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_FROM_NUMBER
  if (!sid || !token || !from || !to) return false

  const toNorm = normaliseE164(to)
  if (!toNorm) {
    console.warn('[notify] SMS skipped — number not in E.164 format:', to)
    return false
  }

  return twilioSend(sid, token, { Body: body, From: from, To: toNorm }, 'SMS')
}

// ── WhatsApp via Twilio ───────────────────────────────────────────────────────
export async function sendWhatsApp(to, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_WHATSAPP_FROM   // e.g. whatsapp:+14155238886
  if (!sid || !token || !from || !to) return false

  const toNorm = normaliseE164(to)
  if (!toNorm) {
    console.warn('[notify] WhatsApp skipped — number not in E.164 format:', to)
    return false
  }

  return twilioSend(
    sid, token,
    { Body: body, From: from, To: `whatsapp:${toNorm}` },
    'WhatsApp'
  )
}

// ── Shared Twilio sender ──────────────────────────────────────────────────────
async function twilioSend(sid, token, params, label) {
  try {
    const res = await fetchWithRetry(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params).toString(),
      },
      { attempts: 3, baseMs: 800, retryCodes: [429, 502, 503, 504], label: `twilio-${label.toLowerCase()}` }
    )
    if (!res.ok) {
      const err = await res.text()
      console.error(JSON.stringify({ level: 'error', msg: `Twilio ${label} error`, status: res.status, err }))
      return false
    }
    return true
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', msg: `send${label} failed`, error: e.message }))
    return false
  }
}

function normaliseE164(num) {
  if (!num) return null
  // Strip whitespace, dashes, parentheses
  let n = num.toString().replace(/[\s\-().]/g, '')
  // South African local format: 0xx → +27xx
  if (/^0[6-8]\d{8}$/.test(n)) n = '+27' + n.slice(1)
  // Must be E.164: + followed by 7–15 digits
  if (/^\+\d{7,15}$/.test(n)) return n
  console.warn('[notify] Phone not in E.164 format, skipping:', num)
  return null
}

// ── Shared HTML shell ─────────────────────────────────────────────────────────
function emailShell(accentColour, headerContent, bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Safeguard 360</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
  <!-- Header -->
  <tr><td style="background:${accentColour};padding:24px 28px;border-radius:10px 10px 0 0;">
    ${headerContent}
  </td></tr>
  <!-- Body -->
  <tr><td style="background:#ffffff;padding:28px 28px 24px;border:1px solid #e5e7eb;border-top:none;">
    ${bodyContent}
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f9fafb;padding:14px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      Safeguard 360 &mdash; Travel Risk Intelligence Platform &mdash;
      <a href="https://safeguard360.co.za" style="color:#6b7280;">safeguard360.co.za</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

function severityColour(sev) {
  if (sev === 'Critical') return '#dc2626'
  if (sev === 'High')     return '#d97706'
  return '#2563eb'
}

// ── Alert notification ────────────────────────────────────────────────────────
/**
 * Send email + SMS to a traveller about new security/disaster alerts for their trip.
 * @param {object} opts
 * @param {string}  opts.userEmail
 * @param {string}  [opts.userPhone]
 * @param {string}  [opts.userWhatsApp]
 * @param {Array}   opts.alerts     — array of trip_alert rows
 * @param {string}  opts.tripName
 * @param {string}  opts.city
 */
export async function notifyAlert({ userEmail, userPhone, userWhatsApp, alerts, tripName, city }) {
  if (!alerts?.length) return
  if (!userEmail && !userPhone) return

  const top   = alerts[0]
  const count = alerts.length
  const label = tripName || city || 'your trip'
  const subject = count === 1
    ? `⚠️ ${top.severity} Alert — ${label}`
    : `⚠️ ${count} New Alerts — ${label}`

  // ── Build email ────────────────────────────────────────────────────────────
  const alertRows = alerts.slice(0, 5).map(a => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;">
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <div style="width:4px;min-height:40px;background:${severityColour(a.severity)};border-radius:2px;flex-shrink:0;margin-top:2px;"></div>
          <div>
            <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#111827;">${escapeHtml(a.title)}</p>
            ${a.description ? `<p style="margin:0 0 6px;font-size:12px;color:#6b7280;line-height:1.5;">${escapeHtml((a.description || '').substring(0, 220))}${(a.description || '').length > 220 ? '…' : ''}</p>` : ''}
            <span style="display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${severityColour(a.severity)};background:${a.severity === 'Critical' ? '#fef2f2' : a.severity === 'High' ? '#fffbeb' : '#eff6ff'};padding:2px 8px;border-radius:20px;">${escapeHtml(a.severity)}</span>
            <span style="font-size:10px;color:#9ca3af;margin-left:8px;">${escapeHtml(a.source || 'Safeguard 360')}</span>
          </div>
        </div>
      </td>
    </tr>`).join('')

  const html = emailShell(
    '#0118A1',
    `<h1 style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">Safeguard 360</h1>
     <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.75);">Travel Risk Intelligence</p>`,
    `<h2 style="margin:0 0 6px;font-size:17px;font-weight:700;color:#111827;">${subject}</h2>
     <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">
       ${count} new alert${count !== 1 ? 's' : ''} detected for your trip to <strong style="color:#111827;">${city}</strong>
     </p>
     <table width="100%" cellpadding="0" cellspacing="0">${alertRows}</table>
     ${count > 5 ? `<p style="font-size:12px;color:#9ca3af;margin:12px 0 0;">+${count - 5} more alert${count - 5 !== 1 ? 's' : ''} — view all in the app.</p>` : ''}
     <div style="margin-top:24px;">
       <a href="https://safeguard360.co.za/dashboard"
         style="display:inline-block;background:#0118A1;color:#ffffff;padding:11px 22px;border-radius:7px;text-decoration:none;font-size:13px;font-weight:600;">
         View Dashboard →
       </a>
     </div>
     <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;">
       You are receiving this because you have an active or upcoming trip to ${city}.
       Manage notification preferences in your profile.
     </p>`
  )

  // ── Build SMS ──────────────────────────────────────────────────────────────
  const sms = count === 1
    ? `S360 ALERT [${top.severity}] ${top.title} — ${label}. Open the app for details.`
    : `S360 — ${count} new alerts for ${label}. Highest: ${top.severity} — ${top.title}. Open the app.`

  const waBody = count === 1
    ? `*Safeguard 360 Alert*\n\n*[${top.severity}]* ${top.title}\n\nTrip: ${label} → ${city}\n\nOpen the app for full details: https://www.risk360.co/dashboard`
    : `*Safeguard 360 — ${count} New Alerts*\n\nTrip: ${label} → ${city}\n\nTop alert: *[${top.severity}]* ${top.title}\n\nOpen the app: https://www.risk360.co/dashboard`

  const promises = []
  if (userEmail)    promises.push(sendEmail(userEmail, subject, html))
  if (userPhone)    promises.push(sendSms(userPhone, sms.substring(0, 160)))
  if (userWhatsApp) promises.push(sendWhatsApp(userWhatsApp, waBody))
  await Promise.allSettled(promises)
}

// ── SOS notification ──────────────────────────────────────────────────────────
/**
 * Send SOS alerts to admin + emergency contacts.
 * @param {object} opts
 * @param {object}  opts.event            — the sos_events row
 * @param {Array}   opts.contacts         — [{name, email, phone?, whatsapp?}]
 * @param {string}  [opts.adminEmail]
 * @param {string}  [opts.adminPhone]
 * @param {string}  [opts.adminWhatsApp]
 */
export async function notifySos({ event, contacts = [], adminEmail, adminPhone, adminWhatsApp }) {
  const mapsUrl = (event.latitude && event.longitude)
    ? `https://maps.google.com/?q=${event.latitude},${event.longitude}`
    : null

  const who      = event.full_name || 'Unknown traveller'
  const where    = event.arrival_city || ''
  const subject  = `🆘 SOS ALERT — ${who}${where ? ` in ${where}` : ''} — IMMEDIATE RESPONSE REQUIRED`
  const timeStr  = new Date().toUTCString()

  const html = emailShell(
    '#dc2626',
    `<h1 style="margin:0;font-size:20px;font-weight:900;color:#ffffff;">🆘 SOS EMERGENCY ALERT</h1>
     <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.85);">Immediate response required — Safeguard 360</p>`,
    `<!-- Details table -->
     <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
       <tr><td style="padding:6px 0;font-size:12px;color:#6b7280;width:120px;vertical-align:top;">Traveller</td>
           <td style="padding:6px 0;font-size:13px;font-weight:700;color:#111827;">${who}</td></tr>
       ${event.trip_name ? `<tr><td style="padding:6px 0;font-size:12px;color:#6b7280;vertical-align:top;">Trip</td>
           <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${event.trip_name}</td></tr>` : ''}
       ${where ? `<tr><td style="padding:6px 0;font-size:12px;color:#6b7280;vertical-align:top;">Destination</td>
           <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${where}</td></tr>` : ''}
       ${event.location_label ? `<tr><td style="padding:6px 0;font-size:12px;color:#6b7280;vertical-align:top;">GPS Coords</td>
           <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${event.location_label}</td></tr>` : ''}
       <tr><td style="padding:6px 0;font-size:12px;color:#6b7280;vertical-align:top;">Time (UTC)</td>
           <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${timeStr}</td></tr>
     </table>

     <!-- Traveller message -->
     ${event.message ? `
     <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:7px;padding:14px 16px;margin-bottom:20px;">
       <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:.08em;">Traveller's Message</p>
       <p style="margin:0;font-size:14px;color:#111827;font-style:italic;line-height:1.5;">"${escapeHtml(event.message)}"</p>
     </div>` : ''}

     <!-- GPS button -->
     ${mapsUrl ? `
     <div style="margin-bottom:20px;">
       <a href="${mapsUrl}"
         style="display:inline-block;background:#dc2626;color:#ffffff;padding:12px 22px;border-radius:7px;text-decoration:none;font-size:14px;font-weight:700;">
         📍 View GPS Location on Google Maps
       </a>
     </div>` : `
     <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:7px;padding:12px 16px;margin-bottom:20px;">
       <p style="margin:0;font-size:12px;color:#991b1b;">⚠️ GPS location not available — traveller may not have location services enabled.</p>
     </div>`}

     <!-- Warning strip -->
     <div style="background:#fef2f2;border-radius:7px;padding:14px 16px;">
       <p style="margin:0;font-size:12px;color:#991b1b;line-height:1.6;font-weight:600;">
         This is an automated SOS alert from the Safeguard 360 platform.
         The traveller has manually triggered a distress signal.
         Please attempt contact immediately and follow your emergency response protocol.
       </p>
     </div>`
  )

  // SMS body — keep concise, include map link if available
  const smsLines = [
    `🆘 SOS ALERT — ${who}${where ? ` in ${where}` : ''}`,
    event.message ? `Message: "${event.message.substring(0, 80)}"` : null,
    mapsUrl ? `Location: ${mapsUrl}` : 'No GPS available.',
    'Respond immediately — Safeguard 360',
  ].filter(Boolean).join(' | ')

  const smsBody = smsLines.substring(0, 320)

  const waBody = [
    `🆘 *SOS ALERT — ${who}${where ? ` in ${where}` : ''}*`,
    event.message ? `_"${event.message.substring(0, 120)}"_` : null,
    mapsUrl ? `📍 Location: ${mapsUrl}` : '📍 No GPS available',
    `🕐 ${new Date().toUTCString()}`,
    `Respond immediately — Safeguard 360`,
  ].filter(Boolean).join('\n')

  const promises = []
  if (adminEmail)    promises.push(sendEmail(adminEmail, subject, html))
  if (adminPhone)    promises.push(sendSms(adminPhone, smsBody))
  if (adminWhatsApp) promises.push(sendWhatsApp(adminWhatsApp, waBody))

  for (const c of contacts) {
    if (c.email)    promises.push(sendEmail(c.email, subject, html))
    if (c.phone)    promises.push(sendSms(c.phone, smsBody))
    if (c.whatsapp) promises.push(sendWhatsApp(c.whatsapp, waBody))
  }

  const results = await Promise.allSettled(promises)
  const sent = results.filter(r => r.status === 'fulfilled' && r.value === true).length
  console.log(`[notify] SOS delivered to ${sent}/${results.length} recipients`)
  return sent
}
