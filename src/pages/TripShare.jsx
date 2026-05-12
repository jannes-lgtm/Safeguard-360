import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MapPin, Plane, Hotel, Calendar, Shield, AlertTriangle, CheckCircle2 } from 'lucide-react'

const RISK_COLOR = {
  Critical: 'bg-red-100 text-red-700 border-red-200',
  High:     'bg-amber-100 text-amber-700 border-amber-200',
  Medium:   'bg-yellow-50 text-yellow-700 border-yellow-200',
  Low:      'bg-green-50 text-green-700 border-green-200',
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function TripShare() {
  const { token } = useParams()
  const [passcode, setPasscode] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [trip, setTrip] = useState(null)
  const [travellerName, setTravellerName] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (passcode.length !== 6) { setError('Passcode must be 6 digits'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/trip-share?token=${encodeURIComponent(token)}&passcode=${encodeURIComponent(passcode)}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Invalid passcode'); setLoading(false); return }
      setTrip(data.trip)
      setTravellerName(data.traveller_name)
      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-10 px-4">
      {/* Header */}
      <div className="w-full max-w-lg mb-6 flex items-center gap-3">
        <div className="w-9 h-9 rounded-[8px] bg-[#0118A1] flex items-center justify-center shrink-0">
          <Shield size={18} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-[#0118A1] leading-none">Safeguard 360</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Travel Safety Platform</p>
        </div>
      </div>

      {!submitted ? (
        /* Passcode gate */
        <div className="bg-white rounded-[10px] shadow-[0_2px_12px_rgba(0,0,0,0.1)] w-full max-w-lg p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Secure Itinerary</h1>
          <p className="text-sm text-gray-500 mb-6">
            Enter the 6-digit passcode from the email to view this traveller's itinerary.
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passcode</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={passcode}
                onChange={e => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                autoFocus
                className="w-full border border-gray-300 rounded-[6px] px-4 py-3 text-2xl font-mono tracking-[.3em] text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0118A1]"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-[6px]">
                <AlertTriangle size={13} className="text-red-500 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <button
              type="submit"
              disabled={loading || passcode.length !== 6}
              className="bg-[#0118A1] hover:bg-[#0118A1]/90 text-white font-semibold py-3 rounded-[6px] text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'View Itinerary'}
            </button>
          </form>
          <p className="mt-6 text-xs text-gray-400 text-center">
            This link was shared with you by the traveller as an emergency contact.
            Keep the passcode confidential.
          </p>
        </div>
      ) : (
        /* Trip view */
        <div className="bg-white rounded-[10px] shadow-[0_2px_12px_rgba(0,0,0,0.1)] w-full max-w-lg overflow-hidden">
          {/* Banner */}
          <div className="bg-[#0118A1] px-6 py-5">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={15} className="text-[#AACC00]" />
              <span className="text-xs font-semibold text-[#AACC00] uppercase tracking-wider">Verified itinerary</span>
            </div>
            <h2 className="text-lg font-bold text-white">{trip.trip_name}</h2>
            {travellerName && (
              <p className="text-sm text-white/70 mt-0.5">Traveller: {travellerName}</p>
            )}
          </div>

          <div className="p-6 space-y-5">
            {/* Risk badge */}
            {trip.risk_level && (
              <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${RISK_COLOR[trip.risk_level] || RISK_COLOR.Medium}`}>
                <AlertTriangle size={11} />
                {trip.risk_level} risk destination
              </div>
            )}

            {/* Route + dates */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <MapPin size={15} className="text-gray-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Route</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {trip.departure_city || '—'} → {trip.arrival_city || '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar size={15} className="text-gray-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Travel dates</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {fmtDate(trip.depart_date)} — {fmtDate(trip.return_date)}
                  </p>
                </div>
              </div>
              {trip.flight_number && (
                <div className="flex items-center gap-3">
                  <Plane size={15} className="text-gray-400 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">Flight</p>
                    <p className="text-sm font-semibold text-gray-900">{trip.flight_number}</p>
                  </div>
                </div>
              )}
              {trip.hotel_name && (
                <div className="flex items-center gap-3">
                  <Hotel size={15} className="text-gray-400 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">Accommodation</p>
                    <p className="text-sm font-semibold text-gray-900">{trip.hotel_name}</p>
                  </div>
                </div>
              )}
              {trip.meetings && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">Notes</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{trip.meetings}</p>
                </div>
              )}
            </div>

            {/* Missed check-in notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-[8px] px-4 py-3">
              <p className="text-xs text-amber-800 font-semibold mb-0.5">⚠️ If you can't reach this traveller</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                If {travellerName?.split(' ')[0] || 'the traveller'} misses a scheduled safety check-in you will receive
                an automatic notification. If you receive one and are unable to make contact, treat it as an emergency.
              </p>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
            <p className="text-[11px] text-gray-400 text-center">
              Safeguard 360 — Travel Safety Platform —{' '}
              <a href="https://safeguard360.co.za" className="text-gray-500 hover:underline">safeguard360.co.za</a>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
