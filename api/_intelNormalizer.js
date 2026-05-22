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
function stripHtml(str) {
  if (!str) return ''
  return str
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ').trim()
}

const EVENT_CLASSIFIERS = [
  {
    // Major events: operationally significant even when non-threatening.
    // Summits/forums → road closures, VIP convoys, security perimeters,
    // accommodation pressure, airport congestion. Always surfaces to advisory.
    type: 'major_event',
    keywords: [
      'summit', 'africa ceo', 'ceo forum', 'world economic forum', 'african union summit',
      'au summit', 'state visit', 'presidential visit', 'head of state visit',
      'peace talks', 'peace negotiations', 'g20', 'g7', 'g8', 'cop30', 'cop29',
      'un general assembly', 'unga', 'world bank annual', 'imf annual',
      'international conference', 'world forum', 'international summit',
      'heads of government', 'bilateral summit', 'diplomatic summit',
    ],
  },
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
      'water shortage', 'telecoms outage', 'internet shutdown', 'network down',
      'internet disruption', 'internet cut', 'internet blocked', 'network disruption',
      'social media blocked', 'platforms blocked', 'connectivity disruption',
      'netblocks', 'network data confirm'],
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
                  'road closures', 'increased checkpoints', 'travel warning issued',
                  'vip convoy', 'road closures expected', 'access restricted', 'security perimeter'],
  moderate:     ['disruption', 'diversion', 'congestion', 'caution advised',
                  'demonstrations blocking', 'some roads', 'limited access',
                  'summit', 'major conference', 'state visit', 'high security', 'hotel pressure'],
  minor:        ['monitoring', 'awareness', 'low-level', 'isolated incident',
                  'no current impact'],
}

const MOVEMENT_RANK = { severe: 5, significant: 4, moderate: 3, minor: 2, none: 1 }

