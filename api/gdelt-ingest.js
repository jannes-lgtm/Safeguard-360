/**
 * api/gdelt-ingest.js
 *
 * GDELT Tempo Ingest — 12 batches of 7 countries, spread across each hour.
 *
 * TIER 1 — Critical and High-risk countries (first 30 min of each hour):
 *   batch=1   "0 * * * *"   — 7 countries  (Africa conflict core)
 *   batch=2   "5 * * * *"   — 7 countries  (Middle East + SE Asia)
 *   batch=3   "10 * * * *"  — 7 countries  (Major powers + high-volume)
 *   batch=4   "15 * * * *"  — 7 countries  (Americas + MENA high-risk)
 *   batch=5   "20 * * * *"  — 7 countries  (Africa + Eastern Europe)
 *   batch=6   "25 * * * *"  — 7 countries  (Asia + rest of Tier 1)
 *
 * TIER 2 — Expanded coverage: Africa, Middle East, South America (second 30 min):
 *   batch=7   "32 * * * *"  — 7 countries  (South America core)
 *   batch=8   "37 * * * *"  — 7 countries  (South America + West Africa)
 *   batch=9   "42 * * * *"  — 7 countries  (Central + East Africa)
 *   batch=10  "47 * * * *"  — 7 countries  (East Africa + North Africa)
 *   batch=11  "52 * * * *"  — 7 countries  (Gulf states + Levant)
 *   batch=12  "57 * * * *"  — 7 countries  (Central Asia expansion)
 *
 * Design rationale — why 12 batches of 7, not fewer large batches:
 *   - GDELT rate limit: 1 request per 5 seconds per IP. At 7 countries with a
 *     5.5s inter-request delay, each batch is safely within that limit.
 *   - 7-country hard cap + 22s per-country cap: worst-case runtime is
 *     7 × 22 000 + 6 × 5 500 = 154 000 + 33 000 = 187 000ms — well inside
 *     the 300 000ms Vercel function limit, with 113s of headroom.
 *   - 5-minute gap between Tier 1 batches prevents any cross-batch 429s.
 *   - Tier 2 starts at :32 — 7 min after Tier 1 ends at :25 — keeping the
 *     same clean separation between tiers.
 *   - All 84 countries refresh every 60 minutes. Tier 1 (44 countries) refreshes
 *     in the first 30 min, Tier 2 (40 countries) in the second 30 min.
 *
 * Purpose:
 *   1. Pre-warms the GDELT Redis cache so country-risk.js always gets data
 *      from cache (<100ms) rather than triggering a live 15-20s fetch.
 *   2. Computes a tempoScore per country and stores it.
 *   3. Auto-escalates countries with a news spike (tempoScore > 2.5) into the
 *      fast 15-min FCDO warmup tier for elevated monitoring.
 *   4. De-escalates countries with sustained low tempo — but only when FCDO
 *      level is confirmed below 3. Fails safe if FCDO cache is stale.
 */

import { fetchGdeltSignals, GDELT_RATE_LIMITED } from './_gdelt.js'
import { getEscalatedCountries }                 from './_fcdoAlert.js'
import { sharedCache }                           from './_sharedCache.js'
import { adapt }                                 from './_adapter.js'
import { createClient }                          from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// ── Countries to monitor via GDELT ────────────────────────────────────────────
// 84 countries across 12 batches of 7. MAX_COUNTRIES = 7 is a hard constraint:
// 7 × 22 000 + 6 × 5 500 = 187 000ms worst-case — safe inside 300 000ms limit.
// DO NOT add an 8th country to any batch without recalculating the budget.

// ── TIER 1: Critical & High-risk (batches 1-6, :00-:25 each hour) ─────────────

const BATCH_1 = [  // :00 — Africa conflict core (7)
  'Somalia', 'South Sudan', 'Sudan', 'Libya', 'Mali', 'Niger', 'Burkina Faso',
]
const BATCH_2 = [  // :05 — Central Africa + Middle East + SE Asia (7)
  'Central African Republic', 'Democratic Republic of Congo',
  'Syria', 'Yemen', 'Iraq', 'Afghanistan', 'Myanmar',
]
const BATCH_3 = [  // :10 — Major powers + high-volume (7)
  'Ukraine', 'Russia', 'Iran', 'Nigeria', 'Pakistan', 'Mexico', 'Ethiopia',
]
const BATCH_4 = [  // :15 — Americas + MENA high-risk (7)
  'Haiti', 'Lebanon', 'Venezuela', 'Colombia', 'Egypt', 'India', 'Turkey',
]
const BATCH_5 = [  // :20 — East Africa + Eastern Europe (7)
  'Kenya', 'Mozambique', 'Cameroon', 'Chad', 'Zimbabwe', 'Israel', 'Belarus',
]
const BATCH_6 = [  // :25 — Caucasus + South/SE Asia (7)
  'Azerbaijan', 'Philippines', 'Indonesia', 'Saudi Arabia', 'Bangladesh', 'North Korea', 'Tunisia',
]

