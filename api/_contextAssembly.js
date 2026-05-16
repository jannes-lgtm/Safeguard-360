/**
 * api/_contextAssembly.js
 *
 * CAIRO Context Assembly Engine (CAE)
 *
 * The operational brainstem of CAIRO. Single entry point for all
 * intelligence retrieval, correlation, scoring, and packaging.
 *
 * Replaces the separate gatherIntel() + buildMemoryContext() calls in
 * journey-agent.js with one call: assembleContext(journey).
 *
 * Processing pipeline:
 *   1. Build geo-contexts from journey (destination + transit points)
 *   2. Retrieve live intelligence (RSS feeds + pre-ingested Supabase store)
 *   3. Retrieve operational memory (historical incidents, patterns, precursors)
 *   4. Deduplicate raw intel
 *   5. Resolve conflicting reports
 *   6. Correlate events into clusters
 *   7. Score relevance (per-journey weighting)
 *   8. Remove noise (low-signal, low-confidence events)
 *   9. Prioritize by operational significance
 *  10. Compute real-time Advisory Confidence Score (ACS)
 *  11. Format complete context block for Claude injection
 *
 * Returns:
 *   {
 *     formatted:          string  — full context block for Claude system prompt
 *     intelObjects:       [...],  — prioritized normalized intelligence
 *     correlations:       [...],  — corroboration clusters
 *     memoryContext:      {...},  — historical intelligence from Supabase
 *     realTimeConfidence: {...},  — ACS score + component breakdown
 *     dataAvailable:      bool
 *     feedsFailed:        bool    — true if live feeds degraded/failed
 *     stats:              {...},  — summary counts for UI
 *   }
 */

import { fetchArticlesForCountry } from './_claudeSynth.js'
import { buildMemoryContext, scoreDataQuality } from './_operationalMemory.js'
import { normalizeArticles } from './_intelNormalizer.js'
import { correlateEvents, deduplicateIntel, resolveConflicts, detectEscalation } from './_eventCorrelator.js'
import { assembleTrafficContext } from './_trafficContext.js'

