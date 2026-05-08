/**
 * /api/scan-all
 *
 * Background scan — runs for ALL users with active/upcoming trips.
 * Called by Vercel Cron (every 6 hours) or manually with the secret token.
 *
 * Auth: Authorization: Bearer <SCAN_SECRET>  (not a user JWT)
 *
 * Required env vars:
 *   SCAN_SECRET                — arbitrary secret to protect this endpoint
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY          (optional — enables AI briefs)
 *   RESEND_API_KEY             (optional — enables email notifications)
 *   TWILIO_ACCOUNT_SID         (optional — enables SMS/WhatsApp)
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER
 *   TWILIO_WHATSAPP_FROM
 */

import { comprehensiveRiskScan, fetchGDACS, fetchUSGS, fetchHealthOutbreaks } from './_claudeSynth.js'
import { notifyAlert } from './_notify.js'

const CACHE_TTL_MS = 6 * 60 * 60 * 1000  // don't re-alert same user within 6 hours
const notifiedAt   = {}                    // { [userId]: timestamp } — in-memory, resets on cold start

function sbHeaders(key) {
  return {
    'apikey':        key,
    'Authorization': `Bearer ${key}`,
    'Content-Type':  'application/json',
  }
}

async function sbGet(baseUrl, key, table, qs) {
  const url = `${baseUrl}/rest/v1/${table}?${new URLSearchParams(qs)}`
  const res = await fetch(url, { headers: sbHeaders(key) })
  if (!res.ok) throw new Error(`Supabase GET ${table} → ${res.status}`)
  return res.json()
}

async function sbUpsert(baseUrl, key, table, rows) {
  if (!rows.length) return []
  const res = await fetch(`${baseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders(key), 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase upsert ${table} → ${res.status}: ${text}`)
  }
  return res.json().catch(() => [])
}

function gdacsSeverity(level) {
  if (level === 'Red')    return 'Critical'
  if (level === 'Orange') return 'High'
  return 'Medium'
}

function quakeSeverity(mag) {
  if (mag >= 7) return 'Critical'
  if (mag >= 6) return 'High'
  return 'Medium'
}

