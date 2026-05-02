import { useEffect, useState } from 'react'
import { MapPin, Plane, Hotel, AlertTriangle, Pencil } from 'lucide-react'
import Layout from '../components/Layout'
import SeverityBadge from '../components/SeverityBadge'
import FlightStatus from '../components/FlightStatus'
import CountryRisk from '../components/CountryRisk'
import { supabase } from '../lib/supabase'
import { toIcao, isKnownIata } from '../lib/airlineCodes'
import { resolveCountry } from '../lib/cityToCountry'

const HIGH_RISK_CRITICAL = ['lagos', 'kinshasa', 'mogadishu', 'kabul', 'juba', 'khartoum', 'tripoli', 'baghdad']
const HIGH_RISK_HIGH = ['nairobi', 'kampala', 'harare', 'lusaka', 'moscow', 'kyiv', 'tehran', 'karachi']

function getRiskLevel(city) {
  // Use exact word match to avoid substring false-positives (e.g. "los angeles" matching "lagos")
  const c = city.toLowerCase().trim()
  if (HIGH_RISK_CRITICAL.some(r => c === r || c.startsWith(r + ' ') || c.endsWith(' ' + r))) return 'Critical'
  if (HIGH_RISK_HIGH.some(r => c === r || c.startsWith(r + ' ') || c.endsWith(' ' + r))) return 'High'
  return 'Medium'
}

const dotColor = {
  Upcoming: 'bg-green-500',
  Active: 'bg-blue-500',
  Completed: 'bg-gray-400',
}

const TABS = ['Flight', 'Hotel', 'Meeting', 'Ground transport']

