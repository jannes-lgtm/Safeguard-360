import { useEffect, useState, useRef } from 'react'
import {
  Briefcase, Plus, X, ExternalLink, Phone, Mail, Globe,
  MapPin, Search, CheckCircle, Clock, Edit2, Trash2,
  ChevronDown, Upload, FileText, User, Shield, AlertCircle,
  Download, Calendar, Building, Hash, RefreshCw, Check
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

// ── Categories ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'transport',     label: 'Ground Transport',     emoji: '🚗' },
  { id: 'vehicle',       label: 'Vehicle Rental',        emoji: '🚙' },
  { id: 'protection',    label: 'Close Protection',      emoji: '🛡️' },
  { id: 'medical',       label: 'Medical Services',      emoji: '🏥' },
  { id: 'evacuation',    label: 'Emergency Evacuation',  emoji: '🚁' },
  { id: 'accommodation', label: 'Accommodation',         emoji: '🏨' },
  { id: 'aviation',      label: 'Aviation / Charter',    emoji: '✈️' },
  { id: 'legal',         label: 'Legal Services',        emoji: '⚖️' },
  { id: 'translation',   label: 'Interpretation',        emoji: '🌐' },
  { id: 'other',         label: 'Other',                 emoji: '📋' },
]
const getCat = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1]

// ── Document types ────────────────────────────────────────────────────────────
const DOC_TYPES = [
  { id: 'registration',   label: 'Company Registration Certificate' },
  { id: 'insurance',      label: 'Insurance Certificate' },
  { id: 'license',        label: 'Operating License' },
  { id: 'tax',            label: 'Tax Clearance Certificate' },
  { id: 'accreditation',  label: 'Industry Accreditation' },
  { id: 'contract',       label: 'Signed Contract / SLA' },
  { id: 'reference',      label: 'Reference Letter' },
  { id: 'other',          label: 'Other Document' },
]
const getDocType = id => DOC_TYPES.find(d => d.id === id) || DOC_TYPES[DOC_TYPES.length - 1]

// ── Countries ─────────────────────────────────────────────────────────────────
const COUNTRIES = [
  'Angola','Botswana','Cameroon','Chad','Democratic Republic of Congo',
  'Egypt','Ethiopia','Ghana','Iraq','Jordan','Kenya','Lebanon','Libya',
  'Mali','Mauritania','Morocco','Mozambique','Namibia','Niger','Nigeria',
  'Rwanda','Saudi Arabia','Senegal','Sierra Leone','Somalia','South Africa',
  'South Sudan','Sudan','Syria','Tanzania','Tunisia','Uganda','Yemen','Zambia','Zimbabwe',
].sort()

// ── Status config ─────────────────────────────────────────────────────────────
const PROVIDER_STATUS = {
  vetted:    { label: 'Vetted',    icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50',  border: 'border-green-200' },
  pending:   { label: 'Pending',   icon: Clock,       color: 'text-amber-600', bg: 'bg-amber-50',  border: 'border-amber-200' },
  suspended: { label: 'Suspended', icon: X,           color: 'text-red-600',   bg: 'bg-red-50',    border: 'border-red-200'   },
}
const getStatus = s => PROVIDER_STATUS[s] || PROVIDER_STATUS.pending

const REF_STATUS = {
  pending:   { label: 'Not contacted', color: 'text-gray-500',   bg: 'bg-gray-100' },
  contacted: { label: 'Contacted',     color: 'text-amber-600',  bg: 'bg-amber-50' },
  verified:  { label: 'Verified ✓',    color: 'text-green-600',  bg: 'bg-green-50' },
  failed:    { label: 'Failed ✗',      color: 'text-red-600',    bg: 'bg-red-50'   },
}

// ── Compliance score ──────────────────────────────────────────────────────────
function calcScore(docs, refs) {
  let score = 0
  const hasDocs = type => docs.some(d => d.document_type === type && d.status !== 'expired')
  if (hasDocs('registration'))  score += 20
  if (hasDocs('insurance'))     score += 20
  if (hasDocs('license'))       score += 15
  if (hasDocs('tax'))           score += 10
  if (hasDocs('contract'))      score += 10
  const verified = refs.filter(r => r.status === 'verified').length
  score += Math.min(verified, 2) * 12  // up to 24 pts for 2 verified refs
  if (docs.length + refs.length > 0 && score === 0) score = 1 // show something
  return Math.min(score, 100)
}

function ScoreBadge({ score }) {
  const color = score >= 75 ? 'text-green-600' : score >= 40 ? 'text-amber-600' : 'text-red-500'
  const bg    = score >= 75 ? 'bg-green-50 border-green-200' : score >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${bg} ${color}`}>
      <Shield size={10} />{score}%
    </span>
  )
}

function ScoreBar({ score }) {
  const color = score >= 75 ? 'bg-green-500' : score >= 40 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-2">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${score}%` }} />
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const isExpired = date => date && new Date(date) < new Date()
const fmtDate   = date => date ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

