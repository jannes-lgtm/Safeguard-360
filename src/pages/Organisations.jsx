/**
 * /src/pages/Organisations.jsx
 * Developer-only: manage all corporate client organisations on the platform.
 */

import { useEffect, useState } from 'react'
import {
  Building2, Plus, Users, Plane, CheckCircle2, X,
  Globe, Mail, Phone, RefreshCw, ChevronRight, BarChart2,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const PLAN_STYLE = {
  solo:         { label: 'SOLO',         bg: 'bg-gray-100',   text: 'text-gray-600' },
  team:         { label: 'TEAM',         bg: 'bg-blue-100',   text: 'text-blue-700' },
  operations:   { label: 'OPERATIONS',   bg: 'bg-amber-100',  text: 'text-amber-700' },
  enterprise:   { label: 'ENTERPRISE',   bg: 'bg-purple-100', text: 'text-purple-700' },
  // legacy fallbacks
  starter:      { label: 'SOLO',         bg: 'bg-gray-100',   text: 'text-gray-600' },
  professional: { label: 'TEAM',         bg: 'bg-blue-100',   text: 'text-blue-700' },
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const emptyOrg = {
  name: '', industry: '', country: '', website: '',
  primary_contact: '', contact_email: '', contact_phone: '',
  subscription_plan: 'team', max_travellers: 15, notes: '',
}

// ── Org card ──────────────────────────────────────────────────────────────────
function OrgCard({ org, stats, onClick }) {
  const plan = PLAN_STYLE[org.subscription_plan] || PLAN_STYLE.professional

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-[#0118A1]/20 transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold"
            style={{ background: `${BRAND_BLUE}12`, color: BRAND_BLUE }}>
            {org.name[0]?.toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-900 group-hover:text-[#0118A1] transition-colors">{org.name}</p>
            <p className="text-xs text-gray-400">{org.industry || 'No industry'} · {org.country || 'No country'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${plan.bg} ${plan.text}`}>
            {plan.label}
          </span>
          {!org.is_active && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
              Inactive
            </span>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-gray-50 rounded-lg py-2">
          <p className="text-base font-bold text-gray-900">{stats?.traveller_count || 0}</p>
          <p className="text-[10px] text-gray-400">Travellers</p>
        </div>
        <div className="bg-gray-50 rounded-lg py-2">
          <p className="text-base font-bold text-gray-900">{stats?.active_trips || 0}</p>
          <p className="text-[10px] text-gray-400">Active Trips</p>
        </div>
        <div className={`rounded-lg py-2 ${
          (stats?.pending_approvals || 0) > 0 ? 'bg-amber-50' : 'bg-gray-50'
        }`}>
          <p className={`text-base font-bold ${(stats?.pending_approvals || 0) > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
            {stats?.pending_approvals || 0}
          </p>
          <p className="text-[10px] text-gray-400">Pending</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 text-[10px] text-gray-400">
        <span>Added {fmtDate(org.created_at)}</span>
        <ChevronRight size={10} className="ml-auto group-hover:translate-x-0.5 transition-transform" />
      </div>
    </div>
  )
}

// ── Org detail / edit modal ───────────────────────────────────────────────────
function OrgModal({ org, onClose, onSaved }) {
  const isNew = !org?.id
  const [form, setForm] = useState(org ? { ...org } : { ...emptyOrg })
  const [saving, setSaving] = useState(false)
  const [members, setMembers] = useState([])

  const f = key => ({
    value: form[key] ?? '',
    onChange: e => setForm(p => ({ ...p, [key]: e.target.value })),
  })

  useEffect(() => {
    if (!isNew && org?.id) {
      supabase.from('profiles').select('*').eq('org_id', org.id).then(({ data }) => {
        setMembers(data || [])
      })
    }
  }, [org?.id])

  const save = async () => {
    setSaving(true)
    const payload = { ...form, updated_at: new Date().toISOString() }
    const { error } = isNew
      ? await supabase.from('organisations').insert(payload)
      : await supabase.from('organisations').update(payload).eq('id', org.id)
    setSaving(false)
    if (!error) { onSaved(); onClose() }
    else console.error('save org error:', error)
  }

  const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20"
  const labelClass = "text-xs font-semibold text-gray-600 block mb-1"

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-end z-50">
      <div className="h-full w-full max-w-lg bg-white shadow-2xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-bold text-gray-900">
            {isNew ? 'Add Organisation' : org.name}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-4">
          {/* Company info */}
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Company Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelClass}>Company name *</label>
              <input className={inputClass} placeholder="Acme Corporation" {...f('name')} />
            </div>
            <div>
              <label className={labelClass}>Industry</label>
              <input className={inputClass} placeholder="e.g. Mining" {...f('industry')} />
            </div>
            <div>
              <label className={labelClass}>Country</label>
              <input className={inputClass} placeholder="e.g. South Africa" {...f('country')} />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Website</label>
              <input className={inputClass} placeholder="https://..." {...f('website')} />
            </div>
          </div>

          {/* Contact */}
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-2">Primary Contact</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelClass}>Contact name</label>
              <input className={inputClass} placeholder="John Smith" {...f('primary_contact')} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" className={inputClass} placeholder="john@acme.com" {...f('contact_email')} />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input className={inputClass} placeholder="+27 11 000 0000" {...f('contact_phone')} />
            </div>
          </div>

          {/* Plan */}
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-2">Subscription</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Plan</label>
              <select className={inputClass} {...f('subscription_plan')}>
                <option value="solo">SOLO — $18/mo (1 seat)</option>
                <option value="team">TEAM — $210/mo (15 seats)</option>
                <option value="operations">OPERATIONS — $580/mo (40 seats)</option>
                <option value="enterprise">ENTERPRISE — Custom</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Max travellers</label>
              <input type="number" className={inputClass} min="1" max="10000" {...f('max_travellers')} />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active !== false}
                onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
                className="rounded" />
              <label htmlFor="is_active" className="text-sm text-gray-700">Active account</label>
            </div>
          </div>

          {/* Notes */}
          <div className="pt-2">
            <label className={labelClass}>Internal notes</label>
            <textarea className={`${inputClass} h-20 resize-none`}
              placeholder="Any notes about this client…" {...f('notes')} />
          </div>

          {/* Members (existing org) */}
          {!isNew && members.length > 0 && (
            <div className="pt-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                Members ({members.length})
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {members.map(m => (
                  <div key={m.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white"
                      style={{ background: BRAND_BLUE }}>
                      {(m.full_name || m.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{m.full_name || m.email}</p>
                      <p className="text-[10px] text-gray-400 capitalize">{m.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={save} disabled={saving || !form.name.trim()}
            className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl disabled:opacity-50"
            style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
            {saving ? 'Saving…' : isNew ? 'Add Organisation' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Organisations() {
  const [orgs, setOrgs]         = useState([])
  const [stats, setStats]       = useState({})
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)  // null | 'new' | org object
  const [search, setSearch]     = useState('')
  const [filterPlan, setFilterPlan] = useState('all')

  const loadOrgs = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('organisations')
      .select('*')
      .order('created_at', { ascending: false })
    setOrgs(data || [])

    // Load stats per org
    if (data?.length) {
      const orgIds = data.map(o => o.id)

      const [{ data: travellers }, { data: trips }, { data: pending }] = await Promise.all([
        supabase.from('profiles').select('id, org_id').in('org_id', orgIds).eq('role', 'traveller'),
        supabase.from('itineraries').select('id, user_id, status')
          .in('status', ['Active']),
        supabase.from('itineraries').select('id, user_id, approval_status')
          .eq('approval_status', 'pending'),
      ])

      // Build traveller → org map
      const tMap = {}
      for (const t of travellers || []) {
        tMap[t.id] = t.org_id
      }

      const statsMap = {}
      for (const o of data) {
        const orgTravellers = (travellers || []).filter(t => t.org_id === o.id)
        const orgTravellerIds = orgTravellers.map(t => t.id)
        statsMap[o.id] = {
          traveller_count:   orgTravellers.length,
          active_trips:      (trips || []).filter(t => orgTravellerIds.includes(t.user_id)).length,
          pending_approvals: (pending || []).filter(t => orgTravellerIds.includes(t.user_id)).length,
        }
      }
      setStats(statsMap)
    }

    setLoading(false)
  }

  useEffect(() => { loadOrgs() }, [])

  const filtered = orgs.filter(o => {
    const matchSearch = !search || o.name.toLowerCase().includes(search.toLowerCase()) ||
      (o.industry || '').toLowerCase().includes(search.toLowerCase())
    const matchPlan = filterPlan === 'all' || o.subscription_plan === filterPlan
    return matchSearch && matchPlan
  })

  const totalTravellers = Object.values(stats).reduce((s, o) => s + (o.traveller_count || 0), 0)
  const totalActive     = Object.values(stats).reduce((s, o) => s + (o.active_trips || 0), 0)

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organisations</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {orgs.length} corporate client{orgs.length !== 1 ? 's' : ''} · {totalTravellers} travellers · {totalActive} active trips
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadOrgs} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => setModal('new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
            <Plus size={15} /> Add Organisation
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search organisations…"
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 flex-1 min-w-[200px]"
        />
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-wrap">
          {['all', 'solo', 'team', 'operations', 'enterprise'].map(p => (
            <button key={p} onClick={() => setFilterPlan(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium uppercase transition-colors ${
                filterPlan === p ? 'bg-white text-[#0118A1] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-40 bg-white rounded-xl border animate-pulse"/>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <Building2 size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No organisations found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(org => (
            <OrgCard
              key={org.id}
              org={org}
              stats={stats[org.id]}
              onClick={() => setModal(org)}
            />
          ))}
        </div>
      )}

      {modal && (
        <OrgModal
          org={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={loadOrgs}
        />
      )}
    </Layout>
  )
}