export default function Itinerary() {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [activeTab, setActiveTab] = useState('Flight')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')
  const [userId, setUserId] = useState(null)
  const [profile, setProfile] = useState(null)
  const [editingId, setEditingId] = useState(null)

  const emptyForm = { trip_name: '', flight_number: '', departure_city: '', arrival_city: '', depart_date: '', return_date: '', hotel_name: '', meetings: '' }
  const [form, setForm] = useState(emptyForm)

  const startEdit = (trip) => {
    setEditingId(trip.id)
    setForm({
      trip_name: trip.trip_name || '',
      flight_number: trip.flight_number || '',
      departure_city: trip.departure_city || '',
      arrival_city: trip.arrival_city || '',
      depart_date: trip.depart_date || '',
      return_date: trip.return_date || '',
      hotel_name: trip.hotel_name || '',
      meetings: trip.meetings || '',
    })
    setActiveTab('Flight')
    setTimeout(() => document.getElementById('trip-form')?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(emptyForm)
  }

  useEffect(() => {
    loadTrips()
  }, [])

  const loadTrips = async () => {
    setLoadError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const uid = session.user.id
      setUserId(uid)

      const { data: trips, error: tripsError } = await supabase
        .from('itineraries')
        .select('*')
        .eq('user_id', uid)
        .order('depart_date', { ascending: true })

      if (tripsError) {
        console.error('Trips error:', tripsError)
        setLoadError('Could not load your trips. Please refresh the page.')
      }
      setTrips(trips || [])

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .single()
      setProfile(prof || null)
    } catch (e) {
      console.error('loadTrips error:', e)
      setLoadError('Something went wrong loading your trips.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    const riskLevel = getRiskLevel(form.arrival_city)

    const now = new Date()
    const departDate = new Date(form.depart_date)
    const returnDate = new Date(form.return_date)
    let status = 'Upcoming'
    if (now >= departDate && now <= returnDate) status = 'Active'
    else if (now > returnDate) status = 'Completed'

    const tripData = {
      trip_name: form.trip_name,
      flight_number: form.flight_number,
      departure_city: form.departure_city,
      arrival_city: form.arrival_city,
      depart_date: form.depart_date,
      return_date: form.return_date,
      hotel_name: form.hotel_name,
      meetings: form.meetings,
      risk_level: riskLevel,
      status,
    }

    // Always get user ID fresh from session to avoid null state issues
    const { data: { session } } = await supabase.auth.getSession()
    const currentUserId = session?.user?.id

    const { error } = editingId
      ? await supabase.from('itineraries').update(tripData).eq('id', editingId)
      : await supabase.from('itineraries').insert({ ...tripData, user_id: currentUserId })

    if (!error) {
      setToast(editingId ? 'Trip updated successfully.' : 'Trip saved. We will monitor your journey and alert you to any disruptions.')
      setEditingId(null)
      setForm(emptyForm)
      await loadTrips()
      setTimeout(() => setToast(''), 5000)
    }

    setSubmitting(false)
  }

  const f = (key) => ({
    value: form[key],
    onChange: e => setForm(prev => ({ ...prev, [key]: e.target.value }))
  })

  const inputClass = "w-full border border-gray-300 rounded-[6px] px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B3A6B] focus:border-transparent"
  const labelClass = "block text-sm font-medium text-gray-700 mb-1"

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Itinerary</h1>
        <p className="text-sm text-gray-500 mt-0.5">View and manage your travel plans</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-800 rounded-[8px] text-sm flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-green-500 inline-block shrink-0" />
          {toast}
        </div>
      )}

      {/* Trip timeline */}
      <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">Your trips</h2>

        {loading ? (
          <div className="space-y-3">
            {[1,2].map(i => <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : loadError ? (
          <div className="flex items-center gap-2 py-4">
            <span className="text-sm text-red-600">{loadError}</span>
            <button onClick={loadTrips} className="text-sm text-[#0118A1] hover:underline font-medium">Retry</button>
          </div>
        ) : trips.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No trips yet. Add your first trip below.</p>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[7px] top-3 bottom-3 w-0.5 bg-gray-200" />

            <div className="space-y-5">
              {trips.map(trip => (
                <div key={trip.id} className="flex gap-5">
                  {/* Dot */}
                  <div className={`mt-1.5 w-4 h-4 rounded-full border-2 border-white shadow shrink-0 ${dotColor[trip.status] || 'bg-gray-400'}`} />

                  {/* Card */}
                  <div className="flex-1 min-w-0">
                    {(trip.risk_level === 'Critical' || trip.risk_level === 'High') && (
                      <div className="mb-2 flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-[6px] px-3 py-2 text-xs font-medium">
                        <AlertTriangle size={13} />
                        This destination has elevated risk. Check the Alerts page for details.
                      </div>
                    )}
                    <div className="bg-gray-50 border border-gray-100 rounded-[8px] p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-gray-900">{trip.trip_name}</span>
                            <SeverityBadge severity={trip.risk_level} />
                            <button onClick={() => startEdit(trip)}
                              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#1B3A6B] transition-colors ml-1">
                              <Pencil size={11} /> Edit
                            </button>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              trip.status === 'Active' ? 'bg-blue-100 text-blue-700' :
                              trip.status === 'Upcoming' ? 'bg-green-100 text-green-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {trip.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-1">
                            <MapPin size={13} className="text-gray-400" />
                            <span>{trip.departure_city}</span>
                            <span className="text-gray-400">→</span>
                            <span>{trip.arrival_city}</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {trip.depart_date} — {trip.return_date}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {trip.flight_number && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 justify-end mb-1">
                              <Plane size={11} />
                              <span>{trip.flight_number}</span>
                            </div>
                          )}
                          {trip.hotel_name && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 justify-end">
                              <Hotel size={11} />
                              <span>{trip.hotel_name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {(trip.flight_number || trip.arrival_city) && (
                        <div className="mt-2 pt-2 border-t border-gray-100 flex flex-col gap-1">
                          {trip.flight_number && (
                            <FlightStatus
                              flightNumber={trip.flight_number}
                              tripName={trip.trip_name}
                              profile={profile}
                            />
                          )}
                          {trip.arrival_city && resolveCountry(trip.arrival_city) && (
                            <CountryRisk
                              country={resolveCountry(trip.arrival_city)}
                              tripName={trip.trip_name}
                              profile={profile}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit trip form */}
      <div id="trip-form" className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            {editingId ? 'Edit trip' : 'Add a trip'}
          </h2>
          {editingId && (
            <button onClick={cancelEdit} className="text-xs text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          )}
        </div>

        {/* Tab selector */}
        <div className="flex gap-1 mb-5 bg-gray-100 rounded-[6px] p-1 w-fit">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-[4px] text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-white text-[#1B3A6B] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {activeTab === 'Flight' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>Trip name</label>
                <input className={inputClass} placeholder="e.g. Lagos Board Meeting" {...f('trip_name')} required />
              </div>
              <div>
                <label className={labelClass}>Flight number</label>
                <input className={inputClass} placeholder="e.g. BA001 or BAW001" {...f('flight_number')} />
                {form.flight_number && isKnownIata(form.flight_number) && (
                  <p className="mt-1 text-xs text-blue-600">
                    Will track as ICAO <span className="font-semibold">{toIcao(form.flight_number)}</span>
                  </p>
                )}
                {form.flight_number && !isKnownIata(form.flight_number) && !/^[A-Z]{3}\d/i.test(form.flight_number) && form.flight_number.length >= 3 && (
                  <p className="mt-1 text-xs text-amber-600">
                    Use ICAO format (3-letter prefix) for best results, e.g. BAW001
                  </p>
                )}
              </div>
              <div>
                <label className={labelClass}>Departure city</label>
                <input className={inputClass} placeholder="e.g. Johannesburg" {...f('departure_city')} required />
              </div>
              <div>
                <label className={labelClass}>Arrival city</label>
                <input className={inputClass} placeholder="e.g. Lagos" {...f('arrival_city')} required />
              </div>
              <div>
                <label className={labelClass}>Departure date</label>
                <input type="date" className={inputClass} {...f('depart_date')} required />
              </div>
              <div>
                <label className={labelClass}>Return date</label>
                <input type="date" className={inputClass} {...f('return_date')} required />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Hotel name</label>
                <input className={inputClass} placeholder="e.g. Eko Hotel & Suites" {...f('hotel_name')} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Notes</label>
                <textarea className={`${inputClass} h-20 resize-none`} placeholder="Meeting details, contacts..." {...f('meetings')} />
              </div>
            </div>
          )}

          {activeTab === 'Hotel' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>Trip name</label>
                <input className={inputClass} placeholder="e.g. Nairobi Conference" {...f('trip_name')} required />
              </div>
              <div>
                <label className={labelClass}>Hotel name</label>
                <input className={inputClass} placeholder="e.g. Radisson Blu" {...f('hotel_name')} required />
              </div>
              <div>
                <label className={labelClass}>City</label>
                <input className={inputClass} placeholder="e.g. Nairobi" {...f('arrival_city')} required />
              </div>
              <div>
                <label className={labelClass}>Check-in date</label>
                <input type="date" className={inputClass} {...f('depart_date')} required />
              </div>
              <div>
                <label className={labelClass}>Check-out date</label>
                <input type="date" className={inputClass} {...f('return_date')} required />
              </div>
            </div>
          )}

          {activeTab === 'Meeting' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>Trip name</label>
                <input className={inputClass} placeholder="e.g. Accra Client Visit" {...f('trip_name')} required />
              </div>
              <div>
                <label className={labelClass}>Meeting city</label>
                <input className={inputClass} placeholder="e.g. Accra" {...f('arrival_city')} required />
              </div>
              <div>
                <label className={labelClass}>Departure city</label>
                <input className={inputClass} placeholder="e.g. Cape Town" {...f('departure_city')} required />
              </div>
              <div>
                <label className={labelClass}>Meeting date</label>
                <input type="date" className={inputClass} {...f('depart_date')} required />
              </div>
              <div>
                <label className={labelClass}>Return date</label>
                <input type="date" className={inputClass} {...f('return_date')} required />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Meeting details</label>
                <textarea className={`${inputClass} h-24 resize-none`} placeholder="Who, where, purpose..." {...f('meetings')} />
              </div>
            </div>
          )}

          {activeTab === 'Ground transport' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>Trip name</label>
                <input className={inputClass} placeholder="e.g. Durban Road Trip" {...f('trip_name')} required />
              </div>
              <div>
                <label className={labelClass}>Departure city</label>
                <input className={inputClass} placeholder="e.g. Durban" {...f('departure_city')} required />
              </div>
              <div>
                <label className={labelClass}>Destination city</label>
                <input className={inputClass} placeholder="e.g. Pietermaritzburg" {...f('arrival_city')} required />
              </div>
              <div>
                <label className={labelClass}>Departure date</label>
                <input type="date" className={inputClass} {...f('depart_date')} required />
              </div>
              <div>
                <label className={labelClass}>Return date</label>
                <input type="date" className={inputClass} {...f('return_date')} required />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Notes</label>
                <textarea className={`${inputClass} h-20 resize-none`} placeholder="Driver, vehicle, route..." {...f('meetings')} />
              </div>
            </div>
          )}

          <div className="mt-5">
            <button
              type="submit"
              disabled={submitting}
              className="bg-[#AACC00] hover:bg-[#99bb00] text-[#0118A1] font-semibold px-6 py-2.5 rounded-[6px] text-sm transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : editingId ? 'Update trip' : 'Save trip'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  )
}
