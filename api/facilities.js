/**
 * api/facilities.js
 *
 * Returns a GeoJSON FeatureCollection of emergency-service facilities for our
 * operational regions (Africa · Middle East · Caribbean · Central/South America).
 *
 * Flow:
 *   1. Check Supabase cache (7-day TTL).  If > 100 rows → return from cache.
 *   2. Otherwise fetch from Overpass API, store in Supabase, return fresh data.
 *
 * Query params:
 *   type  — required: "hospital" | "police" | "fire"
 *
 * Env vars required (already present):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { getSupabaseAdmin } from './_supabase.js'

const OVERPASS_TAGS = {
  hospital: 'amenity=hospital',
  police:   'amenity=police',
  fire:     'amenity=fire_station',
}

// [west, south, east, north]
const REGIONS = [
  [-18, -35,  52,  38],   // Africa
  [ 32,  10,  74,  42],   // Middle East
  [-92,   5, -58,  22],   // Caribbean + Central America
  [-82, -56, -34,  13],   // South America
]

const CACHE_TTL_DAYS = 7
const MAX_RESULTS    = 2000
const BATCH_SIZE     = 500

async function fetchFromOverpass(type) {
  const tag = OVERPASS_TAGS[type]

  const parts = REGIONS.map(([w, s, e, n]) =>
    `node[${tag}](${s},${w},${n},${e});way[${tag}](${s},${w},${n},${e});`
  ).join('')

  const query = `[out:json][timeout:45];(${parts});out center ${MAX_RESULTS};`

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `data=${encodeURIComponent(query)}`,
  })

  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)

  const json = await res.json()
  return (json.elements || [])
    .map(el => ({
      name:          el.tags?.name || el.tags?.['name:en'] || null,
      facility_type: type,
      lat:           el.lat  ?? el.center?.lat,
      lon:           el.lon  ?? el.center?.lon,
      city:          el.tags?.['addr:city']    || null,
      country:       el.tags?.['addr:country'] || null,
      source:        'osm',
    }))
    .filter(f => f.lat != null && f.lon != null)
}

function toFeatureCollection(rows) {
  return {
    type: 'FeatureCollection',
    features: rows.map(f => ({
      type:     'Feature',
      geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
      properties: {
        name:          f.name          || 'Unknown',
        facility_type: f.facility_type,
        city:          f.city          || null,
        country:       f.country       || null,
      },
    })),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { type } = req.query
  if (!OVERPASS_TAGS[type]) {
    return res.status(400).json({ error: 'Invalid type. Use: hospital | police | fire' })
  }

  try {
    const sb = getSupabaseAdmin()

    // ── 1. Try cache ────────────────────────────────────────────────────────────
    const ttlCutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: cached, error: cacheErr } = await sb
      .from('facilities')
      .select('id,name,facility_type,lat,lon,city,country')
      .eq('facility_type', type)
      .gte('updated_at', ttlCutoff)
      .limit(MAX_RESULTS)

    if (!cacheErr && cached?.length > 100) {
      res.setHeader('X-Source', 'cache')
      return res.status(200).json(toFeatureCollection(cached))
    }

    // ── 2. Fetch fresh from Overpass ────────────────────────────────────────────
    const facilities = await fetchFromOverpass(type)

    if (facilities.length > 0) {
      await sb.from('facilities').delete().eq('facility_type', type)
      for (let i = 0; i < facilities.length; i += BATCH_SIZE) {
        await sb.from('facilities').insert(facilities.slice(i, i + BATCH_SIZE))
      }
    }

    res.setHeader('X-Source', 'overpass')
    return res.status(200).json(toFeatureCollection(facilities.slice(0, MAX_RESULTS)))
  } catch (err) {
    console.error('[facilities]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
