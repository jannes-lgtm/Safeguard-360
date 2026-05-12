import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Heart, CheckCircle2, AlertTriangle, Loader2, ChevronDown, ChevronUp,
  ShieldCheck, Syringe, ActivitySquare, Phone, FileText, Info,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { resolveCountry } from '../lib/cityToCountry'

const inputCls  = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent bg-white'
const labelCls  = 'block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide'

const SEV_COLOR = { High: '#DC2626', Medium: '#D97706', Low: '#059669' }
const SEV_BG    = { High: '#FEF2F2', Medium: '#FFFBEB', Low: '#F0FDF4' }
const CAT_COLOR = { required: '#DC2626', recommended: '#2563EB', consider: '#6B7280' }
const CAT_BG    = { required: '#FEF2F2', recommended: '#EFF6FF', consider: '#F9FAFB' }
const VAX_STATUS_OPTIONS = ['Completed', 'Scheduled', 'Not applicable']

export default function HealthDeclaration() {
  const { tripId }  = useParams()
  const navigate    = useNavigate()

  const [trip, setTrip]           = useState(null)
  const [existing, setExisting]   = useState(null)
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState('')

  // AI requirements
  const [reqs, setReqs]           = useState(null)
  const [reqsLoading, setReqsLoading] = useState(false)
  const [reqsError, setReqsError] = useState('')
  const [showRisks, setShowRisks] = useState(true)

  // Form state
  const [fitToTravel, setFitToTravel]       = useState(false)
  const [vaxStatuses, setVaxStatuses]       = useState({})   // { [vax.name]: 'Completed'|'Scheduled'|'Not applicable' }
  const [hasMedical, setHasMedical]         = useState(false)
  const [medicalDetails, setMedicalDetails] = useState('')
  const [hasMeds, setHasMeds]               = useState(false)
  const [medsDetails, setMedsDetails]       = useState('')
  const [hasAllergies, setHasAllergies]     = useState(false)
  const [allergyDetails, setAllergyDetails] = useState('')
  const [emergencyName, setEmergencyName]   = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [emergencyRelation, setEmergencyRelation] = useState('')
  const [insuranceConfirmed, setInsuranceConfirmed] = useState(false)
  const [notes, setNotes]                   = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => { init() }, [tripId])

  const init = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/login'); return }

      const { data: tripData } = await supabase
        .from('itineraries').select('*').eq('id', tripId).eq('user_id', session.user.id).single()
      if (!tripData) { setLoadError('Trip not found.'); setLoading(false); return }
      setTrip(tripData)

      // Load existing declaration if already submitted
      const { data: dec } = await supabase
        .from('pre_travel_health').select('*').eq('trip_id', tripId).eq('user_id', session.user.id).single()
      if (dec) {
        setExisting(dec)
        setFitToTravel(dec.fit_to_travel || false)
        setVaxStatuses(dec.vaccinations || {})
        setHasMedical(dec.has_medical_conditions || false)
        setMedicalDetails(dec.medical_conditions || '')
        setHasMeds(dec.has_medications || false)
        setMedsDetails(dec.medications || '')
        setHasAllergies(dec.has_allergies || false)
        setAllergyDetails(dec.allergies || '')
        setEmergencyName(dec.emergency_contact_name || '')
        setEmergencyPhone(dec.emergency_contact_phone || '')
        setEmergencyRelation(dec.emergency_contact_relation || '')
        setInsuranceConfirmed(dec.insurance_confirmed || false)
        setNotes(dec.notes || '')
      }

      // Fetch AI health requirements
      setReqsLoading(true)
      const { data: { session: s2 } } = await supabase.auth.getSession()
      try {
        const resolvedCountry = resolveCountry(tripData.arrival_city) || tripData.arrival_city
        const res = await fetch('/api/health-requirements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s2?.access_token}` },
          body: JSON.stringify({
            destination: tripData.arrival_city,
            country: resolvedCountry,
            depart_date: tripData.depart_date,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          setReqs(data)
          // Pre-fill vax statuses if not loaded from existing
          if (!dec && data.vaccinations?.length) {
            const initial = {}
            data.vaccinations.forEach(v => { initial[v.name] = 'Not applicable' })
            setVaxStatuses(initial)
          }
        } else {
          setReqsError('Could not load live health requirements — please complete the form manually.')
        }
      } catch {
        setReqsError('Could not load live health requirements — please complete the form manually.')
      }
      setReqsLoading(false)
    } catch {
      setLoadError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!fitToTravel) { setError('Please confirm you are medically fit to travel.'); return }

    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', session.user.id).single()

      const payload = {
        trip_id: tripId,
        user_id: session.user.id,
        org_id: prof?.org_id || null,
        fit_to_travel: fitToTravel,
        vaccinations: vaxStatuses,
        has_medical_conditions: hasMedical,
        medical_conditions: hasMedical ? medicalDetails : null,
        has_medications: hasMeds,
        medications: hasMeds ? medsDetails : null,
        has_allergies: hasAllergies,
        allergies: hasAllergies ? allergyDetails : null,
        emergency_contact_name: emergencyName || null,
        emergency_contact_phone: emergencyPhone || null,
        emergency_contact_relation: emergencyRelation || null,
        insurance_confirmed: insuranceConfirmed,
        notes: notes || null,
        submitted_at: new Date().toISOString(),
      }

      if (existing) {
        await supabase.from('pre_travel_health').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('pre_travel_health').insert(payload)
      }

      setSubmitted(true)
    } catch {
      setError('Submission failed. Please try again.')
    }
    setSubmitting(false)
  }

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-[#0118A1]" />
      </div>
    </Layout>
  )

  if (loadError) return (
    <Layout>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertTriangle size={32} className="text-red-400 mb-3" />
        <p className="text-gray-600">{loadError}</p>
        <button onClick={() => navigate('/itinerary')} className="mt-4 text-sm font-semibold underline" style={{ color: '#0118A1' }}>Back to itinerary</button>
      </div>
    </Layout>
  )

  if (submitted) return (
    <Layout>
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#F0FDF4' }}>
          <ShieldCheck size={30} className="text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Health declaration submitted</h1>
        <p className="text-sm text-gray-500 mb-6">
          Your pre-travel health declaration for <strong>{trip?.trip_name}</strong> has been recorded. Travel safely.
        </p>
        <button onClick={() => navigate('/itinerary')}
          className="px-6 py-3 rounded-xl text-sm font-bold text-white transition-all"
          style={{ background: '#0118A1' }}>
          Back to my itinerary →
        </button>
      </div>
    </Layout>
  )

  return (
    <Layout>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => navigate('/itinerary')} className="text-xs text-gray-400 hover:underline">My Itinerary</button>
          <span className="text-gray-300">›</span>
          <span className="text-xs text-gray-500">Health Declaration</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Heart size={20} color="#DC2626" />
          Pre-Travel Health Declaration
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {trip?.trip_name} · {trip?.arrival_city} · {trip?.depart_date}
        </p>
        {existing && (
          <span className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
            <CheckCircle2 size={11} /> Previously submitted — you can update and resubmit
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: AI health intel panel ── */}
        <div className="space-y-4">

          {/* Vaccinations */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
              <Syringe size={15} color="#0118A1" />
              <h2 className="text-sm font-bold text-gray-900 flex-1">Vaccination Requirements</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">AI · Live</span>
            </div>

            {reqsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                <Loader2 size={16} className="animate-spin" />
                Loading live requirements…
              </div>
            ) : reqsError ? (
              <div className="px-5 py-4 text-xs text-amber-700 bg-amber-50">{reqsError}</div>
            ) : reqs?.vaccinations?.length ? (
              <div className="divide-y divide-gray-50">
                {reqs.vaccinations.map(vax => (
                  <div key={vax.name} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-bold text-gray-900">{vax.name}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase"
                            style={{ background: CAT_BG[vax.category], color: CAT_COLOR[vax.category] }}>
                            {vax.category}
                          </span>
                        </div>
                        {vax.notes && <p className="text-[11px] text-gray-500 leading-snug">{vax.notes}</p>}
                      </div>
                    </div>
                    {/* Status selector */}
                    <div className="flex gap-1 flex-wrap">
                      {VAX_STATUS_OPTIONS.map(opt => (
                        <button key={opt} type="button"
                          onClick={() => setVaxStatuses(p => ({ ...p, [vax.name]: opt }))}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all"
                          style={vaxStatuses[vax.name] === opt
                            ? opt === 'Completed'
                              ? { background: '#059669', color: '#fff', borderColor: '#059669' }
                              : opt === 'Scheduled'
                              ? { background: '#2563EB', color: '#fff', borderColor: '#2563EB' }
                              : { background: '#6B7280', color: '#fff', borderColor: '#6B7280' }
                            : { background: '#fff', color: '#9CA3AF', borderColor: '#E5E7EB' }}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-5 py-4 text-xs text-gray-400">No specific requirements found for this destination.</p>
            )}
          </div>

          {/* Health risks */}
          {reqs?.health_risks?.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowRisks(p => !p)}
                className="w-full flex items-center gap-2 px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <ActivitySquare size={15} color="#D97706" />
                <h2 className="text-sm font-bold text-gray-900 flex-1 text-left">Current Health Risks</h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">AI · Live</span>
                {showRisks ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
              </button>
              {showRisks && (
                <div className="divide-y divide-gray-50">
                  {reqs.health_risks.map((risk, i) => (
                    <div key={i} className="px-5 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SEV_COLOR[risk.severity] }} />
                        <span className="text-xs font-bold text-gray-900">{risk.name}</span>
                        <span className="text-[10px] font-semibold ml-auto" style={{ color: SEV_COLOR[risk.severity] }}>{risk.severity}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 leading-snug mb-1">{risk.description}</p>
                      {risk.prevention && (
                        <p className="text-[11px] text-green-700 bg-green-50 rounded-lg px-2 py-1">{risk.prevention}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* General advice */}
          {reqs?.general_advice && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Info size={13} color="#2563EB" />
                <p className="text-xs font-bold text-blue-700">General Health Advice</p>
              </div>
              <p className="text-xs text-blue-800 leading-relaxed">{reqs.general_advice}</p>
              {reqs.sources?.length > 0 && (
                <p className="text-[10px] text-blue-500 mt-2">Sources: {reqs.sources.join(', ')}</p>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Declaration form ── */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Fitness declaration */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ShieldCheck size={15} color="#0118A1" /> Medical Fitness to Travel
              </h2>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="mt-0.5">
                  <input type="checkbox" checked={fitToTravel} onChange={e => setFitToTravel(e.target.checked)}
                    className="w-4 h-4 accent-[#0118A1]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">I confirm I am medically fit to travel</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    I have no known medical condition that would prevent or significantly impair safe travel to {trip?.arrival_city}.
                    I accept responsibility to disclose any condition that may require emergency medical assistance.
                  </p>
                </div>
              </label>
            </div>

            {/* Medical conditions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ActivitySquare size={15} color="#0118A1" /> Medical History
              </h2>

              <div className="space-y-4">
                {/* Chronic conditions */}
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-2">Do you have any chronic or ongoing medical conditions?</p>
                  <div className="flex gap-2 mb-2">
                    {['Yes', 'No'].map(opt => (
                      <button key={opt} type="button" onClick={() => setHasMedical(opt === 'Yes')}
                        className="px-4 py-1.5 rounded-xl text-sm font-semibold border transition-all"
                        style={hasMedical === (opt === 'Yes')
                          ? { background: '#0118A1', color: '#fff', borderColor: '#0118A1' }
                          : { background: '#fff', color: '#6B7280', borderColor: '#E5E7EB' }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                  {hasMedical && (
                    <textarea className={`${inputCls} resize-none`} rows={2}
                      placeholder="e.g. Type 2 diabetes, asthma, hypertension…"
                      value={medicalDetails} onChange={e => setMedicalDetails(e.target.value)} />
                  )}
                </div>

                {/* Medications */}
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-2">Are you currently taking any prescription medications?</p>
                  <div className="flex gap-2 mb-2">
                    {['Yes', 'No'].map(opt => (
                      <button key={opt} type="button" onClick={() => setHasMeds(opt === 'Yes')}
                        className="px-4 py-1.5 rounded-xl text-sm font-semibold border transition-all"
                        style={hasMeds === (opt === 'Yes')
                          ? { background: '#0118A1', color: '#fff', borderColor: '#0118A1' }
                          : { background: '#fff', color: '#6B7280', borderColor: '#E5E7EB' }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                  {hasMeds && (
                    <textarea className={`${inputCls} resize-none`} rows={2}
                      placeholder="e.g. Metformin 500mg, Ventolin inhaler…"
                      value={medsDetails} onChange={e => setMedsDetails(e.target.value)} />
                  )}
                </div>

                {/* Allergies */}
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-2">Do you have any known allergies?</p>
                  <div className="flex gap-2 mb-2">
                    {['Yes', 'No'].map(opt => (
                      <button key={opt} type="button" onClick={() => setHasAllergies(opt === 'Yes')}
                        className="px-4 py-1.5 rounded-xl text-sm font-semibold border transition-all"
                        style={hasAllergies === (opt === 'Yes')
                          ? { background: '#0118A1', color: '#fff', borderColor: '#0118A1' }
                          : { background: '#fff', color: '#6B7280', borderColor: '#E5E7EB' }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                  {hasAllergies && (
                    <textarea className={`${inputCls} resize-none`} rows={2}
                      placeholder="e.g. Penicillin, peanuts, latex…"
                      value={allergyDetails} onChange={e => setAllergyDetails(e.target.value)} />
                  )}
                </div>
              </div>
            </div>

            {/* Emergency medical contact */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Phone size={15} color="#0118A1" /> In-Country Emergency Medical Contact
              </h2>
              <p className="text-xs text-gray-400 mb-4">A local contact who can assist in a medical emergency (doctor, local host, colleague).</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Full name</label>
                  <input className={inputCls} placeholder="e.g. Dr. Amara Diallo" value={emergencyName} onChange={e => setEmergencyName(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Phone number</label>
                  <input className={inputCls} placeholder="e.g. +234 801 234 5678" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Relationship</label>
                  <input className={inputCls} placeholder="e.g. Local host, Doctor" value={emergencyRelation} onChange={e => setEmergencyRelation(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Insurance + notes */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <FileText size={15} color="#0118A1" /> Final Declarations
              </h2>

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={insuranceConfirmed} onChange={e => setInsuranceConfirmed(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-[#0118A1]" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">I have valid travel insurance for this trip</p>
                  <p className="text-xs text-gray-400 mt-0.5">Including medical evacuation and emergency hospitalisation cover.</p>
                </div>
              </label>

              <div>
                <label className={labelCls}>Additional notes (optional)</label>
                <textarea className={`${inputCls} resize-none`} rows={3}
                  placeholder="Any other health information relevant to this trip…"
                  value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertTriangle size={14} className="shrink-0" /> {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={submitting}
                className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                style={{ background: '#AACC00', color: '#0118A1' }}>
                {submitting
                  ? <><div className="w-4 h-4 border-2 border-[#0118A1] border-t-transparent rounded-full animate-spin" />Submitting…</>
                  : <><ShieldCheck size={15} />{existing ? 'Update declaration' : 'Submit health declaration'}</>}
              </button>
              <button type="button" onClick={() => navigate('/itinerary')}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                Cancel
              </button>
            </div>

          </form>
        </div>
      </div>
    </Layout>
  )
}
