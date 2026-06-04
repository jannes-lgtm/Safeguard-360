/**
 * scripts/patch-southern-africa.mjs
 *
 * Africa SE was one bbox — too large for 500-result cap.
 * This splits Southern Africa + East Africa into smaller cells
 * and patches all 3 facility types.
 *
 * Does NOT clear existing rows — appends only.
 *
 * Run:
 *   node --env-file=.env scripts/patch-southern-africa.mjs
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

const BATCH_SIZE = 500
const DELAY_MS   = 4000

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Africa SE split into 4 manageable cells
// [label, west, south, east, north]
const SUB_REGIONS = [
  ['South Africa',    16, -35, 33, -22],
  ['Mozambique/Zim',  32, -27, 41, -15],
  ['East Africa S',   32, -17, 42,  -5],
  ['East Africa N',   32,  -5, 52,  10],
]

const TYPES = {
  hospital: 'amenity=hospital',
  police:   'amenity=police',
  fire:     'amenity=fire_station',
}

const MIRROR = 'https://overpass.openstreetmap.fr/api/interpreter'

async function queryOverpass(tag, w, s, e, n, label) {
  const query = `[out:json][timeout:90];(node[${tag}](${s},${w},${n},${e});way[${tag}](${s},${w},${n},${e}););out center 500;`
  const endpoint = `${MIRROR}?data=${encodeURIComponent(query)}`
  const res = await fetch(endpoint, {
    headers: {
      'Accept':     'application/json',
      'User-Agent': 'SafeGuard360/1.0 (southern-africa-patch; contact@risk360.co)',
    },
    signal: AbortSignal.timeout(95_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return (json.elements || [])
    .map(el => ({
      lat:     el.lat ?? el.center?.lat,
      lon:     el.lon ?? el.center?.lon,
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
  console.log('=== Southern Africa Patch ===\n')

  let grandTotal = 0

  for (const [typeName, tag] of Object.entries(TYPES)) {
    console.log(`\n── ${typeName.toUpperCase()} ──`)
    let typeTotal = 0

    for (const [label, w, s, e, n] of SUB_REGIONS) {
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
        typeTotal += mapped.length
        console.log(` ${mapped.length} inserted`)
      } catch (err) {
        console.log(` FAILED — ${err.message}`)
      }
      process.stdout.write(`  Waiting ${DELAY_MS / 1000}s...`)
      await sleep(DELAY_MS)
      console.log(' done')
    }

    console.log(`  Total ${typeName}: ${typeTotal} added`)
    grandTotal += typeTotal
  }

  console.log(`\n✓ Patch complete. ${grandTotal} facilities added.`)
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
