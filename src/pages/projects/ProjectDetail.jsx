import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Layers, MapPin, Users, CheckSquare, Siren, FileText,
  DollarSign, Clock, Edit2, Plus, X, Save, AlertTriangle, Shield,
  Navigation, ChevronRight, Pin, Paperclip, RefreshCw, Globe,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/Layout'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { buildRiskGeoJSON } from '../../lib/riskData'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const STATUS_STYLE = {
  planning:  { label: 'Planning',  bg: 'bg-blue-100',  text: 'text-blue-700'  },
  active:    { label: 'Active',    bg: 'bg-green-100', text: 'text-green-700' },
  on_hold:   { label: 'On Hold',   bg: 'bg-amber-100', text: 'text-amber-700' },
  completed: { label: 'Completed', bg: 'bg-gray-100',  text: 'text-gray-500'  },
  cancelled: { label: 'Cancelled', bg: 'bg-red-100',   text: 'text-red-600'   },
}

const TASK_STATUS = {
  open:        { label: 'Open',        bg: 'bg-gray-100',   text: 'text-gray-600'   },
  in_progress: { label: 'In Progress', bg: 'bg-blue-100',   text: 'text-blue-700'   },
  blocked:     { label: 'Blocked',     bg: 'bg-red-100',    text: 'text-red-700'    },
  done:        { label: 'Done',        bg: 'bg-green-100',  text: 'text-green-700'  },
}

const PRI_DOT = { critical: '#dc2626', high: '#ea580c', medium: '#ca8a04', low: '#16a34a' }

const THREAT_LEVEL = {
  critical: { label: 'CRITICAL', color: '#ef4444', bg: 'bg-red-50',    border: 'border-red-200'    },
  elevated: { label: 'ELEVATED', color: '#f97316', bg: 'bg-orange-50', border: 'border-orange-200' },
  guarded:  { label: 'GUARDED',  color: '#f59e0b', bg: 'bg-amber-50',  border: 'border-amber-200'  },
  normal:   { label: 'NORMAL',   color: '#10b981', bg: 'bg-green-50',  border: 'border-green-200'  },
}

