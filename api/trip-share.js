/**
 * GET /api/trip-share?token=xxx&passcode=123456
 * Public endpoint — no auth required.
 * Verifies share token + passcode, returns safe trip data.
 */
import { adapt } from './_adapter.js'
import { getSupabaseAdmin } from './_supabase.js'
import crypto from 'crypto'

function safeEqual(a, b) {
  // Constant-time string comparison — prevents timing attacks on passcode brute-force
  if (!a || !b || a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

async function _handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  let supabaseAdmin
  try { supabaseAdmin = getSupabaseAdmin() } catch (e) {
    return res.status(503).json({ error: e.message })
  }

  const { token, passcode } = req.query
  if (!token || !passcode) return res.status(400).json({ error: 'token and passcode are required' })

  const { data: trip } = await supabaseAdmin
    .from('itineraries')
    .select('id, trip_name, departure_city, arrival_city, depart_date, return_date, flight_number, hotel_name, meetings, status, risk_level, share_passcode, user_id')
    .eq('share_token', token)
    .single()

  if (!trip) return res.status(404).json({ error: 'Trip not found' })
  if (!safeEqual(trip.share_passcode, passcode)) return res.status(401).json({ error: 'Incorrect passcode' })

  // Load traveller name (no sensitive data)
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name')
    .eq('id', trip.user_id)
    .single()

  const { share_passcode: _, user_id: __, ...safeTripData } = trip
  return res.json({ ok: true, trip: safeTripData, traveller_name: profile?.full_name || null })
}

export const handler = adapt(_handler)
export default handler
