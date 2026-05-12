/**
 * api/_claudeSynth.js
 *
 * Shared Claude AI synthesis engine + live feed helpers.
 * Underscore prefix → Vercel does NOT expose this as an API route.
 * Imported by country-risk.js, trip-alert-scan.js, and ai-assistant.js.
 */

// ── All-source risk feeds (conflict / security / weather + health) ────────────
// Used by fetchArticlesForCountry() to build a comprehensive intelligence picture.
const ALL_RISK_FEEDS = [
  // Conflict & War
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                          name: 'BBC World',            category: 'conflict'  },
  { url: 'https://www.france24.com/en/rss',                                       name: 'France 24',            category: 'conflict'  },
  { url: 'https://kyivindependent.com/feed/',                                     name: 'Kyiv Independent',     category: 'conflict'  },
  { url: 'https://www.middleeasteye.net/rss',                                     name: 'Middle East Eye',      category: 'conflict'  },
  { url: 'https://www.iranintl.com/en/rss',                                       name: 'Iran International',   category: 'conflict'  },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',                             name: 'Al Jazeera',           category: 'conflict'  },
  { url: 'https://news.un.org/feed/subscribe/en/news/region/africa/feed/rss.xml', name: 'UN News Africa',       category: 'conflict'  },
  { url: 'https://news.un.org/feed/subscribe/en/news/region/middle-east/feed/rss.xml', name: 'UN News ME',     category: 'conflict'  },
  { url: 'https://acleddata.com/feed/',                                            name: 'ACLED Blog',           category: 'conflict'  },
  { url: 'https://thedefensepost.com/feed/',                                      name: 'The Defense Post',     category: 'conflict'  },
  // Security analysis
  { url: 'https://issafrica.org/rss/iss-today',                                   name: 'ISS Africa',           category: 'security'  },
  { url: 'https://www.crisisgroup.org/rss/africa',                                name: 'Crisis Group Africa',  category: 'security'  },
  { url: 'https://www.crisisgroup.org/rss/middle-east-north-africa',              name: 'Crisis Group MENA',    category: 'security'  },
  { url: 'https://jamestown.org/feed/',                                           name: 'Jamestown Foundation', category: 'security'  },
  { url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml',                   name: 'BBC Africa',           category: 'security'  },
  { url: 'https://africanarguments.org/feed/',                                    name: 'African Arguments',    category: 'security'  },
  // Health / disease outbreaks
  { url: 'https://www.who.int/rss-feeds/news-english.xml',                        name: 'WHO',                  category: 'health'    },
  { url: 'https://reliefweb.int/updates/rss.xml?source=WHO',                     name: 'ReliefWeb/WHO',        category: 'health'    },
  { url: 'https://outbreaknewstoday.com/feed/',                                  name: 'Outbreak News Today',  category: 'health'    },
  { url: 'https://www.cidrap.umn.edu/rss.xml',                                   name: 'CIDRAP',               category: 'health'    },
  { url: 'https://www.paho.org/en/rss.xml',                                      name: 'PAHO',                 category: 'health'    },
  { url: 'https://africacdc.org/feed/',                                           name: 'Africa CDC',           category: 'health'    },
  // Weather & natural disasters
  { url: 'https://reliefweb.int/disasters/rss.xml',                              name: 'ReliefWeb Disasters',  category: 'weather'   },
]

