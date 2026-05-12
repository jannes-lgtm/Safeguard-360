/*
-- Run in Supabase SQL editor:
-- create table if not exists trip_debriefs (
--   id uuid primary key default gen_random_uuid(),
--   trip_id uuid references itineraries(id) on delete cascade not null unique,
--   user_id uuid references auth.users(id) on delete cascade not null,
--   org_id uuid,
--   had_security_incident boolean not null default false,
--   security_incident_details text,
--   had_medical_issue boolean not null default false,
--   medical_issue_details text,
--   had_transport_issue boolean not null default false,
--   transport_issue_details text,
--   overall_safety_rating int check (overall_safety_rating between 1 and 5),
--   briefing_usefulness int check (briefing_usefulness between 1 and 5),
--   risk_assessment_accuracy int check (risk_assessment_accuracy between 1 and 5),
--   recommendations text,
--   additional_notes text,
--   submitted_at timestamptz not null default now(),
--   created_at timestamptz not null default now()
-- );
-- alter table trip_debriefs enable row level security;
-- create policy "users_own" on trip_debriefs for all using (auth.uid() = user_id);
-- create policy "org_admin_read" on trip_debriefs for select using (
--   exists (select 1 from profiles where id = auth.uid() and role = 'org_admin' and org_id = trip_debriefs.org_id)
-- );
*/

import { createClient } from '@supabase/supabase-js'
import { adapt } from './_adapter.js'

const SUPABASE_URL  = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const ANON_KEY      = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

async function getUser(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(4000),
  })
  if (!res.ok) return null
  return res.json()
}

async function _handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Missing auth token' })

  const user = await getUser(token)
  if (!user?.id) return res.status(401).json({ error: 'Invalid token' })

  const {
    trip_id,
    had_security_incident,
    security_incident_details,
    had_medical_issue,
    medical_issue_details,
    had_transport_issue,
    transport_issue_details,
    overall_safety_rating,
    briefing_usefulness,
    risk_assessment_accuracy,
    recommendations,
    additional_notes,
  } = req.body || {}

  if (!trip_id) return res.status(400).json({ error: 'trip_id is required' })
  if (!overall_safety_rating || !briefing_usefulness || !risk_assessment_accuracy) {
    return res.status(400).json({ error: 'All three ratings are required' })
  }

  const { data: trip, error: tripErr } = await sb
    .from('itineraries')
    .select('id, user_id, org_id, trip_name, arrival_city')
    .eq('id', trip_id)
    .eq('user_id', user.id)
    .single()

  if (tripErr || !trip) return res.status(404).json({ error: 'Trip not found' })

  const { data: existing } = await sb
    .from('trip_debriefs')
    .select('id')
    .eq('trip_id', trip_id)
    .single()

  if (existing) {
    return res.status(409).json({ error: 'Debrief already submitted for this trip', debrief_id: existing.id })
  }

  const { data: profile } = await sb
    .from('profiles')
    .select('email, role')
    .eq('id', user.id)
    .single()

  const { data: debrief, error: insertErr } = await sb
    .from('trip_debriefs')
    .insert({
      trip_id,
      user_id:                  user.id,
      org_id:                   trip.org_id || null,
      had_security_incident:    !!had_security_incident,
      security_incident_details: had_security_incident ? (security_incident_details || null) : null,
      had_medical_issue:        !!had_medical_issue,
      medical_issue_details:    had_medical_issue ? (medical_issue_details || null) : null,
      had_transport_issue:      !!had_transport_issue,
      transport_issue_details:  had_transport_issue ? (transport_issue_details || null) : null,
      overall_safety_rating:    Number(overall_safety_rating),
      briefing_usefulness:      Number(briefing_usefulness),
      risk_assessment_accuracy: Number(risk_assessment_accuracy),
      recommendations:          recommendations || null,
      additional_notes:         additional_notes || null,
    })
    .select('id')
    .single()

  if (insertErr) {
    console.error('[post-travel-debrief] insert error:', insertErr.message)
    return res.status(500).json({ error: insertErr.message })
  }

  try {
    await sb.from('audit_logs').insert({
      actor_id:    user.id,
      actor_email: profile?.email || user.email || null,
      actor_role:  profile?.role || null,
      action:      'debrief.submitted',
      entity_type: 'trip_debrief',
      entity_id:   debrief.id,
      description: `Post-travel debrief submitted for trip: ${trip.trip_name || trip_id}`,
      metadata: {
        trip_id,
        trip_name:                trip.trip_name,
        had_security_incident:    !!had_security_incident,
        had_medical_issue:        !!had_medical_issue,
        had_transport_issue:      !!had_transport_issue,
        overall_safety_rating:    Number(overall_safety_rating),
        briefing_usefulness:      Number(briefing_usefulness),
        risk_assessment_accuracy: Number(risk_assessment_accuracy),
      },
    })
  } catch {}

  return res.status(200).json({ ok: true, debrief_id: debrief.id })
}

export const handler = adapt(_handler)
export default handler
