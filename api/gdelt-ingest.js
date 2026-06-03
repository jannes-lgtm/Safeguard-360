/**
 * api/gdelt-ingest.js
 *
 * GDELT Tempo Ingest Cron
 * Vercel schedule: every 30 minutes — cron: "* /30 * * * *" (no space)
 *
 * Fetches GDELT signals for all monitored countries and:
 *   1. Pre-warms the gdelt cache so country-risk.js gets GDELT from
 *      cache (fast) rather than triggering a live fetch on user request.
 *   2. Computes a tempoScore per country and stores it.
 *   3. Auto-escalates countries with a spike (tempoScore > 2.5) by
 *      adding them to the fcdo-escalated set — the fast 15-min warmup
 *      cron then picks them up automatically.
 *   4. De-escalates countries that have returned to normal tempo AND
 *      whose FCDO level is below 3 (no advisory reason to stay elevated).
 *
 * Processes countries sequentially to respect GDELT's 1-req/5s rate limit.
 * getEscalatedCountries() is fetched ONCE before the loop — not per-country.
 * All escalated-set writes are batched into a SINGLE Supabase upsert at the end.
 */

import { fetchGdeltSignals }      from './_gdelt.js'
import { getEscalatedCountries }  from './_fcdoAlert.js'
import { dbCacheGet, dbCacheSet } from './_dbCache.js'
import { sharedCache }            from './_sharedCache.js'
import { adapt }                  from './_adapter.js'
import { createClient }           from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// ── Countries to monitor via GDELT ────────────────────────────────────────────
// Critical + top High only. GDELT is sequential (1 req/5s rate limit).
// Budget: 20 countries x (8s cap + 5.5s delay) = 270s — safe within 300s maxDuration.
// Lower-risk countries get GDELT on-demand when a user opens their risk report.
const MONITORED = [
  // Critical (FCDO Level 4 / active conflict) — 17 countries
  'Somalia', 'South Sudan', 'Sudan', 'Libya', 'Mali', 'Niger', 'Burkina Faso',
  'Central African Republic', 'Democratic Republic of Congo',
  'Syria', 'Yemen', 'Iraq', 'Afghanistan', 'Myanmar', 'Ukraine', 'Russia', 'Iran',
  // High — highest-traffic user queries — 3 countries
  'Nigeria', 'Pakistan', 'Mexico',
]

// De-duplicate
const COUNTRIES = [...new Set(MONITORED)]

// ── Thresholds ────────────────────────────────────────────────────────────────
const SPIKE_THRESHOLD       = 2.5   // tempoScore — add to fast 15-min tier
const ELEVATED_THRESHOLD    = 1.5   // tempoScore — log as elevated
const DEESCALATE_THRESHOLD  = 0.8   // tempoScore — consider removing from escalated
const DEESCALATE_READINGS   = 2     // consecutive low readings before de-escalating

// GDELT rate limit: 1 request per 5 seconds.
// Sequential processing — one country at a time with 5.5s gap between each.
// Per-country fetch is capped at 8s so slow GDELT responses don't blow the budget.
// 20 countries x (8s cap + 5.5s delay) = 270s — comfortably within 300s maxDuration.
const BATCH_SIZE        = 1
const BATCH_DELAY       = 5500  // 5.5s between countries — respects GDELT rate limit
const PER_COUNTRY_CAP   = 8000  // 8s cap per GDELT fetch — prevents budget overrun

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Escalated-set helpers ─────────────────────────────────────────────────────
const ESCALATED_KEY = 'fcdo-escalated'

async function getAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY)
}

// Single batch write to escalated set — called ONCE at end of handler run.
// toAdd / toRemove are arrays of country names that changed this run.
async function batchUpdateEscalatedSet(currentList, toAdd, toRemove) {
  if (!SUPABASE_URL || !SERVICE_KEY) return
  if (!toAdd.length && !toRemove.length) return
  try {
    const sb = await getAdmin()

    // For de-escalation candidates: check FCDO level before removing
    const safeToRemove = []
    for (const country of toRemove) {
      const fcdoCached = await sharedCache.get(`fcdo:${country.toLowerCase().replace(/\s+/g, '-')}`)
      if (fcdoCached?.level && fcdoCached.level >= 3) {
        console.log(`[gdelt-ingest] Tempo low but FCDO level ${fcdoCached.level} — keeping ${country} elevated`)
        continue
      }
      safeToRemove.push(country)
    }

    const currentLower = currentList.map(c => c.toLowerCase())
    // Add new spikes that aren't already in the set
    const additions = toAdd.filter(c => !currentLower.includes(c.toLowerCase()))
    // Remove countries that are safe to de-escalate
    const removeLower = safeToRemove.map(c => c.toLowerCase())
    const updated = [
      ...currentList.filter(c => !removeLower.includes(c.toLowerCase())),
      ...additions,
    ]

    if (updated.length === currentList.length && !additions.length && !safeToRemove.length) return

    await sb.from('api_cache').upsert(
      { key: ESCALATED_KEY, value: { countries: updated }, expires_at: null },
      { onConflict: 'key' }
    )
    if (additions.length)  console.log(`[gdelt-ingest] TEMPO SPIKE — added to fast-check: ${additions.join(', ')}`)
    if (safeToRemove.length) console.log(`[gdelt-ingest] Tempo normalised — removed from fast-check: ${safeToRemove.join(', ')}`)
  } catch (e) {
    console.warn('[gdelt-ingest] escalated set batch update failed:', e.message)
  }
}

