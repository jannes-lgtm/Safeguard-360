import { useState } from 'react'
import { Plane, Clock, XCircle, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { toIcao, isKnownIata } from '../lib/airlineCodes'

const STATUS_CONFIG = {
  'Scheduled': { label: 'Scheduled', color: 'text-gray-600 bg-gray-100', Icon: Clock },
  'En Route/On Time': { label: 'On Time', color: 'text-green-700 bg-green-100', Icon: Plane },
  'En Route/Late': { label: 'Delayed', color: 'text-amber-700 bg-amber-100', Icon: AlertTriangle },
  'Arrived': { label: 'Landed', color: 'text-blue-700 bg-blue-100', Icon: CheckCircle },
  'Cancelled': { label: 'Cancelled', color: 'text-red-700 bg-red-100', Icon: XCircle },
  'Diverted': { label: 'Diverted', color: 'text-orange-700 bg-orange-100', Icon: AlertTriangle },
}

function formatDelay(minutes) {
  if (!minutes || minutes <= 0) return null
  if (minutes < 60) return `+${minutes}m`
  return `+${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function formatTime(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function FlightStatus({ flightNumber }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const icao = toIcao(flightNumber)
  const converted = isKnownIata(flightNumber)

  const check = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/flight-status?flight=${encodeURIComponent(icao)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch')
      setStatus(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-red-600">{error}</span>
        <button onClick={check} className="text-xs text-[#1B3A6B] hover:underline">Retry</button>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <button
          onClick={check}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs text-[#1B3A6B] font-medium hover:underline disabled:opacity-60"
        >
          {loading ? (
            <div className="w-3 h-3 border border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
          ) : (
            <Plane size={11} />
          )}
          {loading ? 'Checking…' : 'Check live status'}
        </button>
        {converted && (
          <span className="text-xs text-gray-400">
            using ICAO <span className="font-medium text-gray-500">{icao}</span>
          </span>
        )}
      </div>
    )
  }

  const config = STATUS_CONFIG[status.status] ?? { label: status.status, color: 'text-gray-600 bg-gray-100', Icon: Clock }
  const { Icon } = config
  const delay = formatDelay(status.arrivalDelay)
  const eta = formatTime(status.estimatedArrival ?? status.scheduledArrival)

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${config.color}`}>
        <Icon size={11} />
        {config.label}
        {delay && <span>{delay}</span>}
      </span>
      {eta && <span className="text-xs text-gray-500">ETA {eta}</span>}
      {status._mock && <span className="text-xs text-gray-400 italic">demo data</span>}
      <button
        onClick={check}
        disabled={loading}
        title="Refresh"
        className="text-gray-400 hover:text-gray-600 disabled:opacity-40"
      >
        <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  )
}
