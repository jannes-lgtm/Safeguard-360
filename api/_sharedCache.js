/**
 * _sharedCache.js — Distributed shared cache
 *
 * Drop-in replacement for _cacheManager.js that adds Redis (Upstash) as a
 * shared backend across all Vercel function instances.
 *
 * WHY THIS EXISTS:
 *   _cacheManager.js uses an in-process Map. On Vercel, each serverless
 *   function invocation may land on a different cold instance, making the
 *   cache useless under real load. intelligence synthesis, CAIRO context
 *   assembly, country risk reports, and SOP retrieval all pay the full
 *   compute cost on every cold instance start.
 *
 * BACKEND SELECTION (automatic):
 *   Redis available (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set):
 *     → Uses Upstash Redis REST API. Shared across all instances. TTL enforced.
 *   Redis not available:
 *     → Falls back to in-process Map (same behaviour as _cacheManager.js).
 *        Useful for local dev and as a warm-instance cache even when Redis exists.
 *
 * MIGRATION PATH from _cacheManager.js:
 *   1. Import this file instead:
 *      - OLD: import { cache } from './_cacheManager.js'
 *      - NEW: import { sharedCache as cache } from './_sharedCache.js'
 *   2. API is identical: cache.get(key) / cache.set(key, data, ttlMs)
 *   3. Files to migrate (priority order — highest cache value first):
 *      a. api/country-risk.js          (country risk synthesis — expensive AI call)
 *      b. api/cairo-context.js         (CAIRO context assembly — 5+ Supabase queries)
 *      c. api/country-risk-summary.js  (lightweight but called very frequently)
 *      d. api/destination-feed.js      (RSS parsing — repeat fetches are wasteful)
 *      e. api/intel-health.js          (health check — no need to recompute each req)
 *      f. api/journey-agent.js         (SOP + KB retrieval — heavy embedding lookups)
 *
 * CACHE KEY NAMESPACING CONVENTION:
 *   Use colon-separated prefixes to allow invalidatePrefix() to work:
 *   'country-risk:{countryCode}'
 *   'cairo-ctx:{userId}'
 *   'sop:{queryHash}'
 *   'rss:{feedUrl}'
 *   'kb:{queryHash}'
 *
 * USAGE EXAMPLE:
 *   import { sharedCache } from './_sharedCache.js'
 *
 *   const cacheKey = `country-risk:${countryCode}`
 *   const cached = await sharedCache.get(cacheKey)
 *   if (cached) return res.json(cached)
 *
 *   const result = await expensiveComputation()
 *   await sharedCache.set(cacheKey, result, 60 * 60 * 1000) // 1 hour TTL
 *   return res.json(result)
 */

// ── Redis client (lazy, singleton) ───────────────────────────────────────────

let _redis   = null
let _checked = false

async function getRedis() {
  if (_checked) return _redis

  const redisUrl   = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

  _checked = true

  if (!redisUrl || !redisToken) {
    return (_redis = null)
  }

  try {
    const { Redis } = await import('@upstash/redis')
    _redis = new Redis({ url: redisUrl, token: redisToken })
    console.log('[sharedCache] Redis backend active')
    return _redis
  } catch (e) {
    console.warn('[sharedCache] @upstash/redis unavailable, using in-memory fallback:', e.message)
    return (_redis = null)
  }
}

// ── In-memory fallback ────────────────────────────────────────────────────────

const _mem = new Map()

function memGet(key) {
  const entry = _mem.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > entry.ttl) { _mem.delete(key); return null }
  return entry.data
}

function memSet(key, data, ttlMs) {
  _mem.set(key, { data, ts: Date.now(), ttl: ttlMs })
}

function memDelete(key) {
  _mem.delete(key)
}

function memInvalidatePrefix(prefix) {
  for (const k of _mem.keys()) {
    if (k.startsWith(prefix)) _mem.delete(k)
  }
}

// ── Redis operations ──────────────────────────────────────────────────────────

const REDIS_KEY_PREFIX = 'sg360:'  // namespace to avoid collision with other apps

async function redisGet(redis, key) {
  try {
    const raw = await redis.get(REDIS_KEY_PREFIX + key)
    if (raw === null || raw === undefined) return null
    // Upstash returns parsed JSON automatically when stored as object
    return raw
  } catch (e) {
    console.warn('[sharedCache] Redis GET failed, falling back to memory:', e.message)
    return memGet(key)
  }
}

async function redisSet(redis, key, data, ttlMs) {
  try {
    const ttlSec = Math.ceil(ttlMs / 1000)
    await redis.set(REDIS_KEY_PREFIX + key, data, { ex: ttlSec })
    // Also write to in-memory as a warm L1 cache for the same instance
    memSet(key, data, ttlMs)
  } catch (e) {
    console.warn('[sharedCache] Redis SET failed, writing to memory only:', e.message)
    memSet(key, data, ttlMs)
  }
}

async function redisDelete(redis, key) {
  try {
    await redis.del(REDIS_KEY_PREFIX + key)
  } catch {}
  memDelete(key)
}

