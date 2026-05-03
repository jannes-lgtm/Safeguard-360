import { useEffect, useState } from 'react'
import {
  Radio, RefreshCw, ExternalLink, Key, Handshake,
  CheckCircle, Clock, Plus, X, Plane, Ship,
  Zap, Globe, Shield, MessageSquare, Crosshair, MapPin
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

// ── Categories ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'flight',       label: 'Flight Intelligence',  icon: Plane,         bg: 'bg-sky-100',    text: 'text-sky-800',    border: 'border-sky-200' },
  { id: 'vessel',       label: 'Vessel Tracking',       icon: Ship,          bg: 'bg-cyan-100',   text: 'text-cyan-800',   border: 'border-cyan-200' },
  { id: 'conflict',     label: 'Armed Conflict',        icon: Crosshair,     bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-200' },
  { id: 'loadshedding', label: 'Load Shedding',         icon: Zap,           bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-200' },
  { id: 'country-risk', label: 'Country Risk',          icon: Globe,         bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200' },
  { id: 'security',     label: 'Security Intelligence', icon: Shield,        bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
  { id: 'community',    label: 'Community Reports',     icon: MessageSquare, bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-200' },
]
const getCat = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[5]

// ── Built-in feeds ───────────────────────────────────────────────────────────
const BUILTIN_FEEDS = [
  // International
  { id: 'flightaware', name: 'FlightAware AeroAPI', category: 'flight', feedType: 'REST API', scope: 'international', countries: [],
    description: 'Live flight status, delays and cancellations for all tracked flights.', geography: 'Global', updateFrequency: 'Real-time',
    status: 'active', sourceUrl: 'https://flightaware.com/aeroapi/', builtin: true },
  { id: 'acled', name: 'ACLED', category: 'conflict', feedType: 'REST API', scope: 'international', countries: [],
    description: 'Armed Conflict Location & Event Data — GPS-tagged security incidents and violence across Africa.', geography: 'Africa-wide', updateFrequency: 'Daily',
    status: 'pending_key', envVar: 'ACLED_API_KEY + ACLED_EMAIL', sourceUrl: 'https://acleddata.com/register/', builtin: true },
  { id: 'state-dept', name: 'US State Dept', category: 'country-risk', feedType: 'REST API', scope: 'international', countries: [],
    description: 'US State Department travel advisories — 4-level risk ratings for every country globally.', geography: 'Global', updateFrequency: 'As issued (1 hr cache)',
    status: 'active', sourceUrl: 'https://travel.state.gov', builtin: true },
  { id: 'fcdo', name: 'UK FCDO', category: 'country-risk', feedType: 'REST API', scope: 'international', countries: [],
    description: 'UK Foreign Commonwealth & Development Office travel advisories — detailed region-level risk ratings.', geography: 'Global', updateFrequency: 'As issued (1 hr cache)',
    status: 'active', sourceUrl: 'https://www.gov.uk/foreign-travel-advice', builtin: true },
  { id: 'whatsapp', name: 'WhatsApp Community', category: 'community', feedType: 'Webhook', scope: 'international', countries: [],
    description: 'Ground-truth incident reports submitted by field contacts and travellers via WhatsApp.', geography: 'All regions', updateFrequency: 'Real-time',
    status: 'active', builtin: true },

  // Local — South Africa
  { id: 'eskomsepush', name: 'EskomSePush', category: 'loadshedding', feedType: 'REST API', scope: 'local', countries: ['South Africa'],
    description: 'Live Eskom load shedding stage and area schedules across South Africa.', geography: 'South Africa', updateFrequency: 'Real-time (15 min cache)',
    status: 'pending_key', envVar: 'ESKOMSEPUSH_API_KEY', sourceUrl: 'https://eskomsepush.gumroad.com/l/api', builtin: true },
  { id: 'riley-risk', name: 'Riley Risk', category: 'security', feedType: 'Partnership', scope: 'local', countries: ['South Africa'],
    description: 'South Africa-based travel security intelligence — local ground truth for SA and sub-Saharan Africa.', geography: 'South Africa', updateFrequency: 'Partnership required',
    status: 'partnership', sourceUrl: 'https://www.rileyrisk.com', builtin: true },
  { id: 'saps', name: 'SAPS Crime Stats', category: 'security', feedType: 'Manual / Upload', scope: 'local', countries: ['South Africa'],
    description: 'South African Police Service quarterly crime statistics by station and province.', geography: 'South Africa', updateFrequency: 'Quarterly',
    status: 'active', sourceUrl: 'https://www.saps.gov.za/services/crimestats.php', builtin: true },

  // Local — Mozambique
  { id: 'prm-moz', name: 'PRM Mozambique', category: 'security', feedType: 'Manual / Upload', scope: 'local', countries: ['Mozambique'],
    description: 'Polícia da República de Moçambique — limited public crime data. ACLED is primary source for Mozambique.', geography: 'Mozambique', updateFrequency: 'Irregular',
    status: 'pending', sourceUrl: 'https://www.mint.gov.mz', builtin: true },

  // Local — Kenya
  { id: 'nps-kenya', name: 'Kenya National Police Service', category: 'security', feedType: 'Manual / Upload', scope: 'local', countries: ['Kenya'],
    description: 'National Police Service Kenya — annual crime statistics and security advisories.', geography: 'Kenya', updateFrequency: 'Annual',
    status: 'pending', sourceUrl: 'https://www.npscommunication.go.ke', builtin: true },

  // Local — Nigeria
  { id: 'npf-nigeria', name: 'Nigeria Police Force', category: 'security', feedType: 'Manual / Upload', scope: 'local', countries: ['Nigeria'],
    description: 'Nigeria Police Force — limited public data. ACLED is primary source for Nigeria.', geography: 'Nigeria', updateFrequency: 'Irregular',
    status: 'pending', sourceUrl: 'https://www.npf.gov.ng', builtin: true },
]

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  active:      { label: 'Live',                dot: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
  pending_key: { label: 'API Key Needed',      dot: 'bg-amber-400',  text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  partnership: { label: 'Pending Partnership', dot: 'bg-violet-400', text: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
  pending:     { label: 'Pending Setup',       dot: 'bg-gray-400',   text: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-200' },
  error:       { label: 'Error',               dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200' },
}

function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.bg} ${s.text} ${s.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  )
}

function CategoryPill({ categoryId }) {
  const c = getCat(categoryId)
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${c.bg} ${c.text} ${c.border}`}>
      <Icon size={10} />{c.label}
    </span>
  )
}

function FeedCard({ feed, onDelete }) {
  return (
    <div className="bg-white rounded-[10px] shadow-[0_1px_4px_rgba(0,0,0,0.08)] p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <h3 className="text-sm font-bold text-gray-900">{feed.name}</h3>
            {!feed.builtin && <span className="text-[10px] bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded font-medium">Custom</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <CategoryPill categoryId={feed.category} />
            <span className="text-[10px] text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded">{feed.feedType}</span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{feed.description}</p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <StatusPill status={feed.status} />
          {!feed.builtin && (
            <button onClick={() => onDelete(feed.id)} className="text-gray-300 hover:text-red-400 transition-colors"><X size={14} /></button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div>
          <span className="text-gray-400">Geography</span>
          <div className="text-gray-700 font-medium mt-0.5">{feed.geography || '—'}</div>
        </div>
        <div>
          <span className="text-gray-400">Update Frequency</span>
          <div className="text-gray-700 font-medium mt-0.5">{feed.updateFrequency || '—'}</div>
        </div>
        {feed.envVar && (
          <div className="col-span-2">
            <span className="text-gray-400">Env Variable</span>
            <div className="text-gray-600 font-mono text-[10px] mt-0.5">{feed.envVar}</div>
          </div>
        )}
        {feed.notes && (
          <div className="col-span-2">
            <span className="text-gray-400">Notes</span>
            <div className="text-gray-600 mt-0.5">{feed.notes}</div>
          </div>
        )}
      </div>

      {feed.sourceUrl && (
        <div className="pt-1 border-t border-gray-100">
          <a href={feed.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#0118A1] hover:underline font-medium">
            <ExternalLink size={11} />
            {feed.status === 'partnership' ? 'Visit website' : feed.status === 'pending_key' ? 'Get API key' : 'Source'}
          </a>
        </div>
      )}
    </div>
  )
}

// ── Add Feed Modal ────────────────────────────────────────────────────────────
const FEED_TYPES = ['REST API', 'RSS Feed', 'Webhook', 'Partnership', 'Manual / Upload']
const SCOPE_OPTIONS = [
  { value: 'international', label: 'International — visible to all offices' },
  { value: 'local',         label: 'Local — specific country / region' },
]
const STATUS_OPTIONS = [
  { value: 'active',      label: 'Active' },
  { value: 'pending_key', label: 'API Key Needed' },
  { value: 'partnership', label: 'Pending Partnership' },
  { value: 'pending',     label: 'Pending Setup' },
]

function AddFeedModal({ onClose, onSaved, defaultScope = 'international', defaultCountry = '' }) {
  const [form, setForm] = useState({
    name: '', category: 'security', feedType: 'REST API', scope: defaultScope,
    countries: defaultCountry, url: '', description: '', geography: defaultCountry,
    updateFrequency: '', status: 'pending', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const f = (key) => ({ value: form[key], onChange: e => setForm(p => ({ ...p, [key]: e.target.value })) })

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Feed name is required'); return }
    if (form.scope === 'local' && !form.countries.trim()) { setError('Please specify at least one country for a local feed'); return }
    setSaving(true)
    const countriesArr = form.scope === 'local'
      ? form.countries.split(',').map(c => c.trim()).filter(Boolean)
      : []
    const { error: err } = await supabase.from('intel_feed_sources').insert({
      name: form.name.trim(),
      category: form.category,
      feed_type: form.feedType,
      scope: form.scope,
      countries: countriesArr,
      url: form.url.trim() || null,
      description: form.description.trim() || null,
      geography: form.geography.trim() || null,
      update_frequency: form.updateFrequency.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  const inputClass = "w-full border border-gray-200 rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B] text-gray-900"
  const labelClass = "block text-xs font-medium text-gray-600 mb-1"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-[12px] shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Add Intel Feed</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelClass}>Feed Name *</label>
            <input className={inputClass} placeholder="e.g. OSAC Security Reports" {...f('name')} />
          </div>

          {/* Scope toggle — prominent */}
          <div>
            <label className={labelClass}>Scope</label>
            <div className="grid grid-cols-2 gap-2">
              {SCOPE_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm(p => ({ ...p, scope: opt.value }))}
                  className={`px-3 py-2.5 rounded-[6px] text-xs font-medium border text-left transition-colors
                    ${form.scope === opt.value
                      ? 'bg-[#0118A1] text-white border-[#0118A1]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                  {opt.value === 'international' ? '🌍' : '📍'} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Country field — only shown for local */}
          {form.scope === 'local' && (
            <div>
              <label className={labelClass}>Country / Countries *</label>
              <input className={inputClass} placeholder="e.g. Mozambique  (comma-separate multiple)" {...f('countries')} />
              <p className="text-[10px] text-gray-400 mt-1">This feed will appear in the Local section for each specified country.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Category</label>
              <select className={inputClass} {...f('category')}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Feed Type</label>
              <select className={inputClass} {...f('feedType')}>
                {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>URL / Endpoint</label>
            <input className={inputClass} placeholder="https://api.example.com/feed" {...f('url')} />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea className={inputClass} rows={2} placeholder="What does this feed provide?" {...f('description')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Geography</label>
              <input className={inputClass} placeholder="e.g. South Africa" {...f('geography')} />
            </div>
            <div>
              <label className={labelClass}>Update Frequency</label>
              <input className={inputClass} placeholder="e.g. Daily" {...f('updateFrequency')} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Status</label>
            <select className={inputClass} {...f('status')}>
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea className={inputClass} rows={2} placeholder="Partnership contact, pricing, API key location…" {...f('notes')} />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="bg-[#AACC00] hover:bg-[#99bb00] text-[#0118A1] font-semibold px-5 py-2 rounded-[6px] text-sm transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : 'Add Feed'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Section component ─────────────────────────────────────────────────────────
function FeedSection({ title, icon: Icon, feeds, onDelete, emptyMsg, accent }) {
  if (!feeds.length) return (
    <div className="text-xs text-gray-400 italic py-4 pl-1">{emptyMsg}</div>
  )
  // Group by category within section
  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    feeds: feeds.filter(f => f.category === cat.id),
  })).filter(g => g.feeds.length > 0)

  return (
    <div className="space-y-6">
      {grouped.map(group => {
        const GIcon = group.icon
        return (
          <div key={group.id}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center ${group.bg} border ${group.border}`}>
                <GIcon size={12} className={group.text} />
              </div>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{group.label}</span>
              <span className="text-xs text-gray-300">{group.feeds.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.feeds.map(feed => <FeedCard key={feed.id} feed={feed} onDelete={onDelete} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function IntelFeeds() {
  const [customFeeds, setCustomFeeds] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalDefaults, setModalDefaults] = useState({})
  const [activeTab, setActiveTab] = useState('international')
  const [localCountry, setLocalCountry] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  const loadCustom = async () => {
    setLoading(true)
    const { data } = await supabase.from('intel_feed_sources').select('*').order('created_at', { ascending: false })
    setCustomFeeds((data || []).map(d => ({
      id: d.id, name: d.name, category: d.category, feedType: d.feed_type,
      scope: d.scope || 'international', countries: d.countries || [],
      url: d.url, sourceUrl: d.url, description: d.description,
      geography: d.geography, updateFrequency: d.update_frequency,
      status: d.status, notes: d.notes, builtin: false,
    })))
    setLastRefresh(new Date())
    setLoading(false)
  }

  useEffect(() => { loadCustom() }, [])

  const handleDelete = async (id) => {
    await supabase.from('intel_feed_sources').delete().eq('id', id)
    loadCustom()
  }

  const openModal = (defaults = {}) => { setModalDefaults(defaults); setShowModal(true) }

  const allFeeds = [...BUILTIN_FEEDS, ...customFeeds]
  const intlFeeds = allFeeds.filter(f => f.scope === 'international')
  const localFeeds = allFeeds.filter(f => f.scope === 'local')

  // All countries that have at least one local feed
  const localCountries = [...new Set(localFeeds.flatMap(f => f.countries || []))].sort()
  // Default to first country if none selected
  const selectedCountry = localCountry || localCountries[0] || null
  const countryFeeds = selectedCountry ? localFeeds.filter(f => (f.countries || []).includes(selectedCountry)) : []

  const liveCount = allFeeds.filter(f => f.status === 'active').length

  return (
    <Layout>
      {showModal && (
        <AddFeedModal
          onClose={() => setShowModal(false)}
          onSaved={loadCustom}
          defaultScope={modalDefaults.scope || 'international'}
          defaultCountry={modalDefaults.country || ''}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Radio size={20} className="text-[#1E2461]" />
            <h1 className="text-2xl font-bold text-gray-900">Intel Feeds</h1>
          </div>
          <p className="text-sm text-gray-500">All intelligence sources — manage, categorise and add new data channels</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadCustom} disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-40 px-3 py-2">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => openModal({ scope: activeTab === 'local' ? 'local' : 'international', country: selectedCountry || '' })}
            className="flex items-center gap-2 bg-[#AACC00] hover:bg-[#99bb00] text-[#0118A1] font-semibold px-4 py-2 rounded-[6px] text-sm transition-colors">
            <Plus size={15} />
            Add Feed
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Feeds', value: allFeeds.length },
          { label: 'Live & Active', value: liveCount, color: 'text-green-600' },
          { label: 'Pending Setup', value: allFeeds.filter(f => f.status !== 'active').length, color: 'text-amber-600' },
          { label: 'Custom Added', value: customFeeds.length, color: 'text-[#0118A1]' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4 text-center">
            <div className={`text-3xl font-bold ${s.color || 'text-gray-900'}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* International / Local tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-[8px] p-1 w-fit">
        <button onClick={() => setActiveTab('international')}
          className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-sm font-medium transition-colors
            ${activeTab === 'international' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          <Globe size={14} />
          International
          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5">{intlFeeds.length}</span>
        </button>
        <button onClick={() => setActiveTab('local')}
          className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-sm font-medium transition-colors
            ${activeTab === 'local' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          <MapPin size={14} />
          Local
          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5">{localFeeds.length}</span>
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 text-center py-16">Loading feeds…</div>
      ) : activeTab === 'international' ? (
        /* ── International tab ── */
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-500">Feeds available to all offices and regions</p>
            <button onClick={() => openModal({ scope: 'international' })}
              className="text-xs text-[#0118A1] hover:underline flex items-center gap-1">
              <Plus size={11} /> Add international feed
            </button>
          </div>
          <FeedSection feeds={intlFeeds} onDelete={handleDelete} emptyMsg="No international feeds configured." />
        </div>
      ) : (
        /* ── Local tab ── */
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-500">Country-specific feeds — each office sees only their relevant local sources</p>
            <button onClick={() => openModal({ scope: 'local', country: selectedCountry || '' })}
              className="text-xs text-[#0118A1] hover:underline flex items-center gap-1">
              <Plus size={11} /> Add local feed
            </button>
          </div>

          {localCountries.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MapPin size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium text-gray-500 mb-1">No local feeds yet</p>
              <p className="text-xs mb-4">Add country-specific feeds for each office location</p>
              <button onClick={() => openModal({ scope: 'local' })}
                className="inline-flex items-center gap-2 bg-[#AACC00] text-[#0118A1] font-semibold px-4 py-2 rounded-[6px] text-sm">
                <Plus size={14} /> Add local feed
              </button>
            </div>
          ) : (
            <>
              {/* Country tabs */}
              <div className="flex gap-2 flex-wrap mb-6">
                {localCountries.map(country => (
                  <button key={country}
                    onClick={() => setLocalCountry(country)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                      ${selectedCountry === country
                        ? 'bg-[#0118A1] text-white border-[#0118A1]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                    <MapPin size={10} />
                    {country}
                    <span className={`text-[10px] rounded-full px-1 ${selectedCountry === country ? 'bg-white/20' : 'bg-gray-100'}`}>
                      {localFeeds.filter(f => (f.countries || []).includes(country)).length}
                    </span>
                  </button>
                ))}
                <button onClick={() => openModal({ scope: 'local' })}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors">
                  <Plus size={10} /> Add country
                </button>
              </div>

              {/* Feeds for selected country */}
              {selectedCountry && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin size={14} className="text-[#1E2461]" />
                    <h3 className="text-sm font-bold text-gray-800">{selectedCountry}</h3>
                    <span className="text-xs text-gray-400">{countryFeeds.length} feed{countryFeeds.length !== 1 ? 's' : ''}</span>
                  </div>
                  <FeedSection feeds={countryFeeds} onDelete={handleDelete} emptyMsg={`No local feeds for ${selectedCountry} yet.`} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {lastRefresh && (
        <div className="mt-8 flex items-center gap-1.5 text-xs text-gray-400">
          <Clock size={11} />
          Last refreshed: {lastRefresh.toLocaleTimeString()}
        </div>
      )}
    </Layout>
  )
}