async function _handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const AI_KEY       = process.env.ANTHROPIC_API_KEY || ''
  const SCAN_SECRET  = process.env.SCAN_SECRET || ''

  // Auth — either the Vercel cron header or Bearer secret
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  const isCron = req.headers['x-vercel-cron'] === '1'
  if (!isCron && (!SCAN_SECRET || bearer !== SCAN_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase env vars' })
  }

  const today = new Date().toISOString().split('T')[0]

  // ── 1. Fetch all profiles with a phone or whatsapp number ─────────────────
  let profiles = []
  try {
    profiles = await sbGet(SUPABASE_URL, SERVICE_KEY, 'profiles', {
      select: 'id,email,phone,whatsapp_number',
      status: 'eq.active',
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }

  // ── 2. Fetch all active + upcoming itineraries across all users ───────────
  let itineraries = []
  try {
    itineraries = await sbGet(SUPABASE_URL, SERVICE_KEY, 'itineraries', {
      return_date: `gte.${today}`,
      select: 'id,user_id,trip_name,arrival_city,departure_city,flight_number,depart_date,return_date',
      order: 'depart_date.asc',
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }

  if (!itineraries.length) {
    return res.status(200).json({ scanned: 0, inserted: 0, notified: 0 })
  }

  // Index profiles by user id for fast lookup
  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]))

  // Group itineraries by destination country to batch feed fetches
  const countryTrips = {}
  for (const trip of itineraries) {
    const country = trip.arrival_city
      ? (CITY_COUNTRY[trip.arrival_city.toLowerCase().trim()] || trip.arrival_city)
      : null
    if (!country) continue
    if (!countryTrips[country]) countryTrips[country] = []
    countryTrips[country].push({ ...trip, country })
  }

  // ── 3. Scan each country once, attach results to trips ───────────────────
  const allRows = []
  let notifiedCount = 0

  for (const [country, trips] of Object.entries(countryTrips)) {
    let gdacsEvents = [], quakes = [], health = [], internalAlerts = []
    let aiScan = null

    try {
      ;[gdacsEvents, quakes, health] = await Promise.all([
        fetchGDACS(country),
        fetchUSGS(country),
        fetchHealthOutbreaks(country),
      ])

      internalAlerts = await sbGet(SUPABASE_URL, SERVICE_KEY, 'alerts', {
        status: 'eq.Active',
        country: `ilike.%${country}%`,
        select: 'id,title,description,severity,alert_type,country,source,date_issued',
      }).catch(() => [])

      if (AI_KEY) {
        aiScan = await comprehensiveRiskScan(
          country, trips[0].arrival_city,
          { fcdo: null, gdacs: gdacsEvents, usgs: quakes, iss: null, health },
          AI_KEY
        ).catch(() => null)
      }
    } catch (e) {
      console.error(`[scan-all] feed fetch failed for ${country}:`, e.message)
      continue
    }

    for (const trip of trips) {
      const rows = []

      for (const ev of gdacsEvents) {
        const p = ev.properties || {}
        rows.push({
          itinerary_id: trip.id, user_id: trip.user_id,
          alert_type: 'disaster', severity: gdacsSeverity(p.alertlevel),
          title: p.eventname || `${p.eventtype || 'Disaster'} in ${country}`,
          description: p.description || null, source: 'GDACS',
          source_url: p.url?.report || 'https://gdacs.org',
          country, arrival_city: trip.arrival_city, trip_name: trip.trip_name,
          dedup_key: `gdacs-${p.eventid || p.eventId}-${trip.id}`,
          event_date: p.fromdate ? new Date(p.fromdate).toISOString() : null,
        })
      }

      for (const q of quakes) {
        const p = q.properties || {}
        rows.push({
          itinerary_id: trip.id, user_id: trip.user_id,
          alert_type: 'earthquake', severity: quakeSeverity(p.mag || 0),
          title: `M${(p.mag || 0).toFixed(1)} Earthquake – ${p.place || country}`,
          description: `Magnitude ${p.mag} earthquake near ${p.place || country}.`,
          source: 'USGS', source_url: p.url || 'https://earthquake.usgs.gov',
          country, arrival_city: trip.arrival_city, trip_name: trip.trip_name,
          dedup_key: `usgs-${q.id}-${trip.id}`,
          event_date: p.time ? new Date(p.time).toISOString() : null,
        })
      }

      for (const al of internalAlerts) {
        rows.push({
          itinerary_id: trip.id, user_id: trip.user_id,
          alert_type: al.alert_type || 'security', severity: al.severity || 'Medium',
          title: al.title, description: al.description || null,
          source: al.source || 'SafeGuard360', country,
          arrival_city: trip.arrival_city, trip_name: trip.trip_name,
          dedup_key: `alert-${al.id}-${trip.id}`,
          event_date: al.date_issued ? new Date(al.date_issued).toISOString() : null,
        })
      }

      if (aiScan) {
        rows.push({
          itinerary_id: trip.id, user_id: trip.user_id,
          alert_type: 'ai_brief', severity: aiScan.overall_severity || 'Medium',
          title: `AI Risk Brief: ${trip.arrival_city || country}`,
          description: JSON.stringify({ summary: aiScan.summary, key_risks: aiScan.key_risks, recommendations: aiScan.recommendations }),
          source: 'Claude AI', country, arrival_city: trip.arrival_city, trip_name: trip.trip_name,
          dedup_key: `ai-brief-${trip.id}-${today}`,
          event_date: new Date().toISOString(),
        })

        for (const risk of aiScan.risks || []) {
          const titleKey = (risk.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)
          rows.push({
            itinerary_id: trip.id, user_id: trip.user_id,
            alert_type: risk.category || 'security', severity: risk.severity || 'Medium',
            title: risk.title,
            description: risk.description + (risk.recommendation ? ` — ${risk.recommendation}` : ''),
            source: 'Claude AI', country, arrival_city: trip.arrival_city, trip_name: trip.trip_name,
            dedup_key: `ai-risk-${titleKey}-${trip.id}-${today}`,
            event_date: new Date().toISOString(),
          })
        }
      }

      allRows.push(...rows)
    }
  }

  // ── 4. Upsert all rows ────────────────────────────────────────────────────
  let inserted = []
  if (allRows.length) {
    try {
      inserted = await sbUpsert(SUPABASE_URL, SERVICE_KEY, 'trip_alerts', allRows)
    } catch (e) {
      console.error('[scan-all] upsert error:', e.message)
    }
  }

  // ── 5. Notify users about new Critical/High alerts ────────────────────────
  if (inserted.length && process.env.RESEND_API_KEY) {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000

    // Group new actionable alerts by user + trip
    const byUserTrip = {}
    for (const a of inserted) {
      if (a.alert_type === 'ai_brief') continue
      if (!['Critical', 'High'].includes(a.severity)) continue
      if (!a.created_at || new Date(a.created_at).getTime() < fiveMinAgo) continue

      // Skip if we already notified this user in this cron cycle
      const lastNotified = notifiedAt[a.user_id] || 0
      if (Date.now() - lastNotified < CACHE_TTL_MS) continue

      const key = `${a.user_id}:${a.itinerary_id}`
      if (!byUserTrip[key]) byUserTrip[key] = { userId: a.user_id, tripName: a.trip_name, city: a.arrival_city, alerts: [] }
      byUserTrip[key].alerts.push(a)
    }

    for (const { userId, tripName, city, alerts } of Object.values(byUserTrip)) {
      const profile = profileMap[userId]
      if (!profile) continue

      try {
        // Fetch auth email via service role
        const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
          signal: AbortSignal.timeout(4000),
        })
        const authUser = authRes.ok ? await authRes.json() : null
        const userEmail    = authUser?.email || profile.email || null
        const userPhone    = profile.phone || null
        const userWhatsApp = profile.whatsapp_number || null

        if (!userEmail && !userPhone && !userWhatsApp) continue

        await notifyAlert({ userEmail, userPhone, userWhatsApp, alerts, tripName, city })
        notifiedAt[userId] = Date.now()
        notifiedCount++
        console.log(`[scan-all] Notified ${userEmail || userId} — ${alerts.length} alert(s) for ${city}`)
      } catch (e) {
        console.error(`[scan-all] notify error for user ${userId}:`, e.message)
      }
    }
  }

  return res.status(200).json({
    scanned:   itineraries.length,
    inserted:  inserted.length,
    notified:  notifiedCount,
    countries: Object.keys(countryTrips).length,
  })
}

