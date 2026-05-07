// ACLED — Armed Conflict Location & Event Data Project
// Free API (non-commercial): https://acleddata.com/register/
// Env vars: ACLED_API_KEY, ACLED_EMAIL
// Covers all of Africa + Middle East + Asia with GPS-tagged events

let cache = {}
let cacheTime = {}
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    const r = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    return r
  } catch (e) {
    clearTimeout(timeout)
    return null
  }
}

async function _handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ACLED_API_KEY
  const email = process.env.ACLED_EMAIL

  if (!apiKey || !email) {
    return res.status(503).json({ error: 'ACLED not configured', configured: false })
  }

  const { country, days = 30, limit = 20 } = req.query
  const cacheKey = `${country || 'all'}-${days}`

  // Return cached data if fresh
  if (cache[cacheKey] && Date.now() - (cacheTime[cacheKey] || 0) < CACHE_TTL) {
    return res.json({ ...cache[cacheKey], cached: true })
  }

  // Date range — last N days
  const since = new Date()
  since.setDate(since.getDate() - parseInt(days))
  const sinceStr = since.toISOString().split('T')[0].replace(/-/g, '|') // ACLED format: YYYY|MM|DD

  const params = new URLSearchParams({
    key: apiKey,
    email,
    event_date: sinceStr,
    event_date_where: 'BETWEEN',
    event_date2: new Date().toISOString().split('T')[0].replace(/-/g, '|'),
    limit: String(limit),
    fields: 'event_date|event_type|sub_event_type|actor1|location|country|latitude|longitude|fatalities|notes',
  })

  if (country) params.set('country', country)

  const r = await fetchWithTimeout(`https://api.acleddata.com/acled/read?${params}`)
  if (!r?.ok) return res.status(502).json({ error: 'ACLED fetch failed', configured: true })

  let json
  try { json = await r.json() } catch { return res.status(502).json({ error: 'ACLED response parse failed' }) }

  if (!json?.data) return res.status(502).json({ error: json?.message || 'No data from ACLED' })

  // Summarise by event type
  const events = json.data
  const byType = {}
  for (const e of events) {
    byType[e.event_type] = (byType[e.event_type] || 0) + 1
  }

  const result = {
    configured: true,
    country: country || 'All regions',
    period: `Last ${days} days`,
    total: events.length,
    fatalities: events.reduce((s, e) => s + (parseInt(e.fatalities) || 0), 0),
    byType,
    recent: events.slice(0, 5).map(e => ({
      date: e.event_date,
      type: e.event_type,
      subType: e.sub_event_type,
      location: e.location,
      country: e.country,
      fatalities: parseInt(e.fatalities) || 0,
      notes: e.notes?.slice(0, 200),
    })),
    cached: false,
  }

  cache[cacheKey] = result
  cacheTime[cacheKey] = Date.now()

  res.json(result)
}

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default handler
