import { useEffect, useState } from 'react'
import { X, MapPin, Plane, Hotel, Users, Bell, AlertTriangle, RefreshCw } from 'lucide-react'
import Layout from '../components/Layout'
import MetricCard from '../components/MetricCard'
import { supabase } from '../lib/supabase'

const riskBadgeStyle = {
  Safe:     'bg-green-100 text-green-700 border border-green-200',
  Alert:    'bg-amber-100 text-amber-700 border border-amber-200',
  High:     'bg-amber-100 text-amber-700 border border-amber-200',
  Critical: 'bg-red-100 text-red-700 border border-red-200',
  Overdue:  'bg-red-100 text-red-700 border border-red-200',
  Medium:   'bg-yellow-100 text-yellow-700 border border-yellow-200',
  Low:      'bg-green-100 text-green-700 border border-green-200',
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function tripStatus(trip) {
  const today = new Date().toISOString().split('T')[0]
  if (!trip) return 'Safe'
  if (trip.return_date < today) return 'Safe'
  return 'Active'
}

function SlidePanel({ staff, onClose }) {
  if (!staff) return null
  const trip = staff.trip

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
            <div className="w-12 h-12 rounded-full bg-[#1E2461] flex items-center justify-center text-white font-bold text-sm">
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
  const [staffList, setStaffList] = useState([])
  const [activeAlertCount, setActiveAlertCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedStaff, setSelectedStaff] = useState(null)

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

    // Map trips to profiles
    const tripMap = {}
    for (const trip of activeTrips || []) {
      if (!tripMap[trip.user_id]) tripMap[trip.user_id] = trip
    }

    const staff = (profiles || []).map(p => ({
      ...p,
      trip: tripMap[p.id] || null,
    }))

    // Sort: travelling first, then alphabetically
    staff.sort((a, b) => {
      if (a.trip && !b.trip) return -1
      if (!a.trip && b.trip) return 1
      return (a.full_name || '').localeCompare(b.full_name || '')
    })

    setStaffList(staff)
    setActiveAlertCount(alertCount || 0)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const travelling = staffList.filter(s => s.trip).length

  return (
    <Layout>
      {selectedStaff && <SlidePanel staff={selectedStaff} onClose={() => setSelectedStaff(null)} />}

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
        <MetricCard label="Currently Travelling" value={loading ? '–' : travelling} valueColor="text-[#2563EB]" icon={Users} />
        <MetricCard label="Total Staff" value={loading ? '–' : staffList.length} valueColor="text-gray-700" icon={Users} />
        <MetricCard label="Active Alerts" value={loading ? '–' : activeAlertCount} valueColor="text-[#D97706]" icon={Bell} />
      </div>

      {/* Staff table */}
      <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff Member</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Trip</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Destination</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Return Date</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400 text-sm">Loading staff…</td></tr>
            ) : staffList.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400 text-sm">No staff found</td></tr>
            ) : staffList.map(staff => (
              <tr key={staff.id}
                className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${staff.trip ? 'bg-blue-50/20' : ''}`}>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#1E2461] flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {initials(staff.full_name || staff.email)}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{staff.full_name || '—'}</div>
                      <div className="text-xs text-gray-400">{staff.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-gray-700">{staff.trip?.trip_name || <span className="text-gray-300 italic">Not travelling</span>}</td>
                <td className="px-5 py-3.5 text-gray-700">{staff.trip?.arrival_city || '—'}</td>
                <td className="px-5 py-3.5 text-gray-500 text-xs">{staff.trip?.return_date || '—'}</td>
                <td className="px-5 py-3.5">
                  {staff.trip ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                      Travelling
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                      At Base
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button onClick={() => setSelectedStaff(staff)}
                    className="text-xs font-medium text-[#1E2461] hover:underline">
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
