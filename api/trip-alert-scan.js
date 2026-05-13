/**
 * /api/trip-alert-scan.js
 *
 * Scans live sources for alerts relevant to a user's upcoming trips,
 * runs Claude AI synthesis per destination, and writes everything to trip_alerts.
 *
 * Required env vars:
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY
 *   ANTHROPIC_API_KEY   (required for AI synthesis)
 *   FLIGHTAWARE_API_KEY (optional)
 *
 * GET /api/trip-alert-scan
 *   Authorization: Bearer <supabase-jwt>
 *   Returns: { scanned, inserted, alerts, ai_briefs }
 */

import { comprehensiveRiskScan, fetchGDACS, fetchUSGS, fetchHealthOutbreaks, generateMorningBrief } from './_claudeSynth.js'
import { notifyAlert } from './_notify.js'
import { cityToCountry } from './_cityCountry.js'

// ── In-memory cache: { [userId]: { ts, result } }
const userCache = {}
const CACHE_TTL_MS = 30 * 60 * 1000  // 30 minutes

// ── Severity helpers ─────────────────────────────────────────────────────────
function gdacsAlertToSeverity(level) {
  if (level === 'Red')    return 'Critical'
  if (level === 'Orange') return 'High'
  return 'Medium'
}

function magnitudeToSeverity(mag) {
  if (mag >= 7) return 'Critical'
  if (mag >= 6) return 'High'
  return 'Medium'
}

// ── Supabase REST helpers ─────────────────────────────────────────────────────
function sbHeaders(key) {
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

async function sbGet(baseUrl, serviceKey, table, qs) {
  const url = `${baseUrl}/rest/v1/${table}?${new URLSearchParams(qs)}`
  const res = await fetch(url, { headers: sbHeaders(serviceKey) })
  if (!res.ok) throw new Error(`Supabase GET ${table} → ${res.status}`)
  return res.json()
}

async function sbUpsert(baseUrl, serviceKey, table, rows) {
  if (!rows.length) return []
  const res = await fetch(`${baseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      ...sbHeaders(serviceKey),
      'Prefer': 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase upsert ${table} → ${res.status}: ${text}`)
  }
  return res.json().catch(() => [])
}

