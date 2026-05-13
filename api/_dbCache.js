/**
 * _dbCache.js
 * Supabase-backed key/value cache — survives Lambda cold starts.
 *
 * Requires this table in Supabase (run once in SQL editor):
 *
 *   create table if not exists public.api_cache (
 *     key        text primary key,
 *     value      jsonb not null,
 *     expires_at timestamptz not null,
 *     created_at timestamptz not null default now()
 *   );
 *   alter table public.api_cache enable row level security;
 *   create policy "Service role full access" on public.api_cache
 *     using (true) with check (true);
 *   create index if not exists idx_api_cache_expires on public.api_cache (expires_at);
 *
 * Usage:
 *   import { dbCacheGet, dbCacheSet } from './_dbCache.js'
 *   const hit = await dbCacheGet('country-risk:kenya')
 *   if (hit) return res.json(hit)
 *   // ... compute result ...
 *   await dbCacheSet('country-risk:kenya', result, 3600000) // 1 hour TTL
 */

import { getSupabaseAdmin } from './_supabase.js'

/**
 * Retrieve a cached value. Returns null on miss, expiry, or error.
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export async function dbCacheGet(key) {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('api_cache')
      .select('value, expires_at')
      .eq('key', key)
      .gt('expires_at', new Date().toISOString())
      .single()
    return data?.value ?? null
  } catch {
    return null  // fail open — treat as cache miss
  }
}

/**
 * Store a value in the cache.
 * @param {string} key
 * @param {any}    value      — must be JSON-serialisable
 * @param {number} ttlMs      — TTL in milliseconds
 */
export async function dbCacheSet(key, value, ttlMs = 3_600_000) {
  try {
    const sb = getSupabaseAdmin()
    const expires_at = new Date(Date.now() + ttlMs).toISOString()
    await sb
      .from('api_cache')
      .upsert({ key, value, expires_at, created_at: new Date().toISOString() }, { onConflict: 'key' })
  } catch (e) {
    console.warn('[dbCache] set failed (non-fatal):', e.message)
  }
}

/**
 * Evict expired entries (call occasionally from a cron to keep the table tidy).
 * Non-blocking fire-and-forget — safe to call without awaiting.
 */
export function dbCacheEvict() {
  try {
    const sb = getSupabaseAdmin()
    sb.from('api_cache').delete().lt('expires_at', new Date().toISOString())
      .then(() => {}).catch(() => {})
  } catch {}
}
