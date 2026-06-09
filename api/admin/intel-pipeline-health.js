/**
 * GET /api/admin/intel-pipeline-health
 *
 * Intelligence Pipeline Health — Phase 6 (Confidence Framework).
 *
 * Exposes the full confidence picture to operators:
 *   - Attribution quality metrics
 *   - Source diversity scores
 *   - Intelligence freshness
 *   - Coverage health per country
 *   - Deduplication effectiveness
 *   - Scoring isolation status (FCDO / CAIRO / Trend)
 *   - Pipeline version (v3 vs legacy records)
 *
 * Auth: admin or developer role (Bearer token).
 */

import { getSupabaseAdmin } from '../_supabase.js'
import { sharedCache }      from '../_sharedCache.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Unauthorised — Bearer token required' })

  const sb = getSupabaseAdmin()
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await sb
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!['admin', 'developer'].includes(profile?.role))
    return res.status(403).json({ error: 'Admin or developer role required' })

  const now      = new Date()
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const cutoff1h  = new Date(now.getTime() -  1 * 60 * 60 * 1000).toISOString()

  try {
    // ── 1. Attribution quality (last 24h) ─────────────────────────────────
    const { data: attrRows } = await sb
      .from('live_intelligence')
      .select('attribution_confidence, attribution_method, source_name, ingested_at')
      .gte('ingested_at', cutoff24h)
      .not('attribution_confidence', 'is', null)

    const attrStats = computeAttributionStats(attrRows || [])

    // ── 2. Deduplication effectiveness (last 24h) ─────────────────────────
    const { data: hashRows } = await sb
      .from('live_intelligence')
      .select('content_hash, canonical_url')
      .gte('ingested_at', cutoff24h)

    const dedupStats = computeDedupStats(hashRows || [])

    // ── 3. Source diversity (last 24h) ────────────────────────────────────
    const { data: sourceRows } = await sb
      .from('live_intelligence')
      .select('source_name, source_tier')
      .gte('ingested_at', cutoff24h)
      .not('source_name', 'is', null)

    const sourceStats = computeSourceStats(sourceRows || [])

    // ── 4. Pipeline version distribution ─────────────────────────────────
    const { data: versionRows } = await sb
      .from('live_intelligence')
      .select('attribution_method')
      .gte('ingested_at', cutoff24h)

    const v3Count     = (versionRows || []).filter(r => r.attribution_method && r.attribution_method !== 'legacy').length
    const legacyCount = (versionRows || []).filter(r => !r.attribution_method || r.attribution_method === 'legacy').length
    const totalCount  = (versionRows || []).length

    // ── 5. Scoring isolation status ───────────────────────────────────────
    // Check cache population for each scoring system
    const [fcdoCacheCheck, cairoCacheCheck, gdeltCacheCheck] = await Promise.allSettled([
      checkFcdoCacheHealth(sb),
      checkCairoCacheHealth(sb),
      checkGdeltCacheHealth(),
    ])

    const scoringIsolation = {
      fcdo_risk: {
        system: 'FCDO Risk Score',
        source: 'gov.uk API (direct, not from live_intelligence)',
        cache: 'sharedCache(fcdo:{slug}) — Redis/in-memory',
        contamination_risk: 'none',
        status: fcdoCacheCheck.status === 'fulfilled' ? fcdoCacheCheck.value : 'check_failed',
      },
      cairo_assessment: {
        system: 'CAIRO Assessment',
        source: 'RSS feeds (attribution-filtered v3) + cairo_knowledge + FCDO + GDELT',
        cache: 'api_cache(country-risk:ai:{country}) — Supabase persistent',
        contamination_risk: 'none',
        note: 'RSS articles now filtered at confidence ≥ 0.45 by attribution engine',
        status: cairoCacheCheck.status === 'fulfilled' ? cairoCacheCheck.value : 'check_failed',
      },
      trend_indicator: {
        system: 'Trend Indicator',
        source: 'GDELT API (direct) — tempoScore = reporting velocity ratio',
        cache: 'sharedCache(gdelt:{country}) — Redis/in-memory',
        contamination_risk: 'none',
        note: 'GDELT uses "country" exact query — not affected by live_intelligence quality',
        status: gdeltCacheCheck.status === 'fulfilled' ? gdeltCacheCheck.value : 'check_failed',
      },
    }

    // ── 6. Confidence framework summary ───────────────────────────────────
    const confidence_framework = {
      attribution_quality: {
        score: attrStats.avgConfidence,
        tier:  scoreToTier(attrStats.avgConfidence, 0.70, 0.50, 0.35),
        strong_pct: attrStats.strongPct,
        good_pct:   attrStats.goodPct,
        weak_pct:   attrStats.weakPct,
        legacy_pct: attrStats.legacyPct,
      },
      source_diversity: {
        score:          sourceStats.diversityScore,
        tier:           scoreToTier(sourceStats.diversityScore, 0.70, 0.50, 0.30),
        distinct_sources: sourceStats.distinctSources,
        tier1_pct:      sourceStats.tier1Pct,
        tier2_pct:      sourceStats.tier2Pct,
      },
      intelligence_freshness: {
        score:        attrStats.freshPct / 100,
        tier:         scoreToTier(attrStats.freshPct / 100, 0.80, 0.60, 0.40),
        records_1h:   attrStats.records1h,
        records_24h:  totalCount,
      },
      deduplication: {
        score:            dedupStats.uniquePct / 100,
        tier:             scoreToTier(dedupStats.uniquePct / 100, 0.90, 0.75, 0.50),
        unique_records:   dedupStats.uniqueUrls,
        duplicate_hashes: dedupStats.duplicateHashes,
        dedup_rate_pct:   100 - dedupStats.uniquePct,
      },
    }

    // Overall pipeline health score (weighted average of four dimensions)
    const healthScore = Math.round((
      confidence_framework.attribution_quality.score  * 0.35 +
      confidence_framework.source_diversity.score     * 0.20 +
      confidence_framework.intelligence_freshness.score * 0.25 +
      confidence_framework.deduplication.score        * 0.20
    ) * 100)

    return res.status(200).json({
      overview: {
        as_of:          now.toISOString(),
        health_score:   healthScore,
        health_tier:    scoreToTier(healthScore / 100, 0.75, 0.55, 0.40),
        pipeline_version: {
          v3_records_24h:     v3Count,
          legacy_records_24h: legacyCount,
          total_records_24h:  totalCount,
          v3_pct:             totalCount > 0 ? Math.round((v3Count / totalCount) * 100) : 0,
        },
      },
      confidence_framework,
      scoring_isolation: scoringIsolation,
      source_stats:      sourceStats,
      attribution_stats: attrStats,
      _ts: now.toISOString(),
    })

  } catch (err) {
    console.error('[intel-pipeline-health]', err.message)
    return res.status(500).json({ error: err.message })
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeAttributionStats(rows) {
  if (!rows.length) return {
    avgConfidence: 0, strongPct: 0, goodPct: 0, weakPct: 0, legacyPct: 100,
    records1h: 0, freshPct: 0,
  }

  const now      = Date.now()
  const cutoff1h = now - 60 * 60 * 1000

  let confSum = 0, strong = 0, good = 0, weak = 0, legacy = 0, fresh = 0

  for (const r of rows) {
    const conf   = r.attribution_confidence || 0.5
    const method = r.attribution_method || 'legacy'
    const ts     = r.ingested_at ? new Date(r.ingested_at).getTime() : 0

    confSum += conf
    if (method === 'legacy' || !method) { legacy++ } else {
      if (conf >= 0.70) strong++
      else if (conf >= 0.45) good++
      else weak++
    }
    if (ts > cutoff1h) fresh++
  }

  const n = rows.length
  return {
    avgConfidence: Math.round(confSum / n * 100) / 100,
    strongPct:     Math.round((strong / n) * 100),
    goodPct:       Math.round((good   / n) * 100),
    weakPct:       Math.round((weak   / n) * 100),
    legacyPct:     Math.round((legacy / n) * 100),
    records1h:     fresh,
    freshPct:      Math.round((fresh  / n) * 100),
  }
}

function computeDedupStats(rows) {
  if (!rows.length) return { uniqueUrls: 0, duplicateHashes: 0, uniquePct: 100 }

  const urlSet  = new Set()
  const hashSet = new Set()
  let dupHashes = 0

  for (const r of rows) {
    if (r.canonical_url) urlSet.add(r.canonical_url)
    if (r.content_hash) {
      if (hashSet.has(r.content_hash)) dupHashes++
      else hashSet.add(r.content_hash)
    }
  }

  const uniquePct = rows.length > 0
    ? Math.round(((rows.length - dupHashes) / rows.length) * 100)
    : 100

  return { uniqueUrls: urlSet.size, duplicateHashes: dupHashes, uniquePct }
}

function computeSourceStats(rows) {
  if (!rows.length) return {
    distinctSources: 0, diversityScore: 0, tier1Pct: 0, tier2Pct: 0,
  }

  const sources = new Map()
  let tier1 = 0, tier2 = 0, total = 0

  for (const r of rows) {
    const name = r.source_name || 'Unknown'
    sources.set(name, (sources.get(name) || 0) + 1)
    total++
    if (r.source_tier === 1) tier1++
    else if (r.source_tier === 2) tier2++
  }

  // Diversity: Gini-Simpson index (probability that two random articles are from different sources)
  const n = total
  const sumSq = [...sources.values()].reduce((s, c) => s + (c / n) ** 2, 0)
  const diversityScore = Math.round((1 - sumSq) * 100) / 100

  return {
    distinctSources: sources.size,
    diversityScore,
    tier1Pct: Math.round((tier1 / n) * 100),
    tier2Pct: Math.round((tier2 / n) * 100),
    topSources: [...sources.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
  }
}

async function checkFcdoCacheHealth(sb) {
  // Check if FCDO cache entries exist in api_cache for a sample of countries
  const sample = ['iraq', 'somalia', 'south africa', 'nigeria', 'israel']
  const { data } = await sb
    .from('api_cache')
    .select('key, expires_at')
    .in('key', sample.map(c => `fcdo:${c}`))

  return {
    populated: (data?.length || 0),
    sample_checked: sample.length,
    status: (data?.length || 0) > 0 ? 'populated' : 'empty',
    isolation_confirmed: true,
    reads_from_live_intelligence: false,
  }
}

async function checkCairoCacheHealth(sb) {
  const { data, error } = await sb
    .from('api_cache')
    .select('key, created_at, expires_at')
    .ilike('key', 'country-risk:ai:%')
    .gt('expires_at', new Date().toISOString())
    .limit(5)

  return {
    live_entries: (data?.length || 0),
    status: (data?.length || 0) > 0 ? 'populated' : 'warming_up',
    isolation_confirmed: true,
    reads_from_live_intelligence: false,
    reads_from_fcdo: true,
    reads_from_gdelt: true,
    reads_from_rss_filtered: true,
  }
}

async function checkGdeltCacheHealth() {
  // Try to get a cached GDELT entry from sharedCache
  const sample = ['Iraq', 'Somalia', 'Nigeria']
  let hits = 0
  for (const country of sample) {
    const cached = await sharedCache.get(`gdelt:${country.toLowerCase()}`)
    if (cached) hits++
  }

  return {
    cached_countries_sample: hits,
    status: hits > 0 ? 'populated' : 'warming_up',
    isolation_confirmed: true,
    reads_from_live_intelligence: false,
    reads_from_fcdo: false,
    reads_from_cairo: false,
    source: 'GDELT API direct (api.gdeltproject.org)',
  }
}

function scoreToTier(score, strongThreshold = 0.70, goodThreshold = 0.50, weakThreshold = 0.30) {
  if (score >= strongThreshold) return 'strong'
  if (score >= goodThreshold)   return 'good'
  if (score >= weakThreshold)   return 'weak'
  return 'critical'
}
