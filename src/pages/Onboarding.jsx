import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User, Phone, Globe, CreditCard, Heart, Shield,
  ChevronRight, ChevronLeft, CheckCircle2, MapPin,
  Loader2, AlertTriangle, ChevronDown,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent bg-white'
const labelClass = 'block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide'

const STEPS = [
  { id: 'personal',  label: 'Personal',   icon: User },
  { id: 'kin',       label: 'Next of Kin', icon: Heart },
  { id: 'insurance', label: 'Insurance',   icon: Shield },
  { id: 'policy',    label: 'Policy',      icon: CreditCard },
]

// ── Mini policy document (read-only for signing step) ─────────────────────────
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

      <p>
        By signing below you confirm you have read, understood, and agree to comply with the full Travel Risk Management Policy available in the platform. This signature is legally binding.
      </p>

      <p className="text-gray-400 text-[10px]">
        Full policy available under Compliance → Travel Policy at any time.
      </p>
    </div>
  )
}

// ── Main onboarding page ──────────────────────────────────────────────────────
export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep]       = useState(0)
  const [userId, setUserId]   = useState(null)
  const [orgPolicy, setOrgPolicy] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  // Form state
  const [personal, setPersonal] = useState({
    full_name: '', phone: '', date_of_birth: '',
    nationality: '', passport_number: '', passport_expiry: '',
  })
  const [kin, setKin] = useState({
    kin_name: '', kin_relationship: '', kin_phone: '', kin_email: '',
  })
  const [insurance, setInsurance] = useState({
    insurance_provider: '', insurance_policy: '',
    medical_aid: '', medical_aid_num: '',
    blood_type: '', allergies: '', medications: '',
  })

  // Policy signing
  const scrollRef = useRef(null)
  const [scrolled, setScrolled]   = useState(false)
  const [signedName, setSignedName] = useState('')
  const [location, setLocation]   = useState(null)
  const [locating, setLocating]   = useState(false)
  const [locError, setLocError]   = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/login'); return }
      setUserId(user.id)

      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, phone, org_id, onboarding_completed_at')
        .eq('id', user.id).single()

      if (prof?.onboarding_completed_at) { navigate('/dashboard'); return }
      if (prof?.full_name) setPersonal(p => ({ ...p, full_name: prof.full_name }))
      if (prof?.phone)     setPersonal(p => ({ ...p, phone: prof.phone }))

      // Load org policy for signing step
      if (prof?.org_id) {
        const { data: pol } = await supabase
          .from('travel_policies')
          .select('*')
          .eq('org_id', prof.org_id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()
        setOrgPolicy(pol)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (step === 3) {
      const el = scrollRef.current
      if (el && el.scrollHeight <= el.clientHeight) setScrolled(true)
      setSignedName(personal.full_name || '')
    }
  }, [step])

  const setP = (k, v) => setPersonal(f => ({ ...f, [k]: v }))
  const setK = (k, v) => setKin(f => ({ ...f, [k]: v }))
  const setI = (k, v) => setInsurance(f => ({ ...f, [k]: v }))

  const getLocation = () => {
    setLocating(true)
    setLocError('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
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
    if (step === 0) {
      if (!personal.full_name.trim()) { setError('Please enter your full name.'); return false }
      if (!personal.phone.trim())     { setError('Please enter your phone number.'); return false }
      if (!personal.nationality.trim()) { setError('Please enter your nationality.'); return false }
    }
    if (step === 1) {
      if (!kin.kin_name.trim())  { setError('Please enter your next of kin name.'); return false }
      if (!kin.kin_phone.trim()) { setError('Please enter your next of kin phone number.'); return false }
    }
    if (step === 3) {
      if (!signedName.trim()) { setError('Please type your full name to sign.'); return false }
      if (!scrolled) { setError('Please scroll to the bottom before signing.'); return false }
    }
    return true
  }

  const handleNext = () => {
    if (!validateStep()) return
    // Skip policy step if no org policy
    if (step === 2 && !orgPolicy) { handleComplete(); return }
    setStep(s => s + 1)
  }

  const handleComplete = async () => {
    if (!validateStep()) return
    setSaving(true)
    setError('')

    try {
      // Save all profile data
      const { error: profErr } = await supabase.from('profiles').update({
        ...personal,
        ...kin,
        ...insurance,
        onboarding_completed_at: new Date().toISOString(),
      }).eq('id', userId)

      if (profErr) throw new Error(profErr.message)

      // Save policy signature if we have a policy
      if (orgPolicy && signedName.trim()) {
        const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', userId).single()
        await supabase.from('policy_signatures').upsert({
          policy_id:      orgPolicy.id,
          user_id:        userId,
          org_id:         prof?.org_id,
          signed_name:    signedName.trim(),
          signed_at:      new Date().toISOString(),
          policy_version: orgPolicy.policy_version,
          latitude:       location?.latitude || null,
          longitude:      location?.longitude || null,
          location_name:  location?.locationName || null,
        }, { onConflict: 'user_id,policy_id' })
      }

      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  const totalSteps = orgPolicy ? 4 : 3
  const pct = Math.round(((step) / totalSteps) * 100)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F0F2F8' }}>

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <img src="/logo-blue.png" alt="SafeGuard360" className="h-7 w-auto" />
            <span className="text-xs text-gray-400 font-medium">Step {step + 1} of {totalSteps}</span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-gray-100">
            <div className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: BRAND_GREEN }} />
          </div>
          {/* Step labels */}
          <div className="flex justify-between mt-2">
            {STEPS.slice(0, orgPolicy ? 4 : 3).map((s, i) => (
              <span key={s.id} className="text-[9px] font-bold uppercase tracking-wide"
                style={{ color: i <= step ? BRAND_BLUE : '#CBD5E1' }}>
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-2xl">

          {/* ── STEP 0: Personal Details ── */}
          {step === 0 && (
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

          {/* ── STEP 1: Next of Kin ── */}
          {step === 1 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-50" style={{ background: `${BRAND_BLUE}08` }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#e53e3e' }}>
                    <Heart size={18} color="white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900">Next of Kin</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Emergency contact — notified if you cannot be reached</p>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  This person will be contacted by the SafeGuard360 control room in the event of an emergency where you cannot be reached. Please ensure the details are accurate and up to date.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Full Name *</label>
                    <input className={inputClass} placeholder="Jane Smith"
                      value={kin.kin_name} onChange={e => setK('kin_name', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Relationship</label>
                    <select className={inputClass} value={kin.kin_relationship} onChange={e => setK('kin_relationship', e.target.value)}>
                      <option value="">Select relationship</option>
                      <option>Spouse / Partner</option>
                      <option>Parent</option>
                      <option>Sibling</option>
                      <option>Child</option>
                      <option>Friend</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Phone Number *</label>
                    <input className={inputClass} type="tel" placeholder="+27 82 000 0000"
                      value={kin.kin_phone} onChange={e => setK('kin_phone', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Email Address</label>
                    <input className={inputClass} type="email" placeholder="jane@example.com"
                      value={kin.kin_email} onChange={e => setK('kin_email', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Insurance & Medical ── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Insurance */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-50" style={{ background: `${BRAND_BLUE}08` }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#0118A1' }}>
                      <Shield size={18} color="white" />
                    </div>
                    <div>
                      <h2 className="font-bold text-gray-900">Travel Insurance</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Your personal travel insurance details</p>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Insurance Provider</label>
                      <input className={inputClass} placeholder="e.g. Hollard Travel Insurance"
                        value={insurance.insurance_provider} onChange={e => setI('insurance_provider', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass}>Policy Number</label>
                      <input className={inputClass} placeholder="POL-000000"
                        value={insurance.insurance_policy} onChange={e => setI('insurance_policy', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass}>Medical Aid Provider</label>
                      <input className={inputClass} placeholder="e.g. Discovery Health"
                        value={insurance.medical_aid} onChange={e => setI('medical_aid', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass}>Medical Aid Number</label>
                      <input className={inputClass} placeholder="MED-000000"
                        value={insurance.medical_aid_num} onChange={e => setI('medical_aid_num', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Medical info */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-50">
                  <h3 className="font-bold text-gray-900 text-sm">Medical Information</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Shared with emergency responders only</p>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className={labelClass}>Blood Type</label>
                      <select className={inputClass} value={insurance.blood_type} onChange={e => setI('blood_type', e.target.value)}>
                        <option value="">Unknown</option>
                        {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelClass}>Known Allergies</label>
                      <input className={inputClass} placeholder="e.g. Penicillin, Peanuts — or None"
                        value={insurance.allergies} onChange={e => setI('allergies', e.target.value)} />
                    </div>
                    <div className="md:col-span-3">
                      <label className={labelClass}>Current Medications</label>
                      <input className={inputClass} placeholder="e.g. Metformin 500mg — or None"
                        value={insurance.medications} onChange={e => setI('medications', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Travel Policy Signing ── */}
          {step === 3 && orgPolicy && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-50" style={{ background: `${BRAND_BLUE}08` }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: BRAND_GREEN }}>
                    <CreditCard size={18} color={BRAND_BLUE} />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900">Travel Policy</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Read and sign to complete your profile</p>
                  </div>
                </div>
              </div>

              {/* Scrollable policy */}
              <div
                ref={scrollRef}
                onScroll={e => {
                  const el = e.target
                  if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) setScrolled(true)
                }}
                className="h-64 overflow-y-auto p-6 border-b border-gray-100"
                style={{ scrollbarWidth: 'thin' }}
              >
                <MiniPolicy config={orgPolicy} />
                <div className="h-4" />
              </div>

              {!scrolled && (
                <div className="px-6 py-2 flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
                  <ChevronDown size={12} className="animate-bounce" />
                  Scroll to the bottom to unlock signing
                </div>
              )}

              {/* Signing */}
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
                      <MapPin size={12} className="shrink-0" />
                      {location.locationName}
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
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mt-4">
              <AlertTriangle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => { setError(''); setStep(s => s - 1) }}
              disabled={step === 0}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-700 hover:bg-white transition-all disabled:opacity-0"
            >
              <ChevronLeft size={16} /> Back
            </button>

            {step < (orgPolicy ? 3 : 2) ? (
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