// ── Major cities by country ───────────────────────────────────────────────────
const CITY_INDEX = {
  // West Africa
  'Nigeria':                       ['Lagos', 'Abuja', 'Kano', 'Port Harcourt', 'Kaduna', 'Benin City', 'Ibadan', 'Enugu', 'Warri', 'Aba', 'Maiduguri', 'Jos', 'Ilorin', 'Akure'],
  'Ghana':                         ['Accra', 'Kumasi', 'Tamale'],
  'Côte d\'Ivoire':                ['Abidjan', 'Yamoussoukro'],
  'Ivory Coast':                   ['Abidjan', 'Yamoussoukro'],
  'Togo':                          ['Lomé'],
  'Benin':                         ['Cotonou', 'Porto-Novo'],
  'Guinea':                        ['Conakry'],
  'Sierra Leone':                  ['Freetown'],
  'Liberia':                       ['Monrovia'],
  'Guinea-Bissau':                 ['Bissau'],
  'Senegal':                       ['Dakar', 'Ziguinchor'],
  'Gambia':                        ['Banjul'],
  'Mali':                          ['Bamako', 'Gao', 'Timbuktu', 'Mopti', 'Ségou'],
  'Burkina Faso':                  ['Ouagadougou', 'Bobo-Dioulasso', 'Ouahigouya'],
  'Niger':                         ['Niamey', 'Zinder', 'Agadez', 'Maradi', 'Tahoua'],
  'Mauritania':                    ['Nouakchott'],
  // Central Africa
  'Cameroon':                      ['Yaoundé', 'Douala', 'Bamenda', 'Garoua', 'Maroua'],
  'Chad':                          ["N'Djamena", 'Sarh', 'Moundou'],
  'Central African Republic':      ['Bangui'],
  'Gabon':                         ['Libreville', 'Port-Gentil'],
  'Republic of Congo':             ['Brazzaville', 'Pointe-Noire'],
  'Democratic Republic of Congo':  ['Kinshasa', 'Goma', 'Lubumbashi', 'Bukavu', 'Beni', 'Butembo', 'Kisangani', 'Mbuji-Mayi', 'Kolwezi', 'Matadi'],
  'Equatorial Guinea':             ['Malabo'],
  'São Tomé and Príncipe':         ['São Tomé'],
  // East Africa
  'Kenya':                         ['Nairobi', 'Mombasa', 'Kisumu', 'Eldoret', 'Nakuru', 'Garissa'],
  'Ethiopia':                      ['Addis Ababa', 'Dire Dawa', 'Mekelle', 'Gondar', 'Bahir Dar', 'Hawassa', 'Jimma', 'Jijiga'],
  'Sudan':                         ['Khartoum', 'Omdurman', 'Port Sudan', 'El Fasher', 'Kassala', 'Nyala', 'El Geneina'],
  'South Sudan':                   ['Juba', 'Wau', 'Malakal'],
  'Eritrea':                       ['Asmara', 'Massawa'],
  'Djibouti':                      ['Djibouti City'],
  'Uganda':                        ['Kampala', 'Entebbe', 'Gulu', 'Jinja', 'Mbarara', 'Lira'],
  'Rwanda':                        ['Kigali', 'Gisenyi'],
  'Burundi':                       ['Bujumbura', 'Gitega'],
  'Tanzania':                      ['Dar es Salaam', 'Dodoma', 'Arusha', 'Zanzibar', 'Mwanza', 'Tanga', 'Mbeya'],
  'Somalia':                       ['Mogadishu', 'Hargeisa', 'Kismayo', 'Bosasso', 'Garowe'],
  // Southern Africa
  'South Africa':                  ['Johannesburg', 'Cape Town', 'Pretoria', 'Durban', 'Port Elizabeth', 'Bloemfontein', 'East London', 'Nelspruit', 'Polokwane', 'Pietermaritzburg', 'Rustenburg', 'Kimberley'],
  'Mozambique':                    ['Maputo', 'Beira', 'Nampula', 'Pemba', 'Quelimane', 'Tete'],
  'Zimbabwe':                      ['Harare', 'Bulawayo', 'Mutare'],
  'Zambia':                        ['Lusaka', 'Ndola', 'Kitwe', 'Livingstone'],
  'Malawi':                        ['Lilongwe', 'Blantyre', 'Mzuzu'],
  'Botswana':                      ['Gaborone', 'Francistown'],
  'Namibia':                       ['Windhoek', 'Walvis Bay'],
  'Lesotho':                       ['Maseru'],
  'Eswatini':                      ['Mbabane', 'Manzini'],
  'Swaziland':                     ['Mbabane', 'Manzini'],
  'Madagascar':                    ['Antananarivo', 'Toamasina', 'Fianarantsoa', 'Antsiranana'],
  'Angola':                        ['Luanda', 'Huambo', 'Lobito', 'Lubango'],
  'Comoros':                       ['Moroni'],
  'Mauritius':                     ['Port Louis'],
  // North Africa
  'Egypt':                         ['Cairo', 'Alexandria', 'Sharm el-Sheikh', 'Luxor', 'Aswan', 'Port Said', 'Suez', 'Ismailia'],
  'Libya':                         ['Tripoli', 'Benghazi', 'Misrata', 'Sirte', 'Sabha'],
  'Tunisia':                       ['Tunis', 'Sfax', 'Sousse'],
  'Algeria':                       ['Algiers', 'Oran', 'Constantine', 'Annaba'],
  'Morocco':                       ['Casablanca', 'Rabat', 'Marrakech', 'Fes', 'Tangier', 'Agadir'],
  // Middle East
  'Lebanon':                       ['Beirut', 'Tripoli (LB)', 'Sidon'],
  'Jordan':                        ['Amman', 'Aqaba', 'Irbid'],
  'Yemen':                         ["Sana'a", 'Aden', 'Hudaydah', 'Taiz', 'Marib', 'Mukalla'],
  'Iraq':                          ['Baghdad', 'Basra', 'Erbil', 'Mosul', 'Najaf', 'Karbala', 'Kirkuk', 'Sulaymaniyah'],
  'Syria':                         ['Damascus', 'Aleppo', 'Idlib', 'Homs', 'Latakia', 'Deir ez-Zor', 'Raqqa'],
  'UAE':                           ['Dubai', 'Abu Dhabi', 'Sharjah'],
  'Saudi Arabia':                  ['Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam', 'Tabuk'],
  'Kuwait':                        ['Kuwait City'],
  'Qatar':                         ['Doha'],
  'Bahrain':                       ['Manama'],
  'Oman':                          ['Muscat', 'Salalah', 'Nizwa'],
  'Turkey':                        ['Ankara', 'Istanbul', 'Izmir', 'Gaziantep', 'Diyarbakir', 'Adana'],
  'Iran':                          ['Tehran', 'Mashhad', 'Tabriz', 'Ahvaz', 'Zahedan', 'Isfahan', 'Shiraz', 'Bandar Abbas'],
  // South Asia
  'Afghanistan':                   ['Kabul', 'Kandahar', 'Herat', 'Mazar-i-Sharif', 'Jalalabad', 'Kunduz'],
  'Pakistan':                      ['Islamabad', 'Karachi', 'Lahore', 'Rawalpindi', 'Peshawar', 'Multan', 'Quetta', 'Faisalabad'],
  'Bangladesh':                    ['Dhaka', 'Chittagong', 'Sylhet', 'Khulna'],
  'Sri Lanka':                     ['Colombo', 'Kandy'],
  'Nepal':                         ['Kathmandu', 'Pokhara'],
  'India':                         ['New Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Bangalore', 'Hyderabad', 'Ahmedabad', 'Pune', 'Surat', 'Jaipur', 'Lucknow', 'Bhopal'],
  // Central Asia
  'Kazakhstan':                    ['Almaty', 'Astana', 'Shymkent'],
  'Uzbekistan':                    ['Tashkent', 'Samarkand', 'Namangan'],
  'Tajikistan':                    ['Dushanbe', 'Khujand'],
  'Kyrgyzstan':                    ['Bishkek', 'Osh'],
  'Turkmenistan':                  ['Ashgabat', 'Mary'],
  'Azerbaijan':                    ['Baku', 'Ganja'],
  'Georgia':                       ['Tbilisi', 'Batumi'],
  'Armenia':                       ['Yerevan', 'Gyumri'],
  // Southeast Asia
  'Myanmar':                       ['Yangon', 'Mandalay', 'Naypyidaw', 'Mawlamyine'],
  'Thailand':                      ['Bangkok', 'Chiang Mai'],
  'Malaysia':                      ['Kuala Lumpur', 'George Town', 'Johor Bahru', 'Kota Kinabalu'],
  'Indonesia':                     ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Makassar'],
  'Philippines':                   ['Manila', 'Davao', 'Cebu City'],
  'Cambodia':                      ['Phnom Penh', 'Siem Reap'],
  'Laos':                          ['Vientiane', 'Luang Prabang'],
  'Vietnam':                       ['Hanoi', 'Ho Chi Minh City', 'Da Nang', 'Hue'],
  'Singapore':                     ['Singapore'],
  // Eastern Europe / Conflict Zones
  'Ukraine':                       ['Kyiv', 'Kharkiv', 'Odessa', 'Lviv', 'Zaporizhzhia', 'Dnipro', 'Donetsk', 'Mariupol'],
  'Belarus':                       ['Minsk', 'Grodno'],
  // Latin America
  'Colombia':                      ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena'],
  'Venezuela':                     ['Caracas', 'Maracaibo'],
  'Mexico':                        ['Mexico City', 'Guadalajara', 'Monterrey', 'Tijuana'],
  'Haiti':                         ['Port-au-Prince', 'Cap-Haïtien'],
  'Jamaica':                       ['Kingston'],
  'Honduras':                      ['Tegucigalpa'],
  'El Salvador':                   ['San Salvador'],
  'Guatemala':                     ['Guatemala City'],
  'Nicaragua':                     ['Managua'],
  'Costa Rica':                    ['San José'],
  'Peru':                          ['Lima'],
  'Ecuador':                       ['Quito', 'Guayaquil'],
  'Bolivia':                       ['La Paz', 'Cochabamba'],
  'Argentina':                     ['Buenos Aires', 'Rosario'],
  'Brazil':                        ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Recife', 'Salvador', 'Fortaleza'],
  'Chile':                         ['Santiago', 'Valparaíso'],
  'Paraguay':                      ['Asunción'],
  'Uruguay':                       ['Montevideo'],
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
  const rawSeverity = estimateSeverity(text)
  // Major events are always operationally significant — minimum severity 2
  const severity = eventType === 'major_event' ? Math.max(2, rawSeverity) : rawSeverity
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
    raw_title:           stripHtml(article.title || '').slice(0, 250),
    raw_summary:         stripHtml(text).slice(0, 500),
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
