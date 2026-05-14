import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Users, Mail, Phone, Globe, MapPin,
  ChevronRight, ChevronLeft, CheckCircle2, Plus, X,
  Briefcase, Loader2, AlertTriangle, Send,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent bg-white'
const labelClass = 'block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide'

const STEPS = [
  { id: 'org',      label: 'Organisation', icon: Building2 },
  { id: 'contacts', label: 'Contacts',     icon: Phone },
  { id: 'invite',   label: 'Invite',       icon: Users },
  { id: 'done',     label: 'Done',         icon: CheckCircle2 },
]

const INDUSTRIES = [
  'Mining & Resources', 'Oil & Gas', 'Construction', 'NGO / Humanitarian',
  'Government & Defence', 'Financial Services', 'Technology', 'Healthcare',
  'Logistics & Transport', 'Media & Entertainment', 'Education', 'Other',
]

const COUNTRIES = [
  'South Africa', 'Nigeria', 'Kenya', 'Ghana', 'Ethiopia', 'Tanzania',
  'Uganda', 'Mozambique', 'Zambia', 'Zimbabwe', 'Angola', 'Cameroon',
  'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain',
  'United Kingdom', 'United States', 'Australia', 'Other',
]

export default function OrgOnboarding() {
  const navigate  = useNavigate()
  const [step, setStep]     = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [profile, setProfile] = useState(null)
  const [orgId, setOrgId]   = useState(null)

  // Step 0 — org details
  const [orgForm, setOrgForm] = useState({
    name: '', industry: '', country: '', address: '', website: '',
    emergency_number: '',
  })

  // Step 1 — contacts
  const [contactForm, setContactForm] = useState({
    primary_contact: '', contact_email: '', contact_phone: '',
    security_contact: '', security_email: '', security_phone: '',
  })

  // Step 2 — invite travellers
  const [inviteRows, setInviteRows] = useState([{ email: '', role: 'traveller' }])
  const [inviteStatus, setInviteStatus] = useState([]) // 'sending' | 'sent' | 'error' per row
  const [invitesDone, setInvitesDone]   = useState(false)

  // Load current user + org
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/login'); return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('id, role, org_id, full_name')
        .eq('id', user.id)
        .maybeSingle()

      if (!prof || prof.role !== 'org_admin') {
        navigate('/dashboard')
        return
      }

      setProfile(prof)

      if (prof.org_id) {
        setOrgId(prof.org_id)
        const { data: org } = await supabase
          .from('organisations')
          .select('*')
          .eq('id', prof.org_id)
          .maybeSingle()

        if (org) {
          setOrgForm({
            name:             org.name             || '',
            industry:         org.industry          || '',
            country:          org.country           || '',
            address:          org.address           || '',
            website:          org.website           || '',
            emergency_number: org.emergency_number  || '',
          })
          setContactForm({
            primary_contact:  org.primary_contact   || '',
            contact_email:    org.contact_email      || '',
            contact_phone:    org.contact_phone      || '',
            security_contact: org.security_contact   || '',
            security_email:   org.security_email     || '',
            security_phone:   org.security_phone     || '',
          })
        }
      }
    }
    load()
  }, [navigate])

  // ── Persist org (upsert) ───────────────────────────────────────────────────
  const saveOrg = async () => {
    setError('')
    setSaving(true)
    try {
      const payload = {
        ...orgForm,
        ...contactForm,
        org_onboarding_completed_at: null, // still in progress
      }

      let id = orgId

      if (id) {
        const { error: e } = await supabase
          .from('organisations')
          .update(payload)
          .eq('id', id)
        if (e) throw e
      } else {
        const { data, error: e } = await supabase
          .from('organisations')
          .insert({ ...payload, is_active: true })
          .select('id')
          .single()
        if (e) throw e
        id = data.id
        setOrgId(id)

        // Link org_admin profile to the new org
        await supabase
          .from('profiles')
          .update({ org_id: id })
          .eq('id', profile.id)
      }

      return id
    } finally {
      setSaving(false)
    }
  }

  // ── Send invites ───────────────────────────────────────────────────────────
  const sendInvites = async () => {
    if (!orgId) return
    const validRows = inviteRows.filter(r => r.email.trim())
    if (!validRows.length) { setInvitesDone(true); return }

    setInviteStatus(validRows.map(() => 'sending'))

    // Fetch session once — all invites share the same token
    const { data: { session } } = await supabase.auth.getSession()
    const authHeader = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {}

    const results = await Promise.all(
      validRows.map(async (row) => {
        try {
          const res = await fetch('/api/invite-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({
              email:  row.email.trim(),
              role:   row.role,
              org_id: orgId,
            }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            console.error('[OrgOnboarding] invite failed', row.email, err)
            return 'error'
          }
          return 'sent'
        } catch (e) {
          console.error('[OrgOnboarding] invite network error', row.email, e)
          return 'error'
        }
      })
    )

    setInviteStatus(results)
    setInvitesDone(true)
  }

  // ── Mark onboarding complete ───────────────────────────────────────────────
  const markComplete = async (id) => {
    await supabase
      .from('organisations')
      .update({ org_onboarding_completed_at: new Date().toISOString() })
      .eq('id', id || orgId)
  }

  // ── Step navigation ────────────────────────────────────────────────────────
  const next = async () => {
    setError('')
    if (step === 0) {
      if (!orgForm.name.trim()) { setError('Organisation name is required.'); return }
      try { await saveOrg() } catch (e) { setError(e.message); return }
    }
    if (step === 1) {
      if (!contactForm.primary_contact.trim() || !contactForm.contact_email.trim()) {
        setError('Primary contact name and email are required.')
        return
      }
      try { await saveOrg() } catch (e) { setError(e.message); return }
    }
    if (step === 2) {
      await sendInvites()
    }
    if (step === 3) {
      navigate('/dashboard')
      return
    }
    setStep(s => s + 1)
  }

  const back = () => { setError(''); setStep(s => s - 1) }

  // ── Finish ─────────────────────────────────────────────────────────────────
  const finish = async () => {
    setSaving(true)
    try {
      await markComplete()
    } finally {
      setSaving(false)
    }
    navigate('/dashboard')
  }

  // ── Invite row helpers ─────────────────────────────────────────────────────
  const addRow    = () => setInviteRows(r => [...r, { email: '', role: 'traveller' }])
  const removeRow = (i) => setInviteRows(r => r.filter((_, idx) => idx !== i))
  const updateRow = (i, field, val) =>
    setInviteRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row))

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3">
        <img src="/logo-colour.png" alt="SafeGuard360" className="h-8 w-auto" />
        <span className="text-sm text-gray-400 font-medium">Organisation Setup</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl">

          {/* Progress */}
          <div className="mb-6">
            {/* Step label + count */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: BRAND_BLUE }}>
                {STEPS[step]?.label}
              </span>
              <span className="text-[10px] text-gray-400 font-medium">Step {step + 1} of {STEPS.length}</span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden mb-4">
              <div className="h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.round((step / (STEPS.length - 1)) * 100)}%`, background: `linear-gradient(90deg, ${BRAND_BLUE}, ${BRAND_GREEN})` }} />
            </div>
            {/* Step circles */}
            <div className="flex items-center gap-1 sm:gap-2">
              {STEPS.map((s, i) => {
                const Icon = s.icon
                const active   = i === step
                const complete = i < step
                return (
                  <div key={s.id} className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
                    <div className="flex flex-col items-center shrink-0">
                      <div
                        className="w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all"
                        style={{
                          background: complete ? BRAND_GREEN : active ? BRAND_BLUE : '#E5E7EB',
                          color: complete || active ? '#fff' : '#9CA3AF',
                          transform: active ? 'scale(1.1)' : 'scale(1)',
                        }}
                      >
                        {complete ? <CheckCircle2 size={13} /> : <Icon size={13} />}
                      </div>
                      <span className={`hidden sm:block text-[10px] font-semibold mt-1 ${active ? 'text-[#0118A1]' : complete ? 'text-[#AACC00]' : 'text-gray-400'}`}>
                        {s.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="flex-1 h-0.5 mb-0 sm:mb-4 transition-all" style={{ background: i < step ? BRAND_GREEN : '#E5E7EB' }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">

            {error && (
              <div className="mb-4 flex items-start gap-2 bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* ── Step 0: Organisation Details ── */}
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Tell us about your organisation</h2>
                  <p className="text-sm text-gray-500 mt-1">This information will appear on your travel policy and documentation.</p>
                </div>

                <div>
                  <label className={labelClass}>Organisation Name *</label>
                  <input className={inputClass} placeholder="Acme Corporation" value={orgForm.name}
                    onChange={e => setOrgForm(f => ({ ...f, name: e.target.value }))} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Industry</label>
                    <select className={inputClass} value={orgForm.industry}
                      onChange={e => setOrgForm(f => ({ ...f, industry: e.target.value }))}>
                      <option value="">Select industry…</option>
                      {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Country / Region</label>
                    <select className={inputClass} value={orgForm.country}
                      onChange={e => setOrgForm(f => ({ ...f, country: e.target.value }))}>
                      <option value="">Select country…</option>
                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Physical Address</label>
                  <input className={inputClass} placeholder="123 Main Street, Johannesburg, 2000"
                    value={orgForm.address}
                    onChange={e => setOrgForm(f => ({ ...f, address: e.target.value }))} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Website</label>
                    <input className={inputClass} placeholder="https://acme.com"
                      value={orgForm.website}
                      onChange={e => setOrgForm(f => ({ ...f, website: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelClass}>24/7 Emergency Number</label>
                    <input className={inputClass} placeholder="+27 10 000 0000"
                      value={orgForm.emergency_number}
                      onChange={e => setOrgForm(f => ({ ...f, emergency_number: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 1: Contacts ── */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Emergency & primary contacts</h2>
                  <p className="text-sm text-gray-500 mt-1">These contacts will be used in travel policy documents and incident response.</p>
                </div>

                <div className="pb-3 border-b border-gray-100">
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Primary Contact (HR / Travel Manager)</p>
                  <div className="space-y-3">
                    <div>
                      <label className={labelClass}>Full Name *</label>
                      <input className={inputClass} placeholder="Jane Smith"
                        value={contactForm.primary_contact}
                        onChange={e => setContactForm(f => ({ ...f, primary_contact: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Email *</label>
                        <input className={inputClass} type="email" placeholder="jane@acme.com"
                          value={contactForm.contact_email}
                          onChange={e => setContactForm(f => ({ ...f, contact_email: e.target.value }))} />
                      </div>
                      <div>
                        <label className={labelClass}>Phone</label>
                        <input className={inputClass} placeholder="+27 82 000 0000"
                          value={contactForm.contact_phone}
                          onChange={e => setContactForm(f => ({ ...f, contact_phone: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Security / Duty-of-Care Contact</p>
                  <div className="space-y-3">
                    <div>
                      <label className={labelClass}>Full Name</label>
                      <input className={inputClass} placeholder="John Security"
                        value={contactForm.security_contact}
                        onChange={e => setContactForm(f => ({ ...f, security_contact: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Email</label>
                        <input className={inputClass} type="email" placeholder="security@acme.com"
                          value={contactForm.security_email}
                          onChange={e => setContactForm(f => ({ ...f, security_email: e.target.value }))} />
                      </div>
                      <div>
                        <label className={labelClass}>Phone</label>
                        <input className={inputClass} placeholder="+27 82 000 0000"
                          value={contactForm.security_phone}
                          onChange={e => setContactForm(f => ({ ...f, security_phone: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 2: Invite Travellers ── */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Invite your travellers</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Send email invitations now, or skip and invite them later from <strong>Users</strong> in your admin panel.
                  </p>
                </div>

                {!invitesDone ? (
                  <>
                    <div className="space-y-3">
                      {inviteRows.map((row, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input
                            className={`${inputClass} flex-1`}
                            type="email"
                            placeholder="traveller@acme.com"
                            value={row.email}
                            onChange={e => updateRow(i, 'email', e.target.value)}
                          />
                          <select
                            className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#0118A1]"
                            value={row.role}
                            onChange={e => updateRow(i, 'role', e.target.value)}
                          >
                            <option value="traveller">Traveller</option>
                            <option value="org_admin">Admin</option>
                          </select>
                          {inviteRows.length > 1 && (
                            <button onClick={() => removeRow(i)} className="text-gray-400 hover:text-red-500 transition-colors">
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={addRow}
                      className="flex items-center gap-1.5 text-sm font-medium text-[#0118A1] hover:text-[#AACC00] transition-colors"
                    >
                      <Plus size={15} /> Add another
                    </button>

                    <p className="text-xs text-gray-400">
                      Each invitee will receive an email with a secure link to create their account and complete onboarding.
                    </p>
                  </>
                ) : (
                  <div className="space-y-2">
                    {inviteRows.filter(r => r.email.trim()).map((row, i) => (
                      <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                        <div className="flex-1 text-sm text-gray-700">{row.email}</div>
                        {inviteStatus[i] === 'sent'    && <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><CheckCircle2 size={14} /> Sent</span>}
                        {inviteStatus[i] === 'sending' && <span className="text-xs text-gray-400">Sending…</span>}
                        {inviteStatus[i] === 'error'   && <span className="text-xs text-red-500 font-medium">Failed</span>}
                      </div>
                    ))}
                    {inviteRows.every(r => !r.email.trim()) && (
                      <div className="text-sm text-gray-500 italic">Skipped — no emails entered.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Step 3: Done ── */}
            {step === 3 && (
              <div className="text-center space-y-5 py-4">
                <div
                  className="w-20 h-20 rounded-full mx-auto flex items-center justify-center"
                  style={{ background: BRAND_GREEN }}
                >
                  <CheckCircle2 size={36} color="#fff" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">You're all set!</h2>
                  <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto">
                    <strong>{orgForm.name}</strong> is now configured on SafeGuard360. Your travellers will receive their invitations and can complete their own onboarding.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-2xl px-5 py-4 text-left space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">What's next?</p>
                  {[
                    ['Configure your travel policy', 'Add company-specific rules and risk thresholds'],
                    ['Review traveller profiles', 'Check that all details are complete before any trips'],
                    ['Set up approvals workflow', 'Decide which trips need sign-off before booking'],
                  ].map(([title, desc]) => (
                    <div key={title} className="flex items-start gap-3">
                      <div className="w-4 h-4 rounded-full mt-0.5 shrink-0" style={{ background: BRAND_GREEN }} />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{title}</p>
                        <p className="text-xs text-gray-500">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="mt-8 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between">
              {step > 0 && step < 3 ? (
                <button
                  onClick={back}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors py-3 sm:py-0 order-2 sm:order-1"
                >
                  <ChevronLeft size={16} /> Back
                </button>
              ) : <div className="order-2 sm:order-1" />}

              {step < 3 ? (
                <div className="flex flex-col sm:flex-row gap-3 order-1 sm:order-2">
                  {step === 2 && !invitesDone && (
                    <button
                      onClick={async () => { setInvitesDone(true); setStep(3) }}
                      className="w-full sm:w-auto text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors px-4 py-3 sm:py-2 rounded-xl border border-gray-200 sm:border-0"
                    >
                      Skip
                    </button>
                  )}
                  <button
                    onClick={next}
                    disabled={saving}
                    className="flex items-center justify-center gap-2 w-full sm:w-auto px-7 py-3.5 sm:py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                    style={{ background: BRAND_BLUE }}
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                    {step === 2 ? (invitesDone ? 'Continue' : 'Send Invites') : 'Continue'}
                    {!saving && <ChevronRight size={16} />}
                  </button>
                </div>
              ) : (
                <button
                  onClick={finish}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto px-7 py-3.5 sm:py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 order-1 sm:order-2"
                  style={{ background: BRAND_BLUE }}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Go to Dashboard
                </button>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            You can update all of these settings later from your <strong>Organisation</strong> and <strong>Users</strong> admin panels.
          </p>
        </div>
      </div>
    </div>
  )
}
