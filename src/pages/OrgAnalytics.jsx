import { useEffect, useState } from 'react'
import {
  Users, Plane, AlertTriangle, Clock, CheckCircle2,
  TrendingUp, Shield, FileWarning, Calendar, MapPin,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const BRAND_BLUE = '#0118A1'
const BRAND_LIME = '#AACC00'

const RISK_COLOR  = { Critical: '#DC2626', High: '#EA580C', Medium: '#D97706', Low: '#059669' }
const TYPE_LABEL  = {
  security: 'Security Threat', health: 'Health / Medical', near_miss: 'Near Miss',
  accident: 'Accident / Injury', theft: 'Theft / Crime', political: 'Political Unrest',
  natural_disaster: 'Natural Disaster', other: 'Other',
}

function StatCard({ label, value, sub, icon: Icon, color, bg }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg || `${color}12` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-bold leading-none mb-1" style={{ color }}>{value}</p>
        <p className="text-xs font-semibold text-gray-500">{label}</p>
        {sub && <p className="text-[10px] text-gray-300 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function ComplianceBar({ label, rate, sub, color }) {
  const pct = rate ?? null
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</p>
        <span className="text-xl font-bold" style={{ color: color || BRAND_BLUE }}>
          {pct !== null ? `${pct}%` : '—'}
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
        <div className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct ?? 0}%`, background: pct === null ? '#E5E7EB' : pct >= 80 ? BRAND_LIME : pct >= 50 ? '#D97706' : '#EF4444' }} />
      </div>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  )
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const SEV_STYLE = {
  Critical: { bg: '#FEF2F2', color: '#DC2626' },
  High:     { bg: '#FFF7ED', color: '#EA580C' },
  Medium:   { bg: '#FEFCE8', color: '#A16207' },
  Low:      { bg: '#F0FDF4', color: '#15803D' },
}

export default function OrgAnalytics() {
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [stats, setStats]       = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: myProfile } = await supabase
        .from('profiles').select('org_id').eq('id', user.id).single()

      if (!myProfile?.org_id) { setError('No organisation found.'); setLoading(false); return }

      const { data: orgUsers } = await supabase
        .from('profiles').select('id, full_name').eq('org_id', myProfile.org_id)
      const orgUserIds = (orgUsers || []).map(u => u.id)
      if (!orgUserIds.length) { setStats(empty()); setLoading(false); return }

      const [tripsRes, incRes, debRes] = await Promise.all([
        supabase.from('itineraries').select('*').in('user_id', orgUserIds),
        supabase.from('incidents').select('*').in('user_id', orgUserIds),
        supabase.from('trip_debriefs')
          .select('trip_id, overall_safety_rating, briefing_usefulness, risk_assessment_accuracy, had_security_incident, had_medical_issue, had_transport_issue')
          .in('user_id', orgUserIds),
      ])

      const trips     = tripsRes.data || []
      const incidents = incRes.data   || []
      const debriefs  = debRes.data   || []

      const tripIds = trips.map(t => t.id)
      let training = []
      if (tripIds.length) {
        const { data: tr } = await supabase
          .from('trip_training_assignments').select('trip_id, completed').in('trip_id', tripIds)
        training = tr || []
      }

      setStats(derive({ trips, incidents, debriefs, training, orgUsers: orgUsers || [] }))
    } catch (e) {
      setError('Failed to load analytics.')
      console.error(e)
    }
    setLoading(false)
  }

  function empty() {
    return { activeTrips: [], pendingTrips: [], completedTrips: [], thisMonthTrips: [],
      upcomingDepartures: [], openIncidents: [], allIncidents: [], debriefs: [],
      debriefRate: 0, debriefDone: 0, trainingCompliance: null, trainingTrips: 0, trainingDone: 0,
      avgSafetyRating: null, ratingCount: 0, riskBreakdown: [], incidentByType: [], orgUsers: [] }
  }

  function derive({ trips, incidents, debriefs, training, orgUsers }) {
    const now         = new Date()
    const todayStr    = now.toISOString().split('T')[0]
    const nextWeekStr = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]
    const monthStart  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const activeTrips   = trips.filter(t => t.status === 'Active')
    const pendingTrips  = trips.filter(t => t.approval_status === 'pending')
    const completedTrips = trips.filter(t => t.status === 'Completed')
    const approvedTrips  = trips.filter(t => t.approval_status === 'approved')
    const thisMonthTrips = trips.filter(t => (t.submitted_at || t.created_at) >= monthStart)
    const upcomingDepartures = trips
      .filter(t => t.status === 'Upcoming' && t.depart_date >= todayStr && t.depart_date <= nextWeekStr)
      .sort((a, b) => a.depart_date.localeCompare(b.depart_date))

    // Debrief completion
    const debriefedIds = new Set(debriefs.map(d => d.trip_id))
    const debriefDone  = completedTrips.filter(t => debriefedIds.has(t.id)).length
    const debriefRate  = completedTrips.length ? Math.round(debriefDone / completedTrips.length * 100) : 0

    // Training compliance
    const trainingMap = {}
    for (const t of training) {
      if (!trainingMap[t.trip_id]) trainingMap[t.trip_id] = { total: 0, done: 0 }
      trainingMap[t.trip_id].total++
      if (t.completed) trainingMap[t.trip_id].done++
    }
    const withTraining   = Object.values(trainingMap).filter(v => v.total > 0)
    const trainingDone   = withTraining.filter(v => v.done === v.total).length
    const trainingCompliance = withTraining.length ? Math.round(trainingDone / withTraining.length * 100) : null

    // Average safety rating
    const ratedDebriefs    = debriefs.filter(d => d.overall_safety_rating > 0)
    const avgSafetyRating  = ratedDebriefs.length
      ? (ratedDebriefs.reduce((s, d) => s + d.overall_safety_rating, 0) / ratedDebriefs.length).toFixed(1)
      : null

    // Risk breakdown (approved only)
    const riskBreakdown = ['Critical', 'High', 'Medium', 'Low'].map(r => ({
      label: r, count: approvedTrips.filter(t => t.risk_level === r).length, color: RISK_COLOR[r],
    })).filter(r => r.count > 0)

    // Incident breakdown
    const typeCounts = incidents.reduce((acc, i) => { acc[i.type] = (acc[i.type] || 0) + 1; return acc }, {})
    const incidentByType = Object.entries(typeCounts)
      .map(([type, count]) => ({ type, label: TYPE_LABEL[type] || type, count }))
      .sort((a, b) => b.count - a.count)

    const openIncidents = incidents.filter(i => ['Open', 'Under Review'].includes(i.status))
    const recentIncidents = [...incidents]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)

    return {
      orgUsers, activeTrips, pendingTrips, completedTrips, thisMonthTrips,
      upcomingDepartures, openIncidents, recentIncidents, allIncidents: incidents,
      debriefs, debriefRate, debriefDone, ratingCount: ratedDebriefs.length,
      trainingCompliance, trainingTrips: withTraining.length, trainingDone,
      avgSafetyRating, riskBreakdown, incidentByType,
      totalTrips: trips.length,
    }
  }

  if (loading) return (
    <Layout>
      <div className="space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    </Layout>
  )

  if (error) return (
    <Layout>
      <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-sm text-red-700">{error}</div>
    </Layout>
  )

  const s = stats

  return (
    <Layout>

      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">ISO 31030 · Clause 9.1</p>
        <h1 className="text-2xl font-bold text-gray-900">Compliance Analytics</h1>
        <p className="text-sm text-gray-500 mt-0.5">Organisation-wide travel risk performance metrics</p>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active Travellers" value={s.activeTrips.length}
          sub={`${s.orgUsers.length} total in org`} icon={Users} color={BRAND_BLUE} />
        <StatCard label="Pending Approvals" value={s.pendingTrips.length}
          sub="Awaiting review" icon={Clock}
          color={s.pendingTrips.length > 0 ? '#D97706' : '#059669'} />
        <StatCard label="Open Incidents" value={s.openIncidents.length}
          sub={`${s.allIncidents.length} total reported`} icon={AlertTriangle}
          color={s.openIncidents.length > 0 ? '#DC2626' : '#059669'} />
        <StatCard label="Trips This Month" value={s.thisMonthTrips.length}
          sub={`${s.totalTrips} all time`} icon={Plane} color={BRAND_BLUE} />
      </div>

      {/* Compliance metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <ComplianceBar
          label="Debrief Completion"
          rate={s.debriefRate}
          sub={`${s.debriefDone} of ${s.completedTrips.length} completed trips debriefed`}
        />
        <ComplianceBar
          label="Training Compliance"
          rate={s.trainingCompliance}
          sub={s.trainingCompliance !== null
            ? `${s.trainingDone} of ${s.trainingTrips} trips fully completed`
            : 'No training assignments yet'}
        />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Avg Safety Rating</p>
            <TrendingUp size={14} className="text-gray-300" />
          </div>
          <p className="text-3xl font-bold mb-1" style={{ color: BRAND_BLUE }}>
            {s.avgSafetyRating ?? '—'}
            {s.avgSafetyRating && <span className="text-sm font-normal text-gray-400"> / 5</span>}
          </p>
          <p className="text-[10px] text-gray-400">
            {s.ratingCount > 0 ? `From ${s.ratingCount} post-travel debrief${s.ratingCount !== 1 ? 's' : ''}` : 'No debrief ratings yet'}
          </p>
          <div className="mt-3 pt-3 border-t border-gray-50">
            <div className="flex items-center gap-2 text-[10px] text-gray-400">
              <CheckCircle2 size={10} className="text-green-400 shrink-0" />
              Avg briefing usefulness: <strong className="text-gray-600">
                {s.debriefs.filter(d => d.briefing_usefulness > 0).length
                  ? (s.debriefs.filter(d => d.briefing_usefulness > 0).reduce((a, d) => a + d.briefing_usefulness, 0)
                    / s.debriefs.filter(d => d.briefing_usefulness > 0).length).toFixed(1)
                  : '—'}/5
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Risk breakdown + incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

        {/* Trips by risk */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={14} color={BRAND_BLUE} />
            <h3 className="text-sm font-bold text-gray-900">Trips by Risk Level</h3>
            <span className="ml-auto text-xs text-gray-400">{s.totalTrips} total</span>
          </div>
          {s.riskBreakdown.length === 0 ? (
            <p className="text-sm text-gray-300 py-4 text-center">No approved trips yet</p>
          ) : (
            <div className="space-y-3">
              {s.riskBreakdown.map(r => (
                <div key={r.label} className="flex items-center gap-3">
                  <span className="text-xs font-bold w-16 shrink-0" style={{ color: r.color }}>{r.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full transition-all"
                      style={{ width: `${r.count / Math.max(...s.riskBreakdown.map(x => x.count)) * 100}%`, background: r.color }} />
                  </div>
                  <span className="text-xs font-bold text-gray-600 w-6 text-right">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Incidents by type */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileWarning size={14} color="#DC2626" />
            <h3 className="text-sm font-bold text-gray-900">Incidents by Type</h3>
            <span className="ml-auto text-xs text-gray-400">{s.allIncidents.length} total</span>
          </div>
          {s.incidentByType.length === 0 ? (
            <p className="text-sm text-gray-300 py-4 text-center">No incidents reported</p>
          ) : (
            <div className="space-y-2.5">
              {s.incidentByType.slice(0, 6).map(i => (
                <div key={i.type} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-32 shrink-0 truncate">{i.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-red-400 transition-all"
                      style={{ width: `${i.count / Math.max(...s.incidentByType.map(x => x.count)) * 100}%` }} />
                  </div>
                  <span className="text-xs font-bold text-gray-600 w-5 text-right">{i.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming departures — next 7 days */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={14} color={BRAND_BLUE} />
          <h3 className="text-sm font-bold text-gray-900">Upcoming Departures — Next 7 Days</h3>
          <span className="ml-auto text-xs text-gray-400">{s.upcomingDepartures.length} trip{s.upcomingDepartures.length !== 1 ? 's' : ''}</span>
        </div>
        {s.upcomingDepartures.length === 0 ? (
          <p className="text-sm text-gray-300 py-3 text-center">No departures in the next 7 days</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Traveller</th>
                  <th className="text-left pb-2 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Trip</th>
                  <th className="text-left pb-2 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Destination</th>
                  <th className="text-left pb-2 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Departs</th>
                  <th className="text-left pb-2 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {s.upcomingDepartures.map(t => {
                  const traveller = s.orgUsers.find(u => u.id === t.user_id)
                  const rc = RISK_COLOR[t.risk_level] || RISK_COLOR.Medium
                  return (
                    <tr key={t.id}>
                      <td className="py-2.5 font-semibold text-gray-700">{traveller?.full_name || '—'}</td>
                      <td className="py-2.5 text-gray-600">{t.trip_name}</td>
                      <td className="py-2.5">
                        <span className="flex items-center gap-1 text-gray-500">
                          <MapPin size={9} /> {t.arrival_city || '—'}
                        </span>
                      </td>
                      <td className="py-2.5 font-semibold text-gray-700">{fmtDate(t.depart_date)}</td>
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: `${rc}15`, color: rc }}>
                          {t.risk_level || 'Medium'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent incidents */}
      {s.recentIncidents?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={14} color="#DC2626" />
            <h3 className="text-sm font-bold text-gray-900">Recent Incidents</h3>
          </div>
          <div className="space-y-2">
            {s.recentIncidents.map(inc => {
              const ss = SEV_STYLE[inc.severity] || SEV_STYLE.Medium
              return (
                <div key={inc.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0"
                    style={{ background: ss.bg, color: ss.color }}>{inc.severity}</span>
                  <span className="text-xs font-semibold text-gray-800 flex-1 truncate">{inc.title}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{TYPE_LABEL[inc.type] || inc.type}</span>
                  <span className="text-[10px] text-gray-300 shrink-0">{fmtDate(inc.incident_date)}</span>
                  <span className="text-[10px] font-semibold shrink-0"
                    style={{ color: inc.status === 'Resolved' ? '#059669' : '#D97706' }}>
                    {inc.status}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </Layout>
  )
}
