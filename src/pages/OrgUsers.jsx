/**
 * /src/pages/OrgUsers.jsx
 * Corporate Admin view — manage all travellers within their organisation.
 * Shows compliance per user, trip status, training progress.
 */

import { useEffect, useState } from 'react'
import {
  Users, CheckCircle2, AlertTriangle, Clock, MapPin,
  BookOpen, RefreshCw, ChevronDown, ChevronUp, Mail,
  UserPlus, X, Shield, FileText, Printer, Globe,
  Phone, Calendar, Plane, GraduationCap, AlertCircle,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

function timeAgo(d) {
  if (!d) return null
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m ago`
  return `${Math.floor(h / 24)}d ago`
}

function complianceColor(pct) {
  if (pct >= 80) return { text: 'text-green-600',  bg: 'bg-green-100',  bar: '#22c55e' }
  if (pct >= 50) return { text: 'text-amber-600',  bg: 'bg-amber-100',  bar: '#f59e0b' }
  return             { text: 'text-red-600',    bg: 'bg-red-100',    bar: '#ef4444' }
}

// ── User row ──────────────────────────────────────────────────────────────────
function UserRow({ user, trainingRecs, checkins, activeTrip, pendingApprovals, onReinvite, onRemove, reinviting, removing }) {
  const [open, setOpen] = useState(false)

  const totalModules    = trainingRecs.length
  const completedModules = trainingRecs.filter(r => r.completed).length
  const trainPct        = totalModules ? Math.round(completedModules / totalModules * 100) : 0

  const pendingCheckins = checkins.filter(c => !c.completed && new Date(c.due_at) < new Date())
  const hasOverdue      = pendingCheckins.length > 0

  const checkinPct = checkins.length > 0
    ? Math.round(checkins.filter(c => c.completed).length / checkins.length * 100)
    : activeTrip ? 0 : 100

  const compPct   = Math.round(trainPct * 0.6 + checkinPct * 0.4)
  const cc        = complianceColor(compPct)

  const initials = (user.full_name || user.email || '?')
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${
      hasOverdue ? 'border-red-200 bg-red-50/30' : 'border-gray-200 bg-white'
    }`}>
      <button className="w-full flex items-center gap-4 px-4 py-3.5" onClick={() => setOpen(p => !p)}>
        {/* Avatar */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 text-white"
          style={{ background: BRAND_BLUE }}>
          {initials}
        </div>

        {/* Name + status */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {user.full_name || user.email}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {activeTrip ? (
              <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600">
                <MapPin size={9} /> Travelling · {activeTrip.arrival_city}
              </span>
            ) : (
              <span className="text-[10px] text-gray-400">Not travelling</span>
            )}
            {pendingApprovals > 0 && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
                {pendingApprovals} pending approval
              </span>
            )}
            {hasOverdue && (
              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">
                ⚠ Check-in overdue
              </span>
            )}
          </div>
        </div>

        {/* Compliance ring */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className={`text-sm font-bold ${cc.text}`}>{compPct}%</p>
            <p className="text-[10px] text-gray-400">Compliance</p>
          </div>
          {open ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 pb-5 pt-4 space-y-4 bg-gray-50/40">

          {/* Profile info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-3 border border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Contact</p>
              <a href={`mailto:${user.email}`} className="flex items-center gap-1.5 text-xs text-[#0118A1] hover:underline mb-1">
                <Mail size={11}/> {user.email}
              </a>
              {user.phone && (
                <a href={`tel:${user.phone}`} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Phone size={11}/> {user.phone}
                </a>
              )}
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Account</p>
              <p className="text-xs text-gray-700">
                {user.onboarding_completed_at
                  ? <span className="text-green-600 font-semibold">✓ Onboarding complete</span>
                  : <span className="text-amber-600 font-semibold">⚠ Onboarding pending</span>}
              </p>
              {user.created_at && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Joined {new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Current Trip</p>
              {activeTrip ? (
                <>
                  <p className="text-xs font-semibold text-gray-800 truncate">{activeTrip.trip_name || 'Active Trip'}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {activeTrip.departure_city && activeTrip.arrival_city
                      ? `${activeTrip.departure_city} → ${activeTrip.arrival_city}`
                      : activeTrip.arrival_city || ''}
                  </p>
                  {activeTrip.return_date && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Returns {new Date(activeTrip.return_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-400 italic">Not currently travelling</p>
              )}
            </div>
          </div>

          {/* Compliance breakdown */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Compliance Breakdown</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Training', icon: GraduationCap, pct: trainPct, detail: `${completedModules} of ${totalModules} modules complete` },
                { label: 'Check-ins', icon: CheckCircle2, pct: checkinPct, detail: hasOverdue ? `${pendingCheckins.length} overdue check-in${pendingCheckins.length !== 1 ? 's' : ''}` : 'All check-ins on track' },
              ].map(item => {
                const ic = complianceColor(item.pct)
                const Icon = item.icon
                return (
                  <div key={item.label} className="bg-white rounded-xl p-3 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <Icon size={12} className="text-gray-400" />
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{item.label}</span>
                      </div>
                      <span className={`text-sm font-bold ${ic.text}`}>{item.pct}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 mb-1.5">
                      <div className="h-2 rounded-full transition-all" style={{ width: `${item.pct}%`, background: ic.bar }} />
                    </div>
                    <p className="text-[10px] text-gray-400">{item.detail}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Training modules list */}
          {trainingRecs.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Training Modules</p>
              <div className="space-y-1.5">
                {trainingRecs.map((rec, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                    {rec.completed
                      ? <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                      : <AlertCircle size={13} className="text-amber-400 shrink-0" />}
                    <span className="text-xs text-gray-700 flex-1 truncate">
                      {rec.training_modules?.module_name || rec.training_modules?.module_order
                        ? `Module ${rec.training_modules.module_order}`
                        : `Module ${i + 1}`}
                    </span>
                    <span className={`text-[10px] font-semibold ${rec.completed ? 'text-green-600' : 'text-amber-600'}`}>
                      {rec.completed ? 'Complete' : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overdue check-ins */}
          {hasOverdue && (
            <div className="bg-red-50 rounded-xl p-3 border border-red-200">
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide mb-1.5">
                <AlertCircle size={10} className="inline mr-1" />Overdue Check-ins
              </p>
              {pendingCheckins.slice(0, 3).map((c, i) => (
                <p key={i} className="text-xs text-red-700">
                  {c.label || 'Check-in'} — due {new Date(c.due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap pt-1">
            <a href={`mailto:${user.email}`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-85"
              style={{ background: BRAND_BLUE }}>
              <Mail size={12}/> Send Email
            </a>
            <a href={`mailto:${user.email}?subject=SafeGuard360 Check-in Reminder`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-85"
              style={{ border: `1px solid ${BRAND_BLUE}`, color: BRAND_BLUE, background: `${BRAND_BLUE}07` }}>
              <Clock size={12}/> Send Reminder
            </a>
            <button onClick={() => onReinvite(user)} disabled={reinviting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-85 disabled:opacity-40"
              style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
              {reinviting
                ? <><div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> Sending…</>
                : <><UserPlus size={12}/> Resend Invite</>}
            </button>
            <button onClick={() => onRemove(user)} disabled={removing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-85 disabled:opacity-40"
              style={{ border: '1px solid #EF4444', color: '#EF4444', background: '#FEF2F2' }}>
              <X size={12}/> Remove from Org
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OrgUsers() {
  const [adminProfile, setAdminProfile] = useState(null)
  const [users, setUsers]               = useState([])
  const [trainingMap, setTrainingMap]   = useState({})   // user_id → training_records[]
  const [checkinMap, setCheckinMap]     = useState({})   // user_id → scheduled_checkins[]
  const [tripMap, setTripMap]           = useState({})   // user_id → active trip
  const [approvalMap, setApprovalMap]   = useState({})   // user_id → pending count
  const [loading, setLoading]           = useState(true)
  const [activeTab, setActiveTab]       = useState('travellers')
  const [visaLetters, setVisaLetters]   = useState([])
  const [visaLoading, setVisaLoading]   = useState(false)
  const [showInvite, setShowInvite]     = useState(false)
  const [inviteEmail, setInviteEmail]   = useState('')
  const [inviteRole,  setInviteRole]    = useState('traveller')
  const [inviting,    setInviting]      = useState(false)
  const [inviteResult, setInviteResult] = useState(null)  // { ok, invite_url, email_sent } | { error }
  const [reinvitingId, setReinvitingId] = useState(null)
  const [removingId,   setRemovingId]   = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(null) // user object

  const loadData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: prof } = await supabase
      .from('profiles').select('*, organisations(*)').eq('id', user.id).single()

    if (!prof?.org_id) { setLoading(false); return }
    setAdminProfile(prof)

    const today = new Date().toISOString().split('T')[0]
    const orgId = prof.org_id

    // All travellers in this org
    const { data: orgUsers } = await supabase
      .from('profiles')
      .select('*')
      .eq('org_id', orgId)
      .eq('role', 'traveller')
      .order('full_name', { ascending: true })

    setUsers(orgUsers || [])
    if (!orgUsers?.length) { setLoading(false); return }

    const userIds = orgUsers.map(u => u.id)

    // Load all data in parallel
    const [
      { data: trainingRecs },
      { data: scheduledCheckins },
      { data: activeTrips },
      { data: pendingTrips },
    ] = await Promise.all([
      supabase.from('training_records')
        .select('*, training_modules(module_order, module_name)')
        .in('user_id', userIds),
      supabase.from('scheduled_checkins')
        .select('*')
        .in('user_id', userIds),
      supabase.from('itineraries')
        .select('*')
        .in('user_id', userIds)
        .lte('depart_date', today)
        .gte('return_date', today),
      supabase.from('itineraries')
        .select('*')
        .in('user_id', userIds)
        .eq('approval_status', 'pending'),
    ])

    // Build maps
    const tMap = {}, cMap = {}, tripM = {}, appM = {}
    for (const uid of userIds) {
      tMap[uid]  = (trainingRecs || []).filter(r => r.user_id === uid)
      cMap[uid]  = (scheduledCheckins || []).filter(c => c.user_id === uid)
      tripM[uid] = (activeTrips || []).find(t => t.user_id === uid) || null
      appM[uid]  = (pendingTrips || []).filter(t => t.user_id === uid).length
    }

    setTrainingMap(tMap)
    setCheckinMap(cMap)
    setTripMap(tripM)
    setApprovalMap(appM)
    setLoading(false)
  }

  const loadVisaLetters = async (orgId) => {
    setVisaLoading(true)
    const { data } = await supabase
      .from('visa_letter_requests')
      .select('*, profiles(full_name, email)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)
    setVisaLetters(data || [])
    setVisaLoading(false)
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (activeTab === 'visa' && adminProfile?.org_id) {
      loadVisaLetters(adminProfile.org_id)
    }
  }, [activeTab, adminProfile])

  const handleInvite = async (e) => {
    e.preventDefault()
    setInviting(true)
    setInviteResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/invite-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      const data = await r.json()
      setInviteResult(data)
      if (data.ok) setInviteEmail('')
    } catch {
      setInviteResult({ error: 'Network error. Please try again.' })
    } finally {
      setInviting(false)
    }
  }

  const handleReinvite = async (user) => {
    setReinvitingId(user.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email: user.email, role: user.role || 'traveller' }),
      })
    } finally {
      setReinvitingId(null)
    }
  }

  const doRemove = async (user) => {
    setRemovingId(user.id)
    setConfirmRemove(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ user_id: user.id }),
      })
      setUsers(prev => prev.filter(u => u.id !== user.id))
    } finally {
      setRemovingId(null)
    }
  }

  const travelling = users.filter(u => tripMap[u.id])
  const overdue    = users.filter(u => {
    const pending = (checkinMap[u.id] || []).filter(c => !c.completed && new Date(c.due_at) < new Date())
    return pending.length > 0
  })

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Our Travellers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {adminProfile?.organisations?.name} · {users.length} traveller{users.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
            <UserPlus size={15} /> Invite Traveller
          </button>
        </div>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { id: 'travellers', label: 'Travellers',    icon: Users       },
          { id: 'pending',    label: 'Pending Setup', icon: AlertCircle, count: users.filter(u => !u.onboarding_completed_at).length },
          { id: 'visa',       label: 'Visa Letters',  icon: FileText    },
        ].map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={activeTab === t.id
                ? { background: 'white', color: BRAND_BLUE, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                : { color: '#64748B' }}>
              <Icon size={14} /> {t.label}
              {t.count > 0 && (
                <span className="ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{t.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Currently Travelling', value: travelling.length, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
          { label: 'Check-in Overdue',     value: overdue.length,    color: 'text-red-600',  bg: 'bg-red-50 border-red-200' },
          { label: 'Total Travellers',     value: users.length,      color: 'text-gray-800', bg: 'bg-gray-50 border-gray-200' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Visa Letters Tab ── */}
      {activeTab === 'visa' && (
        <div>
          {visaLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-xl border animate-pulse"/>)}
            </div>
          ) : visaLetters.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
              <FileText size={36} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No visa letters generated yet</p>
              <p className="text-gray-300 text-xs mt-1">Travellers can generate letters from the Visa Assistant page</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visaLetters.map(l => (
                <div key={l.id} className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: `${BRAND_BLUE}12` }}>
                        <Globe size={15} style={{ color: BRAND_BLUE }} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">
                          {l.profiles?.full_name || l.profiles?.email || 'Unknown traveller'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {l.passport_country} → {l.destination_country} · {l.travel_purpose}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {l.depart_date} – {l.return_date}
                          {l.trip_name ? ` · ${l.trip_name}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                        {l.status}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(l.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  {l.letter_text && (
                    <details className="mt-3">
                      <summary className="text-xs font-semibold cursor-pointer" style={{ color: BRAND_BLUE }}>
                        View letter
                      </summary>
                      <pre className="mt-3 whitespace-pre-wrap text-xs text-gray-600 leading-relaxed font-serif bg-gray-50 rounded-lg p-4 border border-gray-100 max-h-64 overflow-y-auto">
                        {l.letter_text}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Pending Setup Tab ── */}
      {activeTab === 'pending' && (() => {
        const pending = users.filter(u => !u.onboarding_completed_at)
        return loading ? (
          <div className="space-y-3">
            {[1,2].map(i => <div key={i} className="h-16 bg-white rounded-xl border animate-pulse"/>)}
          </div>
        ) : pending.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <CheckCircle2 size={36} className="text-green-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">All travellers have completed setup</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 mb-3">
              <strong>{pending.length} traveller{pending.length !== 1 ? 's' : ''}</strong> {pending.length === 1 ? 'has' : 'have'} not completed onboarding.
              Use <strong>Resend Invite</strong> to send them a fresh signup link, or <strong>Remove from Org</strong> to revoke access.
            </div>
            {pending.map(u => (
              <UserRow
                key={u.id}
                user={u}
                trainingRecs={trainingMap[u.id] || []}
                checkins={checkinMap[u.id] || []}
                activeTrip={tripMap[u.id]}
                pendingApprovals={approvalMap[u.id] || 0}
                onReinvite={handleReinvite}
                onRemove={u => setConfirmRemove(u)}
                reinviting={reinvitingId === u.id}
                removing={removingId === u.id}
              />
            ))}
          </div>
        )
      })()}

      {/* ── Travellers Tab ── */}
      {activeTab === 'travellers' && (
        loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-xl border animate-pulse"/>)}
          </div>
        ) : users.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <Users size={36} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No travellers yet</p>
            <p className="text-gray-300 text-xs mt-1">Invite your first team member to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <UserRow
                key={u.id}
                user={u}
                trainingRecs={trainingMap[u.id] || []}
                checkins={checkinMap[u.id] || []}
                activeTrip={tripMap[u.id]}
                pendingApprovals={approvalMap[u.id] || 0}
                onReinvite={handleReinvite}
                onRemove={u => setConfirmRemove(u)}
                reinviting={reinvitingId === u.id}
                removing={removingId === u.id}
              />
            ))}
          </div>
        )
      )}

      {/* Remove confirmation modal */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <X size={18} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Remove from Organisation</h2>
                <p className="text-xs text-gray-500 mt-0.5">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Are you sure you want to remove <strong>{confirmRemove.full_name || confirmRemove.email}</strong> from your organisation?
              Their account will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRemove(null)}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => doRemove(confirmRemove)} disabled={removingId === confirmRemove.id}
                className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {removingId === confirmRemove.id
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Removing…</>
                  : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900">Invite a Team Member</h2>
              <button onClick={() => { setShowInvite(false); setInviteResult(null); setInviteEmail('') }}
                className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            {inviteResult?.ok ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <p className="font-semibold text-green-800 mb-1">
                    {inviteResult.email_sent ? '✓ Invite sent!' : '✓ Invite created'}
                  </p>
                  <p className="text-xs text-green-700">
                    {inviteResult.email_sent
                      ? `An invite email has been sent to ${inviteEmail || 'the user'}.`
                      : 'Copy the link below and share it manually.'}
                  </p>
                </div>
                {inviteResult.invite_url && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Invite link</p>
                    <p className="text-xs font-mono text-gray-700 break-all">{inviteResult.invite_url}</p>
                    <button onClick={() => navigator.clipboard.writeText(inviteResult.invite_url)}
                      className="mt-2 text-xs font-semibold text-[#0118A1] hover:underline">
                      Copy link
                    </button>
                  </div>
                )}
                <button onClick={() => { setInviteResult(null); setInviteEmail('') }}
                  className="w-full py-2.5 text-sm font-bold rounded-xl"
                  style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
                  Invite another
                </button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                  <input
                    type="email" required
                    value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20">
                    <option value="traveller">Traveller</option>
                    <option value="org_admin">Company Administrator</option>
                  </select>
                </div>
                {inviteResult?.error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {inviteResult.error}
                  </p>
                )}
                <button type="submit" disabled={inviting}
                  className="w-full py-2.5 text-sm font-bold rounded-xl disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
                  {inviting
                    ? <><div className="w-4 h-4 border-2 border-[#0118A1] border-t-transparent rounded-full animate-spin" /> Sending…</>
                    : 'Send Invite'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
