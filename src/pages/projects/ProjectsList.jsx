import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Layers, Plus, Search, MapPin, Users, CheckSquare,
  AlertTriangle, Calendar, ChevronRight, X, Shield,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/Layout'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const STATUS_STYLE = {
  planning:  { label: 'Planning',  bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  active:    { label: 'Active',    bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  on_hold:   { label: 'On Hold',   bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  completed: { label: 'Completed', bg: 'bg-gray-100',   text: 'text-gray-500',   dot: 'bg-gray-400'   },
  cancelled: { label: 'Cancelled', bg: 'bg-red-100',    text: 'text-red-600',    dot: 'bg-red-400'    },
}

const PRIORITY_STYLE = {
  critical: { label: 'Critical', color: '#dc2626' },
  high:     { label: 'High',     color: '#ea580c' },
  medium:   { label: 'Medium',   color: '#ca8a04' },
  low:      { label: 'Low',      color: '#16a34a' },
}

const TYPE_LABEL = {
  security:   'Security',
  escort:     'Escort',
  training:   'Training',
  assessment: 'Assessment',
  logistics:  'Logistics',
  other:      'Other',
}

const EMPTY_FORM = {
  name: '', code: '', client_name: '', type: 'security',
  status: 'planning', priority: 'medium',
  country: '', region: '', location: '',
  start_date: '', end_date: '',
  description: '',
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.planning
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

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

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 focus:border-[#0118A1] transition-colors"
const selectCls = inputCls + " bg-white"

export default function ProjectsList() {
  const navigate = useNavigate()
  const [projects,   setProjects]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [filter,     setFilter]     = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [saving,     setSaving]     = useState(false)
  const [profile,    setProfile]    = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('id,role,full_name').eq('id', user.id).maybeSingle()
      setProfile(data)
    })
  }, [])

  const canCreate = profile && ['admin', 'developer', 'gsoc_admin', 'project_manager'].includes(profile.role)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('projects')
      .select(`
        id, name, code, client_name, type, status, priority,
        country, region, start_date, end_date, created_at,
        manager:profiles!projects_manager_id_fkey(full_name),
        members:project_members(count),
        tasks:project_tasks(count)
      `)
      .order('created_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const visible = projects.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.client_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.country || '').toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || p.status === filter
    return matchSearch && matchFilter
  })

  const submit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('projects').insert({
      ...form,
      start_date:  form.start_date  || null,
      end_date:    form.end_date    || null,
      created_by:  user?.id,
      manager_id:  user?.id,
    }).select().single()

    if (!error && data) {
      // Add creator as manager member
      await supabase.from('project_members').insert({
        project_id: data.id,
        user_id:    user.id,
        member_role: 'manager',
        added_by:   user.id,
      })
      setShowCreate(false)
      setForm(EMPTY_FORM)
      navigate(`/projects/${data.id}`)
    }
    setSaving(false)
  }

  const counts = {
    all:       projects.length,
    active:    projects.filter(p => p.status === 'active').length,
    planning:  projects.filter(p => p.status === 'planning').length,
    on_hold:   projects.filter(p => p.status === 'on_hold').length,
    completed: projects.filter(p => p.status === 'completed').length,
  }

  return (
    <Layout>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: BRAND_BLUE }}>
            <Layers size={20} color="white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-500">{projects.length} operational workspace{projects.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: BRAND_BLUE }}>
            <Plus size={16} /> New Project
          </button>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 focus:border-[#0118A1]"
            placeholder="Search projects, clients, countries…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { key: 'all',       label: `All (${counts.all})` },
            { key: 'active',    label: `Active (${counts.active})` },
            { key: 'planning',  label: `Planning (${counts.planning})` },
            { key: 'on_hold',   label: `On Hold (${counts.on_hold})` },
            { key: 'completed', label: `Done (${counts.completed})` },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                filter === key
                  ? 'text-white shadow-sm'
                  : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
              }`}
              style={filter === key ? { background: BRAND_BLUE } : {}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Project grid ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading projects…</div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Layers size={40} className="text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">No projects found</p>
          <p className="text-gray-400 text-sm mt-1">
            {canCreate ? 'Create your first project workspace to get started.' : 'You have not been assigned to any projects yet.'}
          </p>
          {canCreate && (
            <button onClick={() => setShowCreate(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: BRAND_BLUE }}>
              <Plus size={14} /> New Project
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map(p => {
            const pri = PRIORITY_STYLE[p.priority] || PRIORITY_STYLE.medium
            const memberCount = p.members?.[0]?.count ?? 0
            const taskCount   = p.tasks?.[0]?.count ?? 0
            return (
              <Link key={p.id} to={`/projects/${p.id}`}
                className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] hover:border-[#0118A1]/20 transition-all group">

                {/* Top row */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    {p.code && (
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{p.code}</p>
                    )}
                    <h3 className="font-bold text-gray-900 leading-tight group-hover:text-[#0118A1] transition-colors truncate">
                      {p.name}
                    </h3>
                    {p.client_name && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{p.client_name}</p>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-[#0118A1] shrink-0 mt-1 transition-colors" />
                </div>

                {/* Badges */}
                <div className="flex items-center gap-2 flex-wrap mb-4">
                  <StatusBadge status={p.status} />
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase tracking-wider">
                    {TYPE_LABEL[p.type] || p.type}
                  </span>
                  <span className="text-[10px] font-bold" style={{ color: pri.color }}>
                    ● {pri.label}
                  </span>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-4 text-[11px] text-gray-400">
                  {p.country && (
                    <span className="flex items-center gap-1">
                      <MapPin size={11} /> {p.country}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users size={11} /> {memberCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckSquare size={11} /> {taskCount} tasks
                  </span>
                  {p.start_date && (
                    <span className="flex items-center gap-1 ml-auto">
                      <Calendar size={11} />
                      {new Date(p.start_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* ── Create Project Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: BRAND_BLUE }}>
                  <Layers size={15} color="white" />
                </div>
                <h2 className="font-bold text-gray-900">New Project Workspace</h2>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Field label="Project Name" required>
                  <input className={inputCls} placeholder="e.g. Executive Protection – Nairobi"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </Field>
              </div>

              <Field label="Project Code">
                <input className={inputCls} placeholder="e.g. OPS-2026-001"
                  value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
              </Field>

              <Field label="Client Name">
                <input className={inputCls} placeholder="Client or organisation name"
                  value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} />
              </Field>

              <Field label="Project Type">
                <select className={selectCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="security">Security</option>
                  <option value="escort">Escort / Close Protection</option>
                  <option value="training">Training</option>
                  <option value="assessment">Assessment</option>
                  <option value="logistics">Logistics</option>
                  <option value="other">Other</option>
                </select>
              </Field>

              <Field label="Priority">
                <select className={selectCls} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </Field>

              <Field label="Country">
                <input className={inputCls} placeholder="Primary operating country"
                  value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
              </Field>

              <Field label="Specific Location">
                <input className={inputCls} placeholder="City, area or site"
                  value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </Field>

              <Field label="Start Date">
                <input type="date" className={inputCls}
                  value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </Field>

              <Field label="End Date">
                <input type="date" className={inputCls}
                  value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Description / Mission Brief">
                  <textarea className={inputCls} rows={3}
                    placeholder="Operational overview, objectives, constraints…"
                    value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </Field>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 rounded-xl text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={submit} disabled={saving || !form.name.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all hover:opacity-90"
                style={{ background: BRAND_BLUE }}>
                {saving ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
