import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart2, Bell, Plane, Radio, Globe, AlertCircle,
  Calendar, ChevronRight, Brain, Zap, AlertTriangle,
  ListChecks, RefreshCw, X, CheckCircle2, BookOpen,
  FileText, CheckSquare, Award,
} from 'lucide-react'
import Layout from '../components/Layout'
import MetricCard from '../components/MetricCard'
import SeverityBadge from '../components/SeverityBadge'
import IntelBrief from '../components/IntelBrief'
import { supabase } from '../lib/supabase'
import { cityToCountry, SEVERITY_STYLE } from '../data/intelData'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 }

const ALERT_TYPE_ICON = {
  disaster:   '🌋',
  earthquake: '🔴',
  flight:     '✈️',
  weather:    '⛈️',
  security:   '🛡️',
  health:     '🏥',
  political:  '🏛️',
}

const SEVERITY_PILL = {
  Critical: { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA', bar: '#EF4444' },
  High:     { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA', bar: '#F97316' },
  Medium:   { bg: '#FEFCE8', color: '#A16207', border: '#FEF08A', bar: '#EAB308' },
  Low:      { bg: '#F8FAFC', color: '#475569', border: '#E2E8F0', bar: '#94A3B8' },
  Info:     { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', bar: '#3B82F6' },
}

function fmtEventDate(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const severityDot = {
  Critical: '#EF4444',
  High:     '#F97316',
  Medium:   '#EAB308',
  Low:      '#94A3B8',
}

// ── Trip Alerts section ───────────────────────────────────────────────────────
function TripAlertsSection({ alerts, onMarkRead, onDismissAll }) {
  const sorted = [...alerts].sort((a, b) => {
    const so = (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5)
    if (so !== 0) return so
    return new Date(b.created_at) - new Date(a.created_at)
  })

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <AlertTriangle size={15} style={{ color: '#F97316' }} />
          <h2 className="text-sm font-bold text-gray-800">Trip Alerts</h2>
          <span
            className="text-[10px] font-bold rounded-full px-2 py-0.5"
            style={{ background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' }}
          >
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

      <div className="space-y-2">
        {sorted.map(alert => {
          const pill = SEVERITY_PILL[alert.severity] || SEVERITY_PILL.Low
          return (
            <div
              key={alert.id}
              className="rounded-2xl flex items-start gap-3 p-4 transition-all"
              style={{
                background: pill.bg,
                border: `1px solid ${pill.border}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              {/* Left accent bar */}
              <div className="w-0.5 self-stretch rounded-full shrink-0 mt-0.5" style={{ background: pill.bar }} />

              <span className="text-lg shrink-0 leading-none mt-0.5">
                {ALERT_TYPE_ICON[alert.alert_type] || '⚠️'}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-1">
                    {alert.title}
                  </p>
                  <button
                    onClick={() => onMarkRead(alert.id)}
                    className="shrink-0 p-0.5 rounded-md transition-colors hover:bg-black/5"
                    title="Dismiss"
                    style={{ color: pill.color, opacity: 0.5 }}
                  >
                    <X size={13} />
                  </button>
                </div>

                {alert.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                    {alert.description}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                    style={{ background: pill.bar + '20', color: pill.color }}
                  >
                    {alert.severity}
                  </span>
                  {alert.trip_name && (
                    <span className="text-[10px] bg-white/80 border border-gray-200 text-gray-500 rounded-full px-2 py-0.5 font-medium">
                      {alert.trip_name}
                    </span>
                  )}
                  {alert.source && (
                    <span
                      className="text-[10px] rounded-full px-2 py-0.5 font-medium"
                      style={{ background: `${BRAND_BLUE}10`, color: BRAND_BLUE }}
                    >
                      {alert.source}
                    </span>
                  )}
                  {alert.event_date && (
                    <span className="text-[10px] text-gray-400">{fmtEventDate(alert.event_date)}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── ISO Compliance Score card ─────────────────────────────────────────────────
function ComplianceScoreCard({ breakdown, loading }) {
  if (loading && !breakdown) {
    return (
      <div className="bg-white rounded-2xl p-6 animate-pulse"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-6 h-6 rounded-lg bg-gray-100" />
          <div className="h-4 w-40 bg-gray-100 rounded-full" />
        </div>
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-full bg-gray-100 shrink-0" />
          <div className="flex-1 space-y-3">
            <div className="h-3 bg-gray-100 rounded-full" />
            <div className="h-3 bg-gray-100 rounded-full w-4/5" />
            <div className="h-3 bg-gray-100 rounded-full w-3/5" />
          </div>
        </div>
      </div>
    )
  }

  const score = breakdown?.total ?? 0

  // Rating
  const rating =
    score >= 90 ? { label: 'Excellent',       color: '#059669', bg: '#ECFDF5', border: '#BBF7D0' } :
    score >= 70 ? { label: 'Good',             color: BRAND_BLUE, bg: `${BRAND_BLUE}0D`, border: `${BRAND_BLUE}25` } :
    score >= 50 ? { label: 'Needs Attention',  color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' } :
                  { label: 'At Risk',           color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' }

  // SVG ring
  const R   = 38
  const C   = 2 * Math.PI * R          // ~238.76
  const fill = (score / 100) * C

  const components = breakdown ? [
    {
      label: 'ISO Training',
      icon:  BookOpen,
      pct:   breakdown.training.pct,
      sub:   `${breakdown.training.done} of ${breakdown.training.total} modules`,
      link:  '/training',
      color: BRAND_BLUE,
    },
    {
      label: 'Policy Sign-offs',
      icon:  FileText,
      pct:   breakdown.policies.pct,
      sub:   `${breakdown.policies.done} of ${breakdown.policies.total} policies`,
      link:  '/policies',
      color: '#7C3AED',
    },
    {
      label: 'Travel Check-ins',
      icon:  CheckSquare,
      pct:   breakdown.checkin.pct,
      sub:   breakdown.checkin.hasTrips
        ? breakdown.checkin.done > 0 ? 'Recent check-in on file' : 'No check-ins in 90 days'
        : 'No active trips',
      link:  '/checkin',
      color: '#059669',
    },
  ] : []

  return (
    <div className="bg-white rounded-2xl p-6"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)' }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${BRAND_BLUE}12` }}>
            <Award size={13} style={{ color: BRAND_BLUE }} />
          </div>
          <h2 className="text-sm font-bold text-gray-900">ISO 31030 Compliance</h2>
        </div>
        {breakdown && (
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
            style={{ background: rating.bg, color: rating.color, border: `1px solid ${rating.border}` }}>
            {rating.label}
          </span>
        )}
      </div>

      <div className="flex items-center gap-6">
        {/* Ring gauge */}
        <div className="shrink-0 relative w-24 h-24">
          <svg width="96" height="96" viewBox="0 0 96 96">
            {/* Track */}
            <circle cx="48" cy="48" r={R} fill="none" stroke="#EEF0F6" strokeWidth="8" />
            {/* Fill */}
            <circle
              cx="48" cy="48" r={R}
              fill="none"
              stroke={rating.color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${fill} ${C}`}
              strokeDashoffset={C * 0.25}   /* start at top */
              style={{ transition: 'stroke-dasharray 0.8s ease' }}
            />
          </svg>
          {/* Score label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-black leading-none" style={{ color: rating.color }}>{score}%</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">Score</span>
          </div>
        </div>

        {/* Component breakdown */}
        <div className="flex-1 space-y-3 min-w-0">
          {components.map(c => {
            const Icon = c.icon
            return (
              <Link key={c.label} to={c.link} className="flex items-center gap-2.5 group">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${c.color}12` }}>
                  <Icon size={11} style={{ color: c.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">
                      {c.label}
                    </span>
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: c.color }}>{c.pct}%</span>
                  </div>
                  {/* Mini bar */}
                  <div className="h-1 rounded-full w-full" style={{ background: '#EEF0F6' }}>
                    <div className="h-1 rounded-full transition-all duration-700"
                      style={{ width: `${c.pct}%`, background: c.color }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid #F1F5F9' }}>
        <p className="text-[10px] text-gray-400">
          Weighted: training 40% · policies 40% · check-ins 20%
        </p>
        <Link to="/training" className="text-xs font-semibold hover:underline flex items-center gap-1"
          style={{ color: BRAND_BLUE }}>
          Improve score <ChevronRight size={11} />
        </Link>
      </div>
    </div>
  )
}

// ── AI Morning Brief ──────────────────────────────────────────────────────────
const BRIEF_SEV_STYLE = {
  Critical: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
  High:     { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C' },
  Medium:   { bg: '#FEFCE8', border: '#FEF08A', text: '#A16207' },
  Low:      { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' },
}

function MorningBriefCard({ brief, loading }) {
  const [expanded, setExpanded] = useState(true)

  if (loading) {
    return (
      <div
        className="rounded-2xl p-5 mb-6 animate-pulse"
        style={{
          background: 'linear-gradient(135deg, #EEF1FB 0%, #F4F6FD 100%)',
          border: `1px solid ${BRAND_BLUE}20`,
          boxShadow: `0 2px 12px ${BRAND_BLUE}10`,
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: BRAND_BLUE }}>
            <Brain size={16} color="white" />
          </div>
          <div>
            <div className="h-3.5 w-44 bg-blue-100 rounded-full mb-1.5" />
            <div className="h-2.5 w-28 bg-blue-50 rounded-full" />
          </div>
          <RefreshCw size={12} className="ml-auto animate-spin" style={{ color: `${BRAND_BLUE}60` }} />
        </div>
        <div className="space-y-2">
          <div className="h-2.5 bg-blue-50 rounded-full w-full" />
          <div className="h-2.5 bg-blue-50 rounded-full w-4/5" />
          <div className="h-2.5 bg-blue-50 rounded-full w-2/3" />
        </div>
      </div>
    )
  }

  if (!brief) return null

  return (
    <div
      className="rounded-2xl mb-6 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #EEF1FB 0%, #F4F6FD 100%)',
        border: `1px solid ${BRAND_BLUE}20`,
        boxShadow: `0 2px 16px ${BRAND_BLUE}12`,
      }}
    >
      <button
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: BRAND_BLUE }}
        >
          <Brain size={16} color="white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-bold text-gray-900">AI Intelligence Brief</span>
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: `${BRAND_BLUE}15`, color: BRAND_BLUE }}
            >
              <Zap size={7} /> LIVE
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate">{brief.headline}</p>
        </div>
        <ChevronRight
          size={15}
          className="shrink-0 text-gray-400 transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
      </button>

      {expanded && (
        <div
          className="px-5 pb-5 pt-4 space-y-4"
          style={{ borderTop: `1px solid ${BRAND_BLUE}10` }}
        >
          <p className="text-sm text-gray-700 font-medium leading-relaxed">{brief.headline}</p>

          {brief.situations?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Active Situations</p>
              <div className="space-y-2">
                {brief.situations.map((s, i) => {
                  const st = BRIEF_SEV_STYLE[s.severity] || BRIEF_SEV_STYLE.Medium
                  return (
                    <div key={i} className="rounded-xl px-3.5 py-2.5"
                      style={{ background: st.bg, border: `1px solid ${st.border}` }}>
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-xs font-bold" style={{ color: st.text }}>{s.country}</span>
                        <span className="text-[10px] font-semibold opacity-60" style={{ color: st.text }}>{s.severity}</span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: st.text, opacity: 0.85 }}>{s.summary}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {brief.priority_actions?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <ListChecks size={11} style={{ color: BRAND_BLUE }} />
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Priority Actions</p>
              </div>
              <ul className="space-y-1.5">
                {brief.priority_actions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-gray-700">
                    <span
                      className="mt-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0"
                      style={{ background: `${BRAND_BLUE}12`, color: BRAND_BLUE }}
                    >
                      {i + 1}
                    </span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[10px] text-gray-400 text-right pt-1">
            Powered by Claude AI · Updates on each scan
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [metrics, setMetrics]               = useState({ activeAlerts: 0, staffTravelling: 0, activeFeeds: 0, compliancePct: null })
  const [complianceBreakdown, setComplianceBreakdown] = useState(null) // { total, training, policies, checkin }
  const [recentAlerts, setRecentAlerts]     = useState([])
  const [myTrips, setMyTrips]               = useState([])
  const [destRisk, setDestRisk]             = useState({})
  const [destAlerts, setDestAlerts]         = useState({})
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [loading, setLoading]               = useState(true)
  const [tripAlerts, setTripAlerts]         = useState([])
  const [dismissedIds, setDismissedIds]     = useState(() => new Set())
  const [morningBrief, setMorningBrief]     = useState(null)
  const [briefLoading, setBriefLoading]     = useState(false)
  const loadingRef                           = useRef(false)

  const load = useCallback(async ({ scanAlerts = false } = {}) => {
    if (loadingRef.current) return
    loadingRef.current = true

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { loadingRef.current = false; return }

    const today = new Date().toISOString().split('T')[0]

    const [
      { count: alertCount },
      { count: travelCount },
      { data: alerts },
      feedStatuses,
      { data: trips },
    ] = await Promise.all([
      supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
      supabase.from('itineraries').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
      supabase.from('alerts').select('*').eq('status', 'Active').order('date_issued', { ascending: false }).limit(4),
      fetch('/api/feed-status').then(r => r.json()).catch(() => ({})),
      supabase.from('itineraries').select('*')
        .eq('user_id', session.user.id)
        .gte('return_date', today)
        .order('depart_date'),
    ])

    // ── ISO compliance score (weighted) ───────────────────────────────────────
    const [
      { data: trainingRecs },
      { data: pols },
      acksResult,
      { data: checkins },
    ] = await Promise.all([
      supabase.from('training_records').select('completed').eq('user_id', session.user.id),
      supabase.from('policies').select('id').eq('status', 'Active'),
      supabase.from('policy_acknowledgements').select('policy_id').eq('user_id', session.user.id).then(r => r).catch(() => ({ data: [] })),
      supabase.from('check_ins').select('id').eq('user_id', session.user.id)
        .gte('checked_in_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .then(r => r).catch(() => ({ data: [] })),
    ])

    const acks = acksResult?.data || []

    // Component scores (each 0-100)
    const trainPct = trainingRecs?.length
      ? Math.round(trainingRecs.filter(r => r.completed).length / trainingRecs.length * 100)
      : 0
    const polPct = pols?.length
      ? Math.round(acks.length / pols.length * 100)
      : 0
    // Check-in score: 100 if ≥1 check-in in last 90 days (or no active trips = N/A → treat as 100)
    const hasActiveTrips = (trips || []).length > 0
    const checkinPct = !hasActiveTrips ? 100 : (checkins?.length || 0) > 0 ? 100 : 0

    // Weighted total: training 40%, policies 40%, check-ins 20%
    const compliancePct = Math.round(trainPct * 0.4 + polPct * 0.4 + checkinPct * 0.2)

    setComplianceBreakdown({
      total:    compliancePct,
      training: { pct: trainPct,   done: trainingRecs?.filter(r => r.completed).length ?? 0, total: trainingRecs?.length ?? 0 },
      policies: { pct: polPct,     done: acks.length,                                          total: pols?.length ?? 0 },
      checkin:  { pct: checkinPct, done: checkins?.length ?? 0,                                hasTrips: hasActiveTrips },
    })

    const activeFeeds = Object.values(feedStatuses || {}).filter(s => s === 'active').length
    setMetrics({ activeAlerts: alertCount || 0, staffTravelling: travelCount || 0, activeFeeds, compliancePct })
    setRecentAlerts(alerts || [])

    const tripList = trips || []
    setMyTrips(tripList)

    const countries = [...new Set(
      tripList.map(t => cityToCountry(t.arrival_city)).filter(Boolean)
    )]
    if (countries.length > 0) {
      const [riskResults, alertResults] = await Promise.all([
        Promise.all(countries.map(c =>
          fetch(`/api/country-risk?country=${encodeURIComponent(c)}`)
            .then(r => r.json()).then(d => [c, d]).catch(() => [c, null])
        )),
        Promise.all(countries.map(c =>
          supabase.from('alerts').select('*', { count: 'exact', head: true })
            .eq('status', 'Active').ilike('country', `%${c}%`)
            .then(({ count }) => [c, count || 0])
        )),
      ])
      setDestRisk(Object.fromEntries(riskResults))
      setDestAlerts(Object.fromEntries(alertResults))
    }

    const { data: ta } = await supabase
      .from('trip_alerts').select('*')
      .eq('user_id', session.user.id)
      .neq('alert_type', 'ai_brief')
      .order('created_at', { ascending: false })
      .limit(30)
    setTripAlerts(ta || [])

    setLoading(false)
    loadingRef.current = false

    if (scanAlerts) {
      setBriefLoading(true)
      try {
        const scanRes = await fetch('/api/trip-alert-scan', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (scanRes.ok) {
          const scanData = await scanRes.json()
          if (scanData.morning_brief) setMorningBrief(scanData.morning_brief)
        }
      } catch { /* non-critical */ }
      setBriefLoading(false)
    }
  }, [])

  useEffect(() => {
    load({ scanAlerts: true })
    const interval = setInterval(() => load({ scanAlerts: false }), 5 * 60 * 1000)
    const channel = supabase
      .channel('dashboard-watch-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itineraries' }, () => load({ scanAlerts: false }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_alerts' }, () => load({ scanAlerts: false }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => load({ scanAlerts: false }))
      .subscribe()
    return () => { clearInterval(interval); supabase.removeChannel(channel) }
  }, [load])

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'

  const travelCountries = [...new Set(
    myTrips.map(t => ({ trip: t, country: cityToCountry(t.arrival_city) }))
      .filter(x => x.country).map(x => x.country)
  )]

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <Layout>
      {selectedCountry && (
        <IntelBrief country={selectedCountry} onClose={() => setSelectedCountry(null)} />
      )}

      {/* ── Page header ── */}
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{today}</p>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">{greeting()}</h1>
        <p className="text-sm text-gray-400 mt-1">Your duty of care overview · SafeGuard360</p>
      </div>

      {/* ── AI Morning Brief ── */}
      {(briefLoading || morningBrief) && (
        <MorningBriefCard brief={morningBrief} loading={briefLoading} />
      )}

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <MetricCard
          label="Compliance Score"
          value={loading ? '–' : metrics.compliancePct !== null ? `${metrics.compliancePct}%` : '–'}
          icon={BarChart2}
          valueColor="text-[#0118A1]" accent="#0118A1"
        />
        <MetricCard
          label="Active Alerts" value={loading ? '–' : metrics.activeAlerts} icon={Bell}
          valueColor={metrics.activeAlerts > 0 ? 'text-red-600' : 'text-gray-900'}
          accent={metrics.activeAlerts > 0 ? '#EF4444' : '#0118A1'}
        />
        <MetricCard
          label="Staff Travelling" value={loading ? '–' : metrics.staffTravelling} icon={Plane}
          valueColor="text-[#0118A1]" accent="#0118A1"
        />
        <MetricCard
          label="Active Feeds" value={loading ? '–' : metrics.activeFeeds} icon={Radio}
          valueColor="text-emerald-600" accent="#059669"
        />
      </div>

      {/* ── My Travel Intel ── */}
      {travelCountries.length > 0 && (
        <div className="mb-7">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: `${BRAND_BLUE}12` }}>
                <Globe size={13} style={{ color: BRAND_BLUE }} />
              </div>
              <h2 className="text-base font-bold text-gray-900">My Travel Intel</h2>
            </div>
            <span className="text-xs text-gray-400 font-medium">
              {myTrips.length} trip{myTrips.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {myTrips.map(trip => {
              const country  = cityToCountry(trip.arrival_city) || trip.arrival_city
              const risk     = destRisk[country]
              const sev      = risk?.severity || trip.risk_level || null
              const style    = sev ? (SEVERITY_STYLE[sev] || SEVERITY_STYLE.Medium) : null
              const alerts   = destAlerts[country] ?? null
              const isActive = trip.depart_date <= new Date().toISOString().split('T')[0]
              const pill     = sev ? SEVERITY_PILL[sev] : null

              return (
                <button key={trip.id}
                  onClick={() => setSelectedCountry(country)}
                  className="bg-white rounded-2xl p-5 text-left transition-all duration-200 hover:-translate-y-0.5 group"
                  style={{
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
                    border: '1px solid rgba(0,0,0,0.06)',
                  }}
                >
                  {/* Top row */}
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                      style={isActive
                        ? { background: `${BRAND_BLUE}12`, color: BRAND_BLUE }
                        : { background: '#F1F5F9', color: '#64748B' }
                      }
                    >
                      {isActive ? '✈️ Active' : '📅 Upcoming'}
                    </span>
                    {pill && (
                      <span
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                        style={{ background: pill.bg, color: pill.color, border: `1px solid ${pill.border}` }}
                      >
                        {sev}
                      </span>
                    )}
                  </div>

                  {/* Trip info */}
                  <h3 className="text-sm font-bold text-gray-900 truncate mb-1">{trip.trip_name}</h3>
                  <p className="text-xs text-gray-400 mb-4">
                    {trip.arrival_city}{country !== trip.arrival_city ? ` · ${country}` : ''}
                  </p>

                  {/* Dates */}
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-3">
                    <Calendar size={10} />
                    {fmtDate(trip.depart_date)} — {fmtDate(trip.return_date)}
                  </div>

                  {/* Alert count */}
                  {alerts !== null && (
                    <div className={`flex items-center gap-1.5 text-[11px] font-semibold mb-4 ${alerts > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {alerts > 0
                        ? <><AlertCircle size={11} />{alerts} active alert{alerts !== 1 ? 's' : ''}</>
                        : <><CheckCircle2 size={11} />No active alerts</>
                      }
                    </div>
                  )}

                  {/* CTA */}
                  <div
                    className="flex items-center gap-1 text-[11px] font-semibold pt-3 transition-all group-hover:gap-1.5"
                    style={{ borderTop: '1px solid #F1F5F9', color: BRAND_BLUE }}
                  >
                    View Full Intel Brief <ChevronRight size={11} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Trip Alerts ── */}
      {(() => {
        const visibleAlerts = tripAlerts.filter(a => !dismissedIds.has(a.id))
        if (!visibleAlerts.length) return null
        return (
          <TripAlertsSection
            alerts={visibleAlerts}
            onMarkRead={(id) => {
              setDismissedIds(prev => new Set([...prev, id]))
              supabase.from('trip_alerts').update({ is_read: true }).eq('id', id).then(() => {})
            }}
            onDismissAll={() => {
              const ids = tripAlerts.map(a => a.id)
              setDismissedIds(prev => new Set([...prev, ...ids]))
              supabase.from('trip_alerts').update({ is_read: true }).in('id', ids).then(() => {})
            }}
          />
        )
      })()}

      {/* ── Two-panel row ── */}
      <div className="flex flex-col lg:flex-row gap-5">

        {/* Live alerts — 60% */}
        <div
          className="lg:w-3/5 bg-white rounded-2xl p-6"
          style={{
            boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
            border: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: '#FEF2F2' }}>
              <Bell size={13} style={{ color: '#EF4444' }} />
            </div>
            <h2 className="text-sm font-bold text-gray-900">Live Risk Alerts</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />)}
            </div>
          ) : recentAlerts.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <CheckCircle2 size={28} className="text-emerald-400" />
              <p className="text-sm text-gray-400 font-medium">All clear — no active alerts</p>
            </div>
          ) : (
            <div className="space-y-0 divide-y divide-gray-50">
              {recentAlerts.map(alert => (
                <div key={alert.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div
                    className="mt-2 w-2 h-2 rounded-full shrink-0"
                    style={{ background: severityDot[alert.severity] || '#94A3B8' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-sm font-semibold text-gray-900">{alert.title}</span>
                      <SeverityBadge severity={alert.severity} />
                    </div>
                    <p className="text-xs text-gray-400 truncate">{alert.description}</p>
                    {alert.country && (
                      <button
                        onClick={() => setSelectedCountry(alert.country)}
                        className="text-[11px] font-semibold flex items-center gap-1 mt-1 hover:underline"
                        style={{ color: BRAND_BLUE }}
                      >
                        <Globe size={9} /> {alert.country} intel →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 pt-4" style={{ borderTop: '1px solid #F1F5F9' }}>
            <Link to="/alerts"
              className="text-xs font-semibold hover:underline flex items-center gap-1"
              style={{ color: BRAND_BLUE }}>
              View all alerts <ChevronRight size={11} />
            </Link>
          </div>
        </div>

        {/* ISO compliance score — 40% */}
        <div className="lg:w-2/5">
          <ComplianceScoreCard breakdown={complianceBreakdown} loading={loading} />
        </div>
      </div>
    </Layout>
  )
}
