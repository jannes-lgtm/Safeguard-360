// Open-Meteo — Free weather API, no API key required
// Global coverage, hourly updates, ERA5 reanalysis data
// Docs: https://open-meteo.com/en/docs

const cache = {}
const CACHE_TTL = 30 * 60 * 1000 // 30 min

// Major African + Middle East cities with coordinates
export const MONITORED_LOCATIONS = [
  // South Africa
  { name: 'Johannesburg', country: 'South Africa', lat: -26.2041, lon: 28.0473 },
  { name: 'Cape Town', country: 'South Africa', lat: -33.9249, lon: 18.4241 },
  { name: 'Durban', country: 'South Africa', lat: -29.8587, lon: 31.0218 },
  // East Africa
  { name: 'Nairobi', country: 'Kenya', lat: -1.2921, lon: 36.8219 },
  { name: 'Dar es Salaam', country: 'Tanzania', lat: -6.7924, lon: 39.2083 },
  { name: 'Kampala', country: 'Uganda', lat: 0.3476, lon: 32.5825 },
  // West Africa
  { name: 'Lagos', country: 'Nigeria', lat: 6.5244, lon: 3.3792 },
  { name: 'Accra', country: 'Ghana', lat: 5.6037, lon: -0.1870 },
  { name: 'Abidjan', country: 'Côte d\'Ivoire', lat: 5.3600, lon: -4.0083 },
  // North Africa
  { name: 'Cairo', country: 'Egypt', lat: 30.0444, lon: 31.2357 },
  { name: 'Casablanca', country: 'Morocco', lat: 33.5731, lon: -7.5898 },
  // Central Africa
  { name: 'Kinshasa', country: 'DRC', lat: -4.4419, lon: 15.2663 },
  { name: 'Maputo', country: 'Mozambique', lat: -25.9692, lon: 32.5732 },
  // Middle East
  { name: 'Dubai', country: 'UAE', lat: 25.2048, lon: 55.2708 },
  { name: 'Riyadh', country: 'Saudi Arabia', lat: 24.7136, lon: 46.6753 },
  { name: 'Doha', country: 'Qatar', lat: 25.2854, lon: 51.5310 },
  { name: 'Amman', country: 'Jordan', lat: 31.9454, lon: 35.9284 },
  { name: 'Nairobi', country: 'Kenya', lat: -1.2921, lon: 36.8219 },
]

const WMO_CODES = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 51: 'Light drizzle', 61: 'Light rain', 63: 'Moderate rain', 65: 'Heavy rain',
  71: 'Light snow', 80: 'Rain showers', 95: 'Thunderstorm', 96: 'Thunderstorm + hail', 99: 'Heavy thunderstorm',
}

function severityFromCode(wmo, windSpeed) {
  if (wmo >= 95 || windSpeed > 60) return 'High'
  if (wmo >= 80 || windSpeed > 40) return 'Medium'
  if (wmo >= 61) return 'Low'
  return 'None'
}

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

  const { lat, lon, location, country } = req.query

  // Single location query
  if (lat && lon) {
    const cacheKey = `om-${lat}-${lon}`
    if (cache[cacheKey] && Date.now() - cache[cacheKey].time < CACHE_TTL) {
      return res.json({ ...cache[cacheKey].data, cached: true })
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weathercode,precipitation&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&timezone=auto&forecast_days=3`
    const r = await fetchWithTimeout(url)
    if (!r?.ok) return res.status(502).json({ error: 'Open-Meteo fetch failed' })

    let data
    try { data = await r.json() } catch { return res.status(502).json({ error: 'Open-Meteo parse failed' }) }

    const current = data.current || {}
    const result = {
      source: 'Open-Meteo',
      configured: true,
      location: location || `${lat},${lon}`,
      country: country || null,
      current: {
        temp: Math.round(current.temperature_2m),
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m,
        condition: WMO_CODES[current.weathercode] || 'Unknown',
        precipitation: current.precipitation,
        severity: severityFromCode(current.weathercode, current.wind_speed_10m),
      },
      forecast: (data.daily?.time || []).map((date, i) => ({
        date,
        condition: WMO_CODES[data.daily.weathercode[i]] || 'Unknown',
        tempMax: Math.round(data.daily.temperature_2m_max[i]),
        tempMin: Math.round(data.daily.temperature_2m_min[i]),
        precipitation: data.daily.precipitation_sum[i],
        windMax: data.daily.windspeed_10m_max[i],
      })),
    }
    cache[cacheKey] = { data: result, time: Date.now() }
    return res.json(result)
  }

  // Multi-location summary — fetch weather for key Africa/ME cities
  const locations = country
    ? MONITORED_LOCATIONS.filter(l => l.country.toLowerCase().includes(country.toLowerCase()))
    : MONITORED_LOCATIONS.slice(0, 8) // first 8 for speed

  const results = await Promise.allSettled(
    locations.map(async loc => {
      const cacheKey = `om-${loc.lat}-${loc.lon}`
      if (cache[cacheKey] && Date.now() - cache[cacheKey].time < CACHE_TTL) {
        return { ...cache[cacheKey].data, ...loc }
      }
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,wind_speed_10m,weathercode,precipitation&timezone=auto&forecast_days=1`
      const r = await fetchWithTimeout(url, 5000)
      if (!r?.ok) return null
      const data = await r.json()
      const current = data.current || {}
      const result = {
        ...loc,
        temp: Math.round(current.temperature_2m),
        windSpeed: current.wind_speed_10m,
        condition: WMO_CODES[current.weathercode] || 'Unknown',
        severity: severityFromCode(current.weathercode, current.wind_speed_10m),
        precipitation: current.precipitation,
      }
      cache[cacheKey] = { data: result, time: Date.now() }
      return result
    })
  )

  const cities = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)

  const alerts = cities.filter(c => c.severity === 'High' || c.severity === 'Medium')

  res.json({
    source: 'Open-Meteo',
    configured: true,
    cities,
    alerts,
    alertCount: alerts.length,
    note: 'No API key required — Open-Meteo is completely free and open source',
  })
}
