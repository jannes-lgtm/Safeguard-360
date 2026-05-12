/**
 * /api/trigger-debriefs
 *
 * Finds completed trips with no debrief submitted and emails the traveller.
 * Throttled: skips trips that received a reminder within the last 3 days.
 *
 * Triggered by Vercel cron daily at 09:00 UTC.
 * Can also be called manually with the CRON_SECRET header.
 *
 * Required env vars:
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *   CRON_SECRET
 *   APP_URL (optional, defaults to https://www.risk360.co)
 */

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './_notify.js'
import { adapt } from './_adapter.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const APP_URL      = process.env.APP_URL || 'https://www.risk360.co'

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function buildDebriefEmail({ trip, userEmail }) {
  const destination = trip.arrival_city || 'your destination'
  const tripName    = trip.trip_name || destination
  const debrief_url = `${APP_URL}/debrief/${trip.id}`

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Post-Travel Debrief Required — Safeguard 360</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <tr><td style="background:#0118A1;padding:24px 28px;border-radius:10px 10px 0 0;">
    <p style="margin:0;font-size:20px;font-weight:800;color:#ffffff;">Safeguard 360</p>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.7);">Travel Risk Intelligence Platform</p>
  </td></tr>

  <tr><td style="background:#ffffff;padding:28px 28px 24px;border:1px solid #e5e7eb;border-top:none;">

    <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">Your debrief is ready to complete</h2>
    <p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.6;">
      Welcome back! Your trip to <strong style="color:#111827;">${destination}</strong> has ended.
      Please take two minutes to complete your post-travel debrief — it helps us improve safety for future travellers and satisfies your organisation's duty of care requirements.
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;">Trip Summary</p>
        <p style="margin:0;font-size:14px;font-weight:700;color:#111827;">${tripName}</p>
        <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">
          ${trip.departure_city ? `${trip.departure_city} &rarr; ` : ''}${destination}
        </p>
        <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">
          ${fmtDate(trip.depart_date)} &ndash; ${fmtDate(trip.return_date)}
        </p>
      </td></tr>
    </table>

    <table cellpadding="0" cellspacing="0" style="width:100%;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:0;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.06em;">Why this matters</p>
        <p style="margin:0;font-size:13px;color:#1e3a8a;line-height:1.7;">
          Under <strong>ISO 31030</strong> and your organisation's duty of care obligations, post-travel debriefs are a critical part of the travel risk management cycle. Your feedback helps identify emerging risks, improve pre-travel briefings, and protect future travellers to the same destination.
        </p>
      </td></tr>
    </table>

    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
      <tr><td align="center">
        <a href="${debrief_url}"
          style="display:inline-block;background:#AACC00;color:#0118A1;padding:16px 36px;border-radius:12px;text-decoration:none;font-size:16px;font-weight:800;letter-spacing:-.01em;">
          Complete My Debrief &rarr;
        </a>
        <p style="margin:10px 0 0;font-size:12px;color:#9ca3af;">Takes about 2 minutes</p>
      </td></tr>
    </table>

    <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;">
      This is an automated reminder from Safeguard 360. You will receive reminders every 3 days until your debrief is submitted.
      If you believe you received this in error, please contact your travel administrator.
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

async function _handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()

  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers['authorization'] || req.headers['x-cron-secret'] || ''
  const isCron = req.headers['x-vercel-cron'] === '1'
  if (!isCron) {
    if (!cronSecret) {
      console.error('[trigger-debriefs] CRON_SECRET not set — refusing unauthenticated access')
      return res.status(503).json({ error: 'CRON_SECRET not configured on server' })
    }
    if (authHeader !== `Bearer ${cronSecret}` && authHeader !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorised' })
    }
  }

  const today       = new Date().toISOString().split('T')[0]
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString()

  const { data: trips, error: tripsErr } = await sb
    .from('itineraries')
    .select('id, user_id, trip_name, departure_city, arrival_city, depart_date, return_date, org_id')
    .lte('return_date', today)
    .eq('approval_status', 'approved')

  if (tripsErr) return res.status(500).json({ error: tripsErr.message })
  if (!trips?.length) return res.status(200).json({ checked: 0, emailed: 0 })

  const tripIds = trips.map(t => t.id)

  const { data: existingDebriefs } = await sb
    .from('trip_debriefs')
    .select('trip_id')
    .in('trip_id', tripIds)

  const debriefedSet = new Set((existingDebriefs || []).map(d => d.trip_id))

  const pending = trips.filter(t => !debriefedSet.has(t.id))
  if (!pending.length) return res.status(200).json({ checked: trips.length, emailed: 0 })

  const pendingIds = pending.map(t => t.id)
  const { data: recentReminders } = await sb
    .from('audit_logs')
    .select('entity_id, created_at')
    .eq('action', 'debrief.reminder_sent')
    .in('entity_id', pendingIds)
    .gte('created_at', threeDaysAgo)

  const recentlyRemindedSet = new Set((recentReminders || []).map(l => l.entity_id))

  const toRemind = pending.filter(t => !recentlyRemindedSet.has(t.id))
  if (!toRemind.length) return res.status(200).json({ checked: trips.length, emailed: 0, throttled: pending.length })

  const userIds = [...new Set(toRemind.map(t => t.user_id))]
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, email, full_name, role')
    .in('id', userIds)

  const profileMap = {}
  for (const p of profiles || []) profileMap[p.id] = p

  let emailed = 0

  for (const trip of toRemind) {
    const profile = profileMap[trip.user_id]
    const email   = profile?.email || null
    if (!email) continue

    const tripName = trip.trip_name || trip.arrival_city || 'your recent trip'
    const subject  = `Post-Travel Debrief Required — ${tripName}`

    const sent = await sendEmail(email, subject, buildDebriefEmail({ trip, userEmail: email }))

    if (sent) {
      await sb.from('audit_logs').insert({
        actor_id:    trip.user_id,
        actor_email: email,
        actor_role:  profile?.role || null,
        action:      'debrief.reminder_sent',
        entity_type: 'itinerary',
        entity_id:   trip.id,
        description: `Post-travel debrief reminder sent for trip: ${tripName}`,
        metadata: {
          trip_id:     trip.id,
          trip_name:   tripName,
          destination: trip.arrival_city,
          return_date: trip.return_date,
        },
      }).catch(() => {})
      emailed++
    }
  }

  return res.status(200).json({
    checked:  trips.length,
    pending:  pending.length,
    throttled: pending.length - toRemind.length,
    emailed,
  })
}

export const handler = adapt(_handler)
export default handler
