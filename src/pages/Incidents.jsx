/**
 * Incident Lifecycle Management — ISO 31030
 *
 * Lifecycle: Open → In Progress → Escalated → Resolved → Closed
 *
 * Run supabase-migration-incidents-lifecycle.sql before using.
 */

import { useEffect, useState, useRef } from 'react'
import {
  AlertTriangle, Plus, X, CheckCircle2, Clock, MapPin, Calendar,
  Shield, ChevronDown, FileWarning, Siren, HeartPulse, Landmark,
  CloudLightning, Package, HelpCircle, RefreshCw, User, ArrowUpCircle,
  CheckCheck, ChevronRight, Activity, Send, MoreVertical,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { BRAND_BLUE, BRAND_GREEN } from '../lib/colors'
import { DS } from '../lib/ds'

// ── Constants ─────────────────────────────────────────────────────────────────

const INCIDENT_TYPES = [
  { value: 'security',         label: 'Security Threat',  icon: Shield,         color: '#EF4444' },
  { value: 'health',           label: 'Health / Medical', icon: HeartPulse,     color: '#F97316' },
  { value: 'near_miss',        label: 'Near Miss',        icon: AlertTriangle,  color: '#EAB308' },
  { value: 'accident',         label: 'Accident / Injury',icon: Siren,          color: '#EF4444' },
  { value: 'theft',            label: 'Theft / Crime',    icon: Package,        color: '#8B5CF6' },
  { value: 'political',        label: 'Political Unrest', icon: Landmark,       color: '#6366F1' },
  { value: 'natural_disaster', label: 'Natural Disaster', icon: CloudLightning, color: '#0EA5E9' },
  { value: 'other',            label: 'Other',            icon: HelpCircle,     color: '#94A3B8' },
]

const SEVERITIES = [
  { value: 'Critical', label: 'Critical', bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA', dot: '#EF4444' },
  { value: 'High',     label: 'High',     bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA', dot: '#F97316' },
  { value: 'Medium',   label: 'Medium',   bg: '#FEFCE8', color: '#A16207', border: '#FEF08A', dot: '#EAB308' },
  { value: 'Low',      label: 'Low',      bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0', dot: '#22C55E' },
]

// Status flow — order matters for the progress bar
const STATUSES = ['Open', 'In Progress', 'Escalated', 'Resolved', 'Closed']

const STATUS_CFG = {
  'Open':        { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', dot: '#3B82F6'  },
  'In Progress': { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA', dot: '#F97316'  },
  'Escalated':   { bg: '#FDF4FF', color: '#7E22CE', border: '#E9D5FF', dot: '#A855F7'  },
  'Resolved':    { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0', dot: '#22C55E'  },
  'Closed':      { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0', dot: '#94A3B8'  },
}

const EMPTY_FORM = {
  type: '', severity: 'High', title: '', description: '',
  country: '', city: '', incident_date: new Date().toISOString().split('T')[0], trip_id: '',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate  = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmtTime  = d => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const typeInfo = v => INCIDENT_TYPES.find(t => t.value === v) || INCIDENT_TYPES[7]
const sevInfo  = v => SEVERITIES.find(s => s.value === v) || SEVERITIES[2]

// ── Small pills ───────────────────────────────────────────────────────────────

function SeverityPill({ severity }) {
  const s = sevInfo(severity)
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  )
}

function StatusPill({ status }) {
  const s = STATUS_CFG[status] || STATUS_CFG.Open
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {status}
    </span>
  )
}

function TypeIcon({ type, size = 13 }) {
  const t = typeInfo(type)
  const Icon = t.icon
  return (
    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: `${t.color}15` }}>
      <Icon size={size} style={{ color: t.color }} />
    </div>
  )
}

// ── Status progress bar ───────────────────────────────────────────────────────

function StatusBar({ status }) {
  const idx = STATUSES.indexOf(status)
  return (
    <div className="flex items-center gap-0.5 w-full">
      {STATUSES.map((s, i) => {
        const cfg = STATUS_CFG[s]
        const active = i <= idx
        return (
          <div key={s} className="flex-1 relative group">
            <div className="h-1 rounded-full transition-all duration-300"
              style={{ background: active ? cfg.dot : '#E2E8F0' }} />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md text-[9px] font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"
              style={{ background: DS.surface, color: DS.white }}>
              {s}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Timeline entry ────────────────────────────────────────────────────────────

function TimelineEntry({ entry, isLast }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
          style={{ background: DS.greenDim, border: `1.5px solid ${BRAND_GREEN}33` }}>
          <Activity size={10} style={{ color: BRAND_GREEN }} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-gray-100 mt-1" />}
      </div>
      <div className="pb-4 flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-800">{entry.action}</p>
        {entry.note && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{entry.note}</p>}
        <p className="text-[10px] text-gray-400 mt-0.5">
          {entry.actor && <span className="font-medium">{entry.actor} · </span>}
          {fmtTime(entry.ts)}
        </p>
      </div>
    </div>
  )
}

// ── Incident detail panel (slide-over) ────────────────────────────────────────

function IncidentPanel({ incident, isAdmin, profile, orgMembers, onClose, onUpdated }) {
  const [saving,   setSaving]   = useState(false)
  const [note,     setNote]     = useState('')
  const [assignTo, setAssignTo] = useState(incident.assigned_to_name || '')
  const [escalateTo, setEscalateTo] = useState(incident.escalated_to || '')
  const [resNote,  setResNote]  = useState(incident.resolution_notes || '')
  const [tab,      setTab]      = useState('details')  // details | timeline | resolve
  const panelRef = useRef(null)

  const timeline = Array.isArray(incident.timeline) ? incident.timeline : []

  const push = async (updates, timelineEntry) => {
    setSaving(true)
    const newTimeline = [...timeline, { ...timelineEntry, ts: new Date().toISOString(), actor: profile?.full_name || profile?.email || 'Admin' }]
    await supabase.from('incidents').update({ ...updates, timeline: newTimeline, updated_at: new Date().toISOString() }).eq('id', incident.id)
    onUpdated()
    setSaving(false)
  }

  const moveStatus = (newStatus) => {
    const updates = { status: newStatus }
    if (newStatus === 'Resolved') updates.resolved_at = new Date().toISOString()
    push(updates, { action: `Status changed to ${newStatus}` })
  }

  const handleAssign = () => {
    if (!assignTo.trim()) return
    push({ assigned_to_name: assignTo, status: incident.status === 'Open' ? 'In Progress' : incident.status, assigned_at: new Date().toISOString() },
      { action: `Assigned to ${assignTo}`, note: note || undefined })
    setNote('')
  }

  const handleEscalate = () => {
    if (!escalateTo.trim()) return
    push({ escalated_to: escalateTo, status: 'Escalated', escalated_at: new Date().toISOString() },
      { action: `Escalated to ${escalateTo}`, note: note || undefined })
    setNote('')
  }

  const handleResolve = () => {
    push({ status: 'Resolved', resolution_notes: resNote, resolved_at: new Date().toISOString() },
      { action: 'Incident resolved', note: resNote || undefined })
  }

  const handleClose = () => {
    push({ status: 'Closed' }, { action: 'Incident closed' })
  }

  const handleAddNote = () => {
    if (!note.trim()) return
    push({}, { action: 'Note added', note })
    setNote('')
  }

  const t = typeInfo(incident.type || incident.incident_type)
  const currentStatusIdx = STATUSES.indexOf(incident.status)

  // Next available status actions
  const nextActions = []
  if (incident.status === 'Open')        nextActions.push('In Progress')
  if (incident.status === 'In Progress') nextActions.push('Escalated', 'Resolved')
  if (incident.status === 'Escalated')   nextActions.push('Resolved')
  if (incident.status === 'Resolved')    nextActions.push('Closed')

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.40)' }} onClick={onClose}>
      <div ref={panelRef}
        className="relative flex flex-col bg-white h-full shadow-2xl overflow-hidden"
        style={{ width: 'min(560px, 100vw)', animation: 'slideInRight 0.22s ease-out' }}
        onClick={e => e.stopPropagation()}>

        {/* Panel header */}
        <div className="shrink-0 px-6 py-5 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <TypeIcon type={incident.type || incident.incident_type} size={14} />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-bold text-gray-900 leading-snug">{incident.title}</h2>
                <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                  <X size={15} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <SeverityPill severity={incident.severity} />
                <StatusPill status={incident.status} />
                {incident.country && (
                  <span className="text-[10px] text-gray-400 flex items-center gap-1">
                    <MapPin size={9} /> {[incident.city, incident.country].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Status progress bar */}
          <div className="mt-4">
            <StatusBar status={incident.status} />
            <div className="flex justify-between mt-1">
              {STATUSES.map(s => (
                <span key={s} className="text-[8px] text-gray-400 font-medium" style={{ color: incident.status === s ? STATUS_CFG[s].dot : undefined }}>
                  {s === 'In Progress' ? 'Active' : s}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex border-b border-gray-100 px-6">
          {[
            { key: 'details',  label: 'Details'  },
            { key: 'timeline', label: `Timeline (${timeline.length})` },
            ...(isAdmin ? [{ key: 'actions', label: 'Actions' }] : []),
          ].map(tab_ => (
            <button key={tab_.key}
              onClick={() => setTab(tab_.key)}
              className="py-3 px-1 mr-5 text-xs font-bold border-b-2 transition-colors"
              style={tab === tab_.key
                ? { borderColor: BRAND_GREEN, color: BRAND_GREEN }
                : { borderColor: 'transparent', color: '#94A3B8' }
              }>
              {tab_.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Details tab ── */}
          {tab === 'details' && (
            <>
              {incident.description && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Description</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{incident.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Reported by',   value: incident.reported_by || '—' },
                  { label: 'Incident date', value: fmtDate(incident.incident_date || incident.occurred_at) },
                  { label: 'Logged at',     value: fmtTime(incident.created_at) },
                  { label: 'Type',          value: t.label },
                  ...(incident.assigned_to_name ? [{ label: 'Assigned to', value: incident.assigned_to_name }] : []),
                  ...(incident.escalated_to     ? [{ label: 'Escalated to', value: incident.escalated_to }]    : []),
                  ...(incident.resolved_at      ? [{ label: 'Resolved at',  value: fmtTime(incident.resolved_at) }] : []),
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-xs font-semibold text-gray-800">{value}</p>
                  </div>
                ))}
              </div>

              {incident.resolution_notes && (
                <div className="p-3.5 bg-[rgba(170,204,0,0.10)] border border-[rgba(170,204,0,0.25)] rounded-xl">
                  <p className="text-[10px] font-bold text-[#AACC00] uppercase tracking-wider mb-1">Resolution Notes</p>
                  <p className="text-xs text-green-800 leading-relaxed">{incident.resolution_notes}</p>
                </div>
              )}
            </>
          )}

          {/* ── Timeline tab ── */}
          {tab === 'timeline' && (
            <>
              {timeline.length === 0 ? (
                <div className="text-center py-8">
                  <Clock size={24} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-xs text-gray-400">No timeline entries yet</p>
                </div>
              ) : (
                <div>
                  {[...timeline].reverse().map((entry, i) => (
                    <TimelineEntry key={i} entry={entry} isLast={i === timeline.length - 1} />
                  ))}
                </div>
              )}

              {/* Add note inline */}
              {isAdmin && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Add Note</p>
                  <div className="flex gap-2">
                    <input
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Add a note to the timeline…"
                      className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 text-gray-800 placeholder-gray-300"
                      onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                    />
                    <button onClick={handleAddNote} disabled={!note.trim() || saving}
                      className="p-2 rounded-xl transition-colors disabled:opacity-40"
                      style={{ background: DS.greenDim, color: BRAND_GREEN }}>
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Actions tab (admin only) ── */}
          {tab === 'actions' && isAdmin && (
            <div className="space-y-5">

              {/* Status transitions */}
              {nextActions.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Move Status</p>
                  <div className="flex flex-wrap gap-2">
                    {nextActions.map(s => {
                      const cfg = STATUS_CFG[s]
                      return (
                        <button key={s} onClick={() => moveStatus(s)} disabled={saving}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all hover:opacity-90 disabled:opacity-50"
                          style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
                          <ChevronRight size={12} />
                          {s}
                        </button>
                      )
                    })}
                    {incident.status === 'Resolved' && (
                      <button onClick={handleClose} disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all hover:opacity-90 disabled:opacity-50"
                        style={{ background: DS.surface, color: DS.textSub, borderColor: DS.border }}>
                        <CheckCheck size={12} /> Close
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Assign */}
              {['Open', 'In Progress', 'Escalated'].includes(incident.status) && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Assign {incident.assigned_to_name ? `(currently: ${incident.assigned_to_name})` : ''}
                  </p>
                  <div className="flex gap-2">
                    {orgMembers.length > 0 ? (
                      <select
                        value={assignTo}
                        onChange={e => setAssignTo(e.target.value)}
                        className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none text-gray-800 bg-white">
                        <option value="">— Select team member —</option>
                        {orgMembers.map(m => <option key={m.id} value={m.full_name || m.email}>{m.full_name || m.email}</option>)}
                      </select>
                    ) : (
                      <input
                        value={assignTo}
                        onChange={e => setAssignTo(e.target.value)}
                        placeholder="Name or team"
                        className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none text-gray-800 placeholder-gray-300"
                      />
                    )}
                    <button onClick={handleAssign} disabled={!assignTo.trim() || saving}
                      className="px-3 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
                      style={{ background: DS.greenDim, color: BRAND_GREEN }}>
                      <User size={13} />
                    </button>
                  </div>
                  <input
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Optional note with assignment…"
                    className="mt-2 w-full text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none text-gray-800 placeholder-gray-300"
                  />
                </div>
              )}

              {/* Escalate */}
              {['Open', 'In Progress'].includes(incident.status) && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Escalate</p>
                  <input
                    value={escalateTo}
                    onChange={e => setEscalateTo(e.target.value)}
                    placeholder="e.g. Senior Manager, Legal, Embassy, Medical Team"
                    className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none text-gray-800 placeholder-gray-300 mb-2"
                  />
                  <button onClick={handleEscalate} disabled={!escalateTo.trim() || saving}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: '#FDF4FF', color: '#7E22CE', border: '1px solid #E9D5FF' }}>
                    <ArrowUpCircle size={13} />
                    Escalate
                  </button>
                </div>
              )}

              {/* Resolve */}
              {['Open', 'In Progress', 'Escalated'].includes(incident.status) && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Resolve</p>
                  <textarea
                    value={resNote}
                    onChange={e => setResNote(e.target.value)}
                    placeholder="Describe how this was resolved, actions taken, lessons learned…"
                    rows={4}
                    className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none text-gray-800 placeholder-gray-300 resize-none leading-relaxed mb-2"
                  />
                  <button onClick={handleResolve} disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: DS.greenDim, color: DS.green, border: `1px solid ${DS.green}33` }}>
                    <CheckCircle2 size={13} />
                    Mark Resolved
                  </button>
                </div>
              )}

              {['Resolved', 'Closed'].includes(incident.status) && (
                <div className="text-center py-6">
                  <CheckCircle2 size={28} className="mx-auto mb-2" style={{ color: '#22C55E' }} />
                  <p className="text-sm font-semibold text-gray-500">Incident {incident.status.toLowerCase()}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Saving indicator */}
        {saving && (
          <div className="shrink-0 px-6 py-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
            <RefreshCw size={11} className="animate-spin" /> Saving…
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── Report form modal ─────────────────────────────────────────────────────────

function ReportModal({ profile, trips, onClose, onSaved }) {
  const [form,   setForm]   = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.type || !form.title || !form.incident_date) {
      setError('Please fill in all required fields.')
      return
    }
    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: inserted, error: err } = await supabase.from('incidents').insert({
      user_id:       user.id,
      org_id:        profile?.org_id || null,
      reported_by:   profile?.full_name || profile?.email || 'Unknown',
      type:          form.type,
      severity:      form.severity,
      title:         form.title,
      description:   form.description || null,
      country:       form.country || null,
      city:          form.city || null,
      incident_date: form.incident_date || null,
      trip_id:       form.trip_id || null,
      status:        'Open',
      timeline:      [{ action: 'Incident reported', ts: new Date().toISOString(), actor: profile?.full_name || profile?.email }],
    }).select('id').single()

    if (err) { setError(err.message); setSaving(false); return }

    // Notify org admin + control room
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (inserted?.id && session?.access_token) {
        fetch('/api/notify-incident', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ incident_id: inserted.id }),
        }).catch(() => {})
      }
    })

    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Report an Incident</h2>
            <p className="text-xs text-gray-400 mt-0.5">ISO 31030 · Mandatory reporting</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Type */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Incident Type <span className="text-[#EF7474]">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {INCIDENT_TYPES.map(t => {
                const Icon = t.icon
                const active = form.type === t.value
                return (
                  <button key={t.value} type="button" onClick={() => set('type', t.value)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all text-xs font-semibold"
                    style={active
                      ? { background: `${t.color}10`, border: `1.5px solid ${t.color}`, color: t.color }
                      : { background: DS.surface, border: `1.5px solid ${DS.border}`, color: DS.textSub }
                    }>
                    <Icon size={13} style={{ color: active ? t.color : DS.textMuted, flexShrink: 0 }} />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Severity <span className="text-[#EF7474]">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {SEVERITIES.map(s => (
                <button key={s.value} type="button" onClick={() => set('severity', s.value)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-all"
                  style={form.severity === s.value
                    ? { background: s.bg, border: `1.5px solid ${s.dot}`, color: s.color }
                    : { background: DS.surface, border: `1.5px solid ${DS.border}`, color: DS.textMuted }
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
              <select value={form.trip_id} onChange={e => set('trip_id', e.target.value)}
                className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none bg-white">
                <option value="">— Not linked to a specific trip —</option>
                {trips.map(t => (
                  <option key={t.id} value={t.id}>{t.trip_name}{t.arrival_city ? ` → ${t.arrival_city}` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Incident Title <span className="text-[#EF7474]">*</span>
            </label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Brief description of what happened"
              className="w-full text-sm text-gray-800 placeholder-gray-300 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none" />
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Country</label>
              <input value={form.country} onChange={e => set('country', e.target.value)}
                placeholder="e.g. Kenya"
                className="w-full text-sm text-gray-800 placeholder-gray-300 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">City</label>
              <input value={form.city} onChange={e => set('city', e.target.value)}
                placeholder="e.g. Nairobi"
                className="w-full text-sm text-gray-800 placeholder-gray-300 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none" />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Incident Date <span className="text-[#EF7474]">*</span>
            </label>
            <input type="date" value={form.incident_date} onChange={e => set('incident_date', e.target.value)}
              className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Full Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Describe what happened, who was involved, and any immediate actions taken…"
              rows={4}
              className="w-full text-sm text-gray-800 placeholder-gray-300 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none resize-none leading-relaxed" />
          </div>

          {error && <p className="text-xs text-[#EF7474] bg-[rgba(138,46,46,0.12)] border border-[rgba(138,46,46,0.30)] rounded-xl px-3.5 py-2.5">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 text-sm font-bold rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: BRAND_GREEN, color: DS.bg }}>
              {saving ? <><RefreshCw size={13} className="animate-spin" />Submitting…</> : 'Submit Report'}
            </button>
          </div>

          <p className="text-[10px] text-gray-400 text-center">
            Logged under ISO 31030 incident management requirements
          </p>
        </form>
      </div>
    </div>
  )
}

// ── Incident row card ─────────────────────────────────────────────────────────

function IncidentRow({ incident, isAdmin, profile, orgMembers, onUpdated }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const t = typeInfo(incident.type || incident.incident_type)

  return (
    <>
      <div
        className="bg-white rounded-2xl overflow-hidden cursor-pointer transition-all duration-150 hover:shadow-md"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)' }}
        onClick={() => setPanelOpen(true)}
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            <TypeIcon type={incident.type || incident.incident_type} />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <h3 className="text-sm font-bold text-gray-900 leading-snug">{incident.title}</h3>
                <ChevronRight size={15} className="text-gray-300 shrink-0 mt-0.5" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <SeverityPill severity={incident.severity} />
                <StatusPill status={incident.status} />
                {incident.assigned_to_name && (
                  <span className="text-[10px] text-gray-400 flex items-center gap-1">
                    <User size={9} /> {incident.assigned_to_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-3 text-[11px] text-gray-400 flex-wrap">
            {(incident.city || incident.country) && (
              <span className="flex items-center gap-1">
                <MapPin size={10} /> {[incident.city, incident.country].filter(Boolean).join(', ')}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar size={10} /> {fmtDate(incident.incident_date || incident.occurred_at)}
            </span>
            {incident.reported_by && (
              <span className="flex items-center gap-1">
                <Shield size={10} /> {incident.reported_by}
              </span>
            )}
            <span className="flex items-center gap-1 ml-auto">
              <Clock size={10} /> {fmtDate(incident.created_at)}
            </span>
          </div>

          {/* Mini progress bar */}
          <div className="mt-3">
            <StatusBar status={incident.status} />
          </div>
        </div>
      </div>

      {panelOpen && (
        <IncidentPanel
          incident={incident}
          isAdmin={isAdmin}
          profile={profile}
          orgMembers={orgMembers}
          onClose={() => setPanelOpen(false)}
          onUpdated={() => { onUpdated(); setPanelOpen(false) }}
        />
      )}
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Incidents() {
  const [incidents,   setIncidents]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [profile,     setProfile]     = useState(null)
  const [trips,       setTrips]       = useState([])
  const [orgMembers,  setOrgMembers]  = useState([])
  const [showModal,   setShowModal]   = useState(false)
  const [filter,      setFilter]      = useState('all')
  const [tableError,  setTableError]  = useState(false)

  const isAdmin = ['org_admin', 'developer', 'admin'].includes(profile?.role)

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(prof || { id: user.id, email: user.email })

    // Org admins/developers see all org incidents
    let incQuery
    if (['org_admin', 'developer'].includes(prof?.role) && prof?.org_id) {
      incQuery = supabase.from('incidents').select('*').eq('org_id', prof.org_id)
      // Also load org members for assignment dropdown
      supabase.from('profiles').select('id,full_name,email').eq('org_id', prof.org_id)
        .then(({ data }) => setOrgMembers(data || []))
    } else {
      incQuery = supabase.from('incidents').select('*').eq('user_id', user.id)
    }

    const [{ data: tripsData }, { data: inc, error }] = await Promise.all([
      supabase.from('itineraries').select('id,trip_name,arrival_city').eq('user_id', user.id).limit(20),
      incQuery.order('created_at', { ascending: false }),
    ])

    if (error?.code === '42P01') setTableError(true)
    setTrips(tripsData || [])
    setIncidents(inc || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Realtime: live incident updates ─────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('incidents-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incidents' }, ({ new: inc }) => {
        setIncidents(prev => [inc, ...prev])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'incidents' }, ({ new: inc }) => {
        setIncidents(prev => prev.map(i => i.id === inc.id ? inc : i))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'incidents' }, ({ old }) => {
        setIncidents(prev => prev.filter(i => i.id !== old.id))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const filtered = incidents.filter(i => {
    if (filter === 'open')     return ['Open', 'In Progress', 'Escalated'].includes(i.status)
    if (filter === 'resolved') return ['Resolved', 'Closed'].includes(i.status)
    return true
  })

  const counts = {
    critical:  incidents.filter(i => i.severity === 'Critical').length,
    open:      incidents.filter(i => ['Open', 'In Progress', 'Escalated'].includes(i.status)).length,
    escalated: incidents.filter(i => i.status === 'Escalated').length,
    resolved:  incidents.filter(i => ['Resolved', 'Closed'].includes(i.status)).length,
  }

  return (
    <Layout>
      {showModal && (
        <ReportModal profile={profile} trips={trips} onClose={() => setShowModal(false)} onSaved={load} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">ISO 31030</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Incident Reports</h1>
          <p className="text-sm text-gray-400 mt-1">Log, triage and manage security, health and safety incidents</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-0.5 shadow-sm"
          style={{ background: BRAND_GREEN, color: DS.bg }}>
          <Plus size={15} /> Report Incident
        </button>
      </div>

      {tableError && (
        <div className="bg-[rgba(144,106,37,0.12)] border border-[rgba(144,106,37,0.30)] rounded-2xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <FileWarning size={16} className="text-[#D4A64A] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800 mb-1">Run migration required</p>
              <p className="text-xs text-[#D4A64A] leading-relaxed">
                Run <code className="bg-amber-100 px-1 rounded">supabase-migration-incidents-lifecycle.sql</code> in your Supabase SQL editor to add lifecycle columns.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-7">
        {[
          { label: 'Total',     value: incidents.length, color: BRAND_GREEN, bg: DS.greenDim },
          { label: 'Active',    value: counts.open,      color: '#F97316',  bg: '#FFF7ED' },
          { label: 'Escalated', value: counts.escalated, color: '#7E22CE',  bg: '#FDF4FF' },
          { label: 'Resolved',  value: counts.resolved,  color: '#059669',  bg: '#ECFDF5' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5 text-center"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)' }}>
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
          { key: 'open',     label: `Active (${counts.open})` },
          { key: 'resolved', label: `Resolved (${counts.resolved})` },
        ].map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={filter === t.key ? { background: BRAND_GREEN, color: DS.bg } : { color: '#94A3B8' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-white rounded-2xl animate-pulse" style={{ border: '1px solid rgba(0,0,0,0.06)' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 text-center"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)' }}>
          <CheckCircle2 size={28} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-semibold text-gray-400">
            {filter === 'all' ? 'No incidents reported' : `No ${filter} incidents`}
          </p>
          <p className="text-xs text-gray-300 mt-1">Use "Report Incident" to log a new event</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(inc => (
            <IncidentRow
              key={inc.id}
              incident={inc}
              isAdmin={isAdmin}
              profile={profile}
              orgMembers={orgMembers}
              onUpdated={load}
            />
          ))}
        </div>
      )}
    </Layout>
  )
}