// ── City → country map (shared with trip-alert-scan) ─────────────────────────
const CITY_COUNTRY = {
  'johannesburg': 'South Africa', 'cape town': 'South Africa', 'durban': 'South Africa',
  'pretoria': 'South Africa', 'lagos': 'Nigeria', 'abuja': 'Nigeria', 'nairobi': 'Kenya',
  'mombasa': 'Kenya', 'kampala': 'Uganda', 'dar es salaam': 'Tanzania', 'accra': 'Ghana',
  'addis ababa': 'Ethiopia', 'luanda': 'Angola', 'kinshasa': 'Democratic Republic of the Congo',
  'harare': 'Zimbabwe', 'lusaka': 'Zambia', 'maputo': 'Mozambique', 'dakar': 'Senegal',
  'bamako': 'Mali', 'ouagadougou': 'Burkina Faso', 'niamey': 'Niger', 'ndjamena': 'Chad',
  'yaounde': 'Cameroon', 'douala': 'Cameroon', 'mogadishu': 'Somalia', 'juba': 'South Sudan',
  'khartoum': 'Sudan', 'cairo': 'Egypt', 'tripoli': 'Libya', 'tunis': 'Tunisia',
  'algiers': 'Algeria', 'casablanca': 'Morocco', 'rabat': 'Morocco',
  'london': 'United Kingdom', 'paris': 'France', 'berlin': 'Germany',
  'amsterdam': 'Netherlands', 'madrid': 'Spain', 'rome': 'Italy',
  'dubai': 'United Arab Emirates', 'abu dhabi': 'United Arab Emirates',
  'riyadh': 'Saudi Arabia', 'doha': 'Qatar', 'tehran': 'Iran', 'baghdad': 'Iraq',
  'beirut': 'Lebanon', 'amman': 'Jordan', 'tel aviv': 'Israel',
  'karachi': 'Pakistan', 'mumbai': 'India', 'delhi': 'India', 'new delhi': 'India',
  'beijing': 'China', 'shanghai': 'China', 'hong kong': 'Hong Kong',
  'tokyo': 'Japan', 'singapore': 'Singapore', 'bangkok': 'Thailand',
  'sydney': 'Australia', 'new york': 'United States', 'toronto': 'Canada',
  'mexico city': 'Mexico', 'bogota': 'Colombia', 'sao paulo': 'Brazil',
}

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default _handler
