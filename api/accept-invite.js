/**
 * /api/accept-invite
 *
 * GET  ?token=xxx  — public, returns { org_id, org_name, email, role } for the signup form
 * POST body: { token } — marks invite as accepted; no auth needed (token IS the proof)
 *
 * Required env vars:
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}

async function sbGet(baseUrl, key, table, qs) {
  const url = `${baseUrl}/rest/v1/${table}?${new URLSearchParams(qs)}`
  const r = await fetch(url, { headers: sbHeaders(key) })
  if (!r.ok) throw new Error(`Supabase GET ${table} → ${r.status}`)
  return r.json()
}

async function sbPatch(baseUrl, key, table, qs, patch) {
  const url = `${baseUrl}/rest/v1/${table}?${new URLSearchParams(qs)}`
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { ...sbHeaders(key), Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`Supabase PATCH ${table} → ${r.status}: ${t}`)
  }
  return r.json()
}

async function _handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase env vars' })
  }

  // ── GET — look up invite by token (no auth required) ─────────────────────
  if (req.method === 'GET') {
    const token = req.query?.token
    if (!token) return res.status(400).json({ error: 'token is required' })

    const invites = await sbGet(SUPABASE_URL, SERVICE_KEY, 'org_invites', {
      token: `eq.${token}`, select: 'id,org_id,org_name,email,role,accepted_at,expires_at', limit: 1,
    })

    const invite = invites[0]
    if (!invite) return res.status(404).json({ error: 'Invite not found or already used' })
    if (invite.accepted_at) return res.status(410).json({ error: 'This invite has already been accepted' })
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This invite has expired. Ask your admin to resend it.' })
    }

    return res.status(200).json({
      org_id:   invite.org_id,
      org_name: invite.org_name,
      email:    invite.email,
      role:     invite.role,
    })
  }

  // ── POST — mark invite accepted ───────────────────────────────────────────
  if (req.method === 'POST') {
    const { token } = req.body || {}
    if (!token) return res.status(400).json({ error: 'token is required' })

    const invites = await sbGet(SUPABASE_URL, SERVICE_KEY, 'org_invites', {
      token: `eq.${token}`, select: 'id,accepted_at,expires_at', limit: 1,
    })

    const invite = invites[0]
    if (!invite) return res.status(404).json({ error: 'Invite not found' })
    if (invite.accepted_at) return res.status(200).json({ ok: true, already_accepted: true })

    await sbPatch(SUPABASE_URL, SERVICE_KEY, 'org_invites', { token: `eq.${token}` }, {
      accepted_at: new Date().toISOString(),
    })

    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default _handler
