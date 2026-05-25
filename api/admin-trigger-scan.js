/**
 * /api/admin-trigger-scan
 *
 * Admin-only endpoint to manually trigger a full scan-all fan-out.
 * Authenticates via the user's Supabase JWT (must be developer or admin role).
 * Fires the same Inngest events as the cron — safe to call at any time.
 */

import { inngest } from './_inngest.js'
import { CITY_COUNTRY } from './_cityCountry.js'

function sbHeaders(key) {
  return { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
}

async function sbGet(baseUrl, key, table, qs) {
  const url = `${baseUrl}/rest/v1/${table}?${new URLSearchParams(qs)}`
  const res  = await fetch(url, { headers: sbHeaders(key) })
  if (!res.ok) throw new Error(`Supabase GET ${table} → ${res.status}`)
  return res.json()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const AI_KEY       = process.env.ANTHROPIC_API_KEY || ''

  // ── Auth: verify caller is a developer or admin ───────────────────────────
  const jwt = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return res.status(401).json({ error: 'No token' })

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  })
  if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' })
  const { id: userId } = await userRes.json()

  const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role`, {
    headers: sbHeaders(SERVICE_KEY),
  })
  const [prof] = profRes.ok ? await profRes.json() : [{}]
  if (!['developer', 'admin'].includes(prof?.role)) {
    return res.status(403).json({ error: 'Forbidden — developer/admin only' })
  }

  // ── Fetch active itineraries ──────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  const itineraries = await sbGet(SUPABASE_URL, SERVICE_KEY, 'itineraries', {
    return_date: `gte.${today}`,
    select: 'id,user_id,trip_name,arrival_city,depart_date,return_date',
    order: 'depart_date.asc',
  }).catch(() => [])

  if (!itineraries.length) {
    return res.status(200).json({ fanned_out: 0, message: 'No active itineraries to scan' })
  }

  // ── Group by country ──────────────────────────────────────────────────────
  const countryTrips = {}
  for (const trip of itineraries) {
    const country = trip.arrival_city
      ? (CITY_COUNTRY[trip.arrival_city.toLowerCase().trim()] || trip.arrival_city)
      : null
    if (!country) continue
    if (!countryTrips[country]) countryTrips[country] = []
    countryTrips[country].push({ ...trip, country })
  }

  const countries = Object.keys(countryTrips)
  if (!countries.length) return res.status(200).json({ fanned_out: 0, message: 'No mappable destinations' })

  // ── Fan out to Inngest ────────────────────────────────────────────────────
  await inngest.send(
    countries.map(country => ({
      name: 'safeguard360/scan.country',
      data: { country, trips: countryTrips[country], supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY, aiKey: AI_KEY || null, today },
    }))
  )

  return res.status(200).json({ fanned_out: countries.length, itineraries: itineraries.length, countries })
}
