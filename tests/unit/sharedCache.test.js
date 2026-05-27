/**
 * tests/unit/sharedCache.test.js
 *
 * Priority 4 — cache consistency, TTL, invalidatePrefix, backend switching.
 * Tests both the memory fallback (default) and the Redis path (mocked).
 *
 * The _sharedCache module holds module-level singletons (_redis, _checked).
 * Tests that require switching between backends call vi.resetModules() and
 * reimport to get a fresh module state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { delay } from '../helpers/index.js'
import { sharedCache, CACHE_TTL, __setRedisForTest, __resetRedisForTest } from '../../api/_sharedCache.js'

// ── Memory backend (no Redis injected) ───────────────────────────────────────

describe('sharedCache — memory backend', () => {
  beforeEach(() => {
    // Ensure memory backend (no Redis client)
    __resetRedisForTest()
  })

  afterEach(() => {
    __resetRedisForTest()
  })

  it('backend() returns "memory" when Redis is not configured', async () => {
    expect(await sharedCache.backend()).toBe('memory')
  })

  it('get returns null on cold miss', async () => {
    const result = await sharedCache.get('nonexistent:key')
    expect(result).toBeNull()
  })

  it('get returns stored value after set', async () => {
    const data = { risk: 'High', score: 72 }
    await sharedCache.set('test:get-set', data, 60_000)
    const result = await sharedCache.get('test:get-set')
    expect(result).toEqual(data)
  })

  it('set overwrites previous value for same key', async () => {
    await sharedCache.set('test:overwrite', { v: 1 }, 60_000)
    await sharedCache.set('test:overwrite', { v: 2 }, 60_000)
    expect(await sharedCache.get('test:overwrite')).toEqual({ v: 2 })
  })

  it('TTL expiry returns null after TTL elapses', async () => {
    await sharedCache.set('test:ttl', { x: 1 }, 10) // 10ms TTL
    await delay(30)
    expect(await sharedCache.get('test:ttl')).toBeNull()
  })

  it('has() returns true for live key', async () => {
    await sharedCache.set('test:has', { y: 2 }, 60_000)
    expect(await sharedCache.has('test:has')).toBe(true)
  })

  it('has() returns false for expired key', async () => {
    await sharedCache.set('test:has-expired', { y: 2 }, 10)
    await delay(30)
    expect(await sharedCache.has('test:has-expired')).toBe(false)
  })

  it('delete() removes the key', async () => {
    await sharedCache.set('test:delete', { z: 3 }, 60_000)
    await sharedCache.delete('test:delete')
    expect(await sharedCache.get('test:delete')).toBeNull()
  })

  it('delete() on nonexistent key does not throw', async () => {
    await expect(sharedCache.delete('test:missing')).resolves.not.toThrow()
  })

  it('invalidatePrefix removes all matching keys', async () => {
    await sharedCache.set('intel:lagos:travel_advisory', { a: 1 }, 60_000)
    await sharedCache.set('intel:lagos:exec_report',     { b: 2 }, 60_000)
    await sharedCache.set('intel:nairobi:general',       { c: 3 }, 60_000)

    await sharedCache.invalidatePrefix('intel:lagos:')

    expect(await sharedCache.get('intel:lagos:travel_advisory')).toBeNull()
    expect(await sharedCache.get('intel:lagos:exec_report')).toBeNull()
    // Non-matching key survives
    expect(await sharedCache.get('intel:nairobi:general')).toEqual({ c: 3 })
  })

  it('invalidatePrefix with no matching keys does not throw', async () => {
    await expect(sharedCache.invalidatePrefix('nomatches:')).resolves.not.toThrow()
  })

  it('stores complex nested objects and retrieves them correctly', async () => {
    const data = {
      formatted: 'context block',
      intelObjects: [{ id: 1, type: 'security' }],
      stats: { live_signals: 5, confidence_score: 60 },
    }
    await sharedCache.set('test:complex', data, 60_000)
    const result = await sharedCache.get('test:complex')
    expect(result).toEqual(data)
    // Memory backend stores by reference (expected behavior — no serialization overhead)
    // Redis backend would deserialize, producing a new reference
  })

  it('CACHE_TTL constants are all positive numbers', () => {
    for (const [key, val] of Object.entries(CACHE_TTL)) {
      expect(typeof val).toBe('number')
      expect(val).toBeGreaterThan(0)
    }
  })

  it('CACHE_TTL.COUNTRY_RISK is 1 hour', () => {
    expect(CACHE_TTL.COUNTRY_RISK).toBe(60 * 60 * 1000)
  })
})

// ── Redis backend (injected via test seam) ────────────────────────────────────
// Uses __setRedisForTest() to inject a mock Redis client, bypassing the
// dynamic import() inside getRedis() which vi.doMock cannot intercept.

describe('sharedCache — Redis backend', () => {
  let mockRedisInstance

  beforeEach(() => {
    mockRedisInstance = {
      get:  vi.fn(),
      set:  vi.fn().mockResolvedValue('OK'),
      del:  vi.fn().mockResolvedValue(1),
      scan: vi.fn().mockResolvedValue([0, []]),
    }
    __setRedisForTest(mockRedisInstance)
  })

  afterEach(() => {
    __resetRedisForTest()
  })

  it('backend() returns "redis" when a client is injected', async () => {
    expect(await sharedCache.backend()).toBe('redis')
  })

  it('calls redis.set with sg360: key prefix and ex TTL', async () => {
    await sharedCache.set('country-risk:nigeria', { level: 2 }, 3_600_000)

    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      'sg360:country-risk:nigeria',
      { level: 2 },
      { ex: 3600 },
    )
  })

  it('calls redis.get with sg360: key prefix', async () => {
    mockRedisInstance.get.mockResolvedValueOnce({ level: 2 })
    const result = await sharedCache.get('country-risk:nigeria')
    expect(mockRedisInstance.get).toHaveBeenCalledWith('sg360:country-risk:nigeria')
    expect(result).toEqual({ level: 2 })
  })

  it('returns null when Redis GET returns null', async () => {
    mockRedisInstance.get.mockResolvedValueOnce(null)
    const result = await sharedCache.get('country-risk:missing')
    expect(result).toBeNull()
  })

  it('falls back to memory (returns null) on Redis GET failure', async () => {
    mockRedisInstance.get.mockRejectedValueOnce(new Error('connection refused'))
    const result = await sharedCache.get('country-risk:redis-down')
    expect(result).toBeNull() // no in-memory entry — null, not a throw
  })

  it('does not throw on Redis SET failure — falls back to memory', async () => {
    mockRedisInstance.set.mockRejectedValueOnce(new Error('Redis write failed'))
    await expect(
      sharedCache.set('country-risk:write-fail', { x: 1 }, 60_000)
    ).resolves.not.toThrow()
  })

  it('calls redis.del with sg360: prefix on delete()', async () => {
    await sharedCache.delete('country-risk:nigeria')
    expect(mockRedisInstance.del).toHaveBeenCalledWith('sg360:country-risk:nigeria')
  })

  it('uses SCAN to enumerate keys for invalidatePrefix()', async () => {
    mockRedisInstance.scan
      .mockResolvedValueOnce([42, ['sg360:intel:lagos:a', 'sg360:intel:lagos:b']])
      .mockResolvedValueOnce([0, []])

    await sharedCache.invalidatePrefix('intel:lagos:')

    expect(mockRedisInstance.scan).toHaveBeenCalledWith(0, {
      match: 'sg360:intel:lagos:*',
      count: 100,
    })
    expect(mockRedisInstance.del).toHaveBeenCalledWith('sg360:intel:lagos:a', 'sg360:intel:lagos:b')
  })

  it('L1 memory is also populated after Redis set', async () => {
    await sharedCache.set('test:l1warm', { v: 42 }, 60_000)
    // Now break Redis — next get should still return value from L1 in-memory
    mockRedisInstance.get.mockRejectedValueOnce(new Error('connection lost'))
    const result = await sharedCache.get('test:l1warm')
    expect(result?.v).toBe(42)
  })
})

// ── Concurrent access (memory backend) ───────────────────────────────────────

describe('sharedCache — concurrent access', () => {
  beforeEach(() => { __resetRedisForTest() })
  afterEach(()  => { __resetRedisForTest() })

  it('concurrent reads during write return null or full data — never partial', async () => {
    const key  = 'test:concurrent'
    const data = { large: 'x'.repeat(1_000) }

    const writeP = sharedCache.set(key, data, 60_000)
    const readP  = sharedCache.get(key)
    const [, readResult] = await Promise.all([writeP, readP])

    // Must be null (write not yet committed) or full object
    expect(readResult === null || readResult?.large?.length === 1_000).toBe(true)
  })

  it('10 concurrent sets to different keys all succeed', async () => {
    const writes = Array.from({ length: 10 }, (_, i) =>
      sharedCache.set(`test:parallel:${i}`, { v: i }, 60_000)
    )
    await Promise.all(writes)

    const reads = await Promise.all(
      Array.from({ length: 10 }, (_, i) => sharedCache.get(`test:parallel:${i}`))
    )
    reads.forEach((r, i) => expect(r?.v).toBe(i))
  })
})