// ── Country aliases for better article matching ───────────────────────────────
const COUNTRY_ALIASES = {
  'ukraine':                      ['ukraine', 'ukrainian', 'kyiv', 'donbas', 'zelensky', 'crimea', 'kharkiv', 'kherson', 'zaporizhzhia', 'mariupol', 'dnipro'],
  'russia':                       ['russia', 'russian', 'moscow', 'kremlin', 'putin', 'wagner', 'fsb', 'chechen', 'rosgvardia'],
  'mali':                         ['mali', 'malian', 'bamako', 'sahel', 'jnim', 'azawad', 'gao', 'timbuktu', 'kidal'],
  'burkina faso':                 ['burkina', 'ouagadougou', 'burkina faso', 'ansarul islam', 'sahel'],
  'niger':                        ['niger', 'niamey', 'sahel', 'cnsp', 'jnim'],
  'chad':                         ['chad', 'chadian', 'ndjamena', 'sahel', 'lake chad'],
  'iran':                         ['iran', 'iranian', 'tehran', 'irgc', 'khamenei', 'persian', 'quds force'],
  'iraq':                         ['iraq', 'iraqi', 'baghdad', 'isis', 'isil', 'pmu', 'erbil', 'kurdistan', 'mosul'],
  'syria':                        ['syria', 'syrian', 'damascus', 'aleppo', 'hts', 'hayat tahrir', 'deir ez-zor'],
  'israel':                       ['israel', 'israeli', 'tel aviv', 'hamas', 'hezbollah', 'idf', 'west bank', 'netanyahu', 'gaza'],
  'palestine':                    ['palestine', 'palestinian', 'gaza', 'hamas', 'west bank', 'idf', 'rafah', 'jabalia'],
  'yemen':                        ['yemen', 'yemeni', 'sanaa', 'houthi', 'ansar allah', 'aden', 'hudaydah'],
  'libya':                        ['libya', 'libyan', 'tripoli', 'benghazi', 'haftar', 'gnu'],
  'somalia':                      ['somalia', 'somali', 'mogadishu', 'al-shabaab', 'al shabaab', 'amisom', 'atmis'],
  'ethiopia':                     ['ethiopia', 'ethiopian', 'addis ababa', 'tigray', 'amhara', 'oromia', 'tplf', 'fano'],
  'sudan':                        ['sudan', 'sudanese', 'khartoum', 'rsf', 'rapid support forces', 'darfur', 'sat'],
  'south sudan':                  ['south sudan', 'juba', 'splm', 'splm-io'],
  'democratic republic of congo': ['congo', 'drc', 'kinshasa', 'goma', 'm23', 'ituri', 'kivu', 'adf', 'bunia'],
  'democratic republic of the congo': ['congo', 'drc', 'kinshasa', 'goma', 'm23', 'ituri', 'kivu', 'adf'],
  'central african republic':     ['central african republic', 'car', 'bangui', 'wagner', 'faca'],
  'mozambique':                   ['mozambique', 'mozambican', 'maputo', 'cabo delgado', 'ansar al-sunna'],
  'nigeria':                      ['nigeria', 'nigerian', 'lagos', 'abuja', 'boko haram', 'iswap', 'bandits', 'ipob'],
  'cameroon':                     ['cameroon', 'cameroonian', 'yaounde', 'douala', 'anglophone', 'ambazonia'],
  'kenya':                        ['kenya', 'kenyan', 'nairobi', 'al-shabaab', 'mombasa'],
  'myanmar':                      ['myanmar', 'burma', 'burmese', 'yangon', 'naypyidaw', 'tatmadaw', 'nug', 'pdf', 'arakan army'],
  'afghanistan':                  ['afghanistan', 'afghan', 'kabul', 'taliban', 'isis-k', 'iskp', 'kandahar'],
  'pakistan':                     ['pakistan', 'pakistani', 'islamabad', 'karachi', 'ttp', 'balochistan', 'lahore'],
  'haiti':                        ['haiti', 'haitian', 'port-au-prince', 'port au prince', 'gang violence', 'peyi lok'],
  'venezuela':                    ['venezuela', 'venezuelan', 'caracas', 'maduro', 'eln', 'colectivos'],
  'colombia':                     ['colombia', 'colombian', 'bogota', 'eln', 'farc', 'disidencias'],
  'mexico':                       ['mexico', 'mexican', 'mexico city', 'cartel', 'jalisco', 'sinaloa', 'cjng'],
  'north korea':                  ['north korea', 'north korean', 'pyongyang', 'dprk', 'kim jong'],
  'united arab emirates':         ['uae', 'united arab emirates', 'dubai', 'abu dhabi'],
  'saudi arabia':                 ['saudi', 'saudi arabia', 'riyadh', 'mbs'],
  'israel':                       ['israel', 'israeli', 'idf', 'hamas', 'hezbollah', 'tel aviv', 'gaza', 'west bank'],
}

