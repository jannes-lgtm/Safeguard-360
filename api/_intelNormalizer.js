/**
 * api/_intelNormalizer.js
 *
 * Intelligence Normalization Pipeline for CAIRO.
 *
 * Transforms raw RSS/feed articles into structured operational
 * intelligence objects ready for correlation, scoring, and
 * injection into the Context Assembly Engine.
 *
 * Output schema per normalized object:
 * {
 *   event_type:        string   — classified event category
 *   country:           string
 *   city:              string | null
 *   severity:          1–5      — estimated operational severity
 *   confidence:        0–1      — combined trust × severity score
 *   source_reliability: 0–1
 *   source_tier:       1–4
 *   movement_impact:   'severe'|'significant'|'moderate'|'minor'|'none'
 *   raw_title:         string
 *   raw_summary:       string   — first 500 chars
 *   source_name:       string
 *   source_url:        string | null
 *   event_timestamp:   ISO string
 *   keywords:          string[]
 *   _raw_text:         string   — internal; used by correlator, stripped before DB
 * }
 */

import { getSourceTier, computeSourceReliability } from './_sourceWeights.js'

// ── Event type classifiers ─────────────────────────────────────────────────────
// Ordered: more specific types first
const EVENT_CLASSIFIERS = [
  {
    type: 'terrorism',
    keywords: ['terrorist', 'al-shabaab', 'al shabaab', 'boko haram', 'iswap',
      'al-qaeda', 'al qaeda', 'isis', 'islamic state', 'suicide bomb',
      'ied', 'improvised explosive', 'extremist attack', 'jihadist'],
  },
  {
    type: 'kidnap_ransom',
    keywords: ['kidnap', 'kidnapped', 'abduct', 'abducted', 'hostage', 'ransom',
      'seized and held', 'taken captive', 'held for ransom'],
  },
  {
    type: 'armed_conflict',
    keywords: ['attack', 'shelling', 'bombing', 'airstrike', 'gunfire', 'gunfight',
      'military offensive', 'militia', 'armed group', 'ambush', 'insurgent',
      'rebel forces', 'clashes with troops', 'soldiers killed'],
  },
  {
    type: 'aviation_disruption',
    keywords: ['airport closed', 'airport shut', 'flight cancelled', 'flights suspended',
      'airspace closed', 'runway', 'grounded flights', 'airline suspend',
      'flight diversion', 'aviation authority'],
  },
  {
    type: 'border_closure',
    keywords: ['border closed', 'border closure', 'crossing blocked', 'border sealed',
      'entry ban', 'entry restrictions', 'border checkpoint'],
  },
  {
    type: 'civil_unrest',
    keywords: ['protest', 'protests', 'riot', 'riots', 'demonstration', 'demonstrators',
      'unrest', 'uprising', 'marchers', 'clashes', 'strike', 'general strike',
      'shutdown', 'roadblock', 'blocked road', 'burning', 'looting', 'tear gas',
      'water cannon', 'dispersed', 'curfew imposed'],
  },
  {
    type: 'political',
    keywords: ['election', 'coup', 'military takeover', 'government collapse',
      'president', 'parliament dissolved', 'constitutional crisis',
      'political crisis', 'resignation', 'impeachment', 'state of emergency'],
  },
  {
    type: 'infrastructure',
    keywords: ['power outage', 'blackout', 'loadshedding', 'load shedding',
      'fuel shortage', 'fuel crisis', 'road closed', 'bridge collapse',
      'flooding road', 'infrastructure failure', 'power grid',
      'water shortage', 'telecoms outage', 'internet shutdown', 'network down'],
  },
  {
    type: 'economic',
    keywords: ['inflation', 'currency collapse', 'forex', 'foreign exchange',
      'sanctions', 'fuel price hike', 'subsidy removed', 'economic crisis',
      'devaluation', 'hyperinflation', 'bank closure', 'currency restrictions'],
  },
  {
    type: 'health_emergency',
    keywords: ['outbreak', 'epidemic', 'disease outbreak', 'cholera', 'ebola',
      'mpox', 'monkeypox', 'health emergency', 'who alert', 'quarantine',
      'travel health warning', 'contamination'],
  },
  {
    type: 'weather_disaster',
    keywords: ['flood', 'flooding', 'cyclone', 'drought', 'storm', 'hurricane',
      'tornado', 'heavy rain', 'severe weather', 'flash flood', 'landslide',
      'tropical storm', 'heatwave'],
  },
  {
    type: 'crime',
    keywords: ['robbery', 'armed robbery', 'carjacking', 'theft', 'assault',
      'murder', 'shooting', 'crime surge', 'criminal', 'gang', 'bandit'],
  },
]

