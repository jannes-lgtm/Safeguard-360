// NASA EONET — Earth Observatory Natural Event Tracker
// Free, no API key required
// Covers: Wildfires, Severe Storms, Volcanoes, Floods, Drought, Dust & Haze, Landslides
// Docs: https://eonet.gsfc.nasa.gov/docs/v3

const cache = {}
const CACHE_TTL = 30 * 60 * 1000 // 30 min

const CATEGORY_LABELS = {
  wildfires: 'Wildfire', severeStorms: 'Severe Storm', volcanoes: 'Volcano',
  seaLakeIce: 'Sea/Lake Ice', earthquakes: 'Earthquake', drought: 'Drought',
  dustHaze: 'Dust & Haze', floods: 'Flood', landslides: 'Landslide',
  manmade: 'Manmade', snow: 'Snow', tempExtremes: 'Temperature Extreme', waterColor: 'Water Color',
}

// Africa + Middle East bounding box (rough) — lon -20 to 65, lat -35 to 40
function isAfricaMiddleEast(coords) {
  if (!coords || coords.length < 2) return true // include if no coords
  const lon = coords[0], lat = coords[1]
  return lon >= -20 && lon <= 65 && lat >= -35 && lat <= 42
}

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

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { days = 30, status = 'open', category, region = 'africa' } = req.query
  const cacheKey = `eonet-${days}-${status}-${category || 'all'}-${region}`

  if (cache[cacheKey] && Date.now() - cache[cacheKey].time < CACHE_TTL) {
    return res.json({ ...cache[cacheKey].data, cached: true })
  }

  let url = `https://eonet.gsfc.nasa.gov/api/v3/events?status=${status}&days=${days}&limit=100`
  if (category) url += `&category=${category}`

  const r = await fetchWithTimeout(url)
  if (!r?.ok) return res.status(502).json({ error: 'EONET fetch failed' })

  let data
  try { data = await r.json() } catch { return res.status(502).json({ error: 'EONET parse failed' }) }

  let events = (data.events || []).map(e => {
    const geometry = e.geometry?.[0]
    const coords = geometry?.coordinates
    return {
      id: e.id,
      title: e.title,
      category: e.categories?.[0]?.id,
      categoryLabel: CATEGORY_LABELS[e.categories?.[0]?.id] || e.categories?.[0]?.title || 'Unknown',
      status: e.closed ? 'Closed' : 'Open',
      date: geometry?.date || e.geometry?.[e.geometry?.length - 1]?.date,
      coordinates: Array.isArray(coords?.[0]) ? coords[0] : coords,
      sources: e.sources?.map(s => ({ id: s.id, url: s.url })),
    }
  })

  // Filter to Africa + Middle East
  if (region === 'africa') {
    events = events.filter(e => isAfricaMiddleEast(e.coordinates))
  }

  // Summarise by category
  const byCategory = {}
  for (const e of events) {
    byCategory[e.categoryLabel] = (byCategory[e.categoryLabel] || 0) + 1
  }

  const result = {
    source: 'NASA EONET',
    configured: true,
    total: events.length,
    open: events.filter(e => e.status === 'Open').length,
    byCategory,
    recent: events.slice(0, 10),
    period: `Last ${days} days`,
    region: region === 'africa' ? 'Africa + Middle East' : 'Global',
  }

  cache[cacheKey] = { data: result, time: Date.now() }
  res.json(result)
}
