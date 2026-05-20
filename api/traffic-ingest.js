/**
 * POST /api/traffic-ingest  (also runs as Netlify scheduled function)
 *
 * Polls HERE + OSM for all active corridors and stores snapshots in Supabase.
 * Automatically updates traffic_patterns baselines from accumulated data.
 *
 * Schedule: every 30 minutes
 * Manual trigger: POST /api/traffic-ingest  (admin/service only)
 *
 * HERE APIs used:
 *   - Routing API v8     — travel time with/without traffic per corridor
 *   - Traffic API v7     — flow data + incidents within corridor bounding box
 * OSM Overpass:
 *   - Road closures & construction (no key required)
 */

import { adapt } from './_adapter.js'

const HERE_KEY      = () => process.env.HERE_API_KEY    || ''
const GOOGLE_KEY    = () => process.env.GOOGLE_MAPS_API_KEY || ''
const SUPABASE_URL  = () => process.env.SUPABASE_URL    || process.env.VITE_SUPABASE_URL || ''
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

// ── HERE Routing v8: travel time with/without traffic ────────────────────────
async function fetchCorridorTravelTime(corridor, key) {
  const url = `https://router.hereapi.com/v8/routes?` +
    new URLSearchParams({
      transportMode: 'car',
      origin:        `${corridor.origin_lat},${corridor.origin_lon}`,
      destination:   `${corridor.dest_lat},${corridor.dest_lon}`,
      return:        'summary,typicalDuration',
      apiKey:        key,
    })

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`HERE routing ${res.status}`)

  const data = await res.json()
  const section = data?.routes?.[0]?.sections?.[0]?.summary
  if (!section) throw new Error('No route summary')

  const travel   = section.duration         || 0
  const freeFlow = section.baseDuration     || travel  // baseDuration = no-traffic estimate
  const historic = section.typicalDuration  || freeFlow
  const delay    = Math.max(0, travel - freeFlow)
  const ratio    = freeFlow > 0 ? +(delay / freeFlow).toFixed(2) : 0

  let level = 'free'
  if      (ratio >= 0.75) level = 'standstill'
  else if (ratio >= 0.40) level = 'heavy'
  else if (ratio >= 0.20) level = 'moderate'
  else if (ratio >= 0.08) level = 'low'

  return { travel_time_secs: travel, free_flow_secs: freeFlow, historic_secs: historic, delay_secs: delay, congestion_ratio: ratio, congestion_level: level }
}