// ── Article feed cache (per URL, 20-min TTL) ──────────────────────────────────
const ARTICLE_FEED_CACHE = {}
const ARTICLE_FEED_TTL   = 20 * 60 * 1000

async function fetchFeedItems(url, name) {
  const cached = ARTICLE_FEED_CACHE[url]
  if (cached && Date.now() - cached.ts < ARTICLE_FEED_TTL) return cached.items
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'SafeGuard360/1.0 (travel risk platform)' },
      signal: AbortSignal.timeout(6000),
    })
    if (!r?.ok) { ARTICLE_FEED_CACHE[url] = { items: [], ts: Date.now() }; return [] }
    const items = parseHealthRss(await r.text())   // parseHealthRss handles all RSS/Atom
    ARTICLE_FEED_CACHE[url] = { items, ts: Date.now() }
    return items
  } catch {
    return ARTICLE_FEED_CACHE[url]?.items || []
  }
}

/**
 * Fetch recent articles from ALL configured risk feeds that mention the
 * given country (or city), using alias matching for common abbreviations
 * and armed-group names. Returns up to 30 unique articles sorted newest first.
 */
export async function fetchArticlesForCountry(country, city = null) {
  const q       = country.toLowerCase().trim()
  const aliases = new Set([q])

  if (city) aliases.add(city.toLowerCase().trim())

  // Add known aliases for this country
  const knownAliases = COUNTRY_ALIASES[q] || []
  knownAliases.forEach(a => aliases.add(a))

  // Fetch all feeds in parallel (skip duplicate URLs)
  const seenUrls = new Set()
  const feedJobs = ALL_RISK_FEEDS.filter(f => {
    if (seenUrls.has(f.url)) return false
    seenUrls.add(f.url)
    return true
  })

  const settled = await Promise.allSettled(
    feedJobs.map(async feed => {
      const items = await fetchFeedItems(feed.url, feed.name)
      return items.map(i => ({ ...i, feedName: feed.name, feedCategory: feed.category }))
    })
  )

  const allItems = settled
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)

  // Filter for country relevance
  const matches = allItems.filter(item => {
    const text = `${item.title} ${item.description}`.toLowerCase()
    return [...aliases].some(a => text.includes(a))
  })

  // Sort newest first, deduplicate by title prefix
  const seen = new Set()
  return matches
    .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
    .filter(item => {
      const key = (item.title || '').slice(0, 60).toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 30)
}

// ── Comprehensive risk scan cache ─────────────────────────────────────────────
const COMPREHENSIVE_CACHE = {}
const COMPREHENSIVE_TTL   = 60 * 60 * 1000  // 1 hour per country

/**
 * Full-spectrum travel risk assessment using ALL intelligence sources:
 * conflict/security/health/weather RSS feeds + FCDO + GDACS + USGS + health feeds.
 *
 * Returns { overall_severity, summary, key_risks, recommendations,
 *           risks: [{category, severity, title, description, recommendation}] }
 */