const SUPABASE_URL = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// ── Supabase REST helper (read) ───────────────────────────────────────────────
async function sbQuery(table, params) {
  if (!SUPABASE_URL() || !SERVICE_KEY()) return []
  const url = `${SUPABASE_URL()}/rest/v1/${table}?${new URLSearchParams(params)}`
  try {
    const res = await fetch(url, {
      headers: {
        apikey:        SERVICE_KEY(),
        Authorization: `Bearer ${SERVICE_KEY()}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

// ── Step 1: Build geo-contexts ────────────────────────────────────────────────
function buildGeoContexts(journey) {
  const locs = [journey.destination, ...(journey.transitPoints || [])].filter(Boolean)
  return [...new Set(locs)]
}

// ── Step 2a: Fetch live articles from feeds ───────────────────────────────────
async function fetchLiveFeedArticles(geoContexts) {
  const byLocation = {}
  let feedsFailed = false
  let totalFetched = 0

  const jobs = geoContexts.map(async (loc) => {
    try {
      const articles = await fetchArticlesForCountry(loc)
      const normalized = normalizeArticles(articles, loc)
      byLocation[loc] = normalized
      totalFetched += normalized.length
    } catch {
      byLocation[loc] = []
      feedsFailed = true
    }
  })

  await Promise.allSettled(jobs)
  return { byLocation, feedsFailed, totalFetched }
}

// ── Step 2b: Retrieve pre-ingested intelligence from Supabase ─────────────────
async function fetchStoredIntel(geoContexts) {
  // Only pull intel from last 72h
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()

  const promises = geoContexts.map(loc =>
    sbQuery('live_intelligence', {
      country:    `eq.${loc}`,
      is_active:  'eq.true',
      ingested_at: `gte.${cutoff}`,
      order:      'ingested_at.desc',
      limit:      '15',
      select:     'event_type,country,city,severity,confidence,source_reliability,source_tier,movement_impact,raw_title,raw_summary,source_name,source_url,event_timestamp,keywords',
    })
  )

  const results = await Promise.allSettled(promises)
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value || [])
}

// ── Step 2c: Merge feed + stored intel, deduplicating across sources ───────────
function mergeIntelSources(feedByLocation, storedIntel) {
  const all = []

  // Stored intel is already normalized and higher quality — add first
  all.push(...storedIntel)

  // Feed intel: only add if not already covered by stored
  for (const articles of Object.values(feedByLocation)) {
    for (const art of articles) {
      const titleKey = art.raw_title?.slice(0, 50).toLowerCase() || ''
      const alreadyCovered = storedIntel.some(s =>
        s.country === art.country &&
        (s.raw_title?.slice(0, 50).toLowerCase() || '') === titleKey
      )
      if (!alreadyCovered) all.push(art)
    }
  }

  return all
}

// ── Step 3: Retrieve active correlation clusters from DB ───────────────────────
async function fetchStoredCorrelations(geoContexts) {
  const promises = geoContexts.map(loc =>
    sbQuery('event_correlations', {
      country:   `eq.${loc}`,
      is_active: 'eq.true',
      order:     'latest_signal_at.desc',
      limit:     '5',
      select:    'event_type,country,city,signal_count,corroboration_score,severity_consensus,movement_impact,first_signal_at,latest_signal_at',
    })
  )

  const results = await Promise.allSettled(promises)
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value || [])
}

// ── Step 7: Score relevance (per-journey weighting) ────────────────────────────
function scoreRelevance(intelObjects, journey) {
  const now = Date.now()
  const modes = (journey.transportModes || []).map(m => m.toLowerCase())
  const purpose = (journey.purpose || '').toLowerCase()

  return intelObjects.map(obj => {
    let score = (obj.confidence || 0.5) * (obj.source_reliability || 0.5)

    // Boost: high severity always operationally relevant
    if (obj.severity >= 5) score = Math.min(1, score * 1.50)
    else if (obj.severity >= 4) score = Math.min(1, score * 1.25)
    else if (obj.severity >= 3) score = Math.min(1, score * 1.10)

    // Boost: aviation disruptions when flying
    if (modes.includes('air') && obj.event_type === 'aviation_disruption') score = Math.min(1, score * 1.35)

    // Boost: road events when driving
    if (modes.includes('road') && ['civil_unrest', 'crime', 'infrastructure', 'border_closure'].includes(obj.event_type)) {
      score = Math.min(1, score * 1.20)
    }

    // Boost: weather events affecting route
    if (obj.event_type === 'weather_disaster' && obj.movement_impact !== 'none') score = Math.min(1, score * 1.15)

    // Boost: purpose-matched threats
    if (purpose.includes('mining') && obj.event_type === 'armed_conflict') score = Math.min(1, score * 1.20)
    if (purpose.includes('ngo') && ['health_emergency', 'civil_unrest'].includes(obj.event_type)) score = Math.min(1, score * 1.15)

    // Recency boost: fresher events are more operationally relevant
    const ageHours = (now - new Date(obj.event_timestamp).getTime()) / (1000 * 60 * 60)
    const recency = ageHours <= 6 ? 1.10 : ageHours <= 24 ? 1.00 : ageHours <= 48 ? 0.92 : 0.82

    return { ...obj, relevance_score: Math.min(1, Math.round(score * recency * 100) / 100) }
  })
}

// ── Step 8: Remove noise ──────────────────────────────────────────────────────
function removeNoise(intelObjects) {
  return intelObjects.filter(obj =>
    (obj.relevance_score || 0) >= 0.20 &&
    (obj.source_reliability || 0) >= 0.28 &&
    (obj.severity || 0) >= 2
  )
}

// ── Step 9: Prioritize ────────────────────────────────────────────────────────
function prioritize(intelObjects) {
  return [...intelObjects].sort((a, b) => {
    const opScore = (x) => (x.relevance_score || 0) * (x.severity || 1) * (x.source_reliability || 0.5)
    const diff = opScore(b) - opScore(a)
    if (Math.abs(diff) > 0.05) return diff
    return new Date(b.event_timestamp || 0) - new Date(a.event_timestamp || 0)
  })
}

// ── Step 10: Advisory Confidence Score (ACS) ─────────────────────────────────
/**
 * 5-component weighted confidence score (0–100).
 *
 * Evidence Quality:       30  — relevance × severity of top signals
 * Source Reliability:     25  — avg tier/recency score of all signals
 * Historical Correlation: 20  — operational memory depth
 * Data Currency:          15  — recency of freshest live intel
 * Corroboration:          10  — cluster density and diversity
 */
function computeACS(intelObjects, memoryContext, correlations) {
  const c = {
    evidence_quality:       0,
    source_reliability:     0,
    historical_correlation: 0,
    data_currency:          0,
    corroboration:          0,
  }

  const top = intelObjects.slice(0, 6)

  // Evidence quality (30)
  if (top.length) {
    const avg = top.reduce((s, i) => s + (i.relevance_score || 0) * (Math.min(i.severity, 5) / 5), 0) / top.length
    c.evidence_quality = Math.min(30, Math.round(avg * 30 * 10) / 10)
  }

  // Source reliability (25)
  if (intelObjects.length) {
    const avg = intelObjects.reduce((s, i) => s + (i.source_reliability || 0.5), 0) / intelObjects.length
    c.source_reliability = Math.min(25, Math.round(avg * 25 * 10) / 10)
  }

  // Historical correlation (20) — from memory quality score
  const memScore = scoreDataQuality(memoryContext)
  c.historical_correlation = Math.round((memScore / 100) * 20 * 10) / 10

  // Data currency (15)
  if (intelObjects.length) {
    const freshestHours = Math.min(
      ...intelObjects.map(i =>
        (Date.now() - new Date(i.event_timestamp || Date.now()).getTime()) / (1000 * 60 * 60)
      )
    )
    const currencyFactor = freshestHours <= 6 ? 1.0
      : freshestHours <= 24 ? 0.85
      : freshestHours <= 72 ? 0.65
      : 0.40
    c.data_currency = Math.round(currencyFactor * 15 * 10) / 10
  }

  // Corroboration (10)
  if (correlations.length) {
    const avgCorr = correlations.reduce((s, cl) => s + (cl.corroboration_score || 0.5), 0) / correlations.length
    c.corroboration = Math.round(avgCorr * 10 * 10) / 10
  }

  const total = Object.values(c).reduce((s, v) => s + v, 0)
  const score = Math.min(100, Math.round(total))

  return {
    score,
    components: c,
    band: score >= 80 ? 'strong'
        : score >= 60 ? 'moderate'
        : score >= 40 ? 'limited'
        : score >= 20 ? 'weak'
        : 'minimal',
    live_signals_count:     intelObjects.length,
    cluster_count:          correlations.length,
  }
}

// ── Step 11: Format context block for Claude ───────────────────────────────────
function formatContextBlock(intelObjects, correlations, acs, memoryContext, feedsFailed, journey) {
  const lines = ['═══════════════════════════════════════════════════════════',
                 'CAIRO CONTEXT ASSEMBLY — REAL-TIME INTELLIGENCE PACKAGE',
                 '═══════════════════════════════════════════════════════════']

  // Feed status
  lines.push('\nINTELLIGENCE RETRIEVAL STATUS:')
  lines.push(`  Live feed ingestion:  ${feedsFailed ? '⚠ DEGRADED (partial/unavailable)' : '✓ OPERATIONAL'}`)
  lines.push(`  Normalized signals:   ${intelObjects.length}`)
  lines.push(`  Corroboration clusters: ${correlations.length}`)
  lines.push(`  Advisory Confidence Score (ACS): ${acs.score}/100 — ${acs.band.toUpperCase()}`)

  if (feedsFailed) {
    lines.push('\n  ⚠ LIVE FEED DEGRADATION NOTICE:')
    lines.push('    Feed retrieval partially failed. Confidence reduced.')
    lines.push('    Assessment relies on pre-ingested intelligence and operational memory.')
    lines.push('    Reduce advisory confidence by 10–15 points. Flag to operator.')
  }

  // Corroboration clusters (multi-source verified — highest value intelligence)
  if (correlations.length > 0) {
    lines.push('\nCORROBORATED EVENT CLUSTERS (multi-source verified):')
    correlations.slice(0, 5).forEach(cl => {
      const typeLabel = (cl.event_type || 'event').toUpperCase().replace(/_/g, ' ')
      lines.push(`  ▶ [${typeLabel}] ${cl.country}${cl.city ? ` / ${cl.city}` : ''} — ${cl.signal_count} corroborating signals`)
      lines.push(`    Severity: ${cl.severity_consensus}/5 | Corroboration: ${Math.round((cl.corroboration_score || 0) * 100)}% | Movement: ${cl.movement_impact || 'assessed'}`)
      lines.push(`    Active since: ${cl.first_signal_at} | Latest: ${cl.latest_signal_at}`)
      if (cl.is_escalating) lines.push('    ⚠ ESCALATION PATTERN DETECTED — signal trending upward')
    })
  }

  // Prioritized intelligence signals
  if (intelObjects.length > 0) {
    lines.push('\nPRIORITIZED INTELLIGENCE SIGNALS:')
    intelObjects.slice(0, 12).forEach(obj => {
      const tier   = `T${obj.source_tier || '?'}`
      const rel    = `${Math.round((obj.relevance_score || 0) * 100)}% rel`
      const conf   = `${Math.round((obj.confidence || 0) * 100)}% conf`
      const conflict = obj._conflict_detected ? ' ⚠CONFLICT' : ''
      lines.push(`  [SEV ${obj.severity}/5 | ${tier} | ${rel} | ${conf}${conflict}]`)
      lines.push(`  "${obj.raw_title}"`)
      lines.push(`   → ${obj.event_type} | ${obj.country}${obj.city ? '/' + obj.city : ''} | Impact: ${obj.movement_impact} | Source: ${obj.source_name}`)
      lines.push(`   → Timestamp: ${obj.event_timestamp}`)
      if (obj._conflict_detected) {
        lines.push(`   ⚠ CONFLICTING REPORTS: ${obj._conflicting_reports} sources, severity range ${obj._severity_range}. Treat with analytical caution.`)
      }
      if (obj.keywords?.length) {
        lines.push(`   → Keywords: ${obj.keywords.slice(0, 6).join(', ')}`)
      }
    })
  } else {
    lines.push('\nLIVE INTELLIGENCE: No current operational signals retrieved for this location.')
    lines.push('  Increase reliance on historical patterns. Apply precautionary baseline advisories.')
    lines.push('  If destination is typically high-risk, maintain elevated advisory posture.')
  }

  // ACS breakdown
  lines.push('\nADVISORY CONFIDENCE SCORE (ACS) BREAKDOWN:')
  const c = acs.components
  lines.push(`  Evidence quality       ${(c.evidence_quality || 0).toFixed(1)}/30`)
  lines.push(`  Source reliability     ${(c.source_reliability || 0).toFixed(1)}/25`)
  lines.push(`  Historical correlation ${(c.historical_correlation || 0).toFixed(1)}/20`)
  lines.push(`  Data currency          ${(c.data_currency || 0).toFixed(1)}/15`)
  lines.push(`  Corroboration          ${(c.corroboration || 0).toFixed(1)}/10`)
  lines.push(`  ─────────────────────────────────────`)
  lines.push(`  TOTAL: ${acs.score}/100 (${acs.band.toUpperCase()})`)
  lines.push('  Reflect this score directly in confidence_assessment.overall_confidence.')
  lines.push('  Scores below 40 require explicit uncertainty statement in analyst_note.')

  // Operational memory (full historical intelligence block)
  if (memoryContext.dataAvailable && memoryContext.formatted) {
    lines.push('\n' + memoryContext.formatted)
  } else {
    lines.push('\nOPERATIONAL MEMORY: No historical database records for this destination.')
    lines.push('Set confidence scores 20–40 range unless live intel is strong.')
  }

  lines.push('\n═══════════════════════════════════════════════════════════')
  lines.push('END CAIRO CONTEXT ASSEMBLY')
  lines.push('═══════════════════════════════════════════════════════════')

  return lines.join('\n')
}

// ── Low-connectivity fallback ─────────────────────────────────────────────────
function buildFallbackContext(geoContexts, memoryContext) {
  const lines = [
    '═══════════════════════════════════════════════════════════',
    'CAIRO CONTEXT ASSEMBLY — DEGRADED MODE',
    '═══════════════════════════════════════════════════════════',
    '',
    '⚠ LIVE INTELLIGENCE UNAVAILABLE',
    'Feed retrieval failed entirely. Assessment based on:',
    '  - Operational memory (Supabase historical database)',
    '  - Claude training knowledge (Layer 3)',
    '',
    'Confidence penalty: -15 points applied automatically.',
    'All live-signal-dependent scores default to minimum band.',
    'Operator should be notified: live intelligence feed degraded.',
    '',
  ]
  if (memoryContext.dataAvailable && memoryContext.formatted) {
    lines.push(memoryContext.formatted)
  }
  lines.push('═══════════════════════════════════════════════════════════')
  return lines.join('\n')
}

// ── MAIN: Context Assembly Engine ─────────────────────────────────────────────
/**
 * assembleContext(journey)
 *
 * Orchestrates the full intelligence retrieval and packaging pipeline.
 * Single function replacing gatherIntel() + buildMemoryContext() in journey-agent.js.
 *
 * @param {object} journey  { destination, transitPoints, transportModes, purpose, ... }
 * @returns {Promise<object>} Complete context package for injection into Claude
 */
export async function assembleContext(journey) {
  if (!journey?.destination) {
    return {
      formatted: 'No destination specified. Awaiting journey details.',
      intelObjects: [],
      correlations: [],
      memoryContext: { dataAvailable: false },
      realTimeConfidence: { score: 0, band: 'minimal', components: {} },
      dataAvailable: false,
      feedsFailed: false,
      totalArticles: 0,
      stats: { live_signals: 0, corroboration_clusters: 0, memory_incidents: 0, memory_patterns: 0, confidence_score: 0, confidence_band: 'minimal' },
    }
  }

  const geoContexts = buildGeoContexts(journey)

  // ── Retrieve all intelligence layers in parallel ──────────────────────────
  const [liveResult, memResult, storedIntelResult, storedCorrResult, trafficResult] = await Promise.allSettled([
    fetchLiveFeedArticles(geoContexts),
    buildMemoryContext(journey.destination, journey.transitPoints || []),
    fetchStoredIntel(geoContexts),
    fetchStoredCorrelations(geoContexts),
    assembleTrafficContext(journey),
  ])

  const live         = liveResult.status     === 'fulfilled' ? liveResult.value     : { byLocation: {}, feedsFailed: true, totalFetched: 0 }
  const memory       = memResult.status      === 'fulfilled' ? memResult.value      : { dataAvailable: false, formatted: '' }
  const storedIntel  = storedIntelResult.status === 'fulfilled' ? storedIntelResult.value : []
  const storedCorr   = storedCorrResult.status  === 'fulfilled' ? storedCorrResult.value  : []
  const traffic      = trafficResult.status     === 'fulfilled' ? trafficResult.value     : { hasData: false, corridors: [] }

  // Total feed failure + no stored intel = degraded mode
  if (live.feedsFailed && live.totalFetched === 0 && storedIntel.length === 0) {
    const formatted = buildFallbackContext(geoContexts, memory)
    const acs = computeACS([], memory, [])
    return {
      formatted,
      intelObjects: [],
      correlations: storedCorr,
      memoryContext: memory,
      realTimeConfidence: { ...acs, score: Math.max(0, acs.score - 15) },
      dataAvailable: memory.dataAvailable,
      feedsFailed: true,
      totalArticles: 0,
      live_intel_available: false,
      stats: {
        live_signals: 0, corroboration_clusters: storedCorr.length,
        memory_incidents: memory.incidents?.length || 0,
        memory_patterns: memory.patterns?.length || 0,
        confidence_score: Math.max(0, acs.score - 15),
        confidence_band: 'minimal',
      },
    }
  }

  // ── Process pipeline ──────────────────────────────────────────────────────
  const merged   = mergeIntelSources(live.byLocation, storedIntel)
  const deduped  = deduplicateIntel(merged)
  const resolved = resolveConflicts(deduped)

  // Build live correlation clusters
  const liveClusters = correlateEvents(resolved)

  // Merge with stored clusters (avoid duplicates by event_type + country)
  const allCorrelations = [
    ...storedCorr,
    ...liveClusters.filter(lc =>
      !storedCorr.some(sc => sc.event_type === lc.event_type && sc.country === lc.country)
    ),
  ].slice(0, 10)

  // Detect escalation on full intel set
  const escalation = detectEscalation(resolved)

  const scored     = scoreRelevance(resolved, journey)
  const filtered   = removeNoise(scored)
  const prioritized = prioritize(filtered)

  const acs = computeACS(prioritized, memory, allCorrelations)

  let formatted = formatContextBlock(
    prioritized, allCorrelations, acs, memory, live.feedsFailed, journey
  )

  // Append live traffic intelligence if available
  if (traffic.hasData && traffic.formatted) {
    formatted += '\n\n' + traffic.formatted
  }

  const totalArticles = live.totalFetched + storedIntel.length

  return {
    formatted,
    intelObjects:       prioritized,
    correlations:       allCorrelations,
    memoryContext:      memory,
    realTimeConfidence: acs,
    escalation,
    trafficContext:     traffic,
    dataAvailable:      memory.dataAvailable || prioritized.length > 0,
    feedsFailed:        live.feedsFailed,
    live_intel_available: !live.feedsFailed || storedIntel.length > 0,
    totalArticles,
    geoContexts,
    stats: {
      live_signals:             prioritized.length,
      corroboration_clusters:   allCorrelations.length,
      memory_incidents:         memory.incidents?.length || 0,
      memory_patterns:          memory.patterns?.length || 0,
      active_precursors:        memory.activePrecursors?.length || 0,
      confidence_score:         acs.score,
      confidence_band:          acs.band,
      escalation_pattern:       escalation?.pattern || 'unknown',
      total_raw_articles:       totalArticles,
      traffic_corridors:        traffic.corridors?.length || 0,
      traffic_heavy:            traffic.heavyCount || 0,
      traffic_incidents:        traffic.incidentTotal || 0,
    },
  }
}
