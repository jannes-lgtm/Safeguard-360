import { useEffect, useState, useRef } from 'react'
import {
  Globe, FileText, CheckCircle2, AlertTriangle, Clock,
  DollarSign, ChevronRight, Printer, Loader2, Search,
  Briefcase, User, Building2, Calendar, Info, X,
  AlertCircle, Shield, Plane,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { cityToCountry } from '../data/intelData'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const inputClass  = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent bg-white'
const labelClass  = 'block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide'
const selectClass = inputClass

const TRAVEL_PURPOSES = [
  { value: 'Tourism',   label: 'Tourism / Holiday',    icon: '🏖️' },
  { value: 'Business',  label: 'Business',              icon: '💼' },
  { value: 'Medical',   label: 'Medical Treatment',     icon: '🏥' },
  { value: 'Transit',   label: 'Transit',               icon: '✈️' },
  { value: 'Study',     label: 'Study / Education',     icon: '🎓' },
  { value: 'Other',     label: 'Other',                 icon: '📋' },
]

const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Angola','Argentina','Armenia','Australia','Austria',
  'Azerbaijan','Bahrain','Bangladesh','Belarus','Belgium','Bolivia','Bosnia and Herzegovina',
  'Botswana','Brazil','Bulgaria','Burkina Faso','Cambodia','Cameroon','Canada','Central African Republic',
  'Chad','Chile','China','Colombia','Croatia','Cuba','Czech Republic','Democratic Republic of Congo',
  'Denmark','Ecuador','Egypt','Estonia','Ethiopia','Finland','France','Georgia','Germany',
  'Ghana','Greece','Guatemala','Guinea','Haiti','Hungary','India','Indonesia','Iran','Iraq',
  'Ireland','Israel','Italy','Japan','Jordan','Kazakhstan','Kenya','Kuwait','Kyrgyzstan',
  'Laos','Latvia','Lebanon','Libya','Lithuania','Malaysia','Mali','Mauritania','Mexico',
  'Moldova','Morocco','Mozambique','Myanmar','Namibia','Nepal','Netherlands','New Zealand',
  'Niger','Nigeria','North Korea','Norway','Oman','Pakistan','Palestine','Panama','Peru',
  'Philippines','Poland','Portugal','Qatar','Romania','Russia','Rwanda','Saudi Arabia',
  'Senegal','Serbia','Sierra Leone','Singapore','Slovakia','Slovenia','Somalia','South Africa',
  'South Korea','South Sudan','Spain','Sri Lanka','Sudan','Sweden','Switzerland','Syria',
  'Taiwan','Tajikistan','Tanzania','Thailand','Tunisia','Turkey','Turkmenistan','Uganda',
  'Ukraine','United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan',
  'Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
]

function VisaRequirementBadge({ visaRequired }) {
  if (visaRequired === false || visaRequired === 'false') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
        style={{ background: '#ECFDF5', color: '#059669', border: '1px solid #BBF7D0' }}>
        <CheckCircle2 size={15} /> No Visa Required
      </div>
    )
  }
  if (visaRequired === true || visaRequired === 'true') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
        style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
        <AlertCircle size={15} /> Visa Required
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
      style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>
      <Info size={15} /> Depends on Circumstances
    </div>
  )
}

