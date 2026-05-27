/**
 * tests/unit/intelCenter.test.js
 *
 * Priority 3 — cache bypass, hit/miss flow, result shape, KB flag.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MOCK_CONTEXT, MOCK_JOURNEY } from '../helpers/index.js'

// Mock the three core dependencies
vi.mock('../../api/_contextAssembly.js', () => ({
  assembleContext: vi.fn().mockResolvedValue(MOCK_CONTEXT),
}))

vi.mock('../../api/_cairoSOP.js', () => ({
  buildKnowledgeContext: vi.fn().mockResolvedValue([
    { doc: { title: 'Nigeria SOP', content: 'c', summary: 's' }, tier: 1, score: 40 },
  ]),
  formatKBSection: vi.fn().mockReturnValue('\nKB section'),
}))

vi.mock('../../api/_sharedCache.js', () => ({
  sharedCache: {
    get:              vi.fn().mockResolvedValue(null), // cold miss by default
    set:              vi.fn().mockResolvedValue(undefined),
    invalidatePrefix: vi.fn().mockResolvedValue(undefined),
  },
  CACHE_TTL: {
    CAIRO_CONTEXT:  5   * 60 * 1000,
    COUNTRY_RISK:   60  * 60 * 1000,
    KB_RETRIEVAL:   30  * 60 * 1000,
    SOP_RETRIEVAL:  60  * 60 * 1000,
    INTEL_HEALTH:   2   * 60 * 1000,
    FLIGHT_STATUS:  5   * 60 * 1000,
    FACILITIES:     24  * 60 * 60 * 1000,
    RSS_FEED:       15  * 60 * 1000,
    COUNTRY_SUMMARY: 30 * 60 * 1000,
  },
}))

import { requestIntelligence, invalidateIntelCache } from '../../api/_intelCenter.js'
import { assembleContext } from '../../api/_contextAssembly.js'
import { buildKnowledgeContext } from '../../api/_cairoSOP.js'
import { sharedCache } from '../../api/_sharedCache.js'

beforeEach(() => {
  vi.clearAllMocks()
  sharedCache.get.mockResolvedValue(null) // reset to cold miss
})

// ── Result shape ──────────────────────────────────────────────────────────────

describe('requestIntelligence — result shape', () => {
  it('returns context, kb, fromCache, destination', async () => {
    const result = await requestIntelligence({ destination: 'Lagos', journey: MOCK_JOURNEY })
    expect(result).toHaveProperty('context')
    expect(result).toHaveProperty('kb')
    expect(result).toHaveProperty('fromCache')
    expect(result).toHaveProperty('destination')
  })

  it('fromCache is false on cache miss', async () => {
    const result = await requestIntelligence({ destination: 'Lagos', journey: MOCK_JOURNEY })
    expect(result.fromCache).toBe(false)
  })

  it('fromCache is true on cache hit', async () => {
    const cached = { context: MOCK_CONTEXT, kb: [], fromCache: false, destination: 'Lagos' }
    sharedCache.get.mockResolvedValueOnce(cached)

    const result = await requestIntelligence({ destination: 'Lagos' })
    expect(result.fromCache).toBe(true)
    expect(assembleContext).not.toHaveBeenCalled()
  })

  it('destination falls back to journey.destination', async () => {
    const result = await requestIntelligence({ journey: MOCK_JOURNEY })
    expect(result.destination).toBe('Lagos')
  })

  it('destination is null when neither provided', async () => {
    const result = await requestIntelligence({})
    expect(result.destination).toBeNull()
  })
})

// ── Cache read/write ──────────────────────────────────────────────────────────

describe('requestIntelligence — cache behavior', () => {
  it('calls sharedCache.get with auto-generated key', async () => {
    await requestIntelligence({ destination: 'Lagos', intent: 'travel_advisory' })
    expect(sharedCache.get).toHaveBeenCalledWith('intel:lagos:travel_advisory')
  })

  it('calls sharedCache.set after cache miss', async () => {
    await requestIntelligence({ destination: 'Lagos', intent: 'travel_advisory' })
    expect(sharedCache.set).toHaveBeenCalledWith(
      'intel:lagos:travel_advisory',
      expect.objectContaining({ context: MOCK_CONTEXT }),
      expect.any(Number),
    )
  })

  it('uses provided cacheKey over auto-generated key', async () => {
    await requestIntelligence({ destination: 'Lagos', cacheKey: 'intel:custom-key' })
    expect(sharedCache.get).toHaveBeenCalledWith('intel:custom-key')
  })

  it('cacheTtlMs:0 skips both cache read and write', async () => {
    await requestIntelligence({ destination: 'Lagos', cacheTtlMs: 0 })
    expect(sharedCache.get).not.toHaveBeenCalled()
    expect(sharedCache.set).not.toHaveBeenCalled()
  })

  it('uses provided cacheTtlMs for set', async () => {
    await requestIntelligence({ destination: 'Lagos', cacheTtlMs: 99_000 })
    expect(sharedCache.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      99_000,
    )
  })
})

// ── KB retrieval flag ─────────────────────────────────────────────────────────

describe('requestIntelligence — KB retrieval', () => {
  it('calls buildKnowledgeContext when includeKB is true (default)', async () => {
    await requestIntelligence({ destination: 'Lagos', journey: MOCK_JOURNEY })
    expect(buildKnowledgeContext).toHaveBeenCalled()
  })

  it('skips buildKnowledgeContext when includeKB is false', async () => {
    await requestIntelligence({ destination: 'Lagos', journey: MOCK_JOURNEY, includeKB: false })
    expect(buildKnowledgeContext).not.toHaveBeenCalled()
  })

  it('skips buildKnowledgeContext when no destination', async () => {
    await requestIntelligence({ includeKB: true })
    expect(buildKnowledgeContext).not.toHaveBeenCalled()
  })

  it('kb is null when includeKB is false', async () => {
    const result = await requestIntelligence({ destination: 'Lagos', includeKB: false })
    expect(result.kb).toBeNull()
  })

  it('kb is an array when includeKB is true', async () => {
    const result = await requestIntelligence({ destination: 'Lagos', journey: MOCK_JOURNEY })
    expect(Array.isArray(result.kb)).toBe(true)
  })
})

// ── assembleContext integration ───────────────────────────────────────────────

describe('requestIntelligence — assembleContext wiring', () => {
  it('calls assembleContext on cache miss', async () => {
    await requestIntelligence({ destination: 'Lagos', journey: MOCK_JOURNEY })
    expect(assembleContext).toHaveBeenCalledOnce()
  })

  it('does NOT call assembleContext on cache hit', async () => {
    sharedCache.get.mockResolvedValueOnce({ context: MOCK_CONTEXT, kb: [], fromCache: false, destination: 'Lagos' })
    await requestIntelligence({ destination: 'Lagos' })
    expect(assembleContext).not.toHaveBeenCalled()
  })

  it('passes options to assembleContext for future optional layers', async () => {
    await requestIntelligence({
      destination: 'Lagos',
      journey: MOCK_JOURNEY,
      includeOperationalState: true,
      orgId: 'org-123',
    })
    expect(assembleContext).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        includeOperationalState: true,
        orgId: 'org-123',
      }),
    )
  })
})

// ── invalidateIntelCache ──────────────────────────────────────────────────────

describe('invalidateIntelCache', () => {
  it('calls invalidatePrefix with lowercased destination prefix', async () => {
    await invalidateIntelCache('Lagos')
    expect(sharedCache.invalidatePrefix).toHaveBeenCalledWith('intel:lagos:')
  })

  it('does nothing when destination is falsy', async () => {
    await invalidateIntelCache(null)
    await invalidateIntelCache('')
    expect(sharedCache.invalidatePrefix).not.toHaveBeenCalled()
  })
})
