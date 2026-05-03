// AISStream — Real-time maritime AIS vessel tracking
// Free tier available (requires API key)
// WebSocket-based but we expose a REST summary via cached data
// Sign up: https://aisstream.io
// Env var: AISSTREAM_API_KEY
// Covers: cargo ships, tankers, passenger vessels — Africa coastal + Middle East waters

const cache = {}
const CACHE_TTL = 15 * 60 * 1000 // 15 min

// Key maritime zones around Africa + Middle East
const MARITIME_ZONES = [
  { name: 'Gulf of Aden', desc: 'High piracy risk — Somalia coast', minLat: 11, maxLat: 15, minLon: 42, maxLon: 52, risk: 'High' },
  { name: 'Red Sea', desc: 'Houthi threat zone — Yemen conflict', minLat: 12, maxLat: 30, minLon: 32, maxLon: 44, risk: 'Critical' },
  { name: 'Strait of Hormuz', desc: 'Iran-controlled chokepoint', minLat: 25, maxLat: 27, minLon: 56, maxLon: 60, risk: 'High' },
  { name: 'Gulf of Guinea', desc: 'Active piracy — West Africa coast', minLat: -5, maxLat: 5, minLon: -5, maxLon: 10, risk: 'High' },
  { name: 'Cape of Good Hope', desc: 'Major shipping reroute point — SA', minLat: -36, maxLat: -32, minLon: 17, maxLon: 22, risk: 'Low' },
  { name: 'Mozambique Channel', desc: 'Regional shipping lane — E Africa', minLat: -26, maxLat: -10, minLon: 34, maxLon: 42, risk: 'Medium' },
  { name: 'Suez Canal', desc: 'Global trade chokepoint — Egypt', minLat: 29, maxLat: 32, minLon: 32, maxLon: 34, risk: 'Medium' },
]

async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    const r = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeout)
    return r
  } catch {
    clearTimeout(timeout)
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.AISSTREAM_API_KEY
  if (!apiKey) {
    return res.status(503).json({
      error: 'AISStream not configured',
      configured: false,
      signupUrl: 'https://aisstream.io',
      envVar: 'AISSTREAM_API_KEY',
      zones: MARITIME_ZONES, // Always return zone info even without key
    })
  }

  const { zone } = req.query
  const cacheKey = `ais-${zone || 'all'}`

  if (cache[cacheKey] && Date.now() - cache[cacheKey].time < CACHE_TTL) {
    return res.json({ ...cache[cacheKey].data, cached: true })
  }

  // AISStream REST endpoint for vessel positions in a bounding box
  const targetZone = zone
    ? MARITIME_ZONES.find(z => z.name.toLowerCase().includes(zone.toLowerCase()))
    : MARITIME_ZONES[0] // Default: Gulf of Aden (highest risk)

  if (!targetZone) return res.status(400).json({ error: `Zone not found: ${zone}` })

  const url = `https://api.aisstream.io/v0/vessels?minLat=${targetZone.minLat}&maxLat=${targetZone.maxLat}&minLon=${targetZone.minLon}&maxLon=${targetZone.maxLon}&limit=20`

  const r = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })

  if (!r?.ok) return res.status(502).json({ error: `AISStream fetch failed: ${r?.status}` })

  let data
  try { data = await r.json() } catch { return res.status(502).json({ error: 'AISStream parse failed' }) }

  const vessels = (data.vessels || data || []).slice(0, 20).map(v => ({
    mmsi: v.mmsi || v.MMSI,
    name: v.name || v.ShipName || 'Unknown',
    type: v.shipType || v.ShipType,
    flag: v.flag || v.Flag,
    lat: v.latitude || v.Latitude,
    lon: v.longitude || v.Longitude,
    speed: v.speedOverGround || v.SOG,
    heading: v.trueHeading || v.TrueHeading,
    destination: v.destination || v.Destination,
    lastSeen: v.timestamp || v.TimeUtc,
  }))

  const result = {
    source: 'AISStream',
    configured: true,
    zone: targetZone,
    vesselCount: vessels.length,
    vessels,
    allZones: MARITIME_ZONES,
    fetchedAt: new Date().toISOString(),
  }

  cache[cacheKey] = { data: result, time: Date.now() }
  res.json(result)
}
