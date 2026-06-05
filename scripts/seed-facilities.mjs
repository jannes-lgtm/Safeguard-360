/**
 * scripts/seed-facilities.mjs
 *
 * One-time seed: fetches hospitals, police stations, and fire stations from
 * Overpass API one region at a time and loads them into Supabase.
 *
 * After this runs, the Vercel /api/facilities endpoint reads from Supabase
 * cache (instant) and only hits Overpass again after 7 days.
 *
 * Run:
 *   node --env-file=.env scripts/seed-facilities.mjs
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
         || process.env.SUPABASE_ANON_KEY
         || process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

const TYPES = {
  hospital: 'amenity=hospital',
  police:   'amenity=police',
  fire:     'amenity=fire_station',
}

// [label, west, south, east, north] — kept small so mirrors don't block us
const REGIONS = [
  // Africa — split into quadrants
  ['Africa NW',   -18,  10,  17,  38],
  ['Africa NE',    17,  10,  52,  38],
  ['Africa SW',   -18, -35,  17,  10],
  ['Africa SE',    17, -35,  52,  10],
  // Middle East — split in two
  ['Middle East W', 32,  10,  53,  42],
  ['Middle East E', 53,  10,  74,  42],
  // Caribbean + Central America
  ['Caribbean',   -92,   5, -58,  22],
  // South America — split in two
  ['S.Am North',  -82, -10, -34,  13],
  ['S.Am South',  -82, -56, -34, -10],
]

const BATCH_SIZE  = 500
const DELAY_MS    = 3000   // 3s between Overpass queries — be polite to the free API

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function queryOverpass(tag, w, s, e, n, label) {
  const query = `[out:json][timeout:60];(node[${tag}](${s},${w},${n},${e});way[${tag}](${s},${w},${n},${e}););out center 500;`
  const url = `https://overpass.openstreetmap.fr/api/interpreter?data=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: {
      'Accept':     'application/json',
      'User-Agent': 'SafeGuard360/1.0 (facilities-seed; contact@risk360.co)',
    },
    signal: AbortSignal.timeout(65_000),
  })
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status} for ${label}`)
  const json = await res.json()
  return (json.elements || [])
    .map(el => ({
      lat: el.lat ?? el.center?.lat,
      lon: el.lon ?? el.center?.lon,
      name:    el.tags?.name || el.tags?.['name:en'] || null,
      city:    el.tags?.['addr:city']    || null,
      country: el.tags?.['addr:country'] || null,
    }))
    .filter(f => f.lat != null && f.lon != null)
}

async function insertBatch(rows) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await sb.from('facilities').insert(rows.slice(i, i + BATCH_SIZE))
    if (error) console.warn('  insert error:', error.message)
  }
}

async function main() {
  console.log('=== Facilities Seed ===\n')

  for (const [typeName, tag] of Object.entries(TYPES)) {
    console.log(`\n── ${typeName.toUpperCase()} ──`)

    // Clear existing
    const { error: delErr } = await sb.from('facilities').delete().eq('facility_type', typeName)
    if (delErr) console.warn('  delete error:', delErr.message)
    else console.log('  Cleared existing rows')

    let total = 0

    for (const [label, w, s, e, n] of REGIONS) {
      process.stdout.write(`  Fetching ${label}...`)
      try {
        const rows = await queryOverpass(tag, w, s, e, n, label)
        const mapped = rows.map(r => ({
          name:          r.name,
          facility_type: typeName,
          lat:           r.lat,
          lon:           r.lon,
          city:          r.city,
          country:       r.country,
          source:        'osm',
        }))
        await insertBatch(mapped)
        total += mapped.length
        console.log(` ${mapped.length} inserted`)
      } catch (err) {
        console.log(` FAILED — ${err.message}`)
      }

      if (label !== REGIONS[REGIONS.length - 1][0]) {
        process.stdout.write(`  Waiting ${DELAY_MS / 1000}s...`)
        await sleep(DELAY_MS)
        console.log(' done')
      }
    }

    console.log(`  Total ${typeName}: ${total} facilities`)
  }

  console.log('\n✓ Seed complete. Vercel will now serve facilities from Supabase cache.')
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