const inputCls  = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 focus:border-[#0118A1] transition-colors"
const selectCls = inputCls + " bg-white"

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={16} className="text-gray-400" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function timeAgo(ts) {
  if (!ts) return ''
  const s = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function KPI({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: color + '18' }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ── Tracking mini-map ─────────────────────────────────────────────────────────
function TrackingMap({ memberIds }) {
  const mapRef  = useRef(null)
  const mapInst = useRef(null)
  const markersRef = useRef([])
  const [locations, setLocations] = useState([])

  useEffect(() => {
    if (!memberIds.length) return
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
    supabase.from('staff_locations')
      .select('*, profiles(full_name)')
      .in('user_id', memberIds)
      .gte('recorded_at', cutoff)
      .order('recorded_at', { ascending: false })
      .then(({ data }) => setLocations(data || []))
  }, [memberIds])

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [20, 5], zoom: 2.5, attributionControl: false,
    })
    mapInst.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      map.addSource('risk-countries', { type: 'geojson', data: buildRiskGeoJSON() })
      map.addLayer({
        id: 'risk-circles', type: 'circle', source: 'risk-countries',
        paint: {
          'circle-radius':  ['match', ['get', 'risk'], 'Critical', 14, 'High', 11, 'Medium', 8, 6],
          'circle-color':   ['match', ['get', 'risk'], 'Critical', '#dc2626', 'High', '#ea580c', 'Medium', '#eab308', '#22c55e'],
          'circle-opacity': 0.6,
          'circle-stroke-width': 1,
          'circle-stroke-color': ['match', ['get', 'risk'], 'Critical', '#b91c1c', 'High', '#c2410c', 'Medium', '#ca8a04', '#16a34a'],
        },
      })
    })
    return () => { map.remove(); mapInst.current = null }
  }, [])

  useEffect(() => {
    const map = mapInst.current
    if (!map) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    locations.forEach(l => {
      if (!l.latitude || !l.longitude) return
      const el = document.createElement('div')
      el.style.cssText = 'width:12px;height:12px;border-radius:50%;background:#AACC00;border:2px solid rgba(255,255,255,0.8);cursor:pointer'
      const m = new maplibregl.Marker({ element: el })
        .setLngLat([l.longitude, l.latitude])
        .setPopup(new maplibregl.Popup({ offset: 10, closeButton: false })
          .setHTML(`<div style="font-size:11px;padding:4px 8px;background:#1f2937;color:#fff;border-radius:4px">${l.profiles?.full_name || 'Asset'}</div>`))
        .addTo(map)
      markersRef.current.push(m)
    })
  }, [locations])

  return (
    <div>
      <div ref={mapRef} className="w-full h-72 rounded-xl overflow-hidden border border-gray-200" />
      {locations.length === 0 && (
        <p className="text-sm text-gray-400 text-center mt-3">No active location shares from project members</p>
      )}
      {locations.length > 0 && (
        <div className="mt-3 space-y-2">
          {locations.map(l => (
            <div key={l.id} className="flex items-center gap-3 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-[#AACC00] shrink-0" />
              <span className="font-medium">{l.profiles?.full_name || 'Unknown'}</span>
              <span className="text-gray-400 text-xs ml-auto">{timeAgo(l.recorded_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab components ────────────────────────────────────────────────────────────

function OverviewTab({ project, members, tasks, incidents, expenses }) {
  const openTasks   = tasks.filter(t => t.status !== 'done').length
  const openInc     = incidents.length
  const totalExp    = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  const currency    = project.currency || 'USD'

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label="Members"       value={members.length}  icon={Users}       color="#0118A1" />
        <KPI label="Open Tasks"    value={openTasks}       icon={CheckSquare} color="#f97316" />
        <KPI label="Incidents"     value={openInc}         icon={Siren}       color="#ef4444" />
        <KPI label={`Budget (${currency})`} value={totalExp > 0 ? totalExp.toLocaleString() : '—'} icon={DollarSign} color="#10b981" />
      </div>

      {/* Description */}
      {project.description && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Mission Brief</h3>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{project.description}</p>
        </div>
      )}

      {/* Members */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Team</h3>
        {members.length === 0 ? (
          <p className="text-sm text-gray-400">No members assigned yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ background: BRAND_BLUE, color: BRAND_GREEN }}>
                  {(m.profiles?.full_name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{m.profiles?.full_name || m.profiles?.email || 'Unknown'}</p>
                  <p className="text-[10px] text-gray-400 capitalize">{m.member_role}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Date timeline */}
      {(project.start_date || project.end_date) && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Timeline</h3>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            {project.start_date && (
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Start</p>
                <p className="font-semibold">{new Date(project.start_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</p>
              </div>
            )}
            {project.start_date && project.end_date && (
              <div className="flex-1 h-0.5 bg-gray-200 rounded-full" />
            )}
            {project.end_date && (
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">End</p>
                <p className="font-semibold">{new Date(project.end_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TasksTab({ projectId, tasks, setTasks, memberOptions, profile }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', status: 'open', due_date: '', assigned_to: '' })
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('open')

  const submit = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const { data } = await supabase.from('project_tasks').insert({
      project_id:  projectId,
      title:       form.title,
      description: form.description || null,
      priority:    form.priority,
      status:      form.status,
      due_date:    form.due_date || null,
      assigned_to: form.assigned_to || null,
      created_by:  profile?.id,
    }).select('*, profiles!project_tasks_assigned_to_fkey(full_name)').single()
    if (data) { setTasks(prev => [data, ...prev]); setShowAdd(false); setForm({ title: '', description: '', priority: 'medium', status: 'open', due_date: '', assigned_to: '' }) }
    setSaving(false)
  }

  const toggleDone = async (task) => {
    const newStatus = task.status === 'done' ? 'open' : 'done'
    await supabase.from('project_tasks').update({ status: newStatus, completed_at: newStatus === 'done' ? new Date().toISOString() : null }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
  }

  const visible = filter === 'all' ? tasks : tasks.filter(t => filter === 'done' ? t.status === 'done' : t.status !== 'done')

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1.5">
          {[['open','Open'], ['done','Done'], ['all','All']].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === key ? 'text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}
              style={filter === key ? { background: BRAND_BLUE } : {}}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
          style={{ background: BRAND_BLUE }}>
          <Plus size={13} /> Add Task
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No tasks yet</div>
      ) : (
        <div className="space-y-2">
          {visible.map(t => {
            const ts = TASK_STATUS[t.status] || TASK_STATUS.open
            return (
              <div key={t.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-start gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <button onClick={() => toggleDone(t)} className="mt-0.5 shrink-0">
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${t.status === 'done' ? 'border-green-500 bg-green-500' : 'border-gray-300 hover:border-[#0118A1]'}`}>
                    {t.status === 'done' && <span className="text-white text-[10px] font-bold">✓</span>}
                  </div>
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ts.bg} ${ts.text}`}>{ts.label}</span>
                    <span className="text-[10px] font-bold" style={{ color: PRI_DOT[t.priority] }}>● {t.priority}</span>
                    {t.profiles?.full_name && (
                      <span className="text-[10px] text-gray-400">{t.profiles.full_name}</span>
                    )}
                    {t.due_date && (
                      <span className="text-[10px] text-gray-400 ml-auto">
                        Due {new Date(t.due_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <Modal title="Add Task" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <Field label="Title" required>
              <input className={inputCls} placeholder="Task description"
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Priority">
                <select className={selectCls} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </Field>
              <Field label="Due Date">
                <input type="date" className={inputCls} value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </Field>
            </div>
            <Field label="Assign To">
              <select className={selectCls} value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                <option value="">— Unassigned —</option>
                {memberOptions.map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name || m.user_id}</option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <textarea className={inputCls} rows={2} placeholder="Optional details…"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </Field>
            <button onClick={submit} disabled={saving || !form.title.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: BRAND_BLUE }}>
              {saving ? 'Saving…' : 'Add Task'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function IncidentsTab({ projectId, linkedIncidents, setLinkedIncidents, profile }) {
  const [showLink, setShowLink] = useState(false)
  const [search,   setSearch]   = useState('')
  const [results,  setResults]  = useState([])
  const [linking,  setLinking]  = useState(false)

  const searchIncidents = async (q) => {
    if (!q.trim()) { setResults([]); return }
    const { data } = await supabase.from('incidents')
      .select('id,title,severity,status,country,created_at')
      .ilike('title', `%${q}%`)
      .limit(10)
    setResults(data || [])
  }

  useEffect(() => {
    const t = setTimeout(() => searchIncidents(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const linkIncident = async (incident) => {
    setLinking(true)
    const { error } = await supabase.from('project_incidents').insert({
      project_id:  projectId,
      incident_id: incident.id,
      linked_by:   profile?.id,
    })
    if (!error) {
      setLinkedIncidents(prev => [...prev, { ...incident, incident: incident }])
      setShowLink(false); setSearch(''); setResults([])
    }
    setLinking(false)
  }

  const SEV_COLOR = { Critical: '#dc2626', High: '#ea580c', Medium: '#ca8a04', Low: '#22c55e' }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowLink(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
          style={{ background: BRAND_BLUE }}>
          <Plus size={13} /> Link Incident
        </button>
      </div>

      {linkedIncidents.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No incidents linked to this project</div>
      ) : (
        <div className="space-y-2">
          {linkedIncidents.map(li => {
            const inc = li.incident || li
            return (
              <div key={li.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-start gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: SEV_COLOR[inc.severity] || '#6b7280' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{inc.title}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{inc.severity} · {inc.country} · {inc.status}</p>
                </div>
                <Link to="/incidents" className="text-[10px] text-[#0118A1] hover:underline shrink-0">View</Link>
              </div>
            )
          })}
        </div>
      )}

      {showLink && (
        <Modal title="Link Incident" onClose={() => setShowLink(false)}>
          <input className={inputCls + ' mb-3'} placeholder="Search incidents by title…"
            value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {results.map(inc => {
              const alreadyLinked = linkedIncidents.some(li => (li.incident_id || li.id) === inc.id)
              return (
                <div key={inc.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                  <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: SEV_COLOR[inc.severity] || '#6b7280' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{inc.title}</p>
                    <p className="text-[10px] text-gray-400">{inc.severity} · {inc.country}</p>
                  </div>
                  <button disabled={alreadyLinked || linking} onClick={() => linkIncident(inc)}
                    className="text-xs px-2.5 py-1 rounded-lg font-semibold text-white disabled:opacity-40 shrink-0"
                    style={{ background: BRAND_BLUE }}>
                    {alreadyLinked ? 'Linked' : 'Link'}
                  </button>
                </div>
              )
            })}
            {search && results.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No incidents found</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

function NotesTab({ projectId, notes, setNotes, profile }) {
  const [content, setContent] = useState('')
  const [saving, setSaving]   = useState(false)

  const submit = async () => {
    if (!content.trim()) return
    setSaving(true)
    const { data } = await supabase.from('project_notes').insert({
      project_id: projectId,
      author_id:  profile?.id,
      content,
    }).select('*, profiles!project_notes_author_id_fkey(full_name)').single()
    if (data) { setNotes(prev => [data, ...prev]); setContent('') }
    setSaving(false)
  }

  const togglePin = async (note) => {
    const newPin = !note.is_pinned
    await supabase.from('project_notes').update({ is_pinned: newPin }).eq('id', note.id)
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, is_pinned: newPin } : n))
  }

  const sorted = [...notes].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1
    if (!a.is_pinned && b.is_pinned) return 1
    return new Date(b.created_at) - new Date(a.created_at)
  })

  return (
    <div>
      <div className="mb-4">
        <textarea className={inputCls + ' mb-2'} rows={3}
          placeholder="Add an operational note…"
          value={content} onChange={e => setContent(e.target.value)} />
        <button onClick={submit} disabled={saving || !content.trim()}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: BRAND_BLUE }}>
          {saving ? 'Posting…' : 'Post Note'}
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">No notes yet</div>
      ) : (
        <div className="space-y-3">
          {sorted.map(n => (
            <div key={n.id} className={`bg-white rounded-xl border p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${n.is_pinned ? 'border-[#AACC00]/40 bg-[#AACC00]/5' : 'border-gray-100'}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                    style={{ background: BRAND_BLUE, color: BRAND_GREEN }}>
                    {(n.profiles?.full_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-700">{n.profiles?.full_name || 'Unknown'}</span>
                    <span className="text-[10px] text-gray-400 ml-2">{timeAgo(n.created_at)}</span>
                  </div>
                </div>
                <button onClick={() => togglePin(n)} title={n.is_pinned ? 'Unpin' : 'Pin'}
                  className="p-1 rounded hover:bg-gray-100 transition-colors">
                  <Pin size={12} className={n.is_pinned ? 'text-[#AACC00] fill-[#AACC00]' : 'text-gray-300'} />
                </button>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{n.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ShiftLogTab({ projectId, shifts, setShifts, profile }) {
  const [showForm, setShowForm]   = useState(false)
  const [saving,   setSaving]     = useState(false)
  const [expanded, setExpanded]   = useState(null)
  const now = new Date()
  const toLocal = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16)
  const [form, setForm] = useState({
    summary: '', open_items: '', threat_level: 'normal',
    shift_start: toLocal(now), shift_end: '',
  })

  const submit = async () => {
    if (!form.summary.trim()) return
    setSaving(true)
    const { data } = await supabase.from('project_shift_logs').insert({
      project_id:   projectId,
      operator_id:  profile?.id,
      summary:      form.summary,
      open_items:   form.open_items || null,
      threat_level: form.threat_level,
      shift_start:  form.shift_start ? new Date(form.shift_start).toISOString() : new Date().toISOString(),
      shift_end:    form.shift_end   ? new Date(form.shift_end).toISOString()   : null,
    }).select('*, profiles!project_shift_logs_operator_id_fkey(full_name)').single()
    if (data) { setShifts(prev => [data, ...prev]); setShowForm(false) }
    setSaving(false)
  }

  const TL = THREAT_LEVEL

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
          style={{ background: BRAND_BLUE }}>
          <Plus size={13} /> New Entry
        </button>
      </div>

      {shifts.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">No shift logs yet</div>
      ) : (
        <div className="space-y-3">
          {shifts.map((s, idx) => {
            const tl   = TL[s.threat_level] || TL.normal
            const open = expanded === s.id
            return (
              <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <button className="w-full px-4 py-3 text-left" onClick={() => setExpanded(open ? null : s.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{ background: BRAND_BLUE, color: BRAND_GREEN }}>
                        {(s.profiles?.full_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">{s.profiles?.full_name || 'Operator'}</span>
                          {idx === 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#AACC00]/20 text-[#AACC00] uppercase tracking-wider">Latest</span>}
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-widest ${tl.bg} ${tl.border}`} style={{ color: tl.color }}>{tl.label}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(s.shift_start)}</p>
                      </div>
                    </div>
                    <span className="text-gray-300 text-lg">{open ? '−' : '+'}</span>
                  </div>
                  {!open && <p className="text-xs text-gray-500 mt-1 ml-9 line-clamp-2">{s.summary}</p>}
                </button>
                {open && (
                  <div className="px-4 pb-4 ml-9 space-y-3">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Summary</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{s.summary}</p>
                    </div>
                    {s.open_items && (
                      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1 flex items-center gap-1">
                          <AlertTriangle size={10} /> Open Items
                        </p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{s.open_items}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <Modal title="New Shift Handover" onClose={() => setShowForm(false)} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shift Start">
                <input type="datetime-local" className={inputCls}
                  value={form.shift_start} onChange={e => setForm(f => ({ ...f, shift_start: e.target.value }))} />
              </Field>
              <Field label="Shift End">
                <input type="datetime-local" className={inputCls}
                  value={form.shift_end} onChange={e => setForm(f => ({ ...f, shift_end: e.target.value }))} />
              </Field>
            </div>
            <Field label="Threat Level">
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(TL).map(([key, t]) => (
                  <button key={key} onClick={() => setForm(f => ({ ...f, threat_level: key }))}
                    className={`py-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${form.threat_level === key ? `${t.bg} ${t.border}` : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                    style={{ color: form.threat_level === key ? t.color : undefined }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Shift Summary" required>
              <textarea className={inputCls} rows={4}
                placeholder="Key events, decisions, status during the shift…"
                value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} />
            </Field>
            <Field label="Open Items / Handover Notes">
              <textarea className={inputCls} rows={2}
                placeholder="Actions required in the next shift…"
                value={form.open_items} onChange={e => setForm(f => ({ ...f, open_items: e.target.value }))} />
            </Field>
            <button onClick={submit} disabled={saving || !form.summary.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: BRAND_BLUE }}>
              {saving ? 'Saving…' : 'Submit Handover'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ExpensesTab({ projectId, expenses, setExpenses, profile }) {
  const [showAdd, setShowAdd] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [form, setForm] = useState({ amount: '', currency: 'USD', category: 'operational', description: '', expense_date: '' })

  const submit = async () => {
    if (!form.amount || !form.description.trim()) return
    setSaving(true)
    const { data } = await supabase.from('project_expenses').insert({
      project_id:   projectId,
      logged_by:    profile?.id,
      amount:       parseFloat(form.amount),
      currency:     form.currency,
      category:     form.category,
      description:  form.description,
      expense_date: form.expense_date || new Date().toISOString().slice(0,10),
    }).select('*, profiles!project_expenses_logged_by_fkey(full_name)').single()
    if (data) { setExpenses(prev => [data, ...prev]); setShowAdd(false); setForm({ amount: '', currency: 'USD', category: 'operational', description: '', expense_date: '' }) }
    setSaving(false)
  }

  const byCurrency = expenses.reduce((acc, e) => {
    const k = e.currency || 'USD'
    acc[k] = (acc[k] || 0) + parseFloat(e.amount || 0)
    return acc
  }, {})

  const CAT_LABEL = { operational:'Operational', transport:'Transport', accommodation:'Accommodation', equipment:'Equipment', personnel:'Personnel', comms:'Comms', other:'Other' }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        {Object.entries(byCurrency).length > 0 && (
          <div className="flex gap-4">
            {Object.entries(byCurrency).map(([cur, total]) => (
              <div key={cur}>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">{cur} Total</p>
                <p className="text-lg font-bold text-gray-900">{total.toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white ml-auto"
          style={{ background: BRAND_BLUE }}>
          <Plus size={13} /> Log Expense
        </button>
      </div>

      {expenses.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">No expenses logged</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {expenses.map(e => (
            <div key={e.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 font-medium">{e.description}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {CAT_LABEL[e.category] || e.category} · {e.profiles?.full_name || 'Unknown'} · {e.expense_date}
                </p>
              </div>
              <p className="font-bold text-gray-900 shrink-0 text-sm">{e.currency} {parseFloat(e.amount).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal title="Log Expense" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount" required>
                <input type="number" className={inputCls} placeholder="0.00"
                  value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </Field>
              <Field label="Currency">
                <select className={selectCls} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                  {['USD','GBP','EUR','ZAR','KES','NGN'].map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Category">
              <select className={selectCls} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {Object.entries(CAT_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Description" required>
              <input className={inputCls} placeholder="What was this expense for?"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </Field>
            <Field label="Date">
              <input type="date" className={inputCls} value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} />
            </Field>
            <button onClick={submit} disabled={saving || !form.amount || !form.description.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: BRAND_BLUE }}>
              {saving ? 'Saving…' : 'Log Expense'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Main ProjectDetail ────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview',   label: 'Overview',   icon: Layers      },
  { key: 'tasks',      label: 'Tasks',      icon: CheckSquare },
  { key: 'incidents',  label: 'Incidents',  icon: Siren       },
  { key: 'tracking',   label: 'Tracking',   icon: Navigation  },
  { key: 'notes',      label: 'Notes',      icon: FileText    },
  { key: 'shifts',     label: 'Shift Log',  icon: Clock       },
  { key: 'expenses',   label: 'Expenses',   icon: DollarSign  },
]

export default function ProjectDetail() {
  const { id }  = useParams()
  const navigate = useNavigate()

  const [project,    setProject]    = useState(null)
  const [members,    setMembers]    = useState([])
  const [tasks,      setTasks]      = useState([])
  const [incidents,  setIncidents]  = useState([])
  const [notes,      setNotes]      = useState([])
  const [shifts,     setShifts]     = useState([])
  const [expenses,   setExpenses]   = useState([])
  const [profile,    setProfile]    = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState('overview')
  const [editStatus, setEditStatus] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('id,role,full_name').eq('id', user.id).maybeSingle()
      setProfile(data)
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const [projRes, membersRes, tasksRes, incRes, notesRes, shiftsRes, expRes] = await Promise.allSettled([
      supabase.from('projects').select('*, manager:profiles!projects_manager_id_fkey(full_name,email)').eq('id', id).single(),
      supabase.from('project_members').select('*, profiles(full_name,email,role)').eq('project_id', id).order('joined_at'),
      supabase.from('project_tasks').select('*, profiles!project_tasks_assigned_to_fkey(full_name)').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('project_incidents').select('*, incident:incidents(id,title,severity,status,country,created_at)').eq('project_id', id).order('linked_at', { ascending: false }),
      supabase.from('project_notes').select('*, profiles!project_notes_author_id_fkey(full_name)').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('project_shift_logs').select('*, profiles!project_shift_logs_operator_id_fkey(full_name)').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('project_expenses').select('*, profiles!project_expenses_logged_by_fkey(full_name)').eq('project_id', id).order('created_at', { ascending: false }),
    ])

    if (projRes.status   === 'fulfilled') setProject(projRes.value?.data)
    if (membersRes.status === 'fulfilled') setMembers(membersRes.value?.data || [])
    if (tasksRes.status  === 'fulfilled') setTasks(tasksRes.value?.data || [])
    if (incRes.status    === 'fulfilled') setIncidents(incRes.value?.data || [])
    if (notesRes.status  === 'fulfilled') setNotes(notesRes.value?.data || [])
    if (shiftsRes.status === 'fulfilled') setShifts(shiftsRes.value?.data || [])
    if (expRes.status    === 'fulfilled') setExpenses(expRes.value?.data || [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const updateStatus = async (status) => {
    await supabase.from('projects').update({ status }).eq('id', id)
    setProject(p => ({ ...p, status }))
    setEditStatus(false)
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading project…</div>
      </Layout>
    )
  }

  if (!project) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-gray-500 font-medium">Project not found</p>
          <Link to="/projects" className="mt-3 text-sm text-[#0118A1] hover:underline">← Back to Projects</Link>
        </div>
      </Layout>
    )
  }

  const ss  = STATUS_STYLE[project.status] || STATUS_STYLE.planning
  const memberIds = members.map(m => m.user_id)
  const canManage = profile && ['admin','developer','gsoc_admin','project_manager'].includes(profile.role)
  const linkedIncidentsList = incidents.map(li => ({ ...li.incident, ...li, incident: li.incident }))

  return (
    <Layout>
      {/* ── Project header ── */}
      <div className="mb-6">
        <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-4 transition-colors">
          <ArrowLeft size={14} /> Projects
        </Link>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: BRAND_BLUE }}>
                <Layers size={22} color="white" />
              </div>
              <div className="min-w-0">
                {project.code && (
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{project.code}</p>
                )}
                <h1 className="text-xl font-bold text-gray-900 leading-tight">{project.name}</h1>
                {project.client_name && (
                  <p className="text-sm text-gray-500 mt-0.5">{project.client_name}</p>
                )}
                <div className="flex items-center gap-3 mt-2 flex-wrap text-[12px] text-gray-400">
                  {project.country && (
                    <span className="flex items-center gap-1"><MapPin size={11} />{project.country}{project.location ? ` · ${project.location}` : ''}</span>
                  )}
                  {project.manager?.full_name && (
                    <span className="flex items-center gap-1"><Users size={11} />PM: {project.manager.full_name}</span>
                  )}
                  {project.start_date && (
                    <span>
                      {new Date(project.start_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
                      {project.end_date && ` – ${new Date(project.end_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {editStatus ? (
                <select className={selectCls + ' w-36 text-xs'} value={project.status} onChange={e => updateStatus(e.target.value)}>
                  {Object.entries(STATUS_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              ) : (
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${ss.bg} ${ss.text}`}>
                  {ss.label}
                </span>
              )}
              {canManage && (
                <button onClick={() => setEditStatus(e => !e)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  <Edit2 size={13} className="text-gray-400" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab navigation ── */}
      <div className="flex gap-1 mb-5 bg-white rounded-xl border border-gray-100 p-1 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => {
          const count = key === 'tasks' ? tasks.filter(t => t.status !== 'done').length
            : key === 'incidents' ? incidents.length
            : key === 'notes'    ? notes.length
            : key === 'expenses' ? expenses.length
            : key === 'shifts'   ? shifts.length
            : null
          return (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-1 justify-center ${
                tab === key ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
              style={tab === key ? { background: BRAND_BLUE } : {}}>
              <Icon size={14} />
              <span className="hidden sm:inline">{label}</span>
              {count > 0 && (
                <span className={`text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 ${tab === key ? 'bg-white/20 text-white' : 'text-white'}`}
                  style={tab !== key ? { background: BRAND_BLUE } : {}}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Tab content ── */}
      <div className="min-h-64">
        {tab === 'overview'  && <OverviewTab project={project} members={members} tasks={tasks} incidents={linkedIncidentsList} expenses={expenses} />}
        {tab === 'tasks'     && <TasksTab projectId={id} tasks={tasks} setTasks={setTasks} memberOptions={members} profile={profile} />}
        {tab === 'incidents' && <IncidentsTab projectId={id} linkedIncidents={linkedIncidentsList} setLinkedIncidents={setIncidents} profile={profile} />}
        {tab === 'tracking'  && <TrackingMap memberIds={memberIds} />}
        {tab === 'notes'     && <NotesTab projectId={id} notes={notes} setNotes={setNotes} profile={profile} />}
        {tab === 'shifts'    && <ShiftLogTab projectId={id} shifts={shifts} setShifts={setShifts} profile={profile} />}
        {tab === 'expenses'  && <ExpensesTab projectId={id} expenses={expenses} setExpenses={setExpenses} profile={profile} />}
      </div>
    </Layout>
  )
}
