/**
 * POST /api/invite-user
 *
 * Creates an invite record for a new user and sends them an email.
 * Auth: Bearer <supabase-jwt> — caller must be org_admin or admin.
 *
 * Body: { email, role?, org_id? }
 *   role     defaults to 'traveller'
 *   org_id   defaults to the caller's own org_id
 *
 * Required env vars:
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY
 *   RESEND_API_KEY
 *   RESEND_FROM_EMAIL
 */

import { sendEmail } from './_notify.js'

const SITE_URL = 'https://www.risk360.co'

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}

async function sbGet(baseUrl, key, table, qs) {
  const url = `${baseUrl}/rest/v1/${table}?${new URLSearchParams(qs)}`
  const res = await fetch(url, { headers: sbHeaders(key) })
  if (!res.ok) throw new Error(`Supabase GET ${table} → ${res.status}`)
  return res.json()
}

async function sbInsert(baseUrl, key, table, row) {
  const res = await fetch(`${baseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders(key), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Supabase INSERT ${table} → ${res.status}: ${t}`)
  }
  const data = await res.json()
  return Array.isArray(data) ? data[0] : data
}

async function _handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const ANON_KEY     = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase env vars' })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' })

  let caller
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    })
    if (!r.ok) throw new Error('auth failed')
    caller = await r.json()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // ── Load caller profile ───────────────────────────────────────────────────
  const [callerProfile] = await sbGet(SUPABASE_URL, SERVICE_KEY, 'profiles', {
    id: `eq.${caller.id}`, select: 'role,org_id', limit: 1,
  })
  if (!callerProfile) return res.status(403).json({ error: 'Profile not found' })
  if (!['admin', 'developer', 'org_admin'].includes(callerProfile.role)) {
    return res.status(403).json({ error: 'Only admins can send invites' })
  }

  // ── Validate body ─────────────────────────────────────────────────────────
  const body  = req.body || {}
  const email = (body.email || '').trim().toLowerCase()
  const role  = body.role || 'traveller'
  const orgId = body.org_id || callerProfile.org_id

  if (!email) return res.status(400).json({ error: 'email is required' })
  if (!orgId) return res.status(400).json({ error: 'org_id is required' })
  if (!['org_admin', 'traveller'].includes(role)) {
    return res.status(400).json({ error: 'role must be org_admin or traveller' })
  }

  // ── Load org name ─────────────────────────────────────────────────────────
  const [org] = await sbGet(SUPABASE_URL, SERVICE_KEY, 'organisations', {
    id: `eq.${orgId}`, select: 'name', limit: 1,
  })
  if (!org) return res.status(404).json({ error: 'Organisation not found' })

  // ── Check for existing active invite ─────────────────────────────────────
  const existing = await sbGet(SUPABASE_URL, SERVICE_KEY, 'org_invites', {
    email: `eq.${email}`, org_id: `eq.${orgId}`,
    accepted_at: 'is.null', expires_at: `gte.${new Date().toISOString()}`,
    select: 'id,token', limit: 1,
  })
  let invite
  if (existing.length) {
    invite = existing[0]
  } else {
    invite = await sbInsert(SUPABASE_URL, SERVICE_KEY, 'org_invites', {
      org_id:     orgId,
      org_name:   org.name,
      email,
      role,
      invited_by: caller.id,
    })
  }

  // ── Send invite email ─────────────────────────────────────────────────────
  const inviteUrl = `${SITE_URL}/signup?token=${invite.token}`

  const html = `<!DOCTYPE html>
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
    <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">You've been invited to join ${org.name}</h2>
    <p style="margin:0 0 24px;font-size:13px;color:#6b7280;line-height:1.6;">
      You've been invited to join <strong>${org.name}</strong> on Safeguard 360 as a
      <strong>${role === 'org_admin' ? 'Company Administrator' : 'Traveller'}</strong>.
      Click the button below to set up your account.
    </p>
    <a href="${inviteUrl}"
      style="display:inline-block;background:#AACC00;color:#0118A1;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;">
      Accept Invite →
    </a>
    <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;">
      This invite expires in 7 days. If you didn't expect this email, you can safely ignore it.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

  // ── Primary: Supabase auth invite (uses project's own SMTP — always works) ─
  let emailSent = false
  try {
    const supabaseInviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        apikey:          SERVICE_KEY,
        Authorization:   `Bearer ${SERVICE_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        email,
        data: { org_id: orgId, role, org_name: org.name },
        redirect_to: inviteUrl,
      }),
    })
    if (supabaseInviteRes.ok) {
      emailSent = true
    } else {
      const errText = await supabaseInviteRes.text()
      console.warn('[invite-user] Supabase invite API failed:', errText)
    }
  } catch (e) {
    console.warn('[invite-user] Supabase invite error:', e.message)
  }

  // ── Secondary: Resend styled email (if configured) ───────────────────────
  if (!emailSent) {
    emailSent = await sendEmail(email, `You're invited to join ${org.name} on Safeguard 360`, html)
  }

  return res.status(200).json({
    ok:         true,
    invite_id:  invite.id,
    email_sent: emailSent,
    invite_url: inviteUrl,
  })
}

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default _handler