export async function comprehensiveRiskScan(country, city, liveData = {}, apiKey) {
  if (!apiKey) return null

  const cacheKey = `${country.toLowerCase()}:${(city || '').toLowerCase()}`
  const cached   = COMPREHENSIVE_CACHE[cacheKey]
  if (cached && Date.now() - cached.ts < COMPREHENSIVE_TTL) return cached.data

  const { fcdo, gdacs = [], usgs = [], iss, health } = liveData
  const location = city ? `${city}, ${country}` : country

  // Fetch all RSS articles mentioning this country in parallel with the rest
  const articles = await fetchArticlesForCountry(country, city)

  // Group articles by feed category (max 8 per category for prompt efficiency)
  const byCategory = {}
  articles.forEach(a => {
    const cat = a.feedCategory || 'security'
    if (!byCategory[cat]) byCategory[cat] = []
    if (byCategory[cat].length < 8) byCategory[cat].push(`[${a.feedName}] ${a.title}`)
  })

  const catText = (cat, label) =>
    byCategory[cat]?.length
      ? `${label}:\n${byCategory[cat].join('\n')}`
      : `${label}: No recent articles`

  const fcdoLine = fcdo
    ? `UK FCDO Level ${fcdo.level}/4 — ${fcdo.message}`
    : 'UK FCDO: data unavailable'

  const gdacsText = gdacs.length
    ? gdacs.slice(0, 4).map(e =>
        `${e.properties?.eventname || e.properties?.eventtype || 'Event'} [${e.properties?.alertlevel || '?'}]`
      ).join('; ')
    : 'None'

  const usgsText = usgs.length
    ? usgs.slice(0, 4).map(e =>
        `M${(e.properties?.mag || 0).toFixed(1)} – ${e.properties?.place || '?'}`
      ).join('; ')
    : 'None in past 7 days'

  const healthMatches = health?.matches || []
  const healthRecent  = health?.recent  || []
  const healthText = healthMatches.length
    ? healthMatches.map(a => `[${a.source}] ${a.title}`).join('; ')
    : healthRecent.length
    ? `No country-specific alerts. Global: ${healthRecent.slice(0, 3).map(a => a.title).join('; ')}`
    : 'No recent outbreak data'

  const prompt = `You are a senior corporate travel security analyst. Analyse ALL available intelligence for ${location} and produce a structured risk assessment for a client travelling to this destination.

== OFFICIAL ADVISORIES ==
${fcdoLine}
Active disasters (GDACS): ${gdacsText}
Earthquakes M5+ / 7d (USGS): ${usgsText}

== LIVE INTELLIGENCE FEEDS ==
${catText('conflict', 'Conflict & War news')}

${catText('security', 'Security analysis')}

${catText('health', 'Health & Disease alerts')}
Disease/outbreak feeds (WHO/PAHO/CIDRAP): ${healthText}

${catText('weather', 'Weather & Natural disasters')}

== INSTRUCTIONS ==
Produce a structured JSON risk assessment. Be specific — reference actual events from the feeds above. Do not invent risks. If feeds show no relevant threats for this location, reflect that accurately.

Respond ONLY with valid JSON, no markdown:
{
  "overall_severity": "Low|Medium|High|Critical",
  "summary": "2-3 sentence executive situation summary covering the most significant current threats",
  "key_risks": ["specific risk 1 with detail", "specific risk 2", "specific risk 3"],
  "recommendations": ["actionable rec 1", "actionable rec 2", "health precaution if relevant"],
  "risks": [
    {
      "category": "conflict|security|health|weather|crime|political",
      "severity": "Low|Medium|High|Critical",
      "title": "Short risk title (max 60 chars)",
      "description": "1-2 sentence description of the specific risk, citing the source feed or event",
      "recommendation": "Specific actionable advice for the traveller"
    }
  ]
}`

  try {
    const model = await resolveModel(apiKey)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(25000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[_claudeSynth] comprehensiveRiskScan HTTP error:', res.status, err?.error?.message)
      return null
    }

    const data  = await res.json()
    const raw   = (data?.content?.[0]?.text || '').replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error('[_claudeSynth] no JSON in comprehensiveRiskScan response:', raw.slice(0, 200))
      return null
    }
    const result = JSON.parse(match[0])
    COMPREHENSIVE_CACHE[cacheKey] = { data: result, ts: Date.now() }
    return result
  } catch (e) {
    console.error('[_claudeSynth] comprehensiveRiskScan failed:', e.message)
    return null
  }
}

// ── Model resolution (module-level cache survives warm invocations) ────────────
let _cachedModel = null
let _cachedModelTs = 0

