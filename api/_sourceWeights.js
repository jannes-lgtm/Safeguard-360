/**
 * api/_sourceWeights.js
 *
 * Source Trust Scoring Framework for CAIRO.
 * Assigns reliability scores to intelligence sources based on
 * institutional credibility, recency, and corroboration depth.
 *
 * Tier system:
 *   Tier 1 (0.85–1.00) — Institutional: Reuters, AP, BBC, UN OCHA, ACLED, OSAC, State Dept
 *   Tier 2 (0.65–0.84) — Established: Al Jazeera, regional majors, France24, Bloomberg
 *   Tier 3 (0.45–0.64) — Regional/secondary: local outlets, NGO reports, allAfrica
 *   Tier 4 (0.15–0.44) — Unverified/social: OSINT social, unverified, low-credibility feeds
 */

// ── Tier definitions ──────────────────────────────────────────────────────────
export const SOURCE_TIERS = {
  1: { label: 'Tier 1 — Institutional',     baseScore: 0.90 },
  2: { label: 'Tier 2 — Established Media', baseScore: 0.72 },
  3: { label: 'Tier 3 — Regional',          baseScore: 0.54 },
  4: { label: 'Tier 4 — Unverified',        baseScore: 0.28 },
}

// ── Known source registry ─────────────────────────────────────────────────────
// Maps normalised feed name / source name patterns → tier
const SOURCE_REGISTRY = {
  // Tier 1 — Institutional
  'reuters':              1, 'reuters africa':          1,
  'associated press':     1, 'ap news':                 1, 'ap':          1,
  'bbc':                  1, 'bbc news':                1, 'bbc africa':  1,
  'afp':                  1, 'agence france-presse':    1,
  'un ocha':              1, 'reliefweb':               1, 'ocha':        1,
  'acled':                1, 'armed conflict location': 1,
  'osac':                 1, 'us state department':     1, 'state dept':  1,
  'uk fco':               1, 'fcdo':                    1,
  'un news':              1, 'unhcr':                   1,

  // Tier 2 — Established
  'al jazeera':           2, 'aljazeera':               2,
  'france 24':            2, 'france24':                2,
  'dw africa':            2, 'deutsche welle':          2, 'dw':          2,
  'bloomberg':            2, 'financial times':         2, 'ft':          2,
  'the guardian':         2, 'guardian':                2,
  'daily nation':         2, 'daily nation kenya':      2,
  'the citizen':          2, 'citizen tz':              2,
  'business day':         2, 'business day sa':         2,
  'premium times':        2, 'premium times nigeria':   2,
  'vanguard nigeria':     2,
  'new vision uganda':    2,
  'the east african':     2,
  'mail and guardian':    2,

  // Tier 3 — Regional/secondary
  'allafrica':            3, 'allafrica.com':           3,
  'gdelt':                3,
  'rfi':                  3, 'radio france internationale': 3,
  'voice of america':     3, 'voa':                     3,
  'daily monitor':        3,
  'the herald':           3,
  'new zimbabwe':         3,
  'nation africa':        3,
  'star kenya':           3,

  // Tier 4 — Unverified/social
  'twitter':              4, 'telegram':                4,
  'facebook':             4, 'social media':            4,
  'unverified':           4,
}

// ── Lookup tier by feed name ──────────────────────────────────────────────────
export function getSourceTier(feedName) {
  if (!feedName) return 4
  const key = feedName.toLowerCase().trim()

  // Direct registry lookup
  if (SOURCE_REGISTRY[key] !== undefined) return SOURCE_REGISTRY[key]

  // Pattern matching for partial names
  if (key.includes('reuters'))          return 1
  if (key.includes('bbc'))              return 1
  if (key.includes('associated press')) return 1
  if (key.includes('ocha') || key.includes('reliefweb')) return 1
  if (key.includes('acled'))            return 1
  if (key.includes('al jazeera') || key.includes('aljazeera')) return 2
  if (key.includes('france 24') || key.includes('france24')) return 2
  if (key.includes('bloomberg'))        return 2
  if (key.includes('guardian'))         return 2
  if (key.includes('allafrica'))        return 3
  if (key.includes('gdelt'))            return 3
  if (key.includes('telegram') || key.includes('twitter')) return 4

  return 3 // Default unknown to Tier 3
}

// ── Recency decay — score degrades as intelligence ages ────────────────────────
function recencyFactor(ageHours) {
  if (ageHours <=  6) return 1.00
  if (ageHours <= 24) return 0.95
  if (ageHours <= 48) return 0.88
  if (ageHours <= 72) return 0.80
  if (ageHours <= 168) return 0.70  // 1 week
  return 0.55
}

// ── Compute source reliability score (0–1) ────────────────────────────────────
/**
 * Returns a combined source trust score: tier base score × recency factor.
 * @param {string} feedName   Feed/source identifier
 * @param {number} ageHours   Age of the article in hours (default 0 = fresh)
 */
export function computeSourceReliability(feedName, ageHours = 0) {
  const tier = getSourceTier(feedName)
  const base = SOURCE_TIERS[tier].baseScore
  const decay = recencyFactor(ageHours)
  return Math.round(base * decay * 100) / 100
}

// ── Compute confidence from corroboration ─────────────────────────────────────
/**
 * Higher confidence when multiple independent sources report the same event.
 * @param {number}   reportCount  Number of distinct reports
 * @param {number[]} tierScores   Source reliability scores for each report
 */
export function computeConfidenceFromCorroboration(reportCount, tierScores = []) {
  if (!reportCount || reportCount === 0) return 0

  const avgScore = tierScores.length
    ? tierScores.reduce((s, t) => s + t, 0) / tierScores.length
    : 0.50

  const corrobBonus = reportCount === 1 ? 0.00
    : reportCount === 2 ? 0.08
    : reportCount === 3 ? 0.12
    : reportCount >= 4  ? 0.15
    : 0.04

  return Math.min(0.97, Math.round((avgScore + corrobBonus) * 100) / 100)
}
