let stateCache = null
let stateCacheTime = 0
let issCache = {}
let issCacheTime = 0
const CACHE_TTL = 60 * 60 * 1000 // 1 hour
const ISS_CACHE_TTL = 4 * 60 * 60 * 1000 // 4 hours — ISS publishes a few times a day

export default async function handler(req, res) {
  const { country } = req.query
  if (!country) return res.status(400).json({ error: 'country required' })

  try {
    const result = await getCountryRisk(country)
    res.json(result)
  } catch (e) {
    console.error('country-risk error:', e.message)
    res.status(500).json({ error: e.message || 'Failed to fetch country risk' })
  }
}

// ── Country name normalisation ────────────────────────────────────────────────
// Maps how we store country names → official name used by US State Dept feed
const STATE_DEPT_ALIASES = {
  'democratic republic of congo':         'Congo, Democratic Republic of the',
  'democratic republic of the congo':     'Congo, Democratic Republic of the',
  'drc':                                  'Congo, Democratic Republic of the',
  'republic of congo':                    'Congo, Republic of the',
  'republic of the congo':                'Congo, Republic of the',
  'tanzania':                             'Tanzania',
  'united republic of tanzania':          'Tanzania',
  'south korea':                          'Korea, South',
  'north korea':                          'Korea, North',
  'russia':                               'Russia',
  'iran':                                 'Iran',
  'syria':                                'Syria',
  'laos':                                 "Laos",
  'vietnam':                              'Vietnam',
  'cabo verde':                           'Cabo Verde',
  'cape verde':                           'Cabo Verde',
  'ivory coast':                          "Cote d'Ivoire",
  "côte d'ivoire":                        "Cote d'Ivoire",
  'east timor':                           'Timor-Leste',
  'swaziland':                            'Eswatini',
  'burma':                                'Burma (Myanmar)',
  'myanmar':                              'Burma (Myanmar)',
  'micronesia':                           'Micronesia, Federated States of',
  'palestine':                            'West Bank and Gaza',
  'saudi arabia':                         'Saudi Arabia',
  'united arab emirates':                 'United Arab Emirates',
  'uae':                                  'United Arab Emirates',
  'usa':                                  'United States',
  'uk':                                   'United Kingdom',
  'great britain':                        'United Kingdom',
}

// Maps our country name → FCDO URL slug when toSlug() gives wrong result
const FCDO_SLUG_OVERRIDES = {
  'democratic republic of congo':         'democratic-republic-congo',
  'democratic republic of the congo':     'democratic-republic-congo',
  'republic of congo':                    'congo',
  'republic of the congo':                'congo',
  'ivory coast':                          'ivory-coast',
  "côte d'ivoire":                        'ivory-coast',
  "cote d'ivoire":                        'ivory-coast',
  'myanmar':                              'myanmar-burma',
  'burma':                                'myanmar-burma',
  'laos':                                 'laos',
  'russia':                               'russia',
  'south korea':                          'south-korea',
  'north korea':                          'north-korea',
  'east timor':                           'timor-leste',
  'swaziland':                            'eswatini',
  'cape verde':                           'cape-verde',
  'cabo verde':                           'cape-verde',
  'united arab emirates':                 'united-arab-emirates',
  'uae':                                  'united-arab-emirates',
  'uk':                                   'united-kingdom',
  'great britain':                        'united-kingdom',
  'palestine':                            'the-occupied-palestinian-territories',
  'saudi arabia':                         'saudi-arabia',
  'south africa':                         'south-africa',
  'sierra leone':                         'sierra-leone',
  'burkina faso':                         'burkina-faso',
  'central african republic':             'central-african-republic',
  'equatorial guinea':                    'equatorial-guinea',
  'guinea-bissau':                        'guinea-bissau',
  'sri lanka':                            'sri-lanka',
  'new zealand':                          'new-zealand',
  'costa rica':                           'costa-rica',
  'dominican republic':                   'dominican-republic',
  'el salvador':                          'el-salvador',
  'trinidad and tobago':                  'trinidad-and-tobago',
  'united states':                        'usa',
  'south sudan':                          'south-sudan',
  'western sahara':                       'western-sahara',
}

// Normalize country names to URL-safe slugs, handling accented characters
function toSlug(str) {
  return str
    .normalize('NFD')                     // decompose accented chars
    .replace(/[̀-ͯ]/g, '')      // remove accent marks
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function stateDeptName(country) {
  return STATE_DEPT_ALIASES[country.toLowerCase()] || country
}

function fcdoSlug(country) {
  return FCDO_SLUG_OVERRIDES[country.toLowerCase()] || toSlug(country)
}

async function fetchWithTimeout(url, options = {}, ms = 6000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    const r = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeout)
    return r
  } catch (e) {
    clearTimeout(timeout)
    if (e.name === 'AbortError') return null
    return null
  }
}

