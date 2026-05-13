/**
 * api/_supabase.js
 * Lazy Supabase admin client — initialised on first call, not at module load.
 * Prevents cold-start crashes when env vars are momentarily unavailable.
 */
import { createClient } from '@supabase/supabase-js'

let _client = null

export function getSupabaseAdmin() {
  if (_client) return _client
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(`Supabase not configured — url=${!!url} serviceKey=${!!key}. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to Vercel env vars.`)
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

export function getSupabaseAnon() {
  const url  = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Supabase anon key not configured')
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Verify a Supabase JWT and confirm the user has admin or developer role.
 * Returns { ok: true, userId } on success, { ok: false, status, error } on failure.
 * Used by privileged endpoints (ops-analyze, chaos-test) as an alternative to CRON_SECRET
 * so the dashboard can invoke them with the user's session token.
 */
export async function verifyAdminJwt(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Missing Bearer token' }
  const token = authHeader.slice(7)
  try {
    const sb = getSupabaseAdmin()
    const { data: { user }, error } = await sb.auth.getUser(token)
    if (error || !user) return { ok: false, status: 401, error: 'Invalid or expired token' }
    const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'developer'].includes(profile.role)) {
      return { ok: false, status: 403, error: 'Insufficient role — admin or developer required' }
    }
    return { ok: true, userId: user.id, role: profile.role }
  } catch (e) {
    return { ok: false, status: 500, error: e.message }
  }
}
