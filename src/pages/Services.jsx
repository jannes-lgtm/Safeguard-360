import { useEffect, useState } from 'react'
import {
  Briefcase, Plus, X, ExternalLink, Phone, Mail, Globe,
  MapPin, Search, CheckCircle, Clock, Edit2, Trash2, ChevronDown
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const BRAND_BLUE = '#0118A1'
const BRAND_GREEN = '#AACC00'

// ── Service categories ────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'transport',    label: 'Ground Transport',       emoji: '🚗' },
  { id: 'vehicle',      label: 'Vehicle Rental',          emoji: '🚙' },
  { id: 'protection',   label: 'Close Protection',        emoji: '🛡️' },
  { id: 'medical',      label: 'Medical Services',        emoji: '🏥' },
  { id: 'evacuation',   label: 'Emergency Evacuation',    emoji: '🚁' },
  { id: 'accommodation',label: 'Accommodation',           emoji: '🏨' },
  { id: 'aviation',     label: 'Aviation / Charter',      emoji: '✈️' },
  { id: 'legal',        label: 'Legal Services',          emoji: '⚖️' },
  { id: 'translation',  label: 'Interpretation',          emoji: '🌐' },
  { id: 'other',        label: 'Other',                   emoji: '📋' },
]
const getCat = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1]

