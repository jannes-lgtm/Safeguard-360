import { useEffect, useState, useRef } from 'react'
import {
  Brain, Plus, Trash2, ToggleLeft, ToggleRight,
  Search, FileText, BookOpen, X, AlertCircle, Loader2,
  Globe, Upload, File,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { BRAND_BLUE, BRAND_GREEN } from '../../lib/colors'
import Layout from '../../components/Layout'

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCSV(str) {
  if (!str || !str.trim()) return []
  return str.split(',').map(s => s.trim()).filter(Boolean)
}

function TypeBadge({ type }) {
  if (type === 'sop') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700">
      <FileText size={10} />SOP
    </span>
  )
  if (type === 'report') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700">
      <Globe size={10} />REPORT
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">
      <BookOpen size={10} />CASE
    </span>
  )
}

function Chip({ label, color = 'gray' }) {
  const colors = {
    gray: 'bg-gray-100 text-gray-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-700',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${colors[color]}`}>
      {label}
    </span>
  )
}

function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl text-sm font-medium">
      <span style={{ color: BRAND_GREEN }}>✓</span>
      {message}
      <button onClick={onClose} className="ml-2 opacity-50 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  )
}

// ── Add New Item Modal ────────────────────────────────────────────────────────

const EMPTY_FORM = {
  type: 'report',
  title: '',
  content: '',
  countries: '',
  regions: '',
  threat_categories: '',
  tags: '',
  outcome: '',
  publisher: '',
  report_date: '',
  doc_tier: 'country',
}

function AddModal({ onClose, onSuccess }) {
  const [form, setForm]         = useState(EMPTY_FORM)
  const [pdfFile, setPdfFile]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const [uploadStep, setUploadStep] = useState('')
  const [error, setError]       = useState('')
  const fileRef                 = useRef()

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') { setError('Only PDF files are supported.'); return }
    if (file.size > 20 * 1024 * 1024) { setError('PDF must be under 20 MB.'); return }
    setPdfFile(file)
    setError('')
    if (!form.title) set('title', file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' '))
  }

  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const handleSubmit = async (e) => {
    e?.preventDefault()
    setError('')
    if (!form.title.trim()) { setError('Title is required.'); return }
    if (!pdfFile && !form.content.trim()) { setError('Upload a PDF or paste content.'); return }

    setSaving(true)
    try {
      // ── Auth ───────────────────────────────────────────────────────────────
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated — please sign in again.')

      if (pdfFile) {
        // ── PDF path ───────────────────────────────────────────────────────
        // Upload PDF to Supabase Storage first (avoids 4.5 MB Vercel limit),
        // then pass the storage path to the API for Claude text extraction.

        if (!['application/pdf'].includes(pdfFile.type)) {
          throw new Error(`Unsupported file type: ${pdfFile.type || 'unknown'}. Only PDF files are accepted.`)
        }

        setUploadStep('Uploading PDF…')
        const safeName = `${Date.now()}_${pdfFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const storagePath = `temp/${safeName}`

        const { error: storageErr } = await supabase.storage
          .from('cairo-uploads')
          .upload(storagePath, pdfFile, { contentType: 'application/pdf', upsert: false })

        if (storageErr) throw new Error(`Storage upload failed: ${storageErr.message}`)

        setUploadStep('Extracting text with AI…')
        const tagsArr = parseCSV(form.tags)
        if (form.report_date) tagsArr.push(form.report_date)

        const payload = {
          type:              form.type,
          title:             form.title.trim(),
          storage_path:      storagePath,
          source_file:       (form.publisher.trim() || pdfFile.name).replace(/[^a-zA-Z0-9._\-\s]/g, '').trim(),
          countries:         parseCSV(form.countries),
          regions:           parseCSV(form.regions),
          threat_categories: parseCSV(form.threat_categories),
          tags:              tagsArr,
          doc_tier:          form.doc_tier || 'global',
        }

        let res, rawText
        try {
          res = await fetch('/api/cairo-upload', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body:    JSON.stringify(payload),
          })
          rawText = await res.text()
          console.log('[cairo-upload] HTTP', res.status, rawText.slice(0, 300))
        } catch (fetchErr) {
          throw new Error(`Network error: ${fetchErr.message}`)
        }

        let data
        try {
          data = JSON.parse(rawText)
        } catch {
          throw new Error(`API returned non-JSON (HTTP ${res.status}): ${rawText.slice(0, 200)}`)
        }

        if (!res.ok) throw new Error(data.error || `Upload failed (HTTP ${res.status})`)

      } else {
        // ── Text path: direct Supabase insert ─────────────────────────────
        setUploadStep('Saving…')
        const tagsArr = parseCSV(form.tags)
        if (form.report_date) tagsArr.push(form.report_date)

        const row = {
          type:              form.type,
          title:             form.title.trim(),
          content:           form.content.trim(),
          source_file:       form.publisher.trim() || null,
          countries:         parseCSV(form.countries),
          regions:           parseCSV(form.regions),
          threat_categories: parseCSV(form.threat_categories),
          tags:              tagsArr,
          doc_tier:          form.doc_tier || 'global',
        }
        console.log('[cairo-upload] direct insert row:', JSON.stringify({ ...row, content: row.content.slice(0, 80) }))

        const { error: dbErr } = await supabase.from('cairo_knowledge').insert(row)
        if (dbErr) {
          console.error('[cairo-upload] dbErr:', JSON.stringify(dbErr))
          throw new Error(`DB ${dbErr.code}: ${dbErr.message}${dbErr.details ? ' — ' + dbErr.details : ''}`)
        }
      }

      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
      setUploadStep('')
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent'
  const labelCls = 'block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide'

  const TYPE_OPTIONS = [
    { value: 'report', label: 'Country Risk Report', icon: Globe },
    { value: 'sop',    label: 'SOP',                 icon: FileText },
    { value: 'case',   label: 'Case Study',           icon: BookOpen },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Brain size={18} style={{ color: BRAND_BLUE }} />
            <h2 className="text-base font-bold text-gray-900">Add to Knowledge Base</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Type selector */}
          <div>
            <label className={labelCls}>Type</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map(opt => {
                const Icon = opt.icon
                return (
                  <button key={opt.value} type="button"
                    onClick={() => set('type', opt.value)}
                    className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-semibold transition-all
                      ${form.type === opt.value
                        ? 'border-[#0118A1] bg-[#0118A1]/5 text-[#0118A1]'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                    <Icon size={16} />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Doc Tier */}
          <div>
            <label className={labelCls}>Coverage</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'country',  label: 'Country' },
                { value: 'regional', label: 'Regional' },
                { value: 'global',   label: 'Global' },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => set('doc_tier', opt.value)}
                  className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all
                    ${form.doc_tier === opt.value
                      ? 'border-[#0118A1] bg-[#0118A1]/5 text-[#0118A1]'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* PDF upload — shown for all types */}
          <div>
            <label className={labelCls}>Upload PDF {form.type === 'report' ? '' : '(optional)'}</label>
            <div
              onClick={() => fileRef.current?.click()}
              className={`flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors
                ${pdfFile ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'}`}>
              {pdfFile
                ? <><File size={16} className="text-green-600 shrink-0" /><span className="text-sm font-medium text-green-700 truncate">{pdfFile.name}</span></>
                : <><Upload size={16} className="text-gray-400 shrink-0" /><span className="text-sm text-gray-400">Click to upload PDF (max 20 MB)</span></>
              }
            </div>
            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />
            {pdfFile && (
              <button type="button" onClick={() => { setPdfFile(null); if (fileRef.current) fileRef.current.value = '' }}
                className="text-xs text-red-500 hover:underline mt-1">Remove file</button>
            )}
          </div>

          {/* Text content fallback */}
          {!pdfFile && (
            <div>
              <label className={labelCls}>Or paste content {form.type !== 'report' ? <span className="text-red-400">*</span> : ''}</label>
              <textarea
                value={form.content}
                onChange={e => set('content', e.target.value)}
                className={`${inputCls} resize-y`}
                rows={5}
                placeholder="Paste report or document text here…"
              />
            </div>
          )}

          {/* Title */}
          <div>
            <label className={labelCls}>Title <span className="text-red-400">*</span></label>
            <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
              className={inputCls} placeholder={form.type === 'report' ? 'e.g. Kenya Country Risk Report Q2 2025' : 'e.g. SOP for Medical Evacuation'} />
          </div>

          {/* Publisher / Source — prominent for reports */}
          <div>
            <label className={labelCls}>{form.type === 'report' ? 'Publisher / Source' : 'Source File Name (optional)'}</label>
            <input type="text" value={form.publisher} onChange={e => set('publisher', e.target.value)}
              className={inputCls}
              placeholder={form.type === 'report' ? 'e.g. Control Risks, Stratfor, SafeGuard 360' : 'e.g. medevac_sop_v3.pdf'} />
          </div>

          {/* Report date — reports only */}
          {form.type === 'report' && (
            <div>
              <label className={labelCls}>Report Date</label>
              <input type="text" value={form.report_date} onChange={e => set('report_date', e.target.value)}
                className={inputCls} placeholder="e.g. 2026-05" />
            </div>
          )}

          {/* Countries */}
          <div>
            <label className={labelCls}>Countries</label>
            <input type="text" value={form.countries} onChange={e => set('countries', e.target.value)}
              className={inputCls} placeholder="e.g. Kenya, Somalia" />
          </div>

          {/* Regions */}
          <div>
            <label className={labelCls}>Regions</label>
            <input type="text" value={form.regions} onChange={e => set('regions', e.target.value)}
              className={inputCls} placeholder="e.g. East Africa, Sahel" />
          </div>

          {/* Threat Categories */}
          <div>
            <label className={labelCls}>Threat Categories</label>
            <input type="text" value={form.threat_categories} onChange={e => set('threat_categories', e.target.value)}
              className={inputCls} placeholder="e.g. kidnap, civil unrest, terrorism" />
          </div>

          {/* Tags */}
          <div>
            <label className={labelCls}>Tags</label>
            <input type="text" value={form.tags} onChange={e => set('tags', e.target.value)}
              className={inputCls} placeholder="e.g. high-risk, Q2-2025" />
          </div>

          {/* Outcome — case studies only */}
          {form.type === 'case' && (
            <div>
              <label className={labelCls}>Outcome</label>
              <select value={form.outcome} onChange={e => set('outcome', e.target.value)} className={inputCls}>
                <option value="">— Select outcome —</option>
                {['resolved', 'ongoing', 'escalated', 'evacuated', 'other'].map(o => (
                  <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={14} />{error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          {saving && uploadStep && <span className="text-xs text-gray-400 italic">{uploadStep}</span>}
          <div className="flex gap-3 ml-auto">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2 transition-opacity disabled:opacity-60"
              style={{ background: BRAND_BLUE }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {saving ? 'Processing…' : 'Add to CAIRO'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Knowledge Card ────────────────────────────────────────────────────────────

function KnowledgeCard({ item, onToggle, onDelete }) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    setDeleting(true)
    await onDelete(item.id)
    setDeleting(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 transition-shadow hover:shadow-md">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <TypeBadge type={item.type} />
          <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">{item.title}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Active toggle */}
          <button
            onClick={() => onToggle(item)}
            title={item.is_active ? 'Deactivate' : 'Activate'}
            className="p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {item.is_active
              ? <ToggleRight size={20} style={{ color: BRAND_GREEN }} />
              : <ToggleLeft size={20} className="text-gray-300" />
            }
          </button>
          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete"
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          </button>
        </div>
      </div>

      {/* Summary */}
      {item.summary && (
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{item.summary}</p>
      )}

      {/* Content preview if no summary */}
      {!item.summary && item.content && (
        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{item.content}</p>
      )}

      {/* Chips */}
      <div className="flex flex-wrap gap-1.5">
        {(item.countries || []).map(c => <Chip key={c} label={c} color="blue" />)}
        {(item.threat_categories || []).map(t => <Chip key={t} label={t} color="gray" />)}
        {item.type === 'case' && item.outcome && (
          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            {item.outcome}
          </span>
        )}
      </div>

      {/* Status indicator */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-50">
        <span className={`text-[10px] font-semibold ${item.is_active ? 'text-green-600' : 'text-gray-400'}`}>
          {item.is_active ? '● Active' : '○ Inactive'}
        </span>
        {item.source_file && (
          <span className="text-[10px] text-gray-400 truncate max-w-[140px]" title={item.source_file}>
            {item.source_file}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['admin', 'developer', 'org_admin']

export default function KnowledgeBase() {
  const [profile, setProfile]     = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast]         = useState('')
  const [filter, setFilter]       = useState('all')  // all | report | sop | case
  const [search, setSearch]       = useState('')

  // Auth check
  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setAuthLoading(false); return }
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      setProfile(prof)
      setAuthLoading(false)
    }
    check()
  }, [])

  // Load items
  const loadItems = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('cairo_knowledge')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setItems(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile && ALLOWED_ROLES.includes(profile.role)) {
      loadItems()
    }
  }, [profile])

  // Toggle active
  const handleToggle = async (item) => {
    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i))
    const { error } = await supabase
      .from('cairo_knowledge')
      .update({ is_active: !item.is_active })
      .eq('id', item.id)
    if (error) {
      // Revert on error
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: item.is_active } : i))
      setToast('Failed to update status.')
    }
  }

  // Delete
  const handleDelete = async (id) => {
    const { error } = await supabase.from('cairo_knowledge').delete().eq('id', id)
    if (error) { setToast('Failed to delete item.'); return }
    setItems(prev => prev.filter(i => i.id !== id))
    setToast('Item deleted.')
  }

  // Add success
  const handleAddSuccess = () => {
    setShowModal(false)
    setToast('Knowledge item added successfully.')
    loadItems()
  }

  // Filtered items
  const filtered = items.filter(item => {
    if (filter === 'sop' && item.type !== 'sop') return false
    if (filter === 'case' && item.type !== 'case') return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        item.title?.toLowerCase().includes(q) ||
        item.summary?.toLowerCase().includes(q) ||
        item.content?.toLowerCase().includes(q)
      )
    }
    return true
  })

  // ── Render guards ──

  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 size={28} className="animate-spin text-gray-400" />
        </div>
      </Layout>
    )
  }

  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <AlertCircle size={32} className="text-red-400" />
          <p className="text-gray-600 font-medium">Access denied. This page is restricted to administrators.</p>
        </div>
      </Layout>
    )
  }

  // ── Main UI ──

  return (
    <Layout>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
            style={{ background: BRAND_BLUE }}>
            <Brain size={20} color="white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">CAIRO Knowledge Base</h1>
            <p className="text-sm text-gray-500 mt-0.5">SOPs and case studies that inform CAIRO's analysis. <span className="text-[10px] text-gray-300">v26.05.26</span></p>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity shrink-0"
          style={{ background: BRAND_BLUE }}
        >
          <Plus size={16} />
          Add Knowledge
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {[
            { key: 'all',    label: 'All' },
            { key: 'report', label: 'Reports' },
            { key: 'sop',    label: 'SOPs' },
            { key: 'case',   label: 'Cases' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                filter === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.key === 'all' && items.length > 0 && (
                <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">
                  {items.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title or summary…"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent bg-white"
            style={{ '--tw-ring-color': BRAND_BLUE }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={28} className="animate-spin" style={{ color: BRAND_BLUE }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
          <Brain size={32} className="text-gray-300" />
          <p className="text-gray-500 font-medium">
            {items.length === 0 ? 'No knowledge items yet.' : 'No items match your search.'}
          </p>
          {items.length === 0 && (
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: BRAND_BLUE }}
            >
              Add your first item
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(item => (
            <KnowledgeCard
              key={item.id}
              item={item}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <AddModal
          onClose={() => setShowModal(false)}
          onSuccess={handleAddSuccess}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </Layout>
  )
}
