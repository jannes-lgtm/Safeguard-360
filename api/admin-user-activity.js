/**
 * api/admin-user-activity.js
 *
 * GET /api/admin-user-activity
 *
 * Returns last_sign_in_at and created_at from auth.users for all users.
 * Used by AdminControlCenter to show login activity without touching
 * any user-facing auth flows or platform behaviour.
 *
 * Requires: developer / admin role
 * Uses: Supabase service role (read-only on auth.users)
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth check — developer/admin only ───────────────────────────────────────
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user: actor }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !actor) return res.status(401).json({ error: 'Invalid token' })

  const { data: actorProf } = await supabaseAdmin
    .from('profiles').select('role').eq('id', actor.id).maybeSingle()
  if (!['admin', 'developer', 'org_admin'].includes(actorProf?.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' })
  }

  // ── Pull auth.users via admin API (paginated) ───────────────────────────────
  try {
    const activity = {}
    let page = 1
    const perPage = 1000

    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      })

      if (error) {
        console.error('[admin-user-activity] listUsers error:', error.message)
        return res.status(500).json({ error: error.message })
      }

      for (const u of data.users || []) {
        activity[u.id] = {
          last_sign_in_at: u.last_sign_in_at || null,
          confirmed_at:    u.confirmed_at    || null,
          email_confirmed: !!u.email_confirmed_at,
        }
      }

      // Supabase returns fewer than perPage on last page
      if ((data.users || []).length < perPage) break
      page++
    }

    return res.status(200).json({ activity })
  } catch (err) {
    console.error('[admin-user-activity]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