// ── FlightAware ───────────────────────────────────────────────────────────────
async function fetchFlightStatus(flightNumber, apiKey) {
  try {
    const res = await fetch(
      `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(flightNumber)}?max_pages=1`,
      {
        headers: { 'x-apikey': apiKey },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data?.flights?.[0] || null
  } catch {
    return null
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function _handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const ANON_KEY     = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  const FA_KEY       = process.env.FLIGHTAWARE_API_KEY || ''
  const AI_KEY       = process.env.ANTHROPIC_API_KEY || ''

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(200).json({
      scanned: 0, inserted: 0, alerts: [], ai_briefs: [],
      warning: 'Missing SUPABASE env vars',
    })
  }

  // ── 1. JWT validation ────────────────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' })
  }

  let userId
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    })
    if (!userRes.ok) throw new Error('auth failed')
    const user = await userRes.json()
    userId = user?.id
    if (!userId) throw new Error('no user id')
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // ── 2. Per-user cache (bypass with ?force=true) ──────────────────────────
  const force = req.query?.force === 'true'
  const cached = userCache[userId]
  if (!force && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return res.status(200).json({ ...cached.result, cached: true })
  }

  // ── 3. Load upcoming + active itineraries ────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  let itineraries = []
  try {
    itineraries = await sbGet(SUPABASE_URL, SERVICE_KEY, 'itineraries', {
      user_id: `eq.${userId}`,
      return_date: `gte.${today}`,
      select: 'id,trip_name,arrival_city,departure_city,flight_number,depart_date,return_date,risk_level',
      order: 'depart_date.asc',
    })
  } catch (e) {
    return res.status(200).json({ scanned: 0, inserted: 0, alerts: [], ai_briefs: [], error: e.message })
  }

  if (!itineraries.length) {
    return res.status(200).json({ scanned: 0, inserted: 0, alerts: [], ai_briefs: [] })
  }

  // ── 4. Scan each trip ────────────────────────────────────────────────────
  const allRows   = []
  const aiBriefs  = []

  for (const trip of itineraries) {
    try {
      const country = cityToCountry(trip.arrival_city) || trip.arrival_city
      if (!country) continue

      // Fetch all sources in parallel for this trip (including health outbreak data)
      const [gdacsEvents, quakes, internalAlerts, health] = await Promise.all([
        fetchGDACS(country),
        fetchUSGS(country),
        sbGet(SUPABASE_URL, SERVICE_KEY, 'alerts', {
          status: 'eq.Active',
          country: `ilike.%${country}%`,
          select: 'id,title,description,severity,alert_type,country,source,date_issued',
        }).catch(() => []),
        fetchHealthOutbreaks(country),
      ])

      // ── 4a. GDACS events ─────────────────────────────────────────────────
      for (const ev of gdacsEvents) {
        const p = ev.properties || {}
        const eventId = p.eventid || p.eventId || ev.id
        allRows.push({
          itinerary_id: trip.id,
          user_id: userId,
          alert_type: 'disaster',
          severity: gdacsAlertToSeverity(p.alertlevel),
          title: p.eventname || p.name || `${p.eventtype || 'Disaster'} event in ${country}`,
          description: p.description || p.htmldescription?.replace(/<[^>]+>/g, '') || null,
          source: 'GDACS',
          source_url: p.url?.report || p.url?.details || 'https://gdacs.org',
          country,
          arrival_city: trip.arrival_city,
          trip_name: trip.trip_name,
          dedup_key: `gdacs-${eventId}-${trip.id}`,
          event_date: p.fromdate ? new Date(p.fromdate).toISOString() : null,
        })
      }

      // ── 4b. USGS earthquakes ─────────────────────────────────────────────
      for (const q of quakes) {
        const p = q.properties || {}
        const mag = p.mag || 0
        allRows.push({
          itinerary_id: trip.id,
          user_id: userId,
          alert_type: 'earthquake',
          severity: magnitudeToSeverity(mag),
          title: `M${mag.toFixed(1)} Earthquake – ${p.place || country}`,
          description: `Magnitude ${mag} earthquake recorded near ${p.place || country}. USGS intensity: ${p.mmi ? `MMI ${p.mmi}` : 'Unknown'}.`,
          source: 'USGS',
          source_url: p.url || 'https://earthquake.usgs.gov',
          country,
          arrival_city: trip.arrival_city,
          trip_name: trip.trip_name,
          dedup_key: `usgs-${q.id}-${trip.id}`,
          event_date: p.time ? new Date(p.time).toISOString() : null,
        })
      }

      // ── 4c. Internal alerts table ────────────────────────────────────────
      for (const al of internalAlerts) {
        allRows.push({
          itinerary_id: trip.id,
          user_id: userId,
          alert_type: al.alert_type || 'security',
          severity: al.severity || 'Medium',
          title: al.title,
          description: al.description || null,
          source: al.source || 'SafeGuard360',
          country: al.country || country,
          arrival_city: trip.arrival_city,
          trip_name: trip.trip_name,
          dedup_key: `alert-${al.id}-${trip.id}`,
          event_date: al.date_issued ? new Date(al.date_issued).toISOString() : null,
        })
      }

      // ── 4d. FlightAware (optional) ───────────────────────────────────────
      if (trip.flight_number && FA_KEY) {
        const flight = await fetchFlightStatus(trip.flight_number, FA_KEY)
        if (flight) {
          const delay = flight.departure_delay || 0
          if (flight.cancelled || delay > 45 * 60) {
            const title = flight.cancelled
              ? `Flight ${trip.flight_number} Cancelled`
              : `Flight ${trip.flight_number} Delayed ${Math.round(delay / 60)} mins`
            allRows.push({
              itinerary_id: trip.id,
              user_id: userId,
              alert_type: 'flight',
              severity: flight.cancelled ? 'High' : 'Medium',
              title,
              description: flight.cancelled
                ? `${trip.flight_number} for ${trip.trip_name} has been cancelled.`
                : `${trip.flight_number} is delayed by ${Math.round(delay / 60)} minutes.`,
              source: 'FlightAware',
              source_url: `https://flightaware.com/live/flight/${encodeURIComponent(trip.flight_number)}`,
              country,
              arrival_city: trip.arrival_city,
              trip_name: trip.trip_name,
              dedup_key: `flight-${trip.flight_number}-${trip.depart_date}-${trip.id}`,
              event_date: trip.depart_date ? new Date(trip.depart_date).toISOString() : null,
            })
          }
        }
      }

      // ── 4e. Comprehensive AI risk scan for this destination ──────────────
      if (AI_KEY) {
        try {
          const scan = await comprehensiveRiskScan(
            country, trip.arrival_city,
            { fcdo: null, gdacs: gdacsEvents, usgs: quakes, iss: null, health },
            AI_KEY
          )
          if (scan) {
            aiBriefs.push({ trip_id: trip.id, trip_name: trip.trip_name, country, city: trip.arrival_city, brief: scan })

            // Store overall AI brief record (one per trip per day)
            allRows.push({
              itinerary_id: trip.id,
              user_id: userId,
              alert_type: 'ai_brief',
              severity: scan.overall_severity || 'Medium',
              title: `AI Risk Brief: ${trip.arrival_city || country}`,
              description: JSON.stringify({
                summary: scan.summary,
                key_risks: scan.key_risks,
                recommendations: scan.recommendations,
              }),
              source: 'Claude AI',
              source_url: null,
              country,
              arrival_city: trip.arrival_city,
              trip_name: trip.trip_name,
              dedup_key: `ai-brief-${trip.id}-${today}`,
              event_date: new Date().toISOString(),
            })

            // Store each individual risk as its own trip_alert row
            if (scan.risks?.length) {
              for (const risk of scan.risks) {
                const titleKey = (risk.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)
                allRows.push({
                  itinerary_id: trip.id,
                  user_id: userId,
                  alert_type: risk.category || 'security',
                  severity: risk.severity || 'Medium',
                  title: risk.title,
                  description: risk.description + (risk.recommendation ? ` — ${risk.recommendation}` : ''),
                  source: 'Claude AI',
                  source_url: null,
                  country,
                  arrival_city: trip.arrival_city,
                  trip_name: trip.trip_name,
                  dedup_key: `ai-risk-${titleKey}-${trip.id}-${today}`,
                  event_date: new Date().toISOString(),
                })
              }
            }
          }
        } catch (e) {
          console.error(`AI comprehensive scan failed for trip ${trip.id}:`, e.message)
        }
      }

    } catch (err) {
      console.error(`trip-alert-scan: error on trip ${trip.id}:`, err.message)
    }
  }

  // ── 5. Upsert into trip_alerts ────────────────────────────────────────────
  let inserted = []
  if (allRows.length > 0) {
    try {
      inserted = await sbUpsert(SUPABASE_URL, SERVICE_KEY, 'trip_alerts', allRows)
    } catch (e) {
      console.error('trip-alert-scan: upsert error:', e.message)
    }
  }

  // ── 5a. Send notifications for new Critical / High alerts ─────────────────
  // "New" = created_at within the last 5 minutes (upsert on existing rows
  //  preserves the original created_at, so genuinely new rows stand out).
  if (inserted.length > 0 && process.env.RESEND_API_KEY) {
    try {
      // Fetch user email + phone from Supabase
      const [authRes, profileRows] = await Promise.all([
        fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(4000),
        }).then(r => r.ok ? r.json() : null).catch(() => null),
        sbGet(SUPABASE_URL, SERVICE_KEY, 'profiles', {
          id: `eq.${userId}`, select: 'phone,whatsapp_number', limit: 1,
        }).catch(() => []),
      ])

      const userEmail    = authRes?.email || null
      const profile      = profileRows?.[0] || {}
      const userPhone    = profile.phone || null
      const userWhatsApp = profile.whatsapp_number || null

      const fiveMinAgo = Date.now() - 5 * 60 * 1000
      const newAlerts  = inserted.filter(a =>
        a.alert_type !== 'ai_brief' &&
        ['Critical', 'High'].includes(a.severity) &&
        new Date(a.created_at).getTime() > fiveMinAgo
      )

      if (newAlerts.length > 0 && userEmail) {
        // Group by trip so travellers get one email per trip, not per alert
        const byTrip = {}
        for (const a of newAlerts) {
          const key = a.itinerary_id || 'general'
          if (!byTrip[key]) byTrip[key] = { tripName: a.trip_name, city: a.arrival_city, alerts: [] }
          byTrip[key].alerts.push(a)
        }
        for (const { tripName, city, alerts } of Object.values(byTrip)) {
          await notifyAlert({ userEmail, userPhone, userWhatsApp, alerts, tripName, city })
        }
        console.log(`[trip-alert-scan] Notified ${userEmail} about ${newAlerts.length} new alert(s)`)
      }
    } catch (e) {
      console.error('[trip-alert-scan] notification error:', e.message)
    }
  }

  // ── 6. Generate AI morning brief (admin use) ──────────────────────────────
  let morningBrief = null
  if (AI_KEY && itineraries.length > 0) {
    try {
      const countries = [...new Set(itineraries.map(t => cityToCountry(t.arrival_city) || t.arrival_city).filter(Boolean))]
      const activeAlerts = inserted.filter(a => a.alert_type !== 'ai_brief').slice(0, 10)
      morningBrief = await generateMorningBrief(
        { trips: itineraries, alerts: activeAlerts, countries },
        AI_KEY
      )
    } catch (e) {
      console.error('Morning brief generation failed:', e.message)
    }
  }

  const result = {
    scanned: itineraries.length,
    inserted: inserted.length,
    alerts: inserted,
    ai_briefs: aiBriefs,
    morning_brief: morningBrief,
  }

  userCache[userId] = { ts: Date.now(), result }

  return res.status(200).json(result)
}

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default handler
