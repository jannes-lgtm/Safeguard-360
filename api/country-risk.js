/**
 * /api/country-risk.js
 *
 * Returns live travel advisory data + AI-synthesised security brief for a country.
 *
 * Primary sources:
 *   UK FCDO (gov.uk public JSON API)
 *   ISS Africa RSS
 *   GDACS (UN disaster system)
 *   USGS earthquake feed
 *
 * Claude AI synthesises all feeds into an executive brief (cached 1 hour per country).
 * When no advisory data is available, severity is returned as null.
 */

import { comprehensiveRiskScan, synthesiseBrief, fetchGDACS, fetchUSGS, fetchHealthOutbreaks } from './_claudeSynth.js'
import { checkRateLimit } from './_rateLimit.js'
import { dbCacheGet, dbCacheSet } from './_dbCache.js'

let issCache    = []
let issCacheTime = 0

const FCDO_CACHE     = {}   // { [slug]: { data, ts } }  — in-memory (short-lived, cheap to re-fetch)
const AI_BRIEF_CACHE = {}   // { [countryLower]: { data, ts } }  — in-memory L1; Supabase is L2
const CACHE_TTL      = 60 * 60 * 1000       // 1 hour
const ISS_CACHE_TTL  = 4  * 60 * 60 * 1000  // 4 hours

async function _handler(req, res) {
  const { country } = req.query
  if (!country) return res.status(400).json({ error: 'country required' })

  // Rate limit: 60 country risk checks per IP/user per hour (cached, but AI is invoked for new countries)
  const { allowed } = checkRateLimit(req, 'country-risk', { max: 60, windowMs: 3_600_000 })
  if (!allowed) return res.status(429).json({ error: 'Rate limit exceeded — try again in an hour' })

  try {
    const result = await getCountryRisk(country)
    res.json(result)
  } catch (e) {
    console.error('country-risk error:', e.message)
    res.status(500).json({ error: e.message || 'Failed to fetch country risk' })
  }
}

// ── FCDO slug overrides ───────────────────────────────────────────────────────
const FCDO_SLUG_OVERRIDES = {
  'democratic republic of congo':         'democratic-republic-of-the-congo',
  'democratic republic of the congo':     'democratic-republic-of-the-congo',
  'republic of congo':                    'congo',
  'republic of the congo':                'congo',
  'ivory coast':                          'ivory-coast',
  "côte d'ivoire":                        'ivory-coast',
  "cote d'ivoire":                        'ivory-coast',
  'myanmar':                              'myanmar-burma',
  'burma':                                'myanmar-burma',
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
  'papua new guinea':                     'papua-new-guinea',
  'bosnia and herzegovina':               'bosnia-and-herzegovina',
  'north macedonia':                      'north-macedonia',
}

function toSlug(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function fcdoSlug(country) {
  return FCDO_SLUG_OVERRIDES[country.toLowerCase()] || toSlug(country)
}

async function fetchWithTimeout(url, options = {}, ms = 7000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  try {
    const r = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(id)
    return r
  } catch {
    clearTimeout(id)
    return null
  }
}

// ── FCDO ─────────────────────────────────────────────────────────────────────
async function fetchFcdo(country) {
  const slug = fcdoSlug(country)
  const cached = FCDO_CACHE[slug]
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const r = await fetchWithTimeout(
      `https://www.gov.uk/api/content/foreign-travel-advice/${slug}`,
      { headers: { Accept: 'application/json' } }
    )
    if (!r?.ok) {
      FCDO_CACHE[slug] = { data: null, ts: Date.now() }
      return null
    }

    const data = await r.json()
    const warnings = data.details?.parts?.find(p => p.slug === 'warnings-and-insurance')
    if (!warnings?.body) {
      FCDO_CACHE[slug] = { data: null, ts: Date.now() }
      return null
    }

    const text = warnings.body.toLowerCase()
    let level = 1
    if (text.includes('fcdo advises against all travel to') && !text.includes('all but essential')) {
      level = 4
    } else if (text.includes('advises against all travel') && !text.includes('all but essential')) {
      level = 4
    } else if (text.includes('all but essential travel')) {
      level = 3
    } else if (text.includes('advises against some travel') || text.includes('some parts of')) {
      level = 2
    }

    const result = {
      level,
      message: fcdoLevelText(level),
      url: `https://www.gov.uk/foreign-travel-advice/${slug}`,
    }
    FCDO_CACHE[slug] = { data: result, ts: Date.now() }
    return result
  } catch (e) {
    console.error('FCDO fetch error for', country, ':', e.message)
    return null
  }
}

function fcdoLevelText(level) {
  if (level >= 4) return 'FCDO advises against all travel'
  if (level >= 3) return 'FCDO advises against all but essential travel'
  if (level >= 2) return 'FCDO advises against travel to some areas'
  return 'FCDO: normal travel precautions'
}

// ── ISS Africa RSS ────────────────────────────────────────────────────────────
async function fetchIssAlerts(country) {
  const now = Date.now()
  if (now - issCacheTime > ISS_CACHE_TTL) {
    const r = await fetchWithTimeout('https://issafrica.org/rss/iss-today', {}, 6000)
    if (r?.ok) {
      try {
        issCache = parseRssItems(await r.text())
        issCacheTime = now
      } catch { /* keep stale */ }
    }
  }

  if (!issCache?.length) return null
  const q = country.toLowerCase()
  const matches = issCache
    .filter(item => (item.title + ' ' + item.description).toLowerCase().includes(q))
    .slice(0, 3)
  if (!matches.length) return null
  return {
    headline: matches[0].title,
    url: 'https://issafrica.org/iss-today',
    articles: matches.map(m => ({ title: m.title, url: m.link, date: m.pubDate })),
  }
}

