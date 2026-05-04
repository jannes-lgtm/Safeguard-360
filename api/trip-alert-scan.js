/**
 * /api/trip-alert-scan.js
 * Vercel serverless function — scans external sources for alerts
 * relevant to a user's upcoming trips and writes them to trip_alerts.
 *
 * Required environment variables:
 *   SUPABASE_URL            – same value as VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY – from Supabase Settings > API
 *   SUPABASE_ANON_KEY       – from Supabase Settings > API
 *   FLIGHTAWARE_API_KEY     – optional, for flight delay alerts
 *
 * Usage:
 *   GET /api/trip-alert-scan
 *   Authorization: Bearer <supabase-jwt>
 *
 * Returns:
 *   { scanned: N, inserted: M, alerts: [...] }
 */

// ── In-memory cache: { [userId]: { ts: Date, alerts: [] } }
const cache = {}
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

// ── Severity helpers ─────────────────────────────────────────────────────────

function gdacsAlertToSeverity(level) {
  if (level === 'Red') return 'Critical'
  if (level === 'Orange') return 'High'
  return 'Medium'
}

function magnitudeToSeverity(mag) {
  if (mag >= 7) return 'Critical'
  if (mag >= 6) return 'High'
  return 'Medium'
}

// ── Minimal city → country lookup used for GDACS/USGS country matching ──────
// Keys are lowercase city names; values are country names.
const CITY_COUNTRY = {
  'johannesburg': 'South Africa', 'cape town': 'South Africa', 'durban': 'South Africa',
  'pretoria': 'South Africa', 'lagos': 'Nigeria', 'abuja': 'Nigeria', 'kano': 'Nigeria',
  'nairobi': 'Kenya', 'mombasa': 'Kenya', 'kampala': 'Uganda', 'dar es salaam': 'Tanzania',
  'accra': 'Ghana', 'kumasi': 'Ghana', 'addis ababa': 'Ethiopia', 'luanda': 'Angola',
  'kinshasa': 'Democratic Republic of the Congo', 'harare': 'Zimbabwe', 'lusaka': 'Zambia',
  'lilongwe': 'Malawi', 'maputo': 'Mozambique', 'antananarivo': 'Madagascar',
  'port louis': 'Mauritius', 'dakar': 'Senegal', 'bamako': 'Mali', 'ouagadougou': 'Burkina Faso',
  'niamey': 'Niger', 'ndjamena': "Chad", 'yaounde': 'Cameroon', 'douala': 'Cameroon',
  'libreville': 'Gabon', 'brazzaville': 'Republic of the Congo',
  'mogadishu': 'Somalia', 'juba': 'South Sudan', 'khartoum': 'Sudan',
  'cairo': 'Egypt', 'alexandria': 'Egypt', 'tripoli': 'Libya', 'tunis': 'Tunisia',
  'algiers': 'Algeria', 'casablanca': 'Morocco', 'rabat': 'Morocco',
  'london': 'United Kingdom', 'manchester': 'United Kingdom', 'edinburgh': 'United Kingdom',
  'paris': 'France', 'lyon': 'France', 'berlin': 'Germany', 'munich': 'Germany',
  'frankfurt': 'Germany', 'amsterdam': 'Netherlands', 'brussels': 'Belgium',
  'madrid': 'Spain', 'barcelona': 'Spain', 'lisbon': 'Portugal', 'rome': 'Italy',
  'milan': 'Italy', 'vienna': 'Austria', 'zurich': 'Switzerland', 'geneva': 'Switzerland',
  'stockholm': 'Sweden', 'oslo': 'Norway', 'copenhagen': 'Denmark', 'helsinki': 'Finland',
  'warsaw': 'Poland', 'prague': 'Czech Republic', 'budapest': 'Hungary',
  'bucharest': 'Romania', 'sofia': 'Bulgaria', 'athens': 'Greece',
  'istanbul': 'Turkey', 'ankara': 'Turkey', 'moscow': 'Russia', 'kyiv': 'Ukraine',
  'dubai': 'United Arab Emirates', 'abu dhabi': 'United Arab Emirates',
  'riyadh': 'Saudi Arabia', 'jeddah': 'Saudi Arabia', 'doha': 'Qatar',
  'kuwait city': 'Kuwait', 'muscat': 'Oman', 'manama': 'Bahrain',
  'tehran': 'Iran', 'baghdad': 'Iraq', 'beirut': 'Lebanon', 'amman': 'Jordan',
  'tel aviv': 'Israel', 'jerusalem': 'Israel', 'cairo': 'Egypt',
  'karachi': 'Pakistan', 'lahore': 'Pakistan', 'islamabad': 'Pakistan',
  'mumbai': 'India', 'delhi': 'India', 'new delhi': 'India', 'bangalore': 'India',
  'chennai': 'India', 'kolkata': 'India', 'hyderabad': 'India',
  'dhaka': 'Bangladesh', 'colombo': 'Sri Lanka', 'kathmandu': 'Nepal',
  'beijing': 'China', 'shanghai': 'China', 'hong kong': 'Hong Kong',
  'tokyo': 'Japan', 'osaka': 'Japan', 'seoul': 'South Korea', 'taipei': 'Taiwan',
  'singapore': 'Singapore', 'kuala lumpur': 'Malaysia', 'jakarta': 'Indonesia',
  'manila': 'Philippines', 'bangkok': 'Thailand', 'ho chi minh city': 'Vietnam',
  'hanoi': 'Vietnam', 'phnom penh': 'Cambodia', 'vientiane': 'Laos',
  'yangon': 'Myanmar', 'sydney': 'Australia', 'melbourne': 'Australia',
  'brisbane': 'Australia', 'perth': 'Australia', 'auckland': 'New Zealand',
  'new york': 'United States', 'los angeles': 'United States', 'chicago': 'United States',
  'houston': 'United States', 'miami': 'United States', 'washington': 'United States',
  'toronto': 'Canada', 'montreal': 'Canada', 'vancouver': 'Canada',
  'mexico city': 'Mexico', 'bogota': 'Colombia', 'lima': 'Peru',
  'santiago': 'Chile', 'buenos aires': 'Argentina', 'sao paulo': 'Brazil',
  'rio de janeiro': 'Brazil', 'brasilia': 'Brazil',
}

