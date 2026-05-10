/**
 * /admin — Platform Admin Control Center
 * Visible to: admin, developer roles only
 * Tabs: Overview · Travellers · Organisations · Feeds
 */

import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  LayoutGrid, Users, Building2, Radio, Newspaper,
  Plane, CheckCircle2, AlertTriangle, Clock, Search,
  RefreshCw, ExternalLink, Activity, Wifi, WifiOff,
  Shield, Key, Handshake, Zap, Globe, Swords,
  HeartPulse, CloudRain, ChevronRight, Filter,
  UserCheck, UserX, ArrowUpRight,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const TABS = [
  { id: 'overview',  label: 'Overview',       icon: LayoutGrid },
  { id: 'travellers',label: 'Travellers',      icon: Users },
  { id: 'orgs',      label: 'Organisations',   icon: Building2 },
  { id: 'feeds',     label: 'Intel & Feeds',   icon: Radio },
]

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = BRAND_BLUE, link }) {
  const inner = (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4 hover:shadow-md transition-shadow">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}18` }}>
        <Icon size={20} color={color} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 leading-none">{value ?? '—'}</p>
        <p className="text-sm font-medium text-gray-600 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {link && <ArrowUpRight size={14} className="text-gray-300 ml-auto shrink-0 mt-1" />}
    </div>
  )
  return link ? <Link to={link}>{inner}</Link> : inner
}

// ── Status pill ───────────────────────────────────────────────────────────────
function Pill({ label, color = 'gray' }) {
  const map = {
    green:  'bg-green-100 text-green-700 border-green-200',
    red:    'bg-red-100 text-red-700 border-red-200',
    amber:  'bg-amber-100 text-amber-700 border-amber-200',
    blue:   'bg-blue-100 text-blue-700 border-blue-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    gray:   'bg-gray-100 text-gray-600 border-gray-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${map[color]}`}>
      {label}
    </span>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 8 }) {
  const colors = ['#0118A1', '#7C3AED', '#059669', '#DC2626', '#D97706', '#0891B2']
  const i = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length
  return (
    <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0`}
      style={{ background: colors[i], minWidth: `${size * 4}px`, minHeight: `${size * 4}px` }}>
      {initials(name)}
    </div>
  )
}

// ── BUILTIN feed statuses (subset for health display) ─────────────────────────
const BUILTIN_FEEDS = [
  { id: 'flightaware',       name: 'FlightAware AeroAPI',       category: 'flight',        status: 'active' },
  { id: 'aisstream',         name: 'AISStream',                  category: 'vessel',        status: 'pending_key' },
  { id: 'acled',             name: 'ACLED',                      category: 'conflict',      status: 'pending_key' },
  { id: 'ucdp',              name: 'UCDP',                       category: 'conflict',      status: 'active' },
  { id: 'state-dept',        name: 'US State Dept Advisories',   category: 'country-risk',  status: 'active' },
  { id: 'fcdo',              name: 'UK FCDO Advisories',         category: 'country-risk',  status: 'active' },
  { id: 'ocha-hapi',         name: 'UN OCHA HAPI',               category: 'security',      status: 'pending_key' },
  { id: 'who-outbreak',      name: 'WHO Disease Outbreak News',  category: 'health',        status: 'active' },
  { id: 'cdc-travel-health', name: 'CDC Travel Health Notices',  category: 'health',        status: 'active' },
  { id: 'ecdc-threats',      name: 'ECDC Communicable Threats',  category: 'health',        status: 'active' },
  { id: 'promed',            name: 'ProMED Mail',                category: 'health',        status: 'active' },
  { id: 'whatsapp',          name: 'WhatsApp Community',         category: 'community',     status: 'active' },
  { id: 'gdacs',             name: 'GDACS (UN Disasters)',       category: 'weather',       status: 'active' },
  { id: 'usgs',              name: 'USGS Earthquakes',           category: 'weather',       status: 'active' },
  { id: 'openweathermap',    name: 'OpenWeatherMap',             category: 'weather',       status: 'pending_key' },
  { id: 'eonet',             name: 'NASA EONET',                 category: 'weather',       status: 'active' },
  { id: 'open-meteo',        name: 'Open-Meteo',                category: 'weather',       status: 'active' },
  { id: 'osac',              name: 'OSAC',                       category: 'security',      status: 'pending' },
  { id: 'control-risks',     name: 'Control Risks',              category: 'security',      status: 'partnership' },
  { id: 'crisis24',          name: 'Crisis24 (Garda World)',     category: 'security',      status: 'partnership' },
  { id: 'dataminr',          name: 'Dataminr',                   category: 'security',      status: 'partnership' },
]

