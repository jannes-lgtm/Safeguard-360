// Automated monitor — checks all active trips for flight delays and country risk
// Called hourly by cron-job.org (or Vercel Cron)
// Protected by MONITOR_SECRET env var

import { createClient } from '@supabase/supabase-js'

const FROM = 'SafeGuard360 Alerts <alerts@risk360.co>'

// Supabase admin client (bypasses RLS)
function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// --- Country risk helpers ---
async function fetchFcdo(country) {
  const slug = country.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z-]/g, '')
  try {
    const r = await fetch(`https://www.gov.uk/api/content/foreign-travel-advice/${slug}`, {
      headers: { Accept: 'application/json' }
    })
    if (!r.ok) return null
    const data = await r.json()
    const part = data.details?.parts?.find(p => p.slug === 'warnings-and-insurance')
    if (!part?.body) return null
    const t = part.body.toLowerCase()
    let level = 1
    if (t.includes('advises against all travel')) level = 4
    else if (t.includes('advises against all but essential travel')) level = 3
    else if (t.includes('advises against some travel') || t.includes('some parts of')) level = 2
    return { level, url: `https://www.gov.uk/foreign-travel-advice/${slug}` }
  } catch { return null }
}

async function fetchStateAdvisory(country) {
  try {
    const r = await fetch('https://travel.state.gov/content/dam/traveladvisories/Feeds/TravelAdvisoryJSON.json')
    if (!r.ok) return null
    const data = await r.json()
    const entry = data.graph?.find(c =>
      (c.name || c.countryName || '').toLowerCase() === country.toLowerCase()
    )
    if (!entry) return null
    return {
      level: entry.advisoryLevel ?? entry.level ?? null,
      url: entry.url ?? 'https://travel.state.gov',
    }
  } catch { return null }
}

async function getCountryRisk(country) {
  const [fcdo, us] = await Promise.allSettled([fetchFcdo(country), fetchStateAdvisory(country)])
  const fcdoData = fcdo.status === 'fulfilled' ? fcdo.value : null
  const usData = us.status === 'fulfilled' ? us.value : null
  const combinedLevel = Math.max(fcdoData?.level ?? 0, usData?.level ?? 0) || 0
  let severity = 'Low'
  if (combinedLevel >= 4) severity = 'Critical'
  else if (combinedLevel >= 3) severity = 'High'
  else if (combinedLevel >= 2) severity = 'Medium'
  return { severity, level: combinedLevel }
}

// City → Country map (simplified)
const CITY_MAP = {
  lagos: 'Nigeria', abuja: 'Nigeria', nairobi: 'Kenya', mombasa: 'Kenya',
  johannesburg: 'South Africa', 'cape town': 'South Africa', durban: 'South Africa',
  cairo: 'Egypt', accra: 'Ghana', kampala: 'Uganda', kinshasa: 'Democratic Republic of the Congo',
  mogadishu: 'Somalia', 'addis ababa': 'Ethiopia', kigali: 'Rwanda',
  'dar es salaam': 'Tanzania', lusaka: 'Zambia', harare: 'Zimbabwe',
  maputo: 'Mozambique', luanda: 'Angola', dakar: 'Senegal', casablanca: 'Morocco',
  tripoli: 'Libya', khartoum: 'Sudan', juba: 'South Sudan',
  dubai: 'United Arab Emirates', 'abu dhabi': 'United Arab Emirates',
  riyadh: 'Saudi Arabia', doha: 'Qatar', baghdad: 'Iraq', tehran: 'Iran',
  london: 'United Kingdom', paris: 'France', berlin: 'Germany', amsterdam: 'Netherlands',
  moscow: 'Russia', kyiv: 'Ukraine',
  'new york': 'United States', 'los angeles': 'United States', miami: 'United States',
  toronto: 'Canada', singapore: 'Singapore', tokyo: 'Japan', beijing: 'China',
  mumbai: 'India', delhi: 'India', bangkok: 'Thailand', sydney: 'Australia',
}

