/**
 * GSOC Shift Log
 * Shift handover notes — operators log summaries, open items, and threat level
 * at end of shift. Readable by all GSOC staff.
 */

import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Clock, Plus, X, AlertTriangle, CheckCircle, Shield } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const THREAT_LEVEL = {
  critical: { label: 'CRITICAL', color: '#ef4444', bg: 'bg-red-500/20',    border: 'border-red-500/40' },
  elevated: { label: 'ELEVATED', color: '#f97316', bg: 'bg-orange-500/20', border: 'border-orange-500/40' },
  guarded:  { label: 'GUARDED',  color: '#f59e0b', bg: 'bg-amber-500/20',  border: 'border-amber-500/40' },
  normal:   { label: 'NORMAL',   color: '#10b981', bg: 'bg-emerald-500/20', border: 'border-emerald-500/40' },
}

function ThreatBadge({ level }) {
  const t = THREAT_LEVEL[level] || THREAT_LEVEL.normal
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-widest ${t.bg} ${t.border}`}
      style={{ color: t.color }}>
      {t.label}
    </span>
  )
}

function formatDt(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }) + ' UTC'
}

export default function ShiftLog() {
  const [logs,       setLogs]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [profile,    setProfile]    = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [expanded,   setExpanded]   = useState(null)

  const [form, setForm] = useState({
    summary:      '',
    open_items:   '',
    threat_level: 'normal',
    shift_start:  '',
    shift_end:    '',
  })

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('id,full_name').eq('id', user.id).maybeSingle()
      setProfile(data)
      // Pre-fill shift start with now
      const now = new Date()
      const toLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      setForm(f => ({ ...f, shift_start: toLocal(now) }))
    })
  }, [])

  const loadLogs = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('gsoc_shift_logs')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(50)
    setLogs(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadLogs() }, [loadLogs])

  const submit = async () => {
    if (!form.summary.trim()) return
    setSaving(true)
    await supabase.from('gsoc_shift_logs').insert({
      summary:      form.summary,
      open_items:   form.open_items || null,
      threat_level: form.threat_level,
      shift_start:  form.shift_start ? new Date(form.shift_start).toISOString() : new Date().toISOString(),
      shift_end:    form.shift_end   ? new Date(form.shift_end).toISOString()   : null,
      operator_id:  profile?.id,
    })
    await loadLogs()
    setForm({ summary: '', open_items: '', threat_level: 'normal', shift_start: '', shift_end: '' })
    setShowForm(false)
    setSaving(false)
  }

  const inputCls = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#AACC00]/50 transition-colors"

  return (
    <div className="min-h-screen" style={{ background: '#080D1A', color: 'white' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8"
        style={{ background: 'rgba(0,0,0,0.4)' }}>
        <div className="flex items-center gap-3">
          <Link to="/gsoc" className="text-white/30 hover:text-white/70 transition-colors">
            <ChevronLeft size={18} />
          </Link>
          <Clock size={16} style={{ color: '#AACC00' }} />
          <h1 className="text-sm font-bold text-white">Shift Log</h1>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
          style={{ background: '#AACC00', color: DS.bg }}>
          <Plus size={13} /> New Entry
        </button>
      </div>

      {/* Log entries */}
      <div className="max-w-3xl mx-auto px-6 py-6">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 border-2 border-[#AACC00] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Clock size={40} className="text-white/10 mb-3" />
            <p className="text-white/30 text-sm">No shift logs yet</p>
            <p className="text-white/20 text-xs mt-1">Log your first shift handover</p>
          </div>
        )}

        <div className="space-y-4">
          {logs.map((log, idx) => {
            const t   = THREAT_LEVEL[log.threat_level] || THREAT_LEVEL.normal
            const open = expanded === log.id
            const isLatest = idx === 0

            return (
              <div key={log.id}
                className={`rounded-2xl border transition-all ${open ? 'border-white/15' : 'border-white/8'}`}
                style={{ background: open ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)' }}>

                {/* Entry header */}
                <button className="w-full px-5 py-4 text-left" onClick={() => setExpanded(open ? null : log.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: DS.green, color: '#AACC00' }}>
                        {(log.profiles?.full_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white">
                            {log.profiles?.full_name || 'Unknown operator'}
                          </span>
                          {isLatest && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#AACC00]/20 text-[#AACC00] border border-[#AACC00]/30 uppercase tracking-wider">
                              Latest
                            </span>
                          )}
                          <ThreatBadge level={log.threat_level} />
                        </div>
                        <p className="text-[11px] text-white/30 mt-0.5">
                          {formatDt(log.shift_start)}
                          {log.shift_end ? ` → ${formatDt(log.shift_end)}` : ' · shift ongoing'}
                        </p>
                      </div>
                    </div>
                    <span className="text-white/20 text-lg leading-none mt-0.5">{open ? '−' : '+'}</span>
                  </div>

                  {/* Summary preview when collapsed */}
                  {!open && (
                    <p className="text-[12px] text-white/50 mt-2 ml-11 line-clamp-2">{log.summary}</p>
                  )}
                </button>

                {/* Expanded detail */}
                {open && (
                  <div className="px-5 pb-5 ml-11">
                    <div className="mb-4">
                      <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Shift Summary</p>
                      <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{log.summary}</p>
                    </div>

                    {log.open_items && (
                      <div className="mb-4 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                        <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-widest mb-2 flex items-center gap-1">
                          <AlertTriangle size={10} /> Open Items / Handover
                        </p>
                        <p className="text-sm text-white/70 whitespace-pre-wrap">{log.open_items}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-3">
                      <Shield size={11} className="text-white/20" />
                      <span className="text-[11px] text-white/30">
                        Threat level at handover: <span style={{ color: t.color }}>{t.label}</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* New Entry Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-lg rounded-2xl border border-white/10 p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: '#111827' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-white">New Shift Log Entry</h3>
              <button onClick={() => setShowForm(false)} className="text-white/30 hover:text-white/70">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-wider">Shift Start</label>
                <input type="datetime-local" className={inputCls}
                  value={form.shift_start} onChange={e => setForm(f => ({ ...f, shift_start: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-wider">Shift End</label>
                <input type="datetime-local" className={inputCls}
                  value={form.shift_end} onChange={e => setForm(f => ({ ...f, shift_end: e.target.value }))} />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-wider">Threat Level at Handover</label>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(THREAT_LEVEL).map(([key, t]) => (
                  <button key={key} onClick={() => setForm(f => ({ ...f, threat_level: key }))}
                    className={`py-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${form.threat_level === key ? `${t.bg} ${t.border}` : 'border-white/10 bg-white/3 text-white/30 hover:border-white/20'}`}
                    style={{ color: form.threat_level === key ? t.color : undefined }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-wider">Shift Summary *</label>
              <textarea className={inputCls} rows={5}
                placeholder="Summarise key events, decisions, and status during the shift…"
                value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} />
            </div>

            <div className="mb-5">
              <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-wider">
                Open Items / Handover Notes
              </label>
              <textarea className={inputCls} rows={3}
                placeholder="Items requiring action in the next shift…"
                value={form.open_items} onChange={e => setForm(f => ({ ...f, open_items: e.target.value }))} />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm text-white/40 border border-white/10 hover:border-white/20 transition-colors">
                Cancel
              </button>
              <button onClick={submit} disabled={saving || !form.summary.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all"
                style={{ background: '#AACC00', color: DS.bg }}>
                {saving ? 'Saving…' : 'Submit Handover'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
