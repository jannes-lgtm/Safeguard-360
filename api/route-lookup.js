/**
 * GET /api/route-lookup?origin=Nairobi&destination=Mombasa
 *
 * Geocodes origin + destination via HERE Geocoding, then fetches
 * traffic-aware travel times from HERE Routing v8 and Google Routes v2
 * in parallel. Returns combined result for the Plan Route UI.
 */

import { adapt } from './_adapter.js'

const HERE_KEY   = () => process.env.HERE_API_KEY       || ''
const GOOGLE_KEY = () => process.env.GOOGLE_MAPS_API_KEY || ''

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
  if (!res.ok) throw new Error(`Google Routes ${res.status}`)
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
    // Geocode both in parallel
    const [originGeo, destGeo] = await Promise.all([
      geocode(originQ, HERE),
      geocode(destQ,   HERE),
    ])

    // Route both sources in parallel
    const [hereResult, googleResult] = await Promise.allSettled([
      hereRoute(originGeo, destGeo, HERE),
      GOOGLE ? googleRoute(originGeo, destGeo, GOOGLE) : Promise.resolve(null),
    ])

    const here   = hereResult.status   === 'fulfilled' ? hereResult.value   : null
    const google = googleResult.status === 'fulfilled' ? googleResult.value : null

    // Consensus congestion: if both agree, high confidence; else take the worse reading
    let consensus = here?.level ?? google?.level ?? 'unknown'
    if (here && google && here.level !== google.level) {
      const order = ['free','low','moderate','heavy','standstill']
      const worst = order[Math.max(order.indexOf(here.level), order.indexOf(google.level))]
      consensus = worst
    }

    return res.status(200).json({
      origin:      originGeo,
      destination: destGeo,
      here:        here   ? { ...here,   ok: true  } : { ok: false },
      google:      google ? { ...google, ok: true  } : { ok: false },
      consensus,
      distKm:      google?.distKm ?? null,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[route-lookup]', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export const handler = adapt(_handler)
export default handler
