import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const BRAND_BLUE = '#0118A1'
const BRAND_LIME = '#AACC00'

const RISK_BADGE = {
  Critical: { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' },
  High:     { bg: '#FFF7ED', text: '#92400E', border: '#FED7AA' },
  Medium:   { bg: '#FFFBEB', text: '#78350F', border: '#FDE68A' },
  Low:      { bg: '#F0FDF4', text: '#14532D', border: '#BBF7D0' },
}

function StarRating({ value, onChange, label, sublabel }) {
  const [hovered, setHovered] = useState(0)

  return (
    <div className="py-1">
      <p className="text-sm font-semibold text-gray-800 mb-0.5">{label}</p>
      {sublabel && <p className="text-xs text-gray-400 mb-3">{sublabel}</p>}
      <div className="flex items-center gap-2" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n !== 1 ? 's' : ''}`}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => onChange(n)}
            style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                fill={(hovered || value) >= n ? '#F59E0B' : 'none'}
                stroke={(hovered || value) >= n ? '#F59E0B' : '#D1D5DB'}
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ))}
        {value > 0 && (
          <span className="text-xs text-gray-400 ml-1">{value}/5</span>
        )}
      </div>
    </div>
  )
}

function IncidentToggle({ question, subtext, value, onChange, detailsValue, onDetailsChange, detailsPlaceholder }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <p className="text-sm font-semibold text-gray-800 mb-0.5">{question}</p>
      {subtext && <p className="text-xs text-gray-400 mb-4">{subtext}</p>}
      <div className="flex gap-3 mb-0">
        <button
          type="button"
          onClick={() => onChange(false)}
          style={{
            minHeight: 48,
            flex: 1,
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 14,
            border: `2px solid ${value === false ? '#D1D5DB' : '#E5E7EB'}`,
            background: value === false ? '#F3F4F6' : '#FFFFFF',
            color: value === false ? '#374151' : '#9CA3AF',
            transition: 'all .15s',
            cursor: 'pointer',
          }}
        >
          No
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          style={{
            minHeight: 48,
            flex: 1,
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 14,
            border: `2px solid ${value === true ? '#EF4444' : '#E5E7EB'}`,
            background: value === true ? '#FEF2F2' : '#FFFFFF',
            color: value === true ? '#DC2626' : '#9CA3AF',
            transition: 'all .15s',
            cursor: 'pointer',
          }}
        >
          Yes
        </button>
      </div>
      {value === true && (
        <div className="mt-4">
          <textarea
            rows={3}
            placeholder={detailsPlaceholder || 'Please describe what happened…'}
            value={detailsValue}
            onChange={e => onDetailsChange(e.target.value)}
            style={{
              width: '100%',
              border: '1.5px solid #E5E7EB',
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 14,
              color: '#111827',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
            onFocus={e => { e.target.style.borderColor = BRAND_BLUE; e.target.style.boxShadow = `0 0 0 3px ${BRAND_BLUE}20` }}
            onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
          />
        </div>
      )}
    </div>
  )
}

const defaultForm = {
  had_security_incident:        false,
  security_incident_details:    '',
  had_medical_issue:            false,
  medical_issue_details:        '',
  had_transport_issue:          false,
  transport_issue_details:      '',
  overall_safety_rating:        0,
  briefing_usefulness:          0,
  risk_assessment_accuracy:     0,
  recommendations:              '',
  additional_notes:             '',
}

export default function Debrief() {
  const { tripId }            = useParams()
  const navigate              = useNavigate()
  const [loading, setLoading] = useState(true)
  const [trip, setTrip]       = useState(null)
  const [session, setSession] = useState(null)
  const [alreadyDone, setAlreadyDone] = useState(false)
  const [form, setForm]       = useState(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [ratingError, setRatingError] = useState(false)
  const [fetchError, setFetchError]   = useState(null)

  useEffect(() => {
    async function init() {
      const { data: { session: s } } = await supabase.auth.getSession()
      if (!s) { navigate('/login', { replace: true }); return }
      setSession(s)

      const { data: tripData, error: tripErr } = await supabase
        .from('itineraries')
        .select('id, trip_name, arrival_city, departure_city, depart_date, return_date, risk_level, status')
        .eq('id', tripId)
        .eq('user_id', s.user.id)
        .single()

      if (tripErr || !tripData) {
        setFetchError('Trip not found or you do not have access to it.')
        setLoading(false)
        return
      }
      setTrip(tripData)

      const { data: existing } = await supabase
        .from('trip_debriefs')
        .select('id')
        .eq('trip_id', tripId)
        .single()

      if (existing) setAlreadyDone(true)
      setLoading(false)
    }
    init()
  }, [tripId, navigate])

  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (!form.overall_safety_rating || !form.briefing_usefulness || !form.risk_assessment_accuracy) {
      setRatingError(true)
      document.getElementById('ratings-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setRatingError(false)
    setSubmitting(true)

    try {
      const res = await fetch('/api/post-travel-debrief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ trip_id: tripId, ...form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submission failed')
      setSubmitted(true)
    } catch (e) {
      alert(e.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const riskBadge = trip ? (RISK_BADGE[trip.risk_level] || RISK_BADGE.Medium) : null

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${BRAND_BLUE}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 400, textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: '#374151', marginBottom: 16 }}>{fetchError}</p>
          <button onClick={() => navigate('/itinerary')} style={{ background: BRAND_BLUE, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            Back to Itinerary
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } * { box-sizing: border-box; }`}</style>

      {/* Header bar */}
      <div style={{ background: BRAND_BLUE, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 40 }}>
        <button
          onClick={() => navigate('/itinerary')}
          style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          aria-label="Back to itinerary"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>Safeguard 360</p>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>Post-Travel Debrief</p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px 120px' }}>

        {/* Already submitted state */}
        {alreadyDone && (
          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #E5E7EB', padding: 32, textAlign: 'center', marginTop: 8 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#111827' }}>Debrief already submitted</h2>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: '#6B7280', lineHeight: 1.6 }}>
              You have already completed the post-travel debrief for this trip. Thank you for your feedback.
            </p>
            <button
              onClick={() => navigate('/itinerary')}
              style={{ background: BRAND_BLUE, color: '#fff', border: 'none', borderRadius: 14, padding: '14px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer', minHeight: 52 }}
            >
              Back to My Trips
            </button>
          </div>
        )}

        {/* Success state */}
        {submitted && !alreadyDone && (
          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #E5E7EB', padding: 32, textAlign: 'center', marginTop: 8 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#111827' }}>Thank you — your debrief has been submitted</h2>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: '#6B7280', lineHeight: 1.6 }}>
              Your feedback will help us improve safety for future travellers. Safe travels ahead.
            </p>
            <button
              onClick={() => navigate('/itinerary')}
              style={{ background: BRAND_BLUE, color: '#fff', border: 'none', borderRadius: 14, padding: '14px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer', minHeight: 52 }}
            >
              Back to My Trips
            </button>
          </div>
        )}

        {/* Form */}
        {!alreadyDone && !submitted && trip && (
          <>
            {/* Trip info card */}
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #E5E7EB', padding: '20px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.08em' }}>Trip</p>
              <p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, color: '#111827' }}>{trip.trip_name || trip.arrival_city}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {trip.departure_city && (
                  <span style={{ fontSize: 13, color: '#6B7280' }}>{trip.departure_city}</span>
                )}
                {trip.departure_city && (
                  <span style={{ fontSize: 13, color: '#D1D5DB' }}>→</span>
                )}
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{trip.arrival_city}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>{trip.depart_date} — {trip.return_date}</span>
                {trip.risk_level && riskBadge && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                    background: riskBadge.bg, color: riskBadge.text, border: `1px solid ${riskBadge.border}`,
                  }}>
                    {trip.risk_level} Risk
                  </span>
                )}
              </div>
            </div>

            {/* Section 1 — Incident Reporting */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.08em', paddingLeft: 4 }}>
                Section 1 — Incident Reporting
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <IncidentToggle
                  question="Did you experience any security incidents?"
                  subtext="e.g. crime, threats, civil unrest"
                  value={form.had_security_incident}
                  onChange={v => setField('had_security_incident', v)}
                  detailsValue={form.security_incident_details}
                  onDetailsChange={v => setField('security_incident_details', v)}
                  detailsPlaceholder="Please describe the security incident(s)…"
                />
                <IncidentToggle
                  question="Did you require any medical attention?"
                  subtext="e.g. illness, injury, hospital visit"
                  value={form.had_medical_issue}
                  onChange={v => setField('had_medical_issue', v)}
                  detailsValue={form.medical_issue_details}
                  onDetailsChange={v => setField('medical_issue_details', v)}
                  detailsPlaceholder="Please describe the medical issue(s)…"
                />
                <IncidentToggle
                  question="Were there issues with accommodation or transport?"
                  subtext="e.g. cancelled flights, unsafe vehicles, hotel problems"
                  value={form.had_transport_issue}
                  onChange={v => setField('had_transport_issue', v)}
                  detailsValue={form.transport_issue_details}
                  onDetailsChange={v => setField('transport_issue_details', v)}
                  detailsPlaceholder="Please describe the accommodation or transport issue(s)…"
                />
              </div>
            </div>

            {/* Section 2 — Ratings */}
            <div id="ratings-section" style={{ background: '#fff', borderRadius: 20, border: `1.5px solid ${ratingError ? '#EF4444' : '#E5E7EB'}`, padding: '20px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 16px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                Section 2 — Ratings
              </p>
              {ratingError && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#DC2626', fontWeight: 600 }}>Please complete all three ratings before submitting.</p>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <StarRating
                  label="How safe did you feel overall?"
                  sublabel="1 = Very unsafe — 5 = Very safe"
                  value={form.overall_safety_rating}
                  onChange={v => { setField('overall_safety_rating', v); setRatingError(false) }}
                />
                <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 20 }}>
                  <StarRating
                    label="How useful was your pre-travel briefing?"
                    sublabel="1 = Not useful — 5 = Very useful"
                    value={form.briefing_usefulness}
                    onChange={v => { setField('briefing_usefulness', v); setRatingError(false) }}
                  />
                </div>
                <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 20 }}>
                  <StarRating
                    label="How accurate was the destination risk assessment?"
                    sublabel="1 = Very inaccurate — 5 = Very accurate"
                    value={form.risk_assessment_accuracy}
                    onChange={v => { setField('risk_assessment_accuracy', v); setRatingError(false) }}
                  />
                </div>
              </div>
            </div>

            {/* Section 3 — Open Feedback */}
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #E5E7EB', padding: '20px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 16px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                Section 3 — Feedback
              </p>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Any recommendations for future travellers to this destination?
                </label>
                <textarea
                  rows={4}
                  placeholder="Safety tips, transport advice, areas to avoid…"
                  value={form.recommendations}
                  onChange={e => setField('recommendations', e.target.value)}
                  style={{
                    width: '100%', border: '1.5px solid #E5E7EB', borderRadius: 12,
                    padding: '12px 14px', fontSize: 14, color: '#111827',
                    resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                  }}
                  onFocus={e => { e.target.style.borderColor = BRAND_BLUE; e.target.style.boxShadow = `0 0 0 3px ${BRAND_BLUE}20` }}
                  onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Any other notes or feedback?
                </label>
                <textarea
                  rows={3}
                  placeholder="Anything else you would like to share…"
                  value={form.additional_notes}
                  onChange={e => setField('additional_notes', e.target.value)}
                  style={{
                    width: '100%', border: '1.5px solid #E5E7EB', borderRadius: 12,
                    padding: '12px 14px', fontSize: 14, color: '#111827',
                    resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                  }}
                  onFocus={e => { e.target.style.borderColor = BRAND_BLUE; e.target.style.boxShadow = `0 0 0 3px ${BRAND_BLUE}20` }}
                  onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sticky submit button */}
      {!alreadyDone && !submitted && trip && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'rgba(249,250,251,0.95)', backdropFilter: 'blur(8px)',
          borderTop: '1px solid #E5E7EB', padding: '12px 16px',
          zIndex: 50,
        }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              style={{
                width: '100%', minHeight: 52, borderRadius: 16,
                background: submitting ? '#C8E066' : BRAND_LIME,
                color: BRAND_BLUE, border: 'none',
                fontWeight: 800, fontSize: 16, cursor: submitting ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                transition: 'background .15s',
              }}
            >
              {submitting ? (
                <>
                  <div style={{ width: 20, height: 20, border: `3px solid ${BRAND_BLUE}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Submitting…
                </>
              ) : (
                'Submit Debrief'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
