/**
 * /admin — Platform Admin Control Center
 * Tabs: Overview · Travellers · Organisations · Feeds · Policies · Training
 */
import { useEffect, useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  LayoutGrid, Users, Building2, Radio, FileText, GraduationCap,
  Plane, CheckCircle2, AlertTriangle, Search, RefreshCw,
  ExternalLink, Activity, Wifi, WifiOff, Shield, Key, Handshake,
  Swords, HeartPulse, CloudRain, ChevronRight, ArrowUpRight,
  UserCheck, UserX, Plus, X, Loader2, Pencil, Trash2,
  Globe, BookOpen, Newspaper, Link2, Link2Off, Mail,
  ClipboardList, ChevronDown, ChevronUp, Download,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const TABS = [
  { id: 'overview',    label: 'Overview',       icon: LayoutGrid },
  { id: 'travellers',  label: 'Travellers',      icon: Users },
  { id: 'orgs',        label: 'Organisations',   icon: Building2 },
  { id: 'feeds',       label: 'Intel Feeds',     icon: Radio },
  { id: 'policies',    label: 'Policies',        icon: FileText },
  { id: 'training',    label: 'Training',        icon: GraduationCap },
  { id: 'audit',       label: 'Audit Log',       icon: ClipboardList },
]

const inputCls = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1]'
const labelCls = 'block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ── Small shared components ───────────────────────────────────────────────────
function Pill({ label, color = 'gray' }) {
  const map = {
    green:  'bg-green-100 text-green-700 border-green-200',
    red:    'bg-red-100 text-red-700 border-red-200',
    amber:  'bg-amber-100 text-amber-700 border-amber-200',
    blue:   'bg-blue-100 text-blue-700 border-blue-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    gray:   'bg-gray-100 text-gray-600 border-gray-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${map[color]}`}>
      {label}
    </span>
  )
}

function Avatar({ name }) {
  const colors = [BRAND_BLUE, '#7C3AED', '#059669', '#DC2626', '#D97706', '#0891B2']
  const i = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ background: colors[i] }}>
      {initials(name)}
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, sub, color = BRAND_BLUE, link }) {
  const inner = (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4 hover:shadow-md transition-shadow">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}18` }}>
        <Icon size={20} color={color} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 leading-none">{value ?? '—'}</p>
        <p className="text-sm font-medium text-gray-600 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {link && <ArrowUpRight size={14} className="text-gray-300 ml-auto shrink-0 mt-1" />}
    </div>
  )
  return link ? <Link to={link}>{inner}</Link> : inner
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}

function SaveBtn({ saving, label = 'Save', onClick }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all"
      style={{ background: BRAND_BLUE }}>
      {saving && <Loader2 size={14} className="animate-spin" />}
      {saving ? 'Saving…' : label}
    </button>
  )
}

// ── BUILTIN feeds (status only) ───────────────────────────────────────────────
const BUILTIN_FEEDS = [
  { id: 'flightaware',       name: 'FlightAware AeroAPI',      category: 'flight',       status: 'active' },
  { id: 'aisstream',         name: 'AISStream',                category: 'vessel',       status: 'pending_key' },
  { id: 'acled',             name: 'ACLED',                    category: 'conflict',     status: 'pending_key' },
  { id: 'ucdp',              name: 'UCDP',                     category: 'conflict',     status: 'active' },
  { id: 'state-dept',        name: 'US State Dept Advisories', category: 'country-risk', status: 'active' },
  { id: 'fcdo',              name: 'UK FCDO Advisories',       category: 'country-risk', status: 'active' },
  { id: 'ocha-hapi',         name: 'UN OCHA HAPI',             category: 'security',     status: 'pending_key' },
  { id: 'who-outbreak',      name: 'WHO Disease Outbreak',     category: 'health',       status: 'active' },
  { id: 'cdc-travel-health', name: 'CDC Travel Health',        category: 'health',       status: 'active' },
  { id: 'promed',            name: 'ProMED Mail',              category: 'health',       status: 'active' },
  { id: 'gdacs',             name: 'GDACS (UN Disasters)',     category: 'weather',      status: 'active' },
  { id: 'usgs',              name: 'USGS Earthquakes',         category: 'weather',      status: 'active' },
  { id: 'openweathermap',    name: 'OpenWeatherMap',           category: 'weather',      status: 'pending_key' },
  { id: 'eonet',             name: 'NASA EONET',               category: 'weather',      status: 'active' },
  { id: 'open-meteo',        name: 'Open-Meteo',              category: 'weather',      status: 'active' },
  { id: 'osac',              name: 'OSAC',                     category: 'security',     status: 'pending' },
  { id: 'control-risks',     name: 'Control Risks',            category: 'security',     status: 'partnership' },
  { id: 'crisis24',          name: 'Crisis24 (Garda World)',   category: 'security',     status: 'partnership' },
]

const FEED_STATUS = {
  active:      { label: 'Live',         color: 'green',  dot: '#22C55E' },
  pending_key: { label: 'Needs API Key',color: 'amber',  dot: '#F59E0B' },
  pending:     { label: 'Pending',      color: 'gray',   dot: '#9CA3AF' },
  partnership: { label: 'Partnership',  color: 'purple', dot: '#7C3AED' },
}

const FEED_CATEGORIES = ['flight','vessel','conflict','country-risk','security','health','community','weather']
const POLICY_CATEGORIES = ['Travel','Compliance','Security','Health & Safety']
const TRAINING_CATEGORIES = ['ISO 31030','Security Awareness','Health & Safety','Emergency Response','General']
const INDUSTRIES = ['Mining & Resources','Oil & Gas','Construction','NGO / Humanitarian','Government & Defence',
  'Financial Services','Technology','Healthcare','Logistics & Transport','Media & Entertainment','Education','Other']