// ── TIER 2: Expanded regional coverage (batches 7-12, :32-:57 each hour) ──────
// Tier 2 starts at :32 — 7 minutes after Tier 1 ends at :25 —
// ensuring no cross-tier GDELT rate-limit collisions.

const BATCH_7 = [  // :32 — South America core (7)
  'Serbia', 'Georgia', 'Brazil', 'Argentina', 'Peru', 'Ecuador', 'Bolivia',
]
const BATCH_8 = [  // :37 — Southern Cone + West Africa (7)
  'Chile', 'Paraguay', 'Uruguay', 'South Africa', 'Ghana', 'Senegal', 'Ivory Coast',
]
const BATCH_9 = [  // :42 — West + Central + East Africa (7)
  'Guinea', 'Liberia', 'Sierra Leone', 'Uganda', 'Tanzania', 'Rwanda', 'Angola',
]
const BATCH_10 = [  // :47 — East Africa + North Africa (7)
  'Zambia', 'Congo', 'Eritrea', 'Djibouti', 'Morocco', 'Algeria', 'Burundi',
]
const BATCH_11 = [  // :52 — Gulf states + Levant (7)
  'Madagascar', 'Malawi', 'UAE', 'Qatar', 'Jordan', 'Kuwait', 'Oman',
]
const BATCH_12 = [  // :57 — Central Asia (7)
  'Bahrain', 'Armenia', 'Kazakhstan', 'Kyrgyzstan', 'Tajikistan', 'Uzbekistan', 'Turkmenistan',
]

const BATCH_MAP = {
   1: BATCH_1,  2: BATCH_2,  3: BATCH_3,  4: BATCH_4,
   5: BATCH_5,  6: BATCH_6,  7: BATCH_7,  8: BATCH_8,
   9: BATCH_9, 10: BATCH_10, 11: BATCH_11, 12: BATCH_12,
}

// ── Runtime budget ────────────────────────────────────────────────────────────
// Hard limit: N × PER_COUNTRY_CAP + (N-1) × BATCH_DELAY < 300 000ms
// Worst case (7 countries × 22s cap): 7×22000 + 6×5500 = 187 000ms ✓ (113s headroom)
const MAX_COUNTRIES = 7

// ── Thresholds ────────────────────────────────────────────────────────────────
const SPIKE_THRESHOLD      = 2.5   // tempoScore — add to fast 15-min tier
const ELEVATED_THRESHOLD   = 1.5   // tempoScore — log as elevated
const DEESCALATE_THRESHOLD = 0.8   // tempoScore — consider removing from escalated
const DEESCALATE_READINGS  = 2     // consecutive low readings before de-escalating

// ── Timing ────────────────────────────────────────────────────────────────────
const BATCH_SIZE      = 1      // sequential — GDELT rate limit: 1 req/5s
const BATCH_DELAY     = 5500   // ms between countries — 5.5s > 5s minimum
const PER_COUNTRY_CAP = 22000  // ms — matches GDELT's full response window (15-20s typical)

// ── Distributed lock ─────────────────────────────────────────────────────────
// Prevents overlapping runs (e.g. manual trigger + cron firing simultaneously).
// Lock is per-batch so batch=1 and batch=2 can run concurrently without conflict.
// Uses Redis SET NX EX when available; in-memory check-then-set as fallback.
const INGEST_LOCK_TTL = 310 * 1000   // 310s — slightly above maxDuration

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Supabase admin client ─────────────────────────────────────────────────────
function getAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY)
}

// ── Escalated-set batch write ─────────────────────────────────────────────────
// Called ONCE at end of the handler — single Supabase upsert for all changes.
const ESCALATED_KEY = 'fcdo-escalated'

