import { useEffect, useRef, useState } from 'react'
import {
  FileText, CheckCircle2, Edit3, Eye, Users,
  MapPin, AlertTriangle, ChevronDown, Save, Loader2,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

// ── Policy document renderer ──────────────────────────────────────────────────
function Field({ value, fallback = '________________________________' }) {
  if (value) return <strong style={{ color: BRAND_BLUE }}>{value}</strong>
  return <span className="inline-block border-b-2 border-dashed border-gray-400 px-2 text-gray-400 text-sm">{fallback}</span>
}

function PolicyDocument({ config }) {
  const c = config || {}
  return (
    <div className="text-sm text-gray-700 leading-relaxed space-y-8 font-serif" style={{ fontFamily: 'Georgia, serif' }}>

      {/* Header */}
      <div className="text-center pb-6 border-b-2 border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
          Corporate Travel Risk Management Policy
        </h1>
        <p className="text-sm text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
          Organisation: <Field value={c.company_name} fallback="[Company Name]" /> &nbsp;·&nbsp;
          Version: {c.policy_version || '1.0'} &nbsp;·&nbsp;
          Effective: {c.effective_date ? new Date(c.effective_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '[Date]'}
        </p>
        <p className="text-xs text-gray-400 mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
          Prepared in accordance with ISO 31030:2021 — Travel Risk Management
        </p>
      </div>

      {/* 1 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200" style={{ fontFamily: 'Inter, sans-serif' }}>
          1. Policy Statement &amp; Purpose
        </h2>
        <p>
          <Field value={c.company_name} fallback="[Company Name]" /> ("the Company") is committed to the health, safety, and security of all employees, contractors, and authorised personnel who travel on behalf of the Company. This policy establishes the framework for managing travel-related risks in accordance with ISO 31030:2021 — Travel Risk Management.
        </p>
        <p className="mt-3">
          The Company recognises its legal duty of care obligations under applicable occupational health and safety legislation, including but not limited to the Occupational Health and Safety Act (South Africa), the Health and Safety at Work Act (United Kingdom), and equivalent legislation in all jurisdictions in which the Company operates.
        </p>
        <p className="mt-3">
          This policy applies to all domestic and international business travel undertaken by any person acting on behalf of <Field value={c.company_name} fallback="[Company Name]" />.
        </p>
      </section>

      {/* 2 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200" style={{ fontFamily: 'Inter, sans-serif' }}>
          2. Scope
        </h2>
        <p>This policy applies to:</p>
        <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
          <li>All permanent and contract employees of <Field value={c.company_name} fallback="[Company Name]" /></li>
          <li>Consultants and third-party personnel travelling on behalf of the Company</li>
          <li>All domestic travel of more than 24 hours in duration away from the employee's primary work location</li>
          <li>All international travel regardless of duration</li>
          <li>Travel to regions assigned a risk rating of Low, Medium, High, or Critical by SafeGuard360</li>
        </ul>
      </section>

      {/* 3 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200" style={{ fontFamily: 'Inter, sans-serif' }}>
          3. Roles &amp; Responsibilities
        </h2>

        <p className="font-semibold text-gray-800 mt-2 mb-1">3.1 The Company</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Provide access to the SafeGuard360 travel risk management platform</li>
          <li>Maintain up-to-date country risk intelligence for all destinations</li>
          <li>Ensure a 24/7 emergency assistance capability is available to all travellers</li>
          <li>Review and update this policy at least annually, or following a significant incident</li>
          <li>Maintain appropriate travel insurance coverage for all business travellers</li>
        </ul>

        <p className="font-semibold text-gray-800 mt-4 mb-1">3.2 Travel Manager / HR</p>
        <p className="mb-1">
          Travel Manager: <Field value={c.travel_manager_name} fallback="[Travel Manager Name]" /> —{' '}
          <Field value={c.travel_manager_email} fallback="[email@company.com]" />
        </p>
        <p className="mb-1">
          HR Contact: <Field value={c.hr_contact_name} fallback="[HR Contact Name]" /> —{' '}
          <Field value={c.hr_contact_email} fallback="[hr@company.com]" />
        </p>
        <ul className="list-disc list-inside ml-2 space-y-1 mt-2">
          <li>Review and approve or reject all travel requests via the SafeGuard360 platform</li>
          <li>Monitor traveller locations and safety during active travel periods</li>
          <li>Initiate emergency response protocols when required</li>
          <li>Ensure all travellers complete mandatory pre-travel training prior to departure</li>
          <li>Maintain records of policy acknowledgements and training completions</li>
        </ul>

        <p className="font-semibold text-gray-800 mt-4 mb-1">3.3 The Traveller</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Read, understand, and sign this policy before undertaking any business travel</li>
          <li>Submit all travel itineraries for approval via SafeGuard360 before booking is confirmed</li>
          <li>Complete all mandatory pre-travel safety training modules</li>
          <li>Perform regular check-ins as required during travel</li>
          <li>Report all safety, security, and health incidents immediately</li>
          <li>Use the SOS function immediately in the event of a life-threatening emergency</li>
          <li>Comply with all destination-specific security and health requirements</li>
        </ul>
      </section>

      {/* 4 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200" style={{ fontFamily: 'Inter, sans-serif' }}>
          4. Risk Assessment &amp; Travel Approval
        </h2>
        <p>
          All business travel must be assessed for risk prior to approval. The Company uses the SafeGuard360 platform to provide real-time risk ratings for all destinations based on intelligence from multiple authoritative sources.
        </p>

        <p className="font-semibold text-gray-800 mt-4 mb-2">4.1 Risk Level Thresholds</p>
        <div className="overflow-hidden rounded-lg border border-gray-200 mt-2">
          <table className="w-full text-xs" style={{ fontFamily: 'Inter, sans-serif' }}>
            <thead>
              <tr style={{ background: BRAND_BLUE, color: 'white' }}>
                <th className="px-3 py-2 text-left font-semibold">Risk Level</th>
                <th className="px-3 py-2 text-left font-semibold">Approval Required</th>
                <th className="px-3 py-2 text-left font-semibold">Additional Requirements</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="px-3 py-2 font-medium text-green-700">Low</td>
                <td className="px-3 py-2">Travel Manager</td>
                <td className="px-3 py-2">Standard check-in protocol</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50">
                <td className="px-3 py-2 font-medium text-yellow-700">Medium</td>
                <td className="px-3 py-2">Travel Manager + HR</td>
                <td className="px-3 py-2">Pre-travel briefing, daily check-ins</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-3 py-2 font-medium text-orange-700">High</td>
                <td className="px-3 py-2">Senior Management</td>
                <td className="px-3 py-2">Security briefing, twice-daily check-ins, emergency plan</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium text-red-700">Critical</td>
                <td className="px-3 py-2">Executive + Board</td>
                <td className="px-3 py-2">Full risk assessment, dedicated security support, 24/7 monitoring</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-4">
          The maximum risk level approved for standard business travel at <Field value={c.company_name} fallback="[Company Name]" /> is:{' '}
          <strong style={{ color: c.max_risk_level === 'Critical' ? '#dc2626' : c.max_risk_level === 'High' ? '#ea580c' : c.max_risk_level === 'Medium' ? '#ca8a04' : '#16a34a' }}>
            {c.max_risk_level || '[Risk Level]'}
          </strong>.
          Travel to destinations with a higher risk rating requires explicit written executive approval.
        </p>

        {c.restricted_countries && (
          <p className="mt-3">
            <strong>Countries currently restricted or requiring executive approval:</strong>{' '}
            {c.restricted_countries}
          </p>
        )}
      </section>

      {/* 5 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200" style={{ fontFamily: 'Inter, sans-serif' }}>
          5. Pre-Travel Requirements
        </h2>
        <p>All travellers must complete the following before departure is permitted:</p>
        <ul className="list-disc list-inside ml-2 space-y-1.5 mt-2">
          <li><strong>Submit itinerary</strong> — all travel details must be entered in SafeGuard360 and approved at least 48 hours before departure (72 hours for High/Critical destinations)</li>
          <li><strong>Complete training</strong> — all mandatory ISO 31030 safety training modules must be completed and current</li>
          <li><strong>Review country risk report</strong> — travellers must read the current country risk report for their destination in SafeGuard360</li>
          <li><strong>Register emergency contacts</strong> — next of kin and emergency contact details must be current in their SafeGuard360 profile</li>
          <li><strong>Confirm insurance</strong> — ensure travel insurance provided by <Field value={c.insurance_provider} fallback="[Insurance Provider]" /> (Policy: <Field value={c.insurance_policy_num} fallback="[Policy Number]" />) covers the destination and activities planned</li>
          <li><strong>Health requirements</strong> — obtain all required vaccinations and health clearances for the destination country</li>
          <li><strong>Documentation</strong> — ensure passport, visa, and any required permits are valid for the full duration of travel plus 6 months</li>
        </ul>
      </section>

      {/* 6 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200" style={{ fontFamily: 'Inter, sans-serif' }}>
          6. In-Travel Requirements
        </h2>

        <p className="font-semibold text-gray-800 mb-1">6.1 Check-In Protocol</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Travellers must perform a safety check-in via SafeGuard360 within 2 hours of arriving at each destination</li>
          <li>Subsequent check-ins must be performed at least once every 24 hours for Low/Medium risk destinations</li>
          <li>High risk destinations require check-ins at least twice daily (morning and evening)</li>
          <li>Failure to check in will trigger a welfare call from the Travel Manager within 2 hours</li>
        </ul>

        <p className="font-semibold text-gray-800 mt-4 mb-1">6.2 Communication</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Travellers must keep their mobile device charged and accessible at all times</li>
          <li>The SafeGuard360 app must remain installed and active throughout the travel period</li>
          <li>Travellers must respond to welfare calls or messages within 2 hours</li>
          <li>Any changes to itinerary (hotel, flights, location) must be updated in SafeGuard360 immediately</li>
        </ul>

        <p className="font-semibold text-gray-800 mt-4 mb-1">6.3 Location Tracking</p>
        <p>
          By signing this policy, the traveller explicitly consents to passive GPS location tracking via the SafeGuard360 platform during all active travel periods. Location data is accessed only by authorised Company personnel and the SafeGuard360 control room for the purpose of duty of care. Location history is deleted after 90 days.
        </p>
      </section>

      {/* 7 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200" style={{ fontFamily: 'Inter, sans-serif' }}>
          7. Emergency Procedures
        </h2>

        <div className="rounded-xl p-4 mb-3" style={{ background: '#FFF5F5', border: '1px solid #FCA5A5' }}>
          <p className="font-bold text-red-800 mb-2">IN A LIFE-THREATENING EMERGENCY:</p>
          <ol className="list-decimal list-inside space-y-1 text-red-700">
            <li>Activate the SOS button in SafeGuard360 immediately — this sends your GPS location to the control room</li>
            <li>Call local emergency services (Police / Ambulance / Fire)</li>
            <li>Call the 24/7 Company Emergency Line: <strong><Field value={c.emergency_number} fallback="[Emergency Number]" /></strong></li>
            <li>Do not leave your location unless it is unsafe to remain</li>
          </ol>
        </div>

        <p className="font-semibold text-gray-800 mb-1">7.1 Non-Emergency Incidents</p>
        <p>
          All security incidents, medical events, accidents, or near-misses must be reported via the SafeGuard360 Incident Reporting function within 24 hours of the event. Report to the Travel Manager: <Field value={c.travel_manager_name} fallback="[Travel Manager]" /> at <Field value={c.travel_manager_email} fallback="[email]" />.
        </p>

        <p className="font-semibold text-gray-800 mt-3 mb-1">7.2 Medical Assistance</p>
        <p>
          Medical assistance is provided through <Field value={c.medical_provider} fallback="[Medical Assistance Provider]" />. Contact details are provided in the traveller's confirmation email and are available in the SafeGuard360 Services section.
        </p>
      </section>

      {/* 8 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200" style={{ fontFamily: 'Inter, sans-serif' }}>
          8. Security Requirements
        </h2>
        <ul className="list-disc list-inside ml-2 space-y-1.5">
          <li>Travellers must not share their itinerary or accommodation details on public social media</li>
          <li>Company laptops and devices must use full-disk encryption and VPN when connecting to public networks</li>
          <li>Travellers must not carry classified or sensitive documents unless specifically authorised</li>
          <li>Physical cash should be kept to a minimum; travellers should use corporate cards where possible</li>
          <li>Travellers should maintain a low profile in high-risk destinations and avoid ostentatious displays of valuables</li>
          <li>Accommodation must meet the Company's minimum security standards — the Travel Manager must be consulted for High/Critical destinations</li>
        </ul>
      </section>

      {/* 9 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200" style={{ fontFamily: 'Inter, sans-serif' }}>
          9. Insurance &amp; Expenses
        </h2>
        <p>
          The Company provides business travel insurance through <Field value={c.insurance_provider} fallback="[Insurance Provider Name]" /> under policy number <Field value={c.insurance_policy_num} fallback="[Policy Number]" />. This insurance covers medical emergencies, medical evacuation, trip cancellation, and loss of luggage in accordance with the policy terms.
        </p>
        <p className="mt-2">
          Travellers must obtain and retain all receipts for travel-related expenses. Expense claims must be submitted within 30 days of return in accordance with the Company's expense policy. The Company will not reimburse expenses incurred as a result of non-compliance with this policy.
        </p>
      </section>

      {/* 10 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200" style={{ fontFamily: 'Inter, sans-serif' }}>
          10. Health &amp; Medical Requirements
        </h2>
        <ul className="list-disc list-inside ml-2 space-y-1.5">
          <li>Travellers must ensure all recommended and required vaccinations for the destination are current before departure</li>
          <li>Travellers with pre-existing medical conditions should consult their physician before travel to High/Critical risk destinations and inform HR</li>
          <li>Travellers must carry a minimum 5-day supply of any prescription medication</li>
          <li>The Company medical assistance provider is: <Field value={c.medical_provider} fallback="[Medical Provider Name]" /></li>
          <li>Travellers should register with local health services if staying in a destination for more than 30 consecutive days</li>
        </ul>
      </section>

      {/* 11 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200" style={{ fontFamily: 'Inter, sans-serif' }}>
          11. Non-Compliance
        </h2>
        <p>
          Failure to comply with this policy may result in:
        </p>
        <ul className="list-disc list-inside ml-2 space-y-1 mt-2">
          <li>Withdrawal of travel approval and recall from destination</li>
          <li>Loss of travel privileges</li>
          <li>Disciplinary action in accordance with the Company's disciplinary procedure</li>
          <li>Personal liability for costs or damages arising from non-compliant travel</li>
        </ul>
        <p className="mt-3">
          Where non-compliance creates a risk to others, the Company reserves the right to take immediate action including emergency recall, suspension of travel benefits, and referral to law enforcement where applicable.
        </p>
      </section>

      {/* 12 */}
      {c.additional_requirements && (
        <section>
          <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200" style={{ fontFamily: 'Inter, sans-serif' }}>
            12. Additional Company-Specific Requirements
          </h2>
          <p style={{ whiteSpace: 'pre-line' }}>{c.additional_requirements}</p>
        </section>
      )}

      {/* 13 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200" style={{ fontFamily: 'Inter, sans-serif' }}>
          {c.additional_requirements ? '13' : '12'}. Policy Review
        </h2>
        <p>
          This policy will be reviewed annually or following any significant travel-related incident, change in legislation, or material change in the risk environment in which <Field value={c.company_name} fallback="[Company Name]" /> operates. The current version is {c.policy_version || '1.0'}, effective <Field value={c.effective_date ? new Date(c.effective_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null} fallback="[Date]" />.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          This policy has been prepared in accordance with ISO 31030:2021 — Travel Risk Management: Guidance for Organisations.
        </p>
      </section>

    </div>
  )
}

// ── Signing modal ─────────────────────────────────────────────────────────────
function SigningModal({ policy, onClose, onSigned }) {
  const scrollRef = useRef(null)
  const [scrolled, setScrolled]   = useState(false)
  const [name, setName]           = useState('')
  const [locating, setLocating]   = useState(false)
  const [location, setLocation]   = useState(null)
  const [locError, setLocError]   = useState('')
  const [signing, setSigning]     = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    const el = scrollRef.current
    if (el && el.scrollHeight <= el.clientHeight) setScrolled(true)
  }, [])

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
          if (d.display_name) {
            const parts = d.display_name.split(',')
            locationName = parts.slice(0, 3).join(',').trim()
          }
        } catch {}
        setLocation({ latitude, longitude, locationName })
        setLocating(false)
      },
      (err) => {
        setLocError('Could not get location. You can still sign without it.')
        setLocating(false)
      },
      { timeout: 10000 }
    )
  }

  const handleSign = async () => {
    if (!name.trim()) { setError('Please type your full name to sign.'); return }
    if (!scrolled) { setError('Please scroll to the bottom of the policy before signing.'); return }
    setSigning(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Session expired. Please refresh.'); setSigning(false); return }

    const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()

    const { error: dbErr } = await supabase.from('policy_signatures').upsert({
      policy_id:      policy.id,
      user_id:        user.id,
      org_id:         prof?.org_id,
      signed_name:    name.trim(),
      signed_at:      new Date().toISOString(),
      policy_version: policy.policy_version,
      latitude:       location?.latitude || null,
      longitude:      location?.longitude || null,
      location_name:  location?.locationName || null,
    }, { onConflict: 'user_id,policy_id' })

    if (dbErr) { setError(dbErr.message); setSigning(false); return }
    onSigned()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">Sign Travel Policy</h2>
            <p className="text-xs text-gray-400 mt-0.5">Read the full policy, then sign below</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold px-2">✕</button>
        </div>

        {/* Scrollable policy */}
        <div
          ref={scrollRef}
          onScroll={e => {
            const el = e.target
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) setScrolled(true)
          }}
          className="flex-1 overflow-y-auto px-6 py-4"
        >
          <PolicyDocument config={policy} />
          <div className="h-6" />
        </div>

        {!scrolled && (
          <div className="px-6 py-2 flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border-t border-gray-100 shrink-0">
            <ChevronDown size={13} className="animate-bounce" />
            Scroll to the bottom to unlock signing
          </div>
        )}

        {/* Signing panel */}
        <div className={`px-6 py-5 border-t border-gray-100 space-y-4 shrink-0 transition-opacity ${!scrolled ? 'opacity-40 pointer-events-none' : ''}`}>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Type your full legal name to sign</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Jane Smith"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0118A1]"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Location at time of signing <span className="text-gray-400 font-normal">(recommended)</span>
            </label>
            {location ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
                <MapPin size={12} className="shrink-0" />
                <span>{location.locationName}</span>
              </div>
            ) : (
              <button
                onClick={getLocation}
                disabled={locating}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                {locating ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
                {locating ? 'Getting location…' : 'Capture my location'}
              </button>
            )}
            {locError && <p className="text-xs text-amber-600 mt-1">{locError}</p>}
          </div>

          {/* Timestamp notice */}
          <p className="text-[11px] text-gray-400">
            Signature will be timestamped: <strong className="text-gray-600">{new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}</strong>
          </p>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertTriangle size={12} className="shrink-0" /> {error}
            </div>
          )}

          <button
            onClick={handleSign}
            disabled={signing || !name.trim()}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: BRAND_BLUE, color: 'white' }}
          >
            {signing ? <><Loader2 size={15} className="animate-spin" /> Saving signature…</> : <><CheckCircle2 size={15} /> I Accept & Sign This Policy</>}
          </button>

          <p className="text-[10px] text-gray-400 text-center">
            By clicking above you confirm you have read and understood this policy in full.
            This electronic signature is legally binding under applicable electronic signature law.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Org admin config form ─────────────────────────────────────────────────────
