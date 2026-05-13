/**
 * _rateLimit.js
 * In-memory sliding-window rate limiter for serverless functions.
 *
 * Resets on cold start — intentional tradeoff.
 * Fast (no DB round-trip), good enough to stop burst abuse within a warm instance.
 * Upgrade to Upstash Redis for multi-instance precision if needed.
 *
 * Usage:
 *   import { checkRateLimit } from './_rateLimit.js'
 *   const { allowed } = checkRateLimit(req, { max: 30, windowMs: 3600000 })
 *   if (!allowed) return res.status(429).json({ error: 'Rate limit exceeded' })
 */

import crypto from 'crypto'

// key → array of request timestamps (epoch ms)
const _hits = new Map()

/**
 * @param {object} req        — Express/Vercel request
 * @param {string} [endpoint] — optional endpoint label (allows per-endpoint limits per key)
 * @param {object} opts
 * @param {number} opts.max       — max requests in the window (default 30)
 * @param {number} opts.windowMs  — sliding window size in ms (default 1 hour)
 * @returns {{ allowed: boolean, remaining: number, key: string }}
 */
export function checkRateLimit(req, endpoint = 'default', { max = 30, windowMs = 3_600_000 } = {}) {
  // Derive a stable key: hash of auth token (bound to session) or client IP
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

  const key  = `${rawKey}:${endpoint}`
  const now  = Date.now()
  const edge = now - windowMs

  const prev = (_hits.get(key) || []).filter(t => t > edge)

  if (prev.length >= max) {
    return { allowed: false, remaining: 0, key }
  }

  prev.push(now)
  _hits.set(key, prev)

  // Garbage-collect when cache grows large (prevents memory leak on high-traffic instances)
  if (_hits.size > 5_000) {
    for (const [k, ts] of _hits) {
      const trimmed = ts.filter(t => t > edge)
      if (trimmed.length === 0) _hits.delete(k)
      else _hits.set(k, trimmed)
    }
  }

  return { allowed: true, remaining: max - prev.length, key }
}
