/**
 * api/country-risk-warmup.js
 *
 * CAIRO Country Risk Cache Warmup — Full FCDO Coverage
 *
 * Runs on two schedules (set in vercel.json):
 *   Fast tier  — */15 * * * *  (every 15 min)  → Tier A + B  (~70 countries, Critical/High)
 *   Slow tier  — 10 */3 * * *  (every 3 hours) → Tier C + D  (~150 countries, Medium/Low)
 *
 * Caller passes ?tier=fast or ?tier=slow (defaults to fast).
 *
 * Key behaviour:
 *   • Uses timestamp-first FCDO check — if public_updated_at is unchanged,
 *     the country skips AI invalidation and returns in ~0.3s.
 *   • If FCDO level has genuinely changed, _fcdoAlert.js logs the event to
 *     live_intelligence (GSOC feed) and alerts any affected orgs.
 *   • Tier A (Critical) and Tier B (High) are re-checked every 15 minutes.
 *   • Tier C (Medium) and Tier D (Low/stable) re-checked every 3 hours —
 *     changes here are rare but caught automatically.
 */

import { getCountryRisk } from './country-risk.js'
import { adapt }          from './_adapter.js'

// ─────────────────────────────────────────────────────────────────────────────
// TIER A — Critical risk (FCDO Level 4 or equivalent)
// Checked every 15 minutes
// ─────────────────────────────────────────────────────────────────────────────
const TIER_A = [
  // Africa
  'Somalia', 'South Sudan', 'Sudan', 'Libya', 'Mali', 'Niger', 'Burkina Faso',
  'Central African Republic', 'Democratic Republic of Congo', 'Eritrea', 'Burundi',
  // Middle East
  'Syria', 'Yemen', 'Iraq', 'Iran', 'Israel', 'West Bank',
  // Asia
  'Afghanistan', 'Myanmar',
  // Americas
  'Haiti',
  // Europe
  'Ukraine', 'Russia',
]

// ─────────────────────────────────────────────────────────────────────────────
// TIER B — High risk (FCDO Level 3)
// Checked every 15 minutes
// ─────────────────────────────────────────────────────────────────────────────
const TIER_B = [
  // Africa
  'Nigeria', 'Ethiopia', 'Chad', 'Mozambique', 'Cameroon', 'Togo', 'Benin',
  'Ivory Coast', 'Kenya', 'Tanzania', 'Egypt', 'Algeria', 'Tunisia',
  'Guinea-Bissau', 'Guinea', 'Gabon',
  // Middle East
  'Lebanon', 'Pakistan', 'Jordan', 'Saudi Arabia', 'United Arab Emirates',
  // Americas
  'Guatemala', 'Ecuador', 'Venezuela', 'Colombia', 'Mexico',
  'Honduras', 'Nicaragua', 'Jamaica',
  // Asia
  'India',
  // Europe
  'Turkey',
]

// ─────────────────────────────────────────────────────────────────────────────
// TIER C — Medium risk (FCDO Level 2 or elevated operational presence)
// Checked every 3 hours
// ─────────────────────────────────────────────────────────────────────────────
const TIER_C = [
  // Africa
  'South Africa', 'Ghana', 'Uganda', 'Rwanda', 'Zimbabwe', 'Zambia', 'Angola',
  'Morocco', 'Sierra Leone', 'Liberia', 'Mauritania', 'Madagascar', 'Djibouti',
  'Equatorial Guinea', 'Republic of Congo', 'Eswatini', 'Lesotho', 'Comoros',
  'Malawi', 'Gambia', 'Senegal', 'Namibia', 'Botswana', 'Cape Verde',
  'Sao Tome and Principe', 'Mauritius',
  // Middle East & North Africa
  'Kuwait', 'Bahrain', 'Qatar', 'Oman',
  // Asia
  'China', 'Bangladesh', 'Nepal', 'Sri Lanka', 'Thailand', 'Vietnam',
  'Cambodia', 'Laos', 'Mongolia', 'Indonesia', 'Philippines', 'Malaysia',
  'North Korea', 'Tajikistan', 'Kyrgyzstan', 'Uzbekistan', 'Turkmenistan', 'Kazakhstan',
  // Americas
  'Brazil', 'Peru', 'Bolivia', 'El Salvador', 'Paraguay', 'Cuba',
  'Dominican Republic', 'Trinidad and Tobago', 'Belize', 'Suriname', 'Guyana',
  'Panama', 'Costa Rica', 'Argentina', 'Chile',
  // Europe
  'Belarus', 'Serbia', 'Kosovo', 'Bosnia and Herzegovina', 'Albania',
  'Moldova', 'Georgia', 'Armenia', 'Azerbaijan', 'North Macedonia', 'Montenegro',
  // Africa (remaining)
  'Burkina Faso', // already Tier A but kept as alias-safe
]