function cityToCountry(city) {
  if (!city) return null
  return CITY_COUNTRY[city.toLowerCase().trim()] || null
}

// ── Supabase REST helpers ────────────────────────────────────────────────────

function supabaseHeaders(key) {
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

async function supabaseGet(url, serviceKey, qs) {
  const fullUrl = `${url}?${new URLSearchParams(qs).toString()}`
  const res = await fetch(fullUrl, { headers: supabaseHeaders(serviceKey) })
  if (!res.ok) throw new Error(`Supabase GET ${fullUrl} → ${res.status}`)
  return res.json()
}

async function supabaseUpsert(baseUrl, serviceKey, table, rows) {
  if (!rows.length) return []
  const url = `${baseUrl}/rest/v1/${table}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(serviceKey),
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

// ── External API helpers ─────────────────────────────────────────────────────

async function fetchGDACS(country) {
  try {
    const url = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH'
    const qs = new URLSearchParams({
      eventlist: 'EQ,TC,FL,VO,DR,WF',
      alertlevel: 'Green,Orange,Red',
      limit: '100',
    })
    const res = await fetch(`${url}?${qs}`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = await res.json()
    const features = data?.features || []
    const countryLower = country.toLowerCase()
    return features.filter(f => {
      const c = (f.properties?.country || '').toLowerCase()
      return c.includes(countryLower) || countryLower.includes(c)
    })
  } catch {
    return []
  }
}

async function fetchUSGS(country) {
  try {
    const now = new Date()
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const qs = new URLSearchParams({
      format: 'geojson',
      starttime: sevenDaysAgo.toISOString().split('T')[0],
      endtime: now.toISOString().split('T')[0],
      minmagnitude: '5.0',
      orderby: 'magnitude',
      limit: '50',
    })
    const res = await fetch(
      `https://earthquake.usgs.gov/fdsnws/event/1/query?${qs}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    const features = data?.features || []
    const countryLower = country.toLowerCase()
    return features.filter(f => {
      const place = (f.properties?.place || '').toLowerCase()
      return place.includes(countryLower)
    })
  } catch {
    return []
  }
}