async function redisInvalidatePrefix(redis, prefix) {
  try {
    // Upstash supports SCAN — use it to find matching keys
    const pattern = `${REDIS_KEY_PREFIX}${prefix}*`
    let cursor = 0
    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 })
      cursor = Number(nextCursor)
      if (keys.length > 0) {
        await redis.del(...keys)
      }
    } while (cursor !== 0)
  } catch (e) {
    console.warn('[sharedCache] Redis invalidatePrefix failed:', e.message)
  }
  memInvalidatePrefix(prefix)
}

// ── Public API ────────────────────────────────────────────────────────────────

export const sharedCache = {
  /**
   * Get a cached value. Returns null on miss or expiry.
   * Async (Redis) or sync fallback (memory).
   */
  async get(key) {
    const redis = await getRedis()
    if (redis) return redisGet(redis, key)
    return memGet(key)
  },

  /**
   * Set a cached value with TTL in milliseconds.
   */
  async set(key, data, ttlMs) {
    const redis = await getRedis()
    if (redis) return redisSet(redis, key, data, ttlMs)
    return memSet(key, data, ttlMs)
  },

  /**
   * Returns true if the key exists and has not expired.
   */
  async has(key) {
    const val = await this.get(key)
    return val !== null
  },

  /**
   * Delete a specific key.
   */
  async delete(key) {
    const redis = await getRedis()
    if (redis) return redisDelete(redis, key)
    return memDelete(key)
  },

  /**
   * Invalidate all keys that start with `prefix`.
   * Example: sharedCache.invalidatePrefix('country-risk:')
   */
  async invalidatePrefix(prefix) {
    const redis = await getRedis()
    if (redis) return redisInvalidatePrefix(redis, prefix)
    return memInvalidatePrefix(prefix)
  },

  /**
   * Returns the in-memory map size (approximate — Redis size not counted).
   */
  size() {
    return _mem.size
  },

  /**
   * Returns 'redis' | 'memory' to indicate which backend is active.
   * Useful for health checks and telemetry.
   */
  async backend() {
    const redis = await getRedis()
    return redis ? 'redis' : 'memory'
  },

  /**
   * Attempt to acquire a distributed lock.
   * Returns true if the lock was acquired, false if another holder already has it.
   *
   * Uses Redis SET NX EX (atomic) when Redis is available.
   * Falls back to in-memory check-then-set (non-atomic, acceptable for low-concurrency).
   *
   * @param {string} key    — lock name (no namespace prefix needed — added internally)
   * @param {number} ttlMs  — lock TTL in milliseconds (auto-released after this)
   */
  async tryLock(key, ttlMs) {
    const redis = await getRedis()
    if (redis) {
      try {
        const ttlSec = Math.ceil(ttlMs / 1000)
        const result = await redis.set(REDIS_KEY_PREFIX + key, '1', { nx: true, ex: ttlSec })
        return result === 'OK'
      } catch (e) {
        console.warn('[sharedCache] tryLock Redis failed — allowing through:', e.message)
        return true  // fail open: allow the run rather than permanently blocking
      }
    }
    // In-memory fallback: best-effort (not atomic, but acceptable for rare overlaps)
    if (memGet(key) !== null) return false
    memSet(key, '1', ttlMs)
    return true
  },

  /**
   * Release a lock acquired via tryLock.
   * Safe to call even if the lock has already expired.
   */
  async releaseLock(key) {
    const redis = await getRedis()
    if (redis) {
      try { await redis.del(REDIS_KEY_PREFIX + key) } catch {}
    }
    memDelete(key)
  },
}

// ── Test seam (never called in production) ────────────────────────────────────
// Allows tests to inject a mock Redis client without relying on dynamic-import
// interception (which is unreliable for imports inside async functions).
// Usage: import { __setRedisForTest, __resetRedisForTest } from './_sharedCache.js'

export function __setRedisForTest(mockClient) {
  _redis   = mockClient
  _checked = true
}

export function __resetRedisForTest() {
  _redis   = null
  _checked = false
}

// ── Cache TTL constants ───────────────────────────────────────────────────────
// Centralised TTL values prevent drift across files.
// Reference these instead of hardcoding magic numbers.

export const CACHE_TTL = {
  COUNTRY_RISK:        3   * 60 * 60 * 1000,  //  3 hours — country risk synthesis (warmup every 30m/2h)
  CAIRO_CONTEXT:       5   * 60 * 1000,   //  5 min   — context assembly (operational state changes)
  COUNTRY_SUMMARY:     30  * 60 * 1000,   // 30 min   — lightweight country summaries
  RSS_FEED:            15  * 60 * 1000,   // 15 min   — RSS feed results
  KB_RETRIEVAL:        30  * 60 * 1000,   // 30 min   — knowledge base vector search
  SOP_RETRIEVAL:       60  * 60 * 1000,   //  1 hour  — SOP lookup (rarely changes)
  INTEL_HEALTH:        2   * 60 * 1000,   //  2 min   — health check results
  FLIGHT_STATUS:       5   * 60 * 1000,   //  5 min   — flight data (changes frequently)
  FACILITIES:          24  * 60 * 60 * 1000, // 24 hours — facilities/hospitals (rarely changes)
}
