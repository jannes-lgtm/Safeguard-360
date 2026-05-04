// Check-In Page — scheduled safety confirmations
// Required Supabase table:
// create table staff_checkins (
//   id uuid primary key default gen_random_uuid(),
//   user_id uuid references auth.users(id) on delete cascade,
//   full_name text,
//   status text not null default 'safe' check (status in ('safe','distress')),
//   latitude decimal(10,8), longitude decimal(11,8),
//   location_label text,
//   message text,
//   trip_name text, arrival_city text,
//   interval_hours int,
//   next_checkin_due timestamptz,
//   created_at timestamptz not null default now()
// );
// alter table staff_checkins enable row level security;
// create policy "users_own"  on staff_checkins for all using (auth.uid() = user_id);
// create policy "admin_all"  on staff_checkins for all using (
//   exists (select 1 from profiles where id = auth.uid() and role = 'admin')
// );

import { useEffect, useState } from 'react'
import {
  CheckCircle, Clock, AlertCircle, MapPin, Navigation,
  RefreshCw, User, ChevronDown, ChevronUp, Calendar,
  Shield
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const INTERVALS = [
  { hours: 4,  label: 'Every 4 hours'  },
  { hours: 8,  label: 'Every 8 hours'  },
  { hours: 12, label: 'Every 12 hours' },
  { hours: 24, label: 'Every 24 hours' },
]

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}

function timeAgo(d) {
  if (!d) return null
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function overdueMins(due) {
  if (!due) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(due).getTime()) / 60000))
}

