/**
 * api/_claudeSynth.js
 *
 * Shared Claude AI synthesis engine + live feed helpers.
 * Underscore prefix → Vercel does NOT expose this as an API route.
 * Imported by country-risk.js, trip-alert-scan.js, and ai-assistant.js.
 */

import { parseRssXml } from './_rssParser.js'
import { createClient } from '@supabase/supabase-js'

// Lazy Supabase client — only created when a knowledge lookup is needed
let _sb = null
function getSupabase() {
  if (_sb) return _sb
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  _sb = createClient(url, key)
  return _sb
}

/**
 * Pull the most-recent proprietary intelligence reports for a country
 * from the cairo_knowledge table (type = 'report').
 * Returns title + summary + first 2000 chars of content for prompt injection.
 */
async function fetchKnowledgeReports(country) {
  try {
    const sb = getSupabase()
    if (!sb) return []
    const { data } = await sb
      .from('cairo_knowledge')
      .select('title, summary, content, created_at')
      .eq('type', 'report')
      .eq('retrieval_ready', true)
      .eq('intelligence_enabled', true)
      .contains('countries', [country])
      .order('created_at', { ascending: false })
      .limit(3)
    return (data || []).map(r => ({
      title:   r.title,
      summary: r.summary || '',
      excerpt: (r.content || '').slice(0, 2000),
    }))
  } catch {
    return []
  }
}

/**
 * Fetch knowledge base entries for CAIRO chat injection.
 * Broader than fetchKnowledgeReports — all types, optional country filter,
 * falls back to most-recent global docs when no country match found.
 */
async function fetchKnowledgeForChat(country) {
  try {
    const sb = getSupabase()
    if (!sb) return []

    let docs = []

    // Try country-specific first
    if (country) {
      const { data: countryDocs } = await sb
        .from('cairo_knowledge')
        .select('type, title, summary, content, countries, created_at')
        .eq('retrieval_ready', true)
        .eq('intelligence_enabled', true)
        .contains('countries', [country])
        .order('created_at', { ascending: false })
        .limit(4)
      docs = countryDocs || []
    }

    // Always include global/regional docs (no country restriction)
    const { data: globalDocs } = await sb
      .from('cairo_knowledge')
      .select('type, title, summary, content, countries, created_at')
      .eq('retrieval_ready', true)
      .eq('intelligence_enabled', true)
      .eq('doc_tier', 'global')
      .order('created_at', { ascending: false })
      .limit(2)

    // Merge, deduplicate by title
    const seen = new Set(docs.map(d => d.title))
    for (const d of (globalDocs || [])) {
      if (!seen.has(d.title)) { docs.push(d); seen.add(d.title) }
    }

    // If still empty, grab the 3 most recent regardless of country
    if (!docs.length) {
      const { data: recent } = await sb
        .from('cairo_knowledge')
        .select('type, title, summary, content, countries, created_at')
        .eq('retrieval_ready', true)
        .eq('intelligence_enabled', true)
        .order('created_at', { ascending: false })
        .limit(3)
      docs = recent || []
    }

    return docs.slice(0, 5).map(r => ({
      type:    r.type,
      title:   r.title,
      summary: r.summary || '',
      excerpt: (r.content || '').slice(0, 1500),
    }))
  } catch {
    return []
  }
}

