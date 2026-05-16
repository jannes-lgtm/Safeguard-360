/**
 * api/_trafficContext.js
 *
 * Pulls traffic data from Supabase for corridors relevant to a given journey.
 * Called by _contextAssembly.js during CAIRO context assembly.
 *
 * Returns a formatted traffic intelligence block ready for Claude injection,
 * plus structured data for the stats panel.
 */

const SUPABASE_URL = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// ── Supabase REST helper ──────────────────────────────────────────────────────
async function sbQuery(path) {
  if (!SUPABASE_URL() || !SERVICE_KEY()) return []
  try {
    const res = await fetch(`${SUPABASE_URL()}/rest/v1/${path}`, {
      headers: {
        apikey:         SERVICE_KEY(),
        Authorization:  `Bearer ${SERVICE_KEY()}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

// ── Match corridors to journey locations ──────────────────────────────────────
// Fuzzy-match corridor names/countries against the journey's geo contexts
function matchesJourney(corridor, geoContexts) {
  const haystack = [
    corridor.country?.toLowerCase(),
    corridor.origin_name?.toLowerCase(),
    corridor.dest_name?.toLowerCase(),
    corridor.name?.toLowerCase(),
    corridor.region?.toLowerCase(),
  ].filter(Boolean).join(' ')

  return geoContexts.some(loc => {
    const needle = loc.toLowerCase()
    // Direct match or partial — e.g. "Lagos" matches "Nigeria" via country field
    return haystack.includes(needle) ||
      needle.includes(corridor.country?.toLowerCase() || '__') ||
      needle.includes(corridor.origin_name?.toLowerCase() || '__') ||
      needle.includes(corridor.dest_name?.toLowerCase() || '__')
  })
}

// ── Format travel time into human-readable string ─────────────────────────────
function formatMins(secs) {
  if (!secs) return null
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ── vs-baseline comparison ────────────────────────────────────────────────────
function vsBaseline(current, baseline) {
  if (!current || !baseline || baseline === 0) return null
  const delta = ((current - baseline) / baseline) * 100
  if (Math.abs(delta) < 8) return 'on par with baseline'
  return delta > 0
    ? `${Math.round(delta)}% above baseline`
    : `${Math.abs(Math.round(delta))}% below baseline`
}

// ── Main: assemble traffic context for a journey ──────────────────────────────
export async function assembleTrafficContext(journey) {
  if (!SUPABASE_URL() || !SERVICE_KEY()) {
    return { formatted: null, corridors: [], hasData: false }
  }

  // Build geo contexts from journey
  const geoContexts = [
    journey.destination,
    journey.origin,
    ...(journey.transitPoints || []),
  ].filter(Boolean)

  if (geoContexts.length === 0) return { formatted: null, corridors: [], hasData: false }

  try {
    // Load all active corridors
    const allCorridors = await sbQuery(
      'traffic_corridors?is_active=eq.true&select=id,name,country,region,origin_name,dest_name,distance_km,route_type'
    )
    if (!Array.isArray(allCorridors) || allCorridors.length === 0) {
      return { formatted: null, corridors: [], hasData: false }
    }

    // Filter to corridors relevant to this journey
    const relevant = allCorridors.filter(c => matchesJourney(c, geoContexts))
    if (relevant.length === 0) return { formatted: null, corridors: [], hasData: false }

    // For each relevant corridor: get latest snapshot + baseline pattern
    const now = new Date()
    const dow  = now.getUTCDay()
    const hour = now.getUTCHours()
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // last 2h

    const corridorData = await Promise.allSettled(
      relevant.map(async (corridor) => {
        const [snapshots, patterns] = await Promise.allSettled([
          sbQuery(
            `traffic_snapshots?corridor_id=eq.${corridor.id}&captured_at=gte.${cutoff}&tomtom_ok=eq.true&order=captured_at.desc&limit=1&select=congestion_level,congestion_ratio,travel_time_secs,free_flow_secs,delay_secs,incident_count,incidents,captured_at`
          ),
          sbQuery(
            `traffic_patterns?corridor_id=eq.${corridor.id}&day_of_week=eq.${dow}&hour_of_day=eq.${hour}&select=avg_congestion,avg_delay_secs,avg_travel_secs,sample_count`
          ),
        ])

        const snapshot = snapshots.status === 'fulfilled' ? snapshots.value?.[0] : null
        const pattern  = patterns.status  === 'fulfilled' ? patterns.value?.[0]  : null

        return { corridor, snapshot, pattern }
      })
    )

    const enriched = corridorData
      .filter(r => r.status === 'fulfilled' && r.value.snapshot)
      .map(r => r.value)

    if (enriched.length === 0) return { formatted: null, corridors: [], hasData: false }

    // ── Format context block for Claude ────────────────────────────────────
    const lines = [
      '═══════════════════════════════════════════════════════════',
      'LIVE TRAFFIC INTELLIGENCE',
      '═══════════════════════════════════════════════════════════',
      `Snapshot time: ${new Date().toUTCString()}`,
      '',
    ]

    const structured = []

    for (const { corridor, snapshot, pattern } of enriched) {
      const level    = snapshot.congestion_level || 'unknown'
      const current  = formatMins(snapshot.travel_time_secs)
      const freeFlow = formatMins(snapshot.free_flow_secs)
      const delay    = snapshot.delay_secs ? `${Math.round(snapshot.delay_secs / 60)}m delay` : null
      const baseline = vsBaseline(snapshot.congestion_ratio, pattern?.avg_congestion)
      const samples  = pattern?.sample_count || 0

      const levelLabel = {
        free:       'CLEAR',
        low:        'LIGHT',
        moderate:   'MODERATE',
        heavy:      'HEAVY',
        standstill: 'STANDSTILL',
      }[level] || level.toUpperCase()

      let line = `${corridor.name} [${levelLabel}]`
      if (current)  line += ` — current: ${current}`
      if (freeFlow && freeFlow !== current) line += ` (free-flow: ${freeFlow})`
      if (delay && level !== 'free' && level !== 'low') line += `, ${delay}`
      if (baseline && samples >= 5) line += ` — ${baseline}`
      lines.push(line)

      // Incidents
      const incidents = Array.isArray(snapshot.incidents) ? snapshot.incidents : []
      for (const inc of incidents.slice(0, 3)) {
        const d = inc.description || inc.type || 'Incident'
        const dm = inc.delay_mins ? ` (+${inc.delay_mins}m)` : ''
        lines.push(`  ⚠ ${d}${dm}${inc.from ? ` — near ${inc.from}` : ''}`)
      }

      structured.push({
        name:             corridor.name,
        country:          corridor.country,
        congestion_level: level,
        congestion_ratio: snapshot.congestion_ratio,
        travel_time_mins: snapshot.travel_time_secs ? Math.round(snapshot.travel_time_secs / 60) : null,
        delay_mins:       snapshot.delay_secs ? Math.round(snapshot.delay_secs / 60) : null,
        vs_baseline:      baseline,
        incident_count:   snapshot.incident_count || 0,
        incidents,
        sample_count:     samples,
      })
    }

    // Summary stats for CAIRO
    const heavyCount = structured.filter(c => ['heavy','standstill'].includes(c.congestion_level)).length
    const incidentTotal = structured.reduce((s, c) => s + c.incident_count, 0)

    if (heavyCount > 0) {
      lines.push('')
      lines.push(`⚠ ${heavyCount} corridor(s) with heavy congestion or standstill conditions.`)
    }
    if (incidentTotal > 0) {
      lines.push(`${incidentTotal} active incident(s) across monitored corridors.`)
    }

    lines.push('')
    lines.push('Traffic data sourced from TomTom. Corridor baselines built from historical observations.')

    return {
      formatted:    lines.join('\n'),
      corridors:    structured,
      hasData:      true,
      heavyCount,
      incidentTotal,
    }

  } catch (err) {
    console.warn('[trafficContext] error:', err.message)
    return { formatted: null, corridors: [], hasData: false }
  }
}
