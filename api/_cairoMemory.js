/**
 * api/_cairoMemory.js
 *
 * CAIRO Brief History — Trend Memory
 *
 * Stores a rolling history of CAIRO risk assessments per country so that
 * CAIRO can compare current conditions against its own previous assessments
 * and identify sustained deterioration vs isolated incidents.
 *
 * Storage: api_cache table (key: cairo-history:{country-slug})
 *   - Persists across cold starts and deployments
 *   - No expiry — history is intentionally permanent
 *   - Capped at MAX_HISTORY entries per country (rolling window)
 *
 * Each history entry stores:
 *   ts          — ISO timestamp of assessment
 *   severity    — Low | Medium | High | Critical
 *   summary     — first 200 chars of CAIRO summary
 *   key_risks   — top 3 risk titles
 *   gdelt_tempo — numeric tempo score at time of assessment (optional)
 *   gdelt_trend — escalating | stable | de-escalating (optional)
 *
 * Trend analysis produces plain-English context for the synthesis prompt:
 *   "This is the fourth consecutive assessment at High risk, suggesting
 *    conditions remain persistently elevated rather than reflecting an
 *    isolated incident."
 */

import { dbCacheGet, dbCacheSet } from './_dbCache.js'

const MAX_HISTORY = 10   // rolling window — last 10 assessments per country
const SEV_ORDER   = { Low: 1, Medium: 2, High: 3, Critical: 4 }

function countrySlug(country) {
  return country.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function historyKey(country) {
  return `cairo-history:${countrySlug(country)}`
}

// ── Store ─────────────────────────────────────────────────────────────────────

/**
 * Append a new brief entry to the country's history.
 * Fire-and-forget safe — errors are logged but never thrown.
 */
export async function storeBriefHistory(country, brief, { gdelt_tempo, gdelt_trend } = {}) {
  if (!brief?.overall_severity && !brief?.threat_level) return

  try {
    const key      = historyKey(country)
    const existing = await dbCacheGet(key)
    const history  = existing?.history || []

    const entry = {
      ts:          new Date().toISOString(),
      severity:    brief.overall_severity || brief.threat_level || null,
      summary:     (brief.summary || '').slice(0, 200),
      key_risks:   (brief.key_risks || brief.risks?.map(r => r.title) || []).slice(0, 3),
      gdelt_tempo: gdelt_tempo ?? null,
      gdelt_trend: gdelt_trend ?? null,
    }

    // Prepend new entry, cap at MAX_HISTORY
    history.unshift(entry)
    if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY)

    // Store with no expiry — history is permanent
    await dbCacheSet(key, { country, history }, null)
  } catch (e) {
    console.warn('[cairoMemory] storeBriefHistory failed (non-fatal):', e.message)
  }
}

// ── Retrieve ──────────────────────────────────────────────────────────────────

/**
 * Get the last N brief history entries for a country.
 * Returns [] if no history exists.
 */
export async function getBriefHistory(country, n = MAX_HISTORY) {
  try {
    const key  = historyKey(country)
    const data = await dbCacheGet(key)
    return (data?.history || []).slice(0, n)
  } catch {
    return []
  }
}

// ── Trend analysis ────────────────────────────────────────────────────────────

/**
 * Analyse the brief history and return a plain-English trend context string
 * suitable for injection directly into the CAIRO synthesis prompt.
 *
 * Returns null if there is insufficient history (< 2 entries).
 */
export async function buildTrendContext(country) {
  const history = await getBriefHistory(country, 7)
  if (!history || history.length < 2) return null

  const severities = history
    .map(h => h.severity)
    .filter(s => SEV_ORDER[s] !== undefined)

  if (severities.length < 2) return null

  const current  = severities[0]
  const previous = severities[1]
  const oldest   = severities[severities.length - 1]

  const currentScore  = SEV_ORDER[current]  || 0
  const previousScore = SEV_ORDER[previous] || 0
  const oldestScore   = SEV_ORDER[oldest]   || 0

  // Time span of the history window
  const newestTs = new Date(history[0].ts)
  const oldestTs = new Date(history[history.length - 1].ts)
  const hoursAgo = Math.round((newestTs - oldestTs) / (1000 * 60 * 60))
  const spanLabel = hoursAgo < 24
    ? `${hoursAgo} hour${hoursAgo !== 1 ? 's' : ''}`
    : `${Math.round(hoursAgo / 24)} day${Math.round(hoursAgo / 24) !== 1 ? 's' : ''}`

  // Count consecutive assessments at current severity
  let consecutiveAtCurrent = 0
  for (const s of severities) {
    if (s === current) consecutiveAtCurrent++
    else break
  }

  // Determine trend direction across the full window
  const isDeterioration  = currentScore > oldestScore
  const isImprovement    = currentScore < oldestScore
  const isStable         = currentScore === oldestScore
  const isVolatile       = !isStable && severities.some(s => SEV_ORDER[s] < currentScore) && severities.some(s => SEV_ORDER[s] > currentScore)

  // Recent shift (last two assessments)
  const justEscalated    = currentScore > previousScore
  const justDeescalated  = currentScore < previousScore

  // ── Build the trend context paragraph ────────────────────────────────────
  const lines = []

  // Opening: how long we've been watching
  lines.push(
    `CAIRO has been monitoring ${country} across ${history.length} assessment${history.length !== 1 ? 's' : ''} ` +
    `over the past ${spanLabel}.`
  )

  // Consecutive pattern
  if (consecutiveAtCurrent >= 3) {
    lines.push(
      `The last ${consecutiveAtCurrent} consecutive assessments have rated conditions as ${current}. ` +
      `This indicates a sustained pattern rather than an isolated or temporary development.`
    )
  } else if (justEscalated) {
    lines.push(
      `The current assessment represents an escalation from the previous rating of ${previous}. ` +
      `This is a recent shift — continue monitoring to determine whether this is a sustained change or a short-term development.`
    )
  } else if (justDeescalated) {
    lines.push(
      `The current assessment reflects an improvement from the previous rating of ${previous}. ` +
      `Conditions appear to be stabilising, though continued monitoring is advised.`
    )
  }

  // Longer-term trajectory
  if (isDeterioration && history.length >= 4) {
    lines.push(
      `Over the full monitoring window, the risk profile has moved from ${oldest} to ${current}, ` +
      `reflecting a broader deterioration in conditions.`
    )
  } else if (isImprovement && history.length >= 4) {
    lines.push(
      `Over the full monitoring window, the risk profile has improved from ${oldest} to ${current}.`
    )
  } else if (isVolatile && history.length >= 4) {
    lines.push(
      `The risk profile has been volatile over this period, fluctuating between assessments. ` +
      `This suggests an unstable environment where conditions can change quickly.`
    )
  }

  // GDELT tempo trend across last 3 entries (if available)
  const tempoEntries = history.slice(0, 3).filter(h => h.gdelt_tempo != null)
  if (tempoEntries.length >= 2) {
    const tempoTrend = tempoEntries.every(h => h.gdelt_trend === 'escalating')
      ? 'Reporting volume has been consistently elevated across the last several monitoring cycles.'
      : tempoEntries.every(h => h.gdelt_trend === 'de-escalating')
      ? 'Reporting volume has been declining across recent monitoring cycles.'
      : null
    if (tempoTrend) lines.push(tempoTrend)
  }

  return lines.join(' ')
}