// ── All-source risk feeds (conflict / security / weather + health) ────────────
// Used by fetchArticlesForCountry() to build a comprehensive intelligence picture.
const ALL_RISK_FEEDS = [
  // Conflict & War
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                          name: 'BBC World',            category: 'conflict'      },
  { url: 'https://www.france24.com/en/rss',                                       name: 'France 24',            category: 'conflict'      },
  { url: 'https://kyivindependent.com/feed/',                                     name: 'Kyiv Independent',     category: 'conflict'      },
  { url: 'https://www.middleeasteye.net/rss',                                     name: 'Middle East Eye',      category: 'conflict'      },
  { url: 'https://www.iranintl.com/en/rss',                                       name: 'Iran International',   category: 'conflict'      },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',                             name: 'Al Jazeera',           category: 'conflict'      },
  { url: 'https://news.un.org/feed/subscribe/en/news/region/africa/feed/rss.xml', name: 'UN News Africa',       category: 'conflict'      },
  { url: 'https://news.un.org/feed/subscribe/en/news/region/middle-east/feed/rss.xml', name: 'UN News ME',     category: 'conflict'      },
  { url: 'https://acleddata.com/category/analysis/feed/',                          name: 'ACLED Blog',           category: 'conflict'      },
  { url: 'https://thedefensepost.com/feed/',                                      name: 'The Defense Post',     category: 'conflict'      },
  { url: 'https://feeds.reuters.com/reuters/worldNews',                           name: 'Reuters World',        category: 'conflict'      },
  { url: 'https://rsshub.app/apnews/topics/world-news',                           name: 'AP World',             category: 'conflict'      },
  // Security analysis
  { url: 'https://issafrica.org/rss/iss-today',                                   name: 'ISS Africa',           category: 'security'      },
  { url: 'https://www.crisisgroup.org/rss/africa',                                name: 'Crisis Group Africa',  category: 'security'      },
  { url: 'https://www.crisisgroup.org/rss/middle-east-north-africa',              name: 'Crisis Group MENA',    category: 'security'      },
  { url: 'https://jamestown.org/feed/',                                           name: 'Jamestown Foundation', category: 'security'      },
  { url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml',                   name: 'BBC Africa',           category: 'security'      },
  { url: 'https://africanarguments.org/feed/',                                    name: 'African Arguments',    category: 'security'      },
  { url: 'https://www.dowjones.com/djoxan/feed',                                  name: 'Oxford Analytica',     category: 'security'      },
  { url: 'https://thesoufancenter.org/feed/',                                     name: 'Soufan Center',        category: 'security'      },
  { url: 'https://foreignpolicy.com/feed/',                                       name: 'Foreign Policy',       category: 'security'      },
  { url: 'https://www.theafricareport.com/feed/',                                 name: 'The Africa Report',    category: 'security'      },
  { url: 'https://www.csis.org/rss.xml',                                          name: 'CSIS',                 category: 'security'      },
  { url: 'https://warontherocks.com/feed/',                                       name: 'War on the Rocks',     category: 'security'      },
  { url: 'https://www.janes.com/feeds/news.xml',                                  name: 'Janes Defence',        category: 'security'      },
  { url: 'https://thestrategybridge.org/feed',                                    name: 'The Strategy Bridge',  category: 'security'      },
  { url: 'https://www.iiss.org/feed',                                             name: 'IISS',                 category: 'security'      },
  { url: 'https://thediplomat.com/feed/',                                         name: 'The Diplomat',         category: 'security'      },
  { url: 'https://www.euractiv.com/feed/',                                        name: 'Euractiv',             category: 'security'      },
  // Crime & organised crime
  { url: 'https://www.insightcrime.org/feed/',                                    name: 'InSight Crime',        category: 'crime'         },
  // Economic & infrastructure
  { url: 'https://tradingeconomics.com/feed.xml',                                 name: 'Trading Economics',    category: 'economic'      },
  { url: 'https://www.power-technology.com/feed/',                                name: 'Power Tech',           category: 'infrastructure'},
  { url: 'https://netblocks.org/feed',                                            name: 'NetBlocks',            category: 'infrastructure'},
  // Aviation
  { url: 'https://aviapages.com/feed/incidents',                                  name: 'AviPages',             category: 'aviation'      },
  // Health / disease outbreaks
  { url: 'https://www.who.int/rss-feeds/news-english.xml',                        name: 'WHO',                  category: 'health'        },
  { url: 'https://reliefweb.int/updates/rss.xml?source=WHO',                     name: 'ReliefWeb/WHO',        category: 'health'        },
  { url: 'https://outbreaknewstoday.com/feed/',                                  name: 'Outbreak News Today',  category: 'health'        },
  { url: 'https://www.cidrap.umn.edu/rss.xml',                                   name: 'CIDRAP',               category: 'health'        },
  { url: 'https://www.paho.org/en/rss.xml',                                      name: 'PAHO',                 category: 'health'        },
  { url: 'https://africacdc.org/feed/',                                           name: 'Africa CDC',           category: 'health'        },
  // Weather & natural disasters
  { url: 'https://reliefweb.int/disasters/rss.xml',                              name: 'ReliefWeb Disasters',  category: 'weather'       },
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
  'kenya':                        ['kenya', 'kenyan', 'nairobi', 'al-shabaab', 'mombasa', 'kisumu', 'eldoret'],
  'rwanda':                       ['rwanda', 'rwandan', 'kigali', 'kagame', 'fdlr'],
  'tanzania':                     ['tanzania', 'tanzanian', 'dar es salaam', 'dodoma', 'arusha', 'zanzibar', 'hassan'],
  'uganda':                       ['uganda', 'ugandan', 'kampala', 'entebbe', 'museveni', 'lra'],
  'ghana':                        ['ghana', 'ghanaian', 'accra', 'kumasi', 'tamale', 'mahama', 'bawumia'],
  'senegal':                      ['senegal', 'senegalese', 'dakar', 'ziguinchor', 'faye'],
  'zimbabwe':                     ['zimbabwe', 'zimbabwean', 'harare', 'bulawayo', 'mnangagwa', 'zanu'],
  'south africa':                 ['south africa', 'south african', 'johannesburg', 'cape town', 'pretoria', 'durban', 'ramaphosa', 'anc', 'loadshedding', 'eskom'],
  'lebanon':                      ['lebanon', 'lebanese', 'beirut', 'hezbollah', 'tripoli', 'sidon'],
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
    const items = parseRssXml(await r.text())   // parseHealthRss handles all RSS/Atom
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

  // Fetch all RSS articles + proprietary knowledge reports in parallel
  const [articles, knowledgeReports] = await Promise.all([
    fetchArticlesForCountry(country, city),
    fetchKnowledgeReports(country),
  ])

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

  const knowledgeSection = knowledgeReports.length
    ? `== PROPRIETARY INTELLIGENCE REPORTS (Presight 360 / Alliance International) ==
${knowledgeReports.map(r =>
  `[${r.title}]\nSummary: ${r.summary}\n${r.excerpt}`
).join('\n\n---\n\n')}

`
    : ''

  const prompt = `You are a senior corporate travel security analyst. Analyse ALL available intelligence for ${location} and produce a structured risk assessment for a client travelling to this destination.

== OFFICIAL ADVISORIES ==
${fcdoLine}
Active disasters (GDACS): ${gdacsText}
Earthquakes M5+ / 7d (USGS): ${usgsText}

${knowledgeSection}== LIVE INTELLIGENCE FEEDS ==
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
  return 'claude-haiku-4-5-20251001'
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


async function fetchHealthFeed(feed) {
  const cached = HEALTH_FEED_CACHE[feed.id]
  if (cached && Date.now() - cached.ts < HEALTH_CACHE_TTL) return cached.items

  try {
    const r = await fetch(feed.url, {
      headers: { 'User-Agent': 'SafeGuard360/1.0 (travel risk platform)' },
      signal: AbortSignal.timeout(6000),
    })
    if (!r?.ok) { HEALTH_FEED_CACHE[feed.id] = { items: [], ts: Date.now() }; return [] }
    const items = parseRssXml(await r.text())
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
    if (q === 'democratic republic of congo' || q === 'democratic republic of the congo') aliases.push('drc', 'dr congo', 'congo', 'kinshasa', 'goma', 'bukavu')
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

// ── NOAA National Hurricane Center — Atlantic + Pacific active storms ─────────
//
// Parses NHC RSS feeds for active tropical storms, hurricanes and advisories.
// Matches against Caribbean and Latin American countries by name + known basin.
// Returns structured alert objects compatible with the trip_alert pipeline.

const NHC_FEEDS = [
  { url: 'https://www.nhc.noaa.gov/index-at.xml', basin: 'Atlantic',       label: 'NHC Atlantic' },
  { url: 'https://www.nhc.noaa.gov/index-ep.xml', basin: 'East Pacific',   label: 'NHC East Pacific' },
  { url: 'https://www.nhc.noaa.gov/index-cp.xml', basin: 'Central Pacific', label: 'NHC Central Pacific' },
]

// Countries in NHC watch zones — used to decide if a basin is relevant
const ATLANTIC_BASIN = ['bahamas','cuba','haiti','dominican republic','jamaica','puerto rico','trinidad','tobago','barbados','antigua','grenada','st lucia','st vincent','dominica','martinique','guadeloupe','cayman islands','turks','caicos','aruba','curacao','bonaire','belize','mexico','honduras','nicaragua','costa rica','panama','colombia','venezuela','guyana','suriname','french guiana','united states','bermuda','azores']
const EAST_PACIFIC_BASIN = ['mexico','guatemala','el salvador','honduras','nicaragua','costa rica','panama','colombia','ecuador','peru']

function countryInBasin(country, basin) {
  const q = country.toLowerCase()
  if (basin === 'Atlantic')        return ATLANTIC_BASIN.some(c => q.includes(c) || c.includes(q))
  if (basin === 'East Pacific')    return EAST_PACIFIC_BASIN.some(c => q.includes(c) || c.includes(q))
  if (basin === 'Central Pacific') return q.includes('hawaii') || q.includes('pacific')
  return false
}

function nhcSeverity(title = '') {
  const t = title.toLowerCase()
  if (t.includes('category 4') || t.includes('category 5') || t.includes('major hurricane')) return 'Critical'
  if (t.includes('category 3') || t.includes('hurricane warning'))  return 'Critical'
  if (t.includes('category 2') || t.includes('hurricane watch'))    return 'High'
  if (t.includes('category 1') || t.includes('tropical storm warning')) return 'High'
  if (t.includes('tropical storm') || t.includes('tropical depression')) return 'Medium'
  if (t.includes('advisory') || t.includes('outlook'))              return 'Medium'
  return 'Medium'
}

export async function fetchHurricaneAlerts(country) {
  try {
    const results = []
    await Promise.all(NHC_FEEDS.map(async ({ url, basin, label }) => {
      if (!countryInBasin(country, basin)) return
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) return
      const xml  = await r.text()
      // Parse <item> blocks from NHC RSS
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1])
      for (const item of items) {
        const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/<[^>]+>/g, '').trim() || ''
        const desc  = (item.match(/<description>([\s\S]*?)<\/description>/) || [])[1]?.replace(/<[^>]+>/g, '').trim() || ''
        const link  = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1]?.trim() || 'https://www.nhc.noaa.gov'
        if (!title || title.toLowerCase().includes('there are no')) continue
        results.push({
          title:       `${title} (${basin})`,
          description: desc.slice(0, 400) || null,
          source:      label,
          source_url:  link,
          severity:    nhcSeverity(title),
        })
      }
    }))
    return results
  } catch {
    return []
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

// ── OpenWeatherMap severe weather alerts ──────────────────────────────────────
//
// Uses OWM Geocoding + One Call API 3.0 to fetch active government-issued
// weather alerts for a city. Returns structured alert objects with severity
// mapped to our internal scale (Critical / High / Medium).
//
// Requires OPENWEATHERMAP_API_KEY env var (same key as VITE_OPENWEATHERMAP_KEY).

const OWM_SEV = {
  Extreme:  'Critical',
  Severe:   'High',
  Moderate: 'Medium',
  Minor:    'Low',
}

function owmSeverity(tags = []) {
  if (tags.includes('Extreme'))  return 'Critical'
  if (tags.includes('Severe'))   return 'High'
  if (tags.includes('Moderate')) return 'Medium'
  return 'Medium'
}

export async function fetchWeatherAlerts(city, country) {
  const key = process.env.OPENWEATHERMAP_API_KEY || process.env.VITE_OPENWEATHERMAP_KEY || ''
  if (!key) return []
  try {
    // Step 1: Geocode city → lat/lon
    const geoQuery = city ? `${city},${country}` : country
    const geoRes = await fetch(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(geoQuery)}&limit=1&appid=${key}`,
      { signal: AbortSignal.timeout(4000) }
    )
    if (!geoRes.ok) return []
    const [geo] = await geoRes.json()
    if (!geo) return []

    // Step 2: One Call API — fetch only alerts
    const owmRes = await fetch(
      `https://api.openweathermap.org/data/3.0/onecall?lat=${geo.lat}&lon=${geo.lon}&exclude=minutely,hourly,daily,current&appid=${key}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!owmRes.ok) return []
    const owmData = await owmRes.json()

    return (owmData.alerts || []).map(a => ({
      title:       a.event || 'Severe Weather Alert',
      description: a.description || null,
      source:      a.sender_name || 'OpenWeatherMap',
      severity:    owmSeverity(a.tags || []),
      start:       a.start ? new Date(a.start * 1000).toISOString() : null,
      end:         a.end   ? new Date(a.end   * 1000).toISOString() : null,
      tags:        a.tags || [],
    }))
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

  // Proprietary knowledge reports
  const briefReports = await fetchKnowledgeReports(country)
  const briefKnowledgeSection = briefReports.length
    ? `\nProprietary reports (Presight 360): ${briefReports.map(r => `[${r.title}] ${r.summary}`).join(' | ')}\n`
    : ''

  const prompt = `You are a corporate travel security analyst briefing a risk manager.
Analyse live intelligence for ${location} and give a concise assessment.

Advisory: ${fcdoLine}
Active disasters (GDACS): ${gdacsText}
Earthquakes M5+ / 7d (USGS): ${usgsText}
Security news (ISS Africa): ${issText}
Disease & health outbreaks (WHO/ProMED/PAHO/CIDRAP): ${healthText}${briefKnowledgeSection}

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

    // Inject proprietary knowledge base reports
    const kbDocs = await fetchKnowledgeForChat(context.country || null)
    const kbSection = kbDocs.length
      ? `\n\n## PROPRIETARY INTELLIGENCE REPORTS (from your organisation's knowledge base)\nThese are internal reports uploaded by your organisation. Reference them directly when relevant — they take precedence over general knowledge.\n\n` +
        kbDocs.map((d, i) =>
          `### Report ${i + 1}: ${d.title}${d.summary ? `\nSummary: ${d.summary}` : ''}\n${d.excerpt}`
        ).join('\n\n---\n\n')
      : ''

    system = `You are CAIRO — an expert travel security AI analyst embedded in SafeGuard360. The platform has live intelligence feeds (FCDO, BBC, Al Jazeera, ACLED, WHO, GDACS, USGS) continuously updated, plus proprietary intelligence reports from your organisation's knowledge base.

Rules:
- Answer travel security questions directly and confidently from your expertise
- When proprietary reports are provided below, reference them explicitly by name — they are the most authoritative source
- Do NOT open responses with knowledge-cutoff disclaimers — this undermines confidence. If real-time verification is needed for a very specific recent event, add a brief note at the END only
- Use plain conversational prose for short answers. Use bullet points (- item) for lists. Avoid markdown headers (# ##) entirely — this is a chat interface, not a document
- Be concise and actionable. Lead with the most useful information
- Never fabricate specific incidents, casualty figures, or advisory levels
- If asked about a very recent specific event you cannot confirm, say so briefly at the end and point to FCDO (gov.uk/foreign-travel-advice) or ACLED
- For medical or legal advice, direct to qualified professionals
- Maintain full conversation context — refer to prior messages naturally

Today: ${today}
${contextLines ? `\nTraveller context:\n${contextLines}` : ''}${kbSection}`
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
