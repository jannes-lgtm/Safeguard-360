/**
 * api/_gdelt.js
 *
 * GDELT Project integration — live event intelligence and tempo scoring.
 *
 * GDELT (Global Database of Events, Language, and Tone) processes ~100,000+
 * news articles daily, codes every event by country and theme, and publishes
 * results with a 15-minute lag. Free, no API key required.
 *
 * What this module provides:
 *
 *   tempoScore    — ratio of recent activity vs baseline. 1.0 = normal.
 *                   >1.5 = elevated, >2.5 = spike, <0.7 = quiet.
 *                   Drives dynamic monitoring frequency.
 *
 *   trend         — 'escalating' | 'stable' | 'de-escalating'
 *                   Derived from tempo and recency distribution.
 *
 *   themes        — security themes detected in article titles
 *                   (PROTEST, MILITARY, TERRORISM, COUP, etc.)
 *
 *   topArticles   — up to 8 recent high-signal articles with titles + urls
 *                   Passed directly to CAIRO for synthesis context.
 *
 * Results cached 30 min per country (gdelt-ingest cron pre-warms this).
 */

import { sharedCache } from './_sharedCache.js'

const GDELT_BASE  = 'https://api.gdeltproject.org/api/v2/doc/doc'
const CACHE_TTL   = 30 * 60 * 1000   // 30 min cache per country
const FETCH_MS    = 22_000            // 22s timeout — GDELT API averages 15-20s response time

// ── Security keyword filter ───────────────────────────────────────────────────
// Used to filter retrieved articles down to operationally relevant content.
const SECURITY_KEYWORDS = [
  'protest', 'demonstration', 'riot', 'unrest', 'strike',
  'military', 'army', 'troops', 'airstrike', 'shelling', 'offensive', 'battle',
  'attack', 'bomb', 'explosion', 'blast', 'gunfire', 'shooting', 'ambush',
  'terror', 'terrorist', 'kidnap', 'hostage',
  'coup', 'overthrow', 'junta', 'takeover',
  'evacuation', 'evacuate', 'flee', 'displacement', 'refugee',
  'emergency', 'crisis', 'curfew', 'lockdown',
  'conflict', 'violence', 'clashes', 'fighting', 'war', 'combat',
  'arrest', 'crackdown', 'detention',
  'warning', 'threat', 'danger', 'alert',
]

// ── Theme patterns (extracted from article titles client-side) ────────────────
const THEME_PATTERNS = [
  { theme: 'PROTEST',    re: /protest|demonstration|rally|march|riot|strike/i },
  { theme: 'MILITARY',   re: /military|army|troops|airstrike|shelling|offensive|battle|combat/i },
  { theme: 'TERRORISM',  re: /attack|bomb|explosion|terror|blast|gunfire|shooting|ambush|ied/i },
  { theme: 'COUP',       re: /coup|overthrow|junta|takeover|mutiny/i },
  { theme: 'EVACUATION', re: /evacuation|evacuate|flee|displacement|refugee/i },
  { theme: 'SECURITY',   re: /security|police|arrest|crackdown|detention/i },
  { theme: 'EMERGENCY',  re: /emergency|crisis|state of emergency|curfew|lockdown/i },
  { theme: 'CONFLICT',   re: /conflict|fighting|clashes|violence|war/i },
  { theme: 'KIDNAP',     re: /kidnap|hostage|abduct/i },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function isSecurityArticle(title = '') {
  const lower = title.toLowerCase()
  return SECURITY_KEYWORDS.some(kw => lower.includes(kw))
}

function extractThemes(articles) {
  const counts = {}
  for (const a of articles) {
    for (const { theme, re } of THEME_PATTERNS) {
      if (re.test(a.title || '')) {
        counts[theme] = (counts[theme] || 0) + 1
      }
    }
  }
  // Return themes sorted by frequency, max 5
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([theme]) => theme)
}

// Parse GDELT seendate "YYYYMMDDTHHMMSSZ" → Date
function parseGdeltDate(s = '') {
  if (!s || s.length < 15) return null
  try {
    return new Date(
      `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` +
      `T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`
    )
  } catch { return null }
}

// Rate-limit sentinel — returned when GDELT responds with its throttle message.
// Callers must handle this distinctly from null (no data) so rate-limited runs
// don't look identical to empty-signal runs in logs and response payloads.
export const GDELT_RATE_LIMITED = 'RATE_LIMITED'

// fetchWithTimeout supports an optional externalSignal so the ingest cron can
// abort the underlying HTTP connection immediately when its per-country budget
// expires — rather than leaving the connection open for up to 22s more.
async function fetchWithTimeout(url, ms = FETCH_MS, externalSignal = null) {
  // External signal provided: use it directly — caller owns the timeout.
  if (externalSignal) {
    try {
      const r = await fetch(url, { signal: externalSignal })
      return r
    } catch {
      return null  // AbortError or network error
    }
  }
  // No external signal: create our own with the module-level FETCH_MS timeout.
  const ctrl = new AbortController()
  const id   = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    clearTimeout(id)
    return r
  } catch {
    clearTimeout(id)
    return null
  }
}