// ── Admin: staff row ──────────────────────────────────────────────────────────
function StaffCheckinRow({ staff }) {
  const [open, setOpen] = useState(false)
  const last   = staff.lastCheckin
  const due    = last?.next_checkin_due
  const late   = due ? overdueMins(due) : 0
  const isOver = late > 0

  return (
    <div className={`border rounded-[8px] overflow-hidden ${isOver ? 'border-red-200 bg-red-50/30' : 'border-gray-200 bg-white'}`}>
      <button className="w-full flex items-center gap-3 px-4 py-3" onClick={() => setOpen(p => !p)}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ background: BRAND_BLUE }}>
          {(staff.full_name || staff.email || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-gray-900">{staff.full_name || staff.email}</p>
          {last ? (
            <p className={`text-xs ${isOver ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              Last check-in: {timeAgo(last.created_at)}
              {isOver && ` · Overdue by ${late >= 60 ? `${Math.floor(late/60)}h ${late%60}m` : `${late}m`}`}
            </p>
          ) : (
            <p className="text-xs text-gray-400 italic">No check-ins yet</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {last ? (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              isOver ? 'bg-red-100 border-red-300 text-red-700' :
              last.status === 'distress' ? 'bg-amber-100 border-amber-300 text-amber-700' :
              'bg-green-100 border-green-300 text-green-700'
            }`}>
              {isOver ? '⚠️ Overdue' : last.status === 'distress' ? '🟡 Distress' : '✅ Safe'}
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-500">No data</span>
          )}
          {open ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
        </div>
      </button>

      {open && last && (
        <div className="px-4 pb-3 space-y-1.5 border-t border-gray-100 pt-3">
          {last.trip_name && <p className="text-xs text-gray-600"><span className="font-medium">Trip:</span> {last.trip_name} · {last.arrival_city}</p>}
          {last.location_label && (
            <a href={`https://maps.google.com/?q=${last.latitude},${last.longitude}`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs text-[#0118A1] flex items-center gap-1 hover:underline font-medium">
              <Navigation size={9}/>View on map
            </a>
          )}
          {last.message && <p className="text-xs text-gray-500 italic">"{last.message}"</p>}
          {due && <p className="text-xs text-gray-500 flex items-center gap-1"><Clock size={9}/>Next due: {fmtDate(due)}</p>}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CheckIn() {
  const [profile, setProfile]       = useState(null)
  const [activeTrip, setActiveTrip] = useState(null)
  const [isAdmin, setIsAdmin]       = useState(false)
  const [checkins, setCheckins]     = useState([])      // my check-ins
  const [staffList, setStaffList]   = useState([])      // admin view
  const [loading, setLoading]       = useState(true)

  // Check-in flow
  const [checking, setChecking]     = useState(false)
  const [message, setMessage]       = useState('')
  const [interval, setInterval2]    = useState(8)       // hours
  const [gpsPos, setGpsPos]         = useState(null)
  const [gpsErr, setGpsErr]         = useState(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [success, setSuccess]       = useState(false)

  const captureGPS = () => {
    if (!navigator.geolocation) return
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      p => { setGpsPos(p.coords); setGpsLoading(false) },
      e => { setGpsErr(e.message); setGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  const loadData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = new Date().toISOString().split('T')[0]
    const [{ data: prof }, { data: trip }, { data: myCheckins }, { data: allCheckins }, { data: profiles }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('itineraries').select('*')
        .eq('user_id', user.id).lte('depart_date', today).gte('return_date', today)
        .limit(1).single(),
      supabase.from('staff_checkins').select('*')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('staff_checkins').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*'),
    ])

    const role = prof?.role || user.app_metadata?.role || 'traveller'
    setIsAdmin(role === 'admin')
    setProfile({ ...prof, id: user.id, email: user.email })
    setActiveTrip(trip || null)
    setCheckins(myCheckins || [])

    // Build staff list with last check-in
    if (role === 'admin' && profiles) {
      const checkinMap = {}
      for (const c of allCheckins || []) {
        if (!checkinMap[c.user_id]) checkinMap[c.user_id] = c
      }
      const list = profiles.map(p => ({ ...p, lastCheckin: checkinMap[p.id] || null }))
      list.sort((a, b) => {
        const aOver = a.lastCheckin?.next_checkin_due && overdueMins(a.lastCheckin.next_checkin_due) > 0
        const bOver = b.lastCheckin?.next_checkin_due && overdueMins(b.lastCheckin.next_checkin_due) > 0
        if (aOver && !bOver) return -1
        if (!aOver && bOver) return 1
        if (!a.lastCheckin && b.lastCheckin) return 1
        if (a.lastCheckin && !b.lastCheckin) return -1
        return (a.full_name || '').localeCompare(b.full_name || '')
      })
      setStaffList(list)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
    captureGPS()  // Start capturing GPS on mount
  }, [])

  const doCheckIn = async () => {
    setChecking(true)
    const { data: { user } } = await supabase.auth.getUser()
    const nextDue = new Date(Date.now() + interval * 3600000).toISOString()

    await supabase.from('staff_checkins').insert({
      user_id: user.id,
      full_name: profile?.full_name || profile?.email || 'Unknown',
      status: 'safe',
      latitude: gpsPos?.latitude || null,
      longitude: gpsPos?.longitude || null,
      location_label: gpsPos ? `${gpsPos.latitude.toFixed(5)}, ${gpsPos.longitude.toFixed(5)}` : null,
      message: message.trim() || null,
      trip_name: activeTrip?.trip_name || null,
      arrival_city: activeTrip?.arrival_city || null,
      interval_hours: interval,
      next_checkin_due: nextDue,
    })

    setChecking(false)
    setSuccess(true)
    setMessage('')
    setTimeout(() => setSuccess(false), 4000)
    await loadData()
  }

  const lastCheckin = checkins[0]
  const nextDue     = lastCheckin?.next_checkin_due
  const overdue     = nextDue ? overdueMins(nextDue) > 0 : false

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
          <CheckCircle size={20} color="white"/>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Check In</h1>
          <p className="text-sm text-gray-500">Confirm your safety at regular intervals</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Check-in panel ── */}
        <div className="lg:col-span-3 space-y-5">

          {/* Status card */}
          {lastCheckin && (
            <div className={`rounded-[12px] border p-5 ${overdue ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <div className="flex items-center gap-3">
                {overdue
                  ? <AlertCircle size={20} className="text-red-600 shrink-0"/>
                  : <CheckCircle size={20} className="text-green-600 shrink-0"/>}
                <div>
                  <p className={`text-sm font-bold ${overdue ? 'text-red-800' : 'text-green-800'}`}>
                    {overdue ? 'Check-in Overdue' : 'You\'re checked in ✓'}
                  </p>
                  <p className={`text-xs ${overdue ? 'text-red-600' : 'text-green-600'}`}>
                    Last: {timeAgo(lastCheckin.created_at)}
                    {nextDue && ` · Next due: ${fmtDate(nextDue)}`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Check-in form */}
          {success ? (
            <div className="bg-green-50 border-2 border-green-400 rounded-[12px] p-8 text-center">
              <CheckCircle size={40} className="text-green-600 mx-auto mb-3"/>
              <h2 className="text-lg font-bold text-green-800 mb-1">Check-in Confirmed ✓</h2>
              <p className="text-sm text-green-600">
                Next check-in due in {interval} hours
                {gpsPos && ' · Location shared'}
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-[12px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)] space-y-4">
              <h2 className="text-base font-bold text-gray-900">I'm Safe — Check In</h2>

              {/* GPS status */}
              <div className={`flex items-center gap-2 text-xs rounded-[6px] p-2.5 ${
                gpsPos ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                <Navigation size={11}/>
                {gpsLoading ? 'Capturing location…' :
                 gpsPos ? `Location ready (±${Math.round(gpsPos.accuracy || 0)}m)` :
                 gpsErr ? 'Location unavailable — check-in will proceed without GPS' :
                 'Awaiting GPS…'}
              </div>

              {/* Active trip */}
              {activeTrip && (
                <div className="flex items-center gap-2 text-xs text-gray-600 bg-blue-50 rounded-[6px] p-2.5 border border-blue-100">
                  <MapPin size={11} className="text-blue-500"/>
                  <span className="font-medium">{activeTrip.trip_name}</span> · {activeTrip.arrival_city}
                </div>
              )}

              {/* Message */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Optional message</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2}
                  placeholder="e.g. Arrived at hotel, all clear…"
                  className="w-full border border-gray-200 rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 resize-none"/>
              </div>

              {/* Next interval */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">
                  <Clock size={11} className="inline mr-1"/>Next check-in due in
                </label>
                <div className="flex gap-2 flex-wrap">
                  {INTERVALS.map(opt => (
                    <button key={opt.hours} onClick={() => setInterval2(opt.hours)}
                      className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
                        interval === opt.hours
                          ? 'bg-[#0118A1] text-white border-[#0118A1]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={doCheckIn} disabled={checking}
                style={{ background: BRAND_GREEN, color: BRAND_BLUE }}
                className="w-full flex items-center justify-center gap-2 font-bold py-3 rounded-[8px] text-sm disabled:opacity-60 hover:opacity-90 transition-all">
                {checking
                  ? <><RefreshCw size={14} className="animate-spin"/>Checking in…</>
                  : <><CheckCircle size={14}/>I'm Safe — Check In</>}
              </button>
            </div>
          )}

          {/* My check-in history */}
          {checkins.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-[12px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">My Check-in History</p>
              <div className="space-y-2">
                {checkins.map(c => (
                  <div key={c.id} className="flex items-start gap-2.5 py-2 border-b border-gray-50 last:border-0">
                    <CheckCircle size={13} className="text-green-500 shrink-0 mt-0.5"/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-800">{timeAgo(c.created_at)}</span>
                        {c.arrival_city && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><MapPin size={8}/>{c.arrival_city}</span>}
                      </div>
                      {c.message && <p className="text-[11px] text-gray-500 mt-0.5 italic">"{c.message}"</p>}
                      {c.location_label && (
                        <a href={`https://maps.google.com/?q=${c.latitude},${c.longitude}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-[#0118A1] hover:underline flex items-center gap-0.5 font-medium">
                          <Navigation size={8}/>Map
                        </a>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(c.created_at).split(',')[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Admin panel ── */}
        {isAdmin && (
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded-[12px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Staff Status</p>
                <button onClick={loadData} className="text-gray-400 hover:text-gray-600"><RefreshCw size={13}/></button>
              </div>

              {loading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-14 bg-gray-50 rounded animate-pulse"/>)}
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {staffList.map(s => <StaffCheckinRow key={s.id} staff={s}/>)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
