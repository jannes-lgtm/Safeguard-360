// Weather & Natural Disaster alert aggregator
// Sources:
//   GDACS  — UN Global Disaster Alert & Coordination System (free, no key)
//   USGS   — US Geological Survey earthquake feed (free, no key)
//   OWM    — OpenWeatherMap One Call 3.0 (free tier, needs API key)
// Env var: OPENWEATHERMAP_API_KEY

let cache = {}
let cacheTime = {}
const CACHE_TTL = 30 * 60 * 1000 // 30 min

async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    const r = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeout)
    return r
  } catch (e) {
    clearTimeout(timeout)
    return null
  }
}

// ── GDACS ────────────────────────────────────────────────────────────────────
async function fetchGdacs({ country, days = 30 } = {}) {
  const cacheKey = `gdacs-${country || 'all'}-${days}`
  if (cache[cacheKey] && Date.now() - (cacheTime[cacheKey] || 0) < CACHE_TTL) {
    return { ...cache[cacheKey], cached: true }
  }

  // GDACS GeoJSON feed — latest events
  const url = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ,TC,FL,VO,DR,WF&alertlevel=Green,Orange,Red&limit=50'
  const r = await fetchWithTimeout(url)
  if (!r?.ok) return null

  let data
  try { data = await r.json() } catch { return null }

  const features = data?.features || []
  let events = features.map(f => {
    const p = f.properties || {}
    return {
      id: p.eventid,
      type: p.eventtype,
      typeName: gdacsTypeName(p.eventtype),
      alertLevel: p.alertlevel,
      country: p.country,
      title: p.eventname || p.htmldescription?.replace(/<[^>]*>/g, '').trim(),
      date: p.fromdate,
      url: p.url?.report,
      severity: alertToSeverity(p.alertlevel),
      coordinates: f.geometry?.coordinates,
    }
  })

  // Filter by country if provided
  if (country) {
    const q = country.toLowerCase()
    events = events.filter(e => (e.country || '').toLowerCase().includes(q))
  }

  // Filter to last N days
  const since = new Date()
  since.setDate(since.getDate() - days)
  events = events.filter(e => e.date && new Date(e.date) >= since)

  const result = {
    source: 'GDACS',
    total: events.length,
    redAlerts: events.filter(e => e.alertLevel === 'Red').length,
    events: events.slice(0, 10),
  }
  cache[cacheKey] = result
  cacheTime[cacheKey] = Date.now()
  return result
}

// ── USGS Earthquakes ─────────────────────────────────────────────────────────
async function fetchUsgs({ minMagnitude = 4.5, days = 7 } = {}) {
  const cacheKey = `usgs-${minMagnitude}-${days}`
  if (cache[cacheKey] && Date.now() - (cacheTime[cacheKey] || 0) < CACHE_TTL) {
    return { ...cache[cacheKey], cached: true }
  }

  const endTime = new Date().toISOString()
  const startTime = new Date(Date.now() - days * 86400000).toISOString()
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${startTime}&endtime=${endTime}&minmagnitude=${minMagnitude}&orderby=magnitude&limit=20`

  const r = await fetchWithTimeout(url)
  if (!r?.ok) return null

  let data
  try { data = await r.json() } catch { return null }

  const features = data?.features || []
  const events = features.map(f => {
    const p = f.properties || {}
    return {
      id: f.id,
      magnitude: p.mag,
      place: p.place,
      date: new Date(p.time).toISOString(),
      url: p.url,
      severity: p.mag >= 7 ? 'Critical' : p.mag >= 6 ? 'High' : p.mag >= 5 ? 'Medium' : 'Low',
      coordinates: f.geometry?.coordinates,
    }
  })

  const result = {
    source: 'USGS',
    total: features.length,
    significant: events.filter(e => e.magnitude >= 6).length,
    events: events.slice(0, 10),
    period: `Last ${days} days, M${minMagnitude}+`,
  }
  cache[cacheKey] = result
  cacheTime[cacheKey] = Date.now()
  return result
}

// ── OpenWeatherMap ───────────────────────────────────────────────────────────
async function fetchOwmAlerts({ lat, lon, locationName } = {}) {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY
  if (!apiKey) return { source: 'OpenWeatherMap', configured: false }
  if (!lat || !lon) return { source: 'OpenWeatherMap', configured: true, error: 'lat/lon required' }

  const cacheKey = `owm-${lat}-${lon}`
  if (cache[cacheKey] && Date.now() - (cacheTime[cacheKey] || 0) < CACHE_TTL) {
    return { ...cache[cacheKey], cached: true }
  }

  const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily&appid=${apiKey}&units=metric`
  const r = await fetchWithTimeout(url)
  if (!r?.ok) return { source: 'OpenWeatherMap', configured: true, error: `API error ${r?.status}` }

  let data
  try { data = await r.json() } catch { return null }

  const alerts = (data.alerts || []).map(a => ({
    event: a.event,
    description: a.description?.slice(0, 200),
    start: new Date(a.start * 1000).toISOString(),
    end: new Date(a.end * 1000).toISOString(),
    sender: a.sender_name,
  }))

  const current = data.current
  const result = {
    source: 'OpenWeatherMap',
    configured: true,
    location: locationName || `${lat},${lon}`,
    current: current ? {
      temp: Math.round(current.temp),
      description: current.weather?.[0]?.description,
      windSpeed: current.wind_speed,
      humidity: current.humidity,
    } : null,
    alerts,
    alertCount: alerts.length,
  }
  cache[cacheKey] = result
  cacheTime[cacheKey] = Date.now()
  return result
}

// ── Handler ───────────────────────────────────────────────────────────────────
async function _handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { source, country, lat, lon, location, days, minMag } = req.query

  if (source === 'gdacs') {
    const data = await fetchGdacs({ country, days: parseInt(days || 30) })
    if (!data) return res.status(502).json({ error: 'GDACS fetch failed' })
    return res.json(data)
  }

  if (source === 'usgs') {
    const data = await fetchUsgs({ minMagnitude: parseFloat(minMag || 4.5), days: parseInt(days || 7) })
    if (!data) return res.status(502).json({ error: 'USGS fetch failed' })
    return res.json(data)
  }

  if (source === 'owm') {
    const data = await fetchOwmAlerts({ lat, lon, locationName: location })
    return res.json(data)
  }

  // Default — return all sources aggregated
  const [gdacs, usgs] = await Promise.all([
    fetchGdacs({ country, days: 14 }),
    fetchUsgs({ minMagnitude: 5, days: 7 }),
  ])

  const owmConfigured = !!process.env.OPENWEATHERMAP_API_KEY

  res.json({
    gdacs: gdacs || { error: 'unavailable' },
    usgs: usgs || { error: 'unavailable' },
    owm: { configured: owmConfigured, note: owmConfigured ? 'Pass ?source=owm&lat=X&lon=Y for location alerts' : 'Add OPENWEATHERMAP_API_KEY to Vercel' },
  })
}

function gdacsTypeName(code) {
  const map = { EQ: 'Earthquake', TC: 'Cyclone', FL: 'Flood', VO: 'Volcano', DR: 'Drought', WF: 'Wildfire' }
  return map[code] || code
}

function alertToSeverity(level) {
  if (level === 'Red') return 'Critical'
  if (level === 'Orange') return 'High'
  if (level === 'Green') return 'Low'
  return 'Unknown'
}

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default handler
