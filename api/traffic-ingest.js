/**
 * POST /api/traffic-ingest  (also runs as Netlify scheduled function)
 *
 * Polls TomTom for all active corridors and stores snapshots in Supabase.
 * Automatically updates traffic_patterns baselines from accumulated data.
 *
 * Schedule: every 30 minutes (set in netlify.toml)
 * Manual trigger: POST /api/traffic-ingest  (admin/service only)
 *
 * TomTom APIs used:
 *   - Routing API v1  — travel time with/without traffic per corridor
 *   - Traffic Incidents API v5  — incidents within corridor bounding box
 */

import { adapt } from './_adapter.js'

const TOMTOM_KEY    = () => process.env.TOMTOM_API_KEY || ''
const SUPABASE_URL  = () => process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL  || ''
const SERVICE_KEY   = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Max bounding box size (degrees) for incident queries — avoids TomTom bbox limits
const MAX_BBOX_DEG = 4.0

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:         SERVICE_KEY(),
      Authorization:  `Bearer ${SERVICE_KEY()}`,
      'Content-Type': 'application/json',
      Prefer:         opts.prefer || 'return=minimal',
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Supabase ${path} ${res.status}: ${body}`)
  }
  return opts.returnJson !== false ? res.json() : res
}

// ── TomTom: get corridor travel time via Routing API ─────────────────────────
async function fetchCorridorTravelTime(corridor, key) {
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${corridor.origin_lat},${corridor.origin_lon}:${corridor.dest_lat},${corridor.dest_lon}/json?` +
    new URLSearchParams({
      traffic:                 'true',
      travelMode:              'car',
      routeType:               'fastest',
      computeTravelTimeFor:    'all',
      key,
    })

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`TomTom routing ${res.status}`)

  const data = await res.json()
  const summary = data?.routes?.[0]?.summary
  if (!summary) throw new Error('No route summary')

  const travel   = summary.travelTimeInSeconds         || 0
  const freeFlow = summary.noTrafficTravelTimeInSeconds || summary.travelTimeInSeconds || 0
  const historic = summary.historicTrafficTravelTimeInSeconds || freeFlow
  const delay    = Math.max(0, travel - freeFlow)
  const ratio    = freeFlow > 0 ? +(delay / freeFlow).toFixed(2) : 0

  let level = 'free'
  if      (ratio >= 0.75) level = 'standstill'
  else if (ratio >= 0.40) level = 'heavy'
  else if (ratio >= 0.20) level = 'moderate'
  else if (ratio >= 0.08) level = 'low'

  return { travel_time_secs: travel, free_flow_secs: freeFlow, historic_secs: historic, delay_secs: delay, congestion_ratio: ratio, congestion_level: level }
}

