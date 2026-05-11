import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart2, Bell, Plane, Radio, Globe, AlertCircle,
  Calendar, ChevronRight, Brain, Zap, AlertTriangle,
  ListChecks, RefreshCw, X, CheckCircle2, BookOpen,
  FileText, CheckSquare, Award, Users, ClipboardList,
  Clock, Building2, Headphones, Shield, GraduationCap,
  Pencil, Navigation, MapPin, Send, MessageSquare, Sparkles, Activity,
} from 'lucide-react'
import L from 'leaflet'
import Layout from '../components/Layout'
import MetricCard from '../components/MetricCard'
import SeverityBadge from '../components/SeverityBadge'
import IntelBrief from '../components/IntelBrief'
import { supabase } from '../lib/supabase'
import { cityToCountry, SEVERITY_STYLE, COUNTRY_META } from '../data/intelData'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 }
const ALERT_TYPE_ICON = {
  disaster: '🌋', earthquake: '🔴', flight: '✈️',
  weather: '⛈️', security: '🛡️', health: '🏥', political: '🏛️',
}
const SEVERITY_PILL = {
  Critical: { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA', bar: '#EF4444' },
  High:     { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA', bar: '#F97316' },
  Medium:   { bg: '#FEFCE8', color: '#A16207', border: '#FEF08A', bar: '#EAB308' },
  Low:      { bg: '#F8FAFC', color: '#475569', border: '#E2E8F0', bar: '#94A3B8' },
  Info:     { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', bar: '#3B82F6' },
}
const severityDot = { Critical: '#EF4444', High: '#F97316', Medium: '#EAB308', Low: '#94A3B8' }

function fmtEventDate(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'
}

// ── Trip Alerts ───────────────────────────────────────────────────────────────
function TripAlertsSection({ alerts, onMarkRead, onDismissAll }) {
  const sorted = [...alerts].sort((a, b) => {
    const so = (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5)
    return so !== 0 ? so : new Date(b.created_at) - new Date(a.created_at)
  })
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <AlertTriangle size={15} style={{ color: '#F97316' }} />
          <h2 className="text-sm font-bold text-gray-800">Trip Alerts</h2>
          <span className="text-[10px] font-bold rounded-full px-2 py-0.5"
            style={{ background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' }}>
            {alerts.length}
          </span>
        </div>
        <button onClick={onDismissAll} className="text-xs text-gray-400 hover:text-gray-600 font-medium">
          Dismiss all
        </button>
      </div>
      <div className="space-y-2">
        {sorted.map(alert => {
          const pill = SEVERITY_PILL[alert.severity] || SEVERITY_PILL.Low
          return (
            <div key={alert.id} className="rounded-2xl flex items-start gap-3 p-4 transition-all"
              style={{ background: pill.bg, border: `1px solid ${pill.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="w-0.5 self-stretch rounded-full shrink-0 mt-0.5" style={{ background: pill.bar }} />
              <span className="text-lg shrink-0 leading-none mt-0.5">{ALERT_TYPE_ICON[alert.alert_type] || '⚠️'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-1">{alert.title}</p>
                  <button onClick={() => onMarkRead(alert.id)}
                    className="shrink-0 p-0.5 rounded-md transition-colors hover:bg-black/5"
                    style={{ color: pill.color, opacity: 0.5 }}>
                    <X size={13} />
                  </button>
                </div>
                {alert.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{alert.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                    style={{ background: pill.bar + '20', color: pill.color }}>{alert.severity}</span>
                  {alert.trip_name && (
                    <span className="text-[10px] bg-white/80 border border-gray-200 text-gray-500 rounded-full px-2 py-0.5 font-medium">
                      {alert.trip_name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── ISO Compliance Score ──────────────────────────────────────────────────────
function ComplianceScoreCard({ breakdown, loading }) {
  if (loading && !breakdown) {
    return (
      <div className="bg-white rounded-2xl p-6 animate-pulse"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-full bg-gray-100 shrink-0" />
          <div className="flex-1 space-y-3">
            <div className="h-3 bg-gray-100 rounded-full" />
            <div className="h-3 bg-gray-100 rounded-full w-4/5" />
            <div className="h-3 bg-gray-100 rounded-full w-3/5" />
          </div>
        </div>
      </div>
    )
  }
  const score  = breakdown?.total ?? 0
  const rating =
    score >= 90 ? { label: 'Excellent',      color: '#059669', bg: '#ECFDF5', border: '#BBF7D0' } :
    score >= 70 ? { label: 'Good',            color: BRAND_BLUE, bg: `${BRAND_BLUE}0D`, border: `${BRAND_BLUE}25` } :
    score >= 50 ? { label: 'Needs Attention', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' } :
                  { label: 'At Risk',         color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' }
  const R    = 38
  const C    = 2 * Math.PI * R
  const fill = (score / 100) * C
  const components = breakdown ? [
    { label: 'ISO Training',     icon: BookOpen,    pct: breakdown.training.pct, sub: `${breakdown.training.done}/${breakdown.training.total} modules`, link: '/training', color: BRAND_BLUE },
    { label: 'Policy Sign-offs', icon: FileText,    pct: breakdown.policies.pct, sub: `${breakdown.policies.done}/${breakdown.policies.total} policies`, link: '/policies', color: '#7C3AED' },
    { label: 'Travel Check-ins', icon: CheckSquare, pct: breakdown.checkin.pct,  sub: breakdown.checkin.hasTrips ? (breakdown.checkin.done > 0 ? 'Recent check-in on file' : 'No check-ins yet') : 'No active trips', link: '/checkin', color: '#059669' },
  ] : []

  return (
    <div className="bg-white rounded-2xl p-6"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)' }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${BRAND_BLUE}12` }}>
            <Award size={13} style={{ color: BRAND_BLUE }} />
          </div>
          <h2 className="text-sm font-bold text-gray-900">My ISO Compliance</h2>
        </div>
        {breakdown && (
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
            style={{ background: rating.bg, color: rating.color, border: `1px solid ${rating.border}` }}>
            {rating.label}
          </span>
        )}
      </div>
      <div className="flex items-center gap-6">
        <div className="shrink-0 relative w-24 h-24">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r={R} fill="none" stroke="#EEF0F6" strokeWidth="8" />
            <circle cx="48" cy="48" r={R} fill="none" stroke={rating.color} strokeWidth="8"
              strokeLinecap="round" strokeDasharray={`${fill} ${C}`} strokeDashoffset={C * 0.25}
              style={{ transition: 'stroke-dasharray 0.8s ease' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-black leading-none" style={{ color: rating.color }}>{score}%</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">Score</span>
          </div>
        </div>
        <div className="flex-1 space-y-3 min-w-0">
          {components.map(c => {
            const Icon = c.icon
            return (
              <Link key={c.label} to={c.link} className="flex items-center gap-2.5 group">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${c.color}12` }}>
                  <Icon size={11} style={{ color: c.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">{c.label}</span>
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: c.color }}>{c.pct}%</span>
                  </div>
                  <div className="h-1 rounded-full w-full" style={{ background: '#EEF0F6' }}>
                    <div className="h-1 rounded-full transition-all duration-700" style={{ width: `${c.pct}%`, background: c.color }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
      <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid #F1F5F9' }}>
        <p className="text-[10px] text-gray-400">Training 40% · Policies 40% · Check-ins 20%</p>
        <Link to="/training" className="text-xs font-semibold hover:underline flex items-center gap-1" style={{ color: BRAND_BLUE }}>
          Improve score <ChevronRight size={11} />
        </Link>
      </div>
    </div>
  )
}

// ── Corporate Admin: org compliance panel ─────────────────────────────────────
function OrgCompliancePanel({ orgStats, loading }) {
  if (loading) return (
    <div className="bg-white rounded-2xl p-6 animate-pulse border border-gray-100">
      <div className="h-4 bg-gray-100 rounded-full w-40 mb-4" />
      <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-50 rounded-xl"/>)}</div>
    </div>
  )
  if (!orgStats) return null

  const items = [
    { label: 'Training Completion',  pct: orgStats.trainPct,  color: BRAND_BLUE,   icon: BookOpen,    link: '/org/users' },
    { label: 'Policy Sign-offs',     pct: orgStats.polPct,    color: '#7C3AED',    icon: FileText,    link: '/org/users' },
    { label: 'Check-in Compliance',  pct: orgStats.checkinPct, color: '#059669',   icon: CheckSquare, link: '/tracker' },
  ]
  const overall = Math.round(orgStats.trainPct * 0.4 + orgStats.polPct * 0.4 + orgStats.checkinPct * 0.2)
  const rating  =
    overall >= 90 ? { label: 'Excellent',      color: '#059669' } :
    overall >= 70 ? { label: 'Good',            color: BRAND_BLUE } :
    overall >= 50 ? { label: 'Needs Attention', color: '#D97706' } :
                    { label: 'At Risk',         color: '#DC2626' }

  return (
    <div className="bg-white rounded-2xl p-6"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)' }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${BRAND_BLUE}12` }}>
            <Shield size={13} style={{ color: BRAND_BLUE }} />
          </div>
          <h2 className="text-sm font-bold text-gray-900">Organisation Compliance</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl font-black" style={{ color: rating.color }}>{overall}%</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{rating.label}</span>
        </div>
      </div>
      <div className="space-y-3">
        {items.map(item => {
          const Icon = item.icon
          return (
            <Link key={item.label} to={item.link} className="flex items-center gap-3 group">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${item.color}12` }}>
                <Icon size={12} style={{ color: item.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">{item.label}</span>
                  <span className="text-xs font-bold" style={{ color: item.color }}>{item.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full w-full bg-gray-100">
                  <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${item.pct}%`, background: item.color }} />
                </div>
              </div>
            </Link>
          )
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-gray-50">
        <Link to="/org/users" className="text-xs font-semibold hover:underline flex items-center gap-1" style={{ color: BRAND_BLUE }}>
          View individual scores <ChevronRight size={11} />
        </Link>
      </div>
    </div>
  )
}

// ── Quick Actions ─────────────────────────────────────────────────────────────
function QuickActions({ role, hasActiveTrip }) {
  const travellerActions = [
    {
      icon: Plane,
      label: 'Book Travel',
      desc: 'Add a new trip to your itinerary',
      to: '/itinerary',
      color: BRAND_BLUE,
      bg: `${BRAND_BLUE}0F`,
    },
    {
      icon: GraduationCap,
      label: 'Start Training',
      desc: 'Complete your ISO safety modules',
      to: '/training',
      color: '#7C3AED',
      bg: '#F5F3FF',
    },
    {
      icon: Shield,
      label: 'Country Risk Report',
      desc: 'Get destination safety intelligence',
      to: '/country-risk',
      color: '#059669',
      bg: '#ECFDF5',
    },
    {
      icon: Pencil,
      label: hasActiveTrip ? 'Update My Trip' : 'My Trips',
      desc: hasActiveTrip ? 'Edit your current travel plans' : 'View and manage your upcoming trips',
      to: '/itinerary',
      color: '#D97706',
      bg: '#FFF7ED',
    },
  ]

  const adminActions = [
    {
      icon: ClipboardList,
      label: 'Travel Approvals',
      desc: 'Review and approve pending trips',
      to: '/approvals',
      color: '#D97706',
      bg: '#FFF7ED',
    },
    {
      icon: Navigation,
      label: 'Staff Tracker',
      desc: 'See where your travellers are now',
      to: '/tracker',
      color: BRAND_BLUE,
      bg: `${BRAND_BLUE}0F`,
    },
    {
      icon: GraduationCap,
      label: 'Company Training',
      desc: 'Manage team training & compliance',
      to: '/org/training',
      color: '#7C3AED',
      bg: '#F5F3FF',
    },
    {
      icon: Shield,
      label: 'Country Risk Report',
      desc: 'Check destination risk levels',
      to: '/country-risk',
      color: '#059669',
      bg: '#ECFDF5',
    },
  ]

  const actions = role === 'admin' ? adminActions : travellerActions

  return (
    <div className="mb-7">
      <div className="flex items-center gap-2.5 mb-3">
        <h2 className="text-sm font-bold text-gray-900">Quick Actions</h2>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {actions.map(action => {
          const Icon = action.icon
          return (
            <Link
              key={action.label}
              to={action.to}
              className="bg-white rounded-2xl p-4 flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 group"
              style={{
                boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.03)',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: action.bg }}
              >
                <Icon size={17} style={{ color: action.color }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900 group-hover:text-[#0118A1] transition-colors leading-tight mb-0.5">
                  {action.label}
                </p>
                <p className="text-[11px] text-gray-400 leading-snug">{action.desc}</p>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-semibold transition-all"
                style={{ color: action.color }}>
                Go <ChevronRight size={11} className="transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// Module name lookup (mirrors Training.jsx static list, keyed by module_order)
const MODULE_NAMES = {
  1: 'Introduction to Travel Safety',
  2: 'Risk Assessment & Planning',
  3: 'Emergency Response Procedures',
  4: 'Cultural Awareness & Local Laws',
  5: 'Health & Medical Preparedness',
  6: 'Digital Security Abroad',
  7: 'Kidnap & Ransom Awareness',
  8: 'Duty of Care & Reporting',
}

// ── Overdue Check-in Banner ───────────────────────────────────────────────────
function OverdueCheckinBanner({ checkin }) {
  if (!checkin) return null
  const hoursOverdue = Math.round((Date.now() - new Date(checkin.due_at).getTime()) / 3600000)
  return (
    <Link to="/checkin"
      className="flex items-center gap-4 rounded-2xl px-5 py-4 mb-6 transition-all hover:brightness-95 group"
      style={{ background: 'linear-gradient(135deg, #FEF2F2 0%, #FFF1F1 100%)', border: '1px solid #FECACA', boxShadow: '0 2px 12px rgba(239,68,68,0.12)' }}>
      {/* Pulsing dot */}
      <div className="relative shrink-0">
        <span className="absolute inline-flex h-4 w-4 rounded-full bg-red-400 opacity-75 animate-ping" />
        <span className="relative inline-flex h-4 w-4 rounded-full bg-red-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-red-700 leading-tight">
          Check-in overdue{checkin.label ? ` · ${checkin.label}` : ''}
        </p>
        <p className="text-xs text-red-400 mt-0.5">
          {hoursOverdue < 1 ? 'Due a few minutes ago' : `${hoursOverdue}h overdue`} — tap to confirm you're safe
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-sm font-bold text-red-600 shrink-0 group-hover:gap-2 transition-all">
        Check in now <ChevronRight size={15} />
      </div>
    </Link>
  )
}

// ── Assistance CTA ────────────────────────────────────────────────────────────
function AssistanceCTA() {
  return (
    <Link to="/assistance"
      className="flex items-center gap-4 rounded-2xl px-5 py-4 mb-6 mt-1 transition-all hover:brightness-98 group"
      style={{ background: `linear-gradient(135deg, ${BRAND_BLUE}0A 0%, ${BRAND_BLUE}05 100%)`, border: `1px solid ${BRAND_BLUE}18` }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: BRAND_BLUE }}>
        <Headphones size={16} color="white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 leading-tight">24/7 Emergency Support</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Operators standing by · Medical, security, evacuation & more
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: '#ECFDF5', color: '#059669', border: '1px solid #BBF7D0' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
          Live
        </span>
        <ChevronRight size={15} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
    </Link>
  )
}

// ── Training Nudge ────────────────────────────────────────────────────────────
function TrainingNudge({ module: mod, score }) {
  if (!mod || score >= 70) return null
  const name = mod.module_name || MODULE_NAMES[mod.module_order] || `Module ${mod.module_order}`
  // Rough estimate: each module is worth ~12.5% of training (40% of total / 8 modules)
  const gainEst = Math.round(12.5 * 0.4)
  return (
    <Link to="/training"
      className="flex items-center gap-4 rounded-2xl px-5 py-4 mb-6 transition-all hover:brightness-97 group"
      style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FAF8FF 100%)', border: '1px solid #DDD6FE', boxShadow: '0 2px 12px rgba(124,58,237,0.06)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#7C3AED' }}>
        <GraduationCap size={16} color="white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-purple-900 leading-tight">Complete your next training module</p>
        <p className="text-xs text-purple-500 mt-0.5 truncate">
          <span className="font-semibold">{name}</span> — raises your compliance score by ~{gainEst}%
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-sm font-bold text-purple-600 shrink-0 group-hover:gap-2 transition-all">
        Start <ChevronRight size={15} />
      </div>
    </Link>
  )
}

// ── Morning Brief ─────────────────────────────────────────────────────────────
const BRIEF_SEV_STYLE = {
  Critical: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
  High:     { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C' },
  Medium:   { bg: '#FEFCE8', border: '#FEF08A', text: '#A16207' },
  Low:      { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' },
}
function MorningBriefCard({ brief, loading }) {
  const [expanded, setExpanded] = useState(true)
  if (loading) {
    return (
      <div className="rounded-2xl p-5 mb-6 animate-pulse"
        style={{ background: 'linear-gradient(135deg, #EEF1FB 0%, #F4F6FD 100%)', border: `1px solid ${BRAND_BLUE}20` }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: BRAND_BLUE }}>
            <Brain size={16} color="white" />
          </div>
          <div className="h-3.5 w-44 bg-blue-100 rounded-full" />
          <RefreshCw size={12} className="ml-auto animate-spin" style={{ color: `${BRAND_BLUE}60` }} />
        </div>
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-2.5 bg-blue-50 rounded-full" style={{ width: i === 3 ? '65%' : i === 2 ? '80%' : '100%' }} />)}
        </div>
      </div>
    )
  }
  if (!brief) return null
  return (
    <div className="rounded-2xl mb-6 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #EEF1FB 0%, #F4F6FD 100%)', border: `1px solid ${BRAND_BLUE}20`, boxShadow: `0 2px 16px ${BRAND_BLUE}12` }}>
      <button className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/30 transition-colors"
        onClick={() => setExpanded(e => !e)}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: BRAND_BLUE }}>
          <Brain size={16} color="white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-bold text-gray-900">AI Intelligence Brief</span>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: `${BRAND_BLUE}15`, color: BRAND_BLUE }}>
              <Zap size={7} /> LIVE
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate">{brief.headline}</p>
        </div>
        <ChevronRight size={15} className="shrink-0 text-gray-400 transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }} />
      </button>
      {expanded && (
        <div className="px-5 pb-5 pt-4 space-y-4" style={{ borderTop: `1px solid ${BRAND_BLUE}10` }}>
          <p className="text-sm text-gray-700 font-medium leading-relaxed">{brief.headline}</p>
          {brief.situations?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Active Situations</p>
              <div className="space-y-2">
                {brief.situations.map((s, i) => {
                  const st = BRIEF_SEV_STYLE[s.severity] || BRIEF_SEV_STYLE.Medium
                  return (
                    <div key={i} className="rounded-xl px-3.5 py-2.5"
                      style={{ background: st.bg, border: `1px solid ${st.border}` }}>
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-xs font-bold" style={{ color: st.text }}>{s.country}</span>
                        <span className="text-[10px] font-semibold opacity-60" style={{ color: st.text }}>{s.severity}</span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: st.text, opacity: 0.85 }}>{s.summary}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {brief.priority_actions?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <ListChecks size={11} style={{ color: BRAND_BLUE }} />
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Priority Actions</p>
              </div>
              <ul className="space-y-1.5">
                {brief.priority_actions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-gray-700">
                    <span className="mt-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0"
                      style={{ background: `${BRAND_BLUE}12`, color: BRAND_BLUE }}>{i + 1}</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[10px] text-gray-400 text-right pt-1">Powered by Claude AI · Updates on each scan</p>
        </div>
      )}
    </div>
  )
}

// ── Trip Map ──────────────────────────────────────────────────────────────────
const RISK_PIN = {
  Critical: { fill: '#EF4444', stroke: '#B91C1C', r: 11 },
  High:     { fill: '#F97316', stroke: '#C2410C', r: 10 },
  Medium:   { fill: '#EAB308', stroke: '#A16207', r: 9  },
  Low:      { fill: '#22C55E', stroke: '#15803D', r: 8  },
  default:  { fill: '#6366F1', stroke: '#4338CA', r: 8  },
}

function TripMapSection({ trips, destRisk, onCountryClick }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !trips.length) return

    const map = L.map(containerRef.current, {
      center: [20, 20], zoom: 2,
      zoomControl: true, scrollWheelZoom: false,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com">CARTO</a>',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map)

    const todayISO = new Date().toISOString().split('T')[0]
    const bounds   = []

    trips.forEach(trip => {
      const country = cityToCountry(trip.arrival_city) || trip.arrival_city
      const coords  = COUNTRY_META[country]
      if (!coords) return

      const isActive = trip.depart_date <= todayISO && trip.return_date >= todayISO
      const sev      = destRisk[country]?.severity || 'default'
      const pin      = RISK_PIN[sev] || RISK_PIN.default
      const r        = isActive ? pin.r + 3 : pin.r

      const marker = L.circleMarker([coords.lat, coords.lon], {
        radius: r, color: pin.stroke, fillColor: pin.fill,
        fillOpacity: isActive ? 0.9 : 0.65, weight: 2,
      })

      marker.bindPopup(`
        <div style="font-family:sans-serif;padding:4px 0;min-width:160px">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">${trip.trip_name}</div>
          <div style="font-size:11px;color:#6b7280;margin-bottom:6px">${trip.arrival_city}${country !== trip.arrival_city ? ` · ${country}` : ''}</div>
          ${isActive ? '<div style="font-size:10px;font-weight:700;color:#0118A1;margin-bottom:8px">✈️ Active now</div>' : `<div style="font-size:10px;color:#9ca3af;margin-bottom:8px">${trip.depart_date} → ${trip.return_date}</div>`}
          <button onclick="window.__dashGoto('${country.replace(/'/g, "\\'")}')"
            style="display:block;width:100%;background:#0118A1;color:#fff;border:none;
              border-radius:6px;padding:6px 12px;font-size:11px;font-weight:600;cursor:pointer">
            View Risk Report →
          </button>
        </div>`)

      marker.addTo(map)
      bounds.push([coords.lat, coords.lon])
    })

    if (bounds.length > 0) {
      try { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 }) } catch { /* ignore */ }
    }

    window.__dashGoto = (country) => {
      onCountryClick(country)
      map.closePopup()
    }

    mapRef.current = map

    return () => {
      delete window.__dashGoto
      map.remove()
      mapRef.current = null
    }
  }, [trips, destRisk, onCountryClick])

  if (!trips.length) return null

  return (
    <div className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${BRAND_BLUE}12` }}>
            <Globe size={13} style={{ color: BRAND_BLUE }} />
          </div>
          <h2 className="text-sm font-bold text-gray-900">My Travel Map</h2>
        </div>
        <div className="flex items-center gap-3">
          {Object.entries(RISK_PIN).filter(([k]) => k !== 'default').map(([k, v]) => (
            <div key={k} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: v.fill }} />
              <span className="text-[10px] text-gray-400 font-medium">{k}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)' }}>
        <div ref={containerRef} style={{ height: 300 }} />
      </div>
    </div>
  )
}

// ── Dashboard AI Chat ─────────────────────────────────────────────────────────
function DashboardAiChat({ profile, trips, orgName, role }) {
  const tripSummary = trips.slice(0, 6).map(t => {
    const country = cityToCountry(t.arrival_city) || t.arrival_city
    return `${t.trip_name} (${country}, ${t.depart_date}→${t.return_date})`
  }).join('; ') || 'No upcoming trips.'

  const initialMsg = role === 'admin' || role === 'org_admin'
    ? `Hi! I'm your AI security analyst for ${orgName || 'your organisation'}. Ask me about destination risks, duty of care, traveller safety, or any security concern.`
    : `Hi${profile?.full_name ? ` ${profile.full_name.split(' ')[0]}` : ''}! I'm your AI travel security analyst. Ask me about risk levels, safe areas, what to do in an emergency, or anything about your upcoming trips.`

  const [messages, setMessages] = useState([{ role: 'assistant', text: initialMsg }])
  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const bottomRef               = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const QUICK = role === 'admin' || role === 'org_admin'
    ? ['What are the highest risk destinations my staff may travel to?', 'What is our duty of care?', 'Summarise current global threat landscape']
    : trips.length
      ? [`What should I know before travelling to ${cityToCountry(trips[0]?.arrival_city) || trips[0]?.arrival_city}?`, 'What to do in a medical emergency abroad?', 'What vaccinations might I need?']
      : ['What are the safest countries to travel to right now?', 'What should I pack for a business trip?', 'How do I stay safe in high-risk areas?']

  const send = async (msg) => {
    const text = (msg || input).trim()
    if (!text || sending) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setSending(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({
          message: text,
          context: {
            travelerName: profile?.full_name,
            activeTrips:  tripSummary,
            orgName,
            mode: 'dashboard',
          },
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply || data.error || 'No response received.' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Failed to reach AI assistant. Please try again.' }])
    }
    setSending(false)
  }

  return (
    <div className="bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: `linear-gradient(135deg, ${BRAND_BLUE}08 0%, ${BRAND_BLUE}04 100%)`, borderBottom: `1px solid ${BRAND_BLUE}12` }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: BRAND_BLUE }}>
          <Brain size={16} color="white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">AI Security Analyst</span>
            <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${BRAND_BLUE}15`, color: BRAND_BLUE }}>
              <Zap size={7} /> LIVE
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">Ask anything about travel risk, destinations, or security</p>
        </div>
      </div>

      {/* Messages */}
      <div className="p-4 space-y-3 max-h-72 overflow-y-auto bg-gray-50/60">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mr-2 mt-0.5" style={{ background: `${BRAND_BLUE}12` }}>
                <Brain size={11} style={{ color: BRAND_BLUE }} />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
              m.role === 'user'
                ? 'text-white rounded-br-[4px]'
                : 'bg-white border border-gray-100 text-gray-700 rounded-bl-[4px] shadow-sm'
            }`} style={m.role === 'user' ? { backgroundColor: BRAND_BLUE } : {}}>
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mr-2 mt-0.5" style={{ background: `${BRAND_BLUE}12` }}>
              <Brain size={11} style={{ color: BRAND_BLUE }} />
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-[4px] px-3.5 py-2.5 shadow-sm">
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions */}
      {messages.length <= 1 && (
        <div className="px-4 py-3 flex flex-wrap gap-2" style={{ borderTop: '1px solid #F1F5F9' }}>
          {QUICK.map((q, i) => (
            <button key={i} onClick={() => send(q)}
              className="text-[11px] font-medium px-3 py-1.5 rounded-full border transition-colors hover:border-[#0118A1] hover:text-[#0118A1] text-gray-500 border-gray-200 bg-white">
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white" style={{ borderTop: '1px solid #F1F5F9' }}>
        <input
          className="flex-1 text-xs text-gray-800 placeholder-gray-400 outline-none bg-transparent"
          placeholder="Ask about risk, safety, destinations…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          disabled={sending}
        />
        <button onClick={() => send()}
          disabled={!input.trim() || sending}
          className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors disabled:opacity-40"
          style={{ backgroundColor: BRAND_BLUE }}>
          <Send size={13} color="white" />
        </button>
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [role, setRole]                 = useState(null)
  const [profile, setProfile]           = useState(null)

  // Shared
  const [loading, setLoading]           = useState(true)
  const [recentAlerts, setRecentAlerts] = useState([])
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [morningBrief, setMorningBrief] = useState(null)
  const [briefLoading, setBriefLoading] = useState(false)

  // Traveller / Solo
  const [complianceBreakdown, setComplianceBreakdown] = useState(null)
  const [myTrips, setMyTrips]           = useState([])
  const [destRisk, setDestRisk]         = useState({})
  const [destAlerts, setDestAlerts]     = useState({})
  const [tripAlerts, setTripAlerts]     = useState([])
  const [dismissedIds, setDismissedIds] = useState(() => new Set())
  const [metrics, setMetrics]           = useState({ activeAlerts: 0, staffTravelling: 0, activeFeeds: 0 })
  const [overdueCheckin, setOverdueCheckin] = useState(null)   // { id, due_at, label }
  const [nudgeModule, setNudgeModule]   = useState(null)       // { module_order, module_name }

  // Corporate Admin
  const [orgStats, setOrgStats]           = useState(null)
  const [adminMetrics, setAdminMetrics]   = useState({ travellers: 0, travelling: 0, pendingApprovals: 0, overdueCheckins: 0 })
  const [activeTravellers, setActiveTravellers] = useState([]) // { profile, trip }
  const [latestCheckins, setLatestCheckins]     = useState([]) // { user_id, lat, lng, label, completed_at, name }

  // Developer
  const [devMetrics, setDevMetrics]     = useState({ orgs: 0, travellers: 0, activeTrips: 0, controlRoom: 0 })
  const [healthIssues, setHealthIssues] = useState([])

  const loadingRef = useRef(false)

  const load = useCallback(async ({ scanAlerts = false } = {}) => {
    if (loadingRef.current) return
    loadingRef.current = true

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { loadingRef.current = false; return }

    const uid   = session.user.id
    const today = new Date().toISOString().split('T')[0]

    // Load profile + role first
    const { data: prof } = await supabase.from('profiles').select('*, organisations(name)').eq('id', uid).single()
    const userRole = prof?.role || session.user.app_metadata?.role || 'traveller'
    setRole(userRole)
    setProfile({ ...prof, id: uid, email: session.user.email })

    // Always load recent global alerts
    const { data: alerts } = await supabase.from('alerts').select('*')
      .eq('status', 'Active').order('date_issued', { ascending: false }).limit(4)
    setRecentAlerts(alerts || [])

    // ── DEVELOPER ─────────────────────────────────────────────────────────────
    if (userRole === 'developer') {
      const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const [
        { count: orgCount },
        { count: travellerCount },
        { count: tripCount },
        { count: crCount },
        { count: alertCount },
        feedStatuses,
        { data: pendingOrgs },
        { data: orphanedAdmins },
        { data: stuckOnboarding },
        { data: noTerms },
        { data: allOrgs },
        { data: allProfiles },
      ] = await Promise.all([
        supabase.from('organisations').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).neq('role', 'developer'),
        supabase.from('itineraries').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
        supabase.from('control_room_requests').select('*', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
        supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
        fetch('/api/feed-status').then(r => r.json()).catch(() => ({})),
        // Health: orgs awaiting approval
        supabase.from('organisations').select('id,name,created_at').eq('approval_status', 'pending'),
        // Health: org_admins with no org linked
        supabase.from('profiles').select('id,full_name,email,created_at').eq('role', 'org_admin').is('org_id', null),
        // Health: travellers stuck in onboarding >48h
        supabase.from('profiles').select('id,full_name,email,created_at')
          .in('role', ['traveller', 'solo']).is('onboarding_completed_at', null).lt('created_at', cutoff48h),
        // Health: users who never accepted terms >24h after signup
        supabase.from('profiles').select('id,full_name,email,created_at')
          .is('terms_version', null).lt('created_at', cutoff24h).neq('role', 'developer'),
        // Health: empty orgs (need org member counts)
        supabase.from('organisations').select('id,name'),
        supabase.from('profiles').select('org_id').not('org_id', 'is', null),
      ])

      const activeFeeds = Object.values(feedStatuses || {}).filter(s => s === 'active').length

      // Derive empty orgs
      const orgMemberCounts = {}
      ;(allProfiles || []).forEach(p => { orgMemberCounts[p.org_id] = (orgMemberCounts[p.org_id] || 0) + 1 })
      const emptyOrgs = (allOrgs || []).filter(o => !orgMemberCounts[o.id])

      const issues = []
      if ((crCount || 0) > 0)
        issues.push({ severity: 'critical', label: 'Active SOS / control room requests', count: crCount, link: '/control-room' })
      if ((pendingOrgs || []).length > 0)
        issues.push({ severity: 'warning', label: 'Organisations awaiting approval', count: pendingOrgs.length, link: '/organisations' })
      if ((orphanedAdmins || []).length > 0)
        issues.push({ severity: 'warning', label: 'Org admins with no organisation linked', count: orphanedAdmins.length, link: '/admin' })
      if ((stuckOnboarding || []).length > 0)
        issues.push({ severity: 'warning', label: 'Travellers stuck in onboarding (>48 h)', count: stuckOnboarding.length, link: '/admin' })
      if ((noTerms || []).length > 0)
        issues.push({ severity: 'info', label: 'Users who never accepted terms (>24 h)', count: noTerms.length, link: '/admin' })
      if (emptyOrgs.length > 0)
        issues.push({ severity: 'info', label: 'Organisations with no members', count: emptyOrgs.length, link: '/organisations' })
      if ((alertCount || 0) > 0)
        issues.push({ severity: 'info', label: 'Active platform alerts', count: alertCount, link: '/alerts' })

      setDevMetrics({ orgs: orgCount || 0, travellers: travellerCount || 0, activeTrips: tripCount || 0, controlRoom: crCount || 0 })
      setMetrics({ activeAlerts: alertCount || 0, activeFeeds })
      setHealthIssues(issues)
      setLoading(false)
      loadingRef.current = false
      return
    }

    // ── CORPORATE ADMIN (admin + org_admin) ──────────────────────────────────
    if ((userRole === 'admin' || userRole === 'org_admin') && prof?.org_id) {
      const orgId = prof.org_id

      // Get all org travellers (full profiles)
      const { data: orgTravellerProfiles } = await supabase.from('profiles')
        .select('id, full_name, email').eq('org_id', orgId).eq('role', 'traveller')
      const orgIds = (orgTravellerProfiles || []).map(t => t.id)

      const [
        { count: alertCount },
        { count: travellingCount },
        { count: pendingCount },
        { data: overdueCheckins },
        { data: trainingRecs },
        { data: pols },
        acksResult,
        { data: allCheckins },
        feedStatuses,
        { data: activeTrips },
        { data: completedCheckins },
      ] = await Promise.all([
        supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
        orgIds.length
          ? supabase.from('itineraries').select('*', { count: 'exact', head: true })
              .in('user_id', orgIds).eq('status', 'Active')
          : Promise.resolve({ count: 0 }),
        orgIds.length
          ? supabase.from('itineraries').select('*', { count: 'exact', head: true })
              .in('user_id', orgIds).eq('approval_status', 'pending')
          : Promise.resolve({ count: 0 }),
        orgIds.length
          ? supabase.from('scheduled_checkins').select('id')
              .in('user_id', orgIds).eq('completed', false)
              .lt('due_at', new Date().toISOString())
          : Promise.resolve({ data: [] }),
        orgIds.length
          ? supabase.from('training_records').select('completed').in('user_id', orgIds)
          : Promise.resolve({ data: [] }),
        supabase.from('policies').select('id').eq('status', 'Active'),
        orgIds.length
          ? supabase.from('policy_acknowledgements').select('policy_id').in('user_id', orgIds)
          : Promise.resolve({ data: [] }),
        orgIds.length
          ? supabase.from('scheduled_checkins').select('id, completed').in('user_id', orgIds)
          : Promise.resolve({ data: [] }),
        fetch('/api/feed-status').then(r => r.json()).catch(() => ({})),
        // Active trips for travelling panel
        orgIds.length
          ? supabase.from('itineraries').select('*').in('user_id', orgIds).eq('status', 'Active')
          : Promise.resolve({ data: [] }),
        // Latest completed check-ins with location
        orgIds.length
          ? supabase.from('scheduled_checkins')
              .select('user_id, completed_at, latitude, longitude, location_label')
              .in('user_id', orgIds).eq('completed', true)
              .order('completed_at', { ascending: false }).limit(50)
          : Promise.resolve({ data: [] }),
      ])

      const acks      = acksResult?.data || []
      const trainPct  = trainingRecs?.length ? Math.round(trainingRecs.filter(r => r.completed).length / trainingRecs.length * 100) : 0
      const polPct    = pols?.length && acks.length ? Math.round(acks.length / (pols.length * Math.max(orgIds.length, 1)) * 100) : 0
      const totalSch  = allCheckins?.length || 0
      const doneSch   = (allCheckins || []).filter(c => c.completed).length
      const checkinPct = totalSch > 0 ? Math.round(doneSch / totalSch * 100) : 100

      // Build active travellers list: join trip → profile
      const profileMap = {}
      ;(orgTravellerProfiles || []).forEach(p => { profileMap[p.id] = p })
      const travellerList = (activeTrips || []).map(trip => ({
        trip,
        profile: profileMap[trip.user_id] || { full_name: 'Unknown', email: '' },
      }))

      // Latest check-in per user (with location)
      const seenUsers = new Set()
      const checkinList = (completedCheckins || [])
        .filter(c => { if (seenUsers.has(c.user_id)) return false; seenUsers.add(c.user_id); return true })
        .map(c => ({ ...c, name: profileMap[c.user_id]?.full_name || 'Traveller' }))

      const activeFeeds = Object.values(feedStatuses || {}).filter(s => s === 'active').length
      setMetrics({ activeAlerts: alertCount || 0, activeFeeds })
      setAdminMetrics({
        travellers:       orgIds.length,
        travelling:       travellingCount || 0,
        pendingApprovals: pendingCount || 0,
        overdueCheckins:  overdueCheckins?.length || 0,
      })
      setOrgStats({ trainPct, polPct, checkinPct })
      setActiveTravellers(travellerList)
      setLatestCheckins(checkinList)
      setLoading(false)
      loadingRef.current = false
      return
    }

    // ── TRAVELLER / SOLO ──────────────────────────────────────────────────────
    const [
      { count: alertCount },
      { count: travelCount },
      feedStatuses,
      { data: trips },
    ] = await Promise.all([
      supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
      supabase.from('itineraries').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
      fetch('/api/feed-status').then(r => r.json()).catch(() => ({})),
      supabase.from('itineraries').select('*').eq('user_id', uid).gte('return_date', today).order('depart_date'),
    ])

    const [
      { data: trainingRecs },
      { data: pols },
      acksResult,
      { data: checkins },
      { data: overdueCheckins },
      { data: incompleteModules },
    ] = await Promise.all([
      supabase.from('training_records').select('completed, training_modules(module_order, title)').eq('user_id', uid),
      supabase.from('policies').select('id').eq('status', 'Active'),
      supabase.from('policy_acknowledgements').select('policy_id').eq('user_id', uid).then(r => r).catch(() => ({ data: [] })),
      supabase.from('staff_checkins').select('id').eq('user_id', uid)
        .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .then(r => r).catch(() => ({ data: [] })),
      supabase.from('scheduled_checkins').select('id, due_at, label')
        .eq('user_id', uid).eq('completed', false)
        .lt('due_at', new Date().toISOString())
        .order('due_at').limit(1)
        .then(r => r).catch(() => ({ data: [] })),
      supabase.from('training_records').select('id, training_modules(module_order, title)')
        .eq('user_id', uid).eq('completed', false)
        .order('module_order', { referencedTable: 'training_modules' }).limit(1)
        .then(r => r).catch(() => ({ data: [] })),
    ])

    const acks        = acksResult?.data || []
    const trainList   = trainingRecs || []
    const trainPct    = trainList.length ? Math.round(trainList.filter(r => r.completed).length / trainList.length * 100) : 0
    const polPct      = pols?.length ? Math.round(acks.length / pols.length * 100) : 0
    const hasActive   = (trips || []).length > 0
    const checkinPct  = !hasActive ? 100 : (checkins?.length || 0) > 0 ? 100 : 0
    const compliancePct = Math.round(trainPct * 0.4 + polPct * 0.4 + checkinPct * 0.2)

    setComplianceBreakdown({
      total:    compliancePct,
      training: { pct: trainPct, done: trainList.filter(r => r.completed).length, total: trainList.length },
      policies: { pct: polPct,   done: acks.length,                                          total: pols?.length ?? 0 },
      checkin:  { pct: checkinPct, done: checkins?.length ?? 0,                              hasTrips: hasActive },
    })

    const activeFeeds = Object.values(feedStatuses || {}).filter(s => s === 'active').length
    setMetrics({ activeAlerts: alertCount || 0, staffTravelling: travelCount || 0, activeFeeds, compliancePct })
    setMyTrips(trips || [])
    setOverdueCheckin(overdueCheckins?.[0] || null)
    // Normalise nudge module — join puts module info under training_modules key
    const rawNudge = incompleteModules?.[0] || null
    setNudgeModule(rawNudge ? {
      id:           rawNudge.id,
      module_order: rawNudge.training_modules?.module_order,
      module_name:  rawNudge.training_modules?.title,
    } : null)

    const countries = [...new Set((trips || []).map(t => cityToCountry(t.arrival_city)).filter(Boolean))]
    if (countries.length > 0) {
      const [riskResults, alertResults] = await Promise.all([
        Promise.all(countries.map(c =>
          fetch(`/api/country-risk?country=${encodeURIComponent(c)}`).then(r => r.json()).then(d => [c, d]).catch(() => [c, null])
        )),
        Promise.all(countries.map(c =>
          supabase.from('alerts').select('*', { count: 'exact', head: true })
            .eq('status', 'Active').ilike('country', `%${c}%`).then(({ count }) => [c, count || 0])
        )),
      ])
      setDestRisk(Object.fromEntries(riskResults))
      setDestAlerts(Object.fromEntries(alertResults))
    }

    const { data: ta } = await supabase.from('trip_alerts').select('*')
      .eq('user_id', uid).neq('alert_type', 'ai_brief')
      .order('created_at', { ascending: false }).limit(30)
    setTripAlerts(ta || [])

    setLoading(false)
    loadingRef.current = false

    if (scanAlerts) {
      setBriefLoading(true)
      try {
        const scanRes = await fetch('/api/trip-alert-scan', { headers: { Authorization: `Bearer ${session.access_token}` } })
        if (scanRes.ok) {
          const scanData = await scanRes.json()
          if (scanData.morning_brief) setMorningBrief(scanData.morning_brief)
        }
      } catch { /* non-critical */ }
      setBriefLoading(false)
    }
  }, [])

  useEffect(() => {
    load({ scanAlerts: true })
    const interval = setInterval(() => load({ scanAlerts: false }), 5 * 60 * 1000)
    const channel = supabase.channel('dashboard-watch-v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itineraries' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_alerts' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => load())
      .subscribe()
    return () => { clearInterval(interval); supabase.removeChannel(channel) }
  }, [load])

  const travelCountries = [...new Set(myTrips.map(t => cityToCountry(t.arrival_city)).filter(Boolean))]
  const todayStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const todayISO = new Date().toISOString().split('T')[0]

  // Next upcoming trip countdown
  const nextTrip = myTrips.find(t => t.depart_date >= todayISO && t.status !== 'Completed')
  const daysToTrip = nextTrip
    ? Math.max(0, Math.ceil((new Date(nextTrip.depart_date) - new Date()) / (1000 * 60 * 60 * 24)))
    : null

  const subtitles = {
    developer: 'Platform overview · SafeGuard360',
    admin:     `${profile?.organisations?.name || 'Your organisation'} · Duty of care dashboard`,
    traveller: 'Your duty of care overview · SafeGuard360',
    solo:      'Your personal travel safety dashboard',
  }

  return (
    <Layout>
      {selectedCountry && <IntelBrief country={selectedCountry} onClose={() => setSelectedCountry(null)} />}

      {/* Header */}
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{todayStr}</p>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">{greeting()}</h1>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <p className="text-sm text-gray-400">{subtitles[role] || subtitles.traveller}</p>
          {/* Next trip pill — only for traveller/solo with an upcoming trip */}
          {(role === 'traveller' || role === 'solo') && nextTrip && daysToTrip !== null && (
            <Link to="/itinerary"
              className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors hover:opacity-80"
              style={{ background: daysToTrip === 0 ? `${BRAND_BLUE}15` : '#F1F5F9', color: daysToTrip === 0 ? BRAND_BLUE : '#64748B', border: `1px solid ${daysToTrip === 0 ? BRAND_BLUE + '30' : '#E2E8F0'}` }}>
              <Plane size={9} />
              {daysToTrip === 0
                ? `✈️ Travelling today · ${nextTrip.trip_name}`
                : daysToTrip === 1
                  ? `Trip tomorrow · ${nextTrip.trip_name}`
                  : `${nextTrip.trip_name} in ${daysToTrip} days`}
            </Link>
          )}
        </div>
      </div>

      {/* ── Overdue check-in banner (traveller / solo only) — top priority ── */}
      {(role === 'traveller' || role === 'solo') && !loading && (
        <OverdueCheckinBanner checkin={overdueCheckin} />
      )}

      {/* Morning brief (traveller + solo + developer) */}
      {role !== 'admin' && (briefLoading || morningBrief) && (
        <MorningBriefCard brief={morningBrief} loading={briefLoading} />
      )}

      {/* ── DEVELOPER PLATFORM HEALTH ── */}
      {role === 'developer' && (
        <>
          {/* Compact stat strip */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Orgs',         value: devMetrics.orgs,        to: '/organisations', color: BRAND_BLUE },
              { label: 'Travellers',   value: devMetrics.travellers,  to: '/admin',         color: BRAND_BLUE },
              { label: 'Active Trips', value: devMetrics.activeTrips, to: '/tracker',       color: '#2563EB' },
              { label: 'Active Feeds', value: metrics.activeFeeds,    to: '/intel-feeds',   color: '#059669' },
            ].map(s => (
              <Link key={s.label} to={s.to}
                className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-col gap-0.5 hover:shadow-md transition-shadow">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{s.label}</span>
                <span className="text-2xl font-bold" style={{ color: loading ? '#D1D5DB' : s.color }}>
                  {loading ? '–' : s.value}
                </span>
              </Link>
            ))}
          </div>

          {/* Platform Health Monitor */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-7 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50"
              style={{ background: `${BRAND_BLUE}06` }}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${BRAND_BLUE}15` }}>
                  <Activity size={14} style={{ color: BRAND_BLUE }} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Platform Health Monitor</h2>
                  <p className="text-[11px] text-gray-400">Issues detected from live platform data</p>
                </div>
              </div>
              {!loading && (
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                  healthIssues.some(i => i.severity === 'critical') ? 'bg-red-100 text-red-700' :
                  healthIssues.some(i => i.severity === 'warning')  ? 'bg-amber-100 text-amber-700' :
                  healthIssues.length > 0 ? 'bg-blue-100 text-blue-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {healthIssues.some(i => i.severity === 'critical') ? 'Critical' :
                   healthIssues.some(i => i.severity === 'warning')  ? 'Needs Attention' :
                   healthIssues.length > 0 ? 'Minor Issues' : 'All Clear'}
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
                <div className="w-4 h-4 border-2 border-[#0118A1] border-t-transparent rounded-full animate-spin" />
                Scanning platform…
              </div>
            ) : healthIssues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-green-50">
                  <CheckCircle2 size={24} className="text-green-500" />
                </div>
                <p className="text-sm font-semibold text-gray-700">No issues detected</p>
                <p className="text-xs text-gray-400">Platform is operating normally</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {healthIssues.map((issue, i) => {
                  const cfg = {
                    critical: { bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700',   badge: 'bg-red-100 text-red-700',   dot: 'bg-red-500',   label: 'Critical' },
                    warning:  { bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', label: 'Warning' },
                    info:     { bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700',  badge: 'bg-blue-100 text-blue-700',  dot: 'bg-blue-400',  label: 'Info' },
                  }[issue.severity]
                  return (
                    <Link key={i} to={issue.link}
                      className={`flex items-center justify-between px-5 py-3.5 hover:${cfg.bg} transition-colors group`}>
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                        <span className="text-sm text-gray-800">{issue.label}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-bold ${cfg.text}`}>{issue.count}</span>
                        <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── CORPORATE ADMIN DASHBOARD ── */}
      {(role === 'admin' || role === 'org_admin') && (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <MetricCard label="Our Travellers"       value={loading ? '–' : adminMetrics.travellers}       icon={Users}         valueColor="text-[#0118A1]" accent="#0118A1" to="/org/users" />
            <MetricCard label="Currently Travelling" value={loading ? '–' : adminMetrics.travelling}       icon={Plane}         valueColor="text-blue-600"  accent="#2563EB" to="/tracker" />
            <MetricCard label="Pending Approvals"    value={loading ? '–' : adminMetrics.pendingApprovals} icon={ClipboardList}
              valueColor={adminMetrics.pendingApprovals > 0 ? 'text-amber-600' : 'text-gray-900'}
              accent={adminMetrics.pendingApprovals > 0 ? '#D97706' : '#0118A1'} to="/approvals" />
            <MetricCard label="Overdue Check-ins"    value={loading ? '–' : adminMetrics.overdueCheckins}  icon={Clock}
              valueColor={adminMetrics.overdueCheckins > 0 ? 'text-red-600' : 'text-emerald-600'}
              accent={adminMetrics.overdueCheckins > 0 ? '#EF4444' : '#059669'} to="/control-room" />
          </div>

          {/* Urgent banners */}
          {!loading && (adminMetrics.pendingApprovals > 0 || adminMetrics.overdueCheckins > 0) && (
            <div className="flex gap-3 mb-5 flex-wrap">
              {adminMetrics.pendingApprovals > 0 && (
                <Link to="/approvals" className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors">
                  <ClipboardList size={14} />
                  {adminMetrics.pendingApprovals} trip{adminMetrics.pendingApprovals !== 1 ? 's' : ''} awaiting approval
                  <ChevronRight size={13} />
                </Link>
              )}
              {adminMetrics.overdueCheckins > 0 && (
                <Link to="/tracker" className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors">
                  <Clock size={14} />
                  {adminMetrics.overdueCheckins} overdue check-in{adminMetrics.overdueCheckins !== 1 ? 's' : ''}
                  <ChevronRight size={13} />
                </Link>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Invite Traveller',    icon: Users,          to: '/org/users',    bg: BRAND_BLUE,   desc: 'Add staff to your team' },
                { label: 'Travel Approvals',    icon: ClipboardList,  to: '/approvals',    bg: '#D97706',    desc: 'Review pending trips' },
                { label: 'Training & Courses',  icon: GraduationCap,  to: '/org/training', bg: '#7C3AED',    desc: 'Assign or upload training' },
                { label: 'Policies & Docs',     icon: FileText,       to: '/policies',     bg: '#059669',    desc: 'Upload company policies' },
              ].map(a => {
                const Icon = a.icon
                return (
                  <Link key={a.label} to={a.to}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-2 hover:shadow-md hover:-translate-y-0.5 transition-all">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: `${a.bg}18` }}>
                      <Icon size={17} style={{ color: a.bg }} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{a.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{a.desc}</p>
                    </div>
                    <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest mt-auto">Open →</span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Currently Travelling + Live Risk Alerts — side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">

            {/* Currently Travelling */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50"
                style={{ background: `${BRAND_BLUE}06` }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${BRAND_BLUE}15` }}>
                    <Plane size={14} style={{ color: BRAND_BLUE }} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">Currently Travelling</h2>
                    <p className="text-[11px] text-gray-400">Staff on active trips right now</p>
                  </div>
                </div>
                <Link to="/tracker" className="text-xs font-semibold text-[#0118A1] hover:underline flex items-center gap-1">
                  Full tracker <ChevronRight size={12} />
                </Link>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-10 text-gray-400 text-sm gap-2">
                  <div className="w-4 h-4 border-2 border-[#0118A1] border-t-transparent rounded-full animate-spin" />
                  Loading…
                </div>
              ) : activeTravellers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Plane size={28} className="text-gray-200" />
                  <p className="text-sm text-gray-400">No staff currently travelling</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {activeTravellers.map(({ trip, profile: tp }) => {
                    const daysLeft = trip.return_date
                      ? Math.max(0, Math.ceil((new Date(trip.return_date) - new Date()) / 86400000))
                      : null
                    return (
                      <div key={trip.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ background: BRAND_BLUE }}>
                          {(tp.full_name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">{tp.full_name || tp.email}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {trip.departure_city && trip.arrival_city
                              ? `${trip.departure_city} → ${trip.arrival_city}`
                              : trip.trip_name || 'Trip'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {daysLeft !== null && (
                            <p className="text-xs font-semibold text-gray-500">
                              {daysLeft === 0 ? 'Returns today' : `${daysLeft}d remaining`}
                            </p>
                          )}
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Active
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Live Risk Alerts */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50" style={{ background: '#FEF2F208' }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-red-50">
                    <Bell size={14} style={{ color: '#EF4444' }} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">Live Risk Alerts</h2>
                    <p className="text-[11px] text-gray-400">Active alerts affecting your travellers</p>
                  </div>
                </div>
                <Link to="/alerts" className="text-xs font-semibold text-[#0118A1] hover:underline flex items-center gap-1">
                  View all <ChevronRight size={12} />
                </Link>
              </div>
              {loading ? (
                <div className="space-y-3 p-5">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse"/>)}</div>
              ) : recentAlerts.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2">
                  <CheckCircle2 size={28} className="text-emerald-400" />
                  <p className="text-sm text-gray-400">All clear — no active alerts</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {recentAlerts.map(alert => (
                    <div key={alert.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <div className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: severityDot[alert.severity] || '#94A3B8' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-sm font-semibold text-gray-900 truncate">{alert.title}</span>
                          <SeverityBadge severity={alert.severity} />
                        </div>
                        <p className="text-xs text-gray-400 truncate">{alert.description}</p>
                        {alert.country && (
                          <button onClick={() => setSelectedCountry(alert.country)}
                            className="text-[11px] font-semibold flex items-center gap-1 mt-1 hover:underline" style={{ color: BRAND_BLUE }}>
                            <Globe size={9} /> {alert.country} intel →
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Latest Check-in Locations */}
          {!loading && latestCheckins.filter(c => c.latitude && c.longitude).length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50"
                style={{ background: `${BRAND_BLUE}06` }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${BRAND_BLUE}15` }}>
                    <MapPin size={14} style={{ color: BRAND_BLUE }} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">Latest Check-in Locations</h2>
                    <p className="text-[11px] text-gray-400">Most recent GPS check-in per traveller</p>
                  </div>
                </div>
                <Link to="/tracker" className="text-xs font-semibold text-[#0118A1] hover:underline flex items-center gap-1">
                  Live map <ChevronRight size={12} />
                </Link>
              </div>
              <div className="divide-y divide-gray-50">
                {latestCheckins.filter(c => c.latitude && c.longitude).slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {c.location_label || `${Number(c.latitude).toFixed(4)}, ${Number(c.longitude).toFixed(4)}`}
                      </p>
                    </div>
                    <p className="text-[11px] text-gray-400 shrink-0">
                      {c.completed_at ? new Date(c.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contact SafeGuard360 */}
          <div className="rounded-2xl border mb-6 overflow-hidden"
            style={{ background: `${BRAND_BLUE}08`, borderColor: `${BRAND_BLUE}20` }}>
            <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-bold text-gray-900">Need help or a custom solution?</p>
                <p className="text-xs text-gray-500 mt-0.5">Request bespoke training, policies, or platform support from the SafeGuard360 team.</p>
              </div>
              <a href="mailto:support@risk360.co"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shrink-0"
                style={{ background: BRAND_BLUE }}>
                <Send size={13} /> Contact SafeGuard360
              </a>
            </div>
          </div>

          {/* AI Security Analyst */}
          {!loading && (
            <div className="mb-7">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${BRAND_BLUE}12` }}>
                  <Brain size={13} style={{ color: BRAND_BLUE }} />
                </div>
                <h2 className="text-sm font-bold text-gray-900">AI Security Analyst</h2>
              </div>
              <DashboardAiChat profile={profile} trips={[]} orgName={profile?.organisations?.name} role={role} />
            </div>
          )}
        </>
      )}

      {/* ── TRAVELLER / SOLO METRICS ── */}
      {(role === 'traveller' || role === 'solo') && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
            <MetricCard label="My Compliance"  value={loading ? '–' : complianceBreakdown ? `${complianceBreakdown.total}%` : '–'} icon={BarChart2} valueColor="text-[#0118A1]" accent="#0118A1" to="/training" />
            <MetricCard label="Active Alerts"  value={loading ? '–' : metrics.activeAlerts} icon={Bell}
              valueColor={metrics.activeAlerts > 0 ? 'text-red-600' : 'text-gray-900'}
              accent={metrics.activeAlerts > 0 ? '#EF4444' : '#0118A1'} to="/alerts" />
            <MetricCard label="My Trips"       value={loading ? '–' : myTrips.length}       icon={Plane}  valueColor="text-[#0118A1]" accent="#0118A1" to="/itinerary" />
            <MetricCard label="Active Feeds"   value={loading ? '–' : metrics.activeFeeds}  icon={Radio}  valueColor="text-emerald-600" accent="#059669" to="/intel-feeds" />
          </div>

          {/* Quick action shortcuts */}
          <QuickActions role={role} hasActiveTrip={myTrips.some(t => t.status === 'Active')} />

          {/* Training nudge — only when score is below 70% and there's a next module */}
          {!loading && (
            <TrainingNudge
              module={nudgeModule}
              score={complianceBreakdown?.total ?? 100}
            />
          )}

          {/* 24/7 Assistance CTA — always visible for travellers */}
          <AssistanceCTA />

          {/* Trip map — visible when they have upcoming/active trips */}
          {!loading && (
            <TripMapSection
              trips={myTrips}
              destRisk={destRisk}
              onCountryClick={setSelectedCountry}
            />
          )}
        </>
      )}

      {/* ── TRIP ALERTS (traveller / solo) ── */}
      {(role === 'traveller' || role === 'solo') && (() => {
        const visible = tripAlerts.filter(a => !dismissedIds.has(a.id))
        if (!visible.length) return null
        return (
          <TripAlertsSection
            alerts={visible}
            onMarkRead={(id) => {
              setDismissedIds(prev => new Set([...prev, id]))
              supabase.from('trip_alerts').update({ is_read: true }).eq('id', id).then(() => {})
            }}
            onDismissAll={() => {
              const ids = tripAlerts.map(a => a.id)
              setDismissedIds(prev => new Set([...prev, ...ids]))
              supabase.from('trip_alerts').update({ is_read: true }).in('id', ids).then(() => {})
            }}
          />
        )
      })()}

      {/* ── TRAVEL INTEL (traveller / solo) ── */}
      {(role === 'traveller' || role === 'solo') && travelCountries.length > 0 && (
        <div className="mb-7">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${BRAND_BLUE}12` }}>
                <Globe size={13} style={{ color: BRAND_BLUE }} />
              </div>
              <h2 className="text-base font-bold text-gray-900">My Travel Intel</h2>
            </div>
            <span className="text-xs text-gray-400 font-medium">{myTrips.length} trip{myTrips.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {myTrips.map(trip => {
              const country  = cityToCountry(trip.arrival_city) || trip.arrival_city
              const risk     = destRisk[country]
              const sev      = risk?.severity || trip.risk_level || null
              const alerts   = destAlerts[country] ?? null
              const isActive = trip.depart_date <= new Date().toISOString().split('T')[0]
              const pill     = sev ? SEVERITY_PILL[sev] : null
              return (
                <button key={trip.id} onClick={() => setSelectedCountry(country)}
                  className="bg-white rounded-2xl p-5 text-left transition-all duration-200 hover:-translate-y-0.5 group"
                  style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                      style={isActive ? { background: `${BRAND_BLUE}12`, color: BRAND_BLUE } : { background: '#F1F5F9', color: '#64748B' }}>
                      {isActive ? '✈️ Active' : '📅 Upcoming'}
                    </span>
                    {pill && (
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                        style={{ background: pill.bg, color: pill.color, border: `1px solid ${pill.border}` }}>{sev}</span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 truncate mb-1">{trip.trip_name}</h3>
                  <p className="text-xs text-gray-400 mb-4">{trip.arrival_city}{country !== trip.arrival_city ? ` · ${country}` : ''}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-3">
                    <Calendar size={10} />{fmtDate(trip.depart_date)} — {fmtDate(trip.return_date)}
                  </div>
                  {alerts !== null && (
                    <div className={`flex items-center gap-1.5 text-[11px] font-semibold mb-4 ${alerts > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {alerts > 0 ? <><AlertCircle size={11} />{alerts} active alert{alerts !== 1 ? 's' : ''}</> : <><CheckCircle2 size={11} />No active alerts</>}
                    </div>
                  )}
                  {/* Approval status */}
                  {trip.approval_status === 'pending' && (
                    <div className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 mb-3">
                      ⏳ Awaiting approval
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-[11px] font-semibold pt-3 transition-all group-hover:gap-1.5"
                    style={{ borderTop: '1px solid #F1F5F9', color: BRAND_BLUE }}>
                    View Full Intel Brief <ChevronRight size={11} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── BOTTOM PANELS ── */}
      <div className="flex flex-col lg:flex-row gap-5">

        {/* Live alerts — hidden for admin/org_admin (shown above next to Currently Travelling) */}
        <div className={`${role === 'traveller' || role === 'solo' ? 'lg:w-3/5' : 'lg:w-full'} bg-white rounded-2xl p-6 ${(role === 'admin' || role === 'org_admin') ? 'hidden' : ''}`}
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#FEF2F2' }}>
              <Bell size={13} style={{ color: '#EF4444' }} />
            </div>
            <h2 className="text-sm font-bold text-gray-900">Live Risk Alerts</h2>
          </div>
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse"/>)}</div>
          ) : recentAlerts.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <CheckCircle2 size={28} className="text-emerald-400" />
              <p className="text-sm text-gray-400 font-medium">All clear — no active alerts</p>
            </div>
          ) : (
            <div className="space-y-0 divide-y divide-gray-50">
              {recentAlerts.map(alert => (
                <div key={alert.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="mt-2 w-2 h-2 rounded-full shrink-0" style={{ background: severityDot[alert.severity] || '#94A3B8' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-sm font-semibold text-gray-900">{alert.title}</span>
                      <SeverityBadge severity={alert.severity} />
                    </div>
                    <p className="text-xs text-gray-400 truncate">{alert.description}</p>
                    {alert.country && (
                      <button onClick={() => setSelectedCountry(alert.country)}
                        className="text-[11px] font-semibold flex items-center gap-1 mt-1 hover:underline" style={{ color: BRAND_BLUE }}>
                        <Globe size={9} /> {alert.country} intel →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 pt-4" style={{ borderTop: '1px solid #F1F5F9' }}>
            <Link to="/alerts" className="text-xs font-semibold hover:underline flex items-center gap-1" style={{ color: BRAND_BLUE }}>
              View all alerts <ChevronRight size={11} />
            </Link>
          </div>
        </div>

        {/* Right column — compliance + AI chat stacked for travellers, org compliance for admin */}
        {(role === 'traveller' || role === 'solo') && (
          <div className="lg:w-2/5 flex flex-col gap-5">
            <ComplianceScoreCard breakdown={complianceBreakdown} loading={loading} />
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${BRAND_BLUE}12` }}>
                  <Brain size={13} style={{ color: BRAND_BLUE }} />
                </div>
                <h2 className="text-sm font-bold text-gray-900">AI Security Analyst</h2>
              </div>
              <DashboardAiChat
                profile={profile}
                trips={myTrips}
                orgName={profile?.organisations?.name}
                role={role}
              />
            </div>
          </div>
        )}
        {(role === 'admin' || role === 'org_admin') && (
          <div className="lg:w-full">
            <OrgCompliancePanel orgStats={orgStats} loading={loading} />
          </div>
        )}
      </div>
    </Layout>
  )
}