// Track consecutive low-tempo readings per country to avoid premature de-escalation
const LOW_READINGS_KEY = (c) => `gdelt-low-readings:${c.toLowerCase()}`

async function getConsecutiveLowReadings(country) {
  const v = await sharedCache.get(LOW_READINGS_KEY(country))
  return v || 0
}

async function setConsecutiveLowReadings(country, count) {
  await sharedCache.set(LOW_READINGS_KEY(country), count, 4 * 60 * 60 * 1000) // 4h TTL
}

// ── Process single country ────────────────────────────────────────────────────
// escalatedList pre-fetched by handler — no Supabase reads in this function.
async function processCountry(country, escalatedList) {
  try {
    // Cap each GDELT fetch so a slow response can't blow the 300s maxDuration budget
    const signals = await Promise.race([
      fetchGdeltSignals(country),
      new Promise(resolve => setTimeout(() => resolve(null), PER_COUNTRY_CAP)),
    ])
    if (!signals || signals.tempoScore === null) {
      return { country, ok: true, skipped: true }
    }

    const { tempoScore, trend, themes, recentCount, totalCount, capped } = signals
    const inEscalated = escalatedList.map(c => c.toLowerCase()).includes(country.toLowerCase())

    // ── Spike detection — flag for escalation ────────────────────────────────
    if (tempoScore >= SPIKE_THRESHOLD || capped) {
      await setConsecutiveLowReadings(country, 0)
      console.log(
        `[gdelt-ingest] SPIKE: ${country} tempo=${tempoScore} ` +
        `recent=${recentCount}/${totalCount} themes=[${themes.join(',')}] capped=${capped}`
      )
      return { country, ok: true, tempoScore, trend, shouldEscalate: true, themes }
    }

    // ── Elevated — log but don't change tier yet ──────────────────────────────
    if (tempoScore >= ELEVATED_THRESHOLD) {
      await setConsecutiveLowReadings(country, 0)
      return { country, ok: true, tempoScore, trend, elevated: true, themes }
    }

    // ── Low / normal — track consecutive low readings ─────────────────────────
    if (tempoScore < DEESCALATE_THRESHOLD && inEscalated) {
      const count = await getConsecutiveLowReadings(country)
      const next  = count + 1
      await setConsecutiveLowReadings(country, next)

      if (next >= DEESCALATE_READINGS) {
        await setConsecutiveLowReadings(country, 0)
        return { country, ok: true, tempoScore, trend, shouldDeescalate: true, themes }
      }
    } else {
      await setConsecutiveLowReadings(country, 0)
    }

    return { country, ok: true, tempoScore, trend, themes }
  } catch (err) {
    return { country, ok: false, error: err.message }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
async function _handler(req, res) {
  const start   = Date.now()
  const results = { processed: 0, spikes: [], elevated: [], failed: [] }

  // Fetch escalated list ONCE — passed to every processCountry call
  const escalatedList = await getEscalatedCountries()

  const toEscalate   = []
  const toDeescalate = []

  for (let i = 0; i < COUNTRIES.length; i += BATCH_SIZE) {
    const batch   = COUNTRIES.slice(i, i + BATCH_SIZE)
    const settled = await Promise.allSettled(batch.map(c => processCountry(c, escalatedList)))

    for (const r of settled) {
      const v = r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message }
      if (!v.ok) {
        results.failed.push(v.country || '?')
      } else if (!v.skipped) {
        results.processed++
        if (v.shouldEscalate)   { toEscalate.push(v.country); results.spikes.push({ country: v.country, score: v.tempoScore, themes: v.themes }) }
        else if (v.shouldDeescalate) toDeescalate.push(v.country)
        else if (v.elevated)    results.elevated.push({ country: v.country, score: v.tempoScore })
      }
    }

    if (i + BATCH_SIZE < COUNTRIES.length) await sleep(BATCH_DELAY)
  }

  // Single Supabase write for all escalation changes this run
  await batchUpdateEscalatedSet(escalatedList, toEscalate, toDeescalate)

  const elapsed = Date.now() - start
  console.log(
    `[gdelt-ingest] processed=${results.processed} spikes=${results.spikes.length} ` +
    `elevated=${results.elevated.length} failed=${results.failed.length} elapsed=${elapsed}ms`
  )

  return res.status(200).json({
    processed:  results.processed,
    spikes:     results.spikes,
    elevated:   results.elevated,
    failed:     results.failed,
    total:      COUNTRIES.length,
    elapsedMs:  elapsed,
  })
}

export const handler = adapt(_handler)
export default handler
