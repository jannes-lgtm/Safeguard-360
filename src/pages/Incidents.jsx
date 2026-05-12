/**
 * Incident Reporting — ISO 31030 requirement
 *
 * Required Supabase table (run once in SQL editor):
 * ─────────────────────────────────────────────────
 * create table incidents (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid references auth.users(id) on delete cascade not null,
 *   reported_by text not null,
 *   type text not null,
 *   severity text not null,
 *   title text not null,
 *   description text,
 *   country text,
 *   city text,
 *   incident_date date not null,
 *   trip_id uuid references itineraries(id),
 *   status text not null default 'Open',
 *   resolution_notes text,
 *   created_at timestamptz not null default now(),
 *   updated_at timestamptz not null default now()
 * );
 * alter table incidents enable row level security;
 * create policy "users_own" on incidents for all using (auth.uid() = user_id);
 * create policy "admin_all" on incidents for all using (
 *   exists (select 1 from profiles where id = auth.uid() and role = 'admin')
 * );
 * -- Allow org admins to read their org members' incidents:
 * create policy "org_admin_read" on incidents for select using (
 *   exists (
 *     select 1 from profiles p1 join profiles p2 on p1.org_id = p2.org_id
 *     where p1.id = auth.uid() and p1.role = 'org_admin' and p2.id = incidents.user_id
 *   )
 * );
 */