// ── HERE Traffic v7: incidents within corridor bounding box ───────────────────
async function fetchCorridorIncidents(corridor, key) {
  const latMin = Math.min(corridor.origin_lat, corridor.dest_lat)
  const latMax = Math.max(corridor.origin_lat, corridor.dest_lat)
  const lonMin = Math.min(corridor.origin_lon, corridor.dest_lon)
  const lonMax = Math.max(corridor.origin_lon, corridor.dest_lon)
  const buffer = 0.3

  if ((latMax - latMin + buffer * 2) > MAX_BBOX_DEG || (lonMax - lonMin + buffer * 2) > MAX_BBOX_DEG) {
    return []
  }

  const bbox = `${lonMin - buffer},${latMin - buffer},${lonMax + buffer},${latMax + buffer}`

  const url = `https://data.traffic.hereapi.com/v7/incidents?` +
    new URLSearchParams({ in: `bbox:${bbox}`, apiKey: key })

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []

    const data = await res.json()
    return (data?.results || [])
      .filter(r => r.incidentDetails)
      .map(r => {
        const d = r.incidentDetails
        return {
          source:      'here',
          type:        d.type        || 'INCIDENT',
          category:    d.subType     || null,
          magnitude:   d.criticality ?? null,
          description: d.description?.value || '',
          from:        d.location?.description?.value || '',
          to:          '',
          delay_mins:  d.expectedImpact?.delay ? Math.round(d.expectedImpact.delay / 60) : null,
          road:        d.roadNumbers?.join(', ') || '',
        }
      })
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

// ── Google Routes API v2: traffic-aware travel time (corroboration) ──────────
async function fetchGoogleTravelTime(corridor, key) {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'X-Goog-Api-Key':    key,
      'X-Goog-FieldMask':  'routes.duration,routes.staticDuration',
    },
    body: JSON.stringify({
      origin:      { location: { latLng: { latitude: corridor.origin_lat, longitude: corridor.origin_lon } } },
      destination: { location: { latLng: { latitude: corridor.dest_lat,   longitude: corridor.dest_lon   } } },
      travelMode:         'DRIVE',
      routingPreference:  'TRAFFIC_AWARE',
      departureTime:      new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Google Routes ${res.status}`)

  const data  = await res.json()
  const route = data?.routes?.[0]
  if (!route) throw new Error('No Google route returned')

  // duration / staticDuration come back as strings like "1234s"
  const travel   = parseInt(route.duration,       10) || 0
  const freeFlow = parseInt(route.staticDuration, 10) || travel
  const delay    = Math.max(0, travel - freeFlow)
  const ratio    = freeFlow > 0 ? +(delay / freeFlow).toFixed(2) : 0

  let google_congestion_level = 'free'
  if      (ratio >= 0.75) google_congestion_level = 'standstill'
  else if (ratio >= 0.40) google_congestion_level = 'heavy'
  else if (ratio >= 0.20) google_congestion_level = 'moderate'
  else if (ratio >= 0.08) google_congestion_level = 'low'

  return { google_travel_secs: travel, google_free_flow_secs: freeFlow, google_delay_secs: delay, google_congestion_level }
}

// ── HERE Traffic v7: flow data for corridor bounding box ─────────────────────
async function fetchHereFlow(corridor, key) {
  const latMin = Math.min(corridor.origin_lat, corridor.dest_lat)
  const latMax = Math.max(corridor.origin_lat, corridor.dest_lat)
  const lonMin = Math.min(corridor.origin_lon, corridor.dest_lon)
  const lonMax = Math.max(corridor.origin_lon, corridor.dest_lon)
  const buf    = 0.2

  const bbox = `${lonMin - buf},${latMin - buf},${lonMax + buf},${latMax + buf}`

  const url = `https://data.traffic.hereapi.com/v7/flow?` +
    new URLSearchParams({ in: `bbox:${bbox}`, locationReferencing: 'none', apiKey: key })

  const res = await fetch(url, { signal: AbortSignal.timeout(9000) })
  if (!res.ok) throw new Error(`HERE flow ${res.status}`)

  const data = await res.json()
  const results = data?.results || []
  if (!results.length) return null

  // Aggregate jam factor across all flow segments — weighted by segment count
  let totalJam = 0, totalSpeed = 0, totalFreeFlow = 0, count = 0
  for (const r of results) {
    const cf = r.currentFlow
    if (!cf) continue
    totalJam      += cf.jamFactor      ?? 0
    totalSpeed    += cf.speed          ?? 0
    totalFreeFlow += cf.freeFlow       ?? 0
    count++
  }
  if (!count) return null

  const jamFactor    = +(totalJam      / count).toFixed(2)
  const speedKmh     = +(totalSpeed    / count).toFixed(1)
  const freeFlowKmh  = +(totalFreeFlow / count).toFixed(1)

  // jamFactor 0–10: 0=free, 10=standstill
  let here_congestion_level = 'free'
  if      (jamFactor >= 8) here_congestion_level = 'standstill'
  else if (jamFactor >= 5) here_congestion_level = 'heavy'
  else if (jamFactor >= 3) here_congestion_level = 'moderate'
  else if (jamFactor >= 1) here_congestion_level = 'low'

  return { jam_factor: jamFactor, speed_kmh: speedKmh, free_flow_kmh: freeFlowKmh, here_congestion_level }
}

// ── HERE Traffic v7: incidents for corridor bounding box ──────────────────────
async function fetchHereIncidents(corridor, key) {
  const latMin = Math.min(corridor.origin_lat, corridor.dest_lat)
  const latMax = Math.max(corridor.origin_lat, corridor.dest_lat)
  const lonMin = Math.min(corridor.origin_lon, corridor.dest_lon)
  const lonMax = Math.max(corridor.origin_lon, corridor.dest_lon)
  const buf    = 0.3

  if ((latMax - latMin + buf * 2) > MAX_BBOX_DEG || (lonMax - lonMin + buf * 2) > MAX_BBOX_DEG) return []

  const bbox = `${lonMin - buf},${latMin - buf},${lonMax + buf},${latMax + buf}`

  const url = `https://data.traffic.hereapi.com/v7/incidents?` +
    new URLSearchParams({ in: `bbox:${bbox}`, apiKey: key })

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []

    const data = await res.json()
    return (data?.results || [])
      .filter(r => r.incidentDetails)
      .map(r => {
        const d = r.incidentDetails
        return {
          source:      'here',
          type:        d.type        || 'INCIDENT',
          category:    d.subType     || null,
          description: d.description?.value || '',
          from:        d.location?.description?.value || '',
          to:          '',
          delay_mins:  d.expectedImpact?.delay ? Math.round(d.expectedImpact.delay / 60) : null,
          road:        d.roadNumbers?.join(', ') || '',
          magnitude:   d.criticality ?? null,
        }
      })
  } catch {
    return []
  }
}

// ── OpenStreetMap Overpass: road closures & construction ──────────────────────
async function fetchOsmRoadEvents(corridor) {
  const latMin = Math.min(corridor.origin_lat, corridor.dest_lat)
  const latMax = Math.max(corridor.origin_lat, corridor.dest_lat)
  const lonMin = Math.min(corridor.origin_lon, corridor.dest_lon)
  const lonMax = Math.max(corridor.origin_lon, corridor.dest_lon)
  const buf    = 0.4

  if ((latMax - latMin + buf * 2) > MAX_BBOX_DEG || (lonMax - lonMin + buf * 2) > MAX_BBOX_DEG) return []

  // south,west,north,east — Overpass bbox order
  const bbox = `${latMin - buf},${lonMin - buf},${latMax + buf},${lonMax + buf}`

  const query = `[out:json][timeout:10];
(
  way["highway"]["construction"~"."](${bbox});
  way["highway"]["access"="no"](${bbox});
  way["highway"]["access"="private"](${bbox});
  node["highway"="construction"](${bbox});
  node["barrier"="block"]["highway"~"."](${bbox});
  node["barrier"="road_block"](${bbox});
);
out body;`

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `data=${encodeURIComponent(query)}`,
      signal:  AbortSignal.timeout(12000),
    })
    if (!res.ok) return []

    const data = await res.json()
    const elements = data?.elements || []

    return elements.slice(0, 20).map(el => ({
      source:      'osm',
      type:        el.tags?.construction ? 'CONSTRUCTION' : 'ROAD_CLOSURE',
      description: el.tags?.description || el.tags?.name || el.tags?.construction || el.tags?.barrier || 'Road event',
      road:        el.tags?.['addr:street'] || el.tags?.ref || '',
      osm_id:      el.id,
    })).filter(e => e.description !== 'Road event' || e.road)
  } catch {
    return []
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

// ── Process all corridors ─────────────────────────────────────────────────────
async function processCorridors(corridors, hereKey) {
  const googleKey = GOOGLE_KEY()
  const results   = { success: 0, failed: 0, errors: [] }

  const BATCH = 5
  for (let i = 0; i < corridors.length; i += BATCH) {
    const batch = corridors.slice(i, i + BATCH)
    await Promise.allSettled(
      batch.map(async (corridor) => {
        try {
          // All sources in parallel — any can fail independently
          const [timeData, incData, flowData, osmData, googleData] = await Promise.allSettled([
            fetchCorridorTravelTime(corridor, hereKey),
            fetchCorridorIncidents(corridor, hereKey),
            fetchHereFlow(corridor, hereKey),
            fetchOsmRoadEvents(corridor),
            googleKey ? fetchGoogleTravelTime(corridor, googleKey) : Promise.resolve(null),
          ])

          const time      = timeData.status  === 'fulfilled' ? timeData.value  : null
          const flow      = flowData.status  === 'fulfilled' ? flowData.value  : null
          const google    = googleData.status === 'fulfilled' ? googleData.value : null
          const routeOk   = timeData.status  === 'fulfilled'
          const flowOk    = flowData.status  === 'fulfilled' && flow !== null
          const osmOk     = osmData.status   === 'fulfilled'
          const googleOk  = googleData.status === 'fulfilled' && google !== null

          const hereInc = incData.status === 'fulfilled' ? incData.value : []
          const osmInc  = osmData.status === 'fulfilled' ? osmData.value : []
          const allInc  = [...hereInc, ...osmInc]

          const congestionLevel = time?.congestion_level ?? flow?.here_congestion_level ?? google?.google_congestion_level ?? null

          const snapshot = {
            corridor_id:              corridor.id,
            captured_at:              new Date().toISOString(),
            // HERE Routing — primary travel time
            travel_time_secs:         time?.travel_time_secs  ?? null,
            free_flow_secs:           time?.free_flow_secs    ?? null,
            historic_secs:            time?.historic_secs     ?? null,
            delay_secs:               time?.delay_secs        ?? null,
            congestion_ratio:         time?.congestion_ratio  ?? null,
            congestion_level:         congestionLevel,
            tomtom_ok:                routeOk,
            // HERE Traffic flow
            here_jam_factor:          flow?.jam_factor        ?? null,
            here_speed_kmh:           flow?.speed_kmh         ?? null,
            here_free_flow_kmh:       flow?.free_flow_kmh     ?? null,
            here_ok:                  flowOk,
            // Google Routes — corroboration
            google_travel_secs:       google?.google_travel_secs    ?? null,
            google_free_flow_secs:    google?.google_free_flow_secs ?? null,
            google_delay_secs:        google?.google_delay_secs     ?? null,
            google_congestion_level:  google?.google_congestion_level ?? null,
            google_ok:                googleOk,
            // OSM
            osm_ok:                   osmOk,
            incident_count:           allInc.length,
            incidents:                allInc,
          }

          await sbFetch('traffic_snapshots', {
            method:     'POST',
            prefer:     'return=minimal',
            body:       JSON.stringify(snapshot),
            returnJson: false,
          })

          if (routeOk && time) await updatePattern(corridor.id, time)

          results.success++
        } catch (err) {
          results.failed++
          results.errors.push(`${corridor.name}: ${err.message}`)
        }
      })
    )
    if (i + BATCH < corridors.length) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  return results
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function _handler(req, res) {
  const HERE    = HERE_KEY()
  const SB_URL  = SUPABASE_URL()
  const SB_KEY  = SERVICE_KEY()

  if (!HERE)             return res.status(503).json({ error: 'HERE_API_KEY not configured' })
  if (!SB_URL || !SB_KEY) return res.status(503).json({ error: 'Supabase not configured' })

  const start = Date.now()

  try {
    const corridors = await sbFetch(
      'traffic_corridors?is_active=eq.true&select=id,name,country,origin_lat,origin_lon,dest_lat,dest_lon',
      { returnJson: true }
    )

    if (!Array.isArray(corridors) || corridors.length === 0) {
      return res.status(200).json({ message: 'No active corridors', elapsed: Date.now() - start })
    }

    const results = await processCorridors(corridors, HERE)
    await pruneOldSnapshots()

    const elapsed = Date.now() - start
    console.log(`[traffic-ingest] ${results.success}/${corridors.length} corridors OK in ${elapsed}ms`)
    if (results.errors.length) console.warn('[traffic-ingest] errors:', results.errors)

    return res.status(200).json({
      corridors:   corridors.length,
      success:     results.success,
      failed:      results.failed,
      errors:      results.errors,
      sources:     { here: true, osm: true, google: !!GOOGLE_KEY() },
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
