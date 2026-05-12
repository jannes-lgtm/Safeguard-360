import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User, Phone, Globe, CreditCard, Heart, Shield,
  ChevronRight, ChevronLeft, CheckCircle2, MapPin,
  Loader2, AlertTriangle, ChevronDown, Briefcase, Plus, Trash2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent bg-white'
const labelClass = 'block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide'

const BLANK_CONTACT = { full_name: '', relationship: '', phone: '', email: '' }

// ── Mini org policy (read-only for signing step) ──────────────────────────────
function MiniPolicy({ config }) {
  const c = config || {}
  const Field = ({ value, fallback = '___' }) =>
    value ? <strong style={{ color: BRAND_BLUE }}>{value}</strong>
           : <span className="text-gray-400">{fallback}</span>

  return (
    <div className="text-xs text-gray-600 leading-relaxed space-y-4" style={{ fontFamily: 'Georgia, serif' }}>
      <div className="text-center pb-3 border-b border-gray-200">
        <h3 className="font-bold text-gray-900 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
          Corporate Travel Risk Management Policy
        </h3>
        <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
          <Field value={c.company_name} fallback="Your Organisation" /> · v{c.policy_version || '1.0'} · ISO 31030:2021
        </p>
      </div>
      <p>
        <Field value={c.company_name} fallback="Your organisation" /> is committed to the health, safety, and security of all travelling employees. This policy establishes the framework for managing travel-related risks in accordance with ISO 31030:2021.
      </p>
      <div>
        <p className="font-bold text-gray-800 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>As a traveller you agree to:</p>
        <ul className="list-disc list-inside space-y-1 ml-1">
          <li>Submit all trips for approval before booking</li>
          <li>Complete mandatory pre-travel safety training</li>
          <li>Perform regular check-ins during travel</li>
          <li>Allow passive GPS location tracking during active travel periods</li>
          <li>Use the SOS function immediately in a life-threatening emergency</li>
          <li>Report all incidents within 24 hours via the platform</li>
          <li>Keep your profile and next of kin details current at all times</li>
        </ul>
      </div>
      <div className="rounded-lg p-3" style={{ background: '#FFF5F5', border: '1px solid #FCA5A5' }}>
        <p className="font-bold text-red-800 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Emergency</p>
        <p>24/7 Emergency Line: <Field value={c.emergency_number} fallback="[see full policy]" /></p>
        <p className="mt-1">Activate SOS in SafeGuard360 immediately in any life-threatening situation.</p>
      </div>
      <p>By signing below you confirm you have read, understood, and agree to comply with the full Travel Risk Management Policy. This signature is legally binding.</p>
    </div>
  )
}

// ── SafeGuard360 Solo Traveller Agreement ─────────────────────────────────────
function SoloTerms() {
  return (
    <div className="text-xs text-gray-600 leading-relaxed space-y-4" style={{ fontFamily: 'Georgia, serif' }}>
      <div className="text-center pb-3 border-b border-gray-200">
        <h3 className="font-bold text-gray-900 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
          SafeGuard360 — Solo Traveller Agreement
        </h3>
        <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
          Personal Travel Safety & Platform Terms · v1.0
        </p>
      </div>

      <p>SafeGuard360 provides you with real-time travel risk intelligence, emergency check-in tools, and a direct line to our 24/7 control room. By using the platform you agree to the following.</p>

      <div>
        <p className="font-bold text-gray-800 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Your responsibilities:</p>
        <ul className="list-disc list-inside space-y-1 ml-1">
          <li>Keep your profile, passport details, and emergency contacts accurate and up to date</li>
          <li>Log all trips before you depart so your contacts can be notified</li>
          <li>Complete your agreed check-ins at the frequency you set per trip</li>
          <li>Activate SOS immediately in any life-threatening emergency</li>
          <li>Allow the platform to access your location only during active check-ins or SOS events</li>
          <li>Not share your account credentials or secure itinerary passcode with untrusted parties</li>
        </ul>
      </div>

      <div>
        <p className="font-bold text-gray-800 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>What SafeGuard360 provides:</p>
        <ul className="list-disc list-inside space-y-1 ml-1">
          <li>Real-time risk alerts relevant to your travel destinations</li>
          <li>Automated notifications to your emergency contacts on missed check-ins</li>
          <li>24/7 control room monitoring and SOS response coordination</li>
          <li>A secure, shareable itinerary link for your emergency contacts</li>
          <li>Access to general travel safety training</li>
        </ul>
      </div>

      <div>
        <p className="font-bold text-gray-800 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Data &amp; Privacy (POPIA):</p>
        <ul className="list-disc list-inside space-y-1 ml-1">
          <li>Your personal data is stored securely and used only to deliver the services described above</li>
          <li>Emergency contact details are used solely for notifying those contacts in your interest</li>
          <li>You may request a copy of your data or deletion of your account at any time</li>
          <li>Location data is captured only at check-in or SOS events and is never sold to third parties</li>
        </ul>
      </div>

      <div className="rounded-lg p-3" style={{ background: '#FFF5F5', border: '1px solid #FCA5A5' }}>
        <p className="font-bold text-red-800 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>SOS &amp; Missed Check-in</p>
        <p>If you miss a check-in, your emergency contacts will be notified automatically. Activating SOS alerts the SafeGuard360 control room and all your emergency contacts simultaneously. Use it only in genuine emergencies.</p>
      </div>

      <p>By signing below you confirm you have read and agree to these terms. This agreement is legally binding and recorded with a timestamp and location for your protection.</p>
    </div>
  )
}

