import { useEffect, useState } from 'react'
import { X, MapPin, Plane, Hotel, Users, Bell, AlertTriangle, RefreshCw, Globe, FileText } from 'lucide-react'
import Layout from '../components/Layout'
import MetricCard from '../components/MetricCard'
import IntelBrief from '../components/IntelBrief'
import { supabase } from '../lib/supabase'
import { cityToCountry, SEVERITY_STYLE } from '../data/intelData'

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
    <div className="fixed inset-0 z-50 flex">
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
                  <button onClick={() => { onClose(); onOpenIntel(country, staff.full_name || staff.email, trip.return_date) }}
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

export default function Tracker() {
  const [staffList, setStaffList]           = useState([])
  const [activeAlertCount, setActiveAlertCount] = useState(0)
  const [countryRisk, setCountryRisk]       = useState({})  // country → risk object
  const [loading, setLoading]               = useState(true)
  const [selectedStaff, setSelectedStaff]   = useState(null)
  const [intelCountry, setIntelCountry]     = useState(null)
  const [intelTraveler, setIntelTraveler]   = useState(null)
  const [intelReturn, setIntelReturn]       = useState(null)

  const load = async () => {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    const [
      { data: profiles },
      { data: activeTrips },
      { count: alertCount },
    ] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('itineraries').select('*').lte('depart_date', today).gte('return_date', today),
      supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
    ])

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

  const openIntel = (country, traveler, returnDate) => {
    setIntelCountry(country)
    setIntelTraveler(traveler)
    setIntelReturn(returnDate)
  }
  const closeIntel = () => { setIntelCountry(null); setIntelTraveler(null); setIntelReturn(null) }

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
        <MetricCard label="Total Staff"           value={loading ? '–' : staffList.length}     valueColor="text-gray-700"   icon={Users} />
        <MetricCard label="Active Alerts"         value={loading ? '–' : activeAlertCount}     valueColor="text-[#D97706]"  icon={Bell}  />
      </div>

      {/* Staff table */}
      <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff Member</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Trip</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Destination</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Risk Level</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Return</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400 text-sm">Loading staff…</td></tr>
            ) : staffList.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400 text-sm">No staff found</td></tr>
            ) : staffList.map(staff => {
              const country = staff.trip ? cityToCountry(staff.trip.arrival_city) : null
              const risk    = country ? countryRisk[country] : null

              return (
                <tr key={staff.id}
                  className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${staff.trip ? 'bg-blue-50/20' : ''}`}>

                  {/* Staff */}
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

                  {/* Trip name */}
                  <td className="px-5 py-3.5 text-gray-700">
                    {staff.trip?.trip_name || <span className="text-gray-300 italic">Not travelling</span>}
                  </td>

                  {/* Destination + country intel button */}
                  <td className="px-5 py-3.5">
                    {staff.trip?.arrival_city ? (
                      <div>
                        <div className="text-gray-700 text-sm">{staff.trip.arrival_city}</div>
                        {country && (
                          <button
                            onClick={() => openIntel(country, staff.full_name || staff.email, staff.trip.return_date)}
                            className="text-[10px] text-[#0118A1] hover:underline flex items-center gap-0.5 font-medium mt-0.5">
                            <Globe size={9}/>{country} intel →
                          </button>
                        )}
                      </div>
                    ) : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Risk badge */}
                  <td className="px-5 py-3.5">
                    {risk ? <RiskBadge severity={risk.severity}/> : staff.trip ? (
                      <span className="text-[10px] text-gray-300 italic">Loading…</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Return date */}
                  <td className="px-5 py-3.5 text-gray-500 text-xs">{staff.trip?.return_date || '—'}</td>

                  {/* Actions */}
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
    </Layout>
  )
}
