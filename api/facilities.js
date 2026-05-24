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

const CACHE_TTL_DAYS  = 7
const MAX_RESULTS     = 15000
const PAGE_SIZE       = 1000   // Supabase PostgREST page size — fetch all pages
const PER_REGION      = 400    // limit per region to keep Overpass fast
const BATCH_SIZE      = 500
const OVERPASS_TIMEOUT_MS = 52_000  // 52s — leaves headroom inside 55s maxDuration

async function fetchFromOverpass(type) {
  const tag = OVERPASS_TAGS[type]

  // Query each region separately, cap per-region results, combine
  const parts = REGIONS.map(([w, s, e, n]) =>
    `node[${tag}](${s},${w},${n},${e});way[${tag}](${s},${w},${n},${e});`
  ).join('')

  const query = `[out:json][timeout:50][maxsize:2000000];(${parts});out center ${PER_REGION * REGIONS.length};`

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `data=${encodeURIComponent(query)}`,
    signal:  AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
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

// Fetches all rows for a facility type by paginating through Supabase
// (PostgREST caps each response at its configured max-rows)
async function fetchAllFromCache(sb, type, ttlCutoff) {
  const rows = []
  let from = 0
  while (rows.length < MAX_RESULTS) {
    const query = sb
      .from('facilities')
      .select('id,name,facility_type,lat,lon,city,country,source')
      .eq('facility_type', type)
      .range(from, from + PAGE_SIZE - 1)
    if (ttlCutoff) query.gte('updated_at', ttlCutoff)
    const { data, error } = await query
    if (error || !data?.length) break
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
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
        source:        f.source        || 'osm',
      },
    })),
  }
}

export default async function handler(req, res) {
  // CORS handled by vercel.json — do not override with wildcard
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { type } = req.query
  if (!OVERPASS_TAGS[type]) {
    return res.status(400).json({ error: 'Invalid type. Use: hospital | police | fire' })
  }

  try {
    const sb = getSupabaseAdmin()

    // ── 1. Try fresh cache (within TTL) ────────────────────────────────────────
    const ttlCutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const cached = await fetchAllFromCache(sb, type, ttlCutoff)

    if (cached.length > 100) {
      res.setHeader('X-Source', 'cache')
      res.setHeader('X-Count', cached.length)
      return res.status(200).json(toFeatureCollection(cached))
    }

    // ── 2. Fetch fresh from Overpass ────────────────────────────────────────────
    let facilities = []
    let overpassOk = false
    try {
      facilities = await fetchFromOverpass(type)
      overpassOk = true
    } catch (overpassErr) {
      console.warn(`[facilities] Overpass failed (${overpassErr.message}) — falling back to stale cache`)
    }

    if (overpassOk && facilities.length > 0) {
      // Persist to Supabase cache in background (don't await — return fast)
      sb.from('facilities').delete().eq('facility_type', type)
        .then(() => {
          const rows = facilities.slice(0, MAX_RESULTS)
          const batches = []
          for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE))
          return batches.reduce((p, batch) => p.then(() => sb.from('facilities').insert(batch)), Promise.resolve())
        })
        .catch(e => console.warn('[facilities] cache write failed:', e.message))

      res.setHeader('X-Source', 'overpass')
      return res.status(200).json(toFeatureCollection(facilities.slice(0, MAX_RESULTS)))
    }

    // ── 3. Overpass failed — return stale cache if anything exists ──────────────
    const stale = await fetchAllFromCache(sb, type, null)

    if (stale.length > 0) {
      res.setHeader('X-Source', 'stale-cache')
      res.setHeader('X-Count', stale.length)
      return res.status(200).json(toFeatureCollection(stale))
    }

    return res.status(503).json({ error: 'Facilities data temporarily unavailable — Overpass API timeout' })
  } catch (err) {
    console.error('[facilities]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