// ── Provider card ─────────────────────────────────────────────────────────────
function ProviderCard({ provider, score, isAdmin, onEdit, onDelete, onView }) {
  const cat = getCat(provider.category)
  const st  = getStatus(provider.status)
  const StIcon = st.icon

  return (
    <div
      onClick={onView}
      className="bg-white rounded-[8px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 flex flex-col gap-3 hover:shadow-[0_2px_8px_rgba(0,0,0,0.10)] hover:border-[#0118A1]/30 transition-all cursor-pointer">
      {/* Top: category + status */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <span>{cat.emoji}</span>{cat.label}
        </span>
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.bg} ${st.border} ${st.color}`}>
          <StIcon size={10} strokeWidth={2.5} />{st.label}
        </span>
      </div>

      {/* Name + location */}
      <div>
        <h3 className="text-base font-bold text-gray-900 leading-snug">{provider.name}</h3>
        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
          <MapPin size={10} />
          {provider.country}{provider.city ? ` · ${provider.city}` : ''}
        </p>
      </div>

      {/* Description */}
      {provider.description && (
        <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{provider.description}</p>
      )}

      {/* Compliance score */}
      <div className="mt-auto">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400 font-medium">Compliance</span>
          <ScoreBadge score={score} />
        </div>
        <ScoreBar score={score} />
      </div>

      {/* Quick contacts */}
      <div className="space-y-1 border-t border-gray-100 pt-2">
        {provider.contact_phone && (
          <p className="text-xs text-gray-500 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            <Phone size={10} className="text-gray-400" />{provider.contact_phone}
          </p>
        )}
        {provider.contact_website && (
          <a href={provider.contact_website.startsWith('http') ? provider.contact_website : `https://${provider.contact_website}`}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-xs text-[#0118A1] hover:underline flex items-center gap-1.5">
            <Globe size={10} />{provider.contact_website.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2 border-t border-gray-100 pt-2" onClick={e => e.stopPropagation()}>
          <button onClick={() => onEdit(provider)} className="text-xs text-gray-500 hover:text-[#0118A1] flex items-center gap-1">
            <Edit2 size={10} />Edit
          </button>
          <button onClick={() => onDelete(provider)} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 ml-auto">
            <Trash2 size={10} />Remove
          </button>
        </div>
      )}
    </div>
  )
}