export async function resolveModel(apiKey) {
  if (_cachedModel && Date.now() - _cachedModelTs < 60 * 60 * 1000) {
    return _cachedModel
  }
  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(4000),
    })
    if (r.ok) {
      const { data } = await r.json()
      const sorted = (data || []).sort((a, b) => {
        const rank = id =>
          id.includes('haiku') ? 0 : id.includes('sonnet') ? 1 : 2
        const r1 = rank(a.id), r2 = rank(b.id)
        if (r1 !== r2) return r1 - r2
        return b.id.localeCompare(a.id)
      })
      if (sorted.length > 0) {
        _cachedModel = sorted[0].id
        _cachedModelTs = Date.now()
        console.log('[_claudeSynth] Resolved model:', _cachedModel)
        return _cachedModel
      }
    }
  } catch (e) {
    console.warn('[_claudeSynth] Model list failed:', e.message)
  }
  return 'claude-3-haiku-20240307'
}

// ── Health outbreak feeds ─────────────────────────────────────────────────────
const HEALTH_FEED_CACHE = {}
const HEALTH_CACHE_TTL  = 30 * 60 * 1000   // 30 min — faster refresh for outbreaks

const HEALTH_FEEDS = [
  // URLs verified working (200 OK, correct content-type)
  { id: 'who',       url: 'https://www.who.int/rss-feeds/news-english.xml',                 name: 'WHO' },
  { id: 'reliefweb', url: 'https://reliefweb.int/updates/rss.xml?source=WHO',               name: 'ReliefWeb / WHO' },
  { id: 'paho',      url: 'https://www.paho.org/en/rss.xml',                                name: 'PAHO' },
  { id: 'outbreak',  url: 'https://outbreaknewstoday.com/feed/',                            name: 'Outbreak News Today' },
  { id: 'cidrap',    url: 'https://www.cidrap.umn.edu/rss.xml',                             name: 'CIDRAP' },
  { id: 'africacdc', url: 'https://africacdc.org/feed/',                                    name: 'Africa CDC' },
]

function parseHealthRss(xml) {
  const items = []
  const re = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g
  let m
  while ((m = re.exec(xml)) !== null) {
    const b   = m[1]
    const get = tag => {
      const x = b.match(new RegExp(
        `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`
      ))
      return x ? (x[1] || x[2] || '').trim() : ''
    }
    let link = get('link')
    if (!link) { const la = b.match(/<link[^>]+href=["']([^"']+)["']/); if (la) link = la[1] }
    const title = get('title')
    if (title) items.push({
      title,
      link,
      description: get('description') || get('summary') || '',
      pubDate:     get('pubDate') || get('published') || get('updated') || '',
    })
  }
  return items
}

async function fetchHealthFeed(feed) {
  const cached = HEALTH_FEED_CACHE[feed.id]
  if (cached && Date.now() - cached.ts < HEALTH_CACHE_TTL) return cached.items

  try {
    const r = await fetch(feed.url, {
      headers: { 'User-Agent': 'SafeGuard360/1.0 (travel risk platform)' },
      signal: AbortSignal.timeout(6000),
    })
    if (!r?.ok) { HEALTH_FEED_CACHE[feed.id] = { items: [], ts: Date.now() }; return [] }
    const items = parseHealthRss(await r.text())
    HEALTH_FEED_CACHE[feed.id] = { items, ts: Date.now() }
    return items
  } catch {
    return HEALTH_FEED_CACHE[feed.id]?.items || []
  }
}

/**
 * Fetch disease outbreak headlines relevant to a given country.
 * Returns up to 5 matching articles from WHO, ProMED, PAHO, Outbreak News Today,
 * CIDRAP and Africa CDC. Also returns global outbreak headlines (last 5)
 * so the AI brief always has current disease context even if no country match.
 */
