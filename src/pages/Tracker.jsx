import { useEffect, useState, useRef } from 'react'
import { X, MapPin, Plane, Hotel, Users, Bell, RefreshCw, Globe, FileText, CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import Layout from '../components/Layout'
import W3WAddress from '../components/W3WAddress'
import MetricCard from '../components/MetricCard'
import IntelBrief from '../components/IntelBrief'
import { supabase } from '../lib/supabase'
import { cityToCountry, SEVERITY_STYLE } from '../data/intelData'
import { MAP_STYLES } from '../lib/mapConfig'

const BRAND_BLUE = '#0118A1'

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function RiskBadge({ severity }) {
  if (!severity) return <span className="text-xs text-gray-300">—</span>
  const style = SEVERITY_STYLE[severity] || SEVERITY_STYLE.Medium
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${style.bg} ${style.border} ${style.text}`}>
      {severity}
    </span>
  )
}

function SlidePanel({ staff, countryRisk, onClose, onOpenIntel }) {
  if (!staff) return null
  const trip    = staff.trip
  const country = trip ? cityToCountry(trip.arrival_city) : null
  const risk    = country ? countryRisk[country] : null

  return (
    <div className="fixed inset-0 flex" style={{ zIndex: 9000 }}>
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-xl flex flex-col h-full overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50 sticky top-0">
          <h2 className="font-semibold text-gray-900 text-base">{staff.full_name || staff.email}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Staff info */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm"
              style={{ background: BRAND_BLUE }}>
              {initials(staff.full_name || staff.email)}
            </div>
            <div>
              <div className="font-semibold text-gray-900">{staff.full_name || '—'}</div>
              <div className="text-sm text-gray-500">{staff.email}</div>
              <div className="text-xs text-gray-400 capitalize mt-0.5">{staff.role || 'traveller'}</div>
            </div>
          </div>

          {/* Emergency contacts */}
          {(staff.emergency_contact_1_name || staff.emergency_contact_2_name) && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Emergency Contacts</div>
              {staff.emergency_contact_1_name && (
                <div className="text-sm text-gray-700 mb-1">
                  {staff.emergency_contact_1_name}
                  {staff.emergency_contact_1_email && <span className="text-gray-400 ml-1">· {staff.emergency_contact_1_email}</span>}
                </div>
              )}
              {staff.emergency_contact_2_name && (
                <div className="text-sm text-gray-700">
                  {staff.emergency_contact_2_name}
                  {staff.emergency_contact_2_email && <span className="text-gray-400 ml-1">· {staff.emergency_contact_2_email}</span>}
                </div>
              )}
            </div>
          )}

          {trip ? (
            <>
              {/* Destination risk */}
              {country && risk && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Destination Risk</div>
                  <div className={`rounded-[8px] border p-3 ${(SEVERITY_STYLE[risk.severity] || SEVERITY_STYLE.Medium).bg} ${(SEVERITY_STYLE[risk.severity] || SEVERITY_STYLE.Medium).border}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-bold ${(SEVERITY_STYLE[risk.severity] || SEVERITY_STYLE.Medium).text}`}>
                        {country} — {risk.severity} Risk
                      </span>
                    </div>
                    {risk.sources && risk.sources.map((s, i) => (
                      <p key={i} className={`text-xs ${(SEVERITY_STYLE[risk.severity] || SEVERITY_STYLE.Medium).text} opacity-80`}>
                        {s.source}: {s.level}
                      </p>
                    ))}
                  </div>
                  <button onClick={() => { onClose(); onOpenIntel(country, staff.full_name || staff.email, trip.return_date, trip.arrival_city) }}
                    className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#0118A1] hover:underline">
                    <FileText size={11}/>Full Country Intel Brief →
                  </button>
                </div>
              )}

              {/* Trip details */}
              <div className="bg-gray-50 rounded-[8px] p-4 border border-gray-100">
                <h3 className="font-semibold text-gray-800 text-sm mb-3">{trip.trip_name}</h3>
                <div className="space-y-2">
                  {(trip.departure_city || trip.arrival_city) && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin size={14} className="text-gray-400 shrink-0" />
                      <span>{trip.departure_city || '—'} → {trip.arrival_city || '—'}</span>
                    </div>
                  )}
                  {trip.flight_number && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Plane size={14} className="text-gray-400 shrink-0" />
                      <span>{trip.flight_number}</span>
                    </div>
                  )}
                  {trip.hotel_name && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Hotel size={14} className="text-gray-400 shrink-0" />
                      <span>{trip.hotel_name}</span>
                    </div>
                  )}
                  <div className="text-xs text-gray-500 pt-1">
                    {trip.depart_date} — {trip.return_date}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-400 italic">No active trip</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Mini map (MapLibre) ───────────────────────────────────────────────────────
function MiniMap({ lat, lng }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)

  useEffect(() => {
    if (!lat || !lng || !containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container:   containerRef.current,
      style:       MAP_STYLES.standard,
      center:      [lng, lat],
      zoom:        14,
      interactive: false,
    })
    new maplibregl.Marker({ color: '#E11B1B' }).setLngLat([lng, lat]).addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [lat, lng])

  return <div ref={containerRef} className="w-full rounded-xl overflow-hidden border border-gray-200" style={{ height: 200 }} />
}

// ── Expandable check-in card ──────────────────────────────────────────────────
function CheckInCard({ ci }) {
  const [open, setOpen] = useState(false)

  const isOverdue = ci.next_checkin_due && new Date(ci.next_checkin_due) < new Date()
  const minsAgo   = Math.floor((Date.now() - new Date(ci.created_at)) / 60000)
  const timeLabel = minsAgo < 60 ? `${minsAgo}m ago`
    : minsAgo < 1440 ? `${Math.floor(minsAgo / 60)}h ago`
    : `${Math.floor(minsAgo / 1440)}d ago`
  const fmtDue = d => new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })

  const avatar = (ci.full_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const badge  = ci.status === 'distress'
    ? <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 border border-red-200 text-red-700 shrink-0"><AlertCircle size={9}/>DISTRESS</span>
    : <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 border border-green-200 text-green-700 shrink-0"><CheckCircle2 size={9}/>Safe</span>

  return (
    <div className={`border-b border-gray-50 last:border-0 ${ci.status === 'distress' ? 'bg-red-50' : ''}`}>

      {/* ── Collapsed row ── */}
      <button
        className="w-full px-4 sm:px-5 py-3 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(p => !p)}
      >
        {/* Mobile layout */}
        <div className="flex sm:hidden items-center gap-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
            style={{ background: BRAND_BLUE }}>{avatar}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-800 truncate">{ci.full_name || '—'}</span>
              {badge}
            </div>
            <div className="text-[11px] text-gray-400 truncate mt-0.5">
              {ci.trip_name || '—'}{ci.arrival_city ? ` · ${ci.arrival_city}` : ''}
              <span className="ml-2 font-medium text-gray-500">{timeLabel}</span>
            </div>
          </div>
          <span className="shrink-0 text-gray-300">{open ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}</span>
        </div>

        {/* Desktop layout */}
        <div className="hidden sm:flex items-center gap-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
            style={{ background: BRAND_BLUE }}>{avatar}</div>
          <span className="text-xs font-medium text-gray-800 w-32 shrink-0 truncate">{ci.full_name || '—'}</span>
          <span className="shrink-0">{badge}</span>
          <span className="flex-1 text-xs text-gray-400 truncate px-2">
            {ci.trip_name || '—'}{ci.arrival_city ? ` · ${ci.arrival_city}` : ''}
          </span>
          <span className="text-xs text-gray-400 shrink-0 w-16 text-right">{timeLabel}</span>
          <span className={`text-xs shrink-0 w-28 text-right font-medium ${isOverdue ? 'text-red-600' : 'text-gray-400'}`}>
            {ci.next_checkin_due ? `${isOverdue ? '⚠ ' : ''}${fmtDue(ci.next_checkin_due)}` : '—'}
          </span>
          <span className="ml-2 shrink-0 text-gray-300">{open ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}</span>
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {open && (() => {
        const lat = Number(ci.latitude)
        const lng = Number(ci.longitude)
        const hasLocation = lat && lng
        return (
          <div className="px-5 pb-5 pt-3 border-t border-gray-100 bg-gray-50/50">
            <div className={`grid gap-4 ${hasLocation ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-md'}`}>
              {hasLocation && (
                <div className="space-y-3">
                  <MiniMap lat={lat} lng={lng} />
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">What3Words</p>
                    <W3WAddress lat={lat} lng={lng} />
                  </div>
                </div>
              )}
              <div className="space-y-3">
                {ci.trip_name && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Trip</p>
                    <p className="text-xs text-gray-700">{ci.trip_name}{ci.arrival_city ? ` · ${ci.arrival_city}` : ''}</p>
                  </div>
                )}
                {ci.message && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Message</p>
                    <p className="text-xs text-gray-500 italic">{ci.message}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Checked In</p>
                    <p className="text-xs text-gray-700">{new Date(ci.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Next Due</p>
                    <p className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}>
                      {ci.next_checkin_due ? fmtDue(ci.next_checkin_due) : '—'}
                      {isOverdue && <span className="ml-1 text-[9px] bg-red-100 px-1.5 py-0.5 rounded-full">OVERDUE</span>}
                    </p>
                  </div>
                </div>
                {hasLocation && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Coordinates</p>
                    <p className="text-xs text-gray-500">{lat.toFixed(5)}, {lng.toFixed(5)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default function Tracker() {
  const [staffList, setStaffList]           = useState([])
  const [activeAlertCount, setActiveAlertCount] = useState(0)
  const [countryRisk, setCountryRisk]       = useState({})
  const [loading, setLoading]               = useState(true)
  const [selectedStaff, setSelectedStaff]   = useState(null)
  const [intelCountry, setIntelCountry]     = useState(null)
  const [intelCity, setIntelCity]           = useState(null)
  const [intelTraveler, setIntelTraveler]   = useState(null)
  const [intelReturn, setIntelReturn]       = useState(null)
  const [recentCheckins, setRecentCheckins] = useState([])   // last 20 check-ins across all staff
  const [checkinMap, setCheckinMap]         = useState({})   // user_id → latest check-in

  const load = async () => {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    // RLS enforces visibility — admin sees own org only, developer sees all
    const [
      { data: profiles },
      { data: activeTrips },
      { count: alertCount },
      { data: rawCheckins, error: checkinErr },
    ] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('itineraries').select('*').lte('depart_date', today).gte('return_date', today),
      supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
      supabase
        .from('staff_checkins')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000),
    ])

    if (checkinErr) {
      console.error('[Tracker] staff_checkins fetch failed:', checkinErr.message, checkinErr.code, checkinErr.details)
    } else {
      console.log('[Tracker] staff_checkins rows fetched:', rawCheckins?.length ?? 0)
    }

    // Merge profile data client-side (staff_checkins already stores full_name/trip_name inline)
    const allCheckins = rawCheckins || []

    // Build latest check-in per user (staff_checkins ordered newest first)
    const latestCheckin = {}
    for (const c of allCheckins) {
      if (!latestCheckin[c.user_id]) latestCheckin[c.user_id] = c
    }
    setCheckinMap(latestCheckin)
    setRecentCheckins(allCheckins.slice(0, 20))

    const tripMap = {}
    for (const trip of activeTrips || []) {
      if (!tripMap[trip.user_id]) tripMap[trip.user_id] = trip
    }

    const staff = (profiles || []).map(p => ({
      ...p,
      trip: tripMap[p.id] || null,
    }))

    staff.sort((a, b) => {
      if (a.trip && !b.trip) return -1
      if (!a.trip && b.trip) return 1
      return (a.full_name || '').localeCompare(b.full_name || '')
    })

    setStaffList(staff)
    setActiveAlertCount(alertCount || 0)

    // Fetch country risk for all active destinations
    const countries = [...new Set(
      (activeTrips || []).map(t => cityToCountry(t.arrival_city)).filter(Boolean)
    )]

    if (countries.length > 0) {
      const results = await Promise.all(
        countries.map(c =>
          fetch(`/api/country-risk?country=${encodeURIComponent(c)}`)
            .then(r => r.json())
            .then(d => [c, d])
            .catch(() => [c, null])
        )
      )
      setCountryRisk(Object.fromEntries(results))
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const travelling = staffList.filter(s => s.trip).length

  const openIntel = (country, traveler, returnDate, city = null) => {
    setIntelCountry(country)
    setIntelCity(city)
    setIntelTraveler(traveler)
    setIntelReturn(returnDate)
  }
  const closeIntel = () => { setIntelCountry(null); setIntelCity(null); setIntelTraveler(null); setIntelReturn(null) }

  return (
    <Layout>
      {selectedStaff && (
        <SlidePanel
          staff={selectedStaff}
          countryRisk={countryRisk}
          onClose={() => setSelectedStaff(null)}
          onOpenIntel={openIntel}
        />
      )}
      {intelCountry && (
        <IntelBrief
          country={intelCountry}
          city={intelCity}
          travelerName={intelTraveler}
          returnDate={intelReturn}
          onClose={closeIntel}
        />
      )}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Tracker</h1>
          <p className="text-sm text-gray-500 mt-0.5">Real-time view of all travelling staff</p>
        </div>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-1.5 text-sm text-[#1E2461] font-medium hover:underline disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <MetricCard label="Currently Travelling" value={loading ? '–' : travelling}            valueColor="text-[#2563EB]"  icon={Users} />
        <MetricCard label="Total Staff" value={loading ? '–' : staffList.length} valueColor="text-gray-700" icon={Users} />
        <MetricCard label="Active Alerts"         value={loading ? '–' : activeAlertCount}     valueColor="text-[#D97706]"  icon={Bell}  />
      </div>

      {/* Staff list — mobile cards + desktop table */}
      <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">

        {/* ── Mobile card list ── */}
        <div className="block sm:hidden divide-y divide-gray-100">
          {loading ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">Loading staff…</div>
          ) : staffList.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">No staff found</div>
          ) : staffList.map(staff => {
            const country = staff.trip ? cityToCountry(staff.trip.arrival_city) : null
            const risk    = country ? countryRisk[country] : null
            const ci      = checkinMap[staff.id]
            const minsAgo = ci ? Math.floor((Date.now() - new Date(ci.created_at)) / 60000) : null
            const ciLabel = minsAgo === null ? null
              : minsAgo < 60 ? `${minsAgo}m ago`
              : minsAgo < 1440 ? `${Math.floor(minsAgo/60)}h ago`
              : `${Math.floor(minsAgo/1440)}d ago`

            return (
              <div key={staff.id}
                className={`px-4 py-3.5 ${staff.trip ? 'bg-blue-50/20' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: BRAND_BLUE }}>
                      {initials(staff.full_name || staff.email)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 text-sm truncate">{staff.full_name || '—'}</div>
                      <div className="text-xs text-gray-400 truncate">{staff.email}</div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedStaff(staff)}
                    className="shrink-0 text-xs font-semibold text-[#1E2461] border border-[#1E2461]/25 rounded-lg px-3 py-1.5 hover:bg-[#1E2461] hover:text-white transition-colors">
                    View
                  </button>
                </div>

                {staff.trip ? (
                  <div className="mt-2 ml-12 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-gray-700">{staff.trip.trip_name}</span>
                      {risk && <RiskBadge severity={risk.severity}/>}
                      {!risk && <span className="text-[10px] text-gray-300 italic">Checking risk…</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
                      <MapPin size={10} className="text-gray-400 shrink-0"/>
                      <span>{staff.trip.arrival_city}</span>
                      {country && (
                        <button
                          onClick={() => openIntel(country, staff.full_name || staff.email, staff.trip.return_date, staff.trip.arrival_city)}
                          className="text-[#0118A1] font-medium hover:underline ml-0.5">
                          · {country} intel →
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      {ciLabel && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 size={10} className="text-green-500"/>
                          {ciLabel}
                        </span>
                      )}
                      <span>Returns {staff.trip.return_date}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1.5 ml-12 text-xs text-gray-400 italic">Not travelling</div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Desktop table ── */}
        <table className="hidden sm:table w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff Member</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Trip</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Destination</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Risk Level</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Check-in</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Return</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400 text-sm">Loading staff…</td></tr>
            ) : staffList.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400 text-sm">No staff found</td></tr>
            ) : staffList.map(staff => {
              const country = staff.trip ? cityToCountry(staff.trip.arrival_city) : null
              const risk    = country ? countryRisk[country] : null

              return (
                <tr key={staff.id}
                  className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${staff.trip ? 'bg-blue-50/20' : ''}`}>

                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ background: BRAND_BLUE }}>
                        {initials(staff.full_name || staff.email)}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{staff.full_name || '—'}</div>
                        <div className="text-xs text-gray-400">{staff.email}</div>
                      </div>
                    </div>
                  </td>

                  <td className="px-5 py-3.5 text-gray-700">
                    {staff.trip?.trip_name || <span className="text-gray-300 italic">Not travelling</span>}
                  </td>

                  <td className="px-5 py-3.5">
                    {staff.trip?.arrival_city ? (
                      <div>
                        <div className="text-gray-700 text-sm">{staff.trip.arrival_city}</div>
                        {country && (
                          <button
                            onClick={() => openIntel(country, staff.full_name || staff.email, staff.trip.return_date, staff.trip.arrival_city)}
                            className="text-[10px] text-[#0118A1] hover:underline flex items-center gap-0.5 font-medium mt-0.5">
                            <Globe size={9}/>{country} intel →
                          </button>
                        )}
                      </div>
                    ) : <span className="text-gray-300">—</span>}
                  </td>

                  <td className="px-5 py-3.5">
                    {risk ? <RiskBadge severity={risk.severity}/> : staff.trip ? (
                      <span className="text-[10px] text-gray-300 italic">Loading…</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>

                  <td className="px-5 py-3.5">
                    {(() => {
                      const ci = checkinMap[staff.id]
                      if (!ci) return <span className="text-xs text-gray-300 italic">Never</span>
                      const minsAgo = Math.floor((Date.now() - new Date(ci.created_at)) / 60000)
                      const label = minsAgo < 60 ? `${minsAgo}m ago`
                        : minsAgo < 1440 ? `${Math.floor(minsAgo/60)}h ago`
                        : `${Math.floor(minsAgo/1440)}d ago`
                      return (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 size={11} className="text-green-500 shrink-0" />
                          <span className="text-xs font-medium text-gray-600">{label}</span>
                        </div>
                      )
                    })()}
                  </td>

                  <td className="px-5 py-3.5 text-gray-500 text-xs">{staff.trip?.return_date || '—'}</td>

                  <td className="px-5 py-3.5 text-right">
                    <button onClick={() => setSelectedStaff(staff)}
                      className="text-xs font-medium text-[#1E2461] hover:underline">
                      View
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Recent Check-ins Panel ── */}
      <div className="mt-6 bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-green-600" />
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Recent Check-ins</span>
          </div>
          <span className="text-[10px] text-gray-400">{recentCheckins.length} most recent</span>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : recentCheckins.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">No check-ins recorded yet</div>
        ) : (
          <div>
            {/* Column headers — desktop only */}
            <div className="hidden sm:flex items-center gap-3 px-5 py-2 border-b border-gray-50 bg-white">
              <div className="w-7 shrink-0" />
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-32 shrink-0">Staff Member</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider shrink-0">Status</span>
              <span className="flex-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2">Location</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-16 text-right shrink-0">Time</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-28 text-right shrink-0">Next Due</span>
              <div className="w-5 shrink-0" />
            </div>
            {recentCheckins.map(ci => (
              <CheckInCard key={ci.id} ci={ci} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
