/**
 * /api/crisis-broadcast
 * Org admin sends a mass notification to all (or filtered) org travellers.
 *
 * POST body:
 *   { subject, message, severity, recipients }
 *   recipients: 'all' | 'active' | 'upcoming'   (default: 'all')
 *   severity:   'Critical' | 'High' | 'Medium'   (default: 'High')
 *
 * Auth: Supabase JWT — must be org_admin
 */

import { createClient } from '@supabase/supabase-js'
import { sendEmail, sendSms, sendWhatsApp } from './_notify.js'
import { adapt } from './_adapter.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const ANON_KEY     = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const APP_URL      = process.env.APP_URL || 'https://www.risk360.co'

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

async function getUser(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(4000),
  })
  return res.ok ? res.json() : null
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const SEV_COLOR = {
  Critical: '#DC2626',
  High:     '#EA580C',
  Medium:   '#2563EB',
}

const SEV_EMOJI = {
  Critical: '🚨',
  High:     '⚠️',
  Medium:   '📢',
}

function buildEmail({ subject, message, severity, senderName, orgName }) {
  const color = SEV_COLOR[severity] || SEV_COLOR.High
  const emoji = SEV_EMOJI[severity] || '📢'

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <tr><td style="background:${color};padding:24px 28px;border-radius:10px 10px 0 0;">
    <p style="margin:0;font-size:20px;font-weight:800;color:#fff;">Safeguard 360</p>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.75);">Crisis Broadcast — ${severity} Priority</p>
  </td></tr>

  <tr><td style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">

    <div style="background:${color}10;border:1px solid ${color}40;border-radius:8px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;font-weight:700;color:${color};">
        ${emoji} ${severity} Priority — ${orgName || 'Your Organisation'}
      </p>
    </div>

    <h2 style="margin:0 0 16px;font-size:17px;font-weight:800;color:#111827;">${escapeHtml(subject)}</h2>

    <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:18px 20px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.75;white-space:pre-wrap;">${escapeHtml(message)}</p>
    </div>

    <div style="text-align:center;margin-bottom:24px;">
      <a href="${APP_URL}/dashboard"
        style="display:inline-block;background:#0118A1;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 32px;border-radius:10px;">
        Open Platform →
      </a>
    </div>

    <p style="margin:0;font-size:11px;color:#9CA3AF;line-height:1.6;">
      This message was sent by <strong>${senderName}</strong> via Safeguard 360.
      If you believe you received this in error please contact your travel safety administrator.
    </p>

  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

async function _handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Missing auth token' })

  const user = await getUser(token)
  if (!user?.id) return res.status(401).json({ error: 'Invalid token' })

  const { data: sender } = await sb
    .from('profiles')
    .select('full_name, email, role, org_id')
    .eq('id', user.id)
    .single()

  if (!sender || !['org_admin', 'admin', 'developer'].includes(sender.role)) {
    return res.status(403).json({ error: 'Org admin access required' })
  }

  const { subject, message, severity = 'High', recipients = 'all' } = req.body || {}
  if (!subject?.trim()) return res.status(400).json({ error: 'subject required' })
  if (!message?.trim()) return res.status(400).json({ error: 'message required' })

  const org_id = sender.org_id
  if (!org_id && !['admin', 'developer'].includes(sender.role)) {
    return res.status(400).json({ error: 'No organisation associated with your account' })
  }

  // Load org name
  const { data: org } = org_id
    ? await sb.from('organisations').select('name').eq('id', org_id).single()
    : { data: null }

  // Build traveller query
  let query = sb.from('profiles').select('id, full_name, email, phone, whatsapp')
  if (org_id) query = query.eq('org_id', org_id)
  query = query.in('role', ['traveller', 'solo'])

  const { data: allTravellers } = await query
  let travellers = allTravellers || []

  // Filter by trip status if requested
  if (recipients !== 'all' && travellers.length) {
    const ids = travellers.map(t => t.id)
    const now = new Date().toISOString().slice(0, 10)
    const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

    let tripQuery = sb.from('itineraries').select('user_id')

    if (recipients === 'active') {
      tripQuery = tripQuery
        .in('user_id', ids)
        .lte('depart_date', now)
        .gte('return_date', now)
    } else if (recipients === 'upcoming') {
      tripQuery = tripQuery
        .in('user_id', ids)
        .gt('depart_date', now)
        .lte('depart_date', week)
    }

    const { data: trips } = await tripQuery
    const activeIds = new Set((trips || []).map(t => t.user_id))
    travellers = travellers.filter(t => activeIds.has(t.id))
  }

  if (!travellers.length) {
    return res.json({ ok: true, sent: 0, recipient_count: 0, message: 'No matching recipients found' })
  }

  const html         = buildEmail({ subject, message, severity, senderName: sender.full_name || sender.email, orgName: org?.name })
  const fullSubject  = `${SEV_EMOJI[severity] || '📢'} [${severity}] ${subject}`
  const smsBody      = `S360 BROADCAST [${severity}]: ${subject}\n\n${message.substring(0, 120)}${message.length > 120 ? '…' : ''}\n\nOpen: ${APP_URL}`
  const waBody       = `*Safeguard 360 Broadcast [${severity}]*\n\n*${subject}*\n\n${message}\n\nOpen: ${APP_URL}`

  const sends = []
  for (const t of travellers) {
    if (t.email)    sends.push(sendEmail(t.email, fullSubject, html).catch(() => false))
    if (t.phone)    sends.push(sendSms(t.phone, smsBody).catch(() => false))
    if (t.whatsapp) sends.push(sendWhatsApp(t.whatsapp, waBody).catch(() => false))
  }

  const results = await Promise.allSettled(sends)
  const sent    = results.filter(r => r.status === 'fulfilled' && r.value).length

  // Log broadcast
  try {
    await sb.from('crisis_broadcasts').insert({
      org_id:           org_id || null,
      sent_by:          user.id,
      subject,
      message,
      severity,
      recipients_filter: recipients,
      recipient_count:  travellers.length,
      sent_at:          new Date().toISOString(),
    })
  } catch {}

  console.log(`[crisis-broadcast] Sent ${sent} notifications to ${travellers.length} travellers (${severity})`)
  return res.json({ ok: true, sent, recipient_count: travellers.length })
}

export const handler = adapt(_handler)
export default handler