async function batchUpdateEscalatedSet(currentList, toAdd, toRemove) {
  if (!SUPABASE_URL || !SERVICE_KEY) return
  if (!toAdd.length && !toRemove.length) return
  try {
    const sb = getAdmin()

    // De-escalation safety check: only remove a country if FCDO confirms level < 3.
    // If the FCDO cache entry is MISSING (expired) we cannot confirm it's safe
    // to remove — fail safe by keeping the country in the elevated set.
    const safeToRemove = []
    for (const country of toRemove) {
      const fcdoKey    = `fcdo:${country.toLowerCase().replace(/\s+/g, '-')}`
      const fcdoCached = await sharedCache.get(fcdoKey)
      if (fcdoCached === null) {
        // Cache miss — cannot confirm FCDO level is safe. Keep elevated.
        console.log(`[gdelt-ingest] De-escalation skipped for ${country} — FCDO cache expired, failing safe`)
        continue
      }
      if (fcdoCached?.level && fcdoCached.level >= 3) {
        console.log(`[gdelt-ingest] De-escalation blocked for ${country} — FCDO level ${fcdoCached.level}`)
        continue
      }
      safeToRemove.push(country)
    }

    const currentLower = currentList.map(c => c.toLowerCase())
    const additions    = toAdd.filter(c => !currentLower.includes(c.toLowerCase()))
    const removeLower  = safeToRemove.map(c => c.toLowerCase())
    const updated      = [
      ...currentList.filter(c => !removeLower.includes(c.toLowerCase())),
      ...additions,
    ]

    if (!additions.length && !safeToRemove.length) return

    await sb.from('api_cache').upsert(
      { key: ESCALATED_KEY, value: { countries: updated }, expires_at: null },
      { onConflict: 'key' }
    )
    if (additions.length)    console.log(`[gdelt-ingest] Escalated to fast-check: ${additions.join(', ')}`)
    if (safeToRemove.length) console.log(`[gdelt-ingest] De-escalated from fast-check: ${safeToRemove.join(', ')}`)
  } catch (e) {
    console.warn('[gdelt-ingest] escalated-set batch update failed:', e.message)
  }
}

// ── Consecutive low-readings tracker (per-country, Redis-backed, 4h TTL) ─────
const LOW_KEY = (c) => `gdelt-low-readings:${c.toLowerCase()}`

async function getLowReadings(country) {
  return (await sharedCache.get(LOW_KEY(country))) || 0
}
async function setLowReadings(country, count) {
  await sharedCache.set(LOW_KEY(country), count, 4 * 60 * 60 * 1000)
}