import { useEffect, useState } from 'react'
import {
  AlertTriangle, Plus, X, CheckCircle2, Clock,
  MapPin, Calendar, Shield, ChevronDown,
  FileWarning, Siren, HeartPulse, Landmark,
  CloudLightning, Package, HelpCircle, RefreshCw
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

// ── Constants ─────────────────────────────────────────────────────────────────

const INCIDENT_TYPES = [
  { value: 'security',          label: 'Security Threat',     icon: Shield,        color: '#EF4444' },
  { value: 'health',            label: 'Health / Medical',    icon: HeartPulse,    color: '#F97316' },
  { value: 'near_miss',         label: 'Near Miss',           icon: AlertTriangle, color: '#EAB308' },
  { value: 'accident',          label: 'Accident / Injury',   icon: Siren,         color: '#EF4444' },
  { value: 'theft',             label: 'Theft / Crime',       icon: Package,       color: '#8B5CF6' },
  { value: 'political',         label: 'Political Unrest',    icon: Landmark,      color: '#6366F1' },
  { value: 'natural_disaster',  label: 'Natural Disaster',    icon: CloudLightning,color: '#0EA5E9' },
  { value: 'other',             label: 'Other',               icon: HelpCircle,    color: '#94A3B8' },
]

const SEVERITIES = [
  { value: 'Critical', label: 'Critical', bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA', dot: '#EF4444' },
  { value: 'High',     label: 'High',     bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA', dot: '#F97316' },
  { value: 'Medium',   label: 'Medium',   bg: '#FEFCE8', color: '#A16207', border: '#FEF08A', dot: '#EAB308' },
  { value: 'Low',      label: 'Low',      bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0', dot: '#22C55E' },
]

const STATUS_STYLE = {
  Open:           { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  'Under Review': { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  Resolved:       { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
  Closed:         { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
}

const EMPTY_FORM = {
  type: '',
  severity: 'High',
  title: '',
  description: '',
  country: '',
  city: '',
  incident_date: new Date().toISOString().split('T')[0],
  trip_id: '',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SeverityPill({ severity }) {
  const s = SEVERITIES.find(x => x.value === severity) || SEVERITIES[2]
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  )
}

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Open
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status}
    </span>
  )
}

function TypeIcon({ type, size = 14 }) {
  const t = INCIDENT_TYPES.find(x => x.value === type)
  if (!t) return null
  const Icon = t.icon
  return (
    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: `${t.color}15` }}>
      <Icon size={size} style={{ color: t.color }} />
    </div>
  )
}

// ── Report form modal ─────────────────────────────────────────────────────────
function ReportModal({ profile, trips, onClose, onSaved }) {
  const [form, setForm]       = useState(EMPTY_FORM)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.type || !form.title || !form.incident_date) {
      setError('Please fill in all required fields.')
      return
    }
    setSaving(true)
    setError(null)

    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    const { data: inserted, error: err } = await supabase.from('incidents').insert({
      user_id:       user.id,
      reported_by:   profile?.full_name || profile?.email || 'Unknown',
      type:          form.type,
      severity:      form.severity,
      title:         form.title,
      description:   form.description || null,
      country:       form.country || null,
      city:          form.city || null,
      incident_date: form.incident_date,
      trip_id:       form.trip_id || null,
      status:        'Open',
    }).select('id').single()

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    // Notify org admin + control room
    if (inserted?.id && session?.access_token) {
      fetch('/api/notify-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ incident_id: inserted.id }),
      }).catch(() => {})
    }

    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Report an Incident</h2>
            <p className="text-xs text-gray-400 mt-0.5">ISO 31030 · Mandatory reporting</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Incident type */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Incident Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {INCIDENT_TYPES.map(t => {
                const Icon = t.icon
                const active = form.type === t.value
                return (
                  <button key={t.value} type="button"
                    onClick={() => set('type', t.value)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all text-xs font-semibold"
                    style={active
                      ? { background: `${t.color}10`, border: `1.5px solid ${t.color}`, color: t.color }
                      : { background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: '#64748B' }
                    }>
                    <Icon size={13} style={{ color: active ? t.color : '#94A3B8', flexShrink: 0 }} />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Severity <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {SEVERITIES.map(s => (
                <button key={s.value} type="button"
                  onClick={() => set('severity', s.value)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-all"
                  style={form.severity === s.value
                    ? { background: s.bg, border: `1.5px solid ${s.dot}`, color: s.color }
                    : { background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: '#94A3B8' }
                  }>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: form.severity === s.value ? s.dot : '#CBD5E1' }} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Trip link */}
          {trips?.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Link to Trip <span className="text-gray-300">(optional)</span>
              </label>
              <select
                value={form.trip_id}
                onChange={e => set('trip_id', e.target.value)}
                className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none bg-white"
              >
                <option value="">— Not linked to a specific trip —</option>
                {trips.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.trip_name}{t.arrival_city ? ` → ${t.arrival_city}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Incident Title <span className="text-red-500">*</span>
            </label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Brief description of what happened"
              className="w-full text-sm text-gray-800 placeholder-gray-300 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': BRAND_BLUE }}
            />
          </div>

          {/* Location row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Country</label>
              <input
                value={form.country}
                onChange={e => set('country', e.target.value)}
                placeholder="e.g. Kenya"
                className="w-full text-sm text-gray-800 placeholder-gray-300 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">City</label>
              <input
                value={form.city}
                onChange={e => set('city', e.target.value)}
                placeholder="e.g. Nairobi"
                className="w-full text-sm text-gray-800 placeholder-gray-300 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Incident Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.incident_date}
              onChange={e => set('incident_date', e.target.value)}
              className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Full Description
            </label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Describe what happened, who was involved, and any immediate actions taken..."
              rows={4}
              className="w-full text-sm text-gray-800 placeholder-gray-300 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none resize-none leading-relaxed"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 text-sm font-bold rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: BRAND_BLUE, color: 'white' }}>
              {saving ? <><RefreshCw size={13} className="animate-spin" />Submitting...</> : 'Submit Report'}
            </button>
          </div>

          <p className="text-[10px] text-gray-400 text-center">
            This report is logged under ISO 31030 incident management requirements
          </p>
        </form>
      </div>
    </div>
  )
}

// ── Incident card ─────────────────────────────────────────────────────────────
function IncidentCard({ incident }) {
  const [expanded, setExpanded] = useState(false)
  const t = INCIDENT_TYPES.find(x => x.value === incident.type)
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  return (
    <div className="bg-white rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        border: '1px solid rgba(0,0,0,0.06)',
      }}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          <TypeIcon type={incident.type} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <h3 className="text-sm font-bold text-gray-900 leading-snug">{incident.title}</h3>
              <button onClick={() => setExpanded(e => !e)}
                className="shrink-0 p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400">
                <ChevronDown size={14}
                  className="transition-transform duration-200"
                  style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }} />
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <SeverityPill severity={incident.severity} />
              <StatusPill status={incident.status} />
              {t && (
                <span className="text-[10px] font-semibold px-2 py-1 rounded-full"
                  style={{ background: `${t.color}10`, color: t.color }}>
                  {t.label}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 text-[11px] text-gray-400 flex-wrap">
          {(incident.city || incident.country) && (
            <span className="flex items-center gap-1">
              <MapPin size={10} />
              {[incident.city, incident.country].filter(Boolean).join(', ')}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar size={10} />
            {fmtDate(incident.incident_date)}
          </span>
          {incident.reported_by && (
            <span className="flex items-center gap-1">
              <Shield size={10} />
              {incident.reported_by}
            </span>
          )}
          <span className="flex items-center gap-1 ml-auto">
            <Clock size={10} />
            {fmtDate(incident.created_at)}
          </span>
        </div>
      </div>

      {expanded && incident.description && (
        <div className="px-5 pb-5 pt-0">
          <div className="h-px bg-gray-100 mb-4" />
          <p className="text-xs text-gray-600 leading-relaxed">{incident.description}</p>
          {incident.resolution_notes && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide mb-1">Resolution Notes</p>
              <p className="text-xs text-green-800 leading-relaxed">{incident.resolution_notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Incidents() {
  const [incidents, setIncidents]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [profile, setProfile]       = useState(null)
  const [trips, setTrips]           = useState([])
  const [showModal, setShowModal]   = useState(false)
  const [filter, setFilter]         = useState('all')  // all | open | resolved
  const [tableError, setTableError] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(prof || { id: user.id, email: user.email })

    // Org admins see all incidents from their org members
    let incQuery
    if (prof?.role === 'org_admin' && prof?.org_id) {
      const { data: orgUsers } = await supabase.from('profiles').select('id').eq('org_id', prof.org_id)
      const ids = (orgUsers || []).map(u => u.id)
      incQuery = supabase.from('incidents').select('*').in('user_id', ids.length ? ids : [user.id])
    } else {
      incQuery = supabase.from('incidents').select('*').eq('user_id', user.id)
    }

    const [{ data: tripsData }, { data: inc, error }] = await Promise.all([
      supabase.from('itineraries').select('id,trip_name,arrival_city').eq('user_id', user.id).limit(20),
      incQuery.order('incident_date', { ascending: false }),
    ])

    if (error?.code === '42P01') { setTableError(true) }

    setTrips(tripsData || [])
    setIncidents(inc || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = incidents.filter(i => {
    if (filter === 'open')     return ['Open', 'Under Review'].includes(i.status)
    if (filter === 'resolved') return ['Resolved', 'Closed'].includes(i.status)
    return true
  })

  const counts = {
    critical: incidents.filter(i => i.severity === 'Critical').length,
    open:     incidents.filter(i => ['Open', 'Under Review'].includes(i.status)).length,
    resolved: incidents.filter(i => ['Resolved', 'Closed'].includes(i.status)).length,
  }

  return (
    <Layout>
      {showModal && (
        <ReportModal
          profile={profile}
          trips={trips}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">ISO 31030</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Incident Reports</h1>
          <p className="text-sm text-gray-400 mt-1">Log and track security, health and safety incidents</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-0.5 shadow-sm"
          style={{ background: BRAND_BLUE, color: 'white' }}
        >
          <Plus size={15} />
          Report Incident
        </button>
      </div>

      {/* Table missing warning */}
      {tableError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <FileWarning size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800 mb-1">Database setup required</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Run the SQL at the top of <code className="bg-amber-100 px-1 rounded">src/pages/Incidents.jsx</code> in your Supabase SQL editor to create the incidents table.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-7">
        {[
          { label: 'Total Reports',   value: incidents.length, color: BRAND_BLUE,  bg: `${BRAND_BLUE}10` },
          { label: 'Open / Review',   value: counts.open,      color: '#F97316',   bg: '#FFF7ED' },
          { label: 'Resolved',        value: counts.resolved,  color: '#059669',   bg: '#ECFDF5' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5 text-center"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2"
              style={{ background: s.bg }}>
              <span className="text-xl font-bold" style={{ color: s.color }}>{s.value}</span>
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 p-1 bg-white rounded-xl mb-5 w-fit"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)' }}>
        {[
          { key: 'all',      label: `All (${incidents.length})` },
          { key: 'open',     label: `Open (${counts.open})` },
          { key: 'resolved', label: `Resolved (${counts.resolved})` },
        ].map(tab => (
          <button key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={filter === tab.key
              ? { background: BRAND_BLUE, color: 'white' }
              : { color: '#94A3B8' }
            }>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Incident list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-white rounded-2xl animate-pulse"
              style={{ border: '1px solid rgba(0,0,0,0.06)' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 text-center"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: `${BRAND_BLUE}08` }}>
            <CheckCircle2 size={28} style={{ color: BRAND_BLUE, opacity: 0.4 }} />
          </div>
          <p className="text-sm font-semibold text-gray-400">
            {filter === 'all' ? 'No incidents reported — all clear' : `No ${filter} incidents`}
          </p>
          <p className="text-xs text-gray-300 mt-1">
            Use "Report Incident" to log a new event
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(inc => <IncidentCard key={inc.id} incident={inc} />)}
        </div>
      )}
    </Layout>
  )
}
