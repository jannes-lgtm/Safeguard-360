/**
 * api/_fcdoAlert.js
 *
 * Handles FCDO advisory change events.
 *
 * When the warmup cron detects that FCDO has changed the advisory level for
 * a country, this module:
 *   1. Inserts a record into live_intelligence so the change appears in the
 *      GSOC feed and the live ticker on the platform.
 *   2. Writes an audit log entry to api_cache (key: fcdo-change-log:{country})
 *      so operators can see a history of advisory changes.
 *   3. Queries for any organisations with active travellers in the affected
 *      country and inserts in-app alert records for them.
 *   4. Manages the escalated-countries set (api_cache key: fcdo-escalated):
 *      - Country upgraded to Level 3+ → added to set → fast cron picks it up
 *        every 15 min automatically, regardless of its normal tier.
 *      - Country drops below Level 3 → removed from set → returns to normal cadence.
 *
 * All operations are fire-and-forget — failures are logged but never throw
 * so they cannot break the main risk fetch pipeline.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY)
}

const LEVEL_LABEL = { 1: 'Level 1 — Low', 2: 'Level 2 — Medium', 3: 'Level 3 — High', 4: 'Level 4 — Critical' }
const SEV_LABEL   = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' }
const DIRECTION   = (prev, next) => next > prev ? 'UPGRADED' : 'DOWNGRADED'

// ── Escalated-countries set ───────────────────────────────────────────────────
// Stored in api_cache as: { key: 'fcdo-escalated', value: { countries: string[] } }
// The fast warmup cron reads this and adds escalated countries to every 15-min run.

const ESCALATED_KEY = 'fcdo-escalated'

export async function getEscalatedCountries() {
  try {
    const sb = getAdmin()
    const { data } = await sb
      .from('api_cache')
      .select('value')
      .eq('key', ESCALATED_KEY)
      .maybeSingle()
    return data?.value?.countries || []
  } catch {
    return []
  }
}

async function setEscalatedCountries(sb, countries) {
  await sb.from('api_cache').upsert(
    { key: ESCALATED_KEY, value: { countries }, expires_at: null },
    { onConflict: 'key' }
  )
}

async function updateEscalatedSet(sb, country, newLevel) {
  try {
    const existing = await getEscalatedCountries()
    const name     = country.toLowerCase()

    if (newLevel >= 3) {
      // Add to escalated set if not already present
      if (!existing.map(c => c.toLowerCase()).includes(name)) {
        const updated = [...existing, country]
        await setEscalatedCountries(sb, updated)
        console.log(`[fcdoAlert] ${country} added to fast-check escalated set (Level ${newLevel})`)
      }
    } else {
      // Remove from escalated set — back to normal cadence
      const updated = existing.filter(c => c.toLowerCase() !== name)
      if (updated.length !== existing.length) {
        await setEscalatedCountries(sb, updated)
        console.log(`[fcdoAlert] ${country} removed from escalated set (Level ${newLevel} — normal cadence restored)`)
      }
    }
  } catch (e) {
    console.warn('[fcdoAlert] escalated set update failed:', e.message)
  }
}

/**
 * Log an FCDO advisory change to the live intelligence feed and audit trail.
 *
 * @param {string} country    — display name, e.g. "Nigeria"
 * @param {number} prevLevel  — previous FCDO integer level (1–4)
 * @param {number} newLevel   — new FCDO integer level (1–4)
 * @param {string} prevSev    — previous severity string, e.g. "High"
 * @param {string} newSev     — new severity string, e.g. "Critical"
 */
export async function logFcdoChange(country, prevLevel, newLevel, prevSev, newSev) {
  if (!SUPABASE_URL || !SERVICE_KEY) return

  const sb        = getAdmin()
  const direction = DIRECTION(prevLevel, newLevel)
  const now       = new Date().toISOString()
  const title     = `FCDO ADVISORY ${direction} — ${country.toUpperCase()}`
  const summary   =
    `UK FCDO has ${direction === 'UPGRADED' ? 'raised' : 'lowered'} the travel advisory ` +
    `for ${country} from ${LEVEL_LABEL[prevLevel] || prevSev} to ` +
    `${LEVEL_LABEL[newLevel] || newSev}. ` +
    `${newLevel >= 4
      ? 'FCDO now advises against all travel. Review all personnel in-country and assess extraction requirements.'
      : newLevel >= 3
      ? 'FCDO advises against all but essential travel. Non-essential movements should be suspended pending review.'
      : newLevel >= 2
      ? 'FCDO advises against travel to some areas. Verify route viability and adjust movement posture accordingly.'
      : 'Advisory downgraded. Continue monitoring — conditions may remain fluid.'
    }`

  // ── 0. Update escalated-countries set ───────────────────────────────────
  // Escalation: country moves to Level 3+ → added to fast 15-min check set.
  // De-escalation: country drops below Level 3 → removed from set.
  await updateEscalatedSet(sb, country, newLevel)

  // ── 1. Insert into live_intelligence (GSOC feed) ─────────────────────────
  try {
    await sb.from('live_intelligence').insert({
      country,
      severity:    newLevel,
      raw_title:   title,
      raw_summary: summary,
      source:      'FCDO',
      is_active:   true,
      ingested_at: now,
    })
  } catch (e) {
    console.warn('[fcdoAlert] live_intelligence insert failed:', e.message)
  }

  // ── 2. Audit log in api_cache ─────────────────────────────────────────────
  try {
    const logKey   = `fcdo-change-log:${country.toLowerCase().replace(/\s+/g, '-')}`
    const existing = await sb.from('api_cache').select('value').eq('key', logKey).maybeSingle()
    const history  = existing?.data?.value?.history || []
    history.unshift({ ts: now, prevLevel, newLevel, prevSev, newSev, direction })
    if (history.length > 50) history.splice(50) // keep last 50 changes per country

    await sb.from('api_cache').upsert(
      { key: logKey, value: { country, history }, expires_at: null },
      { onConflict: 'key' }
    )
  } catch (e) {
    console.warn('[fcdoAlert] audit log failed:', e.message)
  }

  // ── 3. In-app alerts for orgs with active travellers in this country ──────
  try {
    // Find active itineraries to the affected country
    const { data: trips } = await sb
      .from('itineraries')
      .select('org_id, user_id')
      .ilike('arrival_city', `%${country}%`)
      .gte('return_date', now.slice(0, 10))
      .eq('approval_status', 'approved')

    if (trips?.length) {
      const orgIds = [...new Set(trips.map(t => t.org_id).filter(Boolean))]

      // Insert an alert record for each affected org
      const alerts = orgIds.map(org_id => ({
        org_id,
        type:       'fcdo_advisory_change',
        severity:   SEV_LABEL[newLevel] || newSev,
        title,
        body:       summary,
        country,
        created_at: now,
        is_read:    false,
      }))

      if (alerts.length) {
        await sb.from('org_alerts').insert(alerts)
        console.log(`[fcdoAlert] Alerted ${alerts.length} org(s) about ${country} advisory change`)
      }
    }
  } catch (e) {
    console.warn('[fcdoAlert] org alert insert failed (non-fatal):', e.message)
  }

  console.log(`[fcdoAlert] Logged FCDO change: ${country} ${prevSev} → ${newSev} (${direction})`)
}