// ── Visa Check Tab ────────────────────────────────────────────────────────────
function VisaCheckTab({ profile, trips }) {
  const [passportCountry,    setPassportCountry]    = useState(profile?.nationality || '')
  const [destinationCountry, setDestinationCountry] = useState('')
  const [travelPurpose,      setTravelPurpose]      = useState(
    profile?.org_id ? 'Business' : 'Tourism'
  )
  const [loading,       setLoading]       = useState(false)
  const [result,        setResult]        = useState(null)
  const [error,         setError]         = useState('')

  const handleCheck = async () => {
    if (!passportCountry || !destinationCountry) {
      setError('Please select both your passport country and destination.'); return
    }
    setError('')
    setLoading(true)
    setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/visa-check', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          passportCountry,
          destinationCountry,
          travelPurpose,
          travelerName: profile?.full_name,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Check failed')
      setResult(data.requirements)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      {/* Form */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 mb-5">Check Visa Requirements</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div>
            <label className={labelClass}>My Passport / Nationality *</label>
            <select className={selectClass} value={passportCountry} onChange={e => setPassportCountry(e.target.value)}>
              <option value="">Select country…</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Destination Country *</label>
            <select className={selectClass} value={destinationCountry} onChange={e => setDestinationCountry(e.target.value)}>
              <option value="">Select destination…</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Purpose selector */}
        <div className="mb-5">
          <label className={labelClass}>Purpose of Travel</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TRAVEL_PURPOSES.map(p => (
              <button key={p.value}
                onClick={() => setTravelPurpose(p.value)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all"
                style={travelPurpose === p.value
                  ? { background: `${BRAND_BLUE}10`, border: `1.5px solid ${BRAND_BLUE}`, color: BRAND_BLUE }
                  : { background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#64748B' }}>
                <span>{p.icon}</span> {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pre-fill from trip */}
        {trips.length > 0 && (
          <div className="mb-5 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-xs font-semibold text-blue-700 mb-2">Pre-fill from a booked trip:</p>
            <div className="flex flex-wrap gap-2">
              {trips.map(t => (
                <button key={t.id}
                  onClick={() => setDestinationCountry(t._country || destinationCountry)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-700 font-medium hover:bg-blue-50 transition-colors">
                  ✈️ {t.trip_name} → {t._country}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertTriangle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <button onClick={handleCheck} disabled={loading || !passportCountry || !destinationCountry}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
          style={{ background: BRAND_BLUE, color: 'white' }}>
          {loading
            ? <><Loader2 size={15} className="animate-spin" /> Checking…</>
            : <><Search size={15} /> Check Visa Requirements</>}
        </button>
      </div>

      {/* Result */}
      {loading && (
        <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin" style={{ color: BRAND_BLUE }} />
          <p className="text-sm text-gray-500">Checking visa requirements…</p>
        </div>
      )}

      {result && !loading && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 flex items-start justify-between flex-wrap gap-3"
            style={{ background: `${BRAND_BLUE}06`, borderBottom: `1px solid ${BRAND_BLUE}12` }}>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                {passportCountry} → {destinationCountry} · {travelPurpose}
              </p>
              <h3 className="text-base font-bold text-gray-900">{result.visaType}</h3>
              <p className="text-sm text-gray-500 mt-1">{result.summary}</p>
            </div>
            <VisaRequirementBadge visaRequired={result.visaRequired} />
          </div>

          {/* Warning */}
          {result.warningLevel && result.warningLevel !== 'none' && result.warning && (
            <div className="mx-6 mt-5 flex items-start gap-3 px-4 py-3 rounded-xl"
              style={{ background: result.warningLevel === 'important' ? '#FEF2F2' : '#FFFBEB',
                       border: `1px solid ${result.warningLevel === 'important' ? '#FECACA' : '#FDE68A'}` }}>
              <AlertTriangle size={15} className="shrink-0 mt-0.5"
                style={{ color: result.warningLevel === 'important' ? '#DC2626' : '#D97706' }} />
              <p className="text-xs leading-relaxed"
                style={{ color: result.warningLevel === 'important' ? '#B91C1C' : '#92400E' }}>
                {result.warning}
              </p>
            </div>
          )}

          {/* Key stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100 mx-6 mt-5 rounded-xl overflow-hidden">
            {[
              { icon: Clock,      label: 'Processing Time', value: result.processingTime },
              { icon: DollarSign, label: 'Estimated Cost',  value: result.estimatedCost  },
              { icon: Calendar,   label: 'Max Stay',        value: result.maxStay        },
              { icon: Globe,      label: 'Validity',        value: result.validity        },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-white p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={11} style={{ color: BRAND_BLUE }} />
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</span>
                </div>
                <p className="text-sm font-semibold text-gray-800">{value || '—'}</p>
              </div>
            ))}
          </div>

          {/* Documents */}
          {result.documents?.length > 0 && (
            <div className="px-6 py-5">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Required Documents</h4>
              <ul className="space-y-2">
                {result.documents.map((doc, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-500" />
                    {doc}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Notes + embassy tip */}
          {(result.notes || result.embassyTip) && (
            <div className="px-6 pb-5 space-y-3">
              {result.notes && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
                  <Info size={14} className="shrink-0 mt-0.5 text-blue-500" />
                  <p className="text-xs text-blue-800 leading-relaxed">{result.notes}</p>
                </div>
              )}
              {result.embassyTip && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200">
                  <Building2 size={14} className="shrink-0 mt-0.5 text-gray-400" />
                  <p className="text-xs text-gray-600 leading-relaxed">{result.embassyTip}</p>
                </div>
              )}
            </div>
          )}

          <div className="px-6 pb-5">
            <p className="text-[10px] text-gray-400">
              Powered by Claude AI · Always verify with the official embassy or consulate before applying.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Visa Letter Tab ───────────────────────────────────────────────────────────
function VisaLetterTab({ profile, trips, orgProfile }) {
  const isOrg = !!profile?.org_id

  // Form state
  const [selectedTripId, setSelectedTripId] = useState('')
  const [passportCountry,    setPassportCountry]    = useState(profile?.nationality || '')
  const [destinationCountry, setDestinationCountry] = useState('')
  const [travelPurpose,      setTravelPurpose]      = useState(isOrg ? 'Business' : 'Tourism')
  const [tripName,      setTripName]      = useState('')
  const [departDate,    setDepartDate]    = useState('')
  const [returnDate,    setReturnDate]    = useState('')
  const [departTime,    setDepartTime]    = useState('')
  const [returnTime,    setReturnTime]    = useState('')
  const [flightOut,     setFlightOut]     = useState('')
  const [flightBack,    setFlightBack]    = useState('')
  const [accommodation, setAccommodation] = useState('')

  // Manager details (pre-filled from profile for org travellers)
  const [managerName,  setManagerName]  = useState(profile?.manager_name  || '')
  const [managerTitle, setManagerTitle] = useState(profile?.manager_title || '')
  const [managerEmail, setManagerEmail] = useState(profile?.manager_email || '')
  const [managerPhone, setManagerPhone] = useState(profile?.manager_phone || '')

  const [loading,     setLoading]     = useState(false)
  const [letterText,  setLetterText]  = useState('')
  const [error,       setError]       = useState('')
  const letterRef = useRef(null)

  // Pre-fill from selected trip
  const onTripSelect = (tripId) => {
    setSelectedTripId(tripId)
    const trip = trips.find(t => t.id === tripId)
    if (trip) {
      setTripName(trip.trip_name || '')
      setDepartDate(trip.depart_date || '')
      setReturnDate(trip.return_date || '')
      setDestinationCountry(trip._country || '')
    }
  }

  const handleGenerate = async () => {
    if (!passportCountry || !destinationCountry || !departDate || !returnDate) {
      setError('Please fill in passport country, destination, and travel dates.'); return
    }
    if (isOrg && !managerName) {
      setError('Please enter your line manager\'s name.'); return
    }
    setError('')
    setLoading(true)
    setLetterText('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/visa-letter', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          tripId:    selectedTripId || null,
          passportCountry,
          destinationCountry,
          travelPurpose,
          tripName,
          departDate,
          returnDate,
          departTime,
          returnTime,
          flightOut,
          flightBack,
          accommodation,
          traveler: {
            name:        profile?.full_name || '',
            passport:    profile?.passport_number || '',
            nationality: profile?.nationality || passportCountry,
            jobTitle:    profile?.job_title || '',
          },
          organisation: isOrg ? {
            id:        orgProfile?.id || null,
            name:      orgProfile?.name || '',
            address:   orgProfile?.address || '',
            phone:     orgProfile?.emergency_number || orgProfile?.phone || '',
            email:     orgProfile?.security_email || orgProfile?.email || '',
            regNumber: orgProfile?.reg_number || '',
          } : null,
          manager: isOrg ? {
            name:  managerName,
            title: managerTitle,
            email: managerEmail,
            phone: managerPhone,
          } : null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Letter generation failed')
      setLetterText(data.letterText)
      setTimeout(() => letterRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  const handlePrint = () => {
    const w = window.open('', '_blank')
    w.document.write(`
      <!DOCTYPE html><html><head>
        <title>Visa Support Letter</title>
        <style>
          body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.6;
                 max-width: 700px; margin: 60px auto; padding: 0 40px; color: #111; }
          pre { white-space: pre-wrap; font-family: inherit; font-size: 12pt; }
          @media print { body { margin: 0; padding: 40px; } }
        </style>
      </head><body>
        <pre>${letterText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
      </body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  return (
    <div className="space-y-6">
      {/* Form */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 mb-5">Generate Visa Support Letter</h2>

        {/* Pre-fill from trip */}
        {trips.length > 0 && (
          <div className="mb-5">
            <label className={labelClass}>Pre-fill from a booked trip (optional)</label>
            <select className={selectClass} value={selectedTripId} onChange={e => onTripSelect(e.target.value)}>
              <option value="">Select a trip…</option>
              {trips.map(t => (
                <option key={t.id} value={t.id}>{t.trip_name} — {t._country} ({t.depart_date})</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelClass}>Passport Country *</label>
            <select className={selectClass} value={passportCountry} onChange={e => setPassportCountry(e.target.value)}>
              <option value="">Select…</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Destination Country *</label>
            <select className={selectClass} value={destinationCountry} onChange={e => setDestinationCountry(e.target.value)}>
              <option value="">Select…</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Purpose of Travel</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TRAVEL_PURPOSES.map(p => (
                <button key={p.value} type="button"
                  onClick={() => setTravelPurpose(p.value)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all"
                  style={travelPurpose === p.value
                    ? { background: `${BRAND_BLUE}10`, border: `1.5px solid ${BRAND_BLUE}`, color: BRAND_BLUE }
                    : { background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#64748B' }}>
                  <span>{p.icon}</span> {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelClass}>Trip / Visit Name</label>
            <input className={inputClass} placeholder="e.g. Business meeting — Nairobi"
              value={tripName} onChange={e => setTripName(e.target.value)} />
          </div>
          <div />
          <div>
            <label className={labelClass}>Departure Date *</label>
            <input className={inputClass} type="date" value={departDate} onChange={e => setDepartDate(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Return Date *</label>
            <input className={inputClass} type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Departure Time</label>
            <input className={inputClass} placeholder="e.g. 08:30" value={departTime} onChange={e => setDepartTime(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Return Time</label>
            <input className={inputClass} placeholder="e.g. 19:45" value={returnTime} onChange={e => setReturnTime(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Outbound Flight (optional)</label>
            <input className={inputClass} placeholder="e.g. SA 405" value={flightOut} onChange={e => setFlightOut(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Return Flight (optional)</label>
            <input className={inputClass} placeholder="e.g. SA 406" value={flightBack} onChange={e => setFlightBack(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Accommodation (optional)</label>
            <input className={inputClass} placeholder="e.g. Radisson Blu Hotel, Nairobi"
              value={accommodation} onChange={e => setAccommodation(e.target.value)} />
          </div>
        </div>

        {/* Line Manager section — org travellers only */}
        {isOrg && (
          <div className="mt-2 pt-5 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <Briefcase size={14} style={{ color: BRAND_BLUE }} />
              <h3 className="text-sm font-bold text-gray-800">Line Manager / Signatory</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Full Name *</label>
                <input className={inputClass} placeholder="Sarah Jones"
                  value={managerName} onChange={e => setManagerName(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Job Title</label>
                <input className={inputClass} placeholder="HR Manager"
                  value={managerTitle} onChange={e => setManagerTitle(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input className={inputClass} type="email" placeholder="manager@company.com"
                  value={managerEmail} onChange={e => setManagerEmail(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input className={inputClass} type="tel" placeholder="+27 11 000 0000"
                  value={managerPhone} onChange={e => setManagerPhone(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertTriangle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <button onClick={handleGenerate} disabled={loading}
          className="mt-5 flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
          style={{ background: BRAND_BLUE, color: 'white' }}>
          {loading
            ? <><Loader2 size={15} className="animate-spin" /> Generating letter…</>
            : <><FileText size={15} /> Generate Letter</>}
        </button>
      </div>

      {/* Generated letter */}
      {letterText && (
        <div ref={letterRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100"
            style={{ background: `${BRAND_GREEN}15` }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} style={{ color: '#059669' }} />
              <span className="text-sm font-bold text-gray-900">Visa Support Letter Generated</span>
            </div>
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{ background: BRAND_BLUE, color: 'white' }}>
              <Printer size={14} /> Print / Save PDF
            </button>
          </div>
          <div className="p-6 md:p-8">
            <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-serif">
              {letterText}
            </pre>
          </div>
          <div className="px-6 pb-5">
            <p className="text-[10px] text-gray-400">
              Generated by SafeGuard360 · Always have the letter signed by the named person before submission.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Visa() {
  const [tab,        setTab]        = useState('check')
  const [profile,    setProfile]    = useState(null)
  const [orgProfile, setOrgProfile] = useState(null)
  const [trips,      setTrips]      = useState([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const today = new Date().toISOString().split('T')[0]

      const [{ data: prof }, { data: itins }] = await Promise.all([
        supabase.from('profiles').select('*, organisations(*)').eq('id', session.user.id).single(),
        supabase.from('itineraries').select('*').eq('user_id', session.user.id)
          .gte('return_date', today).order('depart_date'),
      ])

      if (prof) {
        setProfile(prof)
        if (prof.organisations) setOrgProfile(prof.organisations)
      }

      setTrips((itins || []).map(t => ({
        ...t,
        _country: cityToCountry(t.arrival_city) || t.arrival_city,
      })))

      setLoading(false)
    }
    load()
  }, [])

  const TABS = [
    { id: 'check',  label: 'Visa Requirements', icon: Search   },
    { id: 'letter', label: 'Support Letter',     icon: FileText },
  ]

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${BRAND_BLUE}12` }}>
            <Globe size={18} style={{ color: BRAND_BLUE }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Visa Assistant</h1>
            <p className="text-sm text-gray-400">AI-powered visa requirements check and support letter generator</p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-600" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Visa requirements change frequently. Always verify current requirements with the official embassy or consulate of your destination country before applying.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={tab === t.id
                ? { background: BRAND_BLUE, color: '#fff', boxShadow: '0 2px 8px rgba(1,24,161,0.2)' }
                : { color: '#374151' }}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin" style={{ color: BRAND_BLUE }} />
        </div>
      ) : (
        <>
          {tab === 'check'  && <VisaCheckTab  profile={profile} trips={trips} />}
          {tab === 'letter' && <VisaLetterTab profile={profile} trips={trips} orgProfile={orgProfile} />}
        </>
      )}
    </Layout>
  )
}
