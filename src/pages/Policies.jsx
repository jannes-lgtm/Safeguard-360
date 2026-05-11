/**
 * Policy Library — with acknowledgement tracking
 *
 * Requires Supabase table (run once):
 * ─────────────────────────────────────────────────
 * create table policy_acknowledgements (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid references auth.users(id) on delete cascade not null,
 *   policy_id uuid references policies(id) on delete cascade not null,
 *   acknowledged_at timestamptz not null default now(),
 *   unique(user_id, policy_id)
 * );
 * alter table policy_acknowledgements enable row level security;
 * create policy "users_own" on policy_acknowledgements for all using (auth.uid() = user_id);
 * create policy "admin_all" on policy_acknowledgements for all using (
 *   exists (select 1 from profiles where id = auth.uid() and role = 'admin')
 * );
 */

import { useEffect, useState } from 'react'
import {
  FileText, Download, CheckCircle2, Clock,
  Shield, Plane, HeartPulse, BookOpen,
  RefreshCw, ChevronRight, AlertCircle,
  Mail, Plus, Upload, X,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

// ── Category config ───────────────────────────────────────────────────────────
const CAT_CONFIG = {
  'Travel':          { icon: Plane,      bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  'Compliance':      { icon: BookOpen,   bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE' },
  'Security':        { icon: Shield,     bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
  'Health & Safety': { icon: HeartPulse, bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
}

function CategoryChip({ category }) {
  const c = CAT_CONFIG[category] || { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' }
  const Icon = c.icon || FileText
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      <Icon size={9} />
      {category}
    </span>
  )
}

function StatusChip({ status }) {
  const styles = {
    Active:         { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
    'Under Review': { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  }
  const s = styles[status] || { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status}
    </span>
  )
}

function InternalBadge() {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>
      Internal
    </span>
  )
}

// ── Policy card ───────────────────────────────────────────────────────────────
function PolicyCard({ policy, acknowledged, onAcknowledge, ackLoading }) {
  const isUnderReview = policy.status === 'Under Review'
  const catConf = CAT_CONFIG[policy.category] || {}
  const Icon = catConf.icon || FileText
  const ackDate = acknowledged
    ? new Date(acknowledged).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <div className="bg-white rounded-2xl overflow-hidden flex flex-col transition-all duration-200"
      style={{
        boxShadow: acknowledged
          ? `0 1px 3px rgba(0,0,0,0.06), 0 0 0 1.5px ${BRAND_GREEN}50`
          : '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        border: acknowledged ? `1.5px solid ${BRAND_GREEN}50` : '1px solid rgba(0,0,0,0.06)',
      }}>

      {/* Top accent line */}
      <div className="h-0.5 w-full" style={{ background: catConf.color || BRAND_BLUE, opacity: 0.6 }} />

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Icon + title */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: catConf.bg || `${BRAND_BLUE}10` }}>
            <Icon size={18} style={{ color: catConf.color || BRAND_BLUE }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 text-sm leading-snug mb-2">{policy.name}</h3>
            <div className="flex flex-wrap gap-1.5">
              <CategoryChip category={policy.category} />
              <StatusChip status={policy.status} />
              {policy.org_id && <InternalBadge />}
            </div>
          </div>
        </div>

        {/* Description */}
        {policy.description && (
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{policy.description}</p>
        )}

        {/* Meta */}
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <span className="flex items-center gap-1"><FileText size={10} />v{policy.version}</span>
          <span className="flex items-center gap-1"><Clock size={10} />Updated {policy.last_updated}</span>
        </div>

        {/* Acknowledged banner */}
        {acknowledged && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: `${BRAND_GREEN}15`, border: `1px solid ${BRAND_GREEN}40` }}>
            <CheckCircle2 size={13} style={{ color: '#3F6212' }} className="shrink-0" />
            <p className="text-[11px] font-semibold" style={{ color: '#3F6212' }}>
              Acknowledged {ackDate}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto flex gap-2">
          {/* Acknowledge button */}
          {!isUnderReview && !acknowledged && (
            <button
              onClick={() => onAcknowledge(policy.id)}
              disabled={ackLoading === policy.id}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: BRAND_BLUE, color: 'white' }}>
              {ackLoading === policy.id
                ? <><RefreshCw size={11} className="animate-spin" />Saving...</>
                : <><CheckCircle2 size={11} />Acknowledge</>}
            </button>
          )}

          {/* Download */}
          {isUnderReview ? (
            <button disabled
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium border text-gray-300 bg-gray-50 cursor-not-allowed border-gray-200">
              <Clock size={11} />Coming soon
            </button>
          ) : (
            <a href={policy.file_url || '#'} target="_blank" rel="noopener noreferrer"
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all hover:opacity-90
                ${acknowledged ? 'flex-1' : 'w-10'}`}
              style={{ background: `${BRAND_GREEN}20`, color: '#3F6212', border: `1px solid ${BRAND_GREEN}40` }}>
              <Download size={11} />
              {acknowledged && 'Download'}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Add Policy Modal ──────────────────────────────────────────────────────────
function AddPolicyModal({ orgId, onClose, onSaved }) {
  const POLICY_CATEGORIES = ['Travel', 'Compliance', 'Security', 'Health & Safety']
  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    name: '', category: 'Travel', description: '', file_url: '', version: '1.0',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const f = key => ({
    value: form[key] ?? '',
    onChange: e => setForm(p => ({ ...p, [key]: e.target.value })),
  })

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('policies').insert({
      name:         form.name.trim(),
      category:     form.category,
      description:  form.description,
      file_url:     form.file_url,
      version:      form.version || '1.0',
      org_id:       orgId,
      status:       'Active',
      last_updated: today,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  const inputClass = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20"
  const labelClass = "text-xs font-semibold text-gray-600 block mb-1.5"

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus size={16} style={{ color: BRAND_BLUE }} />
            <h2 className="text-base font-bold text-gray-900">Add Policy</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">{error}</div>
          )}

          <div>
            <label className={labelClass}>Policy name <span className="text-red-500">*</span></label>
            <input className={inputClass} placeholder="e.g. International Travel Security Policy" {...f('name')} />
          </div>

          <div>
            <label className={labelClass}>Category</label>
            <select className={inputClass} {...f('category')}>
              {POLICY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea className={`${inputClass} h-24 resize-none`}
              placeholder="What does this policy cover?" {...f('description')} />
          </div>

          <div>
            <label className={labelClass}>Document URL or link</label>
            <input className={inputClass} placeholder="https://…" {...f('file_url')} />
          </div>

          <div>
            <label className={labelClass}>Version</label>
            <input className={inputClass} placeholder="1.0" {...f('version')} />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !form.name.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl disabled:opacity-50"
            style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
            {saving ? <><RefreshCw size={13} className="animate-spin" /> Saving…</> : <><Upload size={13} /> Add Policy</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Request Policy Modal ──────────────────────────────────────────────────────
function RequestPolicyModal({ orgName, onClose }) {
  const [form, setForm] = useState({ title: '', description: '', urgency: 'Standard' })

  const f = key => ({
    value: form[key] ?? '',
    onChange: e => setForm(p => ({ ...p, [key]: e.target.value })),
  })

  const handleSubmit = () => {
    const subject = encodeURIComponent(`Policy Request – ${orgName || 'My Organisation'}`)
    const body = encodeURIComponent(
      `Policy Request\n\nPolicy title / topic:\n${form.title}\n\nUrgency: ${form.urgency}\n\nWhat the policy should cover:\n${form.description}`
    )
    window.location.href = `mailto:support@risk360.co?subject=${subject}&body=${body}`
    onClose()
  }

  const inputClass = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20"
  const labelClass = "text-xs font-semibold text-gray-600 block mb-1.5"

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail size={16} style={{ color: BRAND_BLUE }} />
            <h2 className="text-base font-bold text-gray-900">Request from SafeGuard360</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={labelClass}>Policy title / topic needed <span className="text-red-500">*</span></label>
            <input className={inputClass} placeholder="e.g. Remote Work Security Policy" {...f('title')} />
          </div>

          <div>
            <label className={labelClass}>What should the policy cover?</label>
            <textarea className={`${inputClass} h-28 resize-none`}
              placeholder="Describe the scope, audience, and key areas the policy should address…"
              {...f('description')} />
          </div>

          <div>
            <label className={labelClass}>Urgency</label>
            <select className={inputClass} {...f('urgency')}>
              <option value="Standard">Standard</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!form.title.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl disabled:opacity-50 transition-opacity"
            style={{ background: BRAND_BLUE, color: 'white' }}>
            <Mail size={14} /> Send Request
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Policies() {
  const [policies, setPolicies]             = useState([])
  const [acknowledgements, setAcknowledgements] = useState({})  // { policy_id: acknowledged_at }
  const [loading, setLoading]               = useState(true)
  const [ackLoading, setAckLoading]         = useState(null)
  const [ackTableMissing, setAckTableMissing] = useState(false)
  const [filter, setFilter]                 = useState('all')
  const [userProfile, setUserProfile]       = useState(null)
  const [showAddModal, setShowAddModal]     = useState(false)
  const [showRequestModal, setShowRequestModal] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Load user profile to get role, org_id, full_name
    const { data: prof } = await supabase
      .from('profiles').select('role, org_id, full_name, organisations(name)').eq('id', user.id).single()
    setUserProfile(prof || null)

    const orgId = prof?.org_id

    // Build policies query — include org-specific policies when user has an org
    let polsQuery = supabase.from('policies').select('*').in('status', ['Active', 'Under Review'])
    if (orgId) {
      polsQuery = polsQuery.or(`org_id.is.null,org_id.eq.${orgId}`)
    }
    polsQuery = polsQuery.order('name')

    const [{ data: pols }, { data: acks, error: ackErr }] = await Promise.all([
      polsQuery,
      supabase.from('policy_acknowledgements').select('policy_id, acknowledged_at').eq('user_id', user.id),
    ])

    if (ackErr?.code === '42P01') setAckTableMissing(true)

    setPolicies(pols || [])
    const ackMap = {}
    ;(acks || []).forEach(a => { ackMap[a.policy_id] = a.acknowledged_at })
    setAcknowledgements(ackMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleAcknowledge = async (policyId) => {
    setAckLoading(policyId)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('policy_acknowledgements').upsert({
      user_id:         user.id,
      policy_id:       policyId,
      acknowledged_at: new Date().toISOString(),
    }, { onConflict: 'user_id,policy_id' })
    await load()
    setAckLoading(null)
  }

  const role  = userProfile?.role
  const orgId = userProfile?.org_id
  const orgName = userProfile?.organisations?.name
  // Buttons visible to any non-traveller/solo with an org, plus platform admins and developers
  const canManagePolicies = ['admin', 'org_admin', 'developer'].includes(role) || (orgId && !['traveller', 'solo'].includes(role))

  const total    = policies.filter(p => p.status === 'Active').length
  const ackCount = policies.filter(p => acknowledgements[p.id]).length
  const pct      = total > 0 ? Math.round((ackCount / total) * 100) : 0

  const filtered = policies.filter(p => {
    if (filter === 'pending') return p.status === 'Active' && !acknowledgements[p.id]
    if (filter === 'done')    return !!acknowledgements[p.id]
    return true
  })

  return (
    <Layout>
      {/* Header */}
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Compliance</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Policy Library</h1>
          <p className="text-sm text-gray-400 mt-1">Duty of care documents and sign-off tracking</p>
        </div>

        {canManagePolicies && (
          <div className="flex items-center gap-2 shrink-0 mt-1">
            <button onClick={() => setShowRequestModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors hover:bg-[#0118A1]/5"
              style={{ borderColor: BRAND_BLUE, color: BRAND_BLUE, background: 'white' }}>
              <Mail size={15} /> Request from SafeGuard360
            </button>
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
              style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
              <Plus size={15} /> Add Policy
            </button>
          </div>
        )}
      </div>

      {/* Acknowledgement table missing */}
      {ackTableMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800 mb-1">Acknowledgement tracking not set up</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Run the SQL at the top of <code className="bg-amber-100 px-1 rounded">src/pages/Policies.jsx</code> in Supabase to enable policy sign-offs.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Progress hero */}
      {!ackTableMissing && (
        <div className="rounded-2xl p-6 mb-7 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #0a24cc 100%)`,
            boxShadow: `0 4px 24px ${BRAND_BLUE}40`,
          }}>
          <div className="absolute top-0 right-0 w-36 h-36 rounded-full opacity-10"
            style={{ background: BRAND_GREEN, transform: 'translate(30%, -30%)' }} />

          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={13} style={{ color: BRAND_GREEN }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: BRAND_GREEN }}>
                Policy Sign-offs
              </span>
            </div>
            <div className="flex items-end gap-4 mb-3">
              <span className="text-5xl font-black text-white tracking-tight">{loading ? '–' : `${pct}%`}</span>
              <span className="text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {ackCount} of {total} policies acknowledged
              </span>
            </div>
            <div className="w-full h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <div className="h-2 rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: BRAND_GREEN }} />
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 p-1 bg-white rounded-xl mb-5 w-fit"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)' }}>
        {[
          { key: 'all',     label: `All (${policies.length})` },
          { key: 'pending', label: `Pending (${policies.filter(p => p.status === 'Active' && !acknowledgements[p.id]).length})` },
          { key: 'done',    label: `Signed off (${ackCount})` },
        ].map(tab => (
          <button key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={filter === tab.key
              ? { background: BRAND_BLUE, color: 'white' }
              : { color: '#94A3B8' }
            }>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Policy grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-64 bg-white rounded-2xl animate-pulse"
              style={{ border: '1px solid rgba(0,0,0,0.06)' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 text-center"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)' }}>
          <CheckCircle2 size={28} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400">
            {filter === 'pending' ? 'All policies acknowledged — well done!' : 'No policies found'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(policy => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              acknowledged={acknowledgements[policy.id]}
              onAcknowledge={handleAcknowledge}
              ackLoading={ackLoading}
            />
          ))}
        </div>
      )}

      {showAddModal && (
        <AddPolicyModal
          orgId={orgId}
          onClose={() => setShowAddModal(false)}
          onSaved={load}
        />
      )}

      {showRequestModal && (
        <RequestPolicyModal
          orgName={orgName}
          onClose={() => setShowRequestModal(false)}
        />
      )}
    </Layout>
  )
}
