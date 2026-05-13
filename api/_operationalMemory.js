/**
 * api/_operationalMemory.js
 *
 * Operational Memory and Pattern Analysis Engine for SafeGuard360.
 * Underscore prefix → Vercel does NOT expose this as an API route.
 *
 * Queries the operational_incidents, regional_patterns, precursor_indicators,
 * and risk_evolution_snapshots tables to build a structured historical
 * intelligence context for the Journey Intelligence Agent.
 *
 * Core principle: Surface patterns, precedents, and trends — with confidence
 * scores and uncertainty flags — to INFORM Claude's reasoning. Never assert
 * certainty. The system advises; humans decide.
 */

const SUPABASE_URL = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// ── Supabase REST helper (read-only, service role) ────────────────────────────
async function sbQuery(table, params) {
  const url = `${SUPABASE_URL()}/rest/v1/${table}?${new URLSearchParams(params)}`
  try {
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY(),
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

// ── Country alias normalization ───────────────────────────────────────────────
// Maps common city/country variations to the canonical names used in the DB
const COUNTRY_NORMALISE = {
  'uae':                            'UAE',
  'united arab emirates':           'UAE',
  'dubai':                          'UAE',
  'abu dhabi':                      'UAE',
  'ksa':                            'Saudi Arabia',
  'kingdom of saudi arabia':        'Saudi Arabia',
  'riyadh':                         'Saudi Arabia',
  'drc':                            'Democratic Republic of Congo',
  'congo':                          'Democratic Republic of Congo',
  'kinshasa':                       'Democratic Republic of Congo',
  'goma':                           'Democratic Republic of Congo',
  'rsa':                            'South Africa',
  'johannesburg':                   'South Africa',
  'cape town':                      'South Africa',
  'pretoria':                       'South Africa',
  'lagos':                          'Nigeria',
  'abuja':                          'Nigeria',
  'kano':                           'Nigeria',
  'nairobi':                        'Kenya',
  'mombasa':                        'Kenya',
  'addis ababa':                    'Ethiopia',
  'mogadishu':                      'Somalia',
  'khartoum':                       'Sudan',
  'bamako':                         'Mali',
  'ouagadougou':                    'Burkina Faso',
  'niamey':                         'Niger',
  'beirut':                         'Lebanon',
  'tel aviv':                       'Israel',
  'jerusalem':                      'Israel',
  "sana'a":                         'Yemen',
  'aden':                           'Yemen',
}

function normaliseLocation(input) {
  if (!input) return null
  const key = input.toLowerCase().trim()
  return COUNTRY_NORMALISE[key] || input.trim()
}

// ── Region resolver ───────────────────────────────────────────────────────────
const REGION_MAP = {
  'Nigeria': 'sub-saharan-africa',
  'Kenya': 'sub-saharan-africa',
  'Ethiopia': 'sub-saharan-africa',
  'Somalia': 'sub-saharan-africa',
  'Sudan': 'north-africa',
  'Democratic Republic of Congo': 'sub-saharan-africa',
  'South Africa': 'sub-saharan-africa',
  'Mali': 'sub-saharan-africa',
  'Burkina Faso': 'sub-saharan-africa',
  'Niger': 'sub-saharan-africa',
  'Senegal': 'sub-saharan-africa',
  'Ghana': 'sub-saharan-africa',
  'Côte d\'Ivoire': 'sub-saharan-africa',
  'Cameroon': 'sub-saharan-africa',
  'Chad': 'sub-saharan-africa',
  'Mozambique': 'sub-saharan-africa',
  'Zimbabwe': 'sub-saharan-africa',
  'Tanzania': 'sub-saharan-africa',
  'Uganda': 'sub-saharan-africa',
  'Rwanda': 'sub-saharan-africa',
  'Egypt': 'north-africa',
  'Libya': 'north-africa',
  'Tunisia': 'north-africa',
  'Morocco': 'north-africa',
  'Algeria': 'north-africa',
  'Lebanon': 'mena',
  'Syria': 'mena',
  'Iraq': 'mena',
  'Iran': 'mena',
  'Israel': 'mena',
  'Palestine': 'mena',
  'Jordan': 'mena',
  'Yemen': 'mena',
  'UAE': 'gulf',
  'Saudi Arabia': 'gulf',
  'Qatar': 'gulf',
  'Kuwait': 'gulf',
  'Bahrain': 'gulf',
  'Oman': 'gulf',
}

function getRegion(country) {
  return REGION_MAP[country] || null
}

// ── Query historical incidents for a location ─────────────────────────────────
async function queryHistoricalIncidents(country) {
  if (!country) return []
  const normalised = normaliseLocation(country)

  const incidents = await sbQuery('operational_incidents', {
    country: `eq.${normalised}`,
    order: 'start_date.desc',
    limit: 8,
    select: 'id,title,incident_type,severity,start_date,end_date,is_active,escalation_behavior,operational_impact,movement_impact,precursors_observed,recurrence_risk,recurrence_notes,description',
  })

  return incidents
}

// ── Query regional patterns for a location ────────────────────────────────────
async function queryRegionalPatterns(country) {
  const normalised = normaliseLocation(country)
  const region     = getRegion(normalised) || 'global'

  // Fetch patterns scoped to this country AND generic regional patterns
  const [countryPatterns, regionPatterns, globalPatterns] = await Promise.all([
    sbQuery('regional_patterns', {
      country: `eq.${normalised}`,
      order: 'confidence_score.desc',
      limit: 5,
      select: 'pattern_type,pattern_name,description,typical_severity,trigger_indicators,recurrence_interval,operational_implications,confidence_score',
    }),
    sbQuery('regional_patterns', {
      region: `eq.${region}`,
      country: 'is.null',
      order: 'confidence_score.desc',
      limit: 5,
      select: 'pattern_type,pattern_name,description,typical_severity,trigger_indicators,recurrence_interval,operational_implications,confidence_score',
    }),
    // Always include truly global patterns
    sbQuery('regional_patterns', {
      region: 'eq.global',
      order: 'confidence_score.desc',
      limit: 3,
      select: 'pattern_type,pattern_name,description,typical_severity,trigger_indicators,recurrence_interval,operational_implications,confidence_score',
    }),
  ])

  return [...countryPatterns, ...regionPatterns, ...globalPatterns]
    .filter((p, i, arr) => arr.findIndex(x => x.pattern_name === p.pattern_name) === i)
    .slice(0, 8)
}

// ── Query active precursor indicators ─────────────────────────────────────────
async function queryActivePrecursors(country) {
  const normalised = normaliseLocation(country)
  const region     = getRegion(normalised) || null

  const queries = [
    // Active country-specific
    sbQuery('precursor_indicators', {
      country: `eq.${normalised}`,
      current_status: 'neq.inactive',
      order: 'confidence_score.desc',
      limit: 5,
    }),
    // Active regional
    ...(region ? [sbQuery('precursor_indicators', {
      region: `eq.${region}`,
      country: 'is.null',
      current_status: 'neq.inactive',
      order: 'confidence_score.desc',
      limit: 4,
    })] : []),
    // Global active
    sbQuery('precursor_indicators', {
      region: 'eq.global',
      current_status: 'neq.inactive',
      order: 'confidence_score.desc',
      limit: 3,
    }),
  ]

  const results = await Promise.allSettled(queries)
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
}

// ── Query all precursor definitions (for pattern matching context) ─────────────
async function queryAllPrecursors(country) {
  const normalised = normaliseLocation(country)
  const region     = getRegion(normalised) || null

  const queries = [
    sbQuery('precursor_indicators', {
      country: `eq.${normalised}`,
      order: 'confidence_score.desc',
      limit: 6,
      select: 'indicator_name,indicator_description,associated_outcome,outcome_probability,typical_lead_time_days,current_status,confidence_score',
    }),
    sbQuery('precursor_indicators', {
      region: region ? `eq.${region}` : 'eq.global',
      country: 'is.null',
      order: 'confidence_score.desc',
      limit: 5,
      select: 'indicator_name,indicator_description,associated_outcome,outcome_probability,typical_lead_time_days,current_status,confidence_score',
    }),
    sbQuery('precursor_indicators', {
      region: 'eq.global',
      order: 'confidence_score.desc',
      limit: 4,
      select: 'indicator_name,indicator_description,associated_outcome,outcome_probability,typical_lead_time_days,current_status,confidence_score',
    }),
  ]

  const results = await Promise.allSettled(queries)
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter((p, i, arr) => arr.findIndex(x => x.indicator_name === p.indicator_name) === i)
    .slice(0, 10)
}

// ── Query latest risk evolution snapshot ──────────────────────────────────────
async function queryLatestEvolution(country) {
  const normalised = normaliseLocation(country)
  const results = await sbQuery('risk_evolution_snapshots', {
    country: `eq.${normalised}`,
    order: 'snapshot_date.desc',
    limit: 1,
    select: 'country,snapshot_date,risk_level,trend_direction,trend_acceleration,key_indicators,confidence_score,notes',
  })
  return results[0] || null
}

// ── Build complete memory context for a journey ───────────────────────────────
/**
 * Assembles all historical intelligence for a destination (and transit points)
 * into a structured context block suitable for injection into Claude's prompt.
 *
 * Returns:
 *   {
 *     incidents:  [...],    // Historical events
 *     patterns:   [...],    // Known recurring patterns
 *     precursors: [...],    // Precursor indicators (all, with status)
 *     evolution:  {...},    // Latest trend snapshot
 *     formatted:  string,   // Pre-formatted block for Claude prompt
 *     dataAvailable: bool   // Whether any data was found
 *   }
 */
export async function buildMemoryContext(destination, transitPoints = []) {
  if (!destination) return { dataAvailable: false, formatted: '' }

  const allLocations = [destination, ...transitPoints].filter(Boolean)

  // Fetch all data in parallel for all locations
  const jobs = allLocations.map(async (loc) => {
    const [incidents, patterns, precursors, evolution] = await Promise.allSettled([
      queryHistoricalIncidents(loc),
      queryRegionalPatterns(loc),
      queryAllPrecursors(loc),
      queryLatestEvolution(loc),
    ])
    return {
      location: loc,
      incidents:  incidents.status  === 'fulfilled' ? incidents.value  : [],
      patterns:   patterns.status   === 'fulfilled' ? patterns.value   : [],
      precursors: precursors.status === 'fulfilled' ? precursors.value : [],
      evolution:  evolution.status  === 'fulfilled' ? evolution.value  : null,
    }
  })

  const locationData = await Promise.allSettled(jobs)
  const results = locationData.filter(r => r.status === 'fulfilled').map(r => r.value)

  // Merge and deduplicate across locations
  const allIncidents  = dedup(results.flatMap(r => r.incidents),  'title')
  const allPatterns   = dedup(results.flatMap(r => r.patterns),   'pattern_name')
  const allPrecursors = dedup(results.flatMap(r => r.precursors), 'indicator_name')
  const evolution     = results.find(r => r.evolution)?.evolution || null

  const dataAvailable = allIncidents.length > 0 || allPatterns.length > 0 || evolution !== null

  // ── Format context block for Claude ────────────────────────────────────────
  const lines = ['=== OPERATIONAL MEMORY — HISTORICAL INTELLIGENCE ===']

  // Risk evolution
  if (evolution) {
    lines.push(`\nCURRENT TRAJECTORY (${evolution.country}, as of ${evolution.snapshot_date}):`)
    lines.push(`  Risk level: ${evolution.risk_level} | Trend: ${evolution.trend_direction} | Momentum: ${evolution.trend_acceleration}`)
    if (evolution.key_indicators?.length) {
      lines.push(`  Active indicators: ${evolution.key_indicators.join(', ')}`)
    }
    if (evolution.notes) lines.push(`  Context: ${evolution.notes}`)
    lines.push(`  Confidence: ${evolution.confidence_score}/100`)
  }

  // Historical incidents
  if (allIncidents.length > 0) {
    lines.push('\nHISTORICAL INCIDENTS (most recent first):')
    allIncidents.slice(0, 6).forEach(inc => {
      const status = inc.is_active ? '[ACTIVE]' : `[${inc.start_date}${inc.end_date ? ` – ${inc.end_date}` : ' – ongoing'}]`
      lines.push(`  ${status} ${inc.severity.toUpperCase()} — ${inc.title}`)
      if (inc.description) lines.push(`    ${inc.description.slice(0, 200)}`)
      if (inc.recurrence_risk && inc.recurrence_risk !== 'low') {
        lines.push(`    Recurrence risk: ${inc.recurrence_risk.toUpperCase()} — ${inc.recurrence_notes?.slice(0, 150) || ''}`)
      }
      if (inc.precursors_observed?.length) {
        lines.push(`    Precursors observed: ${inc.precursors_observed.slice(0, 4).join(', ')}`)
      }
    })
  } else {
    lines.push('\nHISTORICAL INCIDENTS: No specific incidents in operational memory database for this location.')
  }

  // Regional patterns
  if (allPatterns.length > 0) {
    lines.push('\nKNOWN RECURRING PATTERNS:')
    allPatterns.slice(0, 6).forEach(p => {
      lines.push(`  [${p.pattern_type?.toUpperCase()}] ${p.pattern_name} (confidence: ${p.confidence_score}/100)`)
      lines.push(`    ${p.description.slice(0, 200)}`)
      if (p.trigger_indicators?.length) {
        lines.push(`    Triggers: ${p.trigger_indicators.slice(0, 4).join(', ')}`)
      }
    })
  }

  // Precursor indicators
  const activePrecursors   = allPrecursors.filter(p => p.current_status !== 'inactive')
  const watchPrecursors    = allPrecursors.filter(p => p.current_status === 'inactive').slice(0, 5)

  if (activePrecursors.length > 0) {
    lines.push('\nACTIVE PRECURSOR SIGNALS (currently elevated):')
    activePrecursors.forEach(p => {
      lines.push(`  ⚠ [${p.outcome_probability?.toUpperCase()} probability, ~${p.typical_lead_time_days}d lead] ${p.indicator_name}`)
      lines.push(`    Associated outcome: ${p.associated_outcome}`)
    })
  }

  if (watchPrecursors.length > 0) {
    lines.push('\nPRECURSOR FRAMEWORK (watch list — not currently active):')
    watchPrecursors.forEach(p => {
      lines.push(`  [${p.indicator_name}] → ${p.associated_outcome} (${p.outcome_probability} probability if activated)`)
    })
  }

  lines.push('\n=== END OPERATIONAL MEMORY ===')

  return {
    incidents:     allIncidents,
    patterns:      allPatterns,
    precursors:    allPrecursors,
    activePrecursors,
    evolution,
    formatted:     lines.join('\n'),
    dataAvailable,
  }
}

// ── Utility: deduplicate by key ───────────────────────────────────────────────
function dedup(arr, key) {
  const seen = new Set()
  return arr.filter(item => {
    const k = item[key]
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// ── Confidence scoring helper — export for use in tests ──────────────────────
/**
 * Weighs available evidence to produce a data quality score (0-100).
 * Higher score = more historical evidence available to inform the advisory.
 */
export function scoreDataQuality(memoryContext) {
  if (!memoryContext.dataAvailable) return 20  // Baseline — Claude knowledge only

  let score = 20  // Base
  if (memoryContext.incidents?.length > 0)       score += Math.min(30, memoryContext.incidents.length * 5)
  if (memoryContext.patterns?.length > 0)        score += Math.min(20, memoryContext.patterns.length * 4)
  if (memoryContext.evolution)                   score += 15
  if (memoryContext.activePrecursors?.length > 0) score += Math.min(15, memoryContext.activePrecursors.length * 5)

  return Math.min(100, score)
}
