/**
 * scripts/patch-missing-regions.mjs
 *
 * Targeted patch for regions that failed or returned 0 in the main seed:
 *   - Africa NW  hospitals  (returned 0)
 *   - Africa NW  police     (returned 0)
 *   - Africa SE  hospitals  (timed out)
 *
 * Does NOT clear existing rows — only appends missing data.
 *
 * Run:
 *   node --env-file=.env scripts/patch-missing-regions.mjs
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
const DELAY_MS   = 5000  // 5s — be extra polite after retrying

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Missing combinations to patch
const PATCHES = [
  { label: 'Africa NW', type: 'hospital', tag: 'amenity=hospital', w: -18, s: 10, e: 17, n: 38 },
  { label: 'Africa NW', type: 'police',   tag: 'amenity=police',   w: -18, s: 10, e: 17, n: 38 },
  { label: 'Africa SE', type: 'hospital', tag: 'amenity=hospital', w: 17,  s: -35, e: 52, n: 10 },
]

// Two mirrors — try main first, fall back to secondary
const MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

async function queryOverpass(tag, w, s, e, n, label) {
  const query = `[out:json][timeout:90];(node[${tag}](${s},${w},${n},${e});way[${tag}](${s},${w},${n},${e}););out center 500;`

  for (const mirror of MIRRORS) {
    const mirrorUrl = `${mirror}?data=${encodeURIComponent(query)}`
    try {
      console.log(`    Trying ${mirror.split('/')[2]}...`)
      const res = await fetch(mirrorUrl, {
        headers: {
          'Accept':     'application/json',
          'User-Agent': 'SafeGuard360/1.0 (facilities-patch; contact@risk360.co)',
        },
        signal: AbortSignal.timeout(95_000),
      })
      if (!res.ok) {
        console.log(`    HTTP ${res.status} — trying next mirror`)
        continue
      }
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
    } catch (err) {
      console.log(`    ${err.message} — trying next mirror`)
    }
  }
  throw new Error(`All mirrors failed for ${label}`)
}

async function insertBatch(rows) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await sb.from('facilities').insert(rows.slice(i, i + BATCH_SIZE))
    if (error) console.warn('  insert error:', error.message)
  }
}

async function main() {
  console.log('=== Facilities Patch — Missing Regions ===\n')

  for (let i = 0; i < PATCHES.length; i++) {
    const { label, type, tag, w, s, e, n } = PATCHES[i]
    process.stdout.write(`\n[${i + 1}/${PATCHES.length}] ${label} / ${type.toUpperCase()}...\n`)

    try {
      const rows = await queryOverpass(tag, w, s, e, n, label)
      const mapped = rows.map(r => ({
        name:          r.name,
        facility_type: type,
        lat:           r.lat,
        lon:           r.lon,
        city:          r.city,
        country:       r.country,
        source:        'osm',
      }))
      await insertBatch(mapped)
      console.log(`  ✓ ${mapped.length} inserted`)
    } catch (err) {
      console.log(`  ✗ FAILED — ${err.message}`)
    }

    if (i < PATCHES.length - 1) {
      process.stdout.write(`  Waiting ${DELAY_MS / 1000}s...\n`)
      await sleep(DELAY_MS)
    }
  }

  console.log('\n✓ Patch complete.')
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
