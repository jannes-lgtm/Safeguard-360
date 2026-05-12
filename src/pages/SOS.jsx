// SOS Emergency Page
// Required Supabase table:
// create table sos_events (
//   id uuid primary key default gen_random_uuid(),
//   user_id uuid references auth.users(id) on delete cascade,
//   full_name text,
//   latitude decimal(10,8), longitude decimal(11,8), accuracy decimal,
//   location_label text,
//   message text,
//   trip_name text, arrival_city text,
//   status text not null default 'active' check (status in ('active','resolved','false_alarm')),
//   resolved_by uuid references auth.users(id),
//   resolved_at timestamptz,
//   created_at timestamptz not null default now()
// );
// alter table sos_events enable row level security;
// create policy "users_own"  on sos_events for all using (auth.uid() = user_id);
// create policy "admin_all"  on sos_events for all using (
//   exists (select 1 from profiles where id = auth.uid() and role = 'admin')
// );

import { useEffect, useState, useRef } from 'react'
import {
  AlertOctagon, MapPin, Phone, Mail, Clock,
  CheckCircle, X, RefreshCw, Shield, Navigation,
  MessageSquare, User, ChevronDown, ChevronUp
} from 'lucide-react'
import Layout from '../components/Layout'
import W3WAddress from '../components/W3WAddress'
import { supabase } from '../lib/supabase'
import { resolveCountry } from '../lib/cityToCountry'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const fmtDate = d => d ? new Date(d).toLocaleString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
}) : '—'