// ── Severity estimation from text signals ─────────────────────────────────────
const SEVERITY_SIGNALS = {
  5: ['mass casualty', 'dozens killed', 'hundreds killed', 'widespread destruction',
      'state of emergency declared', 'mass evacuation', 'catastrophic', 'siege'],
  4: ['killed', 'deaths reported', 'casualties', 'serious injuries', 'major disruption',
      'suspended operations', 'evacuated', 'curfew declared', 'critical'],
  3: ['wounded', 'arrested', 'detained', 'significant disruption', 'suspended',
      'road blocked', 'flights delayed', 'tension escalating', 'violence reported'],
  2: ['reported', 'warning issued', 'alert', 'concerns raised', 'tensions',
      'demonstrations', 'unconfirmed reports', 'monitoring'],
  1: ['watching', 'potential risk', 'low-level', 'minor incident', 'routine'],
}

// ── Movement impact classification ────────────────────────────────────────────
const MOVEMENT_SIGNALS = {
  severe:       ['all flights cancelled', 'airport closed', 'roads blocked', 'curfew',
                  'state of emergency', 'no-go zone', 'total shutdown', 'evacuation ordered'],
  significant:  ['flights delayed', 'partial closure', 'restricted movement', 'avoid area',
                  'road closures', 'increased checkpoints', 'travel warning issued'],
  moderate:     ['disruption', 'diversion', 'congestion', 'caution advised',
                  'demonstrations blocking', 'some roads', 'limited access'],
  minor:        ['monitoring', 'awareness', 'low-level', 'isolated incident',
                  'no current impact'],
}

const MOVEMENT_RANK = { severe: 5, significant: 4, moderate: 3, minor: 2, none: 1 }

// ── Major cities by country ───────────────────────────────────────────────────
const CITY_INDEX = {
  'Nigeria':                       ['Lagos', 'Abuja', 'Kano', 'Port Harcourt', 'Kaduna', 'Benin City', 'Ibadan'],
  'Kenya':                         ['Nairobi', 'Mombasa', 'Kisumu', 'Eldoret', 'Nakuru'],
  'South Africa':                  ['Johannesburg', 'Cape Town', 'Pretoria', 'Durban', 'Port Elizabeth'],
  'Ghana':                         ['Accra', 'Kumasi', 'Tamale'],
  'Ethiopia':                      ['Addis Ababa', 'Dire Dawa', 'Mekelle'],
  'Tanzania':                      ['Dar es Salaam', 'Dodoma', 'Zanzibar', 'Arusha'],
  'Uganda':                        ['Kampala', 'Entebbe', 'Gulu'],
  'Sudan':                         ['Khartoum', 'Omdurman', 'Port Sudan', 'El Fasher'],
  'Democratic Republic of Congo':  ['Kinshasa', 'Goma', 'Lubumbashi', 'Bukavu', 'Beni'],
  'Somalia':                       ['Mogadishu', 'Hargeisa', 'Kismayo', 'Bosasso'],
  'Mali':                          ['Bamako', 'Gao', 'Timbuktu', 'Mopti'],
  'Burkina Faso':                  ['Ouagadougou', 'Bobo-Dioulasso'],
  'Niger':                         ['Niamey', 'Zinder', 'Agadez'],
  'Mozambique':                    ['Maputo', 'Beira', 'Nampula', 'Pemba'],
  'Zimbabwe':                      ['Harare', 'Bulawayo'],
  'Rwanda':                        ['Kigali'],
  'Senegal':                       ['Dakar', 'Ziguinchor'],
  'Cameroon':                      ['Yaoundé', 'Douala', 'Bamenda'],
  'Egypt':                         ['Cairo', 'Alexandria', 'Sharm el-Sheikh'],
  'Libya':                         ['Tripoli', 'Benghazi', 'Misrata'],
  'Lebanon':                       ['Beirut', 'Tripoli', 'Sidon'],
  'Yemen':                         ["Sana'a", 'Aden', 'Hudaydah', 'Taiz'],
  'Iraq':                          ['Baghdad', 'Basra', 'Erbil', 'Mosul'],
  'Syria':                         ['Damascus', 'Aleppo', 'Idlib'],
  'UAE':                           ['Dubai', 'Abu Dhabi', 'Sharjah'],
  'Saudi Arabia':                  ['Riyadh', 'Jeddah', 'Mecca', 'Medina'],
}

