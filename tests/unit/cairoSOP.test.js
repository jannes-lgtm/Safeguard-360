/**
 * tests/unit/cairoSOP.test.js
 *
 * Priority 1 — malformed / edge-case data in the KB retrieval pipeline.
 * Tests scoreDoc, compressDoc, formatKBSection, and buildKnowledgeContext
 * error recovery without hitting Supabase or the vector search API.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  DESTINATION_REGION_MAP,
  scoreDoc,
  compressDoc,
  formatKBSection,
  buildKnowledgeContext,
} from '../../api/_cairoSOP.js'

// ── scoreDoc ──────────────────────────────────────────────────────────────────

describe('scoreDoc', () => {
  const baseDoc = {
    doc_tier: 'global',
    countries: [],
    regions: [],
    tags: [],
    threat_categories: [],
    title: 'Test SOP',
  }

  it('returns tier 3 weight (20) for global doc with no keywords', () => {
    const result = scoreDoc(baseDoc, 'Lagos', 'West Africa', [])
    expect(result.tier).toBe(3)
    expect(result.score).toBe(20)
  })

  it('demotes country doc to tier 2 when destination mismatches but region matches', () => {
    // Senegal doc, destination=Nigeria — both are West Africa.
    // Tier 1 → 2 (country mismatch), stays at 2 (regional context matches via DESTINATION_REGION_MAP).
    const doc = { ...baseDoc, doc_tier: 'country', countries: ['Senegal'] }
    const result = scoreDoc(doc, 'Nigeria', 'West Africa', [])
    expect(result.tier).toBe(2)
    expect(result.score).toBe(30)
  })

  it('demotes country doc all the way to tier 3 when both country and region mismatch', () => {
    // Kenya doc (East Africa), destination=Lagos, region=West Africa.
    // Tier 1 → 2 (country mismatch) → 3 (regional mismatch).
    const doc = { ...baseDoc, doc_tier: 'country', countries: ['Kenya'] }
    const result = scoreDoc(doc, 'Lagos', 'West Africa', [])
    expect(result.tier).toBe(3)
    expect(result.score).toBe(20)
  })

  it('keeps country doc at tier 1 when destination matches', () => {
    const doc = { ...baseDoc, doc_tier: 'country', countries: ['Nigeria'] }
    const result = scoreDoc(doc, 'Nigeria', 'West Africa', [])
    expect(result.tier).toBe(1)
    expect(result.score).toBe(40)
  })

  it('demotes both country and regional docs to tier 3 when no destination', () => {
    const countryDoc  = { ...baseDoc, doc_tier: 'country',  countries: ['Nigeria'] }
    const regionalDoc = { ...baseDoc, doc_tier: 'regional', regions: ['West Africa'] }
    expect(scoreDoc(countryDoc,  null, null, []).tier).toBe(3)
    expect(scoreDoc(regionalDoc, null, null, []).tier).toBe(3)
  })

  it('adds keyword score (5 per match, capped at 20)', () => {
    const doc = { ...baseDoc, doc_tier: 'global', tags: ['kidnap', 'convoy', 'checkpoint', 'roadblock', 'ambush'] }
    const tokens = ['kidnap', 'convoy', 'checkpoint', 'roadblock', 'ambush', 'extra']
    const result = scoreDoc(doc, null, null, tokens)
    // base 20 + min(5*5=25, 20) = 40
    expect(result.score).toBe(40)
  })

  it('returns 0 keyword bonus for tokens not in doc', () => {
    const doc = { ...baseDoc, doc_tier: 'global', tags: ['medical'] }
    const result = scoreDoc(doc, null, null, ['kidnap', 'convoy'])
    expect(result.score).toBe(20) // no keyword match
  })

  it('handles missing tags and threat_categories gracefully', () => {
    const doc = { doc_tier: 'doctrine', title: 'Doc' } // no arrays at all
    expect(() => scoreDoc(doc, null, null, ['token'])).not.toThrow()
  })
})

// ── compressDoc ───────────────────────────────────────────────────────────────

describe('compressDoc', () => {
  it('uses full content for tier 1', () => {
    const scored = { doc: { title: 'T', content: 'FULL CONTENT', summary: 'short' }, tier: 1, score: 40 }
    expect(compressDoc(scored)).toContain('FULL CONTENT')
  })

  it('uses full content for tier 2', () => {
    const scored = { doc: { title: 'T', content: 'FULL CONTENT', summary: 'short' }, tier: 2, score: 30 }
    expect(compressDoc(scored)).toContain('FULL CONTENT')
  })

  it('uses summary for tier 3', () => {
    const scored = { doc: { title: 'T', content: 'FULL CONTENT', summary: 'SUMMARY ONLY' }, tier: 3, score: 20 }
    expect(compressDoc(scored)).toContain('SUMMARY ONLY')
    expect(compressDoc(scored)).not.toContain('FULL CONTENT')
  })

  it('uses full content for tier 3 with high keyword hit (score ≥ tierWeight + 10)', () => {
    // tier 3 weight is 20; high keyword hit means score >= 30
    const scored = { doc: { title: 'T', content: 'FULL CONTENT', summary: 'short' }, tier: 3, score: 35 }
    expect(compressDoc(scored)).toContain('FULL CONTENT')
  })

  it('handles null content gracefully — does not throw', () => {
    const scored = { doc: { title: 'T', content: null, summary: null }, tier: 1, score: 40 }
    expect(() => compressDoc(scored)).not.toThrow()
    expect(compressDoc(scored)).toContain('T')
  })

  it('handles undefined content and summary', () => {
    const scored = { doc: { title: 'T' }, tier: 3, score: 20 }
    expect(() => compressDoc(scored)).not.toThrow()
  })

  it('always includes doc title', () => {
    const scored = { doc: { title: 'MY TITLE', content: 'body', summary: 's' }, tier: 1, score: 40 }
    expect(compressDoc(scored)).toContain('MY TITLE')
  })
})

// ── formatKBSection ───────────────────────────────────────────────────────────

describe('formatKBSection', () => {
  it('returns empty string for empty array', () => {
    expect(formatKBSection([])).toBe('')
  })

  it('includes tier labels for present tiers only', () => {
    const scored = [
      { doc: { title: 'Country SOP', content: 'c', summary: 's' }, tier: 1, score: 40 },
      { doc: { title: 'Global SOP',  content: 'c', summary: 's' }, tier: 3, score: 20 },
    ]
    const out = formatKBSection(scored)
    expect(out).toContain('COUNTRY-SPECIFIC INTELLIGENCE')
    expect(out).toContain('GLOBAL STANDARD OPERATING PROCEDURES')
    expect(out).not.toContain('REGIONAL INTELLIGENCE')
    expect(out).not.toContain('GENERAL DOCTRINE')
  })

  it('includes priority instruction at end', () => {
    const scored = [{ doc: { title: 'T', content: 'c', summary: 's' }, tier: 2, score: 30 }]
    const out = formatKBSection(scored)
    expect(out).toContain('Country-specific intelligence takes precedence')
  })

  it('contains all four tier sections when all tiers present', () => {
    const scored = [1, 2, 3, 4].map(tier => ({
      doc: { title: `Tier ${tier} Doc`, content: 'c', summary: 's' },
      tier,
      score: [0, 40, 30, 20, 10][tier],
    }))
    const out = formatKBSection(scored)
    expect(out).toContain('COUNTRY-SPECIFIC INTELLIGENCE')
    expect(out).toContain('REGIONAL INTELLIGENCE')
    expect(out).toContain('GLOBAL STANDARD OPERATING PROCEDURES')
    expect(out).toContain('GENERAL DOCTRINE (REFERENCE)')
  })
})

// ── DESTINATION_REGION_MAP ────────────────────────────────────────────────────

describe('DESTINATION_REGION_MAP', () => {
  it('maps known African countries correctly', () => {
    expect(DESTINATION_REGION_MAP['Nigeria']).toBe('West Africa')
    expect(DESTINATION_REGION_MAP['Kenya']).toBe('East Africa')
    expect(DESTINATION_REGION_MAP['South Africa']).toBe('Southern Africa')
    expect(DESTINATION_REGION_MAP['Mali']).toBe('Sahel')
    expect(DESTINATION_REGION_MAP['Iraq']).toBe('Middle East')
  })

  it('returns undefined for unmapped countries', () => {
    expect(DESTINATION_REGION_MAP['Germany']).toBeUndefined()
    expect(DESTINATION_REGION_MAP['Australia']).toBeUndefined()
  })
})

// ── buildKnowledgeContext ─────────────────────────────────────────────────────

describe('buildKnowledgeContext', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns [] when _intel.js throws', async () => {
    // Mock _intel.js to throw
    vi.doMock('../../api/_intel.js', () => ({
      retrieveIntelligence: vi.fn().mockRejectedValue(new Error('vector DB down')),
    }))
    // Import fresh after mock
    const { buildKnowledgeContext: bkc } = await import('../../api/_cairoSOP.js')
    const result = await bkc('Lagos', 'security briefing')
    expect(result).toEqual([])
  })

  it('returns [] when Supabase query fails', async () => {
    vi.doMock('../../api/_intel.js', () => ({
      retrieveIntelligence: vi.fn().mockResolvedValue({ docs: [] }),
    }))
    // Supabase client throws
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => ({
        from: vi.fn(() => { throw new Error('DB error') }),
      })),
    }))
    const { buildKnowledgeContext: bkc } = await import('../../api/_cairoSOP.js')
    const result = await bkc('Lagos', 'test query')
    expect(result).toEqual([])
  })

  it('returns [] with no destination and no message', async () => {
    vi.doMock('../../api/_intel.js', () => ({
      retrieveIntelligence: vi.fn().mockResolvedValue({ docs: [] }),
    }))
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => ({
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    }))
    const { buildKnowledgeContext: bkc } = await import('../../api/_cairoSOP.js')
    const result = await bkc(null, '')
    expect(Array.isArray(result)).toBe(true)
  })
})