// ── Document row ──────────────────────────────────────────────────────────────
function DocRow({ doc, isAdmin, onDelete }) {
  const expired = isExpired(doc.expiry_date)
  const [url, setUrl] = useState(null)

  useEffect(() => {
    if (!doc.file_path) return
    supabase.storage.from('provider-documents').createSignedUrl(doc.file_path, 3600)
      .then(({ data }) => { if (data) setUrl(data.signedUrl) })
  }, [doc.file_path])

  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 last:border-0 ${expired ? 'bg-red-50/40' : ''}`}>
      <FileText size={14} className={expired ? 'text-red-400' : 'text-gray-400'} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{doc.document_name}</p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-[11px] text-gray-500">{getDocType(doc.document_type).label}</span>
          {doc.country && <span className="text-[11px] text-gray-400 flex items-center gap-1"><MapPin size={9}/>{doc.country}</span>}
          {doc.expiry_date && (
            <span className={`text-[11px] flex items-center gap-1 font-medium ${expired ? 'text-red-600' : 'text-gray-500'}`}>
              <Calendar size={9}/>{expired ? 'Expired ' : 'Expires '}{fmtDate(doc.expiry_date)}
            </span>
          )}
        </div>
        {doc.notes && <p className="text-[11px] text-gray-400 mt-0.5">{doc.notes}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-[#0118A1] hover:underline flex items-center gap-1 font-medium">
            <Download size={11} />View
          </a>
        )}
        {isAdmin && (
          <button onClick={() => onDelete(doc)} className="text-gray-300 hover:text-red-400 transition-colors">
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Document upload ───────────────────────────────────────────────────────────
function DocumentUpload({ providerId, onUploaded }) {
  const [docType, setDocType]     = useState('registration')
  const [docName, setDocName]     = useState('')
  const [country, setCountry]     = useState('')
  const [expiry, setExpiry]       = useState('')
  const [notes, setNotes]         = useState('')
  const [file, setFile]           = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')
  const fileRef = useRef()

  const handleUpload = async () => {
    if (!file) { setError('Please select a file'); return }
    if (!docName.trim()) { setError('Please enter a document name'); return }
    setUploading(true)
    setError('')
    const ext = file.name.split('.').pop()
    const path = `${providerId}/${Date.now()}-${docType}.${ext}`
    const { error: upErr } = await supabase.storage.from('provider-documents').upload(path, file)
    if (upErr) { setError(upErr.message); setUploading(false); return }
    const { error: dbErr } = await supabase.from('provider_documents').insert({
      provider_id: providerId,
      document_type: docType,
      document_name: docName.trim(),
      file_path: path,
      file_size: file.size,
      country: country || null,
      expiry_date: expiry || null,
      notes: notes.trim() || null,
      status: expiry && isExpired(expiry) ? 'expired' : 'valid',
    })
    setUploading(false)
    if (dbErr) { setError(dbErr.message); return }
    setFile(null); setDocName(''); setExpiry(''); setNotes(''); setCountry('')
    if (fileRef.current) fileRef.current.value = ''
    onUploaded()
  }

  const input = 'w-full border border-gray-200 rounded-[6px] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 focus:border-[#0118A1]'

  return (
    <div className="bg-gray-50 rounded-[8px] border border-gray-200 p-4 space-y-3">
      <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Upload Document</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-gray-500 mb-0.5 block">Document Type</label>
          <select className={input} value={docType} onChange={e => setDocType(e.target.value)}>
            {DOC_TYPES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-gray-500 mb-0.5 block">Country (if specific)</label>
          <select className={input} value={country} onChange={e => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-[11px] text-gray-500 mb-0.5 block">Document Name *</label>
        <input className={input} placeholder="e.g. CIPC Registration Certificate 2024"
          value={docName} onChange={e => setDocName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-gray-500 mb-0.5 block">Expiry Date</label>
          <input type="date" className={input} value={expiry} onChange={e => setExpiry(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 mb-0.5 block">Notes</label>
          <input className={input} placeholder="Optional notes" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-[11px] text-gray-500 mb-0.5 block">File *</label>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          onChange={e => setFile(e.target.files[0])}
          className="w-full text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-[6px] file:border-0 file:text-xs file:font-semibold file:bg-[#0118A1] file:text-white hover:file:bg-[#0118A1]/80 cursor-pointer" />
        <p className="text-[10px] text-gray-400 mt-1">PDF, JPG, PNG, DOC — max 10 MB</p>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button onClick={handleUpload} disabled={uploading}
        style={{ background: BRAND_GREEN, color: BRAND_BLUE }}
        className="flex items-center gap-2 font-semibold px-4 py-2 rounded-[6px] text-sm disabled:opacity-60 hover:opacity-90">
        {uploading ? <><RefreshCw size={13} className="animate-spin" />Uploading…</> : <><Upload size={13} />Upload Document</>}
      </button>
    </div>
  )
}

// ── Reference row ─────────────────────────────────────────────────────────────
function RefRow({ ref: reference, isAdmin, onStatusChange, onDelete }) {
  const st = REF_STATUS[reference.status] || REF_STATUS.pending
  const statuses = Object.entries(REF_STATUS)

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
      <User size={14} className="text-gray-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{reference.reference_name}</p>
        {reference.reference_company && <p className="text-xs text-gray-500">{reference.reference_company}</p>}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {reference.reference_email && (
            <a href={`mailto:${reference.reference_email}`} className="text-[11px] text-[#0118A1] hover:underline flex items-center gap-1">
              <Mail size={9}/>{reference.reference_email}
            </a>
          )}
          {reference.reference_phone && (
            <span className="text-[11px] text-gray-500 flex items-center gap-1">
              <Phone size={9}/>{reference.reference_phone}
            </span>
          )}
        </div>
        {reference.notes && <p className="text-[11px] text-gray-400 mt-1 italic">"{reference.notes}"</p>}
        {reference.verified_date && (
          <p className="text-[10px] text-gray-400 mt-0.5">Verified: {fmtDate(reference.verified_date)}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isAdmin ? (
          <select
            value={reference.status}
            onChange={e => onStatusChange(reference.id, e.target.value)}
            className={`text-[11px] font-semibold px-2 py-1 rounded-full border-0 cursor-pointer ${st.bg} ${st.color}`}>
            {statuses.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        ) : (
          <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${st.bg} ${st.color}`}>{st.label}</span>
        )}
        {isAdmin && (
          <button onClick={() => onDelete(reference)} className="text-gray-300 hover:text-red-400">
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Add reference form ────────────────────────────────────────────────────────
function AddReference({ providerId, onAdded }) {
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const f = k => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })) })
  const input = 'w-full border border-gray-200 rounded-[6px] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 focus:border-[#0118A1]'

  const handleAdd = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from('provider_references').insert({
      provider_id: providerId,
      reference_name: form.name.trim(),
      reference_company: form.company.trim() || null,
      reference_email: form.email.trim() || null,
      reference_phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
      status: 'pending',
    })
    setSaving(false)
    setForm({ name: '', company: '', email: '', phone: '', notes: '' })
    onAdded()
  }

  return (
    <div className="bg-gray-50 rounded-[8px] border border-gray-200 p-4 space-y-3">
      <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Add Reference</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-gray-500 mb-0.5 block">Full Name *</label>
          <input className={input} placeholder="John Smith" {...f('name')} />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 mb-0.5 block">Company</label>
          <input className={input} placeholder="Previous client / accreditor" {...f('company')} />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 mb-0.5 block">Email</label>
          <input type="email" className={input} placeholder="john@company.com" {...f('email')} />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 mb-0.5 block">Phone</label>
          <input type="tel" className={input} placeholder="+27 xx xxx xxxx" {...f('phone')} />
        </div>
      </div>
      <div>
        <label className="text-[11px] text-gray-500 mb-0.5 block">Notes / Outcome</label>
        <input className={input} placeholder="Reference outcome or notes from call" {...f('notes')} />
      </div>
      <button onClick={handleAdd} disabled={saving || !form.name.trim()}
        style={{ background: BRAND_GREEN, color: BRAND_BLUE }}
        className="flex items-center gap-2 font-semibold px-4 py-2 rounded-[6px] text-sm disabled:opacity-60 hover:opacity-90">
        <Plus size={13} />{saving ? 'Saving…' : 'Add Reference'}
      </button>
    </div>
  )
}