export async function fetchHealthOutbreaks(country) {
  try {
    // Fetch all health feeds in parallel
    const allItems = await Promise.all(HEALTH_FEEDS.map(async feed => {
      const items = await fetchHealthFeed(feed)
      return items.map(i => ({ ...i, source: feed.name }))
    }))
    const flat = allItems.flat()

    const q       = country.toLowerCase()
    const aliases = [q]
    // Add specific aliases — avoid short ambiguous ones like 'us ' or 'uk '
    // NOTE: 'america'/'american' removed from US aliases — they match 'Americas' (PAHO region
    // covering all of North/South America) and 'pan-american', causing false positives for
    // Chile, Canada etc. 'usa' is matched with a word-boundary regex instead.
    if (q === 'democratic republic of congo') aliases.push('drc', 'dr congo', 'congo')
    if (q === 'united states')               aliases.push('u.s.', 'u.s.a.')
    if (q === 'united kingdom')              aliases.push('britain', 'england', 'scotland', 'wales', 'uk')
    if (q === 'united arab emirates')        aliases.push('uae', 'dubai', 'abu dhabi')
    if (q === 'south africa')                aliases.push('south african')
    if (q === 'new zealand')                 aliases.push('aotearoa')

    // Word-boundary regex patterns for aliases that would otherwise match substrings
    // e.g. 'usa' must not match inside 'jerusalem', 'usa' must not match 'cause'
    const wbMatchers = []
    if (q === 'united states') wbMatchers.push(/\busa\b/i)
    if (q === 'united kingdom') wbMatchers.push(/\buk\b/i)

    // Match only on the title for precision — descriptions contain too much noise
    const matches = flat.filter(i => {
      const title = i.title.toLowerCase()
      return aliases.some(a => title.includes(a)) || wbMatchers.some(rx => rx.test(i.title))
    }).slice(0, 5)

    // Always include recent global outbreak headlines for AI context
    const recent = flat
      .filter(i => i.pubDate)
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .slice(0, 5)

    return { matches, recent }
  } catch {
    return { matches: [], recent: [] }
  }
}

// ── GDACS live disaster events ────────────────────────────────────────────────
export async function fetchGDACS(country) {
  try {
    const qs = new URLSearchParams({
      eventlist: 'EQ,TC,FL,VO,DR,WF',
      alertlevel: 'Green,Orange,Red',
      limit: '100',
    })
    const r = await fetch(
      `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?${qs}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!r?.ok) return []
    const data = await r.json()
    const q = country.toLowerCase()
    return (data?.features || []).filter(f => {
      const c = (f.properties?.country || '').toLowerCase()
      return c.includes(q) || q.includes(c.split(',')[0].trim())
    })
  } catch {
    return []
  }
}

// ── USGS M5+ earthquakes (last 7 days) ───────────────────────────────────────
export async function fetchUSGS(country) {
  try {
    const now  = new Date()
    const past = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const qs   = new URLSearchParams({
      format: 'geojson',
      starttime: past.toISOString().split('T')[0],
      endtime:   now.toISOString().split('T')[0],
      minmagnitude: '5.0',
      orderby: 'magnitude',
      limit: '50',
    })
    const r = await fetch(
      `https://earthquake.usgs.gov/fdsnws/event/1/query?${qs}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!r?.ok) return []
    const data = await r.json()
    const q = country.toLowerCase()
    return (data?.features || []).filter(f =>
      (f.properties?.place || '').toLowerCase().includes(q)
    )
  } catch {
    return []
  }
}

// ── Claude AI country security synthesis ─────────────────────────────────────
/**
 * Synthesise a structured travel security brief using Claude.
 *
 * @param {string}      country
 * @param {string|null} city         - Specific city within the country (optional)
 * @param {{ fcdo, gdacs, usgs, iss }} sources - Live feed data
 * @param {string}      apiKey
 * @returns {Promise<{summary, threat_level, key_risks, recommendations}|null>}
 */
export async function synthesiseBrief(country, city, sources, apiKey) {
  if (!apiKey) return null

  const { fcdo, gdacs = [], usgs = [], iss, health } = sources
  const location = city ? `${city}, ${country}` : country

  const fcdoLine = fcdo
    ? `UK FCDO Level ${fcdo.level}/4 — ${fcdo.message}`
    : 'UK FCDO: Advisory data unavailable'

  const gdacsText = gdacs.length
    ? gdacs.slice(0, 4).map(e =>
        `${e.properties?.eventname || e.properties?.eventtype || 'Event'} [${e.properties?.alertlevel || '?'}]`
      ).join('; ')
    : 'None'

  const usgsText = usgs.length
    ? usgs.slice(0, 4).map(e =>
        `M${(e.properties?.mag || 0).toFixed(1)} – ${e.properties?.place || '?'}`
      ).join('; ')
    : 'None in past 7 days'

  const issText = iss?.articles?.length
    ? iss.articles.slice(0, 3).map(a => a.title).join('; ')
    : 'No recent articles'

  // Health outbreak context — country-specific matches first, then global headlines
  const healthMatches = health?.matches || []
  const healthRecent  = health?.recent  || []
  const healthText = healthMatches.length
    ? healthMatches.map(a => `[${a.source}] ${a.title}`).join('; ')
    : healthRecent.length
    ? `No country-specific alerts. Recent global: ${healthRecent.slice(0, 3).map(a => a.title).join('; ')}`
    : 'No recent outbreak data available'

  const prompt = `You are a corporate travel security analyst briefing a risk manager.
Analyse live intelligence for ${location} and give a concise assessment.

Advisory: ${fcdoLine}
Active disasters (GDACS): ${gdacsText}
Earthquakes M5+ / 7d (USGS): ${usgsText}
Security news (ISS Africa): ${issText}
Disease & health outbreaks (WHO/ProMED/PAHO/CIDRAP): ${healthText}

Respond ONLY with valid JSON, no markdown:
{"summary":"2-3 sentence executive situation summary including any active health risks","threat_level":"Low|Medium|High|Critical","key_risks":["specific risk 1","specific risk 2","specific risk 3","health/disease risk if relevant"],"recommendations":["actionable rec 1","actionable rec 2","health precaution if relevant"]}`

  try {
    const model = await resolveModel(apiKey)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[_claudeSynth] synthesis HTTP error:', res.status, err?.error?.message)
      return null
    }

    const data   = await res.json()
    const raw    = (data?.content?.[0]?.text || '').replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
    const match  = raw.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error('[_claudeSynth] no JSON in Claude response:', raw.slice(0, 200))
      return null
    }
    return JSON.parse(match[0])
  } catch (e) {
    console.error('[_claudeSynth] synthesis failed:', e.message)
    return null
  }
}

