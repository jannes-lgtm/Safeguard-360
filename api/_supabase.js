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