// ── Process single country ────────────────────────────────────────────────────
// escalatedList pre-fetched once by the handler — zero Supabase reads here.
// cap: per-country timeout in ms — defaults to PER_COUNTRY_CAP (22s).
// Returns a result object; never throws.
async function processCountry(country, escalatedList, cap = PER_COUNTRY_CAP) {
  // Create an AbortController tied to the cap.
  // Aborting it cancels the underlying HTTP connection immediately,
  // preventing the 14-second background-fetch leak that occurs with Promise.race.
  const ctrl     = new AbortController()
  const capTimer = setTimeout(() => ctrl.abort(), cap)

  let signals
  try {
    signals = await fetchGdeltSignals(country, ctrl.signal)
  } catch {
    signals = null
  } finally {
    clearTimeout(capTimer)
  }

  // ── Classify the result ───────────────────────────────────────────────────
  if (signals === GDELT_RATE_LIMITED) {
    console.warn(`[gdelt-ingest] GDELT rate-limited on ${country} — skipping`)
    return { country, ok: true, skipped: true, reason: 'rate_limited' }
  }
  if (!signals || signals.tempoScore === null) {
    return { country, ok: true, skipped: true, reason: signals ? 'no_data' : 'timeout_or_error' }
  }

  const { tempoScore, trend, themes, recentCount, totalCount, capped } = signals
  const inEscalated = escalatedList.map(c => c.toLowerCase()).includes(country.toLowerCase())

  try {
    // ── Spike — flag for fast-tier escalation ───────────────────────────────
    if (tempoScore >= SPIKE_THRESHOLD || capped) {
      await setLowReadings(country, 0)
      console.log(
        `[gdelt-ingest] SPIKE ${country}: tempo=${tempoScore} ` +
        `recent=${recentCount}/${totalCount} themes=[${themes.join(',')}] capped=${capped}`
      )
      return { country, ok: true, tempoScore, trend, shouldEscalate: true, themes }
    }

    // ── Elevated — log, hold current tier ──────────────────────────────────
    if (tempoScore >= ELEVATED_THRESHOLD) {
      await setLowReadings(country, 0)
      return { country, ok: true, tempoScore, trend, elevated: true, themes }
    }

    // ── Low / normal — track consecutive readings below de-escalate threshold
    if (tempoScore < DEESCALATE_THRESHOLD && inEscalated) {
      const count = await getLowReadings(country)
      const next  = count + 1
      await setLowReadings(country, next)
      if (next >= DEESCALATE_READINGS) {
        await setLowReadings(country, 0)
        return { country, ok: true, tempoScore, trend, shouldDeescalate: true, themes }
      }
    } else {
      await setLowReadings(country, 0)
    }

    return { country, ok: true, tempoScore, trend, themes }
  } catch (err) {
    return { country, ok: false, error: err.message }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
async function _handler(req, res) {
  // ── Select batch ──────────────────────────────────────────────────────────
  const batchNum  = Number(req.query?.batch ?? '1') || 1
  const COUNTRIES = [...new Set(BATCH_MAP[batchNum] || BATCH_1)]
  const LOCK_KEY  = `gdelt-ingest-lock-b${batchNum}`

  // ── Runtime budget guard ──────────────────────────────────────────────────
  // Hard limit: MAX_COUNTRIES × PER_COUNTRY_CAP + (MAX_COUNTRIES-1) × BATCH_DELAY < 300 000ms
  if (COUNTRIES.length > MAX_COUNTRIES) {
    const msg = `[gdelt-ingest] FATAL: batch=${batchNum} COUNTRIES.length (${COUNTRIES.length}) exceeds MAX_COUNTRIES (${MAX_COUNTRIES}). ` +
                `Worst-case runtime would be ${COUNTRIES.length * PER_COUNTRY_CAP + (COUNTRIES.length - 1) * BATCH_DELAY}ms — ` +
                `over the 300 000ms Vercel limit. Reduce the batch before deploying.`
    console.error(msg)
    return res.status(500).json({ error: msg })
  }

  // ── Distributed lock — prevent overlapping runs ───────────────────────────
  const locked = await sharedCache.tryLock(LOCK_KEY, INGEST_LOCK_TTL)
  if (!locked) {
    console.log(`[gdelt-ingest] batch=${batchNum} Another run is in progress — skipping this invocation`)
    return res.status(200).json({ skipped: true, reason: 'lock_held' })
  }

  const start   = Date.now()
  const results = {
    processed: 0, spikes: [], elevated: [], failed: [], rate_limited: 0, skipped: 0,
    // Per-country breakdown for audit/diagnosis
    details: [],
  }

  try {
    // Fetch escalated list ONCE — passed to every processCountry call.
    // This eliminates 20+ Supabase round-trips that previously caused timeouts.
    const escalatedList = await getEscalatedCountries()

    const toEscalate   = []
    const toDeescalate = []

    for (let i = 0; i < COUNTRIES.length; i += BATCH_SIZE) {
      const batch      = COUNTRIES.slice(i, i + BATCH_SIZE)
      const t0         = Date.now()
      const settled    = await Promise.allSettled(batch.map(c => processCountry(c, escalatedList)))
      const batchMs    = Date.now() - t0

      for (const r of settled) {
        const v = r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message, country: '?' }
        // Record per-country detail for audit response
        results.details.push({
          country: v.country,
          ok:      v.ok,
          skipped: v.skipped ?? false,
          reason:  v.reason  ?? null,
          tempo:   v.tempoScore ?? null,
          ms:      batchMs,
        })
        if (!v.ok) {
          results.failed.push(v.country)
        } else if (v.skipped) {
          if (v.reason === 'rate_limited') results.rate_limited++
          else results.skipped++
        } else {
          results.processed++
          if (v.shouldEscalate)        { toEscalate.push(v.country); results.spikes.push({ country: v.country, score: v.tempoScore, themes: v.themes }) }
          else if (v.shouldDeescalate) toDeescalate.push(v.country)
          else if (v.elevated)         results.elevated.push({ country: v.country, score: v.tempoScore })
        }
      }

      if (i + BATCH_SIZE < COUNTRIES.length) await sleep(BATCH_DELAY)
    }

    // Single Supabase write for all escalation changes this run
    await batchUpdateEscalatedSet(escalatedList, toEscalate, toDeescalate)

  } finally {
    // Always release the lock, even if the run threw
    await sharedCache.releaseLock(LOCK_KEY)
  }

  const elapsed = Date.now() - start
  console.log(
    `[gdelt-ingest] batch=${batchNum} done: processed=${results.processed} spikes=${results.spikes.length} ` +
    `elevated=${results.elevated.length} rate_limited=${results.rate_limited} ` +
    `skipped=${results.skipped} failed=${results.failed.length} elapsed=${elapsed}ms`
  )

  return res.status(200).json({
    batch:        batchNum,
    cap_ms:       PER_COUNTRY_CAP,
    processed:    results.processed,
    spikes:       results.spikes,
    elevated:     results.elevated,
    failed:       results.failed,
    rate_limited: results.rate_limited,
    skipped:      results.skipped,
    total:        COUNTRIES.length,
    elapsedMs:    elapsed,
    details:      results.details,   // per-country breakdown — use for auditing
  })
}

export const handler = adapt(_handler)
export default handler
