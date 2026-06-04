/**
 * scripts/patch-east-africa-s-police.mjs
 *
 * Targeted fix: East Africa S / police timed out in patch-southern-africa.mjs
 * because the bbox [32,-17,42,-5] is too large.
 *
 * Fix: split into two smaller cells + retry logic (3 attempts, exponential backoff).
 * Only inserts police. Does not touch any other type or region.
 *
 * Run:
 *   node --env-file=.env scripts/patch-east-africa-s-police.mjs
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

const BATCH_SIZE  = 500
const DELAY_MS    = 5000
const MAX_RETRIES = 3

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// East Africa S split into two cells — each small enough to complete in 90s
// Original too-large bbox: [32, -17, 42, -5]
const CELLS = [
  ['Tanzania West',  32, -17, 37,  -5],   // W Tanzania, Malawi, Zambia edge
  ['Tanzania East',  37, -17, 42,  -5],   // E Tanzania, coast
]

const MIRROR = 'https://overpass.openstreetmap.fr/api/interpreter'

async function queryOverpassWithRetry(tag, w, s, e, n, label) {
  let lastError

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const backoff = attempt > 1 ? attempt * 5000 : 0
    if (backoff > 0) {
      console.log(`    Retry ${attempt}/${MAX_RETRIES} — waiting ${backoff / 1000}s...`)
      await sleep(backoff)
    }

    try {
      const query = `[out:json][timeout:90];(node[${tag}](${s},${w},${n},${e});way[${tag}](${s},${w},${n},${e}););out center 500;`
      const endpoint = `${MIRROR}?data=${encodeURIComponent(query)}`

      const res = await fetch(endpoint, {
        headers: {
          'Accept':     'application/json',
          'User-Agent': 'SafeGuard360/1.0 (east-africa-s-police-patch; contact@risk360.co)',
        },
        signal: AbortSignal.timeout(95_000),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const json = await res.json()
      const rows = (json.elements || [])
        .map(el => ({
          lat:     el.lat ?? el.center?.lat,
          lon:     el.lon ?? el.center?.lon,
          name:    el.tags?.name || el.tags?.['name:en'] || null,
          city:    el.tags?.['addr:city']    || null,
          country: el.tags?.['addr:country'] || null,
        }))
        .filter(f => f.lat != null && f.lon != null)

      return rows // success
    } catch (err) {
      lastError = err
      console.log(`    Attempt ${attempt} failed: ${err.message}`)
    }
  }

  throw new Error(`All ${MAX_RETRIES} attempts failed for ${label}: ${lastError.message}`)
}

async function insertBatch(rows) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await sb.from('facilities').insert(rows.slice(i, i + BATCH_SIZE))
    if (error) console.warn('  insert error:', error.message)
  }
}

async function main() {
  console.log('=== East Africa S — Police Patch ===\n')

  let total = 0

  for (let i = 0; i < CELLS.length; i++) {
    const [label, w, s, e, n] = CELLS[i]
    process.stdout.write(`[${i + 1}/${CELLS.length}] Fetching ${label}...\n`)

    try {
      const rows = await queryOverpassWithRetry('amenity=police', w, s, e, n, label)
      const mapped = rows.map(r => ({
        name:          r.name,
        facility_type: 'police',
        lat:           r.lat,
        lon:           r.lon,
        city:          r.city,
        country:       r.country,
        source:        'osm',
      }))
      await insertBatch(mapped)
      total += mapped.length
      console.log(`  ✓ ${mapped.length} police inserted`)
    } catch (err) {
      console.error(`  ✗ FAILED — ${err.message}`)
    }

    if (i < CELLS.length - 1) {
      process.stdout.write(`  Waiting ${DELAY_MS / 1000}s...\n`)
      await sleep(DELAY_MS)
    }
  }

  console.log(`\n✓ Patch complete. ${total} police stations added for East Africa S.`)
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