function parseRssItems(xml) {
  const items = []
  const re = /<item>([\s\S]*?)<\/item>/g
  let m
  while ((m = re.exec(xml)) !== null) {
    const block = m[1]
    const get = tag => {
      const x = block.match(new RegExp(
        `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`
      ))
      return x ? (x[1] || x[2] || '').trim() : ''
    }
    items.push({ title: get('title'), link: get('link'), description: get('description'), pubDate: get('pubDate') })
  }
  return items
}

// ── Combined risk + AI synthesis ──────────────────────────────────────────────
async function getCountryRisk(country) {
  // Fetch all live sources in parallel for speed
  const [fcdo, iss, gdacs, usgs, health] = await Promise.all([
    fetchFcdo(country),
    fetchIssAlerts(country),
    fetchGDACS(country),
    fetchUSGS(country),
    fetchHealthOutbreaks(country),
  ])

  const level    = fcdo?.level ?? null
  const severity = levelToSeverity(level)
  const dfatSlug = toSlug(country)

  // ── AI synthesis (comprehensive scan — cached 1h per country) ────────────
  let ai_brief = null
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    // comprehensiveRiskScan manages its own cache internally; AI_BRIEF_CACHE here
    // is kept for compatibility but the function deduplicates itself.
    const cacheKey = country.toLowerCase()
    const dbKey    = `country-risk:ai:${cacheKey}`

    // L1 — in-memory (fastest, resets on cold start)
    const cached = AI_BRIEF_CACHE[cacheKey]
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      ai_brief = cached.data
    } else {
      // L2 — Supabase persistent cache (survives cold starts)
      const persisted = await dbCacheGet(dbKey)
      if (persisted) {
        ai_brief = persisted
        AI_BRIEF_CACHE[cacheKey] = { data: ai_brief, ts: Date.now() }
      } else {
        // Cache miss — run AI synthesis
        ai_brief = await comprehensiveRiskScan(country, null, { fcdo, gdacs, usgs, iss, health }, apiKey)
        if (!ai_brief) {
          ai_brief = await synthesiseBrief(country, null, { fcdo, gdacs, usgs, iss, health }, apiKey)
        }
        if (ai_brief) {
          AI_BRIEF_CACHE[cacheKey] = { data: ai_brief, ts: Date.now() }
          dbCacheSet(dbKey, ai_brief, CACHE_TTL)  // fire-and-forget
        }
      }
    }
  }

  // Country-specific health advisories (title must mention the country)
  const healthSources = (health?.matches || []).slice(0, 3).map(a => ({
    name: a.source,
    level: null,
    message: a.title,
    url: a.link || null,
    category: 'health',
  }))

  // Full country-matched health items for IntelBrief
  const healthItems = (health?.matches || []).map(a => ({
    title:       a.title       || '',
    description: a.description || '',
    date:        a.pubDate     || a.date || null,
    link:        a.link        || null,
    source:      a.source      || 'Health Feed',
  }))

  // Recent global health news (not country-specific — shown as "Latest News")
  const latestHealthNews = (health?.recent || [])
    .filter(a => !(health?.matches || []).some(m => m.title === a.title))
    .slice(0, 3)
    .map(a => ({
      title:  a.title  || '',
      date:   a.pubDate || a.date || null,
      link:   a.link   || null,
      source: a.source || 'Health Feed',
    }))

  return {
    country,
    level,
    severity,
    ai_brief,
    gdacs_count:        gdacs.length,
    usgs_count:         usgs.length,
    health_alerts:      health?.matches?.length || 0,
    health_items:       healthItems,
    latest_health_news: latestHealthNews,
    sources: [
      fcdo
        ? { name: 'UK FCDO', level: fcdo.level, message: fcdo.message, url: fcdo.url }
        : { name: 'UK FCDO', level: null, url: `https://www.gov.uk/foreign-travel-advice/${fcdoSlug(country)}` },
      { name: 'US State Dept', level: null, url: 'https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html' },
      { name: 'AU DFAT', level: null, url: `https://www.smartraveller.gov.au/destinations/${dfatSlug}` },
      iss
        ? { name: 'ISS Africa', level: null, message: iss.headline, url: iss.url, articles: iss.articles }
        : null,
      gdacs.length
        ? { name: 'GDACS', level: null, message: `${gdacs.length} active event(s)`, url: 'https://gdacs.org' }
        : null,
      usgs.length
        ? { name: 'USGS', level: null, message: `${usgs.length} M5+ earthquake(s) / 7d`, url: 'https://earthquake.usgs.gov' }
        : null,
      ...healthSources,
    ].filter(Boolean),
  }
}

function levelToSeverity(level) {
  if (!level || level <= 0) return null
  if (level >= 4) return 'Critical'
  if (level >= 3) return 'High'
  if (level >= 2) return 'Medium'
  return 'Low'
}

export { getCountryRisk }

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default handler
