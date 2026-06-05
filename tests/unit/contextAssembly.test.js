/**
 * tests/unit/contextAssembly.test.js
 *
 * Priority 3 & 5 — assembleContext return shape contract and optional layer parity.
 *
 * All expensive dependencies (feed fetching, operational memory, traffic,
 * country risk, telemetry) are mocked so tests run fast and deterministically.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MOCK_JOURNEY } from '../helpers/index.js'

// ── Mock all external dependencies ───────────────────────────────────────────
// Must be declared before importing assembleContext because vitest hoists vi.mock() calls.

vi.mock('../../api/_claudeSynth.js', () => ({
  fetchArticlesForCountry: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../api/_operationalMemory.js', () => ({
  buildMemoryContext: vi.fn().mockResolvedValue({
    dataAvailable: true,
    formatted:     'Memory context block',
    incidents:     [{ id: '1', type: 'crime' }],
    patterns:      [{ id: '1', pattern_type: 'seasonal' }],
    activePrecursors: [],
  }),
  scoreDataQuality: vi.fn().mockReturnValue(55),
}))

vi.mock('../../api/_intelNormalizer.js', () => ({
  normalizeArticles: vi.fn().mockReturnValue([]),
}))

vi.mock('../../api/_eventCorrelator.js', () => ({
  correlateEvents:     vi.fn().mockReturnValue([]),
  deduplicateIntel:    vi.fn().mockImplementation(x => x),
  resolveConflicts:    vi.fn().mockImplementation(x => x),
  detectEscalation:    vi.fn().mockReturnValue({ escalating: false, pattern: null }),
}))

vi.mock('../../api/_trafficContext.js', () => ({
  assembleTrafficContext: vi.fn().mockResolvedValue({ hasData: false, corridors: [] }),
}))

vi.mock('../../api/_countryRiskContext.js', () => ({
  assembleCountryRiskContext: vi.fn().mockResolvedValue({ hasData: false }),
}))

import { assembleContext } from '../../api/_contextAssembly.js'

// Required keys that must always be present in the return value
const REQUIRED_KEYS = [
  'formatted', 'intelObjects', 'correlations', 'memoryContext',
  'realTimeConfidence', 'dataAvailable', 'feedsFailed', 'totalArticles',
  'stats', 'operationalState', 'travelerContext', 'orgContext',
]

const REQUIRED_STATS_KEYS = [
  'live_signals', 'corroboration_clusters', 'memory_incidents',
  'memory_patterns', 'confidence_score', 'confidence_band',
]

// ── Return shape contract ─────────────────────────────────────────────────────

describe('assembleContext — return shape contract', () => {
  it('includes all required top-level keys on success', async () => {
    const result = await assembleContext(MOCK_JOURNEY)
    for (const key of REQUIRED_KEYS) {
      expect(result, `missing key: ${key}`).toHaveProperty(key)
    }
  })

  it('stats includes all required sub-keys', async () => {
    const { stats } = await assembleContext(MOCK_JOURNEY)
    for (const key of REQUIRED_STATS_KEYS) {
      expect(stats, `missing stats key: ${key}`).toHaveProperty(key)
    }
    expect(typeof stats.live_signals).toBe('number')
    expect(typeof stats.confidence_score).toBe('number')
    expect(typeof stats.confidence_band).toBe('string')
  })

  it('formatted is a non-empty string', async () => {
    const { formatted } = await assembleContext(MOCK_JOURNEY)
    expect(typeof formatted).toBe('string')
    expect(formatted.length).toBeGreaterThan(0)
  })

  it('intelObjects is an array', async () => {
    const { intelObjects } = await assembleContext(MOCK_JOURNEY)
    expect(Array.isArray(intelObjects)).toBe(true)
  })

  it('realTimeConfidence has score and band', async () => {
    const { realTimeConfidence } = await assembleContext(MOCK_JOURNEY)
    expect(typeof realTimeConfidence.score).toBe('number')
    expect(typeof realTimeConfidence.band).toBe('string')
  })
})

// ── No destination — early return ─────────────────────────────────────────────

describe('assembleContext — no destination', () => {
  it('returns early with all required keys when destination is missing', async () => {
    const result = await assembleContext({ origin: 'London' })
    for (const key of REQUIRED_KEYS) {
      expect(result, `missing key on no-destination: ${key}`).toHaveProperty(key)
    }
  })

  it('returns formatted awaiting-journey message', async () => {
    const { formatted } = await assembleContext({})
    expect(formatted).toContain('Awaiting journey details')
  })

  it('optional layer fields are null on early return', async () => {
    const result = await assembleContext({})
    expect(result.operationalState).toBeNull()
    expect(result.travelerContext).toBeNull()
    expect(result.orgContext).toBeNull()
  })

  it('returns early when journey is null', async () => {
    const result = await assembleContext(null)
    expect(result).toHaveProperty('formatted')
    expect(result.dataAvailable).toBe(false)
  })
})

// ── Optional layer parity (Priority 5) ───────────────────────────────────────

describe('assembleContext — optional layer parity', () => {
  it('calling with no options is identical to calling with empty options', async () => {
    const withNoOpts   = await assembleContext(MOCK_JOURNEY)
    const withEmptyOpts = await assembleContext(MOCK_JOURNEY, {})

    expect(withEmptyOpts.operationalState).toBeNull()
    expect(withEmptyOpts.travelerContext).toBeNull()
    expect(withEmptyOpts.orgContext).toBeNull()
    expect(withEmptyOpts.formatted).toBe(withNoOpts.formatted)
  })

  it('calling with all flags false is identical to calling with no options', async () => {
    const withNoOpts  = await assembleContext(MOCK_JOURNEY)
    const withAllFalse = await assembleContext(MOCK_JOURNEY, {
      includeOperationalState: false,
      includeTravelerContext:  false,
      includeOrgContext:       false,
    })
    expect(withAllFalse.operationalState).toBeNull()
    expect(withAllFalse.travelerContext).toBeNull()
    expect(withAllFalse.orgContext).toBeNull()
    expect(withAllFalse.formatted).toBe(withNoOpts.formatted)
  })

  it('optional layers default to null when flags are false', async () => {
    const result = await assembleContext(MOCK_JOURNEY, { includeOperationalState: false })
    expect(result.operationalState).toBeNull()
  })

  it('optional layers are null when no userId/orgId provided even if flags are true', async () => {
    // fetchOperationalState returns null when orgId is null
    const result = await assembleContext(MOCK_JOURNEY, {
      includeOperationalState: true,
      includeTravelerContext:  true,
      includeOrgContext:       true,
      userId: null,
      orgId:  null,
    })
    expect(result.operationalState).toBeNull()
    expect(result.travelerContext).toBeNull()
    expect(result.orgContext).toBeNull()
  })
})

// ── Degraded mode ─────────────────────────────────────────────────────────────

// Import the mocked module once at module scope so beforeEach can reference it synchronously
import * as claudeSynthMock from '../../api/_claudeSynth.js'

describe('assembleContext — degraded mode', () => {
  beforeEach(() => {
    claudeSynthMock.fetchArticlesForCountry.mockRejectedValue(new Error('Feed network error'))
  })

  afterEach(() => {
    // Restore to empty-success so subsequent describe blocks are not affected
    claudeSynthMock.fetchArticlesForCountry.mockResolvedValue([])
  })

  it('returns all required keys in degraded mode', async () => {
    const result = await assembleContext(MOCK_JOURNEY)
    for (const key of REQUIRED_KEYS) {
      expect(result, `missing degraded key: ${key}`).toHaveProperty(key)
    }
  })

  it('feedsFailed is true in degraded mode', async () => {
    const result = await assembleContext(MOCK_JOURNEY)
    expect(result.feedsFailed).toBe(true)
  })

  it('ACS score is penalised (≤ 35) in degraded mode', async () => {
    const result = await assembleContext(MOCK_JOURNEY)
    expect(result.realTimeConfidence.score).toBeLessThanOrEqual(35)
  })

  it('optional layer fields are null in degraded mode', async () => {
    const result = await assembleContext(MOCK_JOURNEY)
    expect(result.operationalState).toBeNull()
    expect(result.travelerContext).toBeNull()
    expect(result.orgContext).toBeNull()
  })
})

// ── Resilience: partial dependency failures ───────────────────────────────────
// Import mocked modules at module scope — vi.mock() is hoisted so these are
// the mocked versions, not the real implementations.
import * as operationalMemoryMock from '../../api/_operationalMemory.js'
import * as trafficContextMock    from '../../api/_trafficContext.js'
import * as countryRiskCtxMock    from '../../api/_countryRiskContext.js'

describe('assembleContext — partial dependency failures', () => {
  it('continues when operationalMemory throws', async () => {
    operationalMemoryMock.buildMemoryContext.mockRejectedValueOnce(new Error('DB timeout'))
    const result = await assembleContext(MOCK_JOURNEY)
    expect(result).toHaveProperty('formatted')
    expect(result.memoryContext.dataAvailable).toBe(false)
  })

  it('continues when trafficContext throws', async () => {
    trafficContextMock.assembleTrafficContext.mockRejectedValueOnce(new Error('Traffic API down'))
    const result = await assembleContext(MOCK_JOURNEY)
    expect(result).toHaveProperty('formatted')
    expect(result.trafficContext.hasData).toBe(false)
  })

  it('continues when countryRiskContext throws', async () => {
    countryRiskCtxMock.assembleCountryRiskContext.mockRejectedValueOnce(new Error('Risk API down'))
    const result = await assembleContext(MOCK_JOURNEY)
    expect(result).toHaveProperty('formatted')
  })
})
