/**
 * GSOC Projects
 * Project and task management for security operations.
 */

import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  FolderOpen, Plus, ChevronLeft, CheckSquare, Circle,
  Clock, Flag, Globe, X, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DS } from '../../lib/ds'

const PRIORITY_STYLE = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high:     'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium:   'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low:      'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

const STATUS_STYLE = {
  active:     'bg-emerald-500/20 text-emerald-400',
  monitoring: 'bg-blue-500/20 text-blue-400',
  closed:     'bg-gray-500/20 text-gray-400',
  archived:   'bg-gray-700/20 text-gray-500',
}

const TASK_STATUS_STYLE = {
  open:        'text-white/60',
  in_progress: 'text-blue-400',
  blocked:     'text-red-400',
  done:        'text-emerald-400 line-through opacity-50',
}

function Badge({ label, className }) {
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${className}`}>
      {label}
    </span>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 p-6"
        style={{ background: '#111827' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

const inputCls = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#AACC00]/50 transition-colors"
const selectCls = inputCls + " appearance-none"

export default function Projects() {
  const [projects,     setProjects]     = useState([])
  const [selected,     setSelected]     = useState(null)
  const [tasks,        setTasks]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showNewProj,  setShowNewProj]  = useState(false)
  const [showNewTask,  setShowNewTask]  = useState(false)
  const [profile,      setProfile]      = useState(null)

  const [projForm, setProjForm] = useState({ name: '', description: '', priority: 'medium', country: '', region: '' })
  const [taskForm, setTaskForm] = useState({ title: '', description: '', priority: 'medium' })
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('id, full_name').eq('id', user.id).maybeSingle()
      setProfile(data)
    })
  }, [])

  const loadProjects = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('gsoc_projects')
      .select('*, profiles!gsoc_projects_assigned_to_fkey(full_name)')
      .order('created_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }, [])

  const loadTasks = useCallback(async (projectId) => {
    const { data } = await supabase
      .from('gsoc_tasks')
      .select('*, profiles!gsoc_tasks_assigned_to_fkey(full_name)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    setTasks(data || [])
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])
  useEffect(() => { if (selected) loadTasks(selected.id) }, [selected, loadTasks])

  const createProject = async () => {
    if (!projForm.name.trim()) return
    setSaving(true)
    const { data } = await supabase.from('gsoc_projects').insert({
      ...projForm,
      status:     'active',
      created_by: profile?.id,
    }).select().single()
    if (data) setProjects(prev => [data, ...prev])
    setProjForm({ name: '', description: '', priority: 'medium', country: '', region: '' })
    setShowNewProj(false)
    setSaving(false)
  }

  const createTask = async () => {
    if (!taskForm.title.trim() || !selected) return
    setSaving(true)
    const { data } = await supabase.from('gsoc_tasks').insert({
      ...taskForm,
      project_id:  selected.id,
      status:      'open',
      created_by:  profile?.id,
    }).select().single()
    if (data) setTasks(prev => [data, ...prev])
    setTaskForm({ title: '', description: '', priority: 'medium' })
    setShowNewTask(false)
    setSaving(false)
  }

  const toggleTask = async (task) => {
    const next = task.status === 'done' ? 'open' : 'done'
    await supabase.from('gsoc_tasks').update({
      status: next,
      completed_at: next === 'done' ? new Date().toISOString() : null,
    }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
  }

  const closeProject = async (id) => {
    await supabase.from('gsoc_projects').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', id)
    setProjects(prev => prev.map(p => p.id === id ? { ...p, status: 'closed' } : p))
    if (selected?.id === id) setSelected(prev => ({ ...prev, status: 'closed' }))
  }

  const openTasks  = tasks.filter(t => t.status !== 'done').length
  const doneTasks  = tasks.filter(t => t.status === 'done').length

  return (
    <div className="min-h-screen" style={{ background: '#080D1A', color: 'white' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8"
        style={{ background: 'rgba(0,0,0,0.4)' }}>
        <div className="flex items-center gap-3">
          <Link to="/gsoc" className="text-white/30 hover:text-white/70 transition-colors">
            <ChevronLeft size={18} />
          </Link>
          <FolderOpen size={16} style={{ color: '#AACC00' }} />
          <h1 className="text-sm font-bold text-white">GSOC Projects</h1>
        </div>
        <button onClick={() => setShowNewProj(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
          style={{ background: '#AACC00', color: DS.bg }}>
          <Plus size={13} /> New Project
        </button>
      </div>

      <div className="flex h-[calc(100vh-65px)]">

        {/* Project list */}
        <div className="w-72 border-r border-white/8 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.2)' }}>
          {loading && (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 border-2 border-[#AACC00] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && projects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <FolderOpen size={32} className="text-white/10 mb-3" />
              <p className="text-white/30 text-sm">No projects yet</p>
              <button onClick={() => setShowNewProj(true)}
                className="mt-3 text-xs text-[#AACC00] hover:underline">
                Create first project
              </button>
            </div>
          )}
          {projects.map(p => (
            <button key={p.id} onClick={() => setSelected(p)}
              className={`w-full text-left px-4 py-3.5 border-b border-white/5 transition-all hover:bg-white/4 ${selected?.id === p.id ? 'bg-white/6' : ''}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-white truncate pr-2">{p.name}</span>
                <Badge label={p.status} className={STATUS_STYLE[p.status] || STATUS_STYLE.active} />
              </div>
              <div className="flex items-center gap-2">
                <Badge label={p.priority} className={PRIORITY_STYLE[p.priority] || PRIORITY_STYLE.medium} />
                {p.country && <span className="text-[10px] text-white/30 flex items-center gap-1"><Globe size={9} />{p.country}</span>}
              </div>
              {p.description && (
                <p className="text-[11px] text-white/30 mt-1.5 line-clamp-2">{p.description}</p>
              )}
            </button>
          ))}
        </div>

        {/* Task detail */}
        <div className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <FolderOpen size={40} className="text-white/10 mb-3" />
              <p className="text-white/30 text-sm">Select a project to view tasks</p>
            </div>
          ) : (
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                  {selected.description && <p className="text-sm text-white/40 mt-1">{selected.description}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <Badge label={selected.priority} className={PRIORITY_STYLE[selected.priority] || PRIORITY_STYLE.medium} />
                    <Badge label={selected.status} className={STATUS_STYLE[selected.status] || STATUS_STYLE.active} />
                    {selected.country && <span className="text-[11px] text-white/30">{selected.country}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selected.status === 'active' && (
                    <button onClick={() => closeProject(selected.id)}
                      className="text-[11px] px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white/70 transition-colors">
                      Close Project
                    </button>
                  )}
                  <button onClick={() => setShowNewTask(true)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                    style={{ background: DS.green, color: '#AACC00' }}>
                    <Plus size={12} /> Add Task
                  </button>
                </div>
              </div>

              {/* Task progress */}
              {tasks.length > 0 && (
                <div className="mb-5 px-4 py-3 rounded-xl border border-white/8"
                  style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="flex items-center justify-between text-xs text-white/40 mb-2">
                    <span>{doneTasks} of {tasks.length} tasks complete</span>
                    <span>{tasks.length > 0 ? Math.round(doneTasks / tasks.length * 100) : 0}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${tasks.length > 0 ? (doneTasks / tasks.length * 100) : 0}%`, background: '#AACC00' }} />
                  </div>
                </div>
              )}

              {/* Tasks */}
              <div className="space-y-2">
                {tasks.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckSquare size={28} className="text-white/10 mb-2" />
                    <p className="text-white/30 text-sm">No tasks yet</p>
                  </div>
                )}
                {tasks.map(t => (
                  <div key={t.id}
                    className={`flex items-start gap-3 px-4 py-3 rounded-xl border border-white/6 transition-all ${t.status === 'done' ? 'opacity-50' : ''}`}
                    style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <button onClick={() => toggleTask(t)} className="mt-0.5 shrink-0">
                      {t.status === 'done'
                        ? <CheckCircle2 size={16} className="text-emerald-400" />
                        : <Circle size={16} className="text-white/20 hover:text-white/50 transition-colors" />
                      }
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${TASK_STATUS_STYLE[t.status] || 'text-white/70'}`}>{t.title}</p>
                      {t.description && <p className="text-[11px] text-white/30 mt-0.5">{t.description}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <Badge label={t.priority} className={`${PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.medium} border`} />
                        {t.profiles?.full_name && <span className="text-[10px] text-white/20">{t.profiles.full_name}</span>}
                        {t.status !== 'done' && (
                          <span className={`text-[10px] ${TASK_STATUS_STYLE[t.status]}`}>{t.status.replace('_', ' ')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Project Modal */}
      {showNewProj && (
        <Modal title="New Project" onClose={() => setShowNewProj(false)}>
          <Field label="Project Name">
            <input className={inputCls} placeholder="Operation Eagle, Sahel Monitoring…"
              value={projForm.name} onChange={e => setProjForm(p => ({ ...p, name: e.target.value }))} />
          </Field>
          <Field label="Description">
            <textarea className={inputCls} rows={2} placeholder="Brief description…"
              value={projForm.description} onChange={e => setProjForm(p => ({ ...p, description: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <select className={selectCls} value={projForm.priority}
                onChange={e => setProjForm(p => ({ ...p, priority: e.target.value }))}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </Field>
            <Field label="Country / Region">
              <input className={inputCls} placeholder="Nigeria, Sahel…"
                value={projForm.country} onChange={e => setProjForm(p => ({ ...p, country: e.target.value }))} />
            </Field>
          </div>
          <div className="flex gap-3 mt-2">
            <button onClick={() => setShowNewProj(false)}
              className="flex-1 py-2 rounded-lg text-sm text-white/40 border border-white/10 hover:border-white/20 transition-colors">
              Cancel
            </button>
            <button onClick={createProject} disabled={saving || !projForm.name.trim()}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
              style={{ background: '#AACC00', color: DS.bg }}>
              {saving ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </Modal>
      )}

      {/* New Task Modal */}
      {showNewTask && selected && (
        <Modal title={`Add Task — ${selected.name}`} onClose={() => setShowNewTask(false)}>
          <Field label="Task Title">
            <input className={inputCls} placeholder="Investigate incident, Update threat assessment…"
              value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))} />
          </Field>
          <Field label="Description">
            <textarea className={inputCls} rows={2} placeholder="Details…"
              value={taskForm.description} onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))} />
          </Field>
          <Field label="Priority">
            <select className={selectCls} value={taskForm.priority}
              onChange={e => setTaskForm(p => ({ ...p, priority: e.target.value }))}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </Field>
          <div className="flex gap-3 mt-2">
            <button onClick={() => setShowNewTask(false)}
              className="flex-1 py-2 rounded-lg text-sm text-white/40 border border-white/10 hover:border-white/20">
              Cancel
            </button>
            <button onClick={createTask} disabled={saving || !taskForm.title.trim()}
              className="flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: '#AACC00', color: DS.bg }}>
              {saving ? 'Adding…' : 'Add Task'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