// ── Conversational AI assistant ───────────────────────────────────────────────
/**
 * Single-turn AI assistant response, with optional platform context injected.
 *
 * @param {string} userMessage
 * @param {{ country?, tripName?, travelerName?, activeAlerts?, role? }} context
 * @param {string} apiKey
 * @returns {Promise<string|null>}
 */
export async function askAssistant(userMessage, context = {}, apiKey, history = []) {
  if (!apiKey || !userMessage?.trim()) return null

  const today = new Date().toISOString().split('T')[0]

  let system

  if (context.mode === 'trip') {
    system = `You are a friendly trip planning assistant for Safeguard 360. Help the traveller log their upcoming trip through a short, natural conversation.

Fields to collect:
- trip_name: brief descriptive name (e.g. "Lagos Board Meeting")
- departure_city: where they depart from
- arrival_city: destination city
- depart_date: departure date (YYYY-MM-DD)
- return_date: return date (YYYY-MM-DD)
- flight_number: flight number if flying (optional, e.g. BA001 or BAW001)
- hotel_name: hotel or accommodation (optional)
- meetings: trip purpose or notes (optional)

Rules:
- Ask one or two things at a time. Be warm, efficient, and professional.
- Extract info as provided — never ask for something already given.
- Convert natural language dates to YYYY-MM-DD using today's date (${today}).
- When you haven't been told the trip name, infer a sensible one from destination + purpose.

After EVERY response, append this data block on its own line (the user won't see this):
<<TRIP_DATA:{"trip_name":"...","departure_city":"...","arrival_city":"...","depart_date":"...","return_date":"...","flight_number":"...","hotel_name":"...","meetings":"..."}>>

Only include fields you have confirmed. Omit unknown fields entirely (don't include empty strings).
When all required fields (trip_name, departure_city, arrival_city, depart_date, return_date) are collected, end your message with: "I have everything I need to set up your trip!" — then the data block.`
  } else {
    const contextLines = [
      context.country      && `Traveller destination: ${context.country}`,
      context.travelerName && `Traveller name: ${context.travelerName}`,
      context.tripName     && `Active trip: ${context.tripName}`,
      context.activeTrips  && `Upcoming trips: ${context.activeTrips}`,
      context.orgName      && `Organisation: ${context.orgName}`,
      context.activeAlerts && `Active platform alerts: ${context.activeAlerts}`,
    ].filter(Boolean).join('\n')

    system = `You are an expert travel security AI analyst embedded in SafeGuard360. The platform has live intelligence feeds (FCDO, BBC, Al Jazeera, ACLED, WHO, GDACS, USGS) that are continuously updated — you are operating in an environment with current awareness.

Rules:
- Answer travel security questions directly and confidently from your expertise
- Do NOT open responses with knowledge-cutoff disclaimers — this undermines confidence. If real-time verification is needed for a very specific recent event, add a brief note at the END only
- Use plain conversational prose for short answers. Use bullet points (- item) for lists. Avoid markdown headers (# ##) entirely — this is a chat interface, not a document
- Be concise and actionable. Lead with the most useful information
- Never fabricate specific incidents, casualty figures, or advisory levels
- If asked about a very recent specific event you cannot confirm, say so briefly at the end and point to FCDO (gov.uk/foreign-travel-advice) or ACLED
- For medical or legal advice, direct to qualified professionals
- Maintain full conversation context — refer to prior messages naturally

Today: ${today}
${contextLines ? `\nTraveller context:\n${contextLines}` : ''}`
  }

  // Build multi-turn message history — skip the initial greeting (index 0)
  const apiMessages = [
    ...history.slice(1).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    })),
    { role: 'user', content: userMessage },
  ]

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system,
        messages: apiMessages,
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) return null
    const data = await res.json()
    return data?.content?.[0]?.text?.trim() || null
  } catch (e) {
    console.error('[_claudeSynth] askAssistant failed:', e.message)
    return null
  }
}

