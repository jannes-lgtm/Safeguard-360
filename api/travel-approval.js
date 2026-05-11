/**
 * /api/travel-approval.js
 * Approve or reject a travel request.
 * On approval: auto-generates training assignments + randomised check-in schedule.
 *
 * ── Required SQL (run once in Supabase SQL editor) ────────────────────────────
 *
 * -- 1. Add approval columns to itineraries
 * alter table itineraries
 *   add column if not exists approval_status text not null default 'pending',
 *   add column if not exists approval_required boolean not null default true,
 *   add column if not exists approved_by uuid references auth.users(id),
 *   add column if not exists approved_at timestamptz,
 *   add column if not exists approval_notes text,
 *   add column if not exists submitted_at timestamptz;
 *
 * -- 2. Trip training assignments
 * create table if not exists trip_training_assignments (
 *   id uuid primary key default gen_random_uuid(),
 *   trip_id uuid references itineraries(id) on delete cascade not null,
 *   user_id uuid references auth.users(id) on delete cascade not null,
 *   module_order int not null,
 *   module_name text not null,
 *   required_before_travel boolean not null default true,
 *   completed boolean not null default false,
 *   completed_at timestamptz,
 *   created_at timestamptz not null default now(),
 *   unique(trip_id, module_order)
 * );
 * alter table trip_training_assignments enable row level security;
 * create policy "users_own" on trip_training_assignments for all using (auth.uid() = user_id);
 * create policy "admin_all" on trip_training_assignments for all using (
 *   exists (select 1 from profiles where id = auth.uid() and role = 'admin')
 * );
 *
 * -- 3. Scheduled check-ins
 * create table if not exists scheduled_checkins (
 *   id uuid primary key default gen_random_uuid(),
 *   trip_id uuid references itineraries(id) on delete cascade not null,
 *   user_id uuid references auth.users(id) on delete cascade not null,
 *   checkin_type text not null check (checkin_type in ('arrival','random')),
 *   due_at timestamptz not null,
 *   window_hours int not null default 12,
 *   completed boolean not null default false,
 *   completed_at timestamptz,
 *   missed boolean not null default false,
 *   label text,
 *   created_at timestamptz not null default now()
 * );
 * alter table scheduled_checkins enable row level security;
 * create policy "users_own" on scheduled_checkins for all using (auth.uid() = user_id);
 * create policy "admin_all" on scheduled_checkins for all using (
 *   exists (select 1 from profiles where id = auth.uid() and role = 'admin')
 * );
 */

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// ── Training modules required per risk level ──────────────────────────────────
const RISK_MODULES = {
  Critical: [
    { order: 1, name: 'ISO 31000 Risk Management Fundamentals' },
    { order: 2, name: 'Travel Risk Assessment' },
    { order: 3, name: 'Traveller Responsibilities & Protocols' },
    { order: 4, name: 'Emergency Response & Evacuation' },
    { order: 5, name: 'Incident Reporting & Post-Travel Debrief' },
  ],
  High: [
    { order: 1, name: 'ISO 31000 Risk Management Fundamentals' },
    { order: 2, name: 'Travel Risk Assessment' },
    { order: 3, name: 'Traveller Responsibilities & Protocols' },
    { order: 4, name: 'Emergency Response & Evacuation' },
  ],
  Medium: [
    { order: 1, name: 'ISO 31000 Risk Management Fundamentals' },
    { order: 2, name: 'Travel Risk Assessment' },
    { order: 3, name: 'Traveller Responsibilities & Protocols' },
  ],
  Low: [
    { order: 1, name: 'ISO 31000 Risk Management Fundamentals' },
    { order: 2, name: 'Travel Risk Assessment' },
  ],
}

