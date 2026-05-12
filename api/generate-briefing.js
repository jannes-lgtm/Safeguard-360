/**
 * /api/generate-briefing
 *
 * Generates an ISO 31030:2021-aligned Pre-Travel Security Briefing for a trip.
 * Called automatically after trip creation, or manually triggered.
 *
 * POST /api/generate-briefing
 *   Authorization: Bearer <supabase-jwt>
 *   Body: { trip_id: uuid }
 *
 * Returns: { ok, briefing_id, ref }
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { adapt } from './_adapter.js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const SUPABASE_URL = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const ANON_KEY     = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

async function getUser(token) {
  const res = await fetch(`${SUPABASE_URL()}/auth/v1/user`, {
    headers: { apikey: ANON_KEY(), Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(4000),
  })
  if (!res.ok) return null
  return res.json()
}

function generateRef() {
  const d = new Date()
  const yr = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `SG360-PTB-${yr}${mo}-${rand}`
}

async function _handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI not configured' })

  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Missing auth token' })

  const user = await getUser(token)
  if (!user?.id) return res.status(401).json({ error: 'Invalid token' })

  const { trip_id } = req.body || {}
  if (!trip_id) return res.status(400).json({ error: 'trip_id required' })

  // ── Fetch trip ───────────────────────────────────────────────────────────────
  const { data: trip, error: tripErr } = await supabaseAdmin
    .from('itineraries')
    .select('*')
    .eq('id', trip_id)
    .single()

  if (tripErr || !trip) return res.status(404).json({ error: 'Trip not found' })
  if (trip.user_id !== user.id) {
    // Allow org admins to generate for their org's travellers
    const { data: admin } = await supabaseAdmin.from('profiles')
      .select('role, org_id').eq('id', user.id).single()
    const allowed = admin?.role === 'developer' ||
      (admin?.role && ['admin','org_admin'].includes(admin.role) && admin?.org_id === trip.org_id)
    if (!allowed) return res.status(403).json({ error: 'Forbidden' })
  }

  // Check if a current briefing already exists for this trip
  const { data: existing } = await supabaseAdmin
    .from('travel_briefings')
    .select('id, document_ref, acknowledged_at')
    .eq('trip_id', trip_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing && !existing.acknowledged_at) {
    return res.status(200).json({ ok: true, briefing_id: existing.id, ref: existing.document_ref, already_exists: true })
  }

  // ── Fetch supporting data ────────────────────────────────────────────────────
  const [profileRes, orgRes, alertRes, riskRes] = await Promise.allSettled([
    supabaseAdmin.from('profiles')
      .select('full_name, email, phone, role, org_id')
      .eq('id', trip.user_id).single(),
    trip.org_id
      ? supabaseAdmin.from('organisations').select('name, industry').eq('id', trip.org_id).single()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from('alerts')
      .select('title, severity, description, country, alert_type')
      .eq('status', 'Active')
      .ilike('country', `%${trip.arrival_city || ''}%`)
      .order('severity').limit(10),
    fetch(`${SUPABASE_URL().replace('/rest/v1','')}/api/country-risk?country=${encodeURIComponent(trip.arrival_city || '')}`)
      .then(r => r.ok ? r.json() : null).catch(() => null),
  ])

  const profile  = profileRes.status === 'fulfilled' ? profileRes.value?.data : null
  const org      = orgRes.status === 'fulfilled' ? orgRes.value?.data : null
  const alerts   = alertRes.status === 'fulfilled' ? alertRes.value?.data || [] : []
  const riskData = riskRes.status === 'fulfilled' ? riskRes.value : null

  const traveller  = profile?.full_name || user.email || 'Traveller'
  const orgName    = org?.name || 'Independent Traveller'
  const destination = trip.arrival_city || 'the destination'
  const country    = trip.arrival_city || 'Unknown'
  const riskLevel  = riskData?.severity || trip.risk_level || 'Medium'
  const departDate = trip.depart_date || 'TBD'
  const returnDate = trip.return_date || 'TBD'
  const flightRef  = trip.flight_number || null
  const hotel      = trip.hotel_name || null
  const purpose    = trip.trip_purpose || 'Business travel'
  const docRef     = generateRef()

  // ── AI briefing generation ───────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const alertSummary = alerts.length
    ? alerts.map(a => `- [${a.severity}] ${a.title}: ${a.description || ''}`).join('\n')
    : 'No active alerts for this destination at time of briefing.'

  const systemPrompt = `You are a certified travel security consultant generating an ISO 31030:2021-compliant Pre-Travel Security Briefing.
Write in formal, professional language appropriate for a legally defensible document.
Be specific, practical, and actionable. Do not use generic filler.
Return a JSON object with the exact structure requested — no markdown, no extra text, just valid JSON.`

  const userPrompt = `Generate a Pre-Travel Security Briefing with the following inputs:

TRIP DETAILS:
- Traveller: ${traveller}
- Organisation: ${orgName}
- Destination: ${destination}
- Departure: ${departDate}
- Return: ${returnDate}
- Purpose: ${purpose}
${flightRef ? `- Flight: ${flightRef}` : ''}
${hotel ? `- Accommodation: ${hotel}` : ''}

RISK LEVEL: ${riskLevel}

ACTIVE ALERTS:
${alertSummary}

${riskData?.summary ? `DESTINATION INTELLIGENCE:\n${riskData.summary}` : ''}

Return this exact JSON structure (all values must be strings or arrays of strings):
{
  "executive_summary": "2-3 sentence risk summary for ${destination} at ${riskLevel} level",
  "destination_overview": "Paragraph describing ${destination}'s current security, political, and social environment",
  "security_threats": ["Specific threat 1 relevant to ${destination}", "Specific threat 2", "Specific threat 3"],
  "health_medical": "Paragraph covering health risks, recommended vaccinations, medical facility availability, and emergency medical advice for ${destination}",
  "legal_regulatory": "Paragraph covering local laws, entry requirements, currency regulations, and any restrictions relevant to ${destination}",
  "communication_protocols": "Paragraph describing required check-in schedule, emergency contact procedures, and communication requirements per organisational duty of care",
  "emergency_procedures": ["Step 1 for emergency response", "Step 2", "Step 3", "Step 4", "Step 5"],
  "pre_departure_checklist": ["Checklist item 1", "Checklist item 2", "Checklist item 3", "Checklist item 4", "Checklist item 5", "Checklist item 6", "Checklist item 7", "Checklist item 8"],
  "in_country_guidance": "Paragraph with practical day-to-day safety advice for ${destination} including transport, accommodation security, and situational awareness",
  "prohibited_activities": ["Activity or area to avoid 1", "Activity or area to avoid 2", "Activity or area to avoid 3"],
  "traveller_obligations": "Paragraph describing the traveller's legal and contractual obligations under duty of care, including reporting requirements and compliance with this briefing"
}`

  let sections
  try {
    const aiRes = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages:   [{ role: 'user', content: userPrompt }],
      system:     systemPrompt,
    })
    const raw = aiRes.content[0]?.text || '{}'
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/,'').trim()
    sections = JSON.parse(cleaned)
  } catch (err) {
    console.error('[generate-briefing] AI error:', err.message)
    return res.status(500).json({ error: 'Failed to generate briefing content' })
  }

  // ── Save to database ─────────────────────────────────────────────────────────
  const { data: briefing, error: saveErr } = await supabaseAdmin
    .from('travel_briefings')
    .insert({
      trip_id,
      user_id:     trip.user_id,
      org_id:      trip.org_id || null,
      document_ref: docRef,
      iso_standard: 'ISO 31030:2021',
      destination:  destination,
      country:      country,
      depart_date:  departDate,
      return_date:  returnDate,
      risk_level:   riskLevel,
      traveller_name: traveller,
      org_name:     orgName,
      sections,
      generated_by: 'ai',
    })
    .select('id, document_ref')
    .single()

  if (saveErr) {
    console.error('[generate-briefing] DB save error:', saveErr)
    return res.status(500).json({ error: 'Failed to save briefing' })
  }

  // Audit log
  await supabaseAdmin.from('audit_log').insert({
    user_id:    user.id,
    action:     'briefing_generated',
    target_id:  briefing.id,
    details:    { trip_id, document_ref: docRef, destination },
  }).catch(() => {})

  return res.status(200).json({ ok: true, briefing_id: briefing.id, ref: briefing.document_ref })
}

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default handler
