/**
 * /src/pages/TermsAndConditions.jsx
 * Shown to every new user before they can access the platform.
 * Must scroll to bottom and explicitly accept to proceed.
 * Acceptance is stored in terms_acceptances + profiles.terms_accepted_at.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronDown, Shield, MapPin, Lock, FileText, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'
const TERMS_VERSION = '1.0'

export default function TermsAndConditions() {
  const navigate            = useNavigate()
  const scrollRef           = useRef(null)
  const [scrolled, setScrolled]   = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [checked, setChecked]     = useState(false)
  const [profile, setProfile]     = useState(null)
  const [acceptError, setAcceptError] = useState(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/login'); return }
      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile({ ...prof, id: user.id, email: user.email })

      // If already accepted this version, skip straight to dashboard
      if (prof?.terms_version === TERMS_VERSION) {
        navigate('/dashboard')
      }
    }
    load()
  }, [])

  // Auto-mark scrolled if content doesn't overflow the container
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollHeight <= el.clientHeight) setScrolled(true)
  }, [])

  const handleScroll = (e) => {
    const el = e.target
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    if (nearBottom) setScrolled(true)
  }

  const accept = async () => {
    if (!checked || !scrolled) return
    setAccepting(true)
    setAcceptError(null)

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Session expired — please refresh and try again.')

      // UPDATE only — never overwrite org_id, role, or other profile fields
      const { error: updateError, count } = await supabase
        .from('profiles')
        .update({ terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() })
        .eq('id', user.id)

      if (updateError) throw new Error(`Could not save your acceptance: ${updateError.message}`)

      // If profile didn't exist yet (edge case), create a minimal one from auth metadata
      if (count === 0) {
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id:                user.id,
            email:             user.email,
            full_name:         user.user_metadata?.full_name || 'New User',
            role:              user.user_metadata?.role || 'traveller',
            org_id:            user.user_metadata?.org_id || null,
            status:            'active',
            terms_version:     TERMS_VERSION,
            terms_accepted_at: new Date().toISOString(),
          })
        if (insertError) throw new Error(`Could not save your acceptance: ${insertError.message}`)
      }

      navigate('/dashboard')
    } catch (err) {
      console.error('Accept error:', err)
      setAcceptError(err.message || 'Something went wrong. Please try again.')
      setAccepting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#F0F2F8' }}>
      <div className="w-full max-w-2xl">

        {/* Header card */}
        <div className="rounded-2xl text-white p-6 mb-4"
          style={{ background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #0a24cc 100%)` }}>
          <div className="flex items-center gap-3 mb-2">
            <img src="/logo-transparent.png" alt="SafeGuard360" className="h-10 object-contain" />
          </div>
          <h1 className="text-xl font-bold mb-1">Terms of Service & Privacy Policy</h1>
          <p className="text-sm text-white/70">
            Please read and accept before accessing the platform. Version {TERMS_VERSION}.
          </p>
        </div>

        {/* Scrollable terms */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-[420px] overflow-y-auto p-6 text-sm text-gray-700 leading-relaxed space-y-5"
            style={{ scrollbarWidth: 'thin' }}
          >

            {/* Section 1 */}
            <Section icon={FileText} title="1. Platform Purpose">
              <p>
                SafeGuard360 is a travel risk management platform designed to support
                organisations and individuals in meeting their duty of care obligations
                under ISO 31030 (Travel Risk Management). The platform provides travel
                itinerary management, risk intelligence, safety check-ins, training
                compliance tracking, and 24/7 emergency assistance.
              </p>
            </Section>

            {/* Section 2 */}
            <Section icon={Lock} title="2. Data We Collect">
              <p>We collect and process the following personal data:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600">
                <li>Account information (name, email address, role)</li>
                <li>Travel itinerary details (destinations, dates, flight numbers)</li>
                <li>Training completion records</li>
                <li>Safety check-in records including timestamps</li>
                <li>Geographic location data (see Section 3)</li>
                <li>Incident reports submitted through the platform</li>
                <li>Control room assistance requests and message threads</li>
              </ul>
            </Section>

            {/* Section 3 — Location — most important for consent */}
            <Section icon={MapPin} title="3. Location Monitoring & Tracking" highlight>
              <p className="font-semibold text-gray-900 mb-2">
                By accepting these terms you explicitly consent to the following location
                data collection:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>
                  <strong>Passive location updates</strong> — when you have an active trip,
                  your GPS coordinates are automatically recorded each time you open or use
                  the platform. No manual action is required. This occurs only during the
                  period of your registered travel dates.
                </li>
                <li>
                  <strong>Check-in location</strong> — your GPS coordinates are captured
                  each time you perform a safety check-in.
                </li>
                <li>
                  <strong>SOS location</strong> — your GPS coordinates are captured and
                  shared immediately when you activate the SOS emergency function.
                </li>
                <li>
                  <strong>Live Map</strong> — your location is displayed on the Live Map
                  while that page is open.
                </li>
              </ul>
              <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-xs text-blue-800">
                  <strong>Purpose:</strong> Location data is collected solely to support
                  your organisation's duty of care obligations and to enable emergency
                  assistance. It is never sold to third parties or used for commercial
                  profiling. Location history is automatically deleted after 90 days.
                </p>
              </div>
              <p className="mt-3 text-gray-600">
                Your browser will request location permission the first time the platform
                needs your location. You may deny this permission; however, some safety
                features (check-in, SOS, passive tracking) will be unavailable.
              </p>
              <p className="mt-2 text-gray-600">
                Corporate travellers: your location data is accessible to your company's
                designated Travel Manager/Admin as part of their duty of care obligations.
                This is disclosed in your employment travel policy.
              </p>
              <p className="mt-2 text-gray-600">
                Solo travellers: your location data is accessible only to SafeGuard360
                control room operators for the purpose of providing emergency assistance.
              </p>
            </Section>

            {/* Section 4 */}
            <Section icon={Shield} title="4. ISO 31030 Compliance">
              <p>
                This platform is built to support compliance with ISO 31030:2021 (Travel
                Risk Management — Guidance for organisations). Data collected through the
                platform supports your organisation's documented travel risk management
                programme including pre-travel risk assessment, in-travel monitoring, and
                post-travel review.
              </p>
              <p className="mt-2">
                Training completion records, policy acknowledgements, check-in history,
                and incident reports may be used as evidence of compliance with your
                organisation's duty of care obligations.
              </p>
            </Section>

            {/* Section 5 */}
            <Section title="5. Data Retention">
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Location pings: 90 days (auto-deleted)</li>
                <li>Check-in records: duration of employment / account life</li>
                <li>Training records: duration of employment / account life</li>
                <li>Incident reports: 7 years (regulatory requirement)</li>
                <li>Terms acceptance records: duration of account life</li>
              </ul>
            </Section>

            {/* Section 6 */}
            <Section title="6. Your Rights">
              <p>Under GDPR, POPIA, and applicable privacy law you have the right to:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600">
                <li>Access all personal data held about you</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your data (subject to legal retention obligations)</li>
                <li>Withdraw consent to location tracking (this will disable related features)</li>
                <li>Lodge a complaint with your national data protection authority</li>
              </ul>
              <p className="mt-2">
                To exercise any of these rights, contact your organisation's Travel Manager
                or email <span className="font-medium text-[#0118A1]">privacy@safeguard360.com</span>.
              </p>
            </Section>

            {/* Section 7 */}
            <Section title="7. Security">
              <p>
                All data is stored in Supabase with row-level security policies ensuring
                users can only access their own data. Data is encrypted in transit (TLS 1.2+)
                and at rest. Access is restricted by role — travellers cannot access other
                travellers' data.
              </p>
            </Section>

            {/* Section 8 */}
            <Section title="8. Changes to These Terms">
              <p>
                We may update these terms from time to time. When we do, you will be asked
                to review and re-accept the updated version before continuing to use the
                platform. The version number and date of last update will always be shown.
              </p>
            </Section>

            {/* Section 9 */}
            <Section title="9. Governing Law">
              <p>
                These terms are governed by the laws of the Republic of South Africa.
                Any disputes shall be subject to the jurisdiction of the South African courts.
              </p>
            </Section>

            {/* Bottom spacer so user has to scroll */}
            <div className="pt-4 text-center text-xs text-gray-400">
              — End of Terms of Service & Privacy Policy v{TERMS_VERSION} —
            </div>
          </div>

          {/* Scroll indicator */}
          {!scrolled && (
            <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-center gap-2 text-xs text-gray-400 bg-gray-50">
              <ChevronDown size={13} className="animate-bounce" />
              Scroll to the bottom to continue
            </div>
          )}
        </div>

        {/* Accept panel */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          {/* Checkbox */}
          <label className={`flex items-start gap-3 cursor-pointer ${!scrolled ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="mt-0.5 relative shrink-0">
              <input
                type="checkbox"
                checked={checked}
                onChange={e => setChecked(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                checked ? 'border-[#0118A1] bg-[#0118A1]' : 'border-gray-300'
              }`}>
                {checked && <CheckCircle2 size={12} color="white" strokeWidth={3} />}
              </div>
            </div>
            <span className="text-sm text-gray-700 leading-relaxed">
              I have read and understood the Terms of Service and Privacy Policy, including
              the <strong>location monitoring disclosure in Section 3</strong>. I consent
              to the collection and processing of my personal data as described, including
              passive location updates during active travel periods.
            </span>
          </label>

          {/* Error message */}
          {acceptError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertTriangle size={14} className="shrink-0" />
              {acceptError}
            </div>
          )}

          {/* Accept button */}
          <button
            onClick={accept}
            disabled={!scrolled || !checked || accepting}
            className="w-full py-3.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: BRAND_GREEN, color: BRAND_BLUE }}
          >
            {accepting ? 'Saving acceptance…' : 'I Accept — Continue to SafeGuard360'}
          </button>

          <p className="text-[10px] text-gray-400 text-center">
            Acceptance logged with timestamp · Version {TERMS_VERSION} ·{' '}
            {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Section component ─────────────────────────────────────────────────────────
function Section({ icon: Icon, title, children, highlight }) {
  return (
    <div className={`rounded-xl p-4 ${highlight ? 'bg-amber-50 border border-amber-100' : 'bg-gray-50'}`}>
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={14} className={highlight ? 'text-amber-600' : 'text-gray-400'} />}
        <h2 className={`text-xs font-bold uppercase tracking-wide ${highlight ? 'text-amber-800' : 'text-gray-500'}`}>
          {title}
        </h2>
      </div>
      <div className="text-sm text-gray-700 leading-relaxed space-y-2">
        {children}
      </div>
    </div>
  )
}
