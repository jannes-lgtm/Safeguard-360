/**
 * /src/pages/OrgUsers.jsx
 * Corporate Admin view — manage all travellers within their organisation.
 * Shows compliance per user, trip status, training progress.
 */

import { useEffect, useState } from 'react'
import {
  Users, CheckCircle2, AlertTriangle, Clock, MapPin,
  BookOpen, RefreshCw, ChevronDown, ChevronUp, Mail,
  UserPlus, X, Shield,
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
function UserRow({ user, trainingRecs, checkins, activeTrip, pendingApprovals }) {
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
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
          {/* Compliance breakdown */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Training', pct: trainPct, detail: `${completedModules}/${totalModules} modules` },
              { label: 'Check-ins', pct: checkinPct, detail: hasOverdue ? `${pendingCheckins.length} overdue` : 'On track' },
            ].map(item => {
              const ic = complianceColor(item.pct)
              return (
                <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{item.label}</span>
                    <span className={`text-xs font-bold ${ic.text}`}>{item.pct}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${item.pct}%`, background: ic.bar }} />
                  </div>
                  <p className="text-[10px] text-gray-400">{item.detail}</p>
                </div>
              )
            })}
          </div>

          {/* Contact */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Mail size={11} className="text-gray-400" />
            <a href={`mailto:${user.email}`} className="hover:text-[#0118A1] hover:underline">{user.email}</a>
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
  const [showInvite, setShowInvite]     = useState(false)
  const [inviteNote, setInviteNote]     = useState('')

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
        .select('*, training_modules(module_order)')
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

  useEffect(() => { loadData() }, [])

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

      {/* User list */}
      {loading ? (
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
            />
          ))}
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">Invite a Traveller</h2>
              <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                <p className="font-semibold mb-1">How to add travellers</p>
                <ol className="list-decimal list-inside space-y-1 text-xs text-blue-700">
                  <li>Share your organisation invite link or ask them to register</li>
                  <li>Once registered, go to <strong>Supabase → Table Editor → profiles</strong></li>
                  <li>Find their profile row and set <code className="bg-blue-100 px-1 rounded">org_id</code> to your organisation ID</li>
                  <li>Set <code className="bg-blue-100 px-1 rounded">role</code> to <code className="bg-blue-100 px-1 rounded">traveller</code></li>
                </ol>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Your Organisation ID</p>
                <p className="text-xs font-mono text-gray-700 break-all">{adminProfile?.org_id}</p>
              </div>
              <p className="text-xs text-gray-400">
                A self-service invite flow will be available in the next release.
              </p>
            </div>
            <button onClick={() => setShowInvite(false)}
              className="w-full mt-4 px-4 py-2.5 text-sm font-bold rounded-xl"
              style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
              Got it
            </button>
          </div>
        </div>
      )}
    </Layout>
  )
}