const STATUS_STYLE = {
  active:      { label: '🔴 Active',      bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-700'    },
  resolved:    { label: '✅ Resolved',     bg: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-700'  },
  false_alarm: { label: '⚠️ False Alarm', bg: 'bg-amber-50',  border: 'border-amber-300',  text: 'text-amber-700'  },
}

// ── GPS capture ───────────────────────────────────────────────────────────────
function useGPS() {
  const [pos, setPos] = useState(null)
  const [gpsError, setGpsError] = useState(null)
  const [loading, setLoading] = useState(false)

  const capture = () => {
    if (!navigator.geolocation) { setGpsError('GPS not supported on this device'); return }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      p => { setPos(p.coords); setLoading(false) },
      e => { setGpsError(e.message); setLoading(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  return { pos, gpsError, loading, capture }
}

// ── SOS history row ───────────────────────────────────────────────────────────
function SosRow({ event, isAdmin, onResolve }) {
  const [expanded, setExpanded] = useState(false)
  const st = STATUS_STYLE[event.status] || STATUS_STYLE.active

  return (
    <div className={`rounded-[8px] border ${st.bg} ${st.border} overflow-hidden`}>
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setExpanded(p => !p)}>
        <AlertOctagon size={15} className={st.text}/>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${st.text}`}>{event.full_name || 'Unknown'}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.bg} ${st.border} ${st.text}`}>{st.label}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{fmtDate(event.created_at)}</p>
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-black/5">
          {event.trip_name && (
            <p className="text-xs text-gray-600 mt-2"><span className="font-medium">Trip:</span> {event.trip_name}</p>
          )}
          {event.arrival_city && (
            <p className="text-xs text-gray-600"><span className="font-medium">Destination:</span> {event.arrival_city}</p>
          )}
          {event.latitude && event.longitude && (
            <W3WAddress lat={event.latitude} lng={event.longitude} />
          )}
          {event.message && (
            <p className="text-xs text-gray-600 bg-white/60 rounded p-2 border border-black/5 italic">"{event.message}"</p>
          )}
          {isAdmin && event.status === 'active' && (
            <div className="flex gap-2 mt-3">
              <button onClick={() => onResolve(event.id, 'resolved')}
                className="text-xs font-semibold px-3 py-1.5 bg-green-500 text-white rounded-[6px] hover:bg-green-600">
                Mark Resolved
              </button>
              <button onClick={() => onResolve(event.id, 'false_alarm')}
                className="text-xs font-semibold px-3 py-1.5 bg-amber-400 text-white rounded-[6px] hover:bg-amber-500">
                False Alarm
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main SOS page ─────────────────────────────────────────────────────────────
export default function SOS() {
  const [profile, setProfile]           = useState(null)
  const [activeTrip, setActiveTrip]     = useState(null)
  const [isAdmin, setIsAdmin]           = useState(false)
  const [events, setEvents]             = useState([])
  const [loading, setLoading]           = useState(true)
  const [emergencyContacts, setEmergencyContacts] = useState([])

  // SOS trigger flow
  const [step, setStep]               = useState('idle')  // idle → confirm → sending → sent
  const [message, setMessage]         = useState('')
  const [error, setError]             = useState('')
  const { pos, gpsError, loading: gpsLoading, capture } = useGPS()

  const loadData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = new Date().toISOString().split('T')[0]
    const [{ data: prof }, { data: trip }, { data: evts }, { data: contacts }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('itineraries').select('*')
        .eq('user_id', user.id)
        .lte('depart_date', today).gte('return_date', today)
        .limit(1).single(),
      supabase.from('sos_events').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('emergency_contacts').select('*').eq('user_id', user.id).order('priority'),
    ])
    setEmergencyContacts(contacts || [])

    const role = prof?.role || user.app_metadata?.role || 'traveller'
    setIsAdmin(['admin', 'org_admin', 'developer'].includes(role))
    setProfile({ ...prof, email: user.email })
    setActiveTrip(trip || null)
    setEvents(evts || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // Begin confirm step — also trigger GPS capture
  const beginSOS = () => {
    setStep('confirm')
    setError('')
    capture()
  }

  const sendSOS = async () => {
    setStep('sending')
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user

    const payload = {
      user_id: user.id,
      full_name: profile?.full_name || profile?.email || 'Unknown',
      latitude: pos?.latitude || null,
      longitude: pos?.longitude || null,
      accuracy: pos?.accuracy || null,
      location_label: pos ? `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}` : null,
      message: message.trim() || null,
      trip_name: activeTrip?.trip_name || null,
      arrival_city: activeTrip?.arrival_city || null,
      status: 'active',
    }

    const { error: sosErr } = await supabase.from('sos_events').insert(payload)

    if (sosErr) { setError(sosErr.message); setStep('confirm'); return }

    // Also create a Critical alert so it appears in the alerts feed
    await supabase.from('alerts').insert({
      title: `🆘 SOS — ${payload.full_name}`,
      description: message.trim() || `SOS triggered by ${payload.full_name}${activeTrip ? ` in ${activeTrip.arrival_city}` : ''}. Immediate response required.`,
      country: resolveCountry(activeTrip?.arrival_city) || activeTrip?.arrival_city || 'Unknown',
      location: payload.location_label || activeTrip?.arrival_city || null,
      severity: 'Critical',
      status: 'Active',
      date_issued: new Date().toISOString().split('T')[0],
    })

    // Fire-and-forget: send email + SMS to admin and emergency contacts
    if (session?.access_token) {
      fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ type: 'sos', ...payload }),
      }).catch(e => console.warn('[SOS] notify failed:', e.message))
    }

    setStep('sent')
    await loadData()
  }

  const resolveEvent = async (id, status) => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('sos_events').update({
      status, resolved_by: user.id, resolved_at: new Date().toISOString()
    }).eq('id', id)
    loadData()
  }

  const myEvents   = events.filter(e => e.user_id === profile?.id)
  const allActive  = events.filter(e => e.status === 'active')

  return (
    <Layout>
      <div className="max-w-2xl">

        {/* Admin active SOS banner */}
        {isAdmin && allActive.length > 0 && (
          <div className="bg-red-600 text-white rounded-[8px] p-4 mb-6 flex items-center gap-3 animate-pulse">
            <AlertOctagon size={20}/>
            <div>
              <p className="font-bold text-sm">{allActive.length} Active SOS Event{allActive.length !== 1 ? 's' : ''}</p>
              <p className="text-xs text-red-100">Immediate response required</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center">
            <AlertOctagon size={20} color="white"/>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">SOS Emergency</h1>
            <p className="text-sm text-gray-500">Trigger a distress alert — response team will be notified immediately</p>
          </div>
        </div>

        {/* Sent confirmation */}
        {step === 'sent' ? (
          <div className="bg-red-50 border-2 border-red-400 rounded-[12px] p-8 text-center mb-6">
            <AlertOctagon size={40} className="text-red-600 mx-auto mb-3"/>
            <h2 className="text-xl font-bold text-red-800 mb-2">SOS Alert Sent</h2>
            <p className="text-sm text-red-600 mb-1">Your emergency team has been notified.</p>
            {pos && (
              <div className="mt-3 flex justify-center">
                <W3WAddress lat={pos.latitude} lng={pos.longitude} />
              </div>
            )}
            <button onClick={() => setStep('idle')} className="mt-5 text-sm text-red-600 underline">
              Back
            </button>
          </div>
        ) : step === 'confirm' ? (
          /* Confirm step */
          <div className="bg-red-50 border-2 border-red-300 rounded-[12px] p-6 mb-6 space-y-4">
            <h2 className="text-lg font-bold text-red-800">Confirm SOS Alert</h2>
            <p className="text-sm text-red-600">This will immediately notify your emergency team with your location.</p>

            {/* GPS status */}
            <div className={`flex items-center gap-2 text-xs rounded p-2 ${pos ? 'bg-green-50 text-green-700' : gpsError ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-500'}`}>
              <Navigation size={11}/>
              {gpsLoading ? 'Capturing GPS location…' :
               pos ? `Location captured (±${Math.round(pos.accuracy || 0)}m)` :
               gpsError ? `GPS unavailable: ${gpsError}` : 'Location not captured'}
            </div>

            {activeTrip && (
              <div className="flex items-center gap-2 text-xs text-gray-600 bg-white rounded p-2 border border-gray-200">
                <MapPin size={11}/>
                Active trip: <span className="font-semibold">{activeTrip.trip_name}</span> · {activeTrip.arrival_city}
              </div>
            )}

            {/* Optional message */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Message (optional)</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2}
                placeholder="Describe your situation, location details, or what help is needed…"
                className="w-full border border-red-200 rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none bg-white"/>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-3">
              <button onClick={sendSOS} disabled={step === 'sending'}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-[8px] text-sm disabled:opacity-60 transition-colors">
                {step === 'sending'
                  ? <><RefreshCw size={14} className="animate-spin"/>Sending SOS…</>
                  : <><AlertOctagon size={14}/>SEND SOS NOW</>}
              </button>
              <button onClick={() => setStep('idle')}
                className="px-5 py-3 text-sm text-gray-500 border border-gray-200 rounded-[8px] hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* Idle — big SOS trigger */
          <div className="bg-white border border-gray-200 rounded-[12px] p-6 mb-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <button onClick={beginSOS}
              className="w-40 h-40 mx-auto rounded-full bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-2xl shadow-[0_0_0_8px_rgba(220,38,38,0.15),0_0_0_16px_rgba(220,38,38,0.08)] transition-all flex flex-col items-center justify-center gap-1 mb-5">
              <AlertOctagon size={36}/>
              <span>SOS</span>
            </button>
            <p className="text-sm text-gray-600 mb-1">Press to trigger an emergency alert</p>
            <p className="text-xs text-gray-400">Your location and trip details will be sent to the response team</p>
          </div>
        )}

        {/* Emergency contacts */}
        {emergencyContacts.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-[12px] p-5 mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              Your Emergency Contacts ({emergencyContacts.length})
            </p>
            <div className="space-y-3">
              {emergencyContacts.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#0118A1]/10 flex items-center justify-center shrink-0 text-[10px] font-bold text-[#0118A1]">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{c.full_name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {c.relationship && <span className="text-[11px] text-gray-400">{c.relationship}</span>}
                      {c.email && (
                        <span className="text-[11px] text-gray-500 flex items-center gap-1">
                          <Mail size={9}/>{c.email}
                        </span>
                      )}
                      {c.phone && (
                        <span className="text-[11px] text-gray-500 flex items-center gap-1">
                          <Phone size={9}/>{c.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-3">
              These contacts will be notified immediately when you trigger an SOS. Update them in{' '}
              <span className="text-[#0118A1] font-medium">My Profile</span>.
            </p>
          </div>
        )}
        {emergencyContacts.length === 0 && !loading && (
          <div className="bg-amber-50 border border-amber-200 rounded-[12px] p-4 mb-6">
            <p className="text-xs font-semibold text-amber-800 mb-1">⚠️ No emergency contacts set</p>
            <p className="text-xs text-amber-700">
              Add emergency contacts in <span className="font-semibold">My Profile</span> so someone can be notified if you trigger an SOS.
            </p>
          </div>
        )}

        {/* Active trip */}
        {activeTrip && (
          <div className="bg-blue-50 border border-blue-200 rounded-[12px] p-4 mb-6">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">Active Trip</p>
            <p className="text-sm font-semibold text-blue-900">{activeTrip.trip_name}</p>
            <p className="text-xs text-blue-700 flex items-center gap-1 mt-1">
              <MapPin size={10}/>{activeTrip.arrival_city} · Returns {activeTrip.return_date}
            </p>
          </div>
        )}

        {/* SOS history */}
        {(isAdmin ? events : myEvents).length > 0 && (
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              {isAdmin ? `All SOS Events (${events.length})` : `My SOS History (${myEvents.length})`}
            </p>
            <div className="space-y-3">
              {(isAdmin ? events : myEvents).map(e => (
                <SosRow key={e.id} event={e} isAdmin={isAdmin} onResolve={resolveEvent}/>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
