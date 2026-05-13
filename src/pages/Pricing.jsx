/**
 * Pricing.jsx — SafeGuard360 public-facing pricing and positioning page
 *
 * Design intent: enterprise operational platform aesthetic.
 * Positioned alongside platforms like Palantir, Darktrace, Recorded Future —
 * not consumer SaaS. Dark, restrained, operationally credible.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Shield, MapPin, Radio, ChevronRight, X,
  CheckSquare, Globe, Activity, Lock, ArrowUpRight,
  AlertTriangle, Layers, Eye, Zap,
} from 'lucide-react'

/* ─── Design tokens ────────────────────────────────────────────────── */
const C = {
  bg:         '#080C14',
  surface:    '#0D1220',
  surfaceHi:  '#111827',
  border:     'rgba(255,255,255,0.07)',
  borderHi:   'rgba(255,255,255,0.14)',
  accent:     '#AACC00',     // brand lime — used sparingly
  accentDim:  'rgba(170,204,0,0.12)',
  navy:       '#1E2461',
  navyMid:    '#253080',
  textPrimary:'#EEF2FF',
  textSecond: '#8B9CC8',
  textMuted:  '#4B5A78',
  danger:     '#EF4444',
}

/* ─── Plan data ─────────────────────────────────────────────────────── */
const PLANS = [
  {
    key:       'solo',
    label:     'SOLO',
    tier:      '01',
    tagline:   'Independent operators & field professionals',
    price:     18,
    seats:     '1 operator',
    for:       ['Consultants', 'Journalists', 'Contractors', 'Solo executives', 'Independent operators'],
    features: [
      'Live location tracking & status',
      'Operational map access',
      'Real-time risk & intelligence alerts',
      'Flight monitoring & disruption alerts',
      'Traveler check-in & acknowledgement',
      'SOS activation & escalation',
      'Country risk briefings',
      'Visa & health entry requirements',
      'Mobile-optimised field interface',
    ],
    cta:      'Request Access',
    style:    'outline',
    highlight: false,
  },
  {
    key:       'team',
    label:     'TEAM',
    tier:      '02',
    tagline:   'Corporate teams, NGOs & security operations',
    price:     210,
    seats:     'Up to 15 travellers',
    for:       ['SMEs', 'Corporate travel teams', 'Security teams', 'NGOs', 'Logistics operations'],
    features: [
      'All SOLO capabilities',
      'Operational monitoring dashboard',
      'Multi-traveler visibility & control',
      'Travel approval workflows',
      'Geofencing & zone alerts',
      'Escalation & notification workflows',
      'Operational intelligence feeds',
      'Admin controls & user management',
      'Group crisis broadcast',
    ],
    cta:      'Start Deployment',
    style:    'accent',
    highlight: true,
    badge:    'MOST DEPLOYED',
  },
  {
    key:       'operations',
    label:     'OPERATIONS',
    tier:      '03',
    tagline:   'High-risk environments & field-intensive programs',
    price:     580,
    seats:     'Up to 40 travellers',
    for:       ['Mining & resources', 'Telecoms infrastructure', 'Executive movement', 'Regional NGOs', 'Field-intensive orgs'],
    features: [
      'All TEAM capabilities',
      'Advanced operational intelligence centre',
      'ACLED conflict & incident data integration',
      'AI-synthesised threat summaries',
      'Advanced geospatial analytics',
      'Full audit logging & compliance exports',
      'Enhanced notification throughput',
      'Priority operational support',
      'Dedicated onboarding engagement',
    ],
    cta:      'Start Deployment',
    style:    'outline',
    highlight: false,
  },
  {
    key:       'enterprise',
    label:     'ENTERPRISE',
    tier:      '04',
    tagline:   'Multinational programs & enterprise deployments',
    price:     null,
    seats:     'Unlimited travellers',
    for:       ['Multinational corporations', 'Enterprise travel programs', 'Executive protection ops', 'Multi-region deployments', 'Large operational organisations'],
    features: [
      'All OPERATIONS capabilities',
      'Single sign-on (SSO / SAML)',
      'Advanced RBAC & permission models',
      'Custom API integrations',
      'Multi-org & hierarchy management',
      'Custom operational workflows',
      'Dedicated infrastructure options',
      'Enterprise SLA & support tier',
      'Named account engagement',
    ],
    cta:      'Contact Sales',
    style:    'dark',
    highlight: false,
  },
]

