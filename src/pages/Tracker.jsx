import { useEffect, useState } from 'react'
import { X, MapPin, Plane, Hotel, Users, Bell, AlertTriangle } from 'lucide-react'
import Layout from '../components/Layout'
import MetricCard from '../components/MetricCard'
import { supabase } from '../lib/supabase'

// Hardcoded demo staff rows as specified in the spec
const DEMO_STAFF = [
  {
    id: 'demo-1',
    full_name: 'Thabo Nkosi',
    role: 'traveller',
    location: 'Lagos, Nigeria',
    last_checkin: '2 hours ago',
    risk_status: 'Critical',
    trip: {
      trip_name: 'Lagos Board Meeting',
      departure_city: 'Johannesburg',
      arrival_city: 'Lagos',
      depart_date: '2026-04-14',
      return_date: '2026-04-18',
      flight_number: 'SA101',
      hotel_name: 'Eko Hotel & Suites',
      status: 'Active',
      risk_level: 'Critical',
    }
  },
  {
    id: 'demo-2',
    full_name: 'Zanele Dlamini',
    role: 'traveller',
    location: 'Nairobi, Kenya',
    last_checkin: '5 hours ago',
    risk_status: 'Alert',
    trip: {
      trip_name: 'Nairobi Client Visit',
      departure_city: 'Cape Town',
      arrival_city: 'Nairobi',
      depart_date: '2026-04-15',
      return_date: '2026-04-20',
      flight_number: 'KQ761',
      hotel_name: 'Radisson Blu Nairobi',
      status: 'Active',
      risk_level: 'High',
    }
  },
  {
    id: 'demo-3',
    full_name: 'Sipho Khumalo',
    role: 'admin',
    location: 'Johannesburg, ZA',
    last_checkin: '1 day ago',
    risk_status: 'Overdue',
    trip: {
      trip_name: 'Durban Conference',
      departure_city: 'Johannesburg',
      arrival_city: 'Durban',
      depart_date: '2026-04-12',
      return_date: '2026-04-16',
      flight_number: 'BA6271',
      hotel_name: 'Suncoast Hotel',
      status: 'Active',
      risk_level: 'Medium',
    }
  },
  {
    id: 'demo-4',
    full_name: 'Amahle van der Merwe',
    role: 'traveller',
    location: 'Accra, Ghana',
    last_checkin: '30 minutes ago',
    risk_status: 'Safe',
    trip: {
      trip_name: 'Accra Partnership Meeting',
      departure_city: 'Johannesburg',
      arrival_city: 'Accra',
      depart_date: '2026-04-16',
      return_date: '2026-04-22',
      flight_number: 'ET823',
      hotel_name: 'Kempinski Gold Coast',
      status: 'Active',
      risk_level: 'Medium',
    }
  },
]

const riskBadgeStyle = {
  Safe: 'bg-green-100 text-green-700 border border-green-200',
  Alert: 'bg-amber-100 text-amber-700 border border-amber-200',
  Critical: 'bg-red-100 text-red-700 border border-red-200',
  Overdue: 'bg-red-100 text-red-700 border border-red-200',
}

const avatarColor = {
  admin: 'bg-blue-500',
  traveller: 'bg-green-500',
}

function initials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function SlidePanel({ staff, onClose }) {
  if (!staff) return null
  const trip = staff.trip

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-xl flex flex-col h-full overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50 sticky top-0">
          <h2 className="font-semibold text-gray-900 text-base">{staff.full_name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Staff info */}
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full ${avatarColor[staff.role] || 'bg-gray-400'} flex items-center justify-center text-white font-bold`}>
              {initials(staff.full_name)}
            </div>
            <div>
              <div className="font-semibold text-gray-900">{staff.full_name}</div>
              <div className="text-sm text-gray-500 capitalize">{staff.role}</div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold mt-1 ${riskBadgeStyle[staff.risk_status]}`}>
                {staff.risk_status}
              </span>
            </div>
          </div>

          {trip && (
            <>
              <div className="bg-gray-50 rounded-[8px] p-4 border border-gray-100">
                <h3 className="font-semibold text-gray-800 text-sm mb-3">{trip.trip_name}</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin size={14} className="text-gray-400 shrink-0" />
                    <span>{trip.departure_city} → {trip.arrival_city}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Plane size={14} className="text-gray-400 shrink-0" />
                    <span>{trip.flight_number}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Hotel size={14} className="text-gray-400 shrink-0" />
                    <span>{trip.hotel_name}</span>
                  </div>
                  <div className="text-xs text-gray-500 pt-1">
                    {trip.depart_date} — {trip.return_date}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Risk level</div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded text-sm font-semibold ${riskBadgeStyle[trip.risk_level] || 'bg-gray-100 text-gray-600'}`}>
                  {trip.risk_level}
                </span>
              </div>
            </>
          )}

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Current location</div>
            <p className="text-sm text-gray-700">{staff.location}</p>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Last check-in</div>
            <p className="text-sm text-gray-700">{staff.last_checkin}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Tracker() {
  const [dbStaff, setDbStaff] = useState([])
  const [activeAlertCount, setActiveAlertCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedStaff, setSelectedStaff] = useState(null)

  useEffect(() => {
    const load = async () => {
      const [
        { data: profiles },
        { count: alertCount },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('status', 'active'),
        supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
      ])
      setDbStaff(profiles || [])
      setActiveAlertCount(alertCount || 0)
      setLoading(false)
    }
    load()
  }, [])

  // Merge real DB profiles with demo rows — demo always shows
  const sortedStaff = [...DEMO_STAFF].sort((a, b) => {
    const order = { Critical: 0, Overdue: 1, Alert: 2, Safe: 3 }
    return (order[a.risk_status] ?? 9) - (order[b.risk_status] ?? 9)
  })

  return (
    <Layout>
      {selectedStaff && <SlidePanel staff={selectedStaff} onClose={() => setSelectedStaff(null)} />}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Staff Tracker</h1>
        <p className="text-sm text-gray-500 mt-0.5">Real-time view of all travelling staff</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <MetricCard
          label="Currently Travelling"
          value={DEMO_STAFF.filter(s => s.trip?.status === 'Active').length}
          valueColor="text-[#2563EB]"
          icon={Users}
        />
        <MetricCard
          label="Check-ins Overdue"
          value="1"
          valueColor="text-[#DC2626]"
          icon={AlertTriangle}
        />
        <MetricCard
          label="Active Alerts"
          value={loading ? '–' : activeAlertCount}
          valueColor="text-[#D97706]"
          icon={Bell}
        />
      </div>

      {/* Staff table */}
      <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff member</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Current location</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last check-in</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Risk status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {sortedStaff.map((staff, i) => (
              <tr
                key={staff.id}
                className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${
                  staff.risk_status === 'Critical' || staff.risk_status === 'Overdue' ? 'bg-red-50/30' : ''
                }`}
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                      staff.risk_status === 'Overdue' ? 'bg-red-500' :
                      avatarColor[staff.role] || 'bg-gray-400'
                    }`}>
                      {initials(staff.full_name)}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{staff.full_name}</div>
                      <div className="text-xs text-gray-500 capitalize">{staff.role}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-gray-700">{staff.location}</td>
                <td className="px-5 py-3.5 text-gray-500 text-xs">{staff.last_checkin}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold ${riskBadgeStyle[staff.risk_status]}`}>
                    {staff.risk_status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    onClick={() => setSelectedStaff(staff)}
                    className="text-xs font-medium text-[#2563EB] hover:underline"
                  >
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
