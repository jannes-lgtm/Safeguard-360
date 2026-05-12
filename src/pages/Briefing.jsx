import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Shield, AlertTriangle, CheckCircle2, FileText, ChevronDown,
  Plane, Calendar, MapPin, AlertCircle, Activity, Heart,
  Scale, Phone, List, ClipboardCheck, Lock, Printer,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const RISK_STYLE = {
  Critical: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'CRITICAL' },
  High:     { color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA', label: 'HIGH' },
  Medium:   { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'MEDIUM' },
  Low:      { color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', label: 'LOW' },
}

const SECTION_META = [
  { key: 'destination_overview',    icon: MapPin,          title: 'Destination Overview' },
  { key: 'security_threats',        icon: AlertTriangle,   title: 'Security Threats' },
  { key: 'health_medical',          icon: Heart,           title: 'Health & Medical' },
  { key: 'legal_regulatory',        icon: Scale,           title: 'Legal & Regulatory' },
  { key: 'communication_protocols', icon: Phone,           title: 'Communication Protocols' },
  { key: 'in_country_guidance',     icon: Activity,        title: 'In-Country Safety Guidance' },
  { key: 'prohibited_activities',   icon: AlertCircle,     title: 'Restricted Activities & Areas' },
  { key: 'emergency_procedures',    icon: Shield,          title: 'Emergency Procedures' },
  { key: 'pre_departure_checklist', icon: List,            title: 'Pre-Departure Checklist' },
  { key: 'traveller_obligations',   icon: ClipboardCheck,  title: 'Traveller Obligations' },
]

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function Briefing() {
  const { briefingId } = useParams()
  const [briefing, setBriefing]       = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [user, setUser]               = useState(null)
  const [scrolled, setScrolled]       = useState(false)
  const [name, setName]               = useState('')
  const [checked, setChecked]         = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [ackAt, setAckAt]             = useState(null)
  const contentRef = useRef(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null))
  }, [])

  useEffect(() => {
    if (!briefingId) return
    supabase.from('travel_briefings')
      .select('*')
      .eq('id', briefingId)
      .single()
      .then(({ data, error: e }) => {
        if (e || !data) { setError('Briefing not found or you do not have access.'); setLoading(false); return }
        setBriefing(data)
        if (data.acknowledged_at) { setAcknowledged(true); setAckAt(data.acknowledged_at) }
        setName(data.traveller_name || '')
        setLoading(false)
      })
  }, [briefingId])

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollTop + clientHeight >= scrollHeight - 80) setScrolled(true)
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [briefing])

  const handleAcknowledge = async () => {
    if (!name.trim() || !checked || submitting) return
    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/acknowledge-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ briefing_id: briefingId, acknowledged_name: name.trim() }),
      })
      const data = await res.json()
      if (data.ok) {
        setAcknowledged(true)
        setAckAt(data.acknowledged_at)
      } else {
        alert(data.error || 'Failed to acknowledge. Please try again.')
      }
    } catch {
      alert('Network error. Please try again.')
    }
    setSubmitting(false)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F0F2F8' }}>
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: BRAND_BLUE }}>
          <FileText size={22} color="white" />
        </div>
        <p className="text-sm text-gray-500 font-medium">Loading briefing document…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F0F2F8' }}>
      <div className="text-center max-w-sm">
        <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
        <p className="text-sm text-gray-700 font-semibold mb-1">Document Unavailable</p>
        <p className="text-xs text-gray-400">{error}</p>
        <Link to="/dashboard" className="mt-4 inline-block text-xs font-semibold hover:underline" style={{ color: BRAND_BLUE }}>← Back to Dashboard</Link>
      </div>
    </div>
  )

  const s        = briefing.sections || {}
  const risk     = RISK_STYLE[briefing.risk_level] || RISK_STYLE.Medium
  const sections = SECTION_META.filter(m => s[m.key])

  return (
    <div className="min-h-screen" style={{ background: '#F0F2F8' }}>
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-6 py-3 shadow-sm"
        style={{ background: BRAND_BLUE, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: BRAND_GREEN }}>
          <Shield size={14} color={BRAND_BLUE} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-white font-bold text-sm">Safeguard 360</span>
          <span className="text-white/50 text-xs ml-2">Pre-Travel Security Briefing</span>
        </div>
        <span className="text-[10px] font-bold font-mono px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
          {briefing.document_ref}
        </span>
        <button onClick={() => window.print()}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
          style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}>
          <Printer size={12} /> Print
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Document header */}
        <div className="bg-white rounded-2xl p-8 mb-4 shadow-sm border border-gray-100">
          {/* ISO badge */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <span className="text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg"
              style={{ background: `${BRAND_BLUE}10`, color: BRAND_BLUE, border: `1px solid ${BRAND_BLUE}20` }}>
              ISO 31030:2021 — Travel Risk Management
            </span>
            <span className="text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg"
              style={{ background: risk.bg, color: risk.color, border: `1px solid ${risk.border}` }}>
              {risk.label} RISK DESTINATION
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">
            Pre-Travel Security Briefing
          </h1>
          <p className="text-sm text-gray-400 mb-6">
            This document must be read in full and formally acknowledged before departure.
          </p>

          {/* Meta grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-5 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            {[
              { label: 'Traveller',   value: briefing.traveller_name, icon: Shield },
              { label: 'Organisation', value: briefing.org_name,       icon: FileText },
              { label: 'Destination', value: briefing.destination,      icon: MapPin },
              { label: 'Departs',     value: fmtDate(briefing.depart_date), icon: Plane },
              { label: 'Returns',     value: fmtDate(briefing.return_date), icon: Calendar },
              { label: 'Risk Level',  value: briefing.risk_level,      icon: AlertTriangle, color: risk.color },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
                <div className="flex items-center gap-1.5">
                  <Icon size={11} style={{ color: color || '#9CA3AF' }} />
                  <p className="text-sm font-bold" style={{ color: color || '#111827' }}>{value || '—'}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Unique document ref */}
          <div className="mt-4 flex items-center gap-2 text-[11px] text-gray-400">
            <Lock size={10} />
            <span>Document Reference: <span className="font-mono font-bold text-gray-600">{briefing.document_ref}</span></span>
            <span>·</span>
            <span>Generated: {fmtDateTime(briefing.generated_at)}</span>
          </div>
        </div>

        {/* Executive summary */}
        {s.executive_summary && (
          <div className="rounded-2xl p-6 mb-4" style={{ background: risk.bg, border: `1px solid ${risk.border}` }}>
            <div className="flex items-center gap-2.5 mb-3">
              <AlertTriangle size={16} style={{ color: risk.color }} />
              <h2 className="text-sm font-bold" style={{ color: risk.color }}>Executive Summary</h2>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: risk.color }}>{s.executive_summary}</p>
          </div>
        )}

        {/* Scrollable sections */}
        <div ref={contentRef} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-y-auto mb-4"
          style={{ maxHeight: acknowledged ? 'none' : '520px' }}>

          {!scrolled && !acknowledged && (
            <div className="sticky top-0 z-10 flex items-center justify-center gap-2 py-2 text-xs font-semibold"
              style={{ background: `${BRAND_BLUE}08`, borderBottom: `1px solid ${BRAND_BLUE}12`, color: BRAND_BLUE }}>
              <ChevronDown size={13} className="animate-bounce" />
              Scroll to read the full briefing before acknowledging
            </div>
          )}

          <div className="divide-y divide-gray-50">
            {sections.map(({ key, icon: Icon, title }) => {
              const content = s[key]
              return (
                <div key={key} className="px-7 py-6">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${BRAND_BLUE}10` }}>
                      <Icon size={13} style={{ color: BRAND_BLUE }} />
                    </div>
                    <h3 className="text-sm font-bold text-gray-900">{title}</h3>
                  </div>

                  {Array.isArray(content) ? (
                    <ul className="space-y-2">
                      {content.map((item, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700 leading-relaxed">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                            style={{ background: `${BRAND_BLUE}12`, color: BRAND_BLUE }}>{i + 1}</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-700 leading-relaxed">{content}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Acknowledgement section */}
        {acknowledged ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-green-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#ECFDF5' }}>
                <CheckCircle2 size={22} style={{ color: '#059669' }} />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Briefing Acknowledged</h2>
                <p className="text-xs text-gray-400">Your travel administrator has been notified.</p>
              </div>
            </div>
            <div className="rounded-xl p-4 mb-4" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Acknowledged by</p>
                  <p className="text-sm font-bold text-gray-900">{briefing.acknowledged_name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Date & Time</p>
                  <p className="text-sm font-bold text-gray-900">{fmtDateTime(ackAt)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Document Reference</p>
                  <p className="text-sm font-mono font-bold text-gray-900">{briefing.document_ref}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">ISO Standard</p>
                  <p className="text-sm font-bold text-gray-900">ISO 31030:2021</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              This acknowledgement is stored in the Safeguard 360 audit trail and constitutes a formal record of
              pre-travel briefing compliance under ISO 31030:2021 Clause 6.2.
            </p>
            <Link to="/itinerary"
              className="mt-4 inline-flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
              style={{ background: BRAND_BLUE, color: '#fff' }}>
              <Plane size={14} /> View My Trips
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${BRAND_BLUE}10` }}>
                <ClipboardCheck size={14} style={{ color: BRAND_BLUE }} />
              </div>
              <h2 className="text-sm font-bold text-gray-900">Formal Acknowledgement</h2>
            </div>

            <p className="text-sm text-gray-600 leading-relaxed mb-6">
              By signing below, I confirm that I have read and understood this Pre-Travel Security Briefing in its
              entirety. I acknowledge the risks associated with travel to <strong>{briefing.destination}</strong>,
              and I commit to following the safety protocols, emergency procedures, and communication requirements
              described in this document, in compliance with <strong>ISO 31030:2021</strong>.
            </p>

            {!scrolled && (
              <div className="flex items-center gap-2 text-xs font-semibold rounded-xl px-4 py-3 mb-5"
                style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                <ChevronDown size={13} />
                Please scroll through the full document before acknowledging.
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Full name (type exactly as it appears on your ID) *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={!scrolled}
                  placeholder="Your full legal name"
                  className="w-full text-sm rounded-xl px-4 py-3 outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ border: `1.5px solid ${scrolled ? BRAND_BLUE + '40' : '#E5E7EB'}`, background: scrolled ? '#fff' : '#F9FAFB' }}
                />
              </div>

              <label className={`flex items-start gap-3 rounded-xl p-4 cursor-pointer transition-all ${!scrolled ? 'opacity-40 cursor-not-allowed' : ''}`}
                style={{ background: checked ? `${BRAND_BLUE}08` : '#F8FAFC', border: `1.5px solid ${checked ? BRAND_BLUE + '30' : '#E2E8F0'}` }}>
                <input type="checkbox" checked={checked} onChange={e => scrolled && setChecked(e.target.checked)}
                  disabled={!scrolled} className="mt-0.5 shrink-0 accent-blue-700" />
                <span className="text-xs text-gray-700 leading-relaxed">
                  I confirm I have read, understood, and agree to comply with this Pre-Travel Security Briefing.
                  I understand this acknowledgement is legally binding and forms part of my organisation's duty of care record under ISO 31030:2021.
                </span>
              </label>

              <button
                onClick={handleAcknowledge}
                disabled={!scrolled || !name.trim() || !checked || submitting}
                className="w-full py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: BRAND_BLUE, color: '#fff' }}>
                {submitting ? 'Submitting…' : 'Formally Acknowledge Briefing'}
              </button>

              <p className="text-[10px] text-center text-gray-400 leading-relaxed">
                Your acknowledgement will be timestamped and sent to your travel administrator.
                Reference: <span className="font-mono font-bold">{briefing.document_ref}</span>
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; }
          .sticky, button { display: none !important; }
          div[style*="maxHeight"] { max-height: none !important; overflow: visible !important; }
        }
      `}</style>
    </div>
  )
}