function resolveCountry(city) {
  if (!city) return null
  return CITY_MAP[city.toLowerCase().trim()] ?? city.trim()
}

// --- Flight status helper ---
async function getFlightStatus(flightNumber, apiKey) {
  if (!apiKey || !flightNumber) return null
  try {
    const r = await fetch(
      `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(flightNumber)}`,
      { headers: { 'x-apikey': apiKey } }
    )
    if (!r.ok) return null
    const data = await r.json()
    const f = data.flights?.[0]
    if (!f) return null
    return {
      ident: f.ident,
      status: f.status,
      origin: f.origin?.name,
      destination: f.destination?.name,
      estimatedArrival: f.estimated_in,
      arrivalDelay: f.arrival_delay,
    }
  } catch { return null }
}

// --- Email sender ---
async function sendAlert(recipients, subject, html, apiKey) {
  if (!recipients?.length || !apiKey) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: recipients, subject, html }),
    })
  } catch {}
}

function flightAlertHtml({ travelerName, ident, status, origin, destination, arrivalDelay, tripName }) {
  const delay = arrivalDelay > 0 ? `${arrivalDelay} minutes late` : ''
  const color = status === 'Cancelled' ? '#DC2626' : '#D97706'
  const icon = status === 'Cancelled' ? '🚫' : '⚠️'
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <div style="background:#1E2461;padding:20px 24px;">
        <h1 style="color:white;margin:0;font-size:20px;">SafeGuard360</h1>
        <p style="color:#a5b4fc;margin:4px 0 0;font-size:13px;">Automated Flight Monitor</p>
      </div>
      <div style="padding:24px;">
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:16px;margin-bottom:20px;">
          <p style="margin:0;font-size:16px;font-weight:bold;color:${color};">${icon} Flight ${ident} — ${status}</p>
          ${delay ? `<p style="margin:6px 0 0;color:#92400e;font-size:14px;">Delayed by ${delay}</p>` : ''}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Trip</td><td style="padding:8px 0;font-weight:600;">${tripName || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Route</td><td style="padding:8px 0;">${origin || '—'} → ${destination || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Status</td><td style="padding:8px 0;color:${color};font-weight:600;">${status}</td></tr>
        </table>
        <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">This automated alert was sent to ${travelerName} and their emergency contacts by SafeGuard360.</p>
      </div>
    </div>`
}

function countryAlertHtml({ travelerName, country, severity, tripName }) {
  const colors = { Critical: '#DC2626', High: '#D97706', Medium: '#CA8A04' }
  const color = colors[severity] || '#6b7280'
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <div style="background:#1E2461;padding:20px 24px;">
        <h1 style="color:white;margin:0;font-size:20px;">SafeGuard360</h1>
        <p style="color:#a5b4fc;margin:4px 0 0;font-size:13px;">Automated Risk Monitor</p>
      </div>
      <div style="padding:24px;">
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px;margin-bottom:20px;">
          <p style="margin:0;font-size:16px;font-weight:bold;color:${color};">🚨 ${country} — ${severity} Risk</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Trip</td><td style="padding:8px 0;font-weight:600;">${tripName || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Destination</td><td style="padding:8px 0;font-weight:600;">${country}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Risk Level</td><td style="padding:8px 0;color:${color};font-weight:600;">${severity}</td></tr>
        </table>
        <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">This automated alert was sent to ${travelerName} and their emergency contacts by SafeGuard360.</p>
      </div>
    </div>`
}

const ALERT_FLIGHT_STATUSES = ['En Route/Late', 'Cancelled', 'Diverted']
const ALERT_RISK_LEVELS = ['Critical', 'High']

export default async function handler(req, res) {
  // Security check
  const secret = req.headers['x-monitor-secret'] || new URLSearchParams(req.url?.split('?')[1]).get('secret')
  if (process.env.MONITOR_SECRET && secret !== process.env.MONITOR_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = getSupabase()
  const flightApiKey = process.env.FLIGHTAWARE_API_KEY
  const resendApiKey = process.env.RESEND_API_KEY
  const today = new Date().toISOString().split('T')[0]

  // Get all active itineraries with profile info
  const { data: itineraries, error } = await supabase
    .from('itineraries')
    .select('*, profiles(*)')
    .lte('depart_date', today)
    .gte('return_date', today)

  if (error) return res.status(500).json({ error: error.message })
  if (!itineraries?.length) return res.json({ ok: true, checked: 0, message: 'No active trips' })

  // Load existing monitor states
  const { data: states } = await supabase
    .from('monitor_state')
    .select('*')
    .in('itinerary_id', itineraries.map(t => t.id))

  const stateMap = {}
  for (const s of states || []) stateMap[s.itinerary_id] = s

  const results = []

  for (const trip of itineraries) {
    const profile = trip.profiles
    if (!profile) continue

    const travelerName = profile.full_name || profile.email || 'Traveler'
    const recipients = [
      profile.email,
      profile.emergency_contact_1_email,
      profile.emergency_contact_2_email,
    ].filter(Boolean)

    if (!recipients.length) continue

    const prevState = stateMap[trip.id] || {}
    const tripResult = { trip: trip.trip_name, traveler: travelerName, alerts: [], skipped: [] }
    const newState = { itinerary_id: trip.id, last_checked: new Date().toISOString() }

    // 1. Check flight status — only alert if status has CHANGED
    if (trip.flight_number && flightApiKey) {
      const flight = await getFlightStatus(trip.flight_number, flightApiKey)
      if (flight) {
        newState.flight_status = flight.status
        const isFirstRun = !prevState.flight_status  // never checked before — don't alert yet
        const statusChanged = flight.status !== prevState.flight_status
        const isAlertStatus = ALERT_FLIGHT_STATUSES.includes(flight.status)

        if (isAlertStatus && statusChanged && !isFirstRun) {
          const subject = flight.status === 'Cancelled'
            ? `🚫 Flight ${flight.ident} Cancelled — ${trip.trip_name}`
            : `⚠️ Flight ${flight.ident} Delayed — ${trip.trip_name}`
          await sendAlert(
            recipients,
            subject,
            flightAlertHtml({ ...flight, tripName: trip.trip_name, travelerName }),
            resendApiKey
          )
          newState.last_alerted_flight = new Date().toISOString()
          tripResult.alerts.push(`Flight changed to ${flight.status}`)
        } else if (isAlertStatus && !statusChanged) {
          tripResult.skipped.push(`Flight still ${flight.status} — already alerted`)
        }
      }
    }

    // 2. Check country risk — only alert if risk level has CHANGED
    const country = resolveCountry(trip.arrival_city)
    if (country) {
      const risk = await getCountryRisk(country)
      newState.country_risk = risk.severity
      const isFirstRiskRun = !prevState.country_risk
      const riskChanged = risk.severity !== prevState.country_risk
      const isAlertRisk = ALERT_RISK_LEVELS.includes(risk.severity)

      if (isAlertRisk && riskChanged && !isFirstRiskRun) {
        await sendAlert(
          recipients,
          `🚨 Risk Alert: ${country} — ${risk.severity} | ${trip.trip_name}`,
          countryAlertHtml({ country, severity: risk.severity, tripName: trip.trip_name, travelerName }),
          resendApiKey
        )
        newState.last_alerted_risk = new Date().toISOString()
        tripResult.alerts.push(`Country risk changed to ${risk.severity}`)
      } else if (isAlertRisk && !riskChanged) {
        tripResult.skipped.push(`Country risk still ${risk.severity} — already alerted`)
      }
    }

    // Save updated state
    const { error: upsertErr } = await supabase
      .from('monitor_state')
      .upsert(newState, { onConflict: 'itinerary_id' })
    if (upsertErr) console.error('monitor_state upsert error:', upsertErr.message)

    results.push(tripResult)
  }

  res.json({ ok: true, checked: itineraries.length, results })
}