function ConfigForm({ config, onSave }) {
  const [form, setForm] = useState(config || {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setSaved(false) }

  const handleSave = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const orgId = prof?.org_id
    if (!orgId) { setSaving(false); return }

    const payload = { ...form, org_id: orgId, updated_at: new Date().toISOString() }

    if (config?.id) {
      await supabase.from('travel_policies').update(payload).eq('id', config.id)
    } else {
      await supabase.from('travel_policies').insert(payload)
    }
    setSaving(false)
    setSaved(true)
    onSave(form)
  }

  const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent'
  const labelClass = 'block text-xs font-semibold text-gray-600 mb-1'

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        Fill in your organisation's details below. These will appear in the policy document that travellers sign.
        Fields left blank will show as blank lines in the policy.
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-5">
        <h3 className="font-bold text-gray-900 text-sm">Company Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Company Name</label>
            <input className={inputClass} value={form.company_name || ''} onChange={e => set('company_name', e.target.value)} placeholder="Acme Corporation" />
          </div>
          <div>
            <label className={labelClass}>24/7 Emergency Number</label>
            <input className={inputClass} value={form.emergency_number || ''} onChange={e => set('emergency_number', e.target.value)} placeholder="+27 11 000 0000" />
          </div>
          <div>
            <label className={labelClass}>Travel Manager Name</label>
            <input className={inputClass} value={form.travel_manager_name || ''} onChange={e => set('travel_manager_name', e.target.value)} placeholder="Jane Smith" />
          </div>
          <div>
            <label className={labelClass}>Travel Manager Email</label>
            <input className={inputClass} type="email" value={form.travel_manager_email || ''} onChange={e => set('travel_manager_email', e.target.value)} placeholder="travel@company.com" />
          </div>
          <div>
            <label className={labelClass}>HR Contact Name</label>
            <input className={inputClass} value={form.hr_contact_name || ''} onChange={e => set('hr_contact_name', e.target.value)} placeholder="HR Manager" />
          </div>
          <div>
            <label className={labelClass}>HR Contact Email</label>
            <input className={inputClass} type="email" value={form.hr_contact_email || ''} onChange={e => set('hr_contact_email', e.target.value)} placeholder="hr@company.com" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-5">
        <h3 className="font-bold text-gray-900 text-sm">Insurance &amp; Medical</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Insurance Provider</label>
            <input className={inputClass} value={form.insurance_provider || ''} onChange={e => set('insurance_provider', e.target.value)} placeholder="e.g. Hollard Travel" />
          </div>
          <div>
            <label className={labelClass}>Insurance Policy Number</label>
            <input className={inputClass} value={form.insurance_policy_num || ''} onChange={e => set('insurance_policy_num', e.target.value)} placeholder="POL-0000000" />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Medical Assistance Provider</label>
            <input className={inputClass} value={form.medical_provider || ''} onChange={e => set('medical_provider', e.target.value)} placeholder="e.g. Europ Assistance, AEA International" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-5">
        <h3 className="font-bold text-gray-900 text-sm">Risk Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Maximum Approved Risk Level</label>
            <select className={inputClass} value={form.max_risk_level || 'High'} onChange={e => set('max_risk_level', e.target.value)}>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Policy Version</label>
            <input className={inputClass} value={form.policy_version || '1.0'} onChange={e => set('policy_version', e.target.value)} placeholder="1.0" />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Restricted Countries / Regions</label>
            <textarea className={inputClass} rows={2} value={form.restricted_countries || ''} onChange={e => set('restricted_countries', e.target.value)} placeholder="e.g. North Korea, active conflict zones in Sudan..." />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-3">
        <h3 className="font-bold text-gray-900 text-sm">Additional Requirements <span className="font-normal text-gray-400">(optional)</span></h3>
        <textarea
          className={inputClass}
          rows={4}
          value={form.additional_requirements || ''}
          onChange={e => set('additional_requirements', e.target.value)}
          placeholder="Any company-specific travel requirements not covered above…"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
        style={{ background: BRAND_BLUE, color: 'white' }}
      >
        {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> {saved ? 'Saved ✓' : 'Save Policy'}</>}
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TravelPolicy() {
  const [role, setRole]           = useState(null)
  const [policy, setPolicy]       = useState(null)
  const [signature, setSignature] = useState(null)
  const [signatures, setSignatures] = useState([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('policy') // 'policy' | 'configure' | 'signatures'
  const [showSign, setShowSign]   = useState(false)

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: prof } = await supabase.from('profiles').select('role, org_id').eq('id', user.id).single()
    const r = prof?.role || 'traveller'
    setRole(r)

    const orgId = prof?.org_id
    if (!orgId) { setLoading(false); return }

    const [polRes, sigRes] = await Promise.all([
      supabase.from('travel_policies').select('*').eq('org_id', orgId).eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('policy_signatures').select('*').eq('user_id', user.id).maybeSingle(),
    ])

    setPolicy(polRes.data)
    setSignature(sigRes.data)

    if (['admin', 'developer', 'org_admin'].includes(r) && polRes.data) {
      const { data: sigs } = await supabase
        .from('policy_signatures')
        .select('*, profiles(full_name, email)')
        .eq('policy_id', polRes.data.id)
        .order('signed_at', { ascending: false })
      setSignatures(sigs || [])
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const isAdmin = ['admin', 'developer', 'org_admin'].includes(role)

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    </Layout>
  )

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Compliance</p>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Travel Policy</h1>
        <p className="text-sm text-gray-400 mt-1">ISO 31030:2021 compliant corporate travel risk management policy</p>
      </div>

      {/* No org warning */}
      {!policy && !isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <FileText size={28} className="mx-auto mb-3 text-amber-400" />
          <p className="text-sm font-semibold text-amber-800">Policy not yet configured</p>
          <p className="text-xs text-amber-600 mt-1">Ask your company administrator to set up the travel policy.</p>
        </div>
      )}

      {/* Signature status banner (traveller) */}
      {!isAdmin && policy && (
        <div className={`rounded-2xl p-5 mb-6 flex items-center justify-between gap-4 ${
          signature ? 'bg-green-50 border border-green-200' : 'border-2 border-dashed border-amber-300 bg-amber-50'
        }`}>
          <div className="flex items-center gap-3">
            {signature ? (
              <CheckCircle2 size={22} className="text-green-600 shrink-0" />
            ) : (
              <AlertTriangle size={22} className="text-amber-500 shrink-0" />
            )}
            <div>
              {signature ? (
                <>
                  <p className="font-bold text-green-800 text-sm">Policy signed</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    Signed as <strong>{signature.signed_name}</strong> on{' '}
                    {new Date(signature.signed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {signature.location_name ? ` · ${signature.location_name}` : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-amber-800 text-sm">Policy not yet signed</p>
                  <p className="text-xs text-amber-600 mt-0.5">Read the policy below and sign before your next trip</p>
                </>
              )}
            </div>
          </div>
          {!signature && (
            <button
              onClick={() => setShowSign(true)}
              className="shrink-0 px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: BRAND_BLUE, color: 'white' }}
            >
              Sign Now
            </button>
          )}
        </div>
      )}

      {/* Admin tabs */}
      {isAdmin && (
        <div className="flex gap-1 bg-white rounded-xl p-1 mb-6 w-fit border border-gray-100 shadow-sm">
          {[
            { key: 'policy',     label: 'View Policy',   icon: Eye },
            { key: 'configure',  label: 'Configure',     icon: Edit3 },
            { key: 'signatures', label: `Signatures (${signatures.length})`, icon: Users },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all"
              style={tab === key ? { background: BRAND_BLUE, color: 'white' } : { color: '#94A3B8' }}>
              <Icon size={12} />{label}
            </button>
          ))}
        </div>
      )}

      {/* Configure tab */}
      {isAdmin && tab === 'configure' && (
        <ConfigForm config={policy} onSave={(updated) => { setPolicy(p => ({ ...p, ...updated })); setTab('policy') }} />
      )}

      {/* Signatures tab */}
      {isAdmin && tab === 'signatures' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 text-sm">{signatures.length} signatures recorded</h3>
          </div>
          {signatures.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">No signatures yet</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {signatures.map(sig => (
                <div key={sig.id} className="px-6 py-4 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
                    {(sig.profiles?.full_name || sig.profiles?.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{sig.profiles?.full_name || sig.profiles?.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Signed as "<em>{sig.signed_name}</em>" ·{' '}
                      {new Date(sig.signed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {sig.location_name ? ` · ${sig.location_name}` : ''}
                    </p>
                  </div>
                  <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Policy document */}
      {(!isAdmin || tab === 'policy') && policy && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="p-8 lg:p-12">
            <PolicyDocument config={policy} />
          </div>

          {/* Traveller sign button at bottom */}
          {!isAdmin && !signature && (
            <div className="px-8 lg:px-12 pb-8">
              <div className="border-t border-gray-100 pt-6">
                <button
                  onClick={() => setShowSign(true)}
                  className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: BRAND_BLUE, color: 'white' }}
                >
                  <FileText size={15} /> Sign This Policy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* No policy + admin prompt */}
      {isAdmin && !policy && tab === 'policy' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <FileText size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-semibold text-gray-700 mb-1">No policy configured yet</p>
          <p className="text-xs text-gray-400 mb-4">Go to the Configure tab to set up your organisation's travel policy.</p>
          <button onClick={() => setTab('configure')}
            className="px-5 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: BRAND_BLUE, color: 'white' }}>
            Configure Now
          </button>
        </div>
      )}

      {/* Signing modal */}
      {showSign && policy && (
        <SigningModal
          policy={policy}
          onClose={() => setShowSign(false)}
          onSigned={() => { setShowSign(false); load() }}
        />
      )}
    </Layout>
  )
}
