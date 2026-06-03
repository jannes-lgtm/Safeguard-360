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
 * Processes countries in small batches to avoid hammering the GDELT API.
 * GDELT is free and has no documented rate limit, but we stay polite.
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
// Tier A+B only — highest risk, most likely to have meaningful GDELT signals.
// Tier C/D are lower traffic and change rarely; gdelt-ingest focuses effort here.
const MONITORED = [
  // Critical
  'Somalia', 'South Sudan', 'Sudan', 'Libya', 'Mali', 'Niger', 'Burkina Faso',
  'Central African Republic', 'Democratic Republic of Congo', 'Eritrea', 'Burundi',
  'Syria', 'Yemen', 'Iraq', 'Iran', 'Israel', 'West Bank',
  'Afghanistan', 'Myanmar', 'Haiti', 'Ukraine', 'Russia',
  // High
  'Nigeria', 'Ethiopia', 'Chad', 'Mozambique', 'Cameroon', 'Togo', 'Benin',
  'Ivory Coast', 'Kenya', 'Tanzania', 'Egypt', 'Algeria', 'Tunisia',
  'Guinea-Bissau', 'Guinea', 'Gabon',
  'Lebanon', 'Pakistan', 'Jordan', 'Saudi Arabia', 'United Arab Emirates',
  'Guatemala', 'Ecuador', 'Venezuela', 'Colombia', 'Mexico',
  'Honduras', 'Nicaragua', 'Jamaica', 'India', 'Turkey',
  // Medium — included because they are high-volume travel destinations
  // where sudden spikes matter operationally
  'South Africa', 'Ghana', 'Kenya', 'Indonesia', 'Philippines',
  'Brazil', 'Thailand', 'China', 'Bangladesh',
  // Europe/stable — included so we catch unexpected escalations early
  'France', 'Germany', 'United Kingdom', 'Spain', 'Italy', 'Greece',
  'Georgia', 'Armenia', 'Azerbaijan', 'Serbia', 'Kosovo',
]

// De-duplicate
const COUNTRIES = [...new Set(MONITORED)]

// ── Thresholds ────────────────────────────────────────────────────────────────
const SPIKE_THRESHOLD       = 2.5   // tempoScore — add to fast 15-min tier
const ELEVATED_THRESHOLD    = 1.5   // tempoScore — log as elevated
const DEESCALATE_THRESHOLD  = 0.8   // tempoScore — consider removing from escalated
const DEESCALATE_READINGS   = 2     // consecutive low readings before de-escalating

const BATCH_SIZE    = 5
const BATCH_DELAY   = 1500   // 1.5s between GDELT batches — stay polite

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Escalated-set helpers (mirrors _fcdoAlert.js logic) ──────────────────────
const ESCALATED_KEY = 'fcdo-escalated'

async function getAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY)
}

async function updateEscalatedSet(country, shouldEscalate) {
  if (!SUPABASE_URL || !SERVICE_KEY) return
  try {
    const sb       = await getAdmin()
    const existing = await getEscalatedCountries()
    const name     = country.toLowerCase()
    const inSet    = existing.map(c => c.toLowerCase()).includes(name)

    if (shouldEscalate && !inSet) {
      const updated = [...existing, country]
      await sb.from('api_cache').upsert(
        { key: ESCALATED_KEY, value: { countries: updated }, expires_at: null },
        { onConflict: 'key' }
      )
      console.log(`[gdelt-ingest] TEMPO SPIKE — ${country} added to fast-check set`)
    } else if (!shouldEscalate && inSet) {
      // Only de-escalate if no FCDO reason to stay elevated
      const fcdoCached = await sharedCache.get(`fcdo:${country.toLowerCase().replace(/\s+/g, '-')}`)
      if (fcdoCached?.level && fcdoCached.level >= 3) return  // FCDO keeps it elevated

      const updated = existing.filter(c => c.toLowerCase() !== name)
      await sb.from('api_cache').upsert(
        { key: ESCALATED_KEY, value: { countries: updated }, expires_at: null },
        { onConflict: 'key' }
      )
      console.log(`[gdelt-ingest] Tempo normalised — ${country} removed from fast-check set`)
    }
  } catch (e) {
    console.warn('[gdelt-ingest] escalated set update failed:', e.message)
  }
}

// Track consecutive low-tempo readings per country to avoid premature de-escalation
const LOW_READINGS_KEY = (c) => `gdelt-low-readings:${c.toLowerCase()}`

async function getConsecutiveLowReadings(country) {
  const key = LOW_READINGS_KEY(country)
  const v   = await sharedCache.get(key)
  return v || 0
}

async function setConsecutiveLowReadings(country, count) {
  await sharedCache.set(LOW_READINGS_KEY(country), count, 4 * 60 * 60 * 1000) // 4h TTL
}

// ── Process single country ────────────────────────────────────────────────────
async function processCountry(country) {
  try {
    const signals = await fetchGdeltSignals(country)
    if (!signals || signals.tempoScore === null) {
      return { country, ok: true, skipped: true }
    }

    const { tempoScore, trend, themes, recentCount, totalCount, capped } = signals
    const escalated = await getEscalatedCountries()
    const inEscalated = escalated.map(c => c.toLowerCase()).includes(country.toLowerCase())

    // ── Spike detection — add to fast tier ───────────────────────────────────
    if (tempoScore >= SPIKE_THRESHOLD || capped) {
      await updateEscalatedSet(country, true)
      await setConsecutiveLowReadings(country, 0)
      console.log(
        `[gdelt-ingest] SPIKE: ${country} tempo=${tempoScore} ` +
        `recent=${recentCount}/${totalCount} themes=[${themes.join(',')}] capped=${capped}`
      )
      return { country, ok: true, tempoScore, trend, escalated: true, themes }
    }

    // ── Elevated — log but don't change tier yet ──────────────────────────────
    if (tempoScore >= ELEVATED_THRESHOLD) {
      await setConsecutiveLowReadings(country, 0)
      return { country, ok: true, tempoScore, trend, escalated: false, elevated: true, themes }
    }

    // ── Low / normal — track consecutive low readings ─────────────────────────
    if (tempoScore < DEESCALATE_THRESHOLD && inEscalated) {
      const count = await getConsecutiveLowReadings(country)
      const next  = count + 1
      await setConsecutiveLowReadings(country, next)

      if (next >= DEESCALATE_READINGS) {
        await updateEscalatedSet(country, false)
        await setConsecutiveLowReadings(country, 0)
      }
    } else {
      await setConsecutiveLowReadings(country, 0)
    }

    return { country, ok: true, tempoScore, trend, escalated: false, themes }
  } catch (err) {
    return { country, ok: false, error: err.message }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
async function _handler(req, res) {
  const start   = Date.now()
  const results = { processed: 0, spikes: [], elevated: [], failed: [] }

  for (let i = 0; i < COUNTRIES.length; i += BATCH_SIZE) {
    const batch    = COUNTRIES.slice(i, i + BATCH_SIZE)
    const settled  = await Promise.allSettled(batch.map(processCountry))

    for (const r of settled) {
      const v = r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message }
      if (!v.ok) {
        results.failed.push(v.country || '?')
      } else if (!v.skipped) {
        results.processed++
        if (v.escalated) results.spikes.push({ country: v.country, score: v.tempoScore, themes: v.themes })
        else if (v.elevated) results.elevated.push({ country: v.country, score: v.tempoScore })
      }
    }

    if (i + BATCH_SIZE < COUNTRIES.length) await sleep(BATCH_DELAY)
  }

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