/* ─── Enterprise inquiry modal ──────────────────────────────────────── */
function EnterpriseModal({ onClose }) {
  const [form, setForm]     = useState({ name: '', org: '', email: '', size: '', context: '' })
  const [sent, setSent]     = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr]       = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErr('')
    try {
      const res = await fetch('/api/enterprise-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, message: form.context }),
      })
      if (!res.ok) throw new Error('Submission failed — contact sales@risk360.co directly.')
      setSent(true)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-lg rounded-[10px] overflow-hidden"
        style={{ background: C.surface, border: `1px solid ${C.borderHi}` }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: `1px solid ${C.border}` }}>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: C.accent }}>
                ENTERPRISE
              </span>
            </div>
            <h3 className="font-bold text-base" style={{ color: C.textPrimary }}>Deployment Enquiry</h3>
            <p className="text-xs mt-0.5" style={{ color: C.textSecond }}>Our team responds within one business day</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[4px] transition-colors hover:opacity-60"
            style={{ color: C.textMuted }}>
            <X size={16} />
          </button>
        </div>

        {sent ? (
          <div className="px-6 py-12 text-center">
            <div className="w-12 h-12 rounded-[6px] flex items-center justify-center mx-auto mb-5"
              style={{ background: C.accentDim, border: `1px solid rgba(170,204,0,0.3)` }}>
              <Shield size={22} style={{ color: C.accent }} />
            </div>
            <p className="font-bold mb-2" style={{ color: C.textPrimary }}>Enquiry received</p>
            <p className="text-sm mb-6" style={{ color: C.textSecond }}>
              Our enterprise team will be in contact shortly.
            </p>
            <button onClick={onClose}
              className="px-5 py-2.5 rounded-[6px] text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: C.navy, color: C.textPrimary }}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { key: 'name',  label: 'Full name',      placeholder: 'Jane Smith' },
                { key: 'org',   label: 'Organisation',   placeholder: 'Acme Operations Ltd' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-[10px] font-bold tracking-[0.12em] uppercase mb-1.5"
                    style={{ color: C.textMuted }}>{label}</label>
                  <input
                    className="w-full rounded-[5px] px-3 py-2.5 text-sm outline-none transition-colors"
                    style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, color: C.textPrimary }}
                    onFocus={e => e.target.style.borderColor = C.borderHi}
                    onBlur={e => e.target.style.borderColor = C.border}
                    required placeholder={placeholder}
                    value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold tracking-[0.12em] uppercase mb-1.5"
                  style={{ color: C.textMuted }}>Work email</label>
                <input
                  className="w-full rounded-[5px] px-3 py-2.5 text-sm outline-none transition-colors"
                  style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, color: C.textPrimary }}
                  onFocus={e => e.target.style.borderColor = C.borderHi}
                  onBlur={e => e.target.style.borderColor = C.border}
                  type="email" required placeholder="jane@company.com"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-bold tracking-[0.12em] uppercase mb-1.5"
                  style={{ color: C.textMuted }}>Traveller headcount</label>
                <select
                  className="w-full rounded-[5px] px-3 py-2.5 text-sm outline-none"
                  style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, color: C.textPrimary }}
                  value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))}>
                  <option value="">Select range</option>
                  <option value="40-100">40–100 travellers</option>
                  <option value="100-500">100–500 travellers</option>
                  <option value="500+">500+ travellers</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold tracking-[0.12em] uppercase mb-1.5"
                style={{ color: C.textMuted }}>Operational context</label>
              <textarea
                className="w-full rounded-[5px] px-3 py-2.5 text-sm outline-none resize-none"
                style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, color: C.textPrimary }}
                onFocus={e => e.target.style.borderColor = C.borderHi}
                onBlur={e => e.target.style.borderColor = C.border}
                rows={3} placeholder="Describe your operational environment and requirements..."
                value={form.context} onChange={e => setForm(f => ({ ...f, context: e.target.value }))} />
            </div>
            {err && (
              <p className="text-xs px-3 py-2.5 rounded-[5px]"
                style={{ background: 'rgba(239,68,68,0.1)', color: C.danger }}>
                {err}
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-[6px] text-sm font-medium transition-opacity hover:opacity-70"
                style={{ border: `1px solid ${C.border}`, color: C.textSecond }}>
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 rounded-[6px] text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: C.navy, color: C.textPrimary }}>
                {loading ? 'Sending…' : (<>Submit enquiry <ArrowUpRight size={13}/></>)}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/* ─── Single plan card ───────────────────────────────────────────────── */
