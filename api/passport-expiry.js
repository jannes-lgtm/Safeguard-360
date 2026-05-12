/**
 * /api/passport-expiry
 *
 * Checks all traveller profiles for passports expiring within 180 days.
 * Sends email to the traveller and (if applicable) their org admin.
 * Uses audit_log to avoid spamming — one notification per 7 days per user.
 *
 * Triggered by Vercel cron daily at 07:00 UTC.
 * Can also be called manually with the CRON_SECRET header.
 *
 * Required env vars:
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *   CRON_SECRET
 */

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './_notify.js'

const SUPABASE_URL  = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const APP_URL       = process.env.APP_URL || 'https://www.risk360.co'

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

function daysUntil(dateStr) {
  return Math.floor((new Date(dateStr) - new Date()) / 86400000)
}

function urgencyLevel(days) {
  if (days < 0)   return { label: 'EXPIRED',      colour: '#B91C1C', emoji: '🚨' }
  if (days <= 30)  return { label: 'CRITICAL',     colour: '#DC2626', emoji: '🚨' }
  if (days <= 90)  return { label: 'URGENT',       colour: '#EA580C', emoji: '⚠️' }
  return               { label: 'RENEWAL DUE',   colour: '#D97706', emoji: '📋' }
}

function travelerEmail(traveller, days, org) {
  const { label, colour, emoji } = urgencyLevel(days)
  const expiryStr = new Date(traveller.passport_expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const absdays   = Math.abs(days)
  const when      = days < 0 ? `expired ${absdays} day${absdays !== 1 ? 's' : ''} ago`
                              : `expires in ${days} day${days !== 1 ? 's' : ''} (${expiryStr})`

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
  <tr><td style="background:#0118A1;padding:24px 28px;border-radius:10px 10px 0 0;">
    <p style="margin:0;font-size:20px;font-weight:800;color:#fff;">Safeguard 360</p>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.7);">Travel Risk Intelligence Platform</p>
  </td></tr>
  <tr><td style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
    <div style="background:${colour}12;border:1px solid ${colour}40;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0;font-size:15px;font-weight:700;color:${colour};">${emoji} Passport ${label}</p>
      <p style="margin:6px 0 0;font-size:13px;color:${colour}cc;">Your passport ${when}.</p>
    </div>
    <p style="margin:0 0 12px;font-size:14px;color:#374151;">Hi ${traveller.full_name || 'Traveller'},</p>
    <p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.6;">
      Most countries require your passport to be valid for at least <strong>6 months</strong> beyond your travel dates.
      ${days < 0
        ? 'Your passport has expired. You will not be able to travel internationally until it is renewed.'
        : 'Please renew your passport as soon as possible to ensure uninterrupted travel.'}
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:24px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;">Passport Details</p>
        <p style="margin:0;font-size:13px;color:#111827;">
          Number: <strong>${traveller.passport_number || '—'}</strong><br/>
          Expiry: <strong style="color:${colour};">${expiryStr}</strong>
          ${org ? `<br/>Organisation: <strong>${org.name}</strong>` : ''}
        </p>
      </td></tr>
    </table>
    <p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.6;">
      Once renewed, update your passport details in your profile to keep your records current.
    </p>
    <a href="${APP_URL}/profile"
      style="display:inline-block;background:#AACC00;color:#0118A1;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;">
      Update My Profile →
    </a>
    <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;">
      This is an automated compliance reminder from Safeguard 360. You will receive reminders every 7 days until your passport is updated.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

function adminEmail(traveller, days, org) {
  const { label, colour, emoji } = urgencyLevel(days)
  const expiryStr = new Date(traveller.passport_expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const absdays   = Math.abs(days)
  const when      = days < 0 ? `expired ${absdays} day${absdays !== 1 ? 's' : ''} ago`
                              : `expires in ${days} day${days !== 1 ? 's' : ''} (${expiryStr})`

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
  <tr><td style="background:#0118A1;padding:24px 28px;border-radius:10px 10px 0 0;">
    <p style="margin:0;font-size:20px;font-weight:800;color:#fff;">Safeguard 360</p>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.7);">Compliance Alert · ${org?.name || 'Your Organisation'}</p>
  </td></tr>
  <tr><td style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
    <div style="background:${colour}12;border:1px solid ${colour}40;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0;font-size:15px;font-weight:700;color:${colour};">${emoji} Traveller Passport ${label}</p>
      <p style="margin:6px 0 0;font-size:13px;color:${colour}cc;">${traveller.full_name || traveller.email}'s passport ${when}.</p>
    </div>
    <p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.6;">
      As the travel administrator for <strong>${org?.name || 'your organisation'}</strong>, you are receiving this alert because
      a traveller's passport requires attention. Most countries require passports to be valid for at least 6 months
      beyond the travel dates. This traveller may not be able to travel until their passport is renewed.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:24px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;">Traveller Details</p>
        <p style="margin:0;font-size:13px;color:#111827;line-height:1.7;">
          Name: <strong>${traveller.full_name || '—'}</strong><br/>
          Email: <strong>${traveller.email || '—'}</strong><br/>
          Passport: <strong>${traveller.passport_number || '—'}</strong><br/>
          Expiry: <strong style="color:${colour};">${expiryStr}</strong>
        </p>
      </td></tr>
    </table>
    <a href="${APP_URL}/org/users"
      style="display:inline-block;background:#AACC00;color:#0118A1;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;">
      View Our Travellers →
    </a>
    <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;">
      The traveller has also been notified directly. You will receive this alert every 7 days until the passport is updated.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Auth: cron secret or POST from admin
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers['authorization'] || req.headers['x-cron-secret'] || ''
  const isCron = req.headers['x-vercel-cron'] === '1'
  if (!isCron) {
    if (!cronSecret) {
      console.error('[passport-expiry] CRON_SECRET not set — refusing unauthenticated access')
      return res.status(503).json({ error: 'CRON_SECRET not configured on server' })
    }
    if (authHeader !== `Bearer ${cronSecret}` && authHeader !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorised' })
    }
  }

  const today     = new Date()
  const cutoff    = new Date(today.getTime() + 180 * 86400000).toISOString().split('T')[0]
  const todayStr  = today.toISOString().split('T')[0]
  const sevenAgo  = new Date(today.getTime() - 7 * 86400000).toISOString()

  // Fetch all profiles with passport expiring within 180 days (including already expired)
  const { data: profiles, error: profErr } = await sb
    .from('profiles')
    .select('id, full_name, email, passport_number, passport_expiry, org_id, role')
    .not('passport_expiry', 'is', null)
    .lte('passport_expiry', cutoff)
    .in('role', ['traveller', 'solo'])

  if (profErr) return res.status(500).json({ error: profErr.message })
  if (!profiles?.length) return res.status(200).json({ checked: 0, notified: 0 })

  // Fetch recent audit entries to avoid re-notifying within 7 days
  const userIds = profiles.map(p => p.id)
  const { data: recentLogs } = await sb
    .from('audit_logs')
    .select('entity_id, created_at')
    .eq('action', 'passport.expiry_notified')
    .in('entity_id', userIds)
    .gte('created_at', sevenAgo)

  const recentlyNotified = new Set((recentLogs || []).map(l => l.entity_id))

  // Fetch org admins for org members in one query
  const orgIds = [...new Set(profiles.filter(p => p.org_id).map(p => p.org_id))]
  let orgAdminMap = {}
  if (orgIds.length) {
    const { data: orgs } = await sb
      .from('organisations')
      .select('id, name')
      .in('id', orgIds)
    const { data: admins } = await sb
      .from('profiles')
      .select('id, email, org_id')
      .in('org_id', orgIds)
      .eq('role', 'org_admin')
    ;(orgs || []).forEach(org => {
      orgAdminMap[org.id] = {
        name:  org.name,
        email: (admins || []).find(a => a.org_id === org.id)?.email || null,
      }
    })
  }

  let notified = 0
  for (const p of profiles) {
    if (recentlyNotified.has(p.id)) continue

    const days = daysUntil(p.passport_expiry)
    const org  = p.org_id ? orgAdminMap[p.org_id] : null

    // Email traveller
    if (p.email) {
      const subject = days < 0
        ? `🚨 Your passport has expired — action required`
        : `${days <= 30 ? '🚨' : days <= 90 ? '⚠️' : '📋'} Passport renewal reminder — ${Math.abs(days)} days ${days < 0 ? 'overdue' : 'remaining'}`
      await sendEmail(p.email, subject, travelerEmail(p, days, org))
    }

    // Email org admin (if org member)
    if (org?.email) {
      const subject = days < 0
        ? `🚨 Traveller passport expired: ${p.full_name || p.email}`
        : `${days <= 30 ? '🚨' : '⚠️'} Passport expiry alert: ${p.full_name || p.email} — ${days} days remaining`
      await sendEmail(org.email, subject, adminEmail(p, days, org))
    }

    // Write audit log entry
    await sb.from('audit_logs').insert({
      actor_id:    p.id,
      actor_email: p.email,
      actor_role:  p.role,
      action:      'passport.expiry_notified',
      entity_type: 'user',
      entity_id:   p.id,
      description: `Passport expiry notification sent — ${Math.abs(days)} days ${days < 0 ? 'overdue' : 'remaining'}`,
      metadata:    { days_remaining: days, passport_expiry: p.passport_expiry },
    })

    notified++
  }

  return res.status(200).json({ checked: profiles.length, notified })
}
