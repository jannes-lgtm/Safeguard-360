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

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

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

// ── Hour label ────────────────────────────────────────────────────────────────
function hourLabel(h) {
  const period = h < 12 ? 'AM' : 'PM'
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${display}:00 ${period}`
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

// ── Summarise historical best/worst from full pattern set ─────────────────────
function summarisePatterns(patterns) {
  const valid = (patterns || []).filter(p => p.sample_count >= 2)
  if (valid.length === 0) return null

  const sorted = [...valid].sort((a, b) =>
    a.avg_congestion - b.avg_congestion || a.avg_delay_secs - b.avg_delay_secs
  )

  const best  = sorted.slice(0, 3).map(p => ({
    day:      DAYS[p.day_of_week],
    hour:     hourLabel(p.hour_of_day),
    travelMins: p.avg_travel_secs ? Math.round(p.avg_travel_secs / 60) : null,
    delayMins:  p.avg_delay_secs  ? Math.round(p.avg_delay_secs / 60)  : 0,
    samples:  p.sample_count,
  }))

  const worst = sorted.slice(-3).reverse().map(p => ({
    day:      DAYS[p.day_of_week],
    hour:     hourLabel(p.hour_of_day),
    delayMins: p.avg_delay_secs ? Math.round(p.avg_delay_secs / 60) : 0,
    samples:  p.sample_count,
  }))

  return { best, worst, totalSamples: valid.reduce((s, p) => s + p.sample_count, 0) }
}

// ── Main: assemble traffic context for a journey ──────────────────────────────
export async function assembleTrafficContext(journey) {
  if (!SUPABASE_URL() || !SERVICE_KEY()) {
    return { formatted: null, corridors: [], hasData: false }
  }

  const geoContexts = [
    journey.destination,
    journey.origin,
    ...(journey.transitPoints || []),
  ].filter(Boolean)

  if (geoContexts.length === 0) return { formatted: null, corridors: [], hasData: false }

  try {
    const allCorridors = await sbQuery(
      'traffic_corridors?is_active=eq.true&select=id,name,country,region,origin_name,dest_name,distance_km,route_type'
    )
    if (!Array.isArray(allCorridors) || allCorridors.length === 0) {
      return { formatted: null, corridors: [], hasData: false }
    }

    const relevant = allCorridors.filter(c => matchesJourney(c, geoContexts))
    if (relevant.length === 0) return { formatted: null, corridors: [], hasData: false }

    const now    = new Date()
    const dow    = now.getUTCDay()
    const hour   = now.getUTCHours()
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

    // "Same time last week" window: ±45 min around exactly 7 days ago
    const sevenDaysAgo     = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const lastWeekFrom     = new Date(sevenDaysAgo.getTime() - 45 * 60 * 1000).toISOString()
    const lastWeekTo       = new Date(sevenDaysAgo.getTime() + 45 * 60 * 1000).toISOString()

    const corridorData = await Promise.allSettled(
      relevant.map(async (corridor) => {
        const [snapshots, currentPattern, allPatterns, lastWeekSnaps] = await Promise.allSettled([
          sbQuery(
            `traffic_snapshots?corridor_id=eq.${corridor.id}&captured_at=gte.${cutoff}&order=captured_at.desc&limit=1` +
            `&select=congestion_level,congestion_ratio,travel_time_secs,free_flow_secs,delay_secs,` +
            `incident_count,incidents,captured_at,here_ok,google_ok,google_travel_secs,google_free_flow_secs,google_congestion_level`
          ),
          sbQuery(
            `traffic_patterns?corridor_id=eq.${corridor.id}&day_of_week=eq.${dow}&hour_of_day=eq.${hour}` +
            `&select=avg_congestion,avg_delay_secs,avg_travel_secs,sample_count`
          ),
          sbQuery(
            `traffic_patterns?corridor_id=eq.${corridor.id}&sample_count=gte.2` +
            `&select=day_of_week,hour_of_day,avg_congestion,avg_delay_secs,avg_travel_secs,sample_count` +
            `&order=avg_congestion.asc`
          ),
          sbQuery(
            `traffic_snapshots?corridor_id=eq.${corridor.id}` +
            `&captured_at=gte.${lastWeekFrom}&captured_at=lte.${lastWeekTo}` +
            `&order=captured_at.desc&limit=1` +
            `&select=travel_time_secs,congestion_level,delay_secs,captured_at`
          ),
        ])

        const snapshot       = snapshots.status       === 'fulfilled' ? snapshots.value?.[0]       : null
        const pattern        = currentPattern.status  === 'fulfilled' ? currentPattern.value?.[0]  : null
        const patternHistory = allPatterns.status     === 'fulfilled' ? allPatterns.value           : []
        const lastWeek       = lastWeekSnaps.status   === 'fulfilled' ? lastWeekSnaps.value?.[0]   : null

        return { corridor, snapshot, pattern, patternHistory, lastWeek }
      })
    )

    const enriched = corridorData
      .filter(r => r.status === 'fulfilled' && r.value.snapshot)
      .map(r => r.value)


    if (enriched.length === 0) return { formatted: null, corridors: [], hasData: false }

    // ── Format context block for Claude ──────────────────────────────────────
    const lines = [
      '═══════════════════════════════════════════════════════════',
      'LIVE TRAFFIC INTELLIGENCE',
      '═══════════════════════════════════════════════════════════',
      `Snapshot time: ${new Date().toUTCString()}`,
      '',
    ]

    const structured = []

    for (const { corridor, snapshot, pattern, patternHistory, lastWeek } of enriched) {
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

      // Google corroboration
      if (snapshot.google_ok && snapshot.google_travel_secs) {
        const gTravel = formatMins(snapshot.google_travel_secs)
        const gLevel  = snapshot.google_congestion_level
        const gDelay  = snapshot.google_free_flow_secs
          ? Math.max(0, Math.round((snapshot.google_travel_secs - snapshot.google_free_flow_secs) / 60))
          : null
        let gLine = `  ↳ Google corroboration: ${gTravel}`
        if (gLevel) gLine += ` [${gLevel.toUpperCase()}]`
        if (gDelay && gDelay > 0) gLine += `, ${gDelay}m delay`
        lines.push(gLine)
      }

      // Same time last week
      if (lastWeek?.travel_time_secs) {
        const lwTravel = formatMins(lastWeek.travel_time_secs)
        const lwDelay  = lastWeek.delay_secs ? `+${Math.round(lastWeek.delay_secs / 60)}m delay` : 'no delay'
        const lwLevel  = lastWeek.congestion_level ? ` [${lastWeek.congestion_level.toUpperCase()}]` : ''
        const lwDate   = new Date(lastWeek.captured_at)
        const lwLabel  = `${DAYS[lwDate.getUTCDay()]} ${hourLabel(lwDate.getUTCHours())}`
        lines.push(`  ↳ Same time last week (${lwLabel}): ${lwTravel}${lwLevel}, ${lwDelay}`)
      }

      // Incidents
      const incidents = Array.isArray(snapshot.incidents) ? snapshot.incidents : []
      for (const inc of incidents.slice(0, 3)) {
        const d  = inc.description || inc.type || 'Incident'
        const dm = inc.delay_mins ? ` (+${inc.delay_mins}m)` : ''
        lines.push(`  ⚠ ${d}${dm}${inc.from ? ` — near ${inc.from}` : ''}`)
      }

      // Historical best travel windows
      const history = summarisePatterns(patternHistory)
      if (history && history.totalSamples >= 4) {
        lines.push(`  Historical best times (${history.totalSamples} observations):`)
        for (const b of history.best) {
          const tStr = b.travelMins ? ` — ~${b.travelMins}m travel` : ''
          const dStr = b.delayMins > 0 ? `, +${b.delayMins}m delay` : ', no delay'
          lines.push(`    ✓ ${b.day} ${b.hour}${tStr}${dStr}`)
        }
        if (history.worst.length > 0) {
          lines.push(`  Times with heaviest congestion:`)
          for (const w of history.worst) {
            lines.push(`    ✗ ${w.day} ${w.hour} — +${w.delayMins}m delay`)
          }
        }
      }

      structured.push({
        name:               corridor.name,
        country:            corridor.country,
        congestion_level:   level,
        congestion_ratio:   snapshot.congestion_ratio,
        travel_time_mins:   snapshot.travel_time_secs  ? Math.round(snapshot.travel_time_secs / 60)  : null,
        delay_mins:         snapshot.delay_secs        ? Math.round(snapshot.delay_secs / 60)        : null,
        google_travel_mins: snapshot.google_travel_secs ? Math.round(snapshot.google_travel_secs / 60) : null,
        google_level:       snapshot.google_congestion_level || null,
        vs_baseline:        baseline,
        incident_count:     snapshot.incident_count || 0,
        incidents,
        sample_count:       samples,
        historical:         history,
        last_week:          lastWeek ? {
          travel_mins:      Math.round(lastWeek.travel_time_secs / 60),
          congestion_level: lastWeek.congestion_level,
          delay_mins:       lastWeek.delay_secs ? Math.round(lastWeek.delay_secs / 60) : 0,
        } : null,
      })
    }

    // Summary stats
    const heavyCount    = structured.filter(c => ['heavy','standstill'].includes(c.congestion_level)).length
    const incidentTotal = structured.reduce((s, c) => s + c.incident_count, 0)

    if (heavyCount > 0) {
      lines.push('')
      lines.push(`⚠ ${heavyCount} corridor(s) with heavy congestion or standstill conditions.`)
    }
    if (incidentTotal > 0) {
      lines.push(`${incidentTotal} active incident(s) across monitored corridors.`)
    }

    lines.push('')
    lines.push('Traffic data: HERE Routing v8 (primary) + Google Routes v2 (corroboration) + OSM Overpass (road events).')
    lines.push('Historical baselines built from rolling ingest observations per corridor.')

    // ── CAIRO event-awareness instruction ────────────────────────────────────
    lines.push('')
    lines.push('─────────────────────────────────────────────────────────────')
    lines.push('TRAFFIC DISRUPTION AWARENESS — CAIRO INSTRUCTION')
    lines.push('─────────────────────────────────────────────────────────────')
    lines.push('Cross-reference live and historical traffic data above against')
    lines.push('all available intel feeds. Flag any of the following if they')
    lines.push('coincide with monitored corridors or the user\'s planned journey:')
    lines.push('  • Public events: conferences, summits, sports fixtures, concerts,')
    lines.push('    religious gatherings, national holidays, parades')
    lines.push('  • Civil unrest: protests, demonstrations, strikes, roadblocks')
    lines.push('  • Security events: VIP motorcades, convoy movements, checkpoints')
    lines.push('  • Infrastructure: road works, bridge closures, diversions,')
    lines.push('    flooding or weather-related route impacts')
    lines.push('If any such event is detected that could affect travel time or')
    lines.push('route safety, include a specific advisory in your response.')
    lines.push('═══════════════════════════════════════════════════════════')

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