// ── Main onboarding ───────────────────────────────────────────────────────────
export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep]       = useState(0)
  const [userId, setUserId]   = useState(null)
  const [orgId, setOrgId]     = useState(null)
  const [role, setRole]       = useState(null)
  const [orgPolicy, setOrgPolicy] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const [personal, setPersonal] = useState({
    full_name: '', phone: '', date_of_birth: '',
    nationality: '', passport_number: '', passport_expiry: '',
  })

  // Up to 3 emergency contacts — first is required
  const [contacts, setContacts] = useState([
    { ...BLANK_CONTACT },
    { ...BLANK_CONTACT },
    { ...BLANK_CONTACT },
  ])

  const [manager, setManager] = useState({
    manager_name: '', manager_title: '', manager_email: '', manager_phone: '',
  })

  const scrollRef = useRef(null)
  const [scrolled, setScrolled]     = useState(false)
  const [signedName, setSignedName] = useState('')
  const [location, setLocation]     = useState(null)
  const [locating, setLocating]     = useState(false)
  const [locError, setLocError]     = useState('')

  const isSolo = role === 'solo' || (!orgId && role !== 'admin' && role !== 'developer' && role !== 'org_admin')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/login'); return }
      setUserId(user.id)

      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, phone, org_id, role, onboarding_completed_at')
        .eq('id', user.id).single()

      if (prof?.onboarding_completed_at) { navigate('/dashboard'); return }
      if (prof?.full_name) setPersonal(p => ({ ...p, full_name: prof.full_name }))
      if (prof?.phone)     setPersonal(p => ({ ...p, phone: prof.phone }))
      if (prof?.org_id)    setOrgId(prof.org_id)
      if (prof?.role)      setRole(prof.role)

      // Load org policy for org members
      if (prof?.org_id) {
        const { data: pol } = await supabase
          .from('travel_policies')
          .select('*')
          .eq('org_id', prof.org_id)
          .eq('is_active', true)
          .limit(1).maybeSingle()
        setOrgPolicy(pol)
      }

      // Pre-fill existing emergency contacts
      const { data: existingContacts } = await supabase
        .from('emergency_contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('priority')
      if (existingContacts?.length) {
        setContacts(prev => prev.map((c, i) => existingContacts[i]
          ? { full_name: existingContacts[i].full_name || '', relationship: existingContacts[i].relationship || '', phone: existingContacts[i].phone || '', email: existingContacts[i].email || '' }
          : c
        ))
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (currentStepId === 'policy' || currentStepId === 'solo_terms') {
      const el = scrollRef.current
      if (el && el.scrollHeight <= el.clientHeight) setScrolled(true)
      setSignedName(personal.full_name || '')
    }
  }, [step])

  const setP = (k, v) => setPersonal(f => ({ ...f, [k]: v }))
  const setC = (i, k, v) => setContacts(cs => cs.map((c, idx) => idx === i ? { ...c, [k]: v } : c))
  const setM = (k, v) => setManager(f => ({ ...f, [k]: v }))
  const stepIds = [
    'personal',
    'contacts',
    ...(orgId ? ['manager'] : []),
    ...(orgPolicy ? ['policy'] : isSolo ? ['solo_terms'] : []),
  ]
  const currentStepId = stepIds[step]
  const totalSteps    = stepIds.length

  const getLocation = () => {
    setLocating(true); setLocError('')
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords
        let locationName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`)
          const d = await r.json()
          if (d.display_name) locationName = d.display_name.split(',').slice(0, 3).join(',').trim()
        } catch {}
        setLocation({ latitude, longitude, locationName })
        setLocating(false)
      },
      () => { setLocError('Could not get location — you can still continue without it.'); setLocating(false) },
      { timeout: 10000 }
    )
  }

  const validateStep = () => {
    setError('')
    if (currentStepId === 'personal') {
      if (!personal.full_name.trim())   { setError('Please enter your full name.'); return false }
      if (!personal.phone.trim())       { setError('Please enter your phone number.'); return false }
      if (!personal.nationality.trim()) { setError('Please enter your nationality.'); return false }
    }
    if (currentStepId === 'contacts') {
      if (!contacts[0].full_name.trim())  { setError('Please enter your primary emergency contact name.'); return false }
      if (!contacts[0].phone.trim())      { setError('Please enter your primary emergency contact phone number.'); return false }
    }
    if (currentStepId === 'manager') {
      if (!manager.manager_name.trim())  { setError('Please enter your line manager\'s name.'); return false }
      if (!manager.manager_email.trim()) { setError('Please enter your line manager\'s email.'); return false }
    }
    if (currentStepId === 'policy' || currentStepId === 'solo_terms') {
      if (!signedName.trim()) { setError('Please type your full name to sign.'); return false }
      if (!scrolled) { setError('Please scroll to the bottom before signing.'); return false }
    }
    return true
  }

  const handleNext = () => {
    if (!validateStep()) return
    if (step < totalSteps - 1) setStep(s => s + 1)
    else handleComplete()
  }

  const handleComplete = async () => {
    if (!validateStep()) return
    setSaving(true); setError('')

    try {
      // Save profile data (keep primary contact in kin_ fields for compatibility)
      const primary = contacts[0]
      const { error: profErr } = await supabase.from('profiles').update({
        ...personal,
        ...(orgId ? manager : {}),
        kin_name:         primary.full_name,
        kin_relationship: primary.relationship,
        kin_phone:        primary.phone,
        kin_email:        primary.email,
        onboarding_completed_at: new Date().toISOString(),
      }).eq('id', userId)
      if (profErr) throw new Error(profErr.message)

      // Save all emergency contacts to dedicated table
      const validContacts = contacts
        .map((c, i) => ({ ...c, priority: i + 1 }))
        .filter(c => c.full_name.trim() && c.phone.trim())

      if (validContacts.length > 0) {
        await supabase.from('emergency_contacts').delete().eq('user_id', userId)
        await supabase.from('emergency_contacts').insert(
          validContacts.map(c => ({
            user_id:      userId,
            priority:     c.priority,
            full_name:    c.full_name.trim(),
            relationship: c.relationship || null,
            phone:        c.phone.trim(),
            email:        c.email.trim() || null,
          }))
        )
      }

      // Save policy / terms signature
      if ((orgPolicy && signedName.trim()) || (isSolo && signedName.trim())) {
        const sigPayload = {
          user_id:        userId,
          signed_name:    signedName.trim(),
          signed_at:      new Date().toISOString(),
          latitude:       location?.latitude  || null,
          longitude:      location?.longitude || null,
          location_name:  location?.locationName || null,
        }
        if (orgPolicy) {
          const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', userId).single()
          await supabase.from('policy_signatures').upsert({
            ...sigPayload,
            policy_id:      orgPolicy.id,
            org_id:         prof?.org_id,
            policy_version: orgPolicy.policy_version,
          }, { onConflict: 'user_id,policy_id' })
        } else {
          // Solo: store in policy_signatures with a sentinel policy_id
          await supabase.from('policy_signatures').upsert({
            ...sigPayload,
            policy_id:      '00000000-0000-0000-0000-000000000001',
            policy_version: '1.0',
          }, { onConflict: 'user_id,policy_id' })
        }
      }

      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  const stepLabel = id => {
    const map = { personal: 'Personal', contacts: 'Contacts', manager: 'Manager', insurance: 'Insurance', policy: 'Policy', solo_terms: 'Terms' }
    return map[id] || id
  }

  const pct = Math.round((step / totalSteps) * 100)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F0F2F8' }}>

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <img src="/logo-blue.png" alt="SafeGuard360" className="h-7 w-auto" />
            <span className="text-xs text-gray-400 font-medium">Step {step + 1} of {totalSteps}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-gray-100">
            <div className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: BRAND_GREEN }} />
          </div>
          <div className="flex justify-between mt-2">
            {stepIds.map((id, i) => (
              <span key={id} className="text-[9px] font-bold uppercase tracking-wide"
                style={{ color: i <= step ? BRAND_BLUE : '#CBD5E1' }}>
                {stepLabel(id)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-2xl">

          {/* ── STEP: Personal Details ── */}
          {currentStepId === 'personal' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-50" style={{ background: `${BRAND_BLUE}08` }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: BRAND_BLUE }}>
                    <User size={18} color="white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900">Personal Details</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Your identity and travel document information</p>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={labelClass}>Full Legal Name *</label>
                    <input className={inputClass} placeholder="As it appears on your passport"
                      value={personal.full_name} onChange={e => setP('full_name', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Mobile Phone *</label>
                    <input className={inputClass} type="tel" placeholder="+27 82 000 0000"
                      value={personal.phone} onChange={e => setP('phone', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Date of Birth</label>
                    <input className={inputClass} type="date"
                      value={personal.date_of_birth} onChange={e => setP('date_of_birth', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Nationality *</label>
                    <input className={inputClass} placeholder="e.g. South African"
                      value={personal.nationality} onChange={e => setP('nationality', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Passport Number</label>
                    <input className={inputClass} placeholder="A12345678"
                      value={personal.passport_number} onChange={e => setP('passport_number', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Passport Expiry Date</label>
                    <input className={inputClass} type="date"
                      value={personal.passport_expiry} onChange={e => setP('passport_expiry', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP: Emergency Contacts ── */}
          {currentStepId === 'contacts' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-50" style={{ background: `${BRAND_BLUE}08` }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#e53e3e' }}>
                      <Heart size={18} color="white" />
                    </div>
                    <div>
                      <h2 className="font-bold text-gray-900">Emergency Contacts</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Up to 3 contacts — notified automatically if you cannot be reached</p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-6">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                    These contacts are notified automatically on missed check-ins and SOS events. They will also receive your trip itinerary by email when you log a new trip. No platform account is needed.
                  </div>

                  {contacts.map((c, i) => (
                    <div key={i}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ background: i === 0 ? '#e53e3e' : BRAND_BLUE }}>
                          {i + 1}
                        </div>
                        <span className="text-sm font-semibold text-gray-700">
                          {i === 0 ? 'Primary Contact *' : i === 1 ? 'Secondary Contact' : 'Tertiary Contact'}
                        </span>
                        {i === 0 && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">Required</span>}
                        {i > 0 && <span className="text-[10px] text-gray-400">(optional)</span>}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-8">
                        <div>
                          <label className={labelClass}>Full Name {i === 0 ? '*' : ''}</label>
                          <input className={inputClass} placeholder="Jane Smith"
                            value={c.full_name} onChange={e => setC(i, 'full_name', e.target.value)} />
                        </div>
                        <div>
                          <label className={labelClass}>Relationship</label>
                          <select className={inputClass} value={c.relationship} onChange={e => setC(i, 'relationship', e.target.value)}>
                            <option value="">Select relationship</option>
                            <option>Spouse / Partner</option>
                            <option>Parent</option>
                            <option>Sibling</option>
                            <option>Child</option>
                            <option>Friend</option>
                            <option>Colleague</option>
                            <option>Other</option>
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>Phone Number {i === 0 ? '*' : ''}</label>
                          <input className={inputClass} type="tel" placeholder="+27 82 000 0000"
                            value={c.phone} onChange={e => setC(i, 'phone', e.target.value)} />
                        </div>
                        <div>
                          <label className={labelClass}>Email Address</label>
                          <input className={inputClass} type="email" placeholder="jane@example.com"
                            value={c.email} onChange={e => setC(i, 'email', e.target.value)} />
                        </div>
                      </div>
                      {i < contacts.length - 1 && <div className="mt-5 border-b border-gray-100" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP: Line Manager (org only) ── */}
          {currentStepId === 'manager' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-50" style={{ background: `${BRAND_BLUE}08` }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: BRAND_BLUE }}>
                    <Briefcase size={18} color="white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900">Line Manager</h2>
                    <p className="text-xs text-gray-400 mt-0.5">The person who approves your travel and signs your visa letters</p>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
                  Your line manager's details will be used on visa support letters and travel approval requests.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Full Name *</label>
                    <input className={inputClass} placeholder="e.g. Sarah Jones"
                      value={manager.manager_name} onChange={e => setM('manager_name', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Job Title</label>
                    <input className={inputClass} placeholder="e.g. HR Manager"
                      value={manager.manager_title} onChange={e => setM('manager_title', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Email Address *</label>
                    <input className={inputClass} type="email" placeholder="manager@company.com"
                      value={manager.manager_email} onChange={e => setM('manager_email', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Phone Number</label>
                    <input className={inputClass} type="tel" placeholder="+27 11 000 0000"
                      value={manager.manager_phone} onChange={e => setM('manager_phone', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP: Org Travel Policy Signing ── */}
          {currentStepId === 'policy' && orgPolicy && (
            <SigningStep scrollRef={scrollRef} scrolled={scrolled} setScrolled={setScrolled}
              signedName={signedName} setSignedName={setSignedName}
              location={location} locating={locating} locError={locError} getLocation={getLocation}
              title="Travel Policy" subtitle="Read and sign to complete your profile">
              <MiniPolicy config={orgPolicy} />
            </SigningStep>
          )}

          {/* ── STEP: Solo Traveller Terms ── */}
          {currentStepId === 'solo_terms' && (
            <SigningStep scrollRef={scrollRef} scrolled={scrolled} setScrolled={setScrolled}
              signedName={signedName} setSignedName={setSignedName}
              location={location} locating={locating} locError={locError} getLocation={getLocation}
              title="SafeGuard360 Agreement" subtitle="Read and sign to activate your solo traveller account">
              <SoloTerms />
            </SigningStep>
          )}

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mt-4">
              <AlertTriangle size={14} className="shrink-0" />{error}
            </div>
          )}

          <div className="flex items-center justify-between mt-6">
            <button onClick={() => { setError(''); setStep(s => s - 1) }} disabled={step === 0}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-700 hover:bg-white transition-all disabled:opacity-0">
              <ChevronLeft size={16} /> Back
            </button>
            {step < totalSteps - 1 ? (
              <button onClick={handleNext}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all"
                style={{ background: BRAND_BLUE, color: 'white' }}>
                Continue <ChevronRight size={16} />
              </button>
            ) : (
              <button onClick={handleComplete} disabled={saving}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
                {saving
                  ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                  : <><CheckCircle2 size={15} /> Complete Profile</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Shared signing step wrapper ───────────────────────────────────────────────
function SigningStep({ scrollRef, scrolled, setScrolled, signedName, setSignedName, location, locating, locError, getLocation, title, subtitle, children }) {
  const BRAND_BLUE  = '#0118A1'
  const BRAND_GREEN = '#AACC00'
  const inputClass  = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent bg-white'
  const labelClass  = 'block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide'
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-50" style={{ background: `${BRAND_BLUE}08` }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: BRAND_GREEN }}>
            <CreditCard size={18} color={BRAND_BLUE} />
          </div>
          <div>
            <h2 className="font-bold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          </div>
        </div>
      </div>
      <div ref={scrollRef}
        onScroll={e => { const el = e.target; if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) setScrolled(true) }}
        className="h-64 overflow-y-auto p-6 border-b border-gray-100" style={{ scrollbarWidth: 'thin' }}>
        {children}
        <div className="h-4" />
      </div>
      {!scrolled && (
        <div className="px-6 py-2 flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
          <ChevronDown size={12} className="animate-bounce" />Scroll to the bottom to unlock signing
        </div>
      )}
      <div className={`p-6 space-y-4 transition-opacity ${!scrolled ? 'opacity-40 pointer-events-none' : ''}`}>
        <div>
          <label className={labelClass}>Type your full name to sign *</label>
          <input className={inputClass} placeholder="e.g. Jane Smith"
            value={signedName} onChange={e => setSignedName(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Location at signing <span className="font-normal normal-case text-gray-400">(recommended)</span></label>
          {location ? (
            <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-800">
              <MapPin size={12} className="shrink-0" />{location.locationName}
            </div>
          ) : (
            <button onClick={getLocation} disabled={locating}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50 w-full">
              {locating ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
              {locating ? 'Getting location…' : 'Capture my current location'}
            </button>
          )}
          {locError && <p className="text-xs text-amber-600 mt-1">{locError}</p>}
        </div>
        <p className="text-[11px] text-gray-400">
          Signing timestamp: <strong className="text-gray-600">
            {new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}
          </strong>
        </p>
      </div>
    </div>
  )
}