function PlanCard({ plan, onEnterprise, onSelect }) {
  const isEnterprise = plan.key === 'enterprise'
  const isAccent     = plan.style === 'accent'

  const handleCta = () => {
    if (isEnterprise) { onEnterprise(); return }
    onSelect(plan)
  }

  return (
    <div
      className="relative flex flex-col rounded-[10px] transition-all duration-200"
      style={{
        background:  isAccent ? C.surfaceHi : C.surface,
        border:      `1px solid ${isAccent ? C.borderHi : C.border}`,
        boxShadow:   isAccent ? '0 0 0 1px rgba(170,204,0,0.08), 0 8px 32px rgba(0,0,0,0.4)' : '0 2px 12px rgba(0,0,0,0.25)',
      }}
    >
      {/* Popular badge */}
      {plan.badge && (
        <div className="absolute -top-3 left-5">
          <span className="text-[9px] font-black tracking-[0.18em] uppercase px-2.5 py-1 rounded-full"
            style={{ background: C.accent, color: '#080C14' }}>
            {plan.badge}
          </span>
        </div>
      )}

      {/* Card header */}
      <div className="px-5 pt-6 pb-5" style={{ borderBottom: `1px solid ${C.border}` }}>
        {/* Tier & label */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[9px] font-bold tracking-[0.2em] uppercase"
            style={{ color: isAccent ? C.accent : C.textMuted }}>
            {plan.tier} / {plan.label}
          </span>
          <span className="text-[9px] font-medium tracking-[0.12em] uppercase px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.04)', color: C.textMuted, border: `1px solid ${C.border}` }}>
            {plan.seats}
          </span>
        </div>

        {/* Tagline */}
        <p className="text-xs leading-relaxed mb-5" style={{ color: C.textSecond }}>
          {plan.tagline}
        </p>

        {/* Price */}
        <div className="mb-5">
          {plan.price != null ? (
            <div className="flex items-end gap-2">
              <span className="text-3xl font-black tracking-tight" style={{ color: C.textPrimary }}>
                ${plan.price}
              </span>
              <span className="text-xs mb-1.5 font-medium" style={{ color: C.textMuted }}>
                USD / month
              </span>
            </div>
          ) : (
            <div>
              <span className="text-xl font-bold" style={{ color: C.textPrimary }}>Custom</span>
              <p className="text-xs mt-0.5" style={{ color: C.textMuted }}>Contact for enterprise pricing</p>
            </div>
          )}
        </div>

        {/* CTA button */}
        <button
          onClick={handleCta}
          className="w-full py-2.5 rounded-[7px] text-sm font-bold transition-all flex items-center justify-center gap-1.5"
          style={
            isAccent
              ? { background: C.accent, color: '#080C14' }
              : plan.style === 'dark'
              ? { background: 'rgba(255,255,255,0.06)', color: C.textPrimary, border: `1px solid ${C.borderHi}` }
              : { background: 'transparent', color: C.textPrimary, border: `1px solid ${C.borderHi}` }
          }
          onMouseEnter={e => {
            if (!isAccent) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
          }}
          onMouseLeave={e => {
            if (!isAccent) {
              e.currentTarget.style.background = plan.style === 'dark'
                ? 'rgba(255,255,255,0.06)' : 'transparent'
            }
          }}
        >
          {plan.cta}
          <ChevronRight size={13} />
        </button>
      </div>

      {/* For whom */}
      <div className="px-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
        <p className="text-[9px] font-bold tracking-[0.15em] uppercase mb-2.5" style={{ color: C.textMuted }}>
          Designed for
        </p>
        <div className="flex flex-wrap gap-1.5">
          {plan.for.map(f => (
            <span key={f} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: 'rgba(255,255,255,0.04)', color: C.textSecond, border: `1px solid ${C.border}` }}>
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Features */}
      <ul className="px-5 py-4 flex flex-col gap-2.5 flex-1">
        <p className="text-[9px] font-bold tracking-[0.15em] uppercase mb-0.5" style={{ color: C.textMuted }}>
          Capabilities
        </p>
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-xs leading-relaxed" style={{ color: C.textSecond }}>
            <span className="mt-0.5 shrink-0 text-[8px] font-black"
              style={{ color: isAccent ? C.accent : C.textMuted }}>
              ▪
            </span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ─── Main Pricing page ─────────────────────────────────────────────── */
export default function Pricing() {
  const navigate         = useNavigate()
  const [showModal, setShowModal] = useState(false)

  const handleSelect = (plan) => {
    navigate(`/signup?plan=${plan.key}`)
  }

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.textPrimary, fontFamily: 'Inter, sans-serif' }}>

      {/* ── Navigation ──────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40"
        style={{ background: 'rgba(8,12,20,0.92)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
          {/* Logo */}
          <button onClick={() => navigate('/login')} className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[5px] flex items-center justify-center flex-shrink-0"
              style={{ background: C.navy }}>
              <Shield size={13} style={{ color: C.accent }} />
            </div>
            <span className="font-bold text-sm tracking-tight" style={{ color: C.textPrimary }}>
              SafeGuard<span style={{ color: C.accent }}>360</span>
            </span>
          </button>

          {/* Nav links */}
          <div className="flex items-center gap-1">
            <button onClick={() => navigate('/login')}
              className="hidden sm:block text-xs font-medium px-3 py-2 rounded-[5px] transition-opacity hover:opacity-70"
              style={{ color: C.textSecond }}>
              Sign in
            </button>
            <button onClick={() => navigate('/signup')}
              className="text-xs font-bold px-4 py-2 rounded-[5px] transition-opacity hover:opacity-85"
              style={{ background: C.navy, color: C.textPrimary }}>
              Get started
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-16 pb-14">
        {/* Classification badge */}
        <div className="inline-flex items-center gap-2 mb-7 px-3 py-1.5 rounded-full text-[9px] font-black tracking-[0.2em] uppercase"
          style={{ background: C.accentDim, border: `1px solid rgba(170,204,0,0.2)`, color: C.accent }}>
          <Radio size={9} />
          JOURNEY INTELLIGENCE PLATFORM
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl font-black leading-[1.08] tracking-tight mb-5 max-w-3xl"
          style={{ color: C.textPrimary }}>
          Operational travel risk<br />
          <span style={{ color: C.accent }}>for the environments</span><br />
          that demand it.
        </h1>

        {/* Sub-headline */}
        <p className="text-base leading-relaxed max-w-xl mb-8" style={{ color: C.textSecond }}>
          SafeGuard360 is not a travel application. It is a journey management
          and operational intelligence platform built for corporate, field-intensive,
          and high-risk operating environments.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap gap-3 mb-12">
          <button
            onClick={() => navigate('/signup')}
            className="flex items-center gap-2 px-5 py-3 rounded-[7px] text-sm font-bold transition-opacity hover:opacity-85"
            style={{ background: C.accent, color: '#080C14' }}>
            Request Access <ChevronRight size={14} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-[7px] text-sm font-bold transition-all hover:opacity-80"
            style={{ border: `1px solid ${C.borderHi}`, color: C.textPrimary }}>
            Enterprise Demo <ArrowUpRight size={14} />
          </button>
        </div>

        {/* Regional deployment strip */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[9px] font-bold tracking-[0.18em] uppercase" style={{ color: C.textMuted }}>
            Active deployments:
          </span>
          {[
            { label: 'Sub-Saharan Africa', icon: '🌍' },
            { label: 'North Africa',       icon: '🌍' },
            { label: 'UAE / Dubai',        icon: '🇦🇪' },
            { label: 'Middle East',        icon: '🌐' },
          ].map(r => (
            <span key={r.label}
              className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.textSecond }}>
              <span>{r.icon}</span>{r.label}
            </span>
          ))}
        </div>
      </section>

      {/* ── Capability pillars ──────────────────────────────────────── */}
      <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.surface }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              {
                icon: <Eye size={16} />,
                title: 'Traveler Visibility',
                body: 'Real-time GPS tracking, check-in acknowledgements, and live status across all active deployments.',
              },
              {
                icon: <Activity size={16} />,
                title: 'Operational Monitoring',
                body: 'Continuous ACLED conflict data, intelligence feeds, and AI-synthesised country threat assessments.',
              },
              {
                icon: <AlertTriangle size={16} />,
                title: 'Escalation & Response',
                body: 'SOS activation, crisis broadcast, and structured escalation workflows with multi-channel notification.',
              },
              {
                icon: <Layers size={16} />,
                title: 'Journey Intelligence',
                body: 'Flight monitoring, itinerary parsing, visa requirements, and movement risk mapping by corridor.',
              },
            ].map((p, i) => (
              <div key={i} className="flex flex-col gap-3">
                <div className="w-8 h-8 rounded-[6px] flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(170,204,0,0.08)', border: `1px solid rgba(170,204,0,0.15)`, color: C.accent }}>
                  {p.icon}
                </div>
                <h3 className="text-sm font-bold" style={{ color: C.textPrimary }}>{p.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: C.textSecond }}>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing grid ────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-16">
        {/* Section label */}
        <div className="mb-10">
          <p className="text-[9px] font-black tracking-[0.22em] uppercase mb-3" style={{ color: C.accent }}>
            DEPLOYMENT TIERS
          </p>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-3" style={{ color: C.textPrimary }}>
            Select your operational scale
          </h2>
          <p className="text-sm max-w-lg" style={{ color: C.textSecond }}>
            All plans include core traveler safety functionality.
            Scale to match your operational footprint.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
          {PLANS.map(plan => (
            <PlanCard
              key={plan.key}
              plan={plan}
              onEnterprise={() => setShowModal(true)}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {/* Pricing footnote */}
        <p className="text-xs mt-6" style={{ color: C.textMuted }}>
          All prices in USD. Billed monthly. Annual billing available with 15% discount on TEAM and above.
          Seat counts refer to active travellers — admin and security personnel do not consume seats.
        </p>
      </section>

      {/* ── Regional differentiation ────────────────────────────────── */}
      <section style={{ borderTop: `1px solid ${C.border}`, background: C.surface }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <p className="text-[9px] font-black tracking-[0.22em] uppercase mb-3" style={{ color: C.accent }}>
                REGIONAL OPERATIONS
              </p>
              <h2 className="text-2xl font-black tracking-tight mb-4" style={{ color: C.textPrimary }}>
                Built for the environments<br />most platforms ignore.
              </h2>
              <p className="text-sm leading-relaxed mb-6" style={{ color: C.textSecond }}>
                SafeGuard360 was architected with Sub-Saharan Africa, North Africa, the UAE,
                and the broader Middle East as primary operating environments.
                That means degraded-connectivity resilience, loadshedding awareness, regional
                risk data integration, and operational workflows calibrated for austere environments.
              </p>
              <div className="flex flex-col gap-3">
                {[
                  'Degraded-connectivity and low-bandwidth resilience',
                  'ACLED real-time conflict and incident data coverage',
                  'Loadshedding and infrastructure disruption alerts',
                  'Africa and Middle East country risk scoring',
                  'Regional crisis broadcast and escalation workflows',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-[8px] font-black mt-1 shrink-0" style={{ color: C.accent }}>▪</span>
                    <span className="text-sm" style={{ color: C.textSecond }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Region cards */}
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  region: 'Sub-Saharan Africa',
                  note:   'High-priority conflict monitoring, loadshedding, and ground-level intel',
                  icon:   '🌍',
                },
                {
                  region: 'North Africa',
                  note:   'Cross-border movement, infrastructure risk, and corridor monitoring',
                  icon:   '🌍',
                },
                {
                  region: 'UAE / Dubai',
                  note:   'Executive movement, hub transit monitoring, and expat team coverage',
                  icon:   '🇦🇪',
                },
                {
                  region: 'Middle East',
                  note:   'Geopolitical monitoring, conflict adjacency, and corridor risk assessment',
                  icon:   '🌐',
                },
              ].map(r => (
                <div key={r.region} className="rounded-[8px] p-4"
                  style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  <div className="text-lg mb-2">{r.icon}</div>
                  <p className="text-xs font-bold mb-1.5" style={{ color: C.textPrimary }}>{r.region}</p>
                  <p className="text-[10px] leading-relaxed" style={{ color: C.textMuted }}>{r.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust and infrastructure signals ───────────────────────── */}
      <section style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14">
          <p className="text-[9px] font-black tracking-[0.22em] uppercase mb-10 text-center" style={{ color: C.textMuted }}>
            PLATFORM ARCHITECTURE
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              {
                icon: <Lock size={15} />,
                title: 'Secure infrastructure',
                items: [
                  'End-to-end encrypted data transmission',
                  'Role-based access control (RBAC)',
                  'Full audit logging of all operator actions',
                  'Compliance-ready data exports',
                ],
              },
              {
                icon: <Zap size={15} />,
                title: 'Operational resilience',
                items: [
                  'Realtime monitoring across all travellers',
                  'Multi-channel escalation (push, SMS, email)',
                  'Degraded-connectivity resilient architecture',
                  'Continuous threat data ingestion pipeline',
                ],
              },
              {
                icon: <Globe size={15} />,
                title: 'Global scale',
                items: [
                  'Multi-region and multi-org deployment',
                  'API-first architecture for system integration',
                  'Enterprise SSO and directory integration',
                  'Custom workflows for operational environments',
                ],
              },
            ].map((col, i) => (
              <div key={i}>
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="w-7 h-7 rounded-[5px] flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.textSecond }}>
                    {col.icon}
                  </div>
                  <span className="text-sm font-bold" style={{ color: C.textPrimary }}>{col.title}</span>
                </div>
                <ul className="flex flex-col gap-2.5">
                  {col.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-xs" style={{ color: C.textSecond }}>
                      <span className="text-[8px] font-black mt-0.5 shrink-0" style={{ color: C.textMuted }}>▪</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Enterprise CTA ─────────────────────────────────────────── */}
      <section style={{ borderTop: `1px solid ${C.border}`, background: C.surface }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14">
          <div className="max-w-2xl">
            <p className="text-[9px] font-black tracking-[0.22em] uppercase mb-3" style={{ color: C.accent }}>
              ENTERPRISE DEPLOYMENT
            </p>
            <h2 className="text-2xl font-black tracking-tight mb-4" style={{ color: C.textPrimary }}>
              Deploying at scale or in a<br />complex operational environment?
            </h2>
            <p className="text-sm leading-relaxed mb-7" style={{ color: C.textSecond }}>
              Our enterprise team works directly with programme managers, security directors,
              and travel risk leads to design and deploy SafeGuard360 across complex, large-scale,
              or multi-region operations. Custom seat counts, SSO, API integration, and
              dedicated support are all available.
            </p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-5 py-3 rounded-[7px] text-sm font-bold transition-opacity hover:opacity-85"
                style={{ background: C.navy, color: C.textPrimary }}>
                Discuss enterprise deployment <ArrowUpRight size={14} />
              </button>
              <a href="mailto:sales@risk360.co"
                className="flex items-center gap-2 px-5 py-3 rounded-[7px] text-sm font-bold transition-all hover:opacity-80"
                style={{ border: `1px solid ${C.border}`, color: C.textSecond }}>
                sales@risk360.co
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-14">
          <p className="text-[9px] font-black tracking-[0.22em] uppercase mb-8 text-center" style={{ color: C.textMuted }}>
            FREQUENTLY ASKED
          </p>
          <div className="flex flex-col gap-4">
            {[
              {
                q: 'What counts as an active traveller seat?',
                a: 'Any user assigned the traveller or solo role within an organisation. Security managers, administrators, and org_admin users do not consume a seat.',
              },
              {
                q: 'Can plans be changed mid-cycle?',
                a: 'Yes. Upgrades take effect immediately. Downgrades apply from the next billing date. You retain full access to your current tier until then.',
              },
              {
                q: 'What happens if we exceed our seat count?',
                a: 'You will receive a prompt to upgrade before adding the next traveller. We do not restrict access to travellers mid-deployment — operational continuity always takes priority.',
              },
              {
                q: 'Is annual billing available?',
                a: 'Annual billing with a 15% discount is available on TEAM, OPERATIONS, and ENTERPRISE plans. Contact our team to arrange.',
              },
              {
                q: 'Is SafeGuard360 suitable for non-African deployments?',
                a: 'Yes. While our initial focus is Sub-Saharan Africa, North Africa, the UAE, and the Middle East, the platform is globally applicable. Enterprise plans include multi-region deployment support.',
              },
              {
                q: 'Do you provide onboarding support?',
                a: 'OPERATIONS plans include a dedicated onboarding engagement. ENTERPRISE plans include full programme integration support and a named account manager.',
              },
            ].map(({ q, a }, i) => (
              <div key={i} className="rounded-[8px] p-5"
                style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <h4 className="text-sm font-bold mb-2" style={{ color: C.textPrimary }}>{q}</h4>
                <p className="text-sm leading-relaxed" style={{ color: C.textSecond }}>{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${C.border}`, background: C.surface }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-[5px] flex items-center justify-center flex-shrink-0"
                style={{ background: C.navy }}>
                <Shield size={13} style={{ color: C.accent }} />
              </div>
              <div>
                <span className="font-bold text-sm" style={{ color: C.textPrimary }}>
                  SafeGuard<span style={{ color: C.accent }}>360</span>
                </span>
                <p className="text-[9px] leading-none mt-0.5" style={{ color: C.textMuted }}>
                  Operational Travel Risk Management
                </p>
              </div>
            </div>

            {/* Links */}
            <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: C.textMuted }}>
              <button onClick={() => navigate('/terms')}
                className="hover:opacity-70 transition-opacity">Terms</button>
              <a href="mailto:sales@risk360.co" className="hover:opacity-70 transition-opacity">Contact</a>
              <button onClick={() => navigate('/login')}
                className="hover:opacity-70 transition-opacity">Sign in</button>
              <span>© {new Date().getFullYear()} SafeGuard360</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Enterprise modal */}
      {showModal && <EnterpriseModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
