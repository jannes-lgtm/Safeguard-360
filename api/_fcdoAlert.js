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
    // Find active trips to the affected country
    const { data: trips } = await sb
      .from('trips')
      .select('org_id, user_id')
      .ilike('destination_country', country)
      .gte('end_date', now.slice(0, 10))
      .eq('status', 'approved')

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
    // org_alerts table may not exist yet — non-fatal
    console.warn('[fcdoAlert] org alert insert failed (non-fatal):', e.message)
  }

  console.log(`[fcdoAlert] Logged FCDO change: ${country} ${prevSev} → ${newSev} (${direction})`)
}