async function getCountryRisk(country) {
  // --- US State Dept (cached) ---
  const cacheExpired = !stateCache || Date.now() - stateCacheTime > CACHE_TTL
  if (cacheExpired) {
    const r = await fetchWithTimeout(
      'https://travel.state.gov/content/dam/traveladvisories/Feeds/TravelAdvisoryJSON.json'
    )
    if (r?.ok) {
      try {
        stateCache = await r.json()
        stateCacheTime = Date.now()
      } catch {
        // Keep stale cache if JSON parse fails
        console.error('Failed to parse State Dept advisory JSON')
      }
    } else {
      console.error('State Dept advisory fetch failed:', r?.status)
      // Don't clear cache — use stale data if available
    }
  }

  const canonicalName = stateDeptName(country)
  const entry = stateCache?.graph?.find(c => {
    const n = (c.name || c.countryName || '').toLowerCase()
    return n === canonicalName.toLowerCase() || n === country.toLowerCase()
  })
  const usLevel = entry ? (entry.advisoryLevel ?? entry.level ?? null) : null
  const usMessage = entry ? (entry.advisoryText ?? entry.message ?? null) : null
  const usUrl = entry?.url ?? 'https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html'

  // --- UK FCDO ---
  const fcdo = await fetchFcdo(country)

  // --- Australian DFAT (link only) ---
  const dfatUrl = `https://www.smartraveller.gov.au/destinations/${toSlug(country)}`

  // --- ISS Africa (Institute for Security Studies) ---
  const iss = await fetchIssAlerts(country)

  // Combined risk level — if both sources return nothing, level is null → Unknown
  const rawMax = Math.max(usLevel ?? 0, fcdo?.level ?? 0)
  const combinedLevel = rawMax > 0 ? rawMax : null

  return {
    country,
    level: combinedLevel,
    severity: levelToSeverity(combinedLevel),
    sources: [
      usLevel != null ? { name: 'US State Dept', level: usLevel, message: usMessage, url: usUrl } : null,
      fcdo ? { name: 'UK FCDO', level: fcdo.level, message: fcdo.message, url: fcdo.url } : null,
      { name: 'AU DFAT', level: null, url: dfatUrl },
      iss ? { name: 'ISS Africa', level: null, message: iss.headline, url: iss.url, articles: iss.articles } : null,
    ].filter(Boolean),
  }
}

// --- ISS Africa RSS feed ---
async function fetchIssAlerts(country) {
  const now = Date.now()
  const cacheExpired = now - issCacheTime > ISS_CACHE_TTL

  if (cacheExpired) {
    // Fetch ISS Today RSS feed
    const r = await fetchWithTimeout('https://issafrica.org/rss/iss-today', {}, 6000)
    if (r?.ok) {
      try {
        const xml = await r.text()
        issCache = parseRssItems(xml)
        issCacheTime = now
      } catch {
        console.error('ISS RSS parse failed')
      }
    }
  }

  if (!issCache?.length) return null

  // Find articles mentioning this country
  const countryLower = country.toLowerCase()
  const matches = issCache.filter(item => {
    const text = (item.title + ' ' + item.description).toLowerCase()
    return text.includes(countryLower)
  }).slice(0, 3) // max 3 articles

  if (!matches.length) return null

  return {
    headline: matches[0].title,
    url: 'https://issafrica.org/iss-today',
    articles: matches.map(m => ({ title: m.title, url: m.link, date: m.pubDate })),
  }
}

function parseRssItems(xml) {
  const items = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`))
      return m ? (m[1] || m[2] || '').trim() : ''
    }
    items.push({
      title: get('title'),
      link: get('link'),
      description: get('description'),
      pubDate: get('pubDate'),
    })
  }
  return items
}

async function fetchFcdo(country) {
  const slug = fcdoSlug(country)
  try {
    const r = await fetchWithTimeout(
      `https://www.gov.uk/api/content/foreign-travel-advice/${slug}`,
      { headers: { Accept: 'application/json' } }
    )
    if (!r || !r.ok) return null
    const data = await r.json()
    const warnings = data.details?.parts?.find(p => p.slug === 'warnings-and-insurance')
    if (!warnings?.body) return null

    const text = warnings.body.toLowerCase()
    let level = 1
    // Check most severe first to avoid partial matches
    if (text.includes('advises against all travel') && !text.includes('all but essential')) level = 4
    else if (text.includes('all but essential travel')) level = 3
    else if (text.includes('advises against some travel') || text.includes('some parts')) level = 2

    return {
      level,
      message: fcdoLevelText(level),
      url: `https://www.gov.uk/foreign-travel-advice/${slug}`,
    }
  } catch (e) {
    console.error('FCDO fetch error for', country, ':', e.message)
    return null
  }
}

function fcdoLevelText(level) {
  if (level >= 4) return 'FCDO: Do not travel'
  if (level >= 3) return 'FCDO: All but essential travel'
  if (level >= 2) return 'FCDO: Some areas — exercise caution'
  return 'FCDO: Normal precautions'
}

function levelToSeverity(level) {
  if (!level || level <= 0) return 'Unknown'
  if (level >= 4) return 'Critical'
  if (level >= 3) return 'High'
  if (level >= 2) return 'Medium'
  return 'Low'
}

export { getCountryRisk }
