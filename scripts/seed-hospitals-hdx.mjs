/**
 * scripts/seed-hospitals-hdx.mjs
 *
 * Replaces OSM hospital data with authoritative HDX data from healthsites.io
 * (Ministry of Health verified, used by UN/ICRC/MSF for field operations).
 *
 * Covers: Africa · Middle East · Caribbean · South America
 *
 * Prerequisites:
 *   1. Register at healthsites.io and get a free API key
 *   2. Add HEALTHSITES_API_KEY=your_key to your .env file
 *
 * Run:
 *   node --env-file=.env scripts/seed-hospitals-hdx.mjs
 */

import { createClient } from '@supabase/supabase-js'

const HEALTHSITES_KEY = process.env.HEALTHSITES_API_KEY
if (!HEALTHSITES_KEY) {
  console.error('Missing HEALTHSITES_API_KEY in .env')
  console.error('Register at healthsites.io and add HEALTHSITES_API_KEY=your_key to .env')
  process.exit(1)
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
                 || process.env.SUPABASE_ANON_KEY
                 || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

const API_BASE   = 'https://healthsites.io/api/v2/facilities/'
const PAGE_SIZE  = 100
const BATCH_SIZE = 500
const DELAY_MS   = 1500   // 1.5s between country requests — respect rate limits

// Hospital-type amenity tags to include
const HOSPITAL_TAGS = new Set(['hospital', 'clinic', 'health_centre', 'health_center', 'doctors'])

// Operational regions — ISO2 country codes
const REGIONS = {
  'Africa': [
    'DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CM', 'CF', 'TD',
    'CG', 'CD', 'CI', 'DJ', 'EG', 'ER', 'ET', 'GA', 'GH',
    'GM', 'GN', 'GW', 'KE', 'LS', 'LR', 'LY', 'MG', 'MW',
    'ML', 'MR', 'MZ', 'NA', 'NE', 'NG', 'RW', 'SN', 'SL',
    'SO', 'ZA', 'SS', 'SD', 'TZ', 'TG', 'TN', 'UG', 'ZM', 'ZW',
  ],
  'Middle East': [
    'AE', 'BH', 'IQ', 'JO', 'KW', 'LB', 'OM', 'QA', 'SA', 'SY', 'YE',
  ],
  'Caribbean': [
    'BS', 'BB', 'BZ', 'CU', 'DO', 'GT', 'GY', 'HT', 'HN', 'JM', 'NI', 'PA', 'TT',
  ],
  'South America': [
    'AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'PY', 'PE', 'UY', 'VE',
  ],
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchCountry(countryCode) {
  const facilities = []
  let page = 1
  let totalPages = null

  while (true) {
    const url = new URL(API_BASE)
    url.searchParams.set('api-key',  HEALTHSITES_KEY)
    url.searchParams.set('country',  countryCode)
    url.searchParams.set('page',     page)
    url.searchParams.set('format',   'json')

    let res
    try {
      res = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
        signal:  AbortSignal.timeout(30_000),
      })
    } catch (err) {
      throw new Error(`Network error on page ${page}: ${err.message}`)
    }

    if (res.status === 404) return []   // country has no data
    if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`)

    const json = await res.json()
    const results = json.results || json.features || []

    if (totalPages === null) {
      const count = json.count || 0
      totalPages  = Math.ceil(count / PAGE_SIZE)
    }

    for (const item of results) {
      // Support both v2 and v3 response shapes
      const coords = item.centroid?.coordinates
                  || item.geometry?.coordinates
                  || item.location?.coordinates
      if (!coords || coords.length < 2) continue

      const lon = parseFloat(coords[0])
      const lat = parseFloat(coords[1])
      if (isNaN(lat) || isNaN(lon)) continue

      const attrs   = item.attributes || item.properties || {}
      const amenity = (attrs.amenity || attrs.facility_type || '').toLowerCase()
      if (!HOSPITAL_TAGS.has(amenity) && amenity !== '') {
        // Skip non-hospital types unless amenity is unset (include all by default)
        if (amenity) continue
      }

      facilities.push({
        name:          item.name || attrs.name || attrs['name:en'] || null,
        facility_type: 'hospital',
        lat,
        lon,
        city:          attrs['addr:city']    || attrs.city    || null,
        country:       attrs['addr:country'] || countryCode,
        source:        'hdx',
      })
    }

    if (!results.length || page >= totalPages || !json.next) break
    page++

    // Small delay between pages for same country
    await sleep(300)
  }

  return facilities
}

async function insertBatch(rows) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await sb.from('facilities').insert(rows.slice(i, i + BATCH_SIZE))
    if (error) console.warn('    insert error:', error.message)
  }
}

async function main() {
  console.log('=== Hospital HDX Seed (healthsites.io) ===\n')

  // ── 1. Remove existing OSM hospital data ──────────────────────────────────
  console.log('Clearing existing hospital data...')
  const { error: delErr } = await sb
    .from('facilities')
    .delete()
    .eq('facility_type', 'hospital')
  if (delErr) {
    console.error('Failed to clear hospitals:', delErr.message)
    process.exit(1)
  }
  console.log('Cleared.\n')

  let grandTotal = 0

  // ── 2. Fetch country by country ───────────────────────────────────────────
  for (const [regionName, countries] of Object.entries(REGIONS)) {
    console.log(`\n── ${regionName} ──`)
    let regionTotal = 0

    for (const code of countries) {
      process.stdout.write(`  ${code}...`)

      try {
        const rows = await fetchCountry(code)
        if (rows.length > 0) {
          await insertBatch(rows)
          regionTotal += rows.length
          console.log(` ${rows.length}`)
        } else {
          console.log(' 0 (no data)')
        }
      } catch (err) {
        console.log(` FAILED — ${err.message}`)
      }

      await sleep(DELAY_MS)
    }

    console.log(`  ${regionName} total: ${regionTotal}`)
    grandTotal += regionTotal
  }

  console.log(`\n✓ HDX seed complete. ${grandTotal} hospitals loaded from healthsites.io`)
  console.log('  Data source: healthsites.io (Ministry of Health verified)')
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
