/**
 * /api/audit-log
 * Append-only audit log writer. Only authenticated users may write.
 * Uses service role so logs cannot be tampered with from the client.
 */
import { createClient } from '@supabase/supabase-js'
import { adapt } from './_adapter.js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

async function _handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: prof } = await supabaseAdmin
    .from('profiles')
    .select('role, org_id, email')
    .eq('id', user.id)
    .single()

  const { action, entity_type, entity_id, entity_org_id, description, metadata } = req.body
  if (!action) return res.status(400).json({ error: 'action required' })

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null
  const ua = req.headers['user-agent'] || null

  const { error } = await supabaseAdmin.from('audit_logs').insert({
    actor_id:      user.id,
    actor_email:   prof?.email || user.email,
    actor_role:    prof?.role  || null,
    actor_org_id:  prof?.org_id || null,
    action,
    entity_type:   entity_type  || null,
    entity_id:     entity_id    ? String(entity_id) : null,
    entity_org_id: entity_org_id || null,
    description:   description   || null,
    metadata:      metadata      || {},
    ip_address:    ip,
    user_agent:    ua,
  })

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
}

export const handler = adapt(_handler)
export default handler