// ── Provider detail modal ─────────────────────────────────────────────────────
function ProviderDetail({ provider, isAdmin, onClose, onEditInfo }) {
  const [tab, setTab]     = useState('overview')
  const [docs, setDocs]   = useState([])
  const [refs, setRefs]   = useState([])
  const [loading, setLoading] = useState(true)

  const loadCompliance = async () => {
    const [{ data: d }, { data: r }] = await Promise.all([
      supabase.from('provider_documents').select('*').eq('provider_id', provider.id).order('created_at', { ascending: false }),
      supabase.from('provider_references').select('*').eq('provider_id', provider.id).order('created_at'),
    ])
    setDocs(d || [])
    setRefs(r || [])
    setLoading(false)
  }

  useEffect(() => { loadCompliance() }, [provider.id])

  const deleteDoc = async (doc) => {
    if (doc.file_path) await supabase.storage.from('provider-documents').remove([doc.file_path])
    await supabase.from('provider_documents').delete().eq('id', doc.id)
    loadCompliance()
  }

  const deleteRef = async (ref) => {
    await supabase.from('provider_references').delete().eq('id', ref.id)
    loadCompliance()
  }

  const updateRefStatus = async (id, status) => {
    const update = { status }
    if (status === 'verified') update.verified_date = new Date().toISOString()
    await supabase.from('provider_references').update(update).eq('id', id)
    loadCompliance()
  }

  const cat    = getCat(provider.category)
  const st     = getStatus(provider.status)
  const StIcon = st.icon
  const score  = calcScore(docs, refs)

  const TABS = [
    { id: 'overview',   label: 'Overview',   icon: Building },
    { id: 'documents',  label: `Documents${docs.length ? ` (${docs.length})` : ''}`, icon: FileText },
    { id: 'references', label: `References${refs.length ? ` (${refs.length})` : ''}`, icon: User },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" style={{ background: 'rgba(0,0,0,0.35)' }}
      onClick={onClose}>
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
          <div className="flex items-start justify-between p-5 pb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{cat.emoji}</span>
                <h2 className="text-lg font-bold text-gray-900">{provider.name}</h2>
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <MapPin size={10}/>{provider.country}{provider.city ? ` · ${provider.city}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button onClick={() => onEditInfo(provider)}
                  className="text-xs text-gray-500 hover:text-[#0118A1] flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-[6px]">
                  <Edit2 size={11}/>Edit
                </button>
              )}
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18}/></button>
            </div>
          </div>

          {/* Compliance bar */}
          <div className="px-5 pb-3 flex items-center gap-3">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.bg} ${st.border} ${st.color}`}>
              <StIcon size={10} strokeWidth={2.5}/>{st.label}
            </span>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-400">Compliance score</span>
                <ScoreBadge score={score}/>
              </div>
              <ScoreBar score={score}/>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 border-t border-gray-100 px-2">
            {TABS.map(t => {
              const Icon = t.icon
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors
                    ${tab === t.id ? 'border-[#0118A1] text-[#0118A1]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  <Icon size={12}/>{t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div className="p-5">

          {/* ── Overview tab ── */}
          {tab === 'overview' && (
            <div className="space-y-5">
              {provider.description && (
                <div>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">About</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{provider.description}</p>
                </div>
              )}

              {/* Contact info */}
              <div>
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Contact</p>
                <div className="space-y-2">
                  {provider.primary_contact_name && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <User size={13} className="text-gray-400 shrink-0"/>
                      <span className="font-medium">{provider.primary_contact_name}</span>
                      <span className="text-gray-400 text-xs">— primary contact</span>
                    </div>
                  )}
                  {provider.contact_phone && (
                    <a href={`tel:${provider.contact_phone}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-[#0118A1]">
                      <Phone size={13} className="text-gray-400 shrink-0"/>{provider.contact_phone}
                    </a>
                  )}
                  {provider.contact_email && (
                    <a href={`mailto:${provider.contact_email}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-[#0118A1]">
                      <Mail size={13} className="text-gray-400 shrink-0"/>{provider.contact_email}
                    </a>
                  )}
                  {provider.contact_website && (
                    <a href={provider.contact_website.startsWith('http') ? provider.contact_website : `https://${provider.contact_website}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-[#0118A1] hover:underline">
                      <Globe size={13} className="shrink-0"/>{provider.contact_website.replace(/^https?:\/\//,'')}
                      <ExternalLink size={11}/>
                    </a>
                  )}
                </div>
              </div>

              {/* Compliance details */}
              <div>
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Registration & Compliance</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {[
                    ['Registration No.', provider.registration_number],
                    ['VAT / Tax No.', provider.vat_number],
                    ['Insurance Provider', provider.insurance_provider],
                    ['Insurance Expiry', fmtDate(provider.insurance_expiry)],
                    ['Years Operating', provider.years_in_operation ? `${provider.years_in_operation} years` : null],
                    ['Last Vetted', fmtDate(provider.last_vetted_date)],
                    ['Next Review', fmtDate(provider.next_review_date)],
                  ].filter(([, v]) => v && v !== '—').map(([label, val]) => (
                    <div key={label}>
                      <p className="text-[10px] text-gray-400">{label}</p>
                      <p className={`text-sm font-medium ${label === 'Insurance Expiry' && isExpired(provider.insurance_expiry) ? 'text-red-600' : 'text-gray-800'}`}>{val}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Compliance checklist */}
              <div>
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Compliance Checklist</p>
                {[
                  { label: 'Registration certificate uploaded', done: docs.some(d => d.document_type === 'registration') },
                  { label: 'Valid insurance certificate', done: docs.some(d => d.document_type === 'insurance' && !isExpired(d.expiry_date)) },
                  { label: 'Operating license on file', done: docs.some(d => d.document_type === 'license') },
                  { label: 'Tax clearance certificate', done: docs.some(d => d.document_type === 'tax') },
                  { label: 'Signed contract / SLA', done: docs.some(d => d.document_type === 'contract') },
                  { label: 'At least 2 references verified', done: refs.filter(r => r.status === 'verified').length >= 2 },
                ].map(item => (
                  <div key={item.label} className={`flex items-center gap-2.5 py-1.5 text-sm
                    ${item.done ? 'text-gray-700' : 'text-gray-400'}`}>
                    {item.done
                      ? <Check size={14} className="text-green-500 shrink-0" strokeWidth={2.5}/>
                      : <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 shrink-0"/>}
                    {item.label}
                  </div>
                ))}
              </div>

              {provider.notes && (
                <div>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Internal Notes</p>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-[6px] p-3 leading-relaxed">{provider.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Documents tab ── */}
          {tab === 'documents' && (
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
              ) : docs.length > 0 ? (
                <div className="bg-white rounded-[8px] border border-gray-200 overflow-hidden">
                  {docs.map(d => (
                    <DocRow key={d.id} doc={d} isAdmin={isAdmin} onDelete={deleteDoc}/>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">No documents uploaded yet.</p>
              )}
              {isAdmin && (
                <DocumentUpload providerId={provider.id} onUploaded={loadCompliance}/>
              )}
            </div>
          )}

          {/* ── References tab ── */}
          {tab === 'references' && (
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
              ) : refs.length > 0 ? (
                <div className="bg-white rounded-[8px] border border-gray-200 overflow-hidden">
                  {refs.map(r => (
                    <RefRow key={r.id} ref={r} isAdmin={isAdmin}
                      onStatusChange={updateRefStatus} onDelete={deleteRef}/>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">No references added yet.</p>
              )}
              {isAdmin && (
                <AddReference providerId={provider.id} onAdded={loadCompliance}/>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Add / Edit provider modal ─────────────────────────────────────────────────
function ProviderModal({ provider, onClose, onSaved }) {
  const editing = !!provider?.id
  const [form, setForm] = useState({
    name: provider?.name || '',
    category: provider?.category || 'transport',
    country: provider?.country || '',
    city: provider?.city || '',
    description: provider?.description || '',
    contact_phone: provider?.contact_phone || '',
    contact_email: provider?.contact_email || '',
    contact_website: provider?.contact_website || '',
    primary_contact_name: provider?.primary_contact_name || '',
    registration_number: provider?.registration_number || '',
    vat_number: provider?.vat_number || '',
    insurance_provider: provider?.insurance_provider || '',
    insurance_expiry: provider?.insurance_expiry?.slice(0, 10) || '',
    years_in_operation: provider?.years_in_operation || '',
    last_vetted_date: provider?.last_vetted_date?.slice(0, 10) || '',
    next_review_date: provider?.next_review_date?.slice(0, 10) || '',
    status: provider?.status || 'vetted',
    notes: provider?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const f = key => ({ value: form[key], onChange: e => setForm(p => ({ ...p, [key]: e.target.value })) })

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Provider name is required'); return }
    if (!form.country) { setError('Country is required'); return }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      category: form.category,
      country: form.country,
      city: form.city.trim() || null,
      description: form.description.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_website: form.contact_website.trim() || null,
      primary_contact_name: form.primary_contact_name.trim() || null,
      registration_number: form.registration_number.trim() || null,
      vat_number: form.vat_number.trim() || null,
      insurance_provider: form.insurance_provider.trim() || null,
      insurance_expiry: form.insurance_expiry || null,
      years_in_operation: form.years_in_operation ? parseInt(form.years_in_operation) : null,
      last_vetted_date: form.last_vetted_date || null,
      next_review_date: form.next_review_date || null,
      status: form.status,
      notes: form.notes.trim() || null,
    }
    const { error: err } = editing
      ? await supabase.from('service_providers').update(payload).eq('id', provider.id)
      : await supabase.from('service_providers').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved(); onClose()
  }

  const inp = 'w-full border border-gray-200 rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 focus:border-[#0118A1] text-gray-900'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'
  const sec = 'text-[11px] font-bold text-gray-500 uppercase tracking-wider pt-4 pb-1 border-t border-gray-100 mt-2'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-[12px] shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{editing ? 'Edit Provider' : 'Add Service Provider'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-3">
          {/* Basic */}
          <p className={sec}>Basic Information</p>
          <div>
            <label className={lbl}>Provider Name *</label>
            <input className={inp} placeholder="e.g. SecureMove Africa" {...f('name')}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Category</label>
              <select className={inp} {...f('category')}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Status</label>
              <select className={inp} {...f('status')}>
                <option value="vetted">✅ Vetted</option>
                <option value="pending">⏳ Pending</option>
                <option value="suspended">🚫 Suspended</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Country *</label>
              <select className={inp} {...f('country')}>
                <option value="">Select country…</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>City / Region</label>
              <input className={inp} placeholder="e.g. Johannesburg" {...f('city')}/>
            </div>
          </div>
          <div>
            <label className={lbl}>Description</label>
            <textarea className={inp} rows={2} placeholder="Services provided, specialisations…" {...f('description')}/>
          </div>

          {/* Contact */}
          <p className={sec}>Contact Details</p>
          <div>
            <label className={lbl}>Primary Contact Name</label>
            <input className={inp} placeholder="e.g. Jane Dlamini" {...f('primary_contact_name')}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Phone</label>
              <input className={inp} placeholder="+27 11 xxx xxxx" type="tel" {...f('contact_phone')}/>
            </div>
            <div>
              <label className={lbl}>Email</label>
              <input className={inp} placeholder="ops@provider.com" type="email" {...f('contact_email')}/>
            </div>
          </div>
          <div>
            <label className={lbl}>Website</label>
            <input className={inp} placeholder="https://provider.com" {...f('contact_website')}/>
          </div>

          {/* Registration */}
          <p className={sec}>Registration & Compliance</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Registration Number</label>
              <input className={inp} placeholder="e.g. 2019/123456/07" {...f('registration_number')}/>
            </div>
            <div>
              <label className={lbl}>VAT / Tax Number</label>
              <input className={inp} placeholder="e.g. 4720123456" {...f('vat_number')}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Insurance Provider</label>
              <input className={inp} placeholder="e.g. Hollard Insurance" {...f('insurance_provider')}/>
            </div>
            <div>
              <label className={lbl}>Insurance Expiry</label>
              <input type="date" className={inp} {...f('insurance_expiry')}/>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Years Operating</label>
              <input className={inp} type="number" min="0" placeholder="e.g. 8" {...f('years_in_operation')}/>
            </div>
            <div>
              <label className={lbl}>Last Vetted</label>
              <input type="date" className={inp} {...f('last_vetted_date')}/>
            </div>
            <div>
              <label className={lbl}>Next Review</label>
              <input type="date" className={inp} {...f('next_review_date')}/>
            </div>
          </div>

          {/* Notes */}
          <p className={sec}>Internal Notes</p>
          <textarea className={inp} rows={2}
            placeholder="Vetting date, contract reference, any concerns…" {...f('notes')}/>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ background: BRAND_GREEN, color: BRAND_BLUE }}
            className="font-semibold px-5 py-2 rounded-[6px] text-sm disabled:opacity-60 hover:opacity-90">
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Provider'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete confirm ────────────────────────────────────────────────────────────
function DeleteConfirm({ provider, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false)
  const confirm = async () => { setDeleting(true); await onConfirm(); setDeleting(false); onClose() }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-[12px] shadow-xl w-full max-w-sm p-6">
        <h3 className="text-base font-bold text-gray-900 mb-2">Remove Provider</h3>
        <p className="text-sm text-gray-600 mb-5">Remove <span className="font-semibold">{provider.name}</span>? All documents and references will also be deleted.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
          <button onClick={confirm} disabled={deleting}
            className="px-4 py-2 text-sm font-semibold bg-red-500 text-white rounded-[6px] hover:bg-red-600 disabled:opacity-60">
            {deleting ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Services() {
  const [providers, setProviders]             = useState([])
  const [scores, setScores]                   = useState({})
  const [loading, setLoading]                 = useState(true)
  const [isAdmin, setIsAdmin]                 = useState(false)
  const [countryFilter, setCountryFilter]     = useState('All')
  const [catFilter, setCatFilter]             = useState('all')
  const [search, setSearch]                   = useState('')
  const [showModal, setShowModal]             = useState(false)
  const [editingProvider, setEditingProvider] = useState(null)
  const [deletingProvider, setDeletingProvider] = useState(null)
  const [viewingProvider, setViewingProvider] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const role = prof?.role || user.app_metadata?.role || 'traveller'
      setIsAdmin(role === 'admin')
    }
    const { data } = await supabase
      .from('service_providers').select('*')
      .order('country').order('category').order('name')
    const list = data || []
    setProviders(list)

    // Load compliance scores for all providers in parallel
    if (list.length) {
      const scoreMap = {}
      await Promise.all(list.map(async p => {
        const [{ data: d }, { data: r }] = await Promise.all([
          supabase.from('provider_documents').select('document_type,expiry_date,status').eq('provider_id', p.id),
          supabase.from('provider_references').select('status').eq('provider_id', p.id),
        ])
        scoreMap[p.id] = calcScore(d || [], r || [])
      }))
      setScores(scoreMap)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDelete = async () => {
    await supabase.from('provider_documents').delete().eq('provider_id', deletingProvider.id)
    await supabase.from('provider_references').delete().eq('provider_id', deletingProvider.id)
    await supabase.from('service_providers').delete().eq('id', deletingProvider.id)
    await load()
  }

  const openEdit = p => { setEditingProvider(p); setShowModal(true) }
  const openAdd  = () => { setEditingProvider(null); setShowModal(true) }

  const filtered = providers.filter(p => {
    const countryOk = countryFilter === 'All' || p.country === countryFilter
    const catOk     = catFilter === 'all' || p.category === catFilter
    const searchOk  = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.city || '').toLowerCase().includes(search.toLowerCase())
    return countryOk && catOk && searchOk
  })

  const activeCountries = ['All', ...new Set(providers.map(p => p.country))].sort((a,b) => a === 'All' ? -1 : a.localeCompare(b))
  const grouped = filtered.reduce((acc, p) => { if (!acc[p.country]) acc[p.country] = []; acc[p.country].push(p); return acc }, {})

  return (
    <Layout>
      {showModal && (
        <ProviderModal
          provider={editingProvider}
          onClose={() => { setShowModal(false); setEditingProvider(null) }}
          onSaved={load}
        />
      )}
      {deletingProvider && (
        <DeleteConfirm provider={deletingProvider}
          onClose={() => setDeletingProvider(null)} onConfirm={handleDelete}/>
      )}
      {viewingProvider && (
        <ProviderDetail
          provider={viewingProvider}
          isAdmin={isAdmin}
          onClose={() => setViewingProvider(null)}
          onEditInfo={p => { setViewingProvider(null); openEdit(p) }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Briefcase size={20} className="text-[#0118A1]"/>
            <h1 className="text-2xl font-bold text-gray-900">Service Providers</h1>
          </div>
          <p className="text-sm text-gray-500">Vetted and compliant suppliers — transport, protection, medical and more</p>
        </div>
        {isAdmin && (
          <button onClick={openAdd}
            style={{ background: BRAND_GREEN, color: BRAND_BLUE }}
            className="flex items-center gap-2 font-semibold px-4 py-2 rounded-[6px] text-sm hover:opacity-90">
            <Plus size={15}/>Add Provider
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Providers',  value: providers.length,                                            color: 'text-gray-900' },
          { label: 'Vetted',           value: providers.filter(p => p.status === 'vetted').length,         color: 'text-green-600' },
          { label: 'Pending Review',   value: providers.filter(p => p.status === 'pending').length,        color: 'text-amber-600' },
          { label: 'Countries',        value: new Set(providers.map(p => p.country)).size,                 color: 'text-[#0118A1]' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4 text-center">
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 flex-wrap">
        <div className="relative max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search providers…"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 focus:border-[#0118A1]"/>
        </div>
        <div className="relative">
          <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-[6px] text-sm bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20">
            {activeCountries.map(c => <option key={c} value={c}>{c === 'All' ? '🌍 All Countries' : c}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setCatFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
              ${catFilter === 'all' ? 'bg-[#0118A1] text-white border-[#0118A1]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            All
          </button>
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setCatFilter(c.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${catFilter === c.id ? 'bg-[#0118A1] text-white border-[#0118A1]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-52 bg-white rounded-[8px] border border-gray-200 animate-pulse"/>)}
        </div>
      ) : providers.length === 0 ? (
        <div className="bg-white rounded-[8px] border border-gray-200 p-16 text-center">
          <Briefcase size={36} className="mx-auto mb-4 text-gray-200"/>
          <p className="text-base font-semibold text-gray-500 mb-1">No service providers yet</p>
          <p className="text-sm text-gray-400 mb-5">Add your first vetted supplier to get started</p>
          {isAdmin && (
            <button onClick={openAdd} style={{ background: BRAND_GREEN, color: BRAND_BLUE }}
              className="inline-flex items-center gap-2 font-semibold px-4 py-2 rounded-[6px] text-sm hover:opacity-90">
              <Plus size={14}/>Add Provider
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-[8px] border border-gray-200 p-12 text-center text-sm text-gray-400">
          No providers match the selected filters.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([country, list]) => (
            <div key={country}>
              <div className="flex items-center gap-2 mb-3">
                <MapPin size={14} className="text-[#0118A1]"/>
                <h2 className="text-sm font-bold text-gray-800">{country}</h2>
                <span className="text-xs text-gray-400">{list.length} provider{list.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map(p => (
                  <ProviderCard key={p.id} provider={p} score={scores[p.id] ?? 0}
                    isAdmin={isAdmin}
                    onEdit={openEdit}
                    onDelete={() => setDeletingProvider(p)}
                    onView={() => setViewingProvider(p)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}
