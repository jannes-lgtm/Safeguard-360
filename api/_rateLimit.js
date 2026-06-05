/**
 * _rateLimit.js
 *
 * Distributed sliding-window rate limiter backed by Upstash Redis.
 * Falls back to in-memory when Redis env vars are absent (local dev / misconfigured).
 *
 * Upstash setup:
 *   1. Create a free Redis database at https://console.upstash.com
 *   2. Copy the REST URL and token from the database dashboard
 *   3. Add to Vercel env vars:
 *        UPSTASH_REDIS_REST_URL   = https://...upstash.io
 *        UPSTASH_REDIS_REST_TOKEN = ...
 *
 * Usage (unchanged from previous version — callers just need to await):
 *   import { checkRateLimit } from './_rateLimit.js'
 *   const { allowed } = await checkRateLimit(req, 'country-risk', { max: 60, windowMs: 3_600_000 })
 *   if (!allowed) return res.status(429).json({ error: 'Rate limit exceeded' })
 */

import crypto from 'crypto'

// ── Redis client (lazy-initialised) ──────────────────────────────────────────

let _redis   = null
let _useRedis = null   // null = not yet checked; true/false after first call

async function getRedis() {
  if (_useRedis === false) return null
  if (_redis) return _redis

  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    _useRedis = false
    console.warn('[rateLimit] Upstash env vars missing — falling back to in-memory limiter')
    return null
  }

  try {
    const { Redis } = await import('@upstash/redis')
    _redis    = new Redis({ url, token })
    _useRedis = true
    return _redis
  } catch (e) {
    _useRedis = false
    console.warn('[rateLimit] @upstash/redis import failed — falling back to in-memory:', e.message)
    return null
  }
}

// ── In-memory fallback (single-instance only) ─────────────────────────────────

const _hits = new Map()

function checkInMemory(key, max, windowMs) {
  const now  = Date.now()
  const edge = now - windowMs
  const prev = (_hits.get(key) || []).filter(t => t > edge)

  if (prev.length >= max) return { allowed: false, remaining: 0 }

  prev.push(now)
  _hits.set(key, prev)

  // GC when the map grows large
  if (_hits.size > 5_000) {
    for (const [k, ts] of _hits) {
      const trimmed = ts.filter(t => t > edge)
      if (trimmed.length === 0) _hits.delete(k)
      else _hits.set(k, trimmed)
    }
  }

  return { allowed: true, remaining: max - prev.length }
}

// ── Redis sliding-window via sorted set ───────────────────────────────────────
// Uses ZADD + ZREMRANGEBYSCORE + ZCARD in a pipeline — atomic, O(log N).

async function checkRedis(redis, key, max, windowMs) {
  const now     = Date.now()
  const edge    = now - windowMs
  const redisKey = `rl:${key}`

  try {
    // Lua script for atomic sliding-window check (avoids race conditions)
    const script = `
      local key   = KEYS[1]
      local now   = tonumber(ARGV[1])
      local edge  = tonumber(ARGV[2])
      local max   = tonumber(ARGV[3])
      local ttlMs = tonumber(ARGV[4])

      redis.call('ZREMRANGEBYSCORE', key, '-inf', edge)
      local count = redis.call('ZCARD', key)

      if count >= max then
        return {0, 0}
      end

      redis.call('ZADD', key, now, now .. ':' .. math.random(1, 999999))
      redis.call('PEXPIRE', key, ttlMs)

      return {1, max - count - 1}
    `

    const result = await redis.eval(script, [redisKey], [now, edge, max, windowMs])
    return {
      allowed:   result[0] === 1,
      remaining: Math.max(0, result[1]),
    }
  } catch (e) {
    console.warn('[rateLimit] Redis check failed, allowing request:', e.message)
    return { allowed: true, remaining: max }  // fail open
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {object} req         — Express/Vercel request
 * @param {string} endpoint    — endpoint label for per-route limits
 * @param {object} opts
 * @param {number} opts.max       — max requests in the window (default 30)
 * @param {number} opts.windowMs  — sliding window size in ms (default 1 hour)
 * @returns {Promise<{ allowed: boolean, remaining: number, key: string }>}
 */
export async function checkRateLimit(req, endpoint = 'default', { max = 30, windowMs = 3_600_000 } = {}) {
  // Derive a stable identifier: hashed auth token (session-bound) or client IP
  let rawKey
  const authHeader = (req.headers?.['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (authHeader) {
    rawKey = crypto.createHash('sha256').update(authHeader).digest('hex').slice(0, 24)
  } else {
    rawKey = (
      req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown'
    )
  }

  const key   = `${rawKey}:${endpoint}`
  const redis = await getRedis()

  const result = redis
    ? await checkRedis(redis, key, max, windowMs)
    : checkInMemory(key, max, windowMs)

  return { ...result, key }
}