async function fetchFlightStatus(flightNumber, apiKey) {
  try {
    // FlightAware AeroAPI v4
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

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Env vars — graceful if missing
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const ANON_KEY     = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  const FA_KEY       = process.env.FLIGHTAWARE_API_KEY || ''

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(200).json({ scanned: 0, inserted: 0, alerts: [], warning: 'Missing SUPABASE env vars' })
  }

  // ── 1. Validate JWT ──────────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' })
  }

  let currentUser
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    })
    if (!userRes.ok) throw new Error('JWT validation failed')
    currentUser = await userRes.json()
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const userId = currentUser?.id
  if (!userId) return res.status(401).json({ error: 'Could not resolve user' })

  // ── 2. 30-min per-user cache ─────────────────────────────────────────────
  const cached = cache[userId]
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return res.status(200).json({ scanned: cached.scanned, inserted: 0, alerts: cached.alerts, cached: true })
  }

  // ── 3. Load upcoming/active itineraries ─────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  let itineraries = []
  try {
    itineraries = await supabaseGet(
      `${SUPABASE_URL}/rest/v1/itineraries`,
      SERVICE_KEY,
      {
        user_id: `eq.${userId}`,
        return_date: `gte.${today}`,
        select: 'id,trip_name,arrival_city,departure_city,flight_number,depart_date,return_date',
        order: 'depart_date.asc',
      }
    )
  } catch (e) {
    return res.status(200).json({ scanned: 0, inserted: 0, alerts: [], error: e.message })
  }

  if (!itineraries.length) {
    return res.status(200).json({ scanned: 0, inserted: 0, alerts: [] })
  }

  // ── 4. Scan each trip ────────────────────────────────────────────────────
  const allRows = []

  for (const trip of itineraries) {
    try {
      const country = cityToCountry(trip.arrival_city) || trip.arrival_city
      if (!country) continue

      // ── 4a. GDACS ────────────────────────────────────────────────────────
      const gdacsEvents = await fetchGDACS(country)
      for (const ev of gdacsEvents) {
        const p = ev.properties || {}
        const eventId = p.eventid || p.eventId || ev.id
        const dedupKey = `gdacs-${eventId}-${trip.id}`
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
          dedup_key: dedupKey,
          event_date: p.fromdate ? new Date(p.fromdate).toISOString() : null,
        })
      }

      // ── 4b. USGS earthquakes ─────────────────────────────────────────────
      const quakes = await fetchUSGS(country)
      for (const q of quakes) {
        const p = q.properties || {}
        const mag = p.mag || 0
        const quakeId = q.id
        const dedupKey = `usgs-${quakeId}-${trip.id}`
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
          dedup_key: dedupKey,
          event_date: p.time ? new Date(p.time).toISOString() : null,
        })
      }

      // ── 4c. Internal Supabase alerts table ───────────────────────────────
      let internalAlerts = []
      try {
        internalAlerts = await supabaseGet(
          `${SUPABASE_URL}/rest/v1/alerts`,
          SERVICE_KEY,
          {
            status: 'eq.Active',
            country: `ilike.%${country}%`,
            select: 'id,title,description,severity,alert_type,country,source,date_issued',
          }
        )
      } catch { /* non-critical */ }

      for (const al of internalAlerts) {
        const dedupKey = `alert-${al.id}-${trip.id}`
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
          dedup_key: dedupKey,
          event_date: al.date_issued ? new Date(al.date_issued).toISOString() : null,
        })
      }

      // ── 4d. FlightAware (optional) ───────────────────────────────────────
      if (trip.flight_number && FA_KEY) {
        const flight = await fetchFlightStatus(trip.flight_number, FA_KEY)
        if (flight) {
          const departDelay = flight.departure_delay || 0 // seconds
          const cancelled = flight.cancelled || false
          const departDateStr = trip.depart_date

          if (cancelled || departDelay > 45 * 60) {
            const dedupKey = `flight-${trip.flight_number}-${departDateStr}-${trip.id}`
            const title = cancelled
              ? `Flight ${trip.flight_number} Cancelled`
              : `Flight ${trip.flight_number} Delayed ${Math.round(departDelay / 60)} mins`
            allRows.push({
              itinerary_id: trip.id,
              user_id: userId,
              alert_type: 'flight',
              severity: cancelled ? 'High' : 'Medium',
              title,
              description: cancelled
                ? `Your flight ${trip.flight_number} for the ${trip.trip_name} trip has been cancelled.`
                : `Your flight ${trip.flight_number} is delayed by ${Math.round(departDelay / 60)} minutes.`,
              source: 'FlightAware',
              source_url: `https://flightaware.com/live/flight/${encodeURIComponent(trip.flight_number)}`,
              country,
              arrival_city: trip.arrival_city,
              flight_number: trip.flight_number,
              trip_name: trip.trip_name,
              dedup_key: dedupKey,
              event_date: trip.depart_date ? new Date(trip.depart_date).toISOString() : null,
            })
          }
        }
      }
    } catch (err) {
      // Per-trip error isolation — don't abort other trips
      console.error(`trip-alert-scan: error processing trip ${trip.id}:`, err.message)
    }
  }

  // ── 5. Upsert into trip_alerts ───────────────────────────────────────────
  let inserted = []
  if (allRows.length > 0) {
    try {
      inserted = await supabaseUpsert(SUPABASE_URL, SERVICE_KEY, 'trip_alerts', allRows)
    } catch (e) {
      console.error('trip-alert-scan: upsert error:', e.message)
    }
  }

  // Store in cache
  cache[userId] = { ts: Date.now(), scanned: itineraries.length, alerts: inserted }

  return res.status(200).json({
    scanned: itineraries.length,
    inserted: inserted.length,
    alerts: inserted,
  })
}