// ─────────────────────────────────────────────────────────────────────────────
// TIER D — Low risk (FCDO Level 1 — stable, high-volume travel destinations)
// Checked every 3 hours (same slow cron as Tier C — changes are very rare)
// ─────────────────────────────────────────────────────────────────────────────
const TIER_D = [
  // Europe
  'France', 'Germany', 'Spain', 'Italy', 'Netherlands', 'Belgium', 'Switzerland',
  'Austria', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Portugal', 'Ireland',
  'Poland', 'Czech Republic', 'Hungary', 'Romania', 'Bulgaria', 'Croatia',
  'Slovakia', 'Slovenia', 'Estonia', 'Latvia', 'Lithuania', 'Luxembourg',
  'Malta', 'Cyprus', 'Iceland', 'Greece', 'Ukraine',
  // Asia-Pacific
  'Japan', 'South Korea', 'Singapore', 'Australia', 'New Zealand', 'Taiwan',
  'Hong Kong', 'Brunei', 'Maldives', 'Bhutan',
  // Americas
  'United States', 'Canada', 'Uruguay',
  // Africa (very low risk)
  'Seychelles', 'Tunisia',
]

// De-duplicate across tiers — higher tiers take precedence
function dedup(tiers) {
  const seen = new Set()
  return tiers.map(tier =>
    tier.filter(c => {
      const key = c.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  )
}

const [tierA, tierB, tierC, tierD] = dedup([TIER_A, TIER_B, TIER_C, TIER_D])

const BATCH_SIZE         = 8     // concurrent per wave
const WAVE_DELAY_MS      = 400   // ms between waves
const COUNTRY_TIMEOUT_MS = 14000 // per-country timeout

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function warmCountry(country) {
  try {
    await Promise.race([
      getCountryRisk(country, { forceRefresh: true, checkTimestamp: true }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), COUNTRY_TIMEOUT_MS)
      ),
    ])
    return { country, ok: true }
  } catch (err) {
    return { country, ok: false, error: err.message }
  }
}

async function processBatch(countries) {
  return Promise.allSettled(countries.map(warmCountry))
}

async function runWarmup(countries) {
  const results = { warmed: 0, failed: 0, errors: [] }

  for (let i = 0; i < countries.length; i += BATCH_SIZE) {
    const batch   = countries.slice(i, i + BATCH_SIZE)
    const settled = await processBatch(batch)

    for (const r of settled) {
      const val = r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message }
      if (val.ok) {
        results.warmed++
      } else {
        results.failed++
        if (val.country) results.errors.push(`${val.country}: ${val.error}`)
      }
    }

    if (i + BATCH_SIZE < countries.length) await sleep(WAVE_DELAY_MS)
  }

  return results
}

async function _handler(req, res) {
  const tier    = req.query?.tier || 'fast'
  const start   = Date.now()

  // fast  → Critical + High (Tier A + B) — runs every 15 min
  // slow  → Medium + Low   (Tier C + D) — runs every 3 hours
  const countries = tier === 'slow'
    ? [...tierC, ...tierD]
    : [...tierA, ...tierB]

  const results = await runWarmup(countries)
  const elapsed = Date.now() - start

  console.log(
    `[country-risk-warmup] tier=${tier} warmed=${results.warmed} ` +
    `failed=${results.failed} countries=${countries.length} elapsed=${elapsed}ms`
  )

  return res.status(200).json({
    tier,
    warmed:    results.warmed,
    failed:    results.failed,
    errors:    results.errors,
    total:     countries.length,
    elapsedMs: elapsed,
  })
}

export const handler = adapt(_handler)
export default handler
