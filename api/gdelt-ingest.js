/**
 * api/gdelt-ingest.js
 *
 * GDELT Tempo Ingest Cron — two batches, staggered 15 minutes apart
 *
 *   Cron 1: "0,30 * * * *"   → /api/gdelt-ingest?batch=1  (Tier A — 22 critical countries)
 *   Cron 2: "15,45 * * * *"  → /api/gdelt-ingest?batch=2  (Tier B — 22 high-risk countries)
 *
 * Purpose:
 *   1. Pre-warms the GDELT Redis cache so country-risk.js always gets data
 *      from cache (<100ms) rather than triggering a live 15-20s fetch.
 *   2. Computes a tempoScore per country and stores it.
 *   3. Auto-escalates countries with a news spike (tempoScore > 2.5) into the
 *      fast 15-min FCDO warmup tier for elevated monitoring.
 *   4. De-escalates countries with sustained low tempo — but only when FCDO
 *      level is confirmed below 3. Fails safe if FCDO cache is stale.
 *
 * Architecture notes:
 *   - Sequential processing (BATCH_SIZE=1) with 5.5s gaps respects GDELT's
 *     1-request-per-5-seconds rate limit.
 *   - Per-country AbortController with PER_COUNTRY_CAP ties the HTTP connection
 *     lifetime to the budget cap — no background leaks.
 *   - getEscalatedCountries() is called ONCE before the loop (not per-country).
 *   - All escalated-set changes are committed in a SINGLE Supabase upsert.
 *   - A distributed Redis lock (per-batch) prevents overlapping runs.
 *
 * Runtime budget (worst case — all countries hit the 8s cap):
 *   N × PER_COUNTRY_CAP + (N-1) × BATCH_DELAY
 *   22 × 8000 + 21 × 5500 = 291 500ms  —  within 300 000ms maxDuration
 *   Hard limit: MAX_COUNTRIES = 22 per batch
 */

import { fetchGdeltSignals, GDELT_RATE_LIMITED } from './_gdelt.js'
import { getEscalatedCountries }                 from './_fcdoAlert.js'
import { sharedCache }                           from './_sharedCache.js'
import { adapt }                                 from './_adapter.js'
import { createClient }                          from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// ── Countries to monitor via GDELT ────────────────────────────────────────────
// Split into two batches — each cron hits /api/gdelt-ingest?batch=N.
// Lower-risk countries get GDELT on-demand when a user opens their risk report
// (country-risk.js, 7s live cap, falls back gracefully).

// Batch 1: Tier A — Critical (FCDO Level 3-4 / active conflict) — 22 countries
const BATCH_1 = [
  'Somalia', 'South Sudan', 'Sudan', 'Libya', 'Mali', 'Niger', 'Burkina Faso',
  'Central African Republic', 'Democratic Republic of Congo',
  'Syria', 'Yemen', 'Iraq', 'Afghanistan', 'Myanmar', 'Ukraine', 'Russia', 'Iran',
  'Nigeria', 'Pakistan', 'Mexico', 'Ethiopia', 'Haiti',
]

// Batch 2: Tier B — High-risk (elevated advisory / high traveller traffic) — 22 countries
const BATCH_2 = [
  'Lebanon', 'Venezuela', 'Colombia', 'Egypt', 'India', 'Turkey',
  'Kenya', 'Mozambique', 'Cameroon', 'Chad', 'Zimbabwe', 'Israel',
  'Belarus', 'Azerbaijan', 'Philippines', 'Indonesia', 'Saudi Arabia',
  'Bangladesh', 'North Korea', 'Tunisia', 'Serbia', 'Georgia',
]

// ── Runtime budget ────────────────────────────────────────────────────────────
// Hard limit to prevent future additions from silently causing Vercel timeouts.
// Worst-case formula: N × PER_COUNTRY_CAP + (N-1) × BATCH_DELAY < 300 000ms
// At current values: max safe N = 22 (→ 291 500ms).
const MAX_COUNTRIES     = 22

// ── Thresholds ────────────────────────────────────────────────────────────────
const SPIKE_THRESHOLD      = 2.5   // tempoScore — add to fast 15-min tier
const ELEVATED_THRESHOLD   = 1.5   // tempoScore — log as elevated
const DEESCALATE_THRESHOLD = 0.8   // tempoScore — consider removing from escalated
const DEESCALATE_READINGS  = 2     // consecutive low readings before de-escalating

// ── Timing ────────────────────────────────────────────────────────────────────
const BATCH_SIZE      = 1      // sequential — GDELT rate limit: 1 req/5s
const BATCH_DELAY     = 5500   // ms between countries — 5.5s > 5s minimum
const PER_COUNTRY_CAP = 8000   // ms — AbortController cap per GDELT fetch

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
// Returns a result object; never throws.
async function processCountry(country, escalatedList) {
  // Create an AbortController tied to PER_COUNTRY_CAP.
  // Aborting it cancels the underlying HTTP connection immediately,
  // preventing the 14-second background-fetch leak that occurs with Promise.race.
  const ctrl     = new AbortController()
  const capTimer = setTimeout(() => ctrl.abort(), PER_COUNTRY_CAP)

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
  // Cron 1: /api/gdelt-ingest?batch=1  → Tier A (default)
  // Cron 2: /api/gdelt-ingest?batch=2  → Tier B
  const batchNum  = (req.query?.batch ?? '1') === '2' ? 2 : 1
  const COUNTRIES = [...new Set(batchNum === 2 ? BATCH_2 : BATCH_1)]
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
  const results = { processed: 0, spikes: [], elevated: [], failed: [], rate_limited: 0, skipped: 0 }

  try {
    // Fetch escalated list ONCE — passed to every processCountry call.
    // This eliminates 20+ Supabase round-trips that previously caused timeouts.
    const escalatedList = await getEscalatedCountries()

    const toEscalate   = []
    const toDeescalate = []

    for (let i = 0; i < COUNTRIES.length; i += BATCH_SIZE) {
      const batch   = COUNTRIES.slice(i, i + BATCH_SIZE)
      const settled = await Promise.allSettled(batch.map(c => processCountry(c, escalatedList)))

      for (const r of settled) {
        const v = r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message, country: '?' }
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
    processed:    results.processed,
    spikes:       results.spikes,
    elevated:     results.elevated,
    failed:       results.failed,
    rate_limited: results.rate_limited,
    skipped:      results.skipped,
    total:        COUNTRIES.length,
    elapsedMs:    elapsed,
  })
}

export const handler = adapt(_handler)
export default handler
