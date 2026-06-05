/**
 * api/prewarm-facilities.js
 *
 * Nightly cron that pre-populates the Supabase facilities cache for all three
 * types so the first user to open the layer panel sees instant results.
 *
 * Runs at 02:00 UTC daily via vercel.json cron.
 * Secured by CRON_SECRET header (same pattern as other cron endpoints).
 */

import { getSupabaseAdmin } from './_supabase.js'

const OVERPASS_TAGS = {
  hospital: 'amenity=hospital',
  police:   'amenity=police',
  fire:     'amenity=fire_station',
}

const REGIONS = [
  [-18, -35,  52,  38],
  [ 32,  10,  74,  42],
  [-92,   5, -58,  22],
  [-82, -56, -34,  13],
]

const PER_REGION  = 400
const BATCH_SIZE  = 500
const MAX_RESULTS = 2000

async function fetchType(type) {
  const tag   = OVERPASS_TAGS[type]
  const parts = REGIONS.map(([w, s, e, n]) =>
    `node[${tag}](${s},${w},${n},${e});way[${tag}](${s},${w},${n},${e});`
  ).join('')

  const query = `[out:json][timeout:50][maxsize:2000000];(${parts});out center ${PER_REGION * REGIONS.length};`

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `data=${encodeURIComponent(query)}`,
    signal:  AbortSignal.timeout(55_000),
  })

  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
  const json = await res.json()

  return (json.elements || [])
    .map(el => ({
      name:          el.tags?.name || el.tags?.['name:en'] || null,
      facility_type: type,
      lat:           el.lat ?? el.center?.lat,
      lon:           el.lon ?? el.center?.lon,
      city:          el.tags?.['addr:city']    || null,
      country:       el.tags?.['addr:country'] || null,
      source:        'osm',
    }))
    .filter(f => f.lat != null && f.lon != null)
    .slice(0, MAX_RESULTS)
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorised' })
  }

  const sb      = getSupabaseAdmin()
  const results = {}

  for (const type of ['hospital', 'police', 'fire']) {
    try {
      const rows = await fetchType(type)
      if (rows.length > 0) {
        await sb.from('facilities').delete().eq('facility_type', type)
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          await sb.from('facilities').insert(rows.slice(i, i + BATCH_SIZE))
        }
      }
      results[type] = { ok: true, count: rows.length }
    } catch (err) {
      console.error(`[prewarm-facilities] ${type} failed:`, err.message)
      results[type] = { ok: false, error: err.message }
    }
  }

  const allOk = Object.values(results).every(r => r.ok)
  return res.status(allOk ? 200 : 207).json({ results })
}