// ── Generate randomised check-in schedule ─────────────────────────────────────
function generateSchedule(trip) {
  const start       = new Date(trip.depart_date)
  const end         = new Date(trip.return_date)
  const durationMs  = end - start
  const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24))
  const schedule    = []

  // Arrival check-in: due 6 hours after departure day start
  const arrivalDue = new Date(start)
  arrivalDue.setHours(20, 0, 0, 0)  // 8pm on departure day (traveller should have landed)
  schedule.push({
    checkin_type: 'arrival',
    due_at:       arrivalDue.toISOString(),
    window_hours: 8,
    label:        'Arrival Check-in',
  })

  // Number of random check-ins based on trip length
  const numRandom =
    durationDays <= 2  ? 0 :
    durationDays <= 4  ? 1 :
    durationDays <= 7  ? 2 :
    durationDays <= 14 ? Math.floor(durationDays / 3) :
    Math.floor(durationDays / 2.5)

  // Space evenly with randomness, skip first and last day
  if (numRandom > 0 && durationDays > 2) {
    const usableDays  = durationDays - 2  // skip first + last
    const spacing     = usableDays / (numRandom + 1)

    for (let i = 1; i <= numRandom; i++) {
      // Base day + ±20% jitter
      const dayOffset = 1 + spacing * i + (Math.random() * spacing * 0.4 - spacing * 0.2)
      const due       = new Date(start)
      due.setDate(due.getDate() + Math.floor(dayOffset))
      // Random time between 08:00 and 20:00
      due.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0)
      schedule.push({
        checkin_type: 'random',
        due_at:       due.toISOString(),
        window_hours: 12,
        label:        `Check-in ${i} of ${numRandom}`,
      })
    }
  }

  return schedule
}

// ── Also check training_records to mark already-completed modules ─────────────
async function getCompletedModules(userId) {
  const { data } = await supabaseAdmin
    .from('training_records')
    .select('completed, training_modules(module_order)')
    .eq('user_id', userId)
    .eq('completed', true)
  return new Set((data || []).map(r => r.training_modules?.module_order).filter(Boolean))
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function _handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Verify caller is authenticated admin
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: prof } = await supabaseAdmin.from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!['admin', 'developer', 'org_admin'].includes(prof?.role)) return res.status(403).json({ error: 'Admin or developer only' })

  const { action, trip_id, notes } = req.body
  if (!trip_id || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'trip_id and action (approve|reject) required' })
  }

  // Load the trip
  const { data: trip, error: tripErr } = await supabaseAdmin
    .from('itineraries')
    .select('*, profiles!user_id(org_id)')
    .eq('id', trip_id)
    .single()
  if (tripErr || !trip) return res.status(404).json({ error: 'Trip not found' })

  // Org admins may only approve trips belonging to their own organisation
  if (prof?.role === 'org_admin') {
    const tripOrgId = trip.profiles?.org_id
    if (!prof.org_id || tripOrgId !== prof.org_id) {
      return res.status(403).json({ error: 'You can only approve trips for your own organisation' })
    }
  }

  // ── REJECT ────────────────────────────────────────────────────────────────
  if (action === 'reject') {
    await supabaseAdmin.from('itineraries').update({
      approval_status: 'rejected',
      approval_notes:  notes || null,
      approved_by:     user.id,
      approved_at:     new Date().toISOString(),
    }).eq('id', trip_id)

    return res.json({ ok: true, action: 'rejected' })
  }

  // ── APPROVE ───────────────────────────────────────────────────────────────
  await supabaseAdmin.from('itineraries').update({
    approval_status: 'approved',
    approval_notes:  notes || null,
    approved_by:     user.id,
    approved_at:     new Date().toISOString(),
  }).eq('id', trip_id)

  // 1. Assign training modules based on risk level
  const riskLevel  = trip.risk_level || 'Medium'
  const modules    = RISK_MODULES[riskLevel] || RISK_MODULES.Medium
  const completed  = await getCompletedModules(trip.user_id)

  const assignments = modules.map(m => ({
    trip_id:               trip_id,
    user_id:               trip.user_id,
    module_order:          m.order,
    module_name:           m.name,
    required_before_travel: true,
    completed:             completed.has(m.order),
    completed_at:          completed.has(m.order) ? new Date().toISOString() : null,
  }))

  // Upsert — don't overwrite if already assigned
  await supabaseAdmin
    .from('trip_training_assignments')
    .upsert(assignments, { onConflict: 'trip_id,module_order', ignoreDuplicates: true })

  // 2. Generate check-in schedule
  const schedule = generateSchedule(trip)
  const checkinRows = schedule.map(s => ({
    trip_id:      trip_id,
    user_id:      trip.user_id,
    checkin_type: s.checkin_type,
    due_at:       s.due_at,
    window_hours: s.window_hours,
    label:        s.label,
  }))

  // Delete any existing schedule for this trip (re-approve scenario)
  await supabaseAdmin.from('scheduled_checkins').delete().eq('trip_id', trip_id)
  await supabaseAdmin.from('scheduled_checkins').insert(checkinRows)

  return res.json({
    ok:          true,
    action:      'approved',
    modules:     modules.length,
    checkins:    checkinRows.length,
    schedule:    checkinRows.map(c => ({ type: c.checkin_type, due: c.due_at, label: c.label })),
  })
}

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default handler
