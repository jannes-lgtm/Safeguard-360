/**
 * /src/pages/OrgTraining.jsx
 * Corporate Admin — upload and manage company-specific training modules.
 * These appear alongside ISO modules for all travellers in the organisation.
 */

import { useEffect, useState } from 'react'
import {
  BookOpen, Plus, X, CheckCircle2, Video, Link as LinkIcon,
  FileText, File, Pencil, Trash2, GraduationCap, Users,
  BarChart2, RefreshCw, Shield,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const CONTENT_TYPES = [
  { key: 'document', label: 'Document',    icon: FileText },
  { key: 'video',    label: 'Video',       icon: Video    },
  { key: 'link',     label: 'External Link', icon: LinkIcon },
  { key: 'pdf',      label: 'PDF',         icon: File     },
]

const emptyModule = {
  title: '', description: '', content_type: 'document',
  content_url: '', content_body: '', module_order: 1,
  required: true, iso_aligned: false,
}

// ── Module card ───────────────────────────────────────────────────────────────
function ModuleCard({ mod, completionCount, totalTravellers, onEdit, onDelete }) {
  const TypeIcon = CONTENT_TYPES.find(t => t.key === mod.content_type)?.icon || FileText
  const pct = totalTravellers > 0 ? Math.round(completionCount / totalTravellers * 100) : 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${BRAND_BLUE}10`, color: BRAND_BLUE }}>
            <TypeIcon size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-900">{mod.title}</p>
              {mod.required && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  Required
                </span>
              )}
              {mod.iso_aligned && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1">
                  <Shield size={8} /> ISO aligned
                </span>
              )}
            </div>
            {mod.description && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{mod.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => onEdit(mod)}
            className="p-1.5 text-gray-400 hover:text-[#0118A1] hover:bg-gray-100 rounded-lg transition-colors">
            <Pencil size={13} />
          </button>
          <button onClick={() => onDelete(mod.id)}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Completion progress */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Completion</span>
          <span className="text-[10px] font-bold text-gray-600">{completionCount}/{totalTravellers} travellers · {pct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div className="h-1.5 rounded-full transition-all"
            style={{ width: `${pct}%`, background: pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : BRAND_BLUE }} />
        </div>
      </div>

      {mod.content_url && (
        <a href={mod.content_url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-xs text-[#0118A1] hover:underline font-medium">
          <LinkIcon size={10} /> View content
        </a>
      )}
    </div>
  )
}

// ── Module form modal ─────────────────────────────────────────────────────────
function ModuleModal({ mod, maxOrder, onClose, onSaved, orgId, userId }) {
  const isNew = !mod?.id
  const [form, setForm] = useState(isNew ? { ...emptyModule, module_order: maxOrder + 1 } : { ...mod })
  const [saving, setSaving] = useState(false)

  const f = key => ({
    value: form[key] ?? '',
    onChange: e => setForm(p => ({ ...p, [key]: e.target.value })),
  })

  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const payload = {
      ...form,
      org_id: orgId,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }
    const { error } = isNew
      ? await supabase.from('org_training_modules').insert(payload)
      : await supabase.from('org_training_modules').update(payload).eq('id', mod.id)
    setSaving(false)
    if (!error) { onSaved(); onClose() }
    else console.error('save module error:', error)
  }

  const inputClass = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20"
  const labelClass = "text-xs font-semibold text-gray-600 block mb-1.5"

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">
            {isNew ? 'Add Training Module' : 'Edit Module'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={labelClass}>Module title <span className="text-red-500">*</span></label>
            <input className={inputClass} placeholder="e.g. Company Travel Policy Overview" {...f('title')} />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea className={`${inputClass} h-20 resize-none`}
              placeholder="What will travellers learn from this module?" {...f('description')} />
          </div>

          {/* Content type */}
          <div>
            <label className={labelClass}>Content type</label>
            <div className="grid grid-cols-4 gap-2">
              {CONTENT_TYPES.map(t => {
                const Icon = t.icon
                return (
                  <button key={t.key} onClick={() => setForm(p => ({ ...p, content_type: t.key }))}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                      form.content_type === t.key
                        ? 'border-[#0118A1] bg-[#0118A1]/5 text-[#0118A1]'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    <Icon size={16} />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Content URL */}
          <div>
            <label className={labelClass}>
              {form.content_type === 'video' ? 'Video URL (YouTube, Vimeo…)' :
               form.content_type === 'link'  ? 'External URL' :
               form.content_type === 'pdf'   ? 'PDF URL' : 'Document URL'}
            </label>
            <input className={inputClass} placeholder="https://…" {...f('content_url')} />
          </div>

          {/* Inline content body */}
          {form.content_type === 'document' && (
            <div>
              <label className={labelClass}>Inline content (optional)</label>
              <textarea className={`${inputClass} h-32 resize-none font-mono text-xs`}
                placeholder="Paste or write the training content here (Markdown supported)…"
                {...f('content_body')} />
            </div>
          )}

          {/* Options */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Order</label>
              <input type="number" className={inputClass} min="1" {...f('module_order')} />
            </div>
            <div className="space-y-2 pt-5">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.required}
                  onChange={e => setForm(p => ({ ...p, required: e.target.checked }))}
                  className="rounded border-gray-300" />
                Required before travel
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.iso_aligned}
                  onChange={e => setForm(p => ({ ...p, iso_aligned: e.target.checked }))}
                  className="rounded border-gray-300" />
                ISO 31030 aligned
              </label>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={save} disabled={saving || !form.title.trim()}
            className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl disabled:opacity-50"
            style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
            {saving ? 'Saving…' : isNew ? 'Add Module' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OrgTraining() {
  const [profile, setProfile]         = useState(null)
  const [modules, setModules]         = useState([])
  const [completions, setCompletions] = useState([])
  const [travellers, setTravellers]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [modal, setModal]             = useState(null)  // null | 'new' | module obj
  const [deletingId, setDeletingId]   = useState(null)

  const loadData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: prof } = await supabase
      .from('profiles').select('*, organisations(*)').eq('id', user.id).single()

    if (!prof?.org_id) { setLoading(false); return }
    setProfile({ ...prof, id: user.id })

    const orgId = prof.org_id

    const [{ data: mods }, { data: comps }, { data: travs }] = await Promise.all([
      supabase.from('org_training_modules')
        .select('*').eq('org_id', orgId).eq('is_active', true)
        .order('module_order', { ascending: true }),
      supabase.from('org_training_completions')
        .select('*').eq('org_id', orgId),
      supabase.from('profiles')
        .select('id').eq('org_id', orgId).eq('role', 'traveller'),
    ])

    setModules(mods || [])
    setCompletions(comps || [])
    setTravellers(travs || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const deleteModule = async (id) => {
    await supabase.from('org_training_modules').update({ is_active: false }).eq('id', id)
    setDeletingId(null)
    loadData()
  }

  const completionCount = (modId) =>
    completions.filter(c => c.module_id === modId && c.completed).length

  const totalCompleted = modules.reduce((s, m) => s + completionCount(m.id), 0)
  const totalPossible  = modules.length * travellers.length
  const overallPct     = totalPossible > 0 ? Math.round(totalCompleted / totalPossible * 100) : 0

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company Training</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {profile?.organisations?.name || 'Your company'} · {modules.length} module{modules.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => setModal('new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
            <Plus size={15} /> Add Module
          </button>
        </div>
      </div>

      {/* Overall progress */}
      {modules.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BarChart2 size={15} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-700">Overall completion across {travellers.length} travellers</span>
            </div>
            <span className="text-xl font-bold" style={{ color: BRAND_BLUE }}>{overallPct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="h-2 rounded-full transition-all"
              style={{ width: `${overallPct}%`, background: overallPct >= 80 ? '#22c55e' : BRAND_BLUE }} />
          </div>
        </div>
      )}

      {/* Module list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-white rounded-xl border animate-pulse"/>)}
        </div>
      ) : modules.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <BookOpen size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No training modules yet</p>
          <p className="text-gray-300 text-xs mt-1">Add your company's travel policies and training materials</p>
          <button onClick={() => setModal('new')}
            className="mt-4 px-4 py-2 rounded-xl text-sm font-bold"
            style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
            Add First Module
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {modules.map(mod => (
            deletingId === mod.id ? (
              <div key={mod.id} className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                <p className="text-sm text-red-700 flex-1">Delete <strong>{mod.title}</strong>?</p>
                <button onClick={() => deleteModule(mod.id)}
                  className="text-xs font-bold text-red-600 hover:text-red-700 border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-100">
                  Delete
                </button>
                <button onClick={() => setDeletingId(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            ) : (
              <ModuleCard
                key={mod.id}
                mod={mod}
                completionCount={completionCount(mod.id)}
                totalTravellers={travellers.length}
                onEdit={m => setModal(m)}
                onDelete={id => setDeletingId(id)}
              />
            )
          ))}
        </div>
      )}

      {/* ISO note */}
      <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <Shield size={16} className="text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-blue-800 mb-1">ISO 31030 Compliance</p>
          <p className="text-xs text-blue-700">
            Company training modules supplement the platform's built-in ISO 31030 modules.
            Mark modules as "ISO aligned" to include them in your organisation's compliance score.
          </p>
        </div>
      </div>

      {modal && (
        <ModuleModal
          mod={modal === 'new' ? null : modal}
          maxOrder={modules.length}
          orgId={profile?.org_id}
          userId={profile?.id}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
    </Layout>
  )
}
