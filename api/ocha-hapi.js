// UN OCHA HAPI — Humanitarian API
// Free, requires registration for API key
// Covers: refugees, displaced persons, food security, conflict events, humanitarian needs
// Sign up: https://hapi.humdata.org/
// Env var: OCHA_HAPI_API_KEY

const cache = {}
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

// Africa + Middle East ISO3 country codes
const AFRICA_ME_COUNTRIES = [
  // High-priority conflict/humanitarian
  'SDN', 'SSD', 'SOM', 'ETH', 'COD', 'CAF', 'NGA', 'MLI', 'BFA', 'NER',
  'MOZ', 'CMR', 'TCD', 'ZWE', 'MDG', 'AFG', 'SYR', 'IRQ', 'YEM', 'LBY',
  'PSE', 'LBN', 'HTI', 'MMR', 'UKR',
  // Broader Africa
  'KEN', 'TZA', 'UGA', 'RWA', 'BDI', 'ZAF', 'ZMB', 'MWI', 'AGO', 'GHA',
  'SEN', 'GIN', 'SLE', 'LBR', 'CIV', 'TGO', 'BEN', 'ERI', 'DJI',
  // Middle East
  'JOR', 'TUR', 'SAU', 'ARE', 'QAT', 'KWT', 'OMN', 'BHR', 'IRN',
]

async function fetchWithTimeout(url, headers = {}, ms = 8000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    const r = await fetch(url, { headers, signal: controller.signal })
    clearTimeout(timeout)
    return r
  } catch {
    clearTimeout(timeout)
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.OCHA_HAPI_API_KEY
  if (!apiKey) {
    return res.status(503).json({
      error: 'OCHA HAPI not configured',
      configured: false,
      signupUrl: 'https://hapi.humdata.org/',
      envVar: 'OCHA_HAPI_API_KEY',
    })
  }

  const { type = 'conflict', country } = req.query
  const cacheKey = `ocha-${type}-${country || 'all'}`

  if (cache[cacheKey] && Date.now() - cache[cacheKey].time < CACHE_TTL) {
    return res.json({ ...cache[cacheKey].data, cached: true })
  }

  const headers = { 'X-HDX-HAPI-APP-IDENTIFIER': `SafeGuard360 travel risk platform; admin@risk360.co` }
  const baseUrl = 'https://hapi.humdata.org/api/v1'

  let endpoint, label

  if (type === 'conflict') {
    endpoint = `/coordination-context/conflict-event?output_format=json&limit=20`
    if (country) endpoint += `&location_code=${country}`
    label = 'Conflict Events'
  } else if (type === 'refugees') {
    endpoint = `/affected-people/refugees?output_format=json&limit=20`
    if (country) endpoint += `&origin_location_code=${country}`
    label = 'Refugees & Displaced'
  } else if (type === 'food') {
    endpoint = `/food/food-security?output_format=json&limit=20`
    if (country) endpoint += `&location_code=${country}`
    label = 'Food Security'
  } else {
    return res.status(400).json({ error: `Unknown type: ${type}. Use conflict, refugees, or food` })
  }

  const r = await fetchWithTimeout(`${baseUrl}${endpoint}`, headers)
  if (!r?.ok) return res.status(502).json({ error: `OCHA HAPI fetch failed: ${r?.status}` })

  let data
  try { data = await r.json() } catch { return res.status(502).json({ error: 'OCHA HAPI parse failed' }) }

  const result = {
    source: 'UN OCHA HAPI',
    configured: true,
    type: label,
    total: data.metadata?.total_count || data.data?.length || 0,
    data: (data.data || []).slice(0, 15),
    fetchedAt: new Date().toISOString(),
  }

  cache[cacheKey] = { data: result, time: Date.now() }
  res.json(result)
}
