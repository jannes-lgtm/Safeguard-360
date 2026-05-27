import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Heart, CheckCircle2, AlertTriangle, Loader2, ChevronDown, ChevronUp,
  ShieldCheck, Syringe, ActivitySquare, Phone, FileText, Info, RefreshCw,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { resolveCountry } from '../lib/cityToCountry'
import { DS } from '../lib/ds'

const inputCls = 'w-full rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(170,204,0,0.35)] focus:border-transparent bg-[#0A0F1C] border border-[rgba(255,255,255,0.1)] text-[#F1F5F9] placeholder-[#475569]'
const labelCls = 'block text-xs font-semibold mb-1.5 uppercase tracking-wide text-[#64748B]'

const SEV_COLOR = { High: '#F87171', Medium: '#FBBF24', Low: '#34D399' }
const CAT_COLOR = { required: '#F87171', recommended: '#60A5FA', consider: '#94A3B8' }
const CAT_BG    = { required: 'rgba(239,68,68,0.12)', recommended: 'rgba(59,130,246,0.12)', consider: 'rgba(148,163,184,0.1)' }
const VAX_STATUS_OPTIONS = ['Completed', 'Scheduled', 'Not applicable']

export default function HealthDeclaration() {
  const { tripId } = useParams()
  const navigate   = useNavigate()

  const [trip, setTrip]         = useState(null)
  const [existing, setExisting] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')

  // AI requirements
  const [reqs, setReqs]               = useState(null)
  const [reqsLoading, setReqsLoading] = useState(false)
  const [reqsError, setReqsError]     = useState('')
  const [showRisks, setShowRisks]     = useState(true)

  // Form
  const [fitToTravel, setFitToTravel]   = useState(false)
  const [vaxStatuses, setVaxStatuses]   = useState({})
  const [hasMedical, setHasMedical]     = useState(false)
  const [medicalDetails, setMedicalDetails] = useState('')
  const [hasMeds, setHasMeds]           = useState(false)
  const [medsDetails, setMedsDetails]   = useState('')
  const [hasAllergies, setHasAllergies] = useState(false)
  const [allergyDetails, setAllergyDetails] = useState('')
  const [emergencyName, setEmergencyName]     = useState('')
  const [emergencyPhone, setEmergencyPhone]   = useState('')
  const [emergencyRelation, setEmergencyRelation] = useState('')
  const [insuranceConfirmed, setInsuranceConfirmed] = useState(false)
  const [notes, setNotes]               = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [submitted, setSubmitted]       = useState(false)
  const [editing, setEditing]           = useState(false)  // true = show edit form when existing
  const [error, setError]               = useState('')

  const fetchReqs = useCallback(async (tripData, existingDec) => {
    setReqsLoading(true)
    setReqsError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resolvedCountry = resolveCountry(tripData.arrival_city) || tripData.arrival_city
      const res = await fetch('/api/health-requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          destination: tripData.arrival_city,
          country: resolvedCountry,
          depart_date: tripData.depart_date,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setReqs(data)
        if (!existingDec && data.vaccinations?.length) {
          const initial = {}
          data.vaccinations.forEach(v => { initial[v.name] = 'Not applicable' })
          setVaxStatuses(initial)
        }
      } else {
        setReqsError('Could not load live health requirements.')
      }
    } catch {
      setReqsError('Could not load live health requirements.')
    }
    setReqsLoading(false)
  }, [])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { navigate('/login'); return }

        const { data: tripData } = await supabase
          .from('itineraries').select('*').eq('id', tripId).eq('user_id', user.id).maybeSingle()
        if (!tripData) { setLoadError('Trip not found.'); setLoading(false); return }
        setTrip(tripData)

        const { data: dec } = await supabase
          .from('pre_travel_health').select('*').eq('trip_id', tripId).eq('user_id', user.id).maybeSingle()
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

        setLoading(false)
        await fetchReqs(tripData, dec)
      } catch {
        setLoadError('Something went wrong. Please try again.')
        setLoading(false)
      }
    }
    init()
  }, [tripId, navigate, fetchReqs])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!fitToTravel) { setError('Please confirm you are medically fit to travel.'); return }
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', user.id).maybeSingle()
      const payload = {
        trip_id: tripId,
        user_id: user.id,
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
        const { error: updateErr } = await supabase
          .from('pre_travel_health').update(payload).eq('id', existing.id)
        if (updateErr) throw new Error(updateErr.message)
      } else {
        // Use upsert on (trip_id, user_id) so a duplicate submit doesn't create a
        // second row — handles the edge-case where the user double-taps the button.
        const { error: upsertErr } = await supabase
          .from('pre_travel_health')
          .upsert(payload, { onConflict: 'trip_id,user_id' })
        if (upsertErr) {
          // Fallback: upsert may fail if the unique constraint doesn't exist yet —
          // try a plain insert so at least new records are created correctly.
          const { error: insertErr } = await supabase
            .from('pre_travel_health').insert(payload)
          if (insertErr) throw new Error(insertErr.message)
        }
      }
      setSubmitted(true)
      setEditing(false)
    } catch (err) {
      setError(err.message || 'Submission failed. Please try again.')
    }
    setSubmitting(false)
  }

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-[#AACC00]" />
      </div>
    </Layout>
  )

  if (loadError) return (
    <Layout>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertTriangle size={32} className="text-red-400 mb-3" />
        <p className="text-gray-600">{loadError}</p>
        <button onClick={() => navigate('/itinerary')} className="mt-4 text-sm font-semibold underline" style={{ color: '#AACC00' }}>Back to itinerary</button>
      </div>
    </Layout>
  )

  // Completed view — shown when navigating back to an already-submitted declaration
  // (without clicking Edit), OR immediately after a fresh submission this session.
  if (submitted || (existing && !editing)) return (
    <Layout>
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: DS.greenDim }}>
          <ShieldCheck size={30} className="text-[#AACC00]" />
        </div>
        <h1 className="text-xl font-bold mb-2" style={{ color: DS.text || '#F1F5F9' }}>Health declaration submitted</h1>
        {existing?.submitted_at && (
          <p className="text-xs mb-1" style={{ color: '#64748B' }}>
            Submitted {new Date(existing.submitted_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        )}
        <p className="text-sm mb-8" style={{ color: '#94A3B8' }}>
          Your pre-travel health declaration for <strong style={{ color: '#F1F5F9' }}>{trip?.trip_name}</strong> has been recorded. Travel safely.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={() => navigate('/itinerary')}
            className="px-6 py-3 rounded-xl text-sm font-bold"
            style={{ background: DS.green, color: '#090A0C' }}>
            Back to my itinerary →
          </button>
          <button onClick={() => setEditing(true)}
            className="px-6 py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8' }}>
            Update declaration
          </button>
        </div>
      </div>
    </Layout>
  )

  const aiLoaded = !!reqs && !reqsError

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => navigate('/itinerary')} className="text-xs hover:underline" style={{ color: '#64748B' }}>My Itinerary</button>
          <span style={{ color: '#475569' }}>›</span>
          <span className="text-xs" style={{ color: '#475569' }}>Health Declaration</span>
        </div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#F1F5F9' }}>
          <Heart size={20} color="#F87171" />
          Pre-Travel Health Declaration
        </h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
          {trip?.trip_name}{trip?.arrival_city && trip?.arrival_city !== trip?.trip_name ? ` · ${trip.arrival_city}` : ''} · {trip?.depart_date}
        </p>
        {existing && (
          <span className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-[#AACC00] bg-[rgba(170,204,0,0.10)] border border-[rgba(170,204,0,0.25)] px-3 py-1 rounded-full">
            <CheckCircle2 size={11} /> Previously submitted — you can update and resubmit
          </span>
        )}
      </div>

      {/* AI Intel strip — full width, above the form */}
      <div className="mb-5">
        {/* Vaccination Requirements */}
        <div className="rounded-2xl overflow-hidden" style={{ background: '#0D1220', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(1,24,161,0.08)' }}>
            <Syringe size={15} color="#60A5FA" />
            <h2 className="text-sm font-bold flex-1" style={{ color: '#F1F5F9' }}>Vaccination Requirements</h2>
            {reqsLoading && (
              <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.12)', color: '#60A5FA' }}>
                <Loader2 size={9} className="animate-spin" /> Loading…
              </span>
            )}
            {aiLoaded && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.12)', color: '#60A5FA' }}>AI · Live</span>
            )}
            {reqsError && !reqsLoading && (
              <button onClick={() => trip && fetchReqs(trip, existing)}
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(144,106,37,0.12)] text-[#D4A64A] hover:bg-amber-100 transition-colors">
                <RefreshCw size={9} /> Retry
              </button>
            )}
          </div>

          {reqsLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm" style={{ color: '#64748B' }}>
              <Loader2 size={16} className="animate-spin" /> Fetching live requirements from WHO / Africa CDC…
            </div>
          ) : reqsError ? (
            <div className="px-5 py-4 flex items-center gap-3">
              <AlertTriangle size={14} className="shrink-0" style={{ color: '#FBBF24' }} />
              <p className="text-xs text-[#D4A64A]">Live health data unavailable — complete vaccination status below manually if needed.</p>
            </div>
          ) : reqs?.vaccinations?.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              {reqs.vaccinations.map(vax => (
                <div key={vax.name} className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className="text-xs font-bold" style={{ color: '#F1F5F9' }}>{vax.name}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase"
                          style={{ background: CAT_BG[vax.category], color: CAT_COLOR[vax.category] }}>
                          {vax.category}
                        </span>
                      </div>
                      {vax.notes && <p className="text-[11px] leading-snug" style={{ color: '#64748B' }}>{vax.notes}</p>}
                    </div>
                  </div>
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
                          : { background: 'rgba(255,255,255,0.04)', color: '#64748B', borderColor: 'rgba(255,255,255,0.1)' }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-4 text-xs" style={{ color: '#64748B' }}>No specific vaccination requirements found for this destination.</p>
          )}
        </div>

        {/* Health Risks — collapsible, only when AI data loaded */}
        {aiLoaded && reqs?.health_risks?.length > 0 && (
          <div className="rounded-2xl overflow-hidden mt-3" style={{ background: '#0D1220', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={() => setShowRisks(p => !p)}
              className="w-full flex items-center gap-2 px-5 py-4 transition-colors"
              style={{ background: 'rgba(217,119,6,0.06)' }}>
              <ActivitySquare size={15} color="#FBBF24" />
              <h2 className="text-sm font-bold flex-1 text-left" style={{ color: '#F1F5F9' }}>
                Current Health Risks — {reqs.health_risks.length} identified
              </h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full mr-1" style={{ background: 'rgba(144,106,37,0.15)', color: '#D4A64A' }}>AI · Live</span>
              {showRisks ? <ChevronUp size={13} style={{ color: '#64748B' }} /> : <ChevronDown size={13} style={{ color: '#64748B' }} />}
            </button>
            {showRisks && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                {reqs.health_risks.map((risk, i) => (
                  <div key={i} className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SEV_COLOR[risk.severity] }} />
                      <span className="text-xs font-bold flex-1" style={{ color: '#F1F5F9' }}>{risk.name}</span>
                      <span className="text-[10px] font-semibold" style={{ color: SEV_COLOR[risk.severity] }}>{risk.severity}</span>
                    </div>
                    <p className="text-[11px] leading-snug mb-1.5" style={{ color: '#94A3B8' }}>{risk.description}</p>
                    {risk.prevention && (
                      <p className="text-[11px] text-[#AACC00] bg-[rgba(170,204,0,0.10)] rounded-lg px-2.5 py-1.5">{risk.prevention}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* General advice */}
        {aiLoaded && reqs?.general_advice && (
          <div className="mt-3 rounded-2xl px-5 py-4 flex gap-3" style={{ background: 'rgba(1,24,161,0.12)', border: '1px solid rgba(1,24,161,0.3)' }}>
            <Info size={14} color="#60A5FA" className="shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold mb-1" style={{ color: '#93C5FD' }}>General Health Advice</p>
              <p className="text-xs leading-relaxed" style={{ color: '#94A3B8' }}>{reqs.general_advice}</p>
              {reqs.sources?.length > 0 && (
                <p className="text-[10px] mt-1.5" style={{ color: '#475569' }}>Sources: {reqs.sources.join(', ')}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Declaration Form */}
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Fitness to travel */}
        <div className="rounded-2xl p-5" style={{ background: '#0D1220', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: '#F1F5F9' }}>
            <ShieldCheck size={15} color="#AACC00" /> Medical Fitness to Travel
          </h2>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={fitToTravel} onChange={e => setFitToTravel(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-[#AACC00]" />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>I confirm I am medically fit to travel</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#64748B' }}>
                I have no known medical condition that would prevent or significantly impair safe travel to {trip?.arrival_city}.
                I accept responsibility to disclose any condition that may require emergency medical assistance.
              </p>
            </div>
          </label>
        </div>

        {/* Medical history */}
        <div className="rounded-2xl p-5" style={{ background: '#0D1220', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-sm font-bold mb-5 flex items-center gap-2" style={{ color: '#F1F5F9' }}>
            <ActivitySquare size={15} color="#60A5FA" /> Medical History
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Chronic conditions */}
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: '#94A3B8' }}>Chronic or ongoing medical conditions?</p>
              <div className="flex gap-2 mb-2">
                {['Yes', 'No'].map(opt => (
                  <button key={opt} type="button" onClick={() => setHasMedical(opt === 'Yes')}
                    className="px-4 py-1.5 rounded-xl text-sm font-semibold border transition-all"
                    style={hasMedical === (opt === 'Yes')
                      ? { background: '#AACC00', color: '#090A0C', borderColor: '#AACC00' }
                      : { background: 'rgba(255,255,255,0.04)', color: '#64748B', borderColor: 'rgba(255,255,255,0.1)' }}>
                    {opt}
                  </button>
                ))}
              </div>
              {hasMedical && (
                <textarea className={`${inputCls} resize-none`} rows={3}
                  placeholder="e.g. Type 2 diabetes, asthma…"
                  value={medicalDetails} onChange={e => setMedicalDetails(e.target.value)} />
              )}
            </div>

            {/* Medications */}
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: '#94A3B8' }}>Currently taking prescription medications?</p>
              <div className="flex gap-2 mb-2">
                {['Yes', 'No'].map(opt => (
                  <button key={opt} type="button" onClick={() => setHasMeds(opt === 'Yes')}
                    className="px-4 py-1.5 rounded-xl text-sm font-semibold border transition-all"
                    style={hasMeds === (opt === 'Yes')
                      ? { background: '#AACC00', color: '#090A0C', borderColor: '#AACC00' }
                      : { background: 'rgba(255,255,255,0.04)', color: '#64748B', borderColor: 'rgba(255,255,255,0.1)' }}>
                    {opt}
                  </button>
                ))}
              </div>
              {hasMeds && (
                <textarea className={`${inputCls} resize-none`} rows={3}
                  placeholder="e.g. Metformin 500mg, Ventolin…"
                  value={medsDetails} onChange={e => setMedsDetails(e.target.value)} />
              )}
            </div>

            {/* Allergies */}
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: '#94A3B8' }}>Any known allergies?</p>
              <div className="flex gap-2 mb-2">
                {['Yes', 'No'].map(opt => (
                  <button key={opt} type="button" onClick={() => setHasAllergies(opt === 'Yes')}
                    className="px-4 py-1.5 rounded-xl text-sm font-semibold border transition-all"
                    style={hasAllergies === (opt === 'Yes')
                      ? { background: '#AACC00', color: '#090A0C', borderColor: '#AACC00' }
                      : { background: 'rgba(255,255,255,0.04)', color: '#64748B', borderColor: 'rgba(255,255,255,0.1)' }}>
                    {opt}
                  </button>
                ))}
              </div>
              {hasAllergies && (
                <textarea className={`${inputCls} resize-none`} rows={3}
                  placeholder="e.g. Penicillin, peanuts, latex…"
                  value={allergyDetails} onChange={e => setAllergyDetails(e.target.value)} />
              )}
            </div>
          </div>
        </div>

        {/* Emergency medical contact */}
        <div className="rounded-2xl p-5" style={{ background: '#0D1220', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-sm font-bold mb-1 flex items-center gap-2" style={{ color: '#F1F5F9' }}>
            <Phone size={15} color="#60A5FA" /> In-Country Emergency Medical Contact
          </h2>
          <p className="text-xs mb-4" style={{ color: '#64748B' }}>A local contact who can assist in a medical emergency (doctor, local host, colleague).</p>
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

        {/* Final declarations */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: '#0D1220', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: '#F1F5F9' }}>
            <FileText size={15} color="#60A5FA" /> Final Declarations
          </h2>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={insuranceConfirmed} onChange={e => setInsuranceConfirmed(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-[#AACC00]" />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>I have valid travel insurance for this trip</p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Including medical evacuation and emergency hospitalisation cover.</p>
            </div>
          </label>
          <div>
            <label className={labelCls}>Additional notes (optional)</label>
            <textarea className={`${inputCls} resize-none`} rows={3}
              placeholder="Any other health information relevant to this trip…"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-[rgba(138,46,46,0.12)] border border-[rgba(138,46,46,0.30)] rounded-xl text-sm text-[#EF7474]">
            <AlertTriangle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="flex items-center gap-3 pb-6">
          <button type="submit" disabled={submitting}
            className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
            style={{ background: '#AACC00', color: DS.bg }}>
            {submitting
              ? <><div className="w-4 h-4 border-2 border-[#AACC00] border-t-transparent rounded-full animate-spin" />Submitting…</>
              : <><ShieldCheck size={15} />{existing ? 'Update declaration' : 'Submit health declaration'}</>}
          </button>
          <button type="button" onClick={() => navigate('/itinerary')}
            className="text-sm transition-colors" style={{ color: '#64748B' }}>
            Cancel
          </button>
        </div>

      </form>
    </Layout>
  )
}
