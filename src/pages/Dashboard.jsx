import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart2, Bell, Plane, Radio, Globe, AlertCircle, Calendar, ChevronRight } from 'lucide-react'
import Layout from '../components/Layout'
import MetricCard from '../components/MetricCard'
import SeverityBadge from '../components/SeverityBadge'
import ProgressBar from '../components/ProgressBar'
import IntelBrief from '../components/IntelBrief'
import { supabase } from '../lib/supabase'
import { cityToCountry, SEVERITY_STYLE } from '../data/intelData'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

// ── Trip alert helpers ────────────────────────────────────────────────────────

const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 }

const TRIP_ALERT_STYLES = {
  Critical: 'border-l-4 border-red-500 bg-red-50',
  High:     'border-l-4 border-amber-500 bg-amber-50',
  Medium:   'border-l-4 border-yellow-400 bg-yellow-50',
  Low:      'border-l-4 border-gray-300 bg-gray-50',
  Info:     'border-l-4 border-blue-300 bg-blue-50',
}

const ALERT_TYPE_ICON = {
  disaster:   '🌋',
  earthquake: '🔴',
  flight:     '✈️',
  weather:    '⛈️',
  security:   '🛡️',
  health:     '🏥',
  political:  '🏛️',
}

function fmtEventDate(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function TripAlertsSection({ alerts, onMarkRead, onDismissAll }) {
  // Sort by severity then date
  const sorted = [...alerts].sort((a, b) => {
    const so = (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5)
    if (so !== 0) return so
    return new Date(b.created_at) - new Date(a.created_at)
  })

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">⚠️</span>
          <h2 className="text-sm font-bold text-gray-800">Trip Alerts</h2>
          <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {alerts.length}
          </span>
        </div>
        <button
          onClick={onDismissAll}
          className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors"
        >
          Dismiss all
        </button>
      </div>

      {/* Alert list */}
      <div className="space-y-2">
        {sorted.map(alert => (
          <div
            key={alert.id}
            className={`rounded-[8px] p-3 flex items-start gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${TRIP_ALERT_STYLES[alert.severity] || TRIP_ALERT_STYLES.Low}`}
          >
            {/* Type icon */}
            <span className="text-lg shrink-0 leading-none mt-0.5">
              {ALERT_TYPE_ICON[alert.alert_type] || '⚠️'}
            </span>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-1">
                  {alert.title}
                </p>
                {/* Mark read X */}
                <button
                  onClick={() => onMarkRead(alert.id)}
                  className="shrink-0 text-gray-400 hover:text-gray-600 text-xs font-bold leading-none mt-0.5"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>

              {alert.description && (
                <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{alert.description}</p>
              )}

              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {/* Trip label */}
                {alert.trip_name && (
                  <span className="text-[10px] bg-white/70 border border-gray-200 text-gray-600 rounded px-1.5 py-0.5 font-medium">
                    {alert.trip_name}
                  </span>
                )}
                {/* Source badge */}
                {alert.source && (
                  <span className="text-[10px] bg-[#0118A1]/10 text-[#0118A1] rounded px-1.5 py-0.5 font-medium">
                    {alert.source}
                  </span>
                )}
                {/* Event date */}
                {alert.event_date && (
                  <span className="text-[10px] text-gray-400">{fmtEventDate(alert.event_date)}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const severityDot = {
  Critical: 'bg-red-500',
  High: 'bg-amber-500',
  Medium: 'bg-yellow-400',
  Low: 'bg-gray-400',
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState({
    activeAlerts: 0,
    staffTravelling: 0,
    activeFeeds: 0,
  })
  const [recentAlerts, setRecentAlerts]       = useState([])
  const [trainingModules, setTrainingModules] = useState([])
  const [myTrips, setMyTrips]                 = useState([])
  const [destRisk, setDestRisk]               = useState({})   // country → risk data
  const [destAlerts, setDestAlerts]           = useState({})   // country → alert count
  const [selectedCountry, setSelectedCountry] = useState(null) // for IntelBrief drawer
  const [loading, setLoading]                 = useState(true)
  const [tripAlerts, setTripAlerts]           = useState([])   // personalised trip alerts
  const [scanLoading, setScanLoading]         = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const today = new Date().toISOString().split('T')[0]

      const [
        { count: alertCount },
        { count: travelCount },
        { data: alerts },
        { data: training },
        feedStatuses,
        { data: trips },
      ] = await Promise.all([
        supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
        supabase.from('itineraries').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
        supabase.from('alerts').select('*').eq('status', 'Active').order('date_issued', { ascending: false }).limit(4),
        supabase.from('training_progress').select('*').eq('user_id', session.user.id).order('module_order'),
        fetch('/api/feed-status').then(r => r.json()).catch(() => ({})),
        // Load user's current + upcoming trips
        supabase.from('itineraries').select('*')
          .eq('user_id', session.user.id)
          .gte('return_date', today)
          .order('depart_date'),
      ])

      const activeFeeds = Object.values(feedStatuses || {}).filter(s => s === 'active').length

      setMetrics({ activeAlerts: alertCount || 0, staffTravelling: travelCount || 0, activeFeeds })
      setRecentAlerts(alerts || [])
      setTrainingModules((training || []).slice(0, 5))

      // Map trips to countries
      const tripList = trips || []
      setMyTrips(tripList)

      // Unique destination countries
      const countries = [...new Set(
        tripList.map(t => cityToCountry(t.arrival_city)).filter(Boolean)
      )]

      if (countries.length > 0) {
        // Fetch risk levels + alert counts in parallel
        const [riskResults, alertResults] = await Promise.all([
          Promise.all(countries.map(c =>
            fetch(`/api/country-risk?country=${encodeURIComponent(c)}`)
              .then(r => r.json())
              .then(d => [c, d])
              .catch(() => [c, null])
          )),
          Promise.all(countries.map(c =>
            supabase.from('alerts').select('*', { count: 'exact', head: true })
              .eq('status', 'Active').ilike('country', `%${c}%`)
              .then(({ count }) => [c, count || 0])
          )),
        ])

        const riskMap  = Object.fromEntries(riskResults)
        const alertMap = Object.fromEntries(alertResults)
        setDestRisk(riskMap)
        setDestAlerts(alertMap)
      }

      // ── Trip alert scan (non-blocking fire-and-forget, then load results) ──
      setScanLoading(true)
      const token = session.access_token
      fetch('/api/trip-alert-scan', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})

      const { data: ta } = await supabase
        .from('trip_alerts')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(20)
      setTripAlerts(ta || [])
      setScanLoading(false)

      setLoading(false)
    }
    load()
  }, [])

  const avgProgress = trainingModules.length
    ? Math.round(trainingModules.reduce((sum, m) => sum + (m.progress_pct || 0), 0) / trainingModules.length)
    : 0

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'

  // Unique countries with trips for intel section
  const travelCountries = [...new Set(
    myTrips.map(t => ({ trip: t, country: cityToCountry(t.arrival_city) }))
      .filter(x => x.country)
      .map(x => x.country)
  )]

  return (
    <Layout>
      {/* IntelBrief drawer */}
      {selectedCountry && (
        <IntelBrief country={selectedCountry} onClose={() => setSelectedCountry(null)}/>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your duty of care overview</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Compliance Score" value="74%"           valueColor="text-[#2563EB]"           icon={BarChart2} />
        <MetricCard label="Active Alerts"    value={loading ? '–' : metrics.activeAlerts}
          valueColor={metrics.activeAlerts > 0 ? 'text-[#DC2626]' : 'text-gray-900'} icon={Bell} />
        <MetricCard label="Staff Travelling" value={loading ? '–' : metrics.staffTravelling} valueColor="text-[#2563EB]" icon={Plane} />
        <MetricCard label="Active Feeds"     value={loading ? '–' : metrics.activeFeeds}     valueColor="text-[#16A34A]" icon={Radio} />
      </div>

      {/* ── My Travel Intel (personal destinations) ── */}
      {travelCountries.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Globe size={14} className="text-[#0118A1]"/>
            <h2 className="text-sm font-bold text-gray-800">My Travel Intel</h2>
            <span className="text-xs text-gray-400">{myTrips.length} active / upcoming trip{myTrips.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {myTrips.map(trip => {
              const country = cityToCountry(trip.arrival_city)
              if (!country) return null
              const risk    = destRisk[country]
              const sev     = risk?.severity || null
              const style   = sev ? (SEVERITY_STYLE[sev] || SEVERITY_STYLE.Medium) : null
              const alerts  = destAlerts[country] ?? null
              const isActive = trip.depart_date <= new Date().toISOString().split('T')[0]

              return (
                <button key={trip.id}
                  onClick={() => setSelectedCountry(country)}
                  className="bg-white rounded-[8px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 text-left hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)] hover:border-[#0118A1]/30 transition-all group">

                  {/* Top: status + risk */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      {isActive ? '✈️ Active' : '📅 Upcoming'}
                    </span>
                    {sev && style && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${style.bg} ${style.border} ${style.text}`}>
                        {sev}
                      </span>
                    )}
                  </div>

                  {/* Trip name */}
                  <h3 className="text-sm font-bold text-gray-900 truncate mb-1">{trip.trip_name}</h3>

                  {/* Destination */}
                  <p className="text-xs text-gray-500 mb-3">
                    {trip.arrival_city}{country !== trip.arrival_city ? ` · ${country}` : ''}
                  </p>

                  {/* Dates */}
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-3">
                    <Calendar size={10}/>
                    {fmtDate(trip.depart_date)} — {fmtDate(trip.return_date)}
                  </div>

                  {/* Alert count */}
                  {alerts !== null && (
                    <div className={`flex items-center gap-1.5 text-[11px] font-medium ${alerts > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      <AlertCircle size={11}/>
                      {alerts > 0 ? `${alerts} active alert${alerts !== 1 ? 's' : ''}` : 'No active alerts'}
                    </div>
                  )}

                  {/* CTA */}
                  <div className="flex items-center gap-1 text-[11px] text-[#0118A1] font-semibold mt-3 pt-3 border-t border-gray-100 group-hover:underline">
                    View Full Intel Brief <ChevronRight size={11}/>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── My Trip Alerts ── */}
      {tripAlerts.length > 0 && (
        <TripAlertsSection
          alerts={tripAlerts}
          onMarkRead={async (id) => {
            await supabase.from('trip_alerts').update({ is_read: true }).eq('id', id)
            setTripAlerts(prev => prev.filter(a => a.id !== id))
          }}
          onDismissAll={async () => {
            const ids = tripAlerts.map(a => a.id)
            await supabase.from('trip_alerts').update({ is_read: true }).in('id', ids)
            setTripAlerts([])
          }}
        />
      )}

      {/* Two-panel row */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Live alerts panel — 60% */}
        <div className="lg:w-3/5 bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Live risk alerts</h2>

          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : recentAlerts.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No active alerts. All clear.</p>
          ) : (
            <div className="space-y-3">
              {recentAlerts.map(alert => (
                <div key={alert.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${severityDot[alert.severity] || 'bg-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{alert.title}</span>
                      <SeverityBadge severity={alert.severity} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{alert.description}</p>
                    {alert.country && (
                      <button
                        onClick={() => setSelectedCountry(alert.country)}
                        className="text-[10px] text-[#0118A1] hover:underline mt-0.5 flex items-center gap-0.5 font-medium">
                        <Globe size={9}/>{alert.country} intel →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-gray-100">
            <Link to="/alerts" className="text-sm text-[#2563EB] font-medium hover:underline">
              View all alerts →
            </Link>
          </div>
        </div>

        {/* ISO compliance panel — 40% */}
        <div className="lg:w-2/5 bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">ISO 31000 compliance</h2>

          {loading ? (
            <div className="space-y-4">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : trainingModules.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No training data found.</p>
          ) : (
            <div className="space-y-4">
              {trainingModules.map(module => (
                <ProgressBar
                  key={module.id}
                  label={module.module_name}
                  value={module.progress_pct || 0}
                />
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-gray-100">
            <Link to="/training" className="text-sm text-[#2563EB] font-medium hover:underline">
              Go to training →
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  )
}
