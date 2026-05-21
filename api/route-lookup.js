/**
 * GET /api/route-lookup?origin=Nairobi&destination=Mombasa
 * GET /api/route-lookup?originLat=...&originLon=...&destLat=...&destLon=...
 *
 * Geocodes origin + destination via HERE Geocoding, then fetches
 * traffic-aware travel times from HERE Routing v8 and Google Routes v2
 * in parallel. Returns combined result including route geometry (GeoJSON).
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

// ── HERE Flexible Polyline decoder ────────────────────────────────────────────
// Decodes HERE's compact polyline encoding into GeoJSON [lon, lat] coordinate pairs.
const FP_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const FP_DECODE   = Object.fromEntries([...FP_ALPHABET].map((c, i) => [c, i]))

function fpUvarint(enc, idx) {
  let result = 0, shift = 0, i = idx
  while (i < enc.length) {
    const val = FP_DECODE[enc[i++]]
    result |= (val & 0x1f) << shift
    if (!(val & 0x20)) break
    shift += 5
  }
  return { value: result, next: i }
}

function fpSigned(raw) {
  return (raw & 1) ? ~(raw >> 1) : (raw >> 1)
}

function decodeFlexPolyline(encoded) {
  if (!encoded) return null
  try {
    let idx = 0

    const ver = fpUvarint(encoded, idx)
    idx = ver.next
    if (ver.value !== 1) return null

    const hdr = fpUvarint(encoded, idx)
    idx = hdr.next
    const precision = hdr.value & 0x0f
    const thirdDim  = (hdr.value >> 4) & 0x07
    const factor    = Math.pow(10, precision)

    const coords = []
    let lat = 0, lon = 0

    while (idx < encoded.length) {
      const dLat = fpUvarint(encoded, idx); idx = dLat.next
      lat += fpSigned(dLat.value)

      const dLon = fpUvarint(encoded, idx); idx = dLon.next
      lon += fpSigned(dLon.value)

      if (thirdDim) {
        const dZ = fpUvarint(encoded, idx); idx = dZ.next
      }

      coords.push([lon / factor, lat / factor])
    }

    return coords.length ? { type: 'LineString', coordinates: coords } : null
  } catch {
    return null
  }
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
  const valid = patterns.filter(p => p.sample_count >= 2)
  if (!valid.length) return null

  const sorted = [...valid].sort((a,b) =>
    a.avg_congestion - b.avg_congestion || a.avg_delay_secs - b.avg_delay_secs
  )

  const hourLabel = h => {
    const period = h < 12 ? 'AM' : 'PM'
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${display}:00 ${period}`
  }

  const levelLabel = r => {
    if (r >= 0.75) return 'standstill'
    if (r >= 0.40) return 'heavy'
    if (r >= 0.20) return 'moderate'
    if (r >= 0.08) return 'low'
    return 'free'
  }

  const best  = sorted.slice(0, 5).map(p => ({
    day:          DAYS[p.day_of_week],
    hour:         p.hour_of_day,
    hourLabel:    hourLabel(p.hour_of_day),
    avgDelaySecs: p.avg_delay_secs,
    avgTravelSecs:p.avg_travel_secs,
    level:        levelLabel(p.avg_congestion),
    samples:      p.sample_count,
  }))

  const worst = sorted.slice(-3).reverse().map(p => ({
    day:          DAYS[p.day_of_week],
    hour:         p.hour_of_day,
    hourLabel:    hourLabel(p.hour_of_day),
    avgDelaySecs: p.avg_delay_secs,
    level:        levelLabel(p.avg_congestion),
  }))

  const grid = {}
  for (const p of valid) {
    grid[`${p.day_of_week}_${p.hour_of_day}`] = {
      congestion: p.avg_congestion,
      delay:      p.avg_delay_secs,
      samples:    p.sample_count,
    }
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

// ── HERE Reverse Geocoding ────────────────────────────────────────────────────
async function reverseGeocode(lat, lon, key) {
  const url = `https://revgeocode.search.hereapi.com/v1/revgeocode?` +
    new URLSearchParams({ at: `${lat},${lon}`, limit: 1, apiKey: key })
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return { lat, lon, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, city: '', country: '' }
    const data = await res.json()
    const item = data?.items?.[0]
    if (!item) return { lat, lon, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, city: '', country: '' }
    return {
      lat,
      lon,
      label:   item.address?.label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      city:    item.address?.city  || item.address?.county || '',
      country: item.address?.countryName || '',
    }
  } catch {
    return { lat, lon, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, city: '', country: '' }
  }
}

// ── HERE Routing v8 ───────────────────────────────────────────────────────────
async function hereRoute(origin, dest, key) {
  const url = `https://router.hereapi.com/v8/routes?` +
    new URLSearchParams({
      transportMode:  'car',
      origin:         `${origin.lat},${origin.lon}`,
      destination:    `${dest.lat},${dest.lon}`,
      return:         'summary,typicalDuration,polyline',
      alternatives:   '2',
      apiKey:         key,
    })
  const res  = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`HERE routing ${res.status}`)
  const data = await res.json()
  if (!data?.routes?.length) throw new Error('No HERE route')

  const routes = data.routes.map((r, idx) => {
    const section  = r.sections?.[0]
    const summary  = section?.summary
    if (!summary) return null

    const travel   = summary.duration     || 0
    const freeFlow = summary.baseDuration || travel
    const historic = summary.typicalDuration || freeFlow
    const delay    = Math.max(0, travel - freeFlow)
    const ratio    = freeFlow > 0 ? +(delay / freeFlow).toFixed(2) : 0
    const geometry = decodeFlexPolyline(section?.polyline)

    return {
      index:    idx,
      travel,
      freeFlow,
      historic,
      delay,
      ratio,
      level:    congestionLevel(ratio),
      geometry,
      ok:       true,
    }
  }).filter(Boolean)

  if (!routes.length) throw new Error('No HERE route data')

  const primary = routes[0]
  return {
    ...primary,
    alternatives: routes.slice(1),
  }
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
      departureTime:      new Date(Date.now() + 120000).toISOString(),
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

  const {
    origin: originQ,
    destination: destQ,
    originLat, originLon,
    destLat, destLon,
  } = req.query || {}

  const hasOrigin = originQ || (originLat && originLon)
  const hasDest   = destQ   || (destLat   && destLon)
  if (!hasOrigin || !hasDest) {
    return res.status(400).json({ error: 'origin and destination required' })
  }

  const HERE   = HERE_KEY()
  const GOOGLE = GOOGLE_KEY()
  if (!HERE) return res.status(503).json({ error: 'HERE_API_KEY not configured' })

  try {
    // Resolve each endpoint independently — supports mixed text + coordinate inputs
    const resolveOrigin = (originLat && originLon)
      ? reverseGeocode(parseFloat(originLat), parseFloat(originLon), HERE)
      : geocode(originQ, HERE)

    const resolveDest = (destLat && destLon)
      ? reverseGeocode(parseFloat(destLat), parseFloat(destLon), HERE)
      : geocode(destQ, HERE)

    let originGeo, destGeo, corridors
    ;[originGeo, destGeo, corridors] = await Promise.all([
      resolveOrigin,
      resolveDest,
      sbGet('traffic_corridors?is_active=eq.true&select=id,name,country,origin_lat,origin_lon,dest_lat,dest_lon'),
    ])

    const nearest = Array.isArray(corridors) ? nearestCorridor(corridors, originGeo, destGeo) : null

    const [hereResult, googleResult, patterns] = await Promise.allSettled([
      hereRoute(originGeo, destGeo, HERE),
      GOOGLE ? googleRoute(originGeo, destGeo, GOOGLE) : Promise.resolve(null),
      nearest
        ? sbGet(`traffic_patterns?corridor_id=eq.${nearest.id}&select=day_of_week,hour_of_day,avg_congestion,avg_delay_secs,avg_travel_secs,sample_count&order=avg_congestion.asc`)
        : Promise.resolve([]),
    ])

    if (hereResult.status === 'rejected') throw new Error(`HERE routing failed: ${hereResult.reason?.message}`)

    const here        = hereResult.value
    const googleError = googleResult.status === 'rejected' ? googleResult.reason?.message : null
    const google      = googleResult.status === 'fulfilled' ? googleResult.value : null
    if (googleError) console.warn('[route-lookup] Google Routes error:', googleError)

    let consensus = here?.level ?? google?.level ?? 'unknown'
    if (here && google && here.level !== google.level) {
      const order = ['free','low','moderate','heavy','standstill']
      consensus = order[Math.max(order.indexOf(here.level), order.indexOf(google.level))]
    }

    const recommendations = Array.isArray(patterns.value) ? buildRecommendations(patterns.value) : null

    return res.status(200).json({
      origin:      originGeo,
      destination: destGeo,
      here:        here   ? { ...here,   ok: true } : { ok: false },
      google:      google ? { ...google, ok: true } : { ok: false },
      consensus,
      distKm:          google?.distKm ?? null,
      nearestCorridor: nearest ? {
        id:          nearest.id,
        name:        nearest.name,
        country:     nearest.country,
        proximityKm: nearest.proximityKm,
      } : null,
      googleError,
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
