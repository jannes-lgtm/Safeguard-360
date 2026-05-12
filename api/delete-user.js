import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Verify caller is authenticated admin
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user: actor }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !actor) return res.status(401).json({ error: 'Invalid token' })

  const { data: actorProf } = await supabaseAdmin
    .from('profiles').select('role, org_id, email').eq('id', actor.id).single()
  if (!['admin', 'developer', 'org_admin'].includes(actorProf?.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' })
  }

  const { user_id } = req.body
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' })

  // Snapshot the target profile before deletion
  const { data: targetProf } = await supabaseAdmin
    .from('profiles').select('full_name, email, role, org_id').eq('id', user_id).single()

  try {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    })

    if (!authRes.ok) {
      const err = await authRes.json().catch(() => ({}))
      return res.status(authRes.status).json({ error: err.message || 'Failed to delete user' })
    }

    // Log after successful deletion
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null
    await supabaseAdmin.from('audit_logs').insert({
      actor_id:      actor.id,
      actor_email:   actorProf?.email || actor.email,
      actor_role:    actorProf?.role,
      actor_org_id:  actorProf?.org_id || null,
      action:        'user.deleted',
      entity_type:   'user',
      entity_id:     user_id,
      entity_org_id: targetProf?.org_id || null,
      description:   `User "${targetProf?.full_name || targetProf?.email || user_id}" deleted`,
      metadata:      { deleted_email: targetProf?.email, deleted_role: targetProf?.role, deleted_org_id: targetProf?.org_id },
      ip_address:    ip,
      user_agent:    req.headers['user-agent'] || null,
    })

    return res.status(200).json({ deleted: true })
  } catch (err) {
    console.error('[delete-user]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