// ── Core fetch ────────────────────────────────────────────────────────────────
// Returns:
//   string[]        — article objects from GDELT (may be empty)
//   GDELT_RATE_LIMITED — GDELT returned its throttle message (HTTP 200, text)
//   null            — network error, timeout, or unexpected response
async function fetchGdeltRaw(country, signal = null) {
  const params = new URLSearchParams({
    query:      `"${country}"`,
    mode:       'artlist',
    maxrecords: '250',
    timespan:   '24H',
    format:     'json',
  })

  const r = await fetchWithTimeout(`${GDELT_BASE}?${params}`, FETCH_MS, signal)
  if (!r) return null

  // HTTP 429 = rate-limited at the transport level (no body to read).
  // Return the sentinel so callers treat it the same as the text-based rate-limit.
  if (r.status === 429) return GDELT_RATE_LIMITED

  if (!r.ok) {
    console.warn(`[gdelt] HTTP ${r.status} for "${country}"`)
    return null
  }

  try {
    // Read as text first so we can detect the plain-text rate-limit message
    // before attempting JSON.parse (which would throw and swallow the signal).
    const text = await r.text()
    if (text.startsWith('Please limit') || text.startsWith('Rate limit')) {
      return GDELT_RATE_LIMITED
    }
    const json = JSON.parse(text)
    return json?.articles || []
  } catch {
    return null
  }
}

// ── Tempo calculation ─────────────────────────────────────────────────────────
// Tempo score = how "hot" a country is right now vs its own recent baseline.
//
// Method: within the 24h article window, what fraction landed in the last 6h?
//   Steady state = 25% (6h / 24h).
//   tempoScore   = (recent6hCount / totalCount) / 0.25
//   e.g. 50% in last 6h → 50/25 = 2.0× spike
//
// When total count is very low (< 5 articles) we return null — not enough
// signal to score meaningfully.

function computeTempo(articles) {
  if (!articles?.length) return { tempoScore: null, trend: 'stable', recentCount: 0, totalCount: 0, capped: false }

  const now        = Date.now()
  const cutoff6h   = now - 6  * 60 * 60 * 1000
  const totalCount = articles.length
  const capped     = totalCount >= 250  // hit GDELT max — true spike

  const recentCount = articles.filter(a => {
    const d = parseGdeltDate(a.seendate)
    return d && d.getTime() > cutoff6h
  }).length

  if (totalCount < 5) {
    return { tempoScore: null, trend: 'stable', recentCount, totalCount, capped }
  }

  const expectedRecent = totalCount * 0.25
  const tempoScore     = parseFloat((recentCount / Math.max(expectedRecent, 1)).toFixed(2))

  const trend = capped || tempoScore > 1.8 ? 'escalating'
    : tempoScore < 0.6                     ? 'de-escalating'
    :                                        'stable'

  return { tempoScore, trend, recentCount, totalCount, capped }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * fetchGdeltSignals(country)
 *
 * Returns GDELT-derived live intelligence signals for a country.
 * Cached 30 min — gdelt-ingest cron pre-warms before country-risk needs it.
 *
 * @returns {Promise<{
 *   tempoScore: number|null,
 *   trend: string,
 *   recentCount: number,
 *   totalCount: number,
 *   capped: boolean,
 *   themes: string[],
 *   topArticles: Array<{title, url, source, date}>,
 *   fetchedAt: string,
 * }|null>}
 */
// signal — optional AbortSignal from the ingest cron's per-country timeout.
// When provided, aborting it immediately cancels the underlying HTTP fetch
// rather than leaving the connection open until the internal 22s timer fires.
export async function fetchGdeltSignals(country, signal = null) {
  const cacheKey = `gdelt:${country.toLowerCase()}`
  const cached   = await sharedCache.get(cacheKey)
  if (cached !== null) return cached

  try {
    const articles = await fetchGdeltRaw(country, signal)
    if (articles === GDELT_RATE_LIMITED) return GDELT_RATE_LIMITED
    if (!articles) return null

    // Filter down to security-relevant articles
    const securityArticles = articles.filter(a => isSecurityArticle(a.title))

    const tempo = computeTempo(securityArticles.length >= 5 ? securityArticles : articles)

    // Top articles for CAIRO: prefer security-themed, from the last 6h, max 8
    const now     = Date.now()
    const cutoff6h = now - 6 * 60 * 60 * 1000
    const recent  = securityArticles
      .filter(a => {
        const d = parseGdeltDate(a.seendate)
        return d && d.getTime() > cutoff6h
      })
      .slice(0, 8)
      .map(a => ({
        title:  a.title  || '',
        url:    a.url    || '',
        source: a.domain || '',
        date:   a.seendate || '',
      }))

    const themes = extractThemes(securityArticles)

    const result = {
      ...tempo,
      themes,
      topArticles: recent,
      fetchedAt:   new Date().toISOString(),
    }

    await sharedCache.set(cacheKey, result, CACHE_TTL)
    return result
  } catch (e) {
    console.warn(`[gdelt] fetchGdeltSignals failed for ${country}:`, e.message)
    return null
  }
}

/**
 * getStoredTempoScore(country)
 *
 * Returns just the tempo score from cache without triggering a fetch.
 * Used by the warmup cron to read scores computed by gdelt-ingest.
 */
export async function getStoredTempoScore(country) {
  const cacheKey = `gdelt:${country.toLowerCase()}`
  const cached   = await sharedCache.get(cacheKey)
  return cached?.tempoScore ?? null
}
