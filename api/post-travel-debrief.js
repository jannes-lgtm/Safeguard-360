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
import { sendEmail } from './_notify.js'
import { adapt } from './_adapter.js'

const SUPABASE_URL  = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const ANON_KEY      = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const APP_URL       = process.env.APP_URL || 'https://www.risk360.co'

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
    .select('full_name, email, role')
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

  // Notify org admin(s) if this is an org traveller
  if (trip.org_id) {
    try {
      const { data: orgAdmins } = await sb
        .from('profiles')
        .select('full_name, email')
        .eq('org_id', trip.org_id)
        .eq('role', 'org_admin')

      const travName = profile?.full_name || profile?.email || 'A traveller'
      const hasIncident = !!had_security_incident || !!had_medical_issue || !!had_transport_issue

      const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
  <tr><td style="background:#0118A1;padding:24px 28px;border-radius:10px 10px 0 0;">
    <p style="margin:0;font-size:20px;font-weight:800;color:#fff;">Safeguard 360</p>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.7);">Post-Travel Debrief Submitted</p>
  </td></tr>
  <tr><td style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">

    ${hasIncident ? `
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0;font-size:14px;font-weight:700;color:#DC2626;">⚠️ One or more incidents were reported — review required</p>
    </div>` : `
    <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0;font-size:14px;font-weight:700;color:#15803D;">✓ Post-travel debrief submitted</p>
    </div>`}

    <p style="margin:0 0 20px;font-size:13px;color:#374151;line-height:1.6;">
      <strong>${travName}</strong> has submitted a post-travel debrief for <strong>${trip.trip_name}</strong> to <strong>${trip.arrival_city || 'their destination'}</strong>.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;margin-bottom:20px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 10px;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.08em;">Incident Summary</p>
        <p style="margin:0;font-size:13px;color:#111827;line-height:2;">
          Security incident: <strong style="color:${had_security_incident ? '#DC2626' : '#059669'}">${had_security_incident ? 'Yes' : 'No'}</strong><br/>
          Medical issue: <strong style="color:${had_medical_issue ? '#DC2626' : '#059669'}">${had_medical_issue ? 'Yes' : 'No'}</strong><br/>
          Transport / accommodation issue: <strong style="color:${had_transport_issue ? '#DC2626' : '#059669'}">${had_transport_issue ? 'Yes' : 'No'}</strong>
        </p>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 10px;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.08em;">Ratings</p>
        <p style="margin:0;font-size:13px;color:#111827;line-height:2;">
          Overall safety: <strong>${overall_safety_rating}/5</strong><br/>
          Briefing usefulness: <strong>${briefing_usefulness}/5</strong><br/>
          Risk assessment accuracy: <strong>${risk_assessment_accuracy}/5</strong>
        </p>
      </td></tr>
    </table>

    <div style="text-align:center;margin-bottom:20px;">
      <a href="${APP_URL}/approvals"
        style="display:inline-block;background:#AACC00;color:#0118A1;text-decoration:none;font-weight:700;font-size:14px;padding:14px 32px;border-radius:10px;">
        View in Control Room →
      </a>
    </div>

    <p style="margin:0;font-size:11px;color:#9CA3AF;">
      This notification was sent automatically by Safeguard 360 when ${travName} submitted their post-travel debrief.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

      await Promise.allSettled(
        (orgAdmins || []).filter(a => a.email).map(admin =>
          sendEmail(
            admin.email,
            `${hasIncident ? '⚠️ Incident reported' : '✓ Debrief submitted'} — ${trip.trip_name} (${travName})`,
            html
          )
        )
      )
    } catch (err) {
      console.error('[post-travel-debrief] org admin notify failed:', err.message)
    }
  }

  return res.status(200).json({ ok: true, debrief_id: debrief.id })
}

export const handler = adapt(_handler)
export default handler
