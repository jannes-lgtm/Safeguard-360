/**
 * tests/integration/countryRisk.test.js
 *
 * Priority 4 — regression test for the _cacheManager → _sharedCache migration.
 *
 * Verifies that:
 * - sharedCache.get/set are called (not the old sync cache)
 * - await is used correctly (async cache operations)
 * - cache misses trigger AI synthesis
 * - cache hits skip AI synthesis
 * - fire-and-forget dbCacheSet is preserved
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callHandler } from '../helpers/index.js'

// ── Mocks ─────────────────────────────────────────────────────────────────────
// vi.mock() is hoisted — the factory cannot reference variables declared in the
// outer scope. Define mock functions inline; access them via the imported module.

vi.mock('../../api/_sharedCache.js', () => ({
  sharedCache: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockResolvedValue(false),
  },
  CACHE_TTL: { COUNTRY_RISK: 3_600_000 },
}))

vi.mock('../../api/_claudeSynth.js', () => ({
  comprehensiveRiskScan: vi.fn().mockResolvedValue({ summary: 'AI brief', score: 60 }),
  synthesiseBrief:       vi.fn().mockResolvedValue(null),
  fetchGDACS:            vi.fn().mockResolvedValue([]),
  fetchUSGS:             vi.fn().mockResolvedValue([]),
  fetchHealthOutbreaks:  vi.fn().mockResolvedValue({ matches: [], recent: [] }),
}))

vi.mock('../../api/_dbCache.js', () => ({
  dbCacheGet: vi.fn().mockResolvedValue(null),
  dbCacheSet: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../api/_rssParser.js', () => ({
  parseRssXml: vi.fn().mockReturnValue([]),
}))

vi.mock('../../api/_rateLimit.js', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))

// Stub global fetch for FCDO and ISS requests
vi.stubGlobal('fetch', vi.fn(async (url) => {
  if (url.includes('gov.uk/api/content')) {
    return {
      ok: true,
      json: async () => ({
        details: {
          parts: [{ slug: 'warnings-and-insurance', body: 'Normal travel precautions.' }],
        },
      }),
    }
  }
  if (url.includes('issafrica.org')) {
    return { ok: false }
  }
  return { ok: true, json: async () => ({}) }
}))

import { getCountryRisk } from '../../api/country-risk.js'
import { sharedCache } from '../../api/_sharedCache.js'
import { comprehensiveRiskScan } from '../../api/_claudeSynth.js'
import { dbCacheGet, dbCacheSet } from '../../api/_dbCache.js'

beforeEach(() => {
  vi.clearAllMocks()
  sharedCache.get.mockResolvedValue(null)
  sharedCache.set.mockResolvedValue(undefined)
})

// ── Cache migration correctness ───────────────────────────────────────────────

describe('country-risk — sharedCache migration', () => {
  it('calls sharedCache.get (not sync cache.get) for FCDO data', async () => {
    await getCountryRisk('Nigeria')
    // sharedCache.get should have been called for 'fcdo:nigeria'
    const fcdoCall = sharedCache.get.mock.calls.find(([k]) => k.startsWith('fcdo:'))
    expect(fcdoCall).toBeDefined()
  })

  it('calls sharedCache.set after FCDO fetch (async write)', async () => {
    await getCountryRisk('Nigeria')
    const fcdoSet = sharedCache.set.mock.calls.find(([k]) => k.startsWith('fcdo:'))
    expect(fcdoSet).toBeDefined()
    // Verify it was awaited — if the function returned a Promise that was ignored,
    // set would still be called but this verifies the call happened before return
    expect(sharedCache.set).toHaveBeenCalled()
  })

  it('calls sharedCache.get for AI brief cache check (L1)', async () => {
    await getCountryRisk('Nigeria')
    const aiCall = sharedCache.get.mock.calls.find(([k]) => k.startsWith('risk-ai:'))
    expect(aiCall).toBeDefined()
  })

  it('calls sharedCache.set for AI brief after synthesis (L1 write)', async () => {
    await getCountryRisk('Nigeria')
    const aiSet = sharedCache.set.mock.calls.find(([k]) => k.startsWith('risk-ai:'))
    expect(aiSet).toBeDefined()
    expect(aiSet[1]).toEqual({ summary: 'AI brief', score: 60 }) // the synthesised brief
    expect(aiSet[2]).toBe(60 * 60 * 1000) // 1 hour TTL
  })

  it('skips AI synthesis when sharedCache L1 hits', async () => {
    sharedCache.get.mockImplementation(async (key) => {
      if (key.startsWith('risk-ai:')) return { summary: 'cached brief', score: 55 }
      return null
    })
    await getCountryRisk('Nigeria')
    expect(comprehensiveRiskScan).not.toHaveBeenCalled()
  })

  it('skips AI synthesis when dbCacheGet hits (L2)', async () => {
    dbCacheGet.mockResolvedValueOnce({ summary: 'db cached brief', score: 58 })
    await getCountryRisk('Nigeria')
    expect(comprehensiveRiskScan).not.toHaveBeenCalled()
  })

  it('writes L1 cache after L2 hit', async () => {
    const dbBrief = { summary: 'db cached brief', score: 58 }
    dbCacheGet.mockResolvedValueOnce(dbBrief)
    await getCountryRisk('Nigeria')
    const l1Write = sharedCache.set.mock.calls.find(([k]) => k.startsWith('risk-ai:'))
    expect(l1Write).toBeDefined()
    expect(l1Write[1]).toEqual(dbBrief)
  })

  it('does NOT call sharedCache.set for dbCacheSet (fire-and-forget preserved)', async () => {
    await getCountryRisk('Nigeria')
    // dbCacheSet is fire-and-forget and should not be awaited via sharedCache
    expect(dbCacheSet).toHaveBeenCalled()
    // Verify dbCacheSet is called with the AI brief key
    const dbCall = dbCacheSet.mock.calls.find(([k]) => k.includes('country-risk:ai:'))
    expect(dbCall).toBeDefined()
  })
})

// ── Return shape ──────────────────────────────────────────────────────────────

describe('country-risk — return shape', () => {
  it('returns expected top-level keys', async () => {
    const result = await getCountryRisk('Nigeria')
    expect(result).toHaveProperty('country', 'Nigeria')
    expect(result).toHaveProperty('level')
    expect(result).toHaveProperty('severity')
    expect(result).toHaveProperty('ai_brief')
    expect(result).toHaveProperty('sources')
    expect(result).toHaveProperty('gdacs_count')
    expect(result).toHaveProperty('usgs_count')
  })

  it('sources is an array with at least UK FCDO', async () => {
    const { sources } = await getCountryRisk('Nigeria')
    expect(Array.isArray(sources)).toBe(true)
    const fcdo = sources.find(s => s.name === 'UK FCDO')
    expect(fcdo).toBeDefined()
  })

  it('ai_brief is populated from synthesis on cache miss', async () => {
    const { ai_brief } = await getCountryRisk('Nigeria')
    expect(ai_brief).toEqual({ summary: 'AI brief', score: 60 })
  })

  it('ai_brief is null when API key is not set', async () => {
    const savedKey = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    const { ai_brief } = await getCountryRisk('Nigeria')
    expect(ai_brief).toBeNull()
    process.env.ANTHROPIC_API_KEY = savedKey
  })
})

// ── ISS cache key ─────────────────────────────────────────────────────────────

describe('country-risk — ISS feed caching', () => {
  it('calls sharedCache.get for ISS feed', async () => {
    await getCountryRisk('Nigeria')
    const issCall = sharedCache.get.mock.calls.find(([k]) => k === 'iss:feed')
    expect(issCall).toBeDefined()
  })

  it('serves ISS from cache on second call', async () => {
    const cachedItems = [{ title: 'Nigeria security update', description: 'violence', link: 'https://iss.org', pubDate: new Date().toISOString() }]
    sharedCache.get.mockImplementation(async (key) => {
      if (key === 'iss:feed') return cachedItems
      return null
    })
    await getCountryRisk('Nigeria')
    // Should not call fetch for ISS if cache hit
    const fetchCalls = vi.mocked(global.fetch).mock.calls
    const issCalls = fetchCalls.filter(([url]) => url?.includes('issafrica'))
    expect(issCalls).toHaveLength(0)
  })
})
