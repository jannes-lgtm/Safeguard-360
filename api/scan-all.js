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

import { inngest } from './_inngest.js'
import { CITY_COUNTRY } from './_cityCountry.js'
import { createLogger } from './_logger.js'

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

async function _handler(req, res) {
  const log = createLogger(req, 'scan-all')
  log.info('cron started')
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const AI_KEY       = process.env.ANTHROPIC_API_KEY || ''
  const SCAN_SECRET  = process.env.SCAN_SECRET || null

  // Auth — either the Vercel cron header or Bearer secret
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  const isCron = req.headers['x-vercel-cron'] === '1'
  // Require SCAN_SECRET to be configured — empty string is NOT secure
  if (!isCron) {
    if (!SCAN_SECRET) {
      console.error('[scan-all] SCAN_SECRET env var not set — refusing unauthenticated access')
      return res.status(503).json({ error: 'SCAN_SECRET not configured on server' })
    }
    if (bearer !== SCAN_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
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

  // ── 3. Fan-out: fire one Inngest event per destination country ───────────
  //    Each event triggers an independent retryable scan-country job.
  //    scan-all itself returns in <5s — no more Vercel timeout risk.
  const countries = Object.keys(countryTrips)

  await inngest.send(
    countries.map(country => ({
      name: 'safeguard360/scan.country',
      data: {
        country,
        trips:       countryTrips[country],
        supabaseUrl: SUPABASE_URL,
        serviceKey:  SERVICE_KEY,
        aiKey:       AI_KEY || null,
        today,
      },
    }))
  )

  log.info('cron fanned out', {
    itineraries: itineraries.length,
    countries:   countries.length,
  })
  log.done(200)
  return res.status(200).json({
    fanned_out:  countries.length,
    itineraries: itineraries.length,
    countries,
  })
}

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default _handler
