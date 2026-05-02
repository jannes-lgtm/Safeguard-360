import http from 'http'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env manually
try {
  const env = readFileSync(resolve(__dirname, '.env'), 'utf8')
  env.split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && v.length) process.env[k.trim()] = v.join('=').trim()
  })
} catch {}

const FLIGHTAWARE_KEY = process.env.FLIGHTAWARE_API_KEY

// ── Country risk cache ─────────────────────────────────────────────────────
let stateCache = null
let stateCacheTime = 0

async function getCountryRisk(country) {
  if (!stateCache || Date.now() - stateCacheTime > 3600000) {
    const r = await fetch('https://travel.state.gov/content/dam/traveladvisories/Feeds/TravelAdvisoryJSON.json')
    if (r.ok) { stateCache = await r.json(); stateCacheTime = Date.now() }
  }
  const entry = stateCache?.graph?.find(c =>
    (c.name || c.countryName || '').toLowerCase() === country.toLowerCase()
  )
  const usLevel = entry ? (entry.advisoryLevel ?? entry.level ?? null) : null
  const usUrl = entry?.url ?? 'https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html'
  const usMessage = entry ? (entry.advisoryText ?? entry.message ?? null) : null

  const fcdo = await fetchFcdo(country)
  const dfatSlug = country.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z-]/g, '')
  const combinedLevel = Math.max(usLevel ?? 0, fcdo?.level ?? 0) || null

  return {
    country, level: combinedLevel, severity: toSeverity(combinedLevel),
    sources: [
      usLevel != null ? { name: 'US State Dept', level: usLevel, message: usMessage, url: usUrl } : null,
      fcdo ? { name: 'UK FCDO', level: fcdo.level, message: fcdo.message, url: fcdo.url } : null,
      { name: 'AU DFAT', url: `https://www.smartraveller.gov.au/destinations/${dfatSlug}` },
    ].filter(Boolean),
  }
}

async function fetchFcdo(country) {
  const slug = country.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z-]/g, '')
  try {
    const r = await fetch(`https://www.gov.uk/api/content/foreign-travel-advice/${slug}`, { headers: { Accept: 'application/json' } })
    if (!r.ok) return null
    const data = await r.json()
    const part = data.details?.parts?.find(p => p.slug === 'warnings-and-insurance')
    if (!part?.body) return null
    const t = part.body.toLowerCase()
    let level = 1
    if (t.includes('advises against all travel')) level = 4
    else if (t.includes('advises against all but essential travel')) level = 3
    else if (t.includes('advises against some travel') || t.includes('some parts of')) level = 2
    const labels = ['', 'Normal precautions', 'Exercise caution', 'All but essential travel', 'Do not travel']
    return { level, message: labels[level], url: `https://www.gov.uk/foreign-travel-advice/${slug}` }
  } catch { return null }
}

function toSeverity(l) {
  if (!l) return 'Unknown'
  if (l >= 4) return 'Critical'
  if (l >= 3) return 'High'
  if (l >= 2) return 'Medium'
  return 'Low'
}

// ── HTTP server ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const json = (data, status = 200) => { res.statusCode = status; res.end(JSON.stringify(data)) }

  // /api/country-risk
  if (url.pathname === '/api/country-risk') {
    const country = url.searchParams.get('country')
    if (!country) return json({ error: 'country required' }, 400)
    getCountryRisk(country).then(d => json(d)).catch(e => json({ error: e.message }, 500))
    return
  }

  // /api/flight-status
  if (url.pathname === '/api/flight-status') {
    const flight = url.searchParams.get('flight')
    if (!flight) return json({ error: 'flight required' }, 400)

    if (!FLIGHTAWARE_KEY) {
      return json({
        ident: flight.toUpperCase(), status: 'En Route/On Time',
        origin: 'O.R. Tambo International', destination: 'Murtala Muhammed International',
        scheduledDeparture: new Date(Date.now() - 3600000).toISOString(),
        estimatedArrival: new Date(Date.now() + 10800000).toISOString(),
        departureDelay: 0, arrivalDelay: 0, cancelled: false, _mock: true,
      })
    }

    fetch(`https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(flight)}`, {
      headers: { 'x-apikey': FLIGHTAWARE_KEY }
    })
      .then(r => { if (!r.ok) throw Object.assign(new Error(`FlightAware ${r.status}`), { status: r.status }); return r.json() })
      .then(data => {
        const f = data.flights?.[0]
        if (!f) throw Object.assign(new Error('Flight not found'), { status: 404 })
        json({
          ident: f.ident, status: f.status,
          origin: f.origin?.name, destination: f.destination?.name,
          scheduledDeparture: f.scheduled_out, estimatedDeparture: f.estimated_out,
          actualDeparture: f.actual_out, scheduledArrival: f.scheduled_in,
          estimatedArrival: f.estimated_in, actualArrival: f.actual_in,
          departureDelay: f.departure_delay, arrivalDelay: f.arrival_delay,
          cancelled: f.cancelled, diverted: f.diverted, aircraftType: f.aircraft_type,
        })
      })
      .catch(e => json({ error: e.message }, e.status ?? 500))
    return
  }

  json({ error: 'Not found' }, 404)
})

server.listen(3001, () => console.log('  ➜  API server: http://localhost:3001'))
