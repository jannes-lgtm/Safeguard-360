// UCDP — Uppsala Conflict Data Program
// Free, no API key required
// Geo-referenced event dataset — armed conflict events with casualties
// Complements ACLED with independent academic methodology
// Docs: https://ucdpapi.pcr.uu.se

const cache = {}
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

// Africa + Middle East country codes (UCDP GWNo codes)
const AFRICA_ME_GWCODES = [
  // Africa
  '402','404','411','420','432','433','434','435','436','437','438','439','450','451','452',
  '461','471','475','481','482','483','484','490','500','501','510','516','517','520','522',
  '530','531','540','541','551','552','553','560','565','570','571','572','575','580','581',
  '600','615','616','620','625','630','640','645','651','652','660','663','666','670','678',
  // Middle East
  '630','640','645','651','652','660','663','666','670','678','679','680','690','694','696','700',
]

async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    const r = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    return r
  } catch {
    clearTimeout(timeout)
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { country, pagesize = 25 } = req.query
  const cacheKey = `ucdp-${country || 'africa'}-${pagesize}`

  if (cache[cacheKey] && Date.now() - cache[cacheKey].time < CACHE_TTL) {
    return res.json({ ...cache[cacheKey].data, cached: true })
  }

  // UCDP GED (Geo-referenced Event Dataset) — latest version
  let url = `https://ucdpapi.pcr.uu.se/api/gedevents/24.1?pagesize=${pagesize}&page=1`
  if (country) {
    // Try to find GWNo for country name — basic lookup
    url += `&country=${encodeURIComponent(country)}`
  }

  const r = await fetchWithTimeout(url)
  if (!r?.ok) return res.status(502).json({ error: `UCDP fetch failed: ${r?.status}` })

  let data
  try { data = await r.json() } catch { return res.status(502).json({ error: 'UCDP parse failed' }) }

  const events = (data.Result || []).map(e => ({
    id: e.id,
    date: e.date_start,
    country: e.country,
    region: e.region,
    type: e.type_of_violence === 1 ? 'State-based conflict' : e.type_of_violence === 2 ? 'Non-state conflict' : 'One-sided violence',
    deaths: e.best,
    deathsLow: e.low,
    deathsHigh: e.high,
    description: e.source_article?.slice(0, 200),
    coordinates: e.longitude && e.latitude ? [e.longitude, e.latitude] : null,
  }))

  // Summarise by type
  const byType = {}
  for (const e of events) { byType[e.type] = (byType[e.type] || 0) + 1 }

  const totalDeaths = events.reduce((s, e) => s + (e.deaths || 0), 0)

  const result = {
    source: 'UCDP',
    configured: true,
    total: data.TotalCount || events.length,
    shown: events.length,
    totalDeaths,
    byType,
    recent: events.slice(0, 10),
    note: 'UCDP uses independent academic methodology — event definitions differ from ACLED',
  }

  cache[cacheKey] = { data: result, time: Date.now() }
  res.json(result)
}