// ── AI morning brief (admin dashboard) ───────────────────────────────────────
/**
 * Generate an admin morning briefing summarising all active situations.
 *
 * @param {{ trips: Array, alerts: Array, countries: string[] }} data
 * @param {string} apiKey
 * @returns {Promise<{headline, situations, priority_actions}|null>}
 */
export async function generateMorningBrief(data, apiKey) {
  if (!apiKey) return null

  const { trips = [], alerts = [], countries = [] } = data

  const tripLines = trips.slice(0, 8).map(t =>
    `• ${t.traveler_name || 'Traveller'} → ${t.arrival_city} (${t.depart_date}–${t.return_date || '?'}) [${t.risk_level || 'Unknown'} risk]`
  ).join('\n') || 'No active or upcoming trips.'

  const alertLines = alerts.slice(0, 6).map(a =>
    `• [${a.severity}] ${a.title} — ${a.country || ''}`
  ).join('\n') || 'No active alerts.'

  const countriesList = countries.length ? countries.join(', ') : 'None'

  const prompt = `You are a senior travel security analyst. Produce a concise morning briefing for a corporate security manager.

Active/upcoming trips:\n${tripLines}

Live alerts:\n${alertLines}

Countries of interest: ${countriesList}

Return ONLY valid JSON:
{"headline":"one-sentence overall situation assessment","situations":[{"country":"name","summary":"1-2 sentence situation","severity":"Low|Medium|High|Critical"}],"priority_actions":["action 1","action 2","action 3"]}`

  try {
    const model = await resolveModel(apiKey)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) return null
    const d   = await res.json()
    const raw = (d?.content?.[0]?.text || '').replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0])
  } catch (e) {
    console.error('[_claudeSynth] morningBrief failed:', e.message)
    return null
  }
}