// ── TomTom: fetch incidents within corridor bounding box ─────────────────────
async function fetchCorridorIncidents(corridor, key) {
  // Build bounding box with a buffer — skip if corridor is too long
  const latMin = Math.min(corridor.origin_lat, corridor.dest_lat)
  const latMax = Math.max(corridor.origin_lat, corridor.dest_lat)
  const lonMin = Math.min(corridor.origin_lon, corridor.dest_lon)
  const lonMax = Math.max(corridor.origin_lon, corridor.dest_lon)
  const buffer = 0.3

  if ((latMax - latMin + buffer * 2) > MAX_BBOX_DEG || (lonMax - lonMin + buffer * 2) > MAX_BBOX_DEG) {
    // Corridor too long for a single bbox query — skip incidents (travel time still captured)
    return []
  }

  const bbox = `${lonMin - buffer},${latMin - buffer},${lonMax + buffer},${latMax + buffer}`

  const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?` +
    new URLSearchParams({
      bbox,
      fields:   '{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,ageOfData}}}',
      language: 'en-GB',
      key,
    })

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []

    const data = await res.json()
    const incidents = (data?.incidents || [])
      .filter(i => i?.properties?.magnitudeOfDelay >= 2)  // 0=unknown,1=minor,2=moderate,3=major,4=undefined
      .map(i => ({
        type:       i.type || 'INCIDENT',
        category:   i.properties?.iconCategory,
        magnitude:  i.properties?.magnitudeOfDelay,
        description: i.properties?.events?.[0]?.description || '',
        from:       i.properties?.from || '',
        to:         i.properties?.to || '',
        delay_mins: i.properties?.delay ? Math.round(i.properties.delay / 60) : null,
        road:       i.properties?.roadNumbers?.join(', ') || '',
      }))

    return incidents
  } catch {
    return []
  }
}

// ── Update baseline pattern for a corridor ────────────────────────────────────
async function updatePattern(corridorId, snapshot) {
  const now    = new Date()
  const dow    = now.getUTCDay()     // 0=Sun … 6=Sat
  const hour   = now.getUTCHours()   // 0–23

  // Upsert pattern row — running weighted average
  // Uses raw SQL via Supabase RPC or direct upsert with on-conflict update
  const existing = await sbFetch(
    `traffic_patterns?corridor_id=eq.${corridorId}&day_of_week=eq.${dow}&hour_of_day=eq.${hour}&select=id,avg_congestion,avg_delay_secs,avg_travel_secs,sample_count`,
    { returnJson: true }
  ).catch(() => [])

  const prev = Array.isArray(existing) ? existing[0] : null

  if (prev) {
    const n = prev.sample_count + 1
    const avgCong   = +( ((prev.avg_congestion  || 0) * prev.sample_count + (snapshot.congestion_ratio || 0)) / n ).toFixed(3)
    const avgDelay  = Math.round( ((prev.avg_delay_secs  || 0) * prev.sample_count + (snapshot.delay_secs   || 0)) / n )
    const avgTravel = Math.round( ((prev.avg_travel_secs || 0) * prev.sample_count + (snapshot.travel_time_secs || 0)) / n )

    await sbFetch(`traffic_patterns?id=eq.${prev.id}`, {
      method:  'PATCH',
      prefer:  'return=minimal',
      body:    JSON.stringify({ avg_congestion: avgCong, avg_delay_secs: avgDelay, avg_travel_secs: avgTravel, sample_count: n, last_updated: new Date().toISOString() }),
      returnJson: false,
    }).catch(() => {})
  } else {
    await sbFetch('traffic_patterns', {
      method:  'POST',
      prefer:  'return=minimal',
      body:    JSON.stringify({
        corridor_id:    corridorId,
        day_of_week:    dow,
        hour_of_day:    hour,
        avg_congestion: snapshot.congestion_ratio || 0,
        avg_delay_secs: snapshot.delay_secs       || 0,
        avg_travel_secs:snapshot.travel_time_secs || 0,
        sample_count:   1,
        last_updated:   new Date().toISOString(),
      }),
      returnJson: false,
    }).catch(() => {})
  }
}

// ── Prune snapshots older than 30 days ────────────────────────────────────────
async function pruneOldSnapshots() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  await sbFetch(`traffic_snapshots?captured_at=lt.${cutoff}`, {
    method:     'DELETE',
    returnJson: false,
  }).catch(() => {})
}

// ── Process one corridor ───────────────────────────────────────────────────────
async function processCorridors(corridors, key) {
  const results = { success: 0, failed: 0, errors: [] }

  // Process in batches of 5 to avoid rate limits
  const BATCH = 5
  for (let i = 0; i < corridors.length; i += BATCH) {
    const batch = corridors.slice(i, i + BATCH)
    await Promise.allSettled(
      batch.map(async (corridor) => {
        try {
          // Fetch travel time + incidents in parallel
          const [timeData, incidents] = await Promise.allSettled([
            fetchCorridorTravelTime(corridor, key),
            fetchCorridorIncidents(corridor, key),
          ])

          const time      = timeData.status === 'fulfilled' ? timeData.value : null
          const incList   = incidents.status === 'fulfilled' ? incidents.value : []
          const tomtomOk  = timeData.status === 'fulfilled'

          const snapshot = {
            corridor_id:      corridor.id,
            captured_at:      new Date().toISOString(),
            travel_time_secs: time?.travel_time_secs  ?? null,
            free_flow_secs:   time?.free_flow_secs    ?? null,
            historic_secs:    time?.historic_secs     ?? null,
            delay_secs:       time?.delay_secs        ?? null,
            congestion_ratio: time?.congestion_ratio  ?? null,
            congestion_level: time?.congestion_level  ?? null,
            incident_count:   incList.length,
            incidents:        incList,
            tomtom_ok:        tomtomOk,
          }

          // Insert snapshot
          await sbFetch('traffic_snapshots', {
            method:     'POST',
            prefer:     'return=minimal',
            body:       JSON.stringify(snapshot),
            returnJson: false,
          })

          // Update baseline pattern (only when we got valid data)
          if (tomtomOk && time) {
            await updatePattern(corridor.id, time)
          }

          results.success++
        } catch (err) {
          results.failed++
          results.errors.push(`${corridor.name}: ${err.message}`)
        }
      })
    )
    // Small delay between batches to be respectful of rate limits
    if (i + BATCH < corridors.length) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  return results
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function _handler(req, res) {
  const TOMTOM  = TOMTOM_KEY()
  const SB_URL  = SUPABASE_URL()
  const SB_KEY  = SERVICE_KEY()

  if (!TOMTOM)  return res.status(503).json({ error: 'TOMTOM_API_KEY not configured' })
  if (!SB_URL || !SB_KEY) return res.status(503).json({ error: 'Supabase not configured' })

  const start = Date.now()

  try {
    // Load active corridors
    const corridors = await sbFetch(
      'traffic_corridors?is_active=eq.true&select=id,name,country,origin_lat,origin_lon,dest_lat,dest_lon',
      { returnJson: true }
    )

    if (!Array.isArray(corridors) || corridors.length === 0) {
      return res.status(200).json({ message: 'No active corridors', elapsed: Date.now() - start })
    }

    // Process all corridors
    const results = await processCorridors(corridors, TOMTOM)

    // Prune old data
    await pruneOldSnapshots()

    const elapsed = Date.now() - start
    console.log(`[traffic-ingest] ${results.success}/${corridors.length} corridors OK in ${elapsed}ms`)
    if (results.errors.length) console.warn('[traffic-ingest] errors:', results.errors)

    return res.status(200).json({
      corridors: corridors.length,
      success:   results.success,
      failed:    results.failed,
      errors:    results.errors,
      elapsed,
    })

  } catch (err) {
    console.error('[traffic-ingest] fatal:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

// Netlify scheduled function entry point
export const handler = adapt(_handler)
export default _handler
