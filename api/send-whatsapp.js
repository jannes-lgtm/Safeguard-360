/**
 * POST /api/send-whatsapp
 *
 * Send a WhatsApp message to an individual traveller.
 * Caller must be an org_admin within the same organisation as the target,
 * or a platform admin (role = 'admin').
 *
 * Body: { userId: string, message: string }
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID    — Twilio account SID (AC...)
 *   TWILIO_AUTH_TOKEN     — Twilio auth token
 *   TWILIO_WHATSAPP_FROM  — WhatsApp-enabled sender, e.g. whatsapp:+14155238886
 */

import { adapt }        from './_adapter.js'
import { sendWhatsApp } from './_notify.js'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL  || ''
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function _handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get?.('authorization') || req.headers['authorization'] || ''
  const token      = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  const sb     = createClient(SUPABASE_URL, SERVICE_KEY)
  const anonSb = createClient(
    SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  )

  const { data: { user }, error: authErr } = await anonSb.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorised' })

  // Load caller profile
  const { data: caller } = await sb
    .from('profiles')
    .select('id, role, org_id')
    .eq('id', user.id)
    .single()

  if (!caller) return res.status(401).json({ error: 'Profile not found' })

  const isAdmin    = caller.role === 'admin'
  const isOrgAdmin = caller.role === 'org_admin'
  if (!isAdmin && !isOrgAdmin) {
    return res.status(403).json({ error: 'Insufficient permissions — org_admin required' })
  }

  // ── Validate body ────────────────────────────────────────────────────────
  let body
  try { body = await req.json() } catch { return res.status(400).json({ error: 'Invalid JSON body' }) }

  const { userId, message } = body || {}
  if (!userId)              return res.status(400).json({ error: 'userId is required' })
  if (!message?.trim())     return res.status(400).json({ error: 'message is required' })
  if (message.length > 1600) return res.status(400).json({ error: 'Message too long (max 1600 chars)' })

  // ── Load target traveller ────────────────────────────────────────────────
  const { data: target } = await sb
    .from('profiles')
    .select('id, full_name, email, whatsapp_number, org_id, role')
    .eq('id', userId)
    .single()

  if (!target) return res.status(404).json({ error: 'Traveller not found' })

  // Org admins can only message travellers in their own org
  if (isOrgAdmin && target.org_id !== caller.org_id) {
    return res.status(403).json({ error: 'Cannot message travellers outside your organisation' })
  }

  if (!target.whatsapp_number) {
    return res.status(422).json({
      error: 'This traveller has no WhatsApp number on their profile',
      name: target.full_name || target.email,
    })
  }

  // ── Send ─────────────────────────────────────────────────────────────────
  const sent = await sendWhatsApp(
    target.whatsapp_number,
    `*SafeGuard 360*\n\n${message.trim()}`
  )

  if (!sent) {
    return res.status(502).json({ error: 'WhatsApp delivery failed — check Twilio credentials' })
  }

  // ── Log to audit trail ───────────────────────────────────────────────────
  sb.from('audit_logs').insert({
    actor_id:   caller.id,
    action:     'whatsapp_sent',
    target_id:  target.id,
    metadata:   { message_preview: message.slice(0, 120), channel: 'whatsapp' },
    created_at: new Date().toISOString(),
  }).catch(() => {})

  console.log(`[send-whatsapp] ${caller.id} → ${target.id} (${target.whatsapp_number.slice(0, 6)}***)`)

  return res.status(200).json({
    ok:   true,
    sent: true,
    to:   target.full_name || target.email,
  })
}

export const handler = adapt(_handler)
export default handler
