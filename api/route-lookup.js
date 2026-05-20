/**
 * GET /api/route-lookup?origin=Nairobi&destination=Mombasa
 *
 * Geocodes origin + destination via HERE Geocoding, then fetches
 * traffic-aware travel times from HERE Routing v8 and Google Routes v2
 * in parallel. Returns combined result for the Plan Route UI.
 */

import { adapt } from './_adapter.js'

const HERE_KEY    = () => process.env.HERE_API_KEY        || ''
const GOOGLE_KEY  = () => process.env.GOOGLE_MAPS_API_KEY || ''
const SB_URL      = () => process.env.SUPABASE_URL        || process.env.VITE_SUPABASE_URL || ''
const SB_KEY      = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

// ── Supabase read helper ──────────────────────────────────────────────────────
async function sbGet(path) {
  if (!SB_URL() || !SB_KEY()) return []
  const res = await fetch(`${SB_URL()}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}` },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return []
  return res.json()
}

// ── Haversine distance (km) ───────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// ── Find nearest corridor to a given origin+destination pair ──────────────────
function nearestCorridor(corridors, origin, dest) {
  let best = null, bestScore = Infinity
  for (const c of corridors) {
    // Score = min distance from our origin to corridor endpoints + same for dest
    const d1 = Math.min(
      haversine(origin.lat, origin.lon, c.origin_lat, c.origin_lon),
      haversine(origin.lat, origin.lon, c.dest_lat,   c.dest_lon)
    )
    const d2 = Math.min(
      haversine(dest.lat, dest.lon, c.origin_lat, c.origin_lon),
      haversine(dest.lat, dest.lon, c.dest_lat,   c.dest_lon)
    )
    const score = d1 + d2
    if (score < bestScore) { bestScore = score; best = { ...c, proximityKm: Math.round(score) } }
  }
  return best
}

// ── Build recommendations from pattern rows ───────────────────────────────────
function buildRecommendations(patterns) {
  // Only use slots with at least 2 samples
  const valid = patterns.filter(p => p.sample_count >= 2)
  if (!valid.length) return null

  // Sort by avg_congestion ASC then avg_delay_secs ASC
  const sorted = [...valid].sort((a,b) =>
    a.avg_congestion - b.avg_congestion || a.avg_delay_secs - b.avg_delay_secs
  )

  // Build hour label
  const hourLabel = h => {
    const period = h < 12 ? 'AM' : 'PM'
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${display}:00 ${period}`
  }

  // Congestion level label
  const levelLabel = r => {
    if (r >= 0.75) return 'standstill'
    if (r >= 0.40) return 'heavy'
    if (r >= 0.20) return 'moderate'
    if (r >= 0.08) return 'low'
    return 'free'
  }

  const best  = sorted.slice(0, 5).map(p => ({
    day:       DAYS[p.day_of_week],
    hour:      p.hour_of_day,
    hourLabel: hourLabel(p.hour_of_day),
    avgDelaySecs: p.avg_delay_secs,
    avgTravelSecs:p.avg_travel_secs,
    level:     levelLabel(p.avg_congestion),
    samples:   p.sample_count,
  }))

  const worst = sorted.slice(-3).reverse().map(p => ({
    day:       DAYS[p.day_of_week],
    hour:      p.hour_of_day,
    hourLabel: hourLabel(p.hour_of_day),
    avgDelaySecs: p.avg_delay_secs,
    level:     levelLabel(p.avg_congestion),
  }))

  // Build a 7×24 grid for the heatmap (only populated hours)
  const grid = {}
  for (const p of valid) {
    const key = `${p.day_of_week}_${p.hour_of_day}`
    grid[key] = { congestion: p.avg_congestion, delay: p.avg_delay_secs, samples: p.sample_count }
  }

  return { best, worst, grid, totalSamples: valid.reduce((s,p) => s + p.sample_count, 0) }
}

// ── HERE Geocoding v1 ─────────────────────────────────────────────────────────
async function geocode(query, key) {
  const url = `https://geocode.search.hereapi.com/v1/geocode?` +
    new URLSearchParams({ q: query, limit: 1, apiKey: key })
  const res  = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!res.ok) throw new Error(`HERE geocode ${res.status}`)
  const data = await res.json()
  const item = data?.items?.[0]
  if (!item) throw new Error(`No geocode result for "${query}"`)
  return {
    lat:     item.position.lat,
    lon:     item.position.lng,
    label:   item.address?.label || query,
    city:    item.address?.city  || query,
    country: item.address?.countryName || '',
  }
}