// ── Countries (same 35 as Briefings) ─────────────────────────────────────────
const COUNTRIES = [
  'Angola','Botswana','Cameroon','Chad','Democratic Republic of Congo',
  'Egypt','Ethiopia','Ghana','Iraq','Jordan','Kenya','Lebanon','Libya',
  'Mali','Mauritania','Morocco','Mozambique','Namibia','Niger','Nigeria',
  'Rwanda','Saudi Arabia','Senegal','Sierra Leone','Somalia','South Africa',
  'South Sudan','Sudan','Syria','Tanzania','Tunisia','Uganda','Yemen','Zambia','Zimbabwe',
].sort()

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  vetted:  { label: 'Vetted',    icon: CheckCircle, color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200' },
  pending: { label: 'Pending',   icon: Clock,       color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  suspended:{ label: 'Suspended',icon: X,           color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200'   },
}
const getStatus = s => STATUS[s] || STATUS.pending

// ── Provider card ─────────────────────────────────────────────────────────────
function ProviderCard({ provider, isAdmin, onEdit, onDelete }) {
  const cat = getCat(provider.category)
  const st  = getStatus(provider.status)
  const StIcon = st.icon

  return (
    <div className="bg-white rounded-[8px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 flex flex-col gap-3 hover:shadow-[0_2px_8px_rgba(0,0,0,0.10)] transition-shadow">
      {/* Top row: category + status */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <span>{cat.emoji}</span>{cat.label}
        </span>
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.bg} ${st.border} ${st.color}`}>
          <StIcon size={10} strokeWidth={2.5} />{st.label}
        </span>
      </div>

      {/* Name */}
      <div>
        <h3 className="text-base font-bold text-gray-900 leading-snug">{provider.name}</h3>
        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
          <MapPin size={10} />
          {provider.country}{provider.city ? ` · ${provider.city}` : ''}
        </p>
      </div>

      {/* Description */}
      {provider.description && (
        <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{provider.description}</p>
      )}

      {/* Contact details */}
      <div className="space-y-1.5 mt-auto">
        {provider.contact_phone && (
          <a href={`tel:${provider.contact_phone}`}
            className="flex items-center gap-2 text-xs text-gray-600 hover:text-[#0118A1] transition-colors">
            <Phone size={11} className="shrink-0 text-gray-400" />{provider.contact_phone}
          </a>
        )}
        {provider.contact_email && (
          <a href={`mailto:${provider.contact_email}`}
            className="flex items-center gap-2 text-xs text-gray-600 hover:text-[#0118A1] transition-colors truncate">
            <Mail size={11} className="shrink-0 text-gray-400" />{provider.contact_email}
          </a>
        )}
        {provider.contact_website && (
          <a href={provider.contact_website.startsWith('http') ? provider.contact_website : `https://${provider.contact_website}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-[#0118A1] hover:underline font-medium truncate">
            <Globe size={11} className="shrink-0" />
            {provider.contact_website.replace(/^https?:\/\//, '')}
            <ExternalLink size={10} className="shrink-0 ml-auto" />
          </a>
        )}
      </div>

      {/* Admin actions */}
      {isAdmin && (
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <button onClick={() => onEdit(provider)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#0118A1] transition-colors">
            <Edit2 size={11} />Edit
          </button>
          <button onClick={() => onDelete(provider)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors ml-auto">
            <Trash2 size={11} />Remove
          </button>
        </div>
      )}
    </div>
  )
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────
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
    status: provider?.status || 'vetted',
    notes: provider?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
      status: form.status,
      notes: form.notes.trim() || null,
    }
    const { error: err } = editing
      ? await supabase.from('service_providers').update(payload).eq('id', provider.id)
      : await supabase.from('service_providers').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  const input = 'w-full border border-gray-200 rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 focus:border-[#0118A1] text-gray-900'
  const label = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-[12px] shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{editing ? 'Edit Provider' : 'Add Service Provider'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className={label}>Provider Name *</label>
            <input className={input} placeholder="e.g. SecureMove Africa" {...f('name')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Category</label>
              <select className={input} {...f('category')}>
                {CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Status</label>
              <select className={input} {...f('status')}>
                <option value="vetted">✅ Vetted</option>
                <option value="pending">⏳ Pending</option>
                <option value="suspended">🚫 Suspended</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Country *</label>
              <select className={input} {...f('country')}>
                <option value="">Select country…</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>City / Region</label>
              <input className={input} placeholder="e.g. Johannesburg" {...f('city')} />
            </div>
          </div>

          <div>
            <label className={label}>Description</label>
            <textarea className={input} rows={3}
              placeholder="What services do they provide? Any specialisations or vetting notes…"
              {...f('description')} />
          </div>

          <div>
            <label className={label}>Phone</label>
            <input className={input} placeholder="+27 11 xxx xxxx" type="tel" {...f('contact_phone')} />
          </div>
          <div>
            <label className={label}>Email</label>
            <input className={input} placeholder="ops@provider.com" type="email" {...f('contact_email')} />
          </div>
          <div>
            <label className={label}>Website</label>
            <input className={input} placeholder="https://provider.com" {...f('contact_website')} />
          </div>
          <div>
            <label className={label}>Internal Notes (admin only)</label>
            <textarea className={input} rows={2}
              placeholder="Vetting date, contact person, contract reference…"
              {...f('notes')} />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ background: BRAND_GREEN, color: BRAND_BLUE }}
            className="font-semibold px-5 py-2 rounded-[6px] text-sm transition-opacity disabled:opacity-60 hover:opacity-90">
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Provider'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Confirm delete dialog ─────────────────────────────────────────────────────
function DeleteConfirm({ provider, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false)
  const confirm = async () => {
    setDeleting(true)
    await onConfirm()
    setDeleting(false)
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-[12px] shadow-xl w-full max-w-sm p-6">
        <h3 className="text-base font-bold text-gray-900 mb-2">Remove Provider</h3>
        <p className="text-sm text-gray-600 mb-5">
          Remove <span className="font-semibold">{provider.name}</span> from the vetted providers list? This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
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
  const [providers, setProviders]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [isAdmin, setIsAdmin]           = useState(false)
  const [countryFilter, setCountryFilter] = useState('All')
  const [catFilter, setCatFilter]       = useState('all')
  const [search, setSearch]             = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [editingProvider, setEditingProvider] = useState(null)
  const [deletingProvider, setDeletingProvider] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const role = prof?.role || user.app_metadata?.role || user.user_metadata?.role || 'traveller'
      setIsAdmin(role === 'admin')
    }
    const { data } = await supabase
      .from('service_providers')
      .select('*')
      .order('country')
      .order('category')
      .order('name')
    setProviders(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDelete = async () => {
    await supabase.from('service_providers').delete().eq('id', deletingProvider.id)
    await load()
  }

  const openEdit = p => { setEditingProvider(p); setShowModal(true) }
  const openAdd  = () => { setEditingProvider(null); setShowModal(true) }

  // Filtered list
  const filtered = providers.filter(p => {
    const countryOk = countryFilter === 'All' || p.country === countryFilter
    const catOk = catFilter === 'all' || p.category === catFilter
    const searchOk = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.city || '').toLowerCase().includes(search.toLowerCase())
    return countryOk && catOk && searchOk
  })

  // Countries that actually have providers
  const activeCountries = ['All', ...new Set(providers.map(p => p.country))].sort((a, b) => a === 'All' ? -1 : a.localeCompare(b))

  // Group filtered providers by country
  const grouped = filtered.reduce((acc, p) => {
    if (!acc[p.country]) acc[p.country] = []
    acc[p.country].push(p)
    return acc
  }, {})

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
        <DeleteConfirm
          provider={deletingProvider}
          onClose={() => setDeletingProvider(null)}
          onConfirm={handleDelete}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Briefcase size={20} className="text-[#0118A1]" />
            <h1 className="text-2xl font-bold text-gray-900">Service Providers</h1>
          </div>
          <p className="text-sm text-gray-500">Vetted and approved suppliers — transport, protection, medical and more</p>
        </div>
        {isAdmin && (
          <button onClick={openAdd}
            style={{ background: BRAND_GREEN, color: BRAND_BLUE }}
            className="flex items-center gap-2 font-semibold px-4 py-2 rounded-[6px] text-sm hover:opacity-90 transition-opacity">
            <Plus size={15} />Add Provider
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4 text-center">
          <div className="text-3xl font-bold text-gray-900">{providers.length}</div>
          <div className="text-xs text-gray-500 mt-1">Total Providers</div>
        </div>
        <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4 text-center">
          <div className="text-3xl font-bold text-green-600">{providers.filter(p => p.status === 'vetted').length}</div>
          <div className="text-xs text-gray-500 mt-1">Vetted</div>
        </div>
        <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4 text-center">
          <div className="text-3xl font-bold text-[#0118A1]">{new Set(providers.map(p => p.country)).size}</div>
          <div className="text-xs text-gray-500 mt-1">Countries</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search providers…"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 focus:border-[#0118A1]"
          />
        </div>

        {/* Country filter */}
        <div className="relative">
          <select
            value={countryFilter}
            onChange={e => setCountryFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 focus:border-[#0118A1] bg-white text-gray-700 cursor-pointer">
            {activeCountries.map(c => <option key={c} value={c}>{c === 'All' ? '🌍 All Countries' : c}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        {/* Category filter pills */}
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
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-48 bg-white rounded-[8px] border border-gray-200 animate-pulse" />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <div className="bg-white rounded-[8px] border border-gray-200 p-16 text-center">
          <Briefcase size={36} className="mx-auto mb-4 text-gray-200" />
          <p className="text-base font-semibold text-gray-500 mb-1">No service providers yet</p>
          <p className="text-sm text-gray-400 mb-5">Add your first vetted supplier to get started</p>
          {isAdmin && (
            <button onClick={openAdd}
              style={{ background: BRAND_GREEN, color: BRAND_BLUE }}
              className="inline-flex items-center gap-2 font-semibold px-4 py-2 rounded-[6px] text-sm hover:opacity-90">
              <Plus size={14} /> Add Provider
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-[8px] border border-gray-200 p-12 text-center text-sm text-gray-400">
          No providers match the selected filters.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([country, countryProviders]) => (
            <div key={country}>
              <div className="flex items-center gap-2 mb-3">
                <MapPin size={14} className="text-[#0118A1]" />
                <h2 className="text-sm font-bold text-gray-800">{country}</h2>
                <span className="text-xs text-gray-400">{countryProviders.length} provider{countryProviders.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {countryProviders.map(p => (
                  <ProviderCard
                    key={p.id}
                    provider={p}
                    isAdmin={isAdmin}
                    onEdit={openEdit}
                    onDelete={() => setDeletingProvider(p)}
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