const NEWS_FEEDS = [
  { id: 'bbc-africa',    name: 'BBC Africa',              status: 'active' },
  { id: 'reuters',       name: 'Reuters Africa',          status: 'active' },
  { id: 'aljazeera',    name: 'Al Jazeera',               status: 'active' },
  { id: 'dailymaverick', name: 'Daily Maverick',          status: 'active' },
  { id: 'theafricareport', name: 'The Africa Report',     status: 'active' },
]

const FEED_STATUS_LABEL = {
  active:      { label: 'Live',        color: 'green',  dot: '#22C55E' },
  pending_key: { label: 'Needs API Key', color: 'amber', dot: '#F59E0B' },
  pending:     { label: 'Pending',     color: 'gray',   dot: '#9CA3AF' },
  partnership: { label: 'Partnership', color: 'purple', dot: '#7C3AED' },
}

const CAT_ICON = {
  flight:       Plane,
  vessel:       Globe,
  conflict:     Swords,
  'country-risk': Shield,
  security:     Shield,
  health:       HeartPulse,
  community:    Users,
  weather:      CloudRain,
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AdminControlCenter() {
  const [tab, setTab]             = useState('overview')
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Data
  const [profiles, setProfiles]   = useState([])
  const [orgs, setOrgs]           = useState([])
  const [trips, setTrips]         = useState([])     // active itineraries

  // Filters
  const [search, setSearch]       = useState('')
  const [orgFilter, setOrgFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [feedCatFilter, setFeedCatFilter] = useState('all')

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true)
    else setRefreshing(true)

    const today = new Date().toISOString().slice(0, 10)

    const [{ data: profs }, { data: os }, { data: ts }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, role, org_id, onboarding_completed_at, terms_accepted_at, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('organisations')
        .select('id, name, industry, country, subscription_plan, org_onboarding_completed_at, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('itineraries')
        .select('id, user_id, destination, departure_date, return_date, approval_status')
        .lte('departure_date', today)
        .gte('return_date', today),
    ])

    setProfiles(profs || [])
    setOrgs(os || [])
    setTrips(ts || [])
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { load() }, [])

  // ── Derived stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const travellers      = profiles.filter(p => ['traveller', 'solo'].includes(p.role))
    const onboarded       = travellers.filter(p => p.onboarding_completed_at)
    const activeTrips     = trips.length
    const travellerIds    = new Set(trips.map(t => t.user_id))
    const currentTravellers = travellers.filter(p => travellerIds.has(p.id))
    const liveFeeds       = BUILTIN_FEEDS.filter(f => f.status === 'active').length
    const needsKey        = BUILTIN_FEEDS.filter(f => f.status === 'pending_key').length

    return { travellers, onboarded, activeTrips, currentTravellers, liveFeeds, needsKey }
  }, [profiles, trips])

  // ── Org lookup ─────────────────────────────────────────────────────────────
  const orgMap = useMemo(() => {
    const m = {}
    orgs.forEach(o => { m[o.id] = o })
    return m
  }, [orgs])

  // ── Org traveller counts ───────────────────────────────────────────────────
  const orgTravellerCount = useMemo(() => {
    const m = {}
    profiles.forEach(p => {
      if (p.org_id) m[p.org_id] = (m[p.org_id] || 0) + 1
    })
    return m
  }, [profiles])

  // ── Currently-travelling set ───────────────────────────────────────────────
  const currentlyTravellingIds = useMemo(() => new Set(trips.map(t => t.user_id)), [trips])

  // ── Filtered travellers ────────────────────────────────────────────────────
  const filteredProfiles = useMemo(() => {
    return profiles.filter(p => {
      if (roleFilter !== 'all' && p.role !== roleFilter) return false
      if (orgFilter !== 'all' && p.org_id !== orgFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!(p.full_name || '').toLowerCase().includes(q) &&
            !(p.email     || '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [profiles, search, orgFilter, roleFilter])

  // ── Filtered feeds ─────────────────────────────────────────────────────────
  const filteredFeeds = useMemo(() => {
    return BUILTIN_FEEDS.filter(f =>
      feedCatFilter === 'all' || f.category === feedCatFilter
    )
  }, [feedCatFilter])

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-[#0118A1] border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Control Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">Platform-wide view of users, organisations, and intel feeds</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-xl bg-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors flex-1 justify-center
                ${tab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={Building2}    label="Organisations"        value={orgs.length}                       color={BRAND_BLUE}  link="/admin" />
            <KpiCard icon={Users}        label="Total Travellers"     value={stats.travellers.length}            color="#7C3AED"    link="/admin" />
            <KpiCard icon={Plane}        label="Currently Travelling" value={stats.currentTravellers.length}     color="#059669"    />
            <KpiCard icon={Activity}     label="Live Intel Feeds"     value={stats.liveFeeds}
              sub={stats.needsKey ? `${stats.needsKey} need API keys` : 'All active'} color={BRAND_GREEN} />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={UserCheck}    label="Onboarding Complete"  value={stats.onboarded.length}
              sub={`of ${stats.travellers.length} travellers`} color="#0891B2" />
            <KpiCard icon={UserX}        label="Not Yet Onboarded"
              value={stats.travellers.length - stats.onboarded.length}
              sub="Awaiting profile completion" color="#DC2626" />
            <KpiCard icon={CheckCircle2} label="Active Trips"         value={stats.activeTrips}   color="#D97706" />
            <KpiCard icon={Key}          label="Feeds Needing Keys"   value={stats.needsKey}       color="#9CA3AF" link="/intel-feeds" />
          </div>

          {/* Recent travellers */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">Recent Sign-ups</h2>
              <button onClick={() => setTab('travellers')}
                className="text-xs text-[#0118A1] font-medium hover:underline flex items-center gap-1">
                View all <ChevronRight size={12} />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {profiles.slice(0, 8).map(p => {
                const org = orgMap[p.org_id]
                const travelling = currentlyTravellingIds.has(p.id)
                return (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={p.full_name} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.full_name || '—'}</p>
                      <p className="text-xs text-gray-400 truncate">{p.email}</p>
                    </div>
                    <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                      {org && <span className="text-[10px] text-gray-500 truncate max-w-[120px]">{org.name}</span>}
                      <div className="flex gap-1">
                        {travelling && <Pill label="Travelling" color="green" />}
                        <Pill
                          label={p.role === 'org_admin' ? 'Org Admin' : p.role === 'traveller' ? 'Traveller' : p.role}
                          color={p.role === 'org_admin' ? 'blue' : 'gray'}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-gray-300 shrink-0 hidden lg:block">{fmtDate(p.created_at)}</span>
                  </div>
                )
              })}
              {profiles.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No users yet.</p>
              )}
            </div>
          </div>

          {/* Recent orgs */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">Recent Organisations</h2>
              <button onClick={() => setTab('orgs')}
                className="text-xs text-[#0118A1] font-medium hover:underline flex items-center gap-1">
                View all <ChevronRight size={12} />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {orgs.slice(0, 5).map(o => (
                <div key={o.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <Building2 size={14} color={BRAND_BLUE} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{o.name}</p>
                    <p className="text-xs text-gray-400">{o.industry || o.country || '—'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-gray-500">{orgTravellerCount[o.id] || 0} users</span>
                    <Pill
                      label={o.org_onboarding_completed_at ? 'Active' : 'Setup pending'}
                      color={o.org_onboarding_completed_at ? 'green' : 'amber'}
                    />
                  </div>
                </div>
              ))}
              {orgs.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No organisations yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TRAVELLERS ── */}
      {tab === 'travellers' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1]"
                placeholder="Search by name or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0118A1]"
              value={orgFilter}
              onChange={e => setOrgFilter(e.target.value)}
            >
              <option value="all">All organisations</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              <option value="">No organisation</option>
            </select>
            <select
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0118A1]"
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
            >
              <option value="all">All roles</option>
              <option value="traveller">Traveller</option>
              <option value="org_admin">Org Admin</option>
              <option value="solo">Solo</option>
              <option value="admin">Platform Admin</option>
              <option value="developer">Developer</option>
            </select>
          </div>

          <p className="text-xs text-gray-400">{filteredProfiles.length} result{filteredProfiles.length !== 1 ? 's' : ''}</p>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">User</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Organisation</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Onboarding</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden xl:table-cell">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredProfiles.map(p => {
                    const org = orgMap[p.org_id]
                    const travelling = currentlyTravellingIds.has(p.id)
                    const rolePill = {
                      traveller:  { label: 'Traveller',     color: 'blue' },
                      solo:       { label: 'Solo',          color: 'blue' },
                      org_admin:  { label: 'Org Admin',     color: 'purple' },
                      admin:      { label: 'Platform Admin',color: 'green' },
                      developer:  { label: 'Developer',     color: 'gray' },
                    }[p.role] || { label: p.role, color: 'gray' }

                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={p.full_name} size={8} />
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 truncate">{p.full_name || '—'}</p>
                              <p className="text-xs text-gray-400 truncate">{p.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {org
                            ? <span className="text-gray-700 font-medium">{org.name}</span>
                            : <span className="text-gray-400 italic">None</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Pill label={rolePill.label} color={rolePill.color} />
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {['traveller', 'solo'].includes(p.role)
                            ? p.onboarding_completed_at
                              ? <Pill label="Complete" color="green" />
                              : <Pill label="Pending" color="amber" />
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {travelling
                            ? <div className="flex items-center gap-1.5 text-green-600 text-xs font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                Travelling
                              </div>
                            : <span className="text-gray-400 text-xs">Not travelling</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 hidden xl:table-cell">
                          {fmtDate(p.created_at)}
                        </td>
                      </tr>
                    )
                  })}
                  {filteredProfiles.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-sm text-gray-400">
                        No users match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── ORGANISATIONS ── */}
      {tab === 'orgs' && (
        <div className="space-y-4">
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1]"
              placeholder="Search organisations…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Organisation</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Industry</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Country</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Users</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Travelling Now</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Setup</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden xl:table-cell">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orgs
                    .filter(o => !search || (o.name || '').toLowerCase().includes(search.toLowerCase()))
                    .map(o => {
                      const memberIds = profiles.filter(p => p.org_id === o.id).map(p => p.id)
                      const travellingNow = memberIds.filter(id => currentlyTravellingIds.has(id)).length

                      return (
                        <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                                <Building2 size={14} color={BRAND_BLUE} />
                              </div>
                              <span className="font-semibold text-gray-900">{o.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{o.industry || '—'}</td>
                          <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{o.country || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-gray-900">{orgTravellerCount[o.id] || 0}</span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {travellingNow > 0
                              ? <div className="flex items-center gap-1.5 text-green-600 text-xs font-semibold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                  {travellingNow} travelling
                                </div>
                              : <span className="text-gray-400 text-xs">None</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Pill
                              label={o.org_onboarding_completed_at ? 'Complete' : 'Pending'}
                              color={o.org_onboarding_completed_at ? 'green' : 'amber'}
                            />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 hidden xl:table-cell">
                            {fmtDate(o.created_at)}
                          </td>
                        </tr>
                      )
                    })}
                  {orgs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-sm text-gray-400">
                        No organisations yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <Link to="/organisations"
              className="flex items-center gap-2 text-sm font-medium text-[#0118A1] hover:underline">
              Full organisation manager <ExternalLink size={13} />
            </Link>
          </div>
        </div>
      )}

      {/* ── FEEDS ── */}
      {tab === 'feeds' && (
        <div className="space-y-6">
          {/* Feed health KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard icon={Wifi}       label="Live Feeds"     value={BUILTIN_FEEDS.filter(f => f.status === 'active').length}      color="#22C55E" />
            <KpiCard icon={Key}        label="Needs API Key"  value={BUILTIN_FEEDS.filter(f => f.status === 'pending_key').length}  color="#F59E0B" link="/intel-feeds" />
            <KpiCard icon={Handshake}  label="Partnerships"   value={BUILTIN_FEEDS.filter(f => f.status === 'partnership').length}  color="#7C3AED" />
            <KpiCard icon={WifiOff}    label="Pending Setup"  value={BUILTIN_FEEDS.filter(f => f.status === 'pending').length}      color="#9CA3AF" />
          </div>

          {/* Category filter */}
          <div className="flex flex-wrap gap-2">
            {['all', 'flight', 'vessel', 'conflict', 'country-risk', 'security', 'health', 'community', 'weather'].map(cat => (
              <button key={cat} onClick={() => setFeedCatFilter(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  feedCatFilter === cat
                    ? 'text-white border-transparent'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
                style={feedCatFilter === cat ? { background: BRAND_BLUE } : {}}>
                {cat === 'all' ? 'All categories' : cat.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </button>
            ))}
          </div>

          {/* Intel feeds table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">Intelligence Feeds ({filteredFeeds.length})</h2>
              <Link to="/intel-feeds" className="flex items-center gap-1.5 text-xs text-[#0118A1] font-medium hover:underline">
                Manage feeds <ExternalLink size={12} />
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {filteredFeeds.map(f => {
                const StatusIcon = f.status === 'active' ? Wifi : f.status === 'partnership' ? Handshake : f.status === 'pending_key' ? Key : WifiOff
                const s = FEED_STATUS_LABEL[f.status] || FEED_STATUS_LABEL.pending
                const CatIcon = CAT_ICON[f.category] || Radio

                return (
                  <div key={f.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <CatIcon size={14} className="text-gray-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{f.name}</p>
                      <p className="text-xs text-gray-400 capitalize">{f.category.replace('-', ' ')}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
                      <Pill label={s.label} color={s.color} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* News feeds */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">News Feeds ({NEWS_FEEDS.length})</h2>
              <Link to="/news" className="flex items-center gap-1.5 text-xs text-[#0118A1] font-medium hover:underline">
                View news <ExternalLink size={12} />
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {NEWS_FEEDS.map(f => (
                <div key={f.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    <Newspaper size={14} className="text-gray-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{f.name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <Pill label="Live" color="green" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
