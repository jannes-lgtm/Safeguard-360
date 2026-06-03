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
import { dbCacheGet, dbCacheSet, dbCacheDel } from './_dbCache.js'
import { parseRssXml } from './_rssParser.js'
import { sharedCache } from './_sharedCache.js'
import { logFcdoChange } from './_fcdoAlert.js'
import { fetchGdeltSignals } from './_gdelt.js'
import { storeBriefHistory, buildTrendContext } from './_cairoMemory.js'

const CACHE_TTL      = 60 * 60 * 1000       // 1 hour
const ISS_CACHE_TTL  = 4  * 60 * 60 * 1000  // 4 hours

async function _handler(req, res) {
  const { country } = req.query
  if (!country) return res.status(400).json({ error: 'country required' })

  // Rate limit: 60 country risk checks per IP/user per hour (cached, but AI is invoked for new countries)
  const { allowed } = await checkRateLimit(req, 'country-risk', { max: 60, windowMs: 3_600_000 })
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
// Returns advisory result + { changed: bool, updatedAt: string|null }
// changed=true means the FCDO advisory was updated since our last fetch —
// caller should invalidate the AI brief and log the change.
async function fetchFcdo(country, { checkTimestamp = false } = {}) {
  const slug   = fcdoSlug(country)
  const tsKey  = 'fcdo-ts:' + slug
  const cached = await sharedCache.get('fcdo:' + slug)

  try {
    const r = await fetchWithTimeout(
      `https://www.gov.uk/api/content/foreign-travel-advice/${slug}`,
      { headers: { Accept: 'application/json' } }
    )
    if (!r?.ok) {
      if (cached !== null) return { ...cached, changed: false }
      await sharedCache.set('fcdo:' + slug, null, 60 * 60 * 1000)
      return null
    }

    const data      = await r.json()
    const updatedAt = data.public_updated_at || data.updated_at || null

    // ── Timestamp short-circuit ──────────────────────────────────────────────
    // If we have a cached result AND the advisory hasn't been updated, return
    // the cached result immediately — no parsing, no AI invalidation needed.
    if (checkTimestamp && cached !== null && updatedAt) {
      const lastTs = await sharedCache.get(tsKey)
      if (lastTs && lastTs === updatedAt) {
        return { ...cached, changed: false, updatedAt }
      }
    }

    const warnings = data.details?.parts?.find(p => p.slug === 'warnings-and-insurance')
    if (!warnings?.body) {
      if (updatedAt) await sharedCache.set(tsKey, updatedAt, 6 * 60 * 60 * 1000)
      await sharedCache.set('fcdo:' + slug, null, 60 * 60 * 1000)
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

    // Detect level change vs previously cached advisory
    const prevLevel = cached?.level ?? null
    const changed   = prevLevel !== null && prevLevel !== level

    await sharedCache.set('fcdo:' + slug, result, 60 * 60 * 1000)
    if (updatedAt) await sharedCache.set(tsKey, updatedAt, 6 * 60 * 60 * 1000)

    return { ...result, changed, prevLevel, updatedAt }
  } catch (e) {
    console.error('FCDO fetch error for', country, ':', e.message)
    if (cached !== null) return { ...cached, changed: false }
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
  let issItems = await sharedCache.get('iss:feed')
  if (!issItems) {
    const r = await fetchWithTimeout('https://issafrica.org/rss/iss-today', {}, 6000)
    if (r?.ok) {
      try {
        issItems = parseRssXml(await r.text())
        await sharedCache.set('iss:feed', issItems, ISS_CACHE_TTL)
      } catch { /* keep stale */ }
    }
  }

  if (!issItems?.length) return null
  const q = country.toLowerCase()
  const matches = issItems
    .filter(item => (item.title + ' ' + item.description).toLowerCase().includes(q))
    .slice(0, 3)
  if (!matches.length) return null
  return {
    headline: matches[0].title,
    url: 'https://issafrica.org/iss-today',
    articles: matches.map(m => ({ title: m.title, url: m.link, date: m.pubDate })),
  }
}


// ── Combined risk + AI synthesis ──────────────────────────────────────────────
// forceRefresh=true  — bypass FCDO sharedCache, re-fetch advisory, use timestamp
//                      check to skip AI invalidation if advisory unchanged.
// checkTimestamp=true — passed through to fetchFcdo; skips re-parse when FCDO
//                       public_updated_at matches our stored timestamp.
async function getCountryRisk(country, { forceRefresh = false, checkTimestamp = false } = {}) {
  // On forceRefresh, bypass the cached FCDO result so we hit the live API
  // and can compare timestamps / detect level changes.
  if (forceRefresh) {
    const slug = fcdoSlug(country)
    await sharedCache.delete('fcdo:' + slug)
  }

  // Fetch all live sources in parallel for speed.
  // GDELT is wrapped in a 7s user-facing cap — the ingest cron (maxDuration 300s)
  // populates the Redis cache at 30-min intervals using the full 22s timeout.
  // On a cache hit this resolves in <100ms; on a cold miss it returns null
  // rather than holding up the response.
  const gdeltWithCap = Promise.race([
    fetchGdeltSignals(country),
    new Promise(resolve => setTimeout(() => resolve(null), 7000)),
  ])

  const [fcdo, iss, gdacs, usgs, health, gdelt] = await Promise.all([
    fetchFcdo(country, { checkTimestamp: forceRefresh || checkTimestamp }),
    fetchIssAlerts(country),
    fetchGDACS(country),
    fetchUSGS(country),
    fetchHealthOutbreaks(country),
    gdeltWithCap,
  ])

  const level    = fcdo?.level ?? null
  const severity = levelToSeverity(level)
  const dfatSlug = toSlug(country)

  // ── FCDO change detection ────────────────────────────────────────────────
  // If the advisory level changed, log it to the live intelligence feed and
  // invalidate the AI brief so CAIRO re-synthesises with the new floor.
  if (fcdo?.changed && fcdo.prevLevel !== null && level !== null) {
    const prevSev = levelToSeverity(fcdo.prevLevel)
    console.log(`[country-risk] FCDO ADVISORY CHANGE: ${country} — Level ${fcdo.prevLevel} (${prevSev}) → Level ${level} (${severity})`)
    // Fire-and-forget: log to live_intelligence feed + audit trail
    logFcdoChange(country, fcdo.prevLevel, level, prevSev, severity).catch(() => {})
  }

  // ── AI synthesis (comprehensive scan — cached 1h per country) ────────────
  let ai_brief  = null
  let trendMeta = null   // structured trend metadata for UI rating cards
  const apiKey  = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    const cacheKey = country.toLowerCase()
    const dbKey    = `country-risk:ai:${cacheKey}`

    // Invalidate AI cache when FCDO level changed — forces re-synthesis so
    // CAIRO brief reflects the new advisory floor on next warmup pass.
    if ((forceRefresh || fcdo?.changed) && severity) {
      const cachedBrief = await dbCacheGet(dbKey)
      if (cachedBrief?.overall_severity && cachedBrief.overall_severity !== severity) {
        await sharedCache.delete('risk-ai:' + cacheKey)
        await dbCacheDel(dbKey)
        console.log(`[country-risk] AI cache invalidated for ${country}: ${cachedBrief.overall_severity} → ${severity}`)
      }
    }

    // L1 — shared cache (Redis when available, in-memory fallback)
    const l1Hit = await sharedCache.get('risk-ai:' + cacheKey)
    if (l1Hit) {
      ai_brief = l1Hit
      // Await trend meta — fire-and-forget loses it before response is built
      try { const r = await buildTrendContext(country); trendMeta = r.meta } catch {}
    } else {
      // L2 — Supabase persistent cache (survives cold starts)
      const persisted = await dbCacheGet(dbKey)
      if (persisted) {
        ai_brief = persisted
        await sharedCache.set('risk-ai:' + cacheKey, ai_brief, 60 * 60 * 1000)
        // Await trend meta — fire-and-forget loses it before response is built
        try { const r = await buildTrendContext(country); trendMeta = r.meta } catch {}
      } else {
        // Cache miss — build trend context then run AI synthesis
        const { context: trendContext, meta: trendMetaFromHistory } = await buildTrendContext(country)
        trendMeta = trendMetaFromHistory   // capture for response
        ai_brief = await comprehensiveRiskScan(country, null, { fcdo, gdacs, usgs, iss, health, gdelt, trendContext }, apiKey)
        if (!ai_brief) {
          ai_brief = await synthesiseBrief(country, null, { fcdo, gdacs, usgs, iss, health, gdelt, trendContext }, apiKey)
        }
        if (ai_brief) {
          // Store this brief in CAIRO's history for future trend analysis
          storeBriefHistory(country, ai_brief, {
            gdelt_tempo: gdelt?.tempoScore ?? null,
            gdelt_trend: gdelt?.trend      ?? null,
          }).catch(() => {})
          // Merge FCDO-derived severity so country-risk-summary always has a
          // map-ready overall_severity even if the AI brief omits it.
          const SEVER_ORDER = ['Low', 'Medium', 'High', 'Critical']
          const aiSev   = ai_brief.overall_severity
          const fcdoSev = severity   // levelToSeverity(fcdo.level)
          const effectiveSev = (aiSev && fcdoSev)
            ? SEVER_ORDER.indexOf(fcdoSev) > SEVER_ORDER.indexOf(aiSev) ? fcdoSev : aiSev
            : aiSev || fcdoSev || null
          const briefToCache = { ...ai_brief, overall_severity: effectiveSev }
          await sharedCache.set('risk-ai:' + cacheKey, briefToCache, 60 * 60 * 1000)
          dbCacheSet(dbKey, briefToCache, CACHE_TTL)  // fire-and-forget
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

  // ── Extract CAIRO severity (effective: highest of AI + FCDO) ─────────────
  // Parsed inline so cached string ai_brief is handled too.
  let cairoSeverity = null
  try {
    const parsed = ai_brief
      ? (typeof ai_brief === 'string' ? JSON.parse(ai_brief) : ai_brief)
      : null
    cairoSeverity = parsed?.overall_severity || severity || null
  } catch { cairoSeverity = severity || null }

  return {
    country,
    level,
    severity,
    ai_brief,
    // ── Structured rating card fields (UI) ─────────────────────────────────
    cairo_severity: cairoSeverity,
    fcdo_level:     level,
    fcdo_message:   fcdo?.message  || null,
    fcdo_url:       fcdo?.url      || `https://www.gov.uk/foreign-travel-advice/${fcdoSlug(country)}`,
    trend_direction: trendMeta?.direction ?? null,
    trend_label:     trendMeta?.label     ?? null,
    trend_reason:    trendMeta?.reason    ?? null,
    trend_consecutive: trendMeta?.consecutive ?? null,
    // ───────────────────────────────────────────────────────────────────────
    gdelt_tempo:        gdelt?.tempoScore   ?? null,
    gdelt_trend:        gdelt?.trend        ?? null,
    gdelt_themes:       gdelt?.themes       ?? [],
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