// ── ORG MODAL ────────────────────────────────────────────────────────────────
function OrgModal({ org, onClose, onSaved }) {
  const blank = { name:'', industry:'', country:'', address:'', website:'',
    emergency_number:'', primary_contact:'', contact_email:'', contact_phone:'',
    security_contact:'', security_email:'', security_phone:'',
    subscription_plan:'team', max_travellers:15 }
  const [form, setForm] = useState(org ? {
    name: org.name||'', industry: org.industry||'', country: org.country||'',
    address: org.address||'', website: org.website||'', emergency_number: org.emergency_number||'',
    primary_contact: org.primary_contact||'', contact_email: org.contact_email||'',
    contact_phone: org.contact_phone||'', security_contact: org.security_contact||'',
    security_email: org.security_email||'', security_phone: org.security_phone||'',
    subscription_plan: org.subscription_plan||'team', max_travellers: org.max_travellers||15,
  } : blank)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const f = k => ({ value: form[k]||'', onChange: e => setForm(p=>({...p,[k]:e.target.value})) })

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      if (org) {
        const { error: e } = await supabase.from('organisations').update(form).eq('id', org.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('organisations').insert({ ...form, is_active: true })
        if (e) throw e
      }
      onSaved()
    } catch(e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={org ? 'Edit Organisation' : 'Add Organisation'} onClose={onClose} wide>
      {error && <p className="mb-3 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Organisation Name *</label>
            <input className={inputCls} placeholder="Acme Corporation" {...f('name')} />
          </div>
          <div>
            <label className={labelCls}>Industry</label>
            <select className={inputCls} {...f('industry')}>
              <option value="">Select…</option>
              {INDUSTRIES.map(i=><option key={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Country</label>
            <input className={inputCls} placeholder="South Africa" {...f('country')} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Physical Address</label>
            <input className={inputCls} placeholder="123 Main St, Johannesburg" {...f('address')} />
          </div>
          <div>
            <label className={labelCls}>Website</label>
            <input className={inputCls} placeholder="https://acme.com" {...f('website')} />
          </div>
          <div>
            <label className={labelCls}>24/7 Emergency Number</label>
            <input className={inputCls} placeholder="+27 10 000 0000" {...f('emergency_number')} />
          </div>
          <div>
            <label className={labelCls}>Subscription Plan</label>
            <select className={inputCls} {...f('subscription_plan')}>
              <option value="solo">SOLO — $18/mo (1 seat)</option>
              <option value="team">TEAM — $210/mo (15 seats)</option>
              <option value="operations">OPERATIONS — $580/mo (40 seats)</option>
              <option value="enterprise">ENTERPRISE — Custom</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Max Travellers</label>
            <input type="number" className={inputCls} min={1} {...f('max_travellers')} />
          </div>
        </div>

        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide pt-2 border-t border-gray-100">Primary Contact</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} placeholder="Jane Smith" {...f('primary_contact')} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} type="email" placeholder="jane@acme.com" {...f('contact_email')} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} placeholder="+27 82 000 0000" {...f('contact_phone')} />
          </div>
        </div>

        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide pt-2 border-t border-gray-100">Security Contact</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} placeholder="John Security" {...f('security_contact')} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} type="email" placeholder="security@acme.com" {...f('security_email')} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} placeholder="+27 82 000 0000" {...f('security_phone')} />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <SaveBtn saving={saving} label={org ? 'Save Changes' : 'Create Organisation'} onClick={save} />
        </div>
      </div>
    </Modal>
  )
}

// ── INVITE MODAL ──────────────────────────────────────────────────────────────
function InviteModal({ orgs, onClose, onSaved }) {
  const [form, setForm] = useState({ email:'', role:'traveller', org_id:'' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [sent, setSent]     = useState(false)
  const f = k => ({ value: form[k]||'', onChange: e => setForm(p=>({...p,[k]:e.target.value})) })

  const send = async () => {
    if (!form.email.trim()) { setError('Email is required'); return }
    setSaving(true); setError('')
    try {
      const org = orgs.find(o => o.id === form.org_id)
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), role: form.role, org_id: form.org_id||null, org_name: org?.name||'' }),
      })
      if (!res.ok) throw new Error('Failed to send invite')
      setSent(true)
      setTimeout(() => { onSaved(); onClose() }, 1500)
    } catch(e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title="Invite Traveller" onClose={onClose}>
      {sent ? (
        <div className="text-center py-6">
          <CheckCircle2 size={40} className="mx-auto mb-3" style={{ color: BRAND_GREEN }} />
          <p className="font-semibold text-gray-800">Invite sent!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          <div>
            <label className={labelCls}>Email Address *</label>
            <input className={inputCls} type="email" placeholder="traveller@company.com" {...f('email')} />
          </div>
          <div>
            <label className={labelCls}>Role</label>
            <select className={inputCls} {...f('role')}>
              <option value="traveller">Traveller</option>
              <option value="org_admin">Company Admin</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Link to Organisation</label>
            <select className={inputCls} {...f('org_id')}>
              <option value="">No organisation</option>
              {orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end pt-2">
            <SaveBtn saving={saving} label="Send Invite" onClick={send} />
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── LINK ORG MODAL ────────────────────────────────────────────────────────────
function LinkOrgModal({ profile, orgs, onClose, onSaved }) {
  const [orgId, setOrgId] = useState(profile.org_id || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    await supabase.from('profiles').update({ org_id: orgId || null }).eq('id', profile.id)
    setSaving(false); onSaved()
  }

  return (
    <Modal title={`Link Organisation — ${profile.full_name || profile.email}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Organisation</label>
          <select className={inputCls} value={orgId} onChange={e => setOrgId(e.target.value)}>
            <option value="">No organisation (unlink)</option>
            {orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="flex justify-end pt-2">
          <SaveBtn saving={saving} label="Save Link" onClick={save} />
        </div>
      </div>
    </Modal>
  )
}

// ── CHANGE ROLE MODAL ─────────────────────────────────────────────────────────
function ChangeRoleModal({ profile, onClose, onSaved }) {
  const [role, setRole] = useState(profile.role || 'traveller')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    await supabase.from('profiles').update({ role }).eq('id', profile.id)
    setSaving(false); onSaved()
  }

  return (
    <Modal title={`Change Role — ${profile.full_name || profile.email}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Role</label>
          <select className={inputCls} value={role} onChange={e => setRole(e.target.value)}>
            <option value="traveller">Traveller</option>
            <option value="org_admin">Company Admin</option>
            <option value="solo">Solo Traveller</option>
            <option value="admin">Platform Admin</option>
          </select>
        </div>
        <div className="flex justify-end pt-2">
          <SaveBtn saving={saving} label="Save Role" onClick={save} />
        </div>
      </div>
    </Modal>
  )
}

// ── CUSTOM FEED MODAL ─────────────────────────────────────────────────────────
function FeedModal({ feed, onClose, onSaved }) {
  const blank = { name:'', category:'security', feedType:'REST API', sourceUrl:'', description:'', scope:'international' }
  const [form, setForm] = useState(feed ? {
    name: feed.name||'', category: feed.category||'security', feedType: feed.feedType||'REST API',
    sourceUrl: feed.sourceUrl||'', description: feed.description||'', scope: feed.scope||'international',
  } : blank)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const f = k => ({ value: form[k]||'', onChange: e => setForm(p=>({...p,[k]:e.target.value})) })

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      if (feed) {
        const { error: e } = await supabase.from('intel_feed_sources').update(form).eq('id', feed.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('intel_feed_sources').insert({ ...form, status: 'active' })
        if (e) throw e
      }
      onSaved()
    } catch(e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={feed ? 'Edit Custom Feed' : 'Add Custom Intel Feed'} onClose={onClose}>
      {error && <p className="mb-3 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Feed Name *</label>
          <input className={inputCls} placeholder="My Custom Feed" {...f('name')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Category</label>
            <select className={inputCls} {...f('category')}>
              {FEED_CATEGORIES.map(c=><option key={c} value={c}>{c.replace('-',' ').replace(/\b\w/g,x=>x.toUpperCase())}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Feed Type</label>
            <select className={inputCls} {...f('feedType')}>
              {['REST API','RSS Feed','Webhook','WebSocket','Partnership'].map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Source URL</label>
          <input className={inputCls} type="url" placeholder="https://api.example.com" {...f('sourceUrl')} />
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea className={`${inputCls} resize-none`} rows={3} placeholder="What does this feed provide?"
            value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} />
        </div>
        <div className="flex justify-end pt-2">
          <SaveBtn saving={saving} label={feed ? 'Save Changes' : 'Add Feed'} onClick={save} />
        </div>
      </div>
    </Modal>
  )
}

// ── POLICY MODAL ──────────────────────────────────────────────────────────────
function PolicyModal({ policy, orgs, onClose, onSaved }) {
  const blank = { name:'', category:'Travel', description:'', version:'1.0', status:'Active', file_url:'', org_id:'' }
  const [form, setForm] = useState(policy ? {
    name: policy.name||'', category: policy.category||'Travel',
    description: policy.description||'', version: policy.version||'1.0',
    status: policy.status||'Active', file_url: policy.file_url||'', org_id: policy.org_id||'',
  } : blank)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const f = k => ({ value: form[k]||'', onChange: e => setForm(p=>({...p,[k]:e.target.value})) })

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, org_id: form.org_id||null, last_updated: new Date().toISOString().slice(0,10) }
      if (policy) {
        const { error: e } = await supabase.from('policies').update(payload).eq('id', policy.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('policies').insert(payload)
        if (e) throw e
      }
      onSaved()
    } catch(e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={policy ? 'Edit Policy' : 'Add Policy'} onClose={onClose}>
      {error && <p className="mb-3 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Policy Name *</label>
          <input className={inputCls} placeholder="Travel Risk Management Policy" {...f('name')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Category</label>
            <select className={inputCls} {...f('category')}>
              {POLICY_CATEGORIES.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} {...f('status')}>
              <option>Active</option>
              <option>Under Review</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea className={`${inputCls} resize-none`} rows={3} placeholder="What this policy covers…"
            value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Version</label>
            <input className={inputCls} placeholder="1.0" {...f('version')} />
          </div>
          <div>
            <label className={labelCls}>Assign to Organisation</label>
            <select className={inputCls} {...f('org_id')}>
              <option value="">All organisations (global)</option>
              {orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Document URL (optional)</label>
          <input className={inputCls} type="url" placeholder="https://docs.acme.com/policy.pdf" {...f('file_url')} />
        </div>
        <div className="flex justify-end pt-2">
          <SaveBtn saving={saving} label={policy ? 'Save Changes' : 'Add Policy'} onClick={save} />
        </div>
      </div>
    </Modal>
  )
}

// ── TRAINING MODAL ────────────────────────────────────────────────────────────
function TrainingModal({ module, orgs, onClose, onSaved }) {
  const blank = { title:'', description:'', duration_mins:30, topics:'', category:'ISO 31030', org_id:'', required:false }
  const [form, setForm] = useState(module ? {
    title: module.title||'', description: module.description||'',
    duration_mins: module.duration_mins||30, topics: module.topics||'',
    category: module.category||'ISO 31030', org_id: module.org_id||'', required: module.required||false,
  } : blank)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const f = k => ({ value: form[k]||'', onChange: e => setForm(p=>({...p,[k]:e.target.value})) })

  const save = async () => {
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = { ...form, org_id: form.org_id||null, created_by: user?.id, is_active: true }
      if (module) {
        const { error: e } = await supabase.from('training_modules').update(payload).eq('id', module.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('training_modules').insert(payload)
        if (e) throw e
      }
      onSaved()
    } catch(e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={module ? 'Edit Training Module' : 'Add Training Module'} onClose={onClose}>
      {error && <p className="mb-3 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Module Title *</label>
          <input className={inputCls} placeholder="Emergency Response Procedures" {...f('title')} />
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea className={`${inputCls} resize-none`} rows={3} placeholder="What will learners achieve?"
            value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} />
        </div>
        <div>
          <label className={labelCls}>Topics (comma-separated)</label>
          <input className={inputCls} placeholder="Evacuation procedures, Emergency contacts, Crisis communication" {...f('topics')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Category</label>
            <select className={inputCls} {...f('category')}>
              {TRAINING_CATEGORIES.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Duration (minutes)</label>
            <input type="number" className={inputCls} min={5} {...f('duration_mins')} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Assign to Organisation</label>
          <select className={inputCls} {...f('org_id')}>
            <option value="">All organisations (platform-wide)</option>
            {orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="req" checked={form.required}
            onChange={e=>setForm(p=>({...p,required:e.target.checked}))}
            className="w-4 h-4 accent-[#0118A1]" />
          <label htmlFor="req" className="text-sm text-gray-700 font-medium cursor-pointer">
            Mark as mandatory for assigned users
          </label>
        </div>
        <div className="flex justify-end pt-2">
          <SaveBtn saving={saving} label={module ? 'Save Changes' : 'Add Module'} onClick={save} />
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminControlCenter() {
  const [tab, setTab]           = useState('overview')
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [profiles, setProfiles] = useState([])
  const [orgs, setOrgs]         = useState([])
  const [trips, setTrips]       = useState([])
  const [customFeeds, setCustomFeeds] = useState([])
  const [policies, setPolicies] = useState([])
  const [modules, setModules]   = useState([])
  const [auditLogs, setAuditLogs]   = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditSearch, setAuditSearch]   = useState('')
  const [auditAction, setAuditAction]   = useState('all')
  const [auditExpanded, setAuditExpanded] = useState({})

  const [search, setSearch]     = useState('')
  const [orgFilter, setOrgFilter]   = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [feedCatFilter, setFeedCatFilter] = useState('all')

  // Modal state
  const [showOrgModal, setShowOrgModal]       = useState(false)
  const [editOrg, setEditOrg]                 = useState(null)
  const [showInvite, setShowInvite]           = useState(false)
  const [linkProfile, setLinkProfile]         = useState(null)
  const [roleProfile, setRoleProfile]         = useState(null)
  const [showFeedModal, setShowFeedModal]     = useState(false)
  const [editFeed, setEditFeed]               = useState(null)
  const [showPolicyModal, setShowPolicyModal] = useState(false)
  const [editPolicy, setEditPolicy]           = useState(null)
  const [showTrainingModal, setShowTrainingModal] = useState(false)
  const [editModule, setEditModule]           = useState(null)

  const load = async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true)
    const today = new Date().toISOString().slice(0,10)
    const [p, o, t, f, pol, mod] = await Promise.all([
      supabase.from('profiles').select('id,full_name,email,role,org_id,onboarding_completed_at,created_at').order('created_at',{ascending:false}),
      supabase.from('organisations').select('*').order('created_at',{ascending:false}),
      supabase.from('itineraries').select('id,user_id').lte('departure_date',today).gte('return_date',today),
      supabase.from('intel_feed_sources').select('*').order('created_at',{ascending:false}),
      supabase.from('policies').select('*').order('name'),
      supabase.from('training_modules').select('*').order('created_at',{ascending:false}),
    ])
    setProfiles(p.data||[])
    setOrgs(o.data||[])
    setTrips(t.data||[])
    setCustomFeeds(f.data||[])
    setPolicies(pol.data||[])
    setModules(mod.data||[])
    setLoading(false); setRefreshing(false)
  }

  const loadAuditLogs = async () => {
    setAuditLoading(true)
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    setAuditLogs(data || [])
    setAuditLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'audit') loadAuditLogs() }, [tab])

  const refresh = () => load(true)

  const orgMap = useMemo(() => {
    const m = {}; orgs.forEach(o=>{ m[o.id]=o }); return m
  }, [orgs])

  const orgTravellerCount = useMemo(() => {
    const m = {}; profiles.forEach(p=>{ if(p.org_id) m[p.org_id]=(m[p.org_id]||0)+1 }); return m
  }, [profiles])

  const travellingIds = useMemo(() => new Set(trips.map(t=>t.user_id)), [trips])

  const travellers = useMemo(() => profiles.filter(p=>['traveller','solo'].includes(p.role)), [profiles])
  const onboarded  = useMemo(() => travellers.filter(p=>p.onboarding_completed_at), [travellers])
  const liveFeeds  = BUILTIN_FEEDS.filter(f=>f.status==='active').length
  const needsKey   = BUILTIN_FEEDS.filter(f=>f.status==='pending_key').length

  const filteredProfiles = useMemo(() => profiles.filter(p => {
    if (roleFilter !== 'all' && p.role !== roleFilter) return false
    if (orgFilter !== 'all' && (orgFilter === '' ? p.org_id !== null : p.org_id !== orgFilter)) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(p.full_name||'').toLowerCase().includes(q) && !(p.email||'').toLowerCase().includes(q)) return false
    }
    return true
  }), [profiles, search, orgFilter, roleFilter])

  const deleteModule = async (id) => {
    if (!confirm('Delete this training module?')) return
    await supabase.from('training_modules').delete().eq('id', id)
    refresh()
  }
  const deletePolicy = async (id) => {
    if (!confirm('Delete this policy?')) return
    await supabase.from('policies').delete().eq('id', id)
    refresh()
  }
  const deleteFeed = async (id) => {
    if (!confirm('Delete this custom feed?')) return
    await supabase.from('intel_feed_sources').delete().eq('id', id)
    refresh()
  }

  const handleOrgApproval = async (org, status) => {
    const verb = status === 'approved' ? 'approve' : 'reject'
    if (!confirm(`Are you sure you want to ${verb} "${org.name}"?`)) return
    await supabase.from('organisations').update({ approval_status: status }).eq('id', org.id)
    fetch('/api/notify-org-approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: org.id, org_name: org.name, status }),
    }).catch(() => {})
    logAudit({
      action:      `org.${status}`,
      entity_type: 'org',
      entity_id:   org.id,
      description: `Organisation "${org.name}" ${status}`,
      metadata:    { org_name: org.name, previous_status: org.approval_status },
    })
    refresh()
  }

  const handleDeleteOrg = async (org) => {
    if (!confirm(`Permanently delete "${org.name}"? This cannot be undone.`)) return
    await supabase.from('organisations').delete().eq('id', org.id)
    logAudit({
      action:      'org.deleted',
      entity_type: 'org',
      entity_id:   org.id,
      description: `Organisation "${org.name}" permanently deleted`,
      metadata:    { org_name: org.name },
    })
    refresh()
  }

  const handleDeleteProfile = async (profile) => {
    if (!confirm(`Permanently delete "${profile.full_name || profile.email}"? This removes their account and cannot be undone.`)) return
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/delete-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ user_id: profile.id }),
    })
    refresh()
  }

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#0118A1] border-t-transparent rounded-full animate-spin" />
      </div>
    </Layout>
  )

  return (
    <Layout>
      {/* Modals */}
      {(showOrgModal || editOrg) && (
        <OrgModal org={editOrg} orgs={orgs} onClose={()=>{setShowOrgModal(false);setEditOrg(null)}}
          onSaved={()=>{setShowOrgModal(false);setEditOrg(null);refresh()}} />
      )}
      {showInvite && (
        <InviteModal orgs={orgs} onClose={()=>setShowInvite(false)} onSaved={refresh} />
      )}
      {linkProfile && (
        <LinkOrgModal profile={linkProfile} orgs={orgs} onClose={()=>setLinkProfile(null)}
          onSaved={()=>{setLinkProfile(null);refresh()}} />
      )}
      {roleProfile && (
        <ChangeRoleModal profile={roleProfile} onClose={()=>setRoleProfile(null)}
          onSaved={()=>{setRoleProfile(null);refresh()}} />
      )}
      {(showFeedModal || editFeed) && (
        <FeedModal feed={editFeed} onClose={()=>{setShowFeedModal(false);setEditFeed(null)}}
          onSaved={()=>{setShowFeedModal(false);setEditFeed(null);refresh()}} />
      )}
      {(showPolicyModal || editPolicy) && (
        <PolicyModal policy={editPolicy} orgs={orgs} onClose={()=>{setShowPolicyModal(false);setEditPolicy(null)}}
          onSaved={()=>{setShowPolicyModal(false);setEditPolicy(null);refresh()}} />
      )}
      {(showTrainingModal || editModule) && (
        <TrainingModal module={editModule} orgs={orgs} onClose={()=>{setShowTrainingModal(false);setEditModule(null)}}
          onSaved={()=>{setShowTrainingModal(false);setEditModule(null);refresh()}} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Control Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage users, organisations, feeds, policies and training</p>
        </div>
        <button onClick={refresh} disabled={refreshing}
          className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-xl bg-white transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={refreshing?'animate-spin':''} /> Refresh
        </button>
      </div>

      {/* Tabs — scrollable on mobile */}
      <div className="flex gap-1 mb-6 overflow-x-auto scrollbar-none border-b border-gray-200 pb-0">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-all shrink-0 relative"
              style={{
                color: active ? BRAND_BLUE : '#6B7280',
                borderBottom: active ? `3px solid ${BRAND_GREEN}` : '3px solid transparent',
                background: active ? `${BRAND_BLUE}08` : 'transparent',
                borderRadius: '8px 8px 0 0',
              }}>
              <Icon size={15} style={{ color: active ? BRAND_BLUE : '#9CA3AF' }}/>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
      {tab==='overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={Building2}   label="Organisations"        value={orgs.length}              color={BRAND_BLUE} />
            <KpiCard icon={Users}       label="Total Users"          value={profiles.length}           color="#7C3AED" />
            <KpiCard icon={Plane}       label="Currently Travelling" value={travellingIds.size}        color="#059669" />
            <KpiCard icon={Activity}    label="Live Intel Feeds"     value={liveFeeds + customFeeds.filter(f=>f.status==='active').length} color={BRAND_GREEN} />
            <KpiCard icon={UserCheck}   label="Onboarding Complete"  value={onboarded.length} sub={`of ${travellers.length} travellers`} color="#0891B2" />
            <KpiCard icon={UserX}       label="Not Yet Onboarded"    value={travellers.length-onboarded.length} color="#DC2626" />
            <KpiCard icon={FileText}    label="Policies"             value={policies.length}           color="#D97706" />
            <KpiCard icon={GraduationCap} label="Training Modules"  value={modules.length}            color="#7C3AED" />
          </div>

          {/* Recent sign-ups */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">Recent Sign-ups</h2>
              <button onClick={()=>setTab('travellers')} className="text-xs text-[#0118A1] font-medium hover:underline flex items-center gap-1">
                View all <ChevronRight size={12}/>
              </button>
            </div>
            {profiles.slice(0,6).map(p => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0">
                <Avatar name={p.full_name} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.full_name||'—'}</p>
                  <p className="text-xs text-gray-400 truncate">{p.email}</p>
                </div>
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  {orgMap[p.org_id] && <span className="text-xs text-gray-500">{orgMap[p.org_id].name}</span>}
                  {travellingIds.has(p.id) && <Pill label="Travelling" color="green"/>}
                </div>
                <span className="text-xs text-gray-300 hidden lg:block">{fmtDate(p.created_at)}</span>
              </div>
            ))}
            {profiles.length===0 && <p className="text-sm text-gray-400 text-center py-8">No users yet.</p>}
          </div>
        </div>
      )}

      {/* ── TRAVELLERS ───────────────────────────────────────────────────────── */}
      {tab==='travellers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input className={`${inputCls} pl-9`} placeholder="Search name or email…" value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            <select className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0118A1]"
              value={orgFilter} onChange={e=>setOrgFilter(e.target.value)}>
              <option value="all">All organisations</option>
              {orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
              <option value="">No organisation</option>
            </select>
            <select className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0118A1]"
              value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
              <option value="all">All roles</option>
              <option value="traveller">Traveller</option>
              <option value="org_admin">Org Admin</option>
              <option value="solo">Solo</option>
              <option value="admin">Platform Admin</option>
            </select>
            <button onClick={()=>setShowInvite(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shrink-0"
              style={{background:BRAND_BLUE}}>
              <Mail size={14}/> Invite
            </button>
          </div>

          <p className="text-xs text-gray-400">{filteredProfiles.length} result{filteredProfiles.length!==1?'s':''}</p>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">User</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Organisation</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Onboarding</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredProfiles.map(p => {
                    const org = orgMap[p.org_id]
                    const rolePill = {traveller:{label:'Traveller',color:'blue'},solo:{label:'Solo',color:'blue'},
                      org_admin:{label:'Org Admin',color:'purple'},admin:{label:'Platform Admin',color:'green'},
                      developer:{label:'Developer',color:'gray'}}[p.role]||{label:p.role,color:'gray'}
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={p.full_name}/>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 truncate">{p.full_name||'—'}</p>
                              <p className="text-xs text-gray-400 truncate">{p.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {org ? <span className="text-gray-700">{org.name}</span>
                               : <span className="text-gray-400 italic text-xs">None</span>}
                        </td>
                        <td className="px-4 py-3"><Pill label={rolePill.label} color={rolePill.color}/></td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {['traveller','solo'].includes(p.role)
                            ? <Pill label={p.onboarding_completed_at?'Complete':'Pending'} color={p.onboarding_completed_at?'green':'amber'}/>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {travellingIds.has(p.id)
                            ? <div className="flex items-center gap-1.5 text-green-600 text-xs font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/>Travelling
                              </div>
                            : <span className="text-gray-400 text-xs">At home</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button onClick={()=>setLinkProfile(p)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#0118A1] bg-blue-50 hover:bg-blue-100 transition-colors">
                              <Link2 size={11}/> Assign Org
                            </button>
                            <button onClick={()=>setRoleProfile(p)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors">
                              <Pencil size={11}/> Role
                            </button>
                            {p.org_id && (
                              <button onClick={async()=>{ if(confirm('Remove from organisation?')) { await supabase.from('profiles').update({org_id:null}).eq('id',p.id); refresh() }}}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors">
                                <Link2Off size={11}/> Unlink
                              </button>
                            )}
                            <button onClick={()=>handleDeleteProfile(p)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors">
                              <Trash2 size={11}/> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filteredProfiles.length===0 && (
                    <tr><td colSpan={6} className="text-center py-12 text-sm text-gray-400">No users match your filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── ORGANISATIONS ────────────────────────────────────────────────────── */}
      {tab==='orgs' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input className={`${inputCls} pl-9`} placeholder="Search organisations…" value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            <button onClick={()=>{setEditOrg(null);setShowOrgModal(true)}}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shrink-0"
              style={{background:BRAND_BLUE}}>
              <Plus size={14}/> Add Organisation
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Organisation</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Industry / Country</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Users</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Travelling</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Plan</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Approval</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Onboarding</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orgs.filter(o=>!search||(o.name||'').toLowerCase().includes(search.toLowerCase())).map(o => {
                    const memberIds = profiles.filter(p=>p.org_id===o.id).map(p=>p.id)
                    const tNow = memberIds.filter(id=>travellingIds.has(id)).length
                    return (
                      <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                              <Building2 size={14} color={BRAND_BLUE}/>
                            </div>
                            <span className="font-semibold text-gray-900">{o.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <p className="text-gray-700 text-xs">{o.industry||'—'}</p>
                          <p className="text-gray-400 text-xs">{o.country||''}</p>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{orgTravellerCount[o.id]||0}</td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {tNow>0
                            ? <div className="flex items-center gap-1.5 text-green-600 text-xs font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/>{tNow}
                              </div>
                            : <span className="text-gray-400 text-xs">0</span>}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <Pill label={(o.subscription_plan||'—').toUpperCase()} color="blue"/>
                        </td>
                        <td className="px-4 py-3">
                          {o.approval_status === 'pending'  && <Pill label="Awaiting Approval" color="amber"/>}
                          {o.approval_status === 'approved' && <Pill label="Approved" color="green"/>}
                          {o.approval_status === 'rejected' && <Pill label="Rejected" color="red"/>}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <Pill label={o.org_onboarding_completed_at ? 'Complete' : 'Pending'} color={o.org_onboarding_completed_at ? 'green' : 'amber'}/>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {o.approval_status !== 'approved' && (
                              <button onClick={()=>handleOrgApproval(o,'approved')} title="Approve"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                                <UserCheck size={14}/>
                              </button>
                            )}
                            {o.approval_status !== 'rejected' && (
                              <button onClick={()=>handleOrgApproval(o,'rejected')} title="Reject"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <UserX size={14}/>
                              </button>
                            )}
                            <button onClick={()=>setEditOrg(o)} title="Edit organisation"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-[#0118A1] hover:bg-blue-50 transition-colors">
                              <Pencil size={14}/>
                            </button>
                            <button onClick={()=>handleDeleteOrg(o)} title="Delete organisation"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                              <Trash2 size={14}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {orgs.length===0 && (
                    <tr><td colSpan={7} className="text-center py-12 text-sm text-gray-400">No organisations yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── FEEDS ────────────────────────────────────────────────────────────── */}
      {tab==='feeds' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard icon={Wifi}      label="Live"         value={BUILTIN_FEEDS.filter(f=>f.status==='active').length + customFeeds.filter(f=>f.status==='active').length} color="#22C55E"/>
            <KpiCard icon={Key}       label="Needs API Key" value={needsKey} color="#F59E0B" link="/intel-feeds"/>
            <KpiCard icon={Handshake} label="Partnerships" value={BUILTIN_FEEDS.filter(f=>f.status==='partnership').length} color="#7C3AED"/>
            <KpiCard icon={Globe}     label="Custom Feeds" value={customFeeds.length} color={BRAND_BLUE}/>
          </div>

          {/* Category filter */}
          <div className="flex flex-wrap gap-2">
            {['all',...FEED_CATEGORIES].map(cat=>(
              <button key={cat} onClick={()=>setFeedCatFilter(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  feedCatFilter===cat?'text-white border-transparent':'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                style={feedCatFilter===cat?{background:BRAND_BLUE}:{}}>
                {cat==='all'?'All':cat.replace('-',' ').replace(/\b\w/g,c=>c.toUpperCase())}
              </button>
            ))}
          </div>

          {/* Builtin feeds */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">Built-in Feeds</h2>
              <Link to="/intel-feeds" className="flex items-center gap-1.5 text-xs text-[#0118A1] font-medium hover:underline">
                Full manager <ExternalLink size={12}/>
              </Link>
            </div>
            {BUILTIN_FEEDS.filter(f=>feedCatFilter==='all'||f.category===feedCatFilter).map(f=>{
              const s = FEED_STATUS[f.status]||FEED_STATUS.pending
              return (
                <div key={f.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{f.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{f.category.replace('-',' ')}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="w-2 h-2 rounded-full" style={{background:s.dot}}/>
                    <Pill label={s.label} color={s.color}/>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Custom feeds */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">Custom Feeds ({customFeeds.length})</h2>
              <button onClick={()=>{setEditFeed(null);setShowFeedModal(true)}}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white"
                style={{background:BRAND_BLUE}}>
                <Plus size={12}/> Add Feed
              </button>
            </div>
            {customFeeds.filter(f=>feedCatFilter==='all'||f.category===feedCatFilter).map(f=>(
              <div key={f.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{f.name}</p>
                  <p className="text-xs text-gray-400">{f.feedType} · {f.category}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Pill label={f.status==='active'?'Live':'Inactive'} color={f.status==='active'?'green':'gray'}/>
                  <button onClick={()=>setEditFeed(f)} className="p-1.5 rounded-lg text-gray-400 hover:text-[#0118A1] hover:bg-blue-50 transition-colors"><Pencil size={13}/></button>
                  <button onClick={()=>deleteFeed(f.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={13}/></button>
                </div>
              </div>
            ))}
            {customFeeds.length===0 && <p className="text-sm text-gray-400 text-center py-8">No custom feeds yet. Add one above.</p>}
          </div>
        </div>
      )}

      {/* ── POLICIES ─────────────────────────────────────────────────────────── */}
      {tab==='policies' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <p className="text-sm text-gray-500">{policies.length} polic{policies.length!==1?'ies':'y'} · assign to specific organisations or leave global</p>
            <button onClick={()=>{setEditPolicy(null);setShowPolicyModal(true)}}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{background:BRAND_BLUE}}>
              <Plus size={14}/> Add Policy
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Policy</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Category</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Organisation</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {policies.map(p=>(
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-900">{p.name}</p>
                        {p.description && <p className="text-xs text-gray-400 truncate max-w-xs">{p.description}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <Pill label={p.category||'General'} color="blue"/>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs">
                        {p.org_id ? orgMap[p.org_id]?.name||'Unknown org' : <span className="text-gray-300">All orgs</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Pill label={p.status||'Active'} color={p.status==='Active'?'green':'amber'}/>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={()=>setEditPolicy(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-[#0118A1] hover:bg-blue-50 transition-colors"><Pencil size={14}/></button>
                          <button onClick={()=>deletePolicy(p.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={14}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {policies.length===0 && <tr><td colSpan={5} className="text-center py-12 text-sm text-gray-400">No policies yet. Add your first policy above.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <Link to="/policies" className="flex items-center gap-1.5 text-sm font-medium text-[#0118A1] hover:underline">
              View policy library (user view) <ExternalLink size={13}/>
            </Link>
          </div>
        </div>
      )}

      {/* ── TRAINING ─────────────────────────────────────────────────────────── */}
      {tab==='training' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <p className="text-sm text-gray-500">{modules.length} custom module{modules.length!==1?'s':''} · platform-wide or assigned to specific organisations</p>
            <button onClick={()=>{setEditModule(null);setShowTrainingModal(true)}}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{background:BRAND_BLUE}}>
              <Plus size={14}/> Add Module
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Module</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Category</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Organisation</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Duration</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Required</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {modules.map(m=>(
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-900">{m.title}</p>
                        {m.description && <p className="text-xs text-gray-400 truncate max-w-xs">{m.description}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <Pill label={m.category||'General'} color="blue"/>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs">
                        {m.org_id ? orgMap[m.org_id]?.name||'Unknown org' : <span className="text-gray-300">All orgs</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-xs">
                        {m.duration_mins} min
                      </td>
                      <td className="px-4 py-3">
                        {m.required ? <Pill label="Mandatory" color="red"/> : <Pill label="Optional" color="gray"/>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={()=>setEditModule(m)} className="p-1.5 rounded-lg text-gray-400 hover:text-[#0118A1] hover:bg-blue-50 transition-colors"><Pencil size={14}/></button>
                          <button onClick={()=>deleteModule(m.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={14}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {modules.length===0 && <tr><td colSpan={6} className="text-center py-12 text-sm text-gray-400">No custom modules yet. Add your first training module above.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <Link to="/training" className="flex items-center gap-1.5 text-sm font-medium text-[#0118A1] hover:underline">
              View training (user view) <ExternalLink size={13}/>
            </Link>
          </div>
        </div>
      )}

      {/* ── AUDIT LOG TAB ── */}
      {tab === 'audit' && (() => {
        const ACTION_COLORS = {
          'trip.approved':  'bg-blue-100 text-blue-700 border-blue-200',
          'trip.rejected':  'bg-red-100 text-red-700 border-red-200',
          'trip.submitted': 'bg-indigo-100 text-indigo-700 border-indigo-200',
          'user.deleted':   'bg-red-100 text-red-700 border-red-200',
          'user.role_changed': 'bg-purple-100 text-purple-700 border-purple-200',
          'user.org_assigned': 'bg-violet-100 text-violet-700 border-violet-200',
          'org.approved':   'bg-green-100 text-green-700 border-green-200',
          'org.rejected':   'bg-red-100 text-red-700 border-red-200',
          'org.deleted':    'bg-red-100 text-red-700 border-red-200',
          'checkin.submitted': 'bg-emerald-100 text-emerald-700 border-emerald-200',
          'sos.triggered':  'bg-red-100 text-red-800 border-red-300',
          'policy.created': 'bg-amber-100 text-amber-700 border-amber-200',
          'policy.deleted': 'bg-amber-100 text-amber-700 border-amber-200',
          'training.completed': 'bg-teal-100 text-teal-700 border-teal-200',
        }

        const ACTION_CATEGORIES = ['all', 'trip', 'user', 'org', 'checkin', 'sos', 'policy', 'training']

        const filtered = auditLogs.filter(log => {
          const matchCat = auditAction === 'all' || log.action?.startsWith(auditAction + '.')
          const q = auditSearch.toLowerCase()
          const matchSearch = !q || log.actor_email?.toLowerCase().includes(q)
            || log.description?.toLowerCase().includes(q)
            || log.action?.toLowerCase().includes(q)
            || log.entity_id?.toLowerCase().includes(q)
          return matchCat && matchSearch
        })

        const exportCSV = () => {
          const headers = ['Timestamp','Actor','Role','Action','Entity Type','Entity ID','Description']
          const rows = filtered.map(l => [
            new Date(l.created_at).toISOString(),
            l.actor_email || '',
            l.actor_role || '',
            l.action || '',
            l.entity_type || '',
            l.entity_id || '',
            (l.description || '').replace(/,/g, ';'),
          ])
          const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
          const blob = new Blob([csv], { type: 'text/csv' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`
          a.click()
          URL.revokeObjectURL(url)
        }

        return (
          <div className="space-y-4">
            {/* Header + controls */}
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={auditSearch} onChange={e => setAuditSearch(e.target.value)}
                    placeholder="Search actor, action, description…"
                    className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#0118A1]"
                  />
                </div>
                <select value={auditAction} onChange={e => setAuditAction(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]">
                  {ACTION_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c === 'all' ? 'All actions' : c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
                <button onClick={loadAuditLogs} disabled={auditLoading}
                  className="flex items-center gap-1.5 text-sm text-[#0118A1] font-medium hover:underline disabled:opacity-40">
                  <RefreshCw size={13} className={auditLoading ? 'animate-spin' : ''} />Refresh
                </button>
              </div>
              <button onClick={exportCSV}
                className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                <Download size={13} />Export CSV
              </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
              {auditLoading ? (
                <div className="py-16 text-center text-sm text-gray-400">Loading audit logs…</div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-400">No audit events found</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide w-36">Timestamp</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Actor</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Action</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Description</th>
                      <th className="px-4 py-3 w-8"/>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map(log => {
                      const expanded = auditExpanded[log.id]
                      const colorCls = ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600 border-gray-200'
                      return (
                        <>
                          <tr key={log.id}
                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => setAuditExpanded(prev => ({ ...prev, [log.id]: !prev[log.id] }))}>
                            <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                              {new Date(log.created_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-xs font-medium text-gray-800">{log.actor_email || '—'}</div>
                              <div className="text-[10px] text-gray-400 capitalize">{log.actor_role || ''}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${colorCls}`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell max-w-xs truncate">
                              {log.description || '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-300">
                              {expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                            </td>
                          </tr>
                          {expanded && (
                            <tr key={log.id + '-detail'} className="bg-gray-50">
                              <td colSpan={5} className="px-6 py-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-3">
                                  <div><p className="font-bold text-gray-400 uppercase tracking-wider mb-0.5">Entity Type</p><p className="text-gray-700">{log.entity_type || '—'}</p></div>
                                  <div><p className="font-bold text-gray-400 uppercase tracking-wider mb-0.5">Entity ID</p><p className="text-gray-700 font-mono truncate">{log.entity_id || '—'}</p></div>
                                  <div><p className="font-bold text-gray-400 uppercase tracking-wider mb-0.5">IP Address</p><p className="text-gray-700">{log.ip_address || '—'}</p></div>
                                  <div><p className="font-bold text-gray-400 uppercase tracking-wider mb-0.5">Full Timestamp</p><p className="text-gray-700">{new Date(log.created_at).toISOString()}</p></div>
                                </div>
                                {log.metadata && Object.keys(log.metadata).length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Metadata</p>
                                    <pre className="text-[11px] text-gray-600 bg-white rounded-lg border border-gray-100 p-3 overflow-x-auto">
                                      {JSON.stringify(log.metadata, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-xs text-gray-400 text-right">Showing {filtered.length} of {auditLogs.length} events · Last 500 records</p>
          </div>
        )
      })()}
    </Layout>
  )
}