// ── HERE Routing v8 ───────────────────────────────────────────────────────────
async function hereRoute(origin, dest, key) {
  const url = `https://router.hereapi.com/v8/routes?` +
    new URLSearchParams({
      transportMode: 'car',
      origin:        `${origin.lat},${origin.lon}`,
      destination:   `${dest.lat},${dest.lon}`,
      return:        'summary,typicalDuration',
      apiKey:        key,
    })
  const res     = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`HERE routing ${res.status}`)
  const data    = await res.json()
  const section = data?.routes?.[0]?.sections?.[0]?.summary
  if (!section) throw new Error('No HERE route')

  const travel   = section.duration     || 0
  const freeFlow = section.baseDuration || travel
  const historic = section.typicalDuration || freeFlow
  const delay    = Math.max(0, travel - freeFlow)
  const ratio    = freeFlow > 0 ? +(delay / freeFlow).toFixed(2) : 0

  return { travel, freeFlow, historic, delay, ratio, level: congestionLevel(ratio) }
}

// ── Google Routes v2 ──────────────────────────────────────────────────────────
async function googleRoute(origin, dest, key) {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method:  'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-Goog-Api-Key':   key,
      'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters',
    },
    body: JSON.stringify({
      origin:             { location: { latLng: { latitude: origin.lat, longitude: origin.lon } } },
      destination:        { location: { latLng: { latitude: dest.lat,   longitude: dest.lon   } } },
      travelMode:         'DRIVE',
      routingPreference:  'TRAFFIC_AWARE',
      departureTime:      new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Google Routes ${res.status}: ${body.slice(0, 300)}`)
  }
  const data  = await res.json()
  const route = data?.routes?.[0]
  if (!route) throw new Error('No Google route')

  const travel   = parseInt(route.duration,       10) || 0
  const freeFlow = parseInt(route.staticDuration, 10) || travel
  const delay    = Math.max(0, travel - freeFlow)
  const ratio    = freeFlow > 0 ? +(delay / freeFlow).toFixed(2) : 0
  const distKm   = route.distanceMeters ? Math.round(route.distanceMeters / 100) / 10 : null

  return { travel, freeFlow, delay, ratio, distKm, level: congestionLevel(ratio) }
}

// ── Shared congestion classifier ──────────────────────────────────────────────
function congestionLevel(ratio) {
  if (ratio >= 0.75) return 'standstill'
  if (ratio >= 0.40) return 'heavy'
  if (ratio >= 0.20) return 'moderate'
  if (ratio >= 0.08) return 'low'
  return 'free'
}

// ── Handler ───────────────────────────────────────────────────────────────────
async function _handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { origin: originQ, destination: destQ } = req.query || {}
  if (!originQ || !destQ) return res.status(400).json({ error: 'origin and destination required' })

  const HERE   = HERE_KEY()
  const GOOGLE = GOOGLE_KEY()
  if (!HERE) return res.status(503).json({ error: 'HERE_API_KEY not configured' })

  try {
    // Geocode both + load corridors in parallel
    const [originGeo, destGeo, corridors] = await Promise.all([
      geocode(originQ, HERE),
      geocode(destQ,   HERE),
      sbGet('traffic_corridors?is_active=eq.true&select=id,name,country,origin_lat,origin_lon,dest_lat,dest_lon'),
    ])

    // Route both sources + find nearest corridor + fetch its patterns — all in parallel
    const nearest = Array.isArray(corridors) ? nearestCorridor(corridors, originGeo, destGeo) : null

    const [hereResult, googleResult, patterns] = await Promise.allSettled([
      hereRoute(originGeo, destGeo, HERE),
      GOOGLE ? googleRoute(originGeo, destGeo, GOOGLE) : Promise.resolve(null),
      nearest
        ? sbGet(`traffic_patterns?corridor_id=eq.${nearest.id}&select=day_of_week,hour_of_day,avg_congestion,avg_delay_secs,avg_travel_secs,sample_count&order=avg_congestion.asc`)
        : Promise.resolve([]),
    ])

    if (hereResult.status === 'rejected') throw new Error(`HERE routing failed: ${hereResult.reason?.message}`)
    if (googleResult.status === 'rejected') console.warn('[route-lookup] Google Routes error:', googleResult.reason?.message)

    const here   = hereResult.value
    const google = googleResult.status === 'fulfilled' ? googleResult.value : null

    // Consensus congestion level
    let consensus = here?.level ?? google?.level ?? 'unknown'
    if (here && google && here.level !== google.level) {
      const order = ['free','low','moderate','heavy','standstill']
      consensus = order[Math.max(order.indexOf(here.level), order.indexOf(google.level))]
    }

    const recommendations = Array.isArray(patterns) ? buildRecommendations(patterns) : null

    return res.status(200).json({
      origin:      originGeo,
      destination: destGeo,
      here:        here   ? { ...here,   ok: true } : { ok: false },
      google:      google ? { ...google, ok: true } : { ok: false },
      consensus,
      distKm:         google?.distKm ?? null,
      nearestCorridor: nearest ? { id: nearest.id, name: nearest.name, country: nearest.country, proximityKm: nearest.proximityKm } : null,
      recommendations,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[route-lookup]', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export const handler = adapt(_handler)
export default handler
