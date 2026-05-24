/**
 * api/airfields.js
 *
 * Returns a GeoJSON FeatureCollection of airfields for operational regions:
 * Africa · Middle East · Caribbean · Central/South America
 *
 * Data source: OurAirports (ourairports.com) — same data used by ForeFlight,
 * Garmin Pilot, SkyVector. Free, updated regularly.
 *
 * Flow:
 *   1. Check Supabase cache (30-day TTL — airfield locations rarely change).
 *   2. On miss: fetch CSV from OurAirports, filter to regions, store, return.
 *
 * No query params required. Returns all operational-region airfields.
 */

import { getSupabaseAdmin } from './_supabase.js'

const OURAIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv'
const CACHE_TTL_DAYS  = 30
const BATCH_SIZE      = 500
const MAX_RESULTS     = 15000
const PAGE_SIZE       = 1000  // PostgREST page size — paginate to get all rows

// Bounding boxes [west, south, east, north] — same as facilities.js
const REGIONS = [
  [-18, -35,  52,  38],   // Africa
  [ 32,  10,  74,  42],   // Middle East
  [-92,   5, -58,  22],   // Caribbean + Central America
  [-82, -56, -34,  13],   // South America
]

const EXCLUDED_TYPES = new Set(['closed', 'balloonport'])

function inRegions(lat, lon) {
  return REGIONS.some(([w, s, e, n]) => lat >= s && lat <= n && lon >= w && lon <= e)
}

// Simple quoted-CSV row parser
function parseRow(line) {
  const fields = []
  let current  = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

async function fetchFromOurAirports() {
  const res = await fetch(OURAIRPORTS_URL, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`OurAirports HTTP ${res.status}`)

  const text  = await res.text()
  const lines = text.split('\n')
  const rows  = []

  // Skip header (line 0)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const f = parseRow(line)
    // CSV columns: id,ident,type,name,lat,lon,elevation_ft,continent,iso_country,
    //              iso_region,municipality,scheduled_service,icao_code,iata_code,...
    const type = f[2]
    if (EXCLUDED_TYPES.has(type)) continue

    const lat = parseFloat(f[4])
    const lon = parseFloat(f[5])
    if (isNaN(lat) || isNaN(lon)) continue
    if (!inRegions(lat, lon)) continue

    rows.push({
      ident:         f[1]  || null,
      name:          f[3]  || 'Unknown Airfield',
      airfield_type: type  || 'small_airport',
      lat,
      lon,
      elevation_ft:  parseInt(f[6]) || null,
      country:       f[8]  || null,
      municipality:  f[10] || null,
      iata_code:     f[13] || null,
    })

    if (rows.length >= MAX_RESULTS) break
  }

  return rows
}

async function fetchAllFromCache(sb, ttlCutoff) {
  const rows = []
  let from = 0
  while (rows.length < MAX_RESULTS) {
    const query = sb
      .from('airfields')
      .select('ident,name,airfield_type,lat,lon,elevation_ft,country,municipality,iata_code')
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
        ident:         f.ident         || '',
        name:          f.name          || 'Unknown',
        type:          f.airfield_type || 'small_airport',
        elevation_ft:  f.elevation_ft  ?? null,
        country:       f.country       || '',
        municipality:  f.municipality  || '',
        iata_code:     f.iata_code     || '',
      },
    })),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const sb = getSupabaseAdmin()

    // ── 1. Fresh cache ──────────────────────────────────────────────────────
    const ttlCutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const cached = await fetchAllFromCache(sb, ttlCutoff)

    if (cached.length > 500) {
      res.setHeader('X-Source', 'cache')
      res.setHeader('X-Count', cached.length)
      return res.status(200).json(toFeatureCollection(cached))
    }

    // ── 2. Fetch from OurAirports ───────────────────────────────────────────
    let rows = []
    let fetchOk = false
    try {
      rows   = await fetchFromOurAirports()
      fetchOk = true
    } catch (fetchErr) {
      console.warn('[airfields] OurAirports fetch failed:', fetchErr.message)
    }

    if (fetchOk && rows.length > 0) {
      // Write to Supabase in background
      sb.from('airfields').delete().neq('id', 0)
        .then(() => {
          const batches = []
          for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE))
          return batches.reduce((p, batch) => p.then(() => sb.from('airfields').insert(batch)), Promise.resolve())
        })
        .catch(e => console.warn('[airfields] cache write failed:', e.message))

      res.setHeader('X-Source', 'ourairports')
      res.setHeader('X-Count', rows.length)
      return res.status(200).json(toFeatureCollection(rows))
    }

    // ── 3. Stale cache fallback ─────────────────────────────────────────────
    const stale = await fetchAllFromCache(sb, null)

    if (stale.length > 0) {
      res.setHeader('X-Source', 'stale-cache')
      res.setHeader('X-Count', stale.length)
      return res.status(200).json(toFeatureCollection(stale))
    }

    return res.status(503).json({ error: 'Airfields data temporarily unavailable' })
  } catch (err) {
    console.error('[airfields]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