// ── Classification helpers ────────────────────────────────────────────────────
function classifyEventType(text) {
  const lower = text.toLowerCase()
  for (const { type, keywords } of EVENT_CLASSIFIERS) {
    if (keywords.some(kw => lower.includes(kw))) return type
  }
  return 'general_security'
}

function estimateSeverity(text) {
  const lower = text.toLowerCase()
  // Check from highest severity downward
  for (const level of [5, 4, 3, 2, 1]) {
    if (SEVERITY_SIGNALS[level]?.some(s => lower.includes(s))) return level
  }
  return 2
}

function assessMovementImpact(text) {
  const lower = text.toLowerCase()
  for (const [impact, signals] of Object.entries(MOVEMENT_SIGNALS)) {
    if (signals.some(s => lower.includes(s))) return impact
  }
  return 'minor'
}

function extractKeywords(text) {
  const lower = text.toLowerCase()
  const pool = EVENT_CLASSIFIERS.flatMap(c => c.keywords)
  return [...new Set(pool.filter(kw => lower.includes(kw)))].slice(0, 8)
}

function extractCity(text, country) {
  const cities = CITY_INDEX[country] || []
  for (const city of cities) {
    if (text.includes(city)) return city
  }
  return null
}

// ── Core: normalize a single article ─────────────────────────────────────────
/**
 * @param {object} article   Raw feed article { title, summary, pubDate, feedName, url }
 * @param {string} country   Canonical country name
 * @param {number} ageHours  Age of article in hours
 */
export function normalizeArticle(article, country, ageHours = 0) {
  const text = `${article.title || ''} ${article.summary || article.description || ''}`.trim()
  if (!text || text.length < 10) return null

  const sourceReliability = computeSourceReliability(article.feedName || article.source, ageHours)
  const sourceTier = getSourceTier(article.feedName || article.source)
  const eventType = classifyEventType(text)
  const severity = estimateSeverity(text)
  const movementImpact = assessMovementImpact(text)
  const keywords = extractKeywords(text)
  const city = extractCity(text, country)

  // Confidence: reliability × severity-weighted factor (higher severity = more signal value)
  const confidence = Math.min(0.96, Math.round(
    sourceReliability * (0.65 + (severity / 5) * 0.30) * 100
  ) / 100)

  return {
    event_type:          eventType,
    country,
    city,
    severity,
    confidence,
    source_reliability:  sourceReliability,
    source_tier:         sourceTier,
    movement_impact:     movementImpact,
    affected_routes:     [],
    raw_title:           (article.title || '').slice(0, 250),
    raw_summary:         text.slice(0, 500),
    source_name:         article.feedName || article.source || 'Unknown',
    source_url:          article.url || article.link || null,
    event_timestamp:     article.pubDate
      ? new Date(article.pubDate).toISOString()
      : new Date().toISOString(),
    keywords,
    _raw_text:           text,   // stripped before DB insert
  }
}

// ── Normalize a batch of articles for a country ────────────────────────────────
/**
 * Normalizes and sorts by operational priority (severity × confidence).
 */
export function normalizeArticles(articles, country, now = Date.now()) {
  if (!articles?.length) return []

  return articles
    .map(article => {
      const pubDate = article.pubDate ? new Date(article.pubDate).getTime() : now
      const ageHours = (now - pubDate) / (1000 * 60 * 60)
      return normalizeArticle(article, country, Math.max(0, ageHours))
    })
    .filter(Boolean)
    .sort((a, b) => (b.severity * b.confidence) - (a.severity * a.confidence))
}
