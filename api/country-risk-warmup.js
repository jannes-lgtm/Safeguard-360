/**
 * api/country-risk-warmup.js
 *
 * CAIRO Country Risk Cache Warmup
 * Vercel Cron: every hour (5 * * * *)
 *
 * Pre-warms the country risk AI brief cache for all monitored destinations
 * so CAIRO responses are consistently fast. Runs getCountryRisk() for each
 * country — if the cache is still warm it returns instantly; if expired it
 * re-synthesises and stores the fresh brief.
 *
 * Processes countries in small sequential batches to avoid overwhelming
 * the Anthropic API. Tier A (highest-traffic) countries are processed first.
 */

import { getCountryRisk } from './country-risk.js'
import { adapt }          from './_adapter.js'

// ── Countries to keep warm ────────────────────────────────────────────────────
// Tier A — critical/high risk, highest operational activity, always warm
const TIER_A = [
  // Africa — Critical/High
  'Nigeria', 'Ethiopia', 'Democratic Republic of Congo', 'Sudan', 'Somalia',
  'Mali', 'Burkina Faso', 'Niger', 'Chad', 'Mozambique', 'Libya',
  'Central African Republic', 'Burundi', 'Guinea-Bissau', 'Guinea',
  'Cameroon', 'Togo', 'Benin', 'Gabon', 'Eritrea',
  // Middle East — Critical/High
  'Lebanon', 'Yemen', 'Iraq', 'Syria', 'Iran',
  'Israel', 'West Bank', 'United Arab Emirates',
  // Asia — Critical/High
  'Afghanistan', 'Pakistan', 'Myanmar',
  // Americas — Critical/High
  'Haiti', 'Honduras', 'Guatemala', 'Ecuador', 'Nicaragua',
  'Jamaica', 'Venezuela', 'Colombia', 'Mexico',
  // Europe — Critical
  'Ukraine', 'Russia',
]

// Tier B — medium risk, monitored destinations
const TIER_B = [
  // Africa — Medium
  'Kenya', 'South Africa', 'Egypt', 'Tanzania', 'Uganda', 'Ghana',
  'Senegal', 'Rwanda', 'Zimbabwe', 'Zambia', 'Angola', 'Algeria',
  'Tunisia', 'Morocco', 'Sierra Leone', 'Liberia', 'Ivory Coast',
  'Mauritania', 'Madagascar', 'Djibouti', 'Equatorial Guinea',
  'Republic of Congo', 'Eswatini', 'Lesotho', 'Comoros',
  'Malawi', 'Gambia',
  // Middle East — Medium
  'Jordan', 'Saudi Arabia',
  // Americas — Medium
  'Brazil', 'Colombia', 'Peru', 'Bolivia', 'El Salvador',
  'Paraguay', 'Cuba', 'Dominican Republic', 'Trinidad and Tobago',
  'Belize', 'Suriname', 'Guyana',
  // Europe — Medium
  'Turkey',
  // Asia — Medium
  'India', 'Indonesia', 'Philippines',
]

const BATCH_SIZE     = 5    // Countries processed concurrently per wave
const WAVE_DELAY_MS  = 600  // Pause between waves (avoids API bursts)
const COUNTRY_TIMEOUT_MS = 15000  // Per-country timeout

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function warmCountry(country) {
  try {
    await Promise.race([
      // forceRefresh=true: always fetch fresh FCDO, invalidate AI cache if level changed
      getCountryRisk(country, { forceRefresh: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), COUNTRY_TIMEOUT_MS)),
    ])
    return { country, ok: true }
  } catch (err) {
    return { country, ok: false, error: err.message }
  }
}

async function processBatch(countries) {
  return Promise.allSettled(countries.map(warmCountry))
}

async function _handler(req, res) {
  // Allow manual trigger via GET, Vercel cron uses GET
  const start   = Date.now()
  const results = { warmed: 0, failed: 0, errors: [] }

  const allCountries = [...TIER_A, ...TIER_B]

  for (let i = 0; i < allCountries.length; i += BATCH_SIZE) {
    const batch   = allCountries.slice(i, i + BATCH_SIZE)
    const settled = await processBatch(batch)

    for (const r of settled) {
      const val = r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message }
      if (val.ok) {
        results.warmed++
      } else {
        results.failed++
        results.errors.push(`${val.country}: ${val.error}`)
      }
    }

    // Don't delay after the last batch
    if (i + BATCH_SIZE < allCountries.length) {
      await sleep(WAVE_DELAY_MS)
    }
  }

  const elapsed = Date.now() - start
  console.log(`[country-risk-warmup] warmed=${results.warmed} failed=${results.failed} elapsed=${elapsed}ms`)

  return res.status(200).json({
    warmed:   results.warmed,
    failed:   results.failed,
    errors:   results.errors,
    total:    allCountries.length,
    elapsedMs: elapsed,
  })
}

export const handler = adapt(_handler)
export default handler
