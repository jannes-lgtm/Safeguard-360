import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart2, Bell, Plane, Radio, Globe, AlertCircle,
  Calendar, ChevronRight, Brain, Zap, AlertTriangle,
  ListChecks, RefreshCw, X, CheckCircle2, BookOpen,
  FileText, CheckSquare, Award, Users, ClipboardList,
  Clock, Building2, Headphones, Shield, GraduationCap,
  Pencil, Navigation, MapPin, Send, MessageSquare, Sparkles, Activity, Stethoscope,
} from 'lucide-react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import Layout from '../components/Layout'
import MetricCard from '../components/MetricCard'
import SeverityBadge from '../components/SeverityBadge'
import IntelBrief from '../components/IntelBrief'
import { supabase } from '../lib/supabase'
import { cityToCountry, SEVERITY_STYLE, COUNTRY_META } from '../data/intelData'
import { getCityCoords } from '../lib/cityCoords'
import { MAP_STYLES } from '../lib/mapConfig'
import { BRAND_BLUE, BRAND_GREEN } from '../lib/colors'
import { DS, SEVERITY as SEV_DS } from '../lib/ds'
import { timeAgo } from '../lib/dateUtils'
import { getCountryRisk, getFeedById } from '../services/intelligenceService'
import { sendAssistantMessage } from '../services/cairoService'

const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 }
const ALERT_TYPE_ICON = {
  disaster: '🌋', earthquake: '🔴', flight: '✈️',
  weather: '⛈️', security: '🛡️', health: '🏥', political: '🏛️',
}
// Operational severity tokens — sourced from design system
const SEVERITY_PILL = SEV_DS  // single source of truth
const SEVERITY_PILL_DARK = SEV_DS
const severityDot = {
  Critical: SEV_DS.Critical.dot,
  High:     SEV_DS.High.dot,
  Medium:   SEV_DS.Medium.dot,
  Low:      SEV_DS.Low.dot,
  Info:     SEV_DS.Info.dot,
}

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
          <h2 className="text-sm font-bold" style={{ color: '#EAEEF5' }}>Trip Alerts</h2>
          <span className="text-[10px] font-bold px-2 py-0.5"
            style={{ background: 'rgba(249,115,22,0.15)', color: '#FDBA74', border: '1px solid rgba(249,115,22,0.30)' }}>
            {alerts.length}
          </span>
        </div>
        <button onClick={onDismissAll} className="text-xs font-medium" style={{ background: 'none', border: 'none', color: '#6E7480', cursor: 'pointer' }}>
          Dismiss all
        </button>
      </div>
      <div className="space-y-2">
        {sorted.map(alert => {
          const pill = SEVERITY_PILL_DARK[alert.severity] || SEVERITY_PILL_DARK.Low
          return (
            <div key={alert.id} style={{ background: pill.bg, border: `1px solid ${pill.border}`, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', transition: 'opacity 0.15s' }}>
              <div style={{ width: 2, alignSelf: 'stretch', background: pill.bar, flexShrink: 0 }} />
              <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1, marginTop: 2 }}>{ALERT_TYPE_ICON[alert.alert_type] || '⚠️'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#EAEEF5', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{alert.title}</p>
                  <button onClick={() => onMarkRead(alert.id)}
                    style={{ flexShrink: 0, background: 'none', border: 'none', color: pill.color, opacity: 0.6, cursor: 'pointer', padding: 2, display: 'flex' }}>
                    <X size={13} />
                  </button>
                </div>
                {alert.description && (
                  <p style={{ fontSize: 11, color: '#6E7480', marginTop: 2, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{alert.description}</p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '2px 8px', background: pill.bar + '25', color: pill.color }}>{alert.severity}</span>
                  {alert.trip_name && (
                    <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: '#6E7480', padding: '2px 8px', fontWeight: 500 }}>
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
      <div style={{ background: '#11131A', border: '1px solid rgba(255,255,255,0.07)', padding: 24 }} className="animate-pulse">
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ height: 10, background: 'rgba(255,255,255,0.05)' }} />
            <div style={{ height: 10, background: 'rgba(255,255,255,0.05)', width: '80%' }} />
            <div style={{ height: 10, background: 'rgba(255,255,255,0.05)', width: '60%' }} />
          </div>
        </div>
      </div>
    )
  }
  const score  = breakdown?.total ?? 0
  const rating =
    score >= 90 ? { label: 'Excellent',      color: '#4ADE80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.25)' } :
    score >= 70 ? { label: 'Good',            color: BRAND_GREEN, bg: 'rgba(170,204,0,0.12)', border: 'rgba(170,204,0,0.25)' } :
    score >= 50 ? { label: 'Needs Attention', color: '#FDE68A', bg: 'rgba(234,179,8,0.12)',   border: 'rgba(234,179,8,0.25)' } :
                  { label: 'At Risk',         color: '#FCA5A5', bg: 'rgba(168,53,53,0.15)',   border: 'rgba(168,53,53,0.30)' }
  const R    = 38
  const C    = 2 * Math.PI * R
  const fill = (score / 100) * C
  const components = breakdown ? [
    { label: 'ISO Training',     icon: BookOpen,    pct: breakdown.training.pct, sub: `${breakdown.training.done}/${breakdown.training.total} modules`, link: '/training', color: BRAND_GREEN },
    { label: 'Policy Sign-offs', icon: FileText,    pct: breakdown.policies.pct, sub: `${breakdown.policies.done}/${breakdown.policies.total} policies`, link: '/policies', color: '#A78BFA' },
    { label: 'Travel Check-ins', icon: CheckSquare, pct: breakdown.checkin.pct,  sub: breakdown.checkin.hasTrips ? (breakdown.checkin.done > 0 ? 'Recent check-in on file' : 'No check-ins yet') : 'No active trips', link: '/checkin', color: '#4ADE80' },
  ] : []

  return (
    <div style={{ background: '#11131A', border: '1px solid rgba(255,255,255,0.07)', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(170,204,0,0.10)', border: '1px solid rgba(170,204,0,0.20)' }}>
            <Award size={13} style={{ color: BRAND_GREEN }} />
          </div>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5' }}>My ISO Compliance</h2>
        </div>
        {breakdown && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', background: rating.bg, color: rating.color, border: `1px solid ${rating.border}`, letterSpacing: '0.06em' }}>
            {rating.label}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ flexShrink: 0, position: 'relative', width: 96, height: 96 }}>
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
            <circle cx="48" cy="48" r={R} fill="none" stroke={rating.color} strokeWidth="8"
              strokeLinecap="butt" strokeDasharray={`${fill} ${C}`} strokeDashoffset={C * 0.25}
              style={{ transition: 'stroke-dasharray 0.8s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 900, lineHeight: 1, color: rating.color }}>{score}%</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#3C4050', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>Score</span>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {components.map(c => {
            const Icon = c.icon
            return (
              <Link key={c.label} to={c.link} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }} className="group">
                <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: `${c.color}18` }}>
                  <Icon size={11} style={{ color: c.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#EAEEF5' }}>{c.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: c.color }}>{c.pct}%</span>
                  </div>
                  <div style={{ height: 3, width: '100%', background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ height: 3, width: `${c.pct}%`, background: c.color, transition: 'width 0.7s ease' }} />
                  </div>
                  <p style={{ fontSize: 10, color: '#3C4050', marginTop: 2 }}>{c.sub}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
      <div style={{ marginTop: 16, paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ fontSize: 10, color: '#3C4050' }}>Training 40% · Policies 40% · Check-ins 20%</p>
        <Link to="/training" style={{ fontSize: 11, fontWeight: 600, color: BRAND_GREEN, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          Improve score <ChevronRight size={11} />
        </Link>
      </div>
    </div>
  )
}

// ── Corporate Admin: org compliance panel ─────────────────────────────────────
function OrgCompliancePanel({ orgStats, loading }) {
  if (loading) return (
    <div style={{ background: '#11131A', border: '1px solid rgba(255,255,255,0.07)', padding: 24 }} className="animate-pulse">
      <div style={{ height: 12, background: 'rgba(255,255,255,0.05)', width: 160, marginBottom: 16 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1,2,3].map(i => <div key={i} style={{ height: 36, background: 'rgba(255,255,255,0.03)' }}/>)}
      </div>
    </div>
  )
  if (!orgStats) return null

  const items = [
    { label: 'Training Completion',  pct: orgStats.trainPct,   color: BRAND_GREEN, icon: BookOpen,    link: '/org/users' },
    { label: 'Policy Sign-offs',     pct: orgStats.polPct,     color: '#A78BFA',   icon: FileText,    link: '/org/users' },
    { label: 'Check-in Compliance',  pct: orgStats.checkinPct, color: '#4ADE80',   icon: CheckSquare, link: '/tracker' },
  ]
  const overall = Math.round(orgStats.trainPct * 0.4 + orgStats.polPct * 0.4 + orgStats.checkinPct * 0.2)
  const rating  =
    overall >= 90 ? { label: 'Excellent',      color: '#4ADE80' } :
    overall >= 70 ? { label: 'Good',            color: BRAND_GREEN } :
    overall >= 50 ? { label: 'Needs Attention', color: '#FDE68A' } :
                    { label: 'At Risk',         color: '#FCA5A5' }

  return (
    <div style={{ background: '#11131A', border: '1px solid rgba(255,255,255,0.07)', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(170,204,0,0.10)', border: '1px solid rgba(170,204,0,0.20)' }}>
            <Shield size={13} style={{ color: BRAND_GREEN }} />
          </div>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5' }}>Organisation Compliance</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: rating.color }}>{overall}%</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', background: 'rgba(255,255,255,0.06)', color: '#6E7480' }}>{rating.label}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(item => {
          const Icon = item.icon
          return (
            <Link key={item.label} to={item.link} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }} className="group">
              <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: `${item.color}18` }}>
                <Icon size={12} style={{ color: item.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#EAEEF5' }}>{item.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.pct}%</span>
                </div>
                <div style={{ height: 3, width: '100%', background: 'rgba(255,255,255,0.06)' }}>
                  <div style={{ height: 3, width: `${item.pct}%`, background: item.color, transition: 'width 0.7s ease' }} />
                </div>
              </div>
            </Link>
          )
        })}
      </div>
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Link to="/org/users" style={{ fontSize: 11, fontWeight: 600, color: BRAND_GREEN, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          View individual scores <ChevronRight size={11} />
        </Link>
      </div>
    </div>
  )
}

// ── Quick Actions ─────────────────────────────────────────────────────────────
function QuickActions({ role, hasActiveTrip, dark = false }) {
  const travellerActions = [
    { icon: Plane,        label: 'Book Travel',          desc: 'Add a new trip to your itinerary',             to: '/itinerary',    color: BRAND_GREEN,   bg: DS.greenDim },
    { icon: GraduationCap,label: 'Start Training',        desc: 'Complete your ISO safety modules',             to: '/training',     color: '#A78BFA',     bg: 'rgba(80,60,120,0.12)' },
    { icon: Shield,       label: 'Country Risk Report',   desc: 'Get destination safety intelligence',          to: '/country-risk', color: DS.steelText,  bg: DS.steelDim },
    { icon: Pencil,       label: hasActiveTrip ? 'Update My Trip' : 'My Trips', desc: hasActiveTrip ? 'Edit your current travel plans' : 'View and manage your upcoming trips', to: '/itinerary', color: DS.amberText, bg: DS.amberDim },
  ]

  const adminActions = [
    { icon: ClipboardList, label: 'Travel Approvals',    desc: 'Review and approve pending trips',             to: '/approvals',    color: DS.amberText,  bg: DS.amberDim },
    { icon: Navigation,    label: 'Staff Tracker',        desc: 'See where your travellers are now',            to: '/tracker',      color: BRAND_GREEN,   bg: DS.greenDim },
    { icon: GraduationCap, label: 'Company Training',     desc: 'Manage team training & compliance',            to: '/org/training', color: '#A78BFA',     bg: 'rgba(80,60,120,0.12)' },
    { icon: Shield,        label: 'Country Risk Report',  desc: 'Check destination risk levels',                to: '/country-risk', color: DS.steelText,  bg: DS.steelDim },
  ]

  const soloActions = [
    { icon: Plane,       label: 'Plan a Trip',     desc: 'Add a new trip to your planner',       to: '/itinerary',    color: BRAND_GREEN, bg: DS.greenDim },
    { icon: Globe,       label: 'Country Intel',   desc: 'Check safety at your destination',     to: '/country-risk', color: DS.steelText, bg: DS.steelDim },
    { icon: Brain,       label: 'AI Analyst',      desc: 'Ask about risk, safety, destinations', to: '/dashboard',    color: '#A78BFA',   bg: 'rgba(80,60,120,0.12)' },
    { icon: Headphones,  label: '24/7 Support',    desc: 'Reach emergency support anytime',      to: '/assistance',   color: DS.amberText, bg: DS.amberDim },
  ]

  const actions = role === 'solo' ? soloActions : role === 'admin' ? adminActions : travellerActions

  return (
    <div className="mb-7">
      <div className="flex items-center gap-2.5 mb-3">
        <h2 className="text-sm font-bold" style={{ color: DS.white }}>Quick Actions</h2>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {actions.map(action => {
          const Icon = action.icon
          return (
            <Link
              key={action.label}
              to={action.to}
              className="rounded-[6px] p-4 flex flex-col gap-3 transition-all duration-150 group"
              style={{
                background:  DS.surface,
                border:      `1px solid ${DS.border}`,
                textDecoration: 'none',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background   = DS.surfaceHi
                e.currentTarget.style.borderColor  = DS.borderHi
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background   = DS.surface
                e.currentTarget.style.borderColor  = DS.border
              }}
            >
              <div
                className="w-9 h-9 rounded-[5px] flex items-center justify-center shrink-0"
                style={{ background: action.bg }}
              >
                <Icon size={16} style={{ color: action.color }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold leading-tight mb-0.5" style={{ color: DS.white }}>
                  {action.label}
                </p>
                <p className="text-[11px] leading-snug" style={{ color: DS.textMuted }}>{action.desc}</p>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-semibold"
                style={{ color: DS.textMuted }}>
                View <ChevronRight size={10} />
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
      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', marginBottom: 24, background: 'rgba(168,53,53,0.18)', border: '1px solid rgba(168,53,53,0.40)', textDecoration: 'none', transition: 'opacity 0.15s' }}
      className="group">
      <div style={{ position: 'relative', flexShrink: 0, width: 16, height: 16 }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(239,68,68,0.5)', animation: 'ping 1s cubic-bezier(0,0,0.2,1) infinite' }} className="animate-ping" />
        <span style={{ position: 'relative', display: 'block', width: 16, height: 16, borderRadius: '50%', background: '#EF4444' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#FCA5A5', lineHeight: 1.35 }}>
          Check-in overdue{checkin.label ? ` · ${checkin.label}` : ''}
        </p>
        <p style={{ fontSize: 11, color: 'rgba(252,165,165,0.6)', marginTop: 2 }}>
          {hoursOverdue < 1 ? 'Due a few minutes ago' : `${hoursOverdue}h overdue`} — tap to confirm you're safe
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#FCA5A5', flexShrink: 0 }}>
        Check in now <ChevronRight size={15} />
      </div>
    </Link>
  )
}

// ── Assistance CTA ────────────────────────────────────────────────────────────
function AssistanceCTA() {
  return (
    <Link to="/assistance"
      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', marginBottom: 24, marginTop: 4, background: '#11131A', border: '1px solid rgba(255,255,255,0.08)', textDecoration: 'none', transition: 'opacity 0.15s' }}
      className="group">
      <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: BRAND_GREEN }}>
        <Headphones size={16} color="#090A0C" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5', lineHeight: 1.35 }}>24/7 Emergency Support</p>
        <p style={{ fontSize: 11, color: '#6E7480', marginTop: 2 }}>
          Operators standing by · Medical, security, evacuation & more
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, padding: '4px 10px', background: 'rgba(74,222,128,0.12)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.25)', letterSpacing: '0.06em' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite', display: 'inline-block' }} className="animate-pulse" />
          LIVE
        </span>
        <ChevronRight size={15} style={{ color: '#3C4050' }} />
      </div>
    </Link>
  )
}

// ── Training Nudge ────────────────────────────────────────────────────────────
function TrainingNudge({ module: mod, score }) {
  if (!mod || score >= 70) return null
  const name = mod.module_name || MODULE_NAMES[mod.module_order] || `Module ${mod.module_order}`
  const gainEst = Math.round(12.5 * 0.4)
  return (
    <Link to="/training"
      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', marginBottom: 24, background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.25)', textDecoration: 'none', transition: 'opacity 0.15s' }}
      className="group">
      <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#7C3AED' }}>
        <GraduationCap size={16} color="white" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5', lineHeight: 1.35 }}>Complete your next training module</p>
        <p style={{ fontSize: 11, color: '#A78BFA', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 600 }}>{name}</span> — raises your compliance score by ~{gainEst}%
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#A78BFA', flexShrink: 0 }}>
        Start <ChevronRight size={15} />
      </div>
    </Link>
  )
}

// ── Health Declaration Nudge ──────────────────────────────────────────────────
function HealthNudge({ trip }) {
  if (!trip) return null
  return (
    <Link to={`/health/${trip.id}`}
      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', marginBottom: 24, background: 'rgba(170,204,0,0.08)', border: '1px solid rgba(170,204,0,0.22)', textDecoration: 'none', transition: 'opacity 0.15s' }}
      className="group">
      <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: BRAND_GREEN }}>
        <Stethoscope size={16} color="#090A0C" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: BRAND_GREEN, lineHeight: 1.35 }}>Complete your pre-travel health declaration</p>
        <p style={{ fontSize: 11, color: '#6E7480', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 600 }}>{trip.trip_name || trip.arrival_city}</span> · Departs {trip.depart_date} · Required before departure
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: BRAND_GREEN, flexShrink: 0 }}>
        Complete <ChevronRight size={15} />
      </div>
    </Link>
  )
}

// ── Morning Brief ─────────────────────────────────────────────────────────────
const BRIEF_SEV_STYLE = {
  Critical: { bg: 'rgba(168,53,53,0.15)',  border: 'rgba(168,53,53,0.30)', text: '#FCA5A5' },
  High:     { bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.25)', text: '#FDBA74' },
  Medium:   { bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.25)',  text: '#FDE68A' },
  Low:      { bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.20)', text: '#4ADE80' },
}
function MorningBriefCard({ brief, loading }) {
  const [expanded, setExpanded] = useState(true)
  if (loading) {
    return (
      <div style={{ background: '#11131A', border: '1px solid rgba(170,204,0,0.15)', padding: 20, marginBottom: 24 }} className="animate-pulse">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: BRAND_GREEN }}>
            <Brain size={16} color="#090A0C" />
          </div>
          <div style={{ height: 12, width: 176, background: 'rgba(170,204,0,0.12)' }} />
          <RefreshCw size={12} className="ml-auto animate-spin" style={{ color: 'rgba(170,204,0,0.4)', marginLeft: 'auto' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3].map(i => <div key={i} style={{ height: 8, background: 'rgba(255,255,255,0.04)', width: i === 3 ? '65%' : i === 2 ? '80%' : '100%' }} />)}
        </div>
      </div>
    )
  }
  if (!brief) return null
  return (
    <div style={{ background: '#11131A', border: '1px solid rgba(170,204,0,0.15)', marginBottom: 24, overflow: 'hidden' }}>
      <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', transition: 'background 0.15s' }}
        onClick={() => setExpanded(e => !e)}>
        <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: BRAND_GREEN }}>
          <Brain size={16} color="#090A0C" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5' }}>AI Intelligence Brief</span>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', background: 'rgba(170,204,0,0.12)', color: BRAND_GREEN, display: 'flex', alignItems: 'center', gap: 4, letterSpacing: '0.08em' }}>
              <Zap size={7} /> LIVE
            </span>
          </div>
          <p style={{ fontSize: 11, color: '#6E7480', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brief.headline}</p>
        </div>
        <ChevronRight size={15} style={{ flexShrink: 0, color: '#3C4050', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
      </button>
      {expanded && (
        <div style={{ padding: '16px 20px 20px', borderTop: '1px solid rgba(170,204,0,0.08)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: '#EAEEF5', fontWeight: 500, lineHeight: 1.65 }}>{brief.headline}</p>
          {brief.situations?.length > 0 && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#3C4050', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Active Situations</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {brief.situations.map((s, i) => {
                  const st = BRIEF_SEV_STYLE[s.severity] || BRIEF_SEV_STYLE.Medium
                  return (
                    <div key={i} style={{ padding: '10px 14px', background: st.bg, border: `1px solid ${st.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: st.text }}>{s.country}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: st.text, opacity: 0.7 }}>{s.severity}</span>
                      </div>
                      <p style={{ fontSize: 11, lineHeight: 1.6, color: st.text, opacity: 0.85 }}>{s.summary}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {brief.priority_actions?.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <ListChecks size={11} style={{ color: BRAND_GREEN }} />
                <p style={{ fontSize: 10, fontWeight: 700, color: '#3C4050', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Priority Actions</p>
              </div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none', padding: 0, margin: 0 }}>
                {brief.priority_actions.map((a, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, color: '#EAEEF5' }}>
                    <span style={{ marginTop: 1, width: 16, height: 16, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'rgba(170,204,0,0.12)', color: BRAND_GREEN }}>{i + 1}</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p style={{ fontSize: 10, color: '#3C4050', textAlign: 'right', paddingTop: 4 }}>Powered by Claude AI · Updates on each scan</p>
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
  const clickRef     = useRef(onCountryClick)
  useEffect(() => { clickRef.current = onCountryClick }, [onCountryClick])

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !trips.length) return

    const map = new maplibregl.Map({
      container:   containerRef.current,
      style:       MAP_STYLES.standard,
      center:      [20, 10],
      zoom:        1.8,
      scrollZoom:  false,
      minZoom:     1,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('load', () => {
      const todayISO = new Date().toISOString().split('T')[0]
      const features = []
      const lnglats  = []

      trips.forEach(trip => {
        const country  = cityToCountry(trip.arrival_city) || trip.arrival_city
        const coords   = COUNTRY_META[country]
        if (!coords) return
        const isActive = trip.depart_date <= todayISO && trip.return_date >= todayISO
        const sev      = destRisk[country]?.severity || 'default'
        const pin      = RISK_PIN[sev] || RISK_PIN.default
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [coords.lon, coords.lat] },
          properties: {
            tripName: trip.trip_name, arrivalCity: trip.arrival_city, country,
            isActive, color: pin.fill, radius: isActive ? pin.r + 3 : pin.r,
            departDate: trip.depart_date, returnDate: trip.return_date,
          },
        })
        lnglats.push([coords.lon, coords.lat])
      })

      map.addSource('trips', { type: 'geojson', data: { type: 'FeatureCollection', features } })
      map.addLayer({
        id: 'trip-circles', type: 'circle', source: 'trips',
        paint: {
          'circle-radius':          ['get', 'radius'],
          'circle-color':           ['get', 'color'],
          'circle-opacity':         ['case', ['get', 'isActive'], 0.9, 0.65],
          'circle-stroke-width':    2,
          'circle-stroke-color':    ['get', 'color'],
          'circle-stroke-opacity':  0.9,
        },
      })

      map.on('click', 'trip-circles', e => {
        const p  = e.features[0].properties
        const el = document.createElement('div')
        el.style.cssText = 'font-family:system-ui,sans-serif;min-width:160px'
        el.innerHTML = `
          <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#EAEEF5">${p.tripName}</div>
          <div style="font-size:11px;color:#6b7280;margin-bottom:6px">
            ${p.arrivalCity}${p.country !== p.arrivalCity ? ` · ${p.country}` : ''}
          </div>
          ${p.isActive
            ? '<div style="font-size:10px;font-weight:700;color:#0118A1;margin-bottom:8px">✈️ Active now</div>'
            : `<div style="font-size:10px;color:#9ca3af;margin-bottom:8px">${p.departDate} → ${p.returnDate}</div>`}
        `
        const btn = document.createElement('button')
        btn.textContent = 'View Risk Report →'
        btn.style.cssText = 'display:block;width:100%;background:#0118A1;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:11px;font-weight:600;cursor:pointer'
        btn.onclick = () => { clickRef.current(p.country); popup.remove() }
        el.appendChild(btn)
        const popup = new maplibregl.Popup({ offset: 10 }).setLngLat(e.lngLat).setDOMContent(el).addTo(map)
      })
      map.on('mouseenter', 'trip-circles', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'trip-circles', () => { map.getCanvas().style.cursor = '' })

      if (lnglats.length === 1) {
        map.flyTo({ center: lnglats[0], zoom: 5 })
      } else if (lnglats.length > 1) {
        const bounds = lnglats.reduce(
          (b, ll) => b.extend(ll),
          new maplibregl.LngLatBounds(lnglats[0], lnglats[0]),
        )
        map.fitBounds(bounds, { padding: 50, maxZoom: 6 })
      }
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [trips, destRisk])

  if (!trips.length) return null

  return (
    <div className="mb-7">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(170,204,0,0.10)', border: '1px solid rgba(170,204,0,0.20)' }}>
            <Globe size={13} style={{ color: BRAND_GREEN }} />
          </div>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5' }}>My Travel Map</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {Object.entries(RISK_PIN).filter(([k]) => k !== 'default').map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: v.fill, display: 'inline-block' }} />
              <span style={{ fontSize: 10, color: '#6E7480', fontWeight: 500 }}>{k}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden', isolation: 'isolate' }}>
        <div ref={containerRef} style={{ height: 300 }} />
      </div>
    </div>
  )
}

// ── Solo World Explorer Map ────────────────────────────────────────────────────
const MAJOR_CITIES = [
  { name: 'London',       lat: 51.505,  lng: -0.090 },
  { name: 'New York',     lat: 40.712,  lng: -74.006 },
  { name: 'Tokyo',        lat: 35.676,  lng: 139.650 },
  { name: 'Dubai',        lat: 25.204,  lng: 55.270 },
  { name: 'Singapore',    lat: 1.352,   lng: 103.820 },
  { name: 'Paris',        lat: 48.857,  lng: 2.347 },
  { name: 'Sydney',       lat: -33.868, lng: 151.209 },
  { name: 'São Paulo',    lat: -23.548, lng: -46.636 },
  { name: 'Lagos',        lat: 6.524,   lng: 3.379 },
  { name: 'Mumbai',       lat: 19.076,  lng: 72.877 },
  { name: 'Nairobi',      lat: -1.286,  lng: 36.817 },
  { name: 'Johannesburg', lat: -26.204, lng: 28.047 },
  { name: 'Cairo',        lat: 30.044,  lng: 31.235 },
  { name: 'Cape Town',    lat: -33.925, lng: 18.424 },
  { name: 'Istanbul',     lat: 41.015,  lng: 28.979 },
  { name: 'Bangkok',      lat: 13.754,  lng: 100.502 },
  { name: 'Hong Kong',    lat: 22.319,  lng: 114.169 },
  { name: 'Seoul',        lat: 37.566,  lng: 126.978 },
  { name: 'Amsterdam',    lat: 52.373,  lng: 4.890 },
  { name: 'Frankfurt',    lat: 50.110,  lng: 8.682 },
  { name: 'Doha',         lat: 25.286,  lng: 51.533 },
  { name: 'Addis Ababa',  lat: 9.025,   lng: 38.747 },
  { name: 'Casablanca',   lat: 33.589,  lng: -7.613 },
  { name: 'Mexico City',  lat: 19.432,  lng: -99.133 },
  { name: 'Buenos Aires', lat: -34.603, lng: -58.381 },
  { name: 'Toronto',      lat: 43.653,  lng: -79.383 },
  { name: 'Los Angeles',  lat: 34.052,  lng: -118.244 },
  { name: 'Chicago',      lat: 41.878,  lng: -87.629 },
  { name: 'Kuala Lumpur', lat: 3.140,   lng: 101.687 },
  { name: 'Jakarta',      lat: -6.208,  lng: 106.845 },
  { name: 'Riyadh',       lat: 24.688,  lng: 46.722 },
  { name: 'Karachi',      lat: 24.861,  lng: 67.010 },
  { name: 'Manila',       lat: 14.598,  lng: 120.984 },
  { name: 'Accra',        lat: 5.560,   lng: -0.197 },
]

function SoloWorldMap({ trips, onCountryClick, T = {} }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const clickRef     = useRef(onCountryClick)
  useEffect(() => { clickRef.current = onCountryClick }, [onCountryClick])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container:        containerRef.current,
      style:            MAP_STYLES.operational,
      center:           [20, 10],
      zoom:             1.8,
      scrollZoom:       false,
      minZoom:          1,
      attributionControl: false,
    })

    map.on('load', () => {
      // Major city glow dots
      map.addSource('cities', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: MAJOR_CITIES.map(c => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
            properties: { name: c.name },
          })),
        },
      })
      map.addLayer({
        id: 'city-glow', type: 'circle', source: 'cities',
        paint: {
          'circle-radius':  2.5,
          'circle-color':   '#AACC00',
          'circle-opacity': 0.55,
          'circle-stroke-width': 0,
        },
      })

      // Trip destinations
      const todayISO = new Date().toISOString().split('T')[0]
      const features = trips.map(trip => {
        const country  = cityToCountry(trip.arrival_city) || trip.arrival_city
        const coords   = getCityCoords(trip.arrival_city) || COUNTRY_META[country]
        if (!coords) return null
        const isActive = trip.depart_date <= todayISO && trip.return_date >= todayISO
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [coords.lng ?? coords.lon, coords.lat] },
          properties: {
            tripName: trip.trip_name, arrivalCity: trip.arrival_city, country,
            isActive, departDate: trip.depart_date, returnDate: trip.return_date,
          },
        }
      }).filter(Boolean)

      if (features.length) {
        map.addSource('solo-trips', { type: 'geojson', data: { type: 'FeatureCollection', features } })
        map.addLayer({
          id: 'solo-circles', type: 'circle', source: 'solo-trips',
          paint: {
            'circle-radius':         ['case', ['get', 'isActive'], 12, 8],
            'circle-color':          ['case', ['get', 'isActive'], '#AACC00', '#3A5870'],
            'circle-opacity':        ['case', ['get', 'isActive'], 0.85, 0.70],
            'circle-stroke-width':   2,
            'circle-stroke-color':   ['case', ['get', 'isActive'], '#AACC00', '#6EA8C8'],
          },
        })

        map.on('click', 'solo-circles', e => {
          const p  = e.features[0].properties
          const el = document.createElement('div')
          el.style.cssText = 'font-family:system-ui,sans-serif;min-width:150px'
          el.innerHTML = `
            <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#EAEEF5">${p.tripName}</div>
            <div style="font-size:11px;color:#9ca3af;margin-bottom:6px">${p.arrivalCity}</div>
            ${p.isActive
              ? '<div style="font-size:10px;font-weight:700;color:#AACC00;margin-bottom:8px">✈️ Active now</div>'
              : `<div style="font-size:10px;color:#9ca3af;margin-bottom:8px">${p.departDate} → ${p.returnDate}</div>`}
          `
          const btn = document.createElement('button')
          btn.textContent = 'View Intel →'
          btn.style.cssText = 'display:block;width:100%;background:#AACC00;color:#090A0C;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer'
          btn.onclick = () => { clickRef.current(p.country); popup.remove() }
          el.appendChild(btn)
          const popup = new maplibregl.Popup({ offset: 10 }).setLngLat(e.lngLat).setDOMContent(el).addTo(map)
        })
        map.on('mouseenter', 'solo-circles', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'solo-circles', () => { map.getCanvas().style.cursor = '' })
      }
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [trips])

  return (
    <div className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: DS.greenDim }}>
            <Globe size={13} style={{ color: BRAND_GREEN }} />
          </div>
          <h2 className="text-sm font-bold" style={{ color: DS.white }}>World Explorer</h2>
        </div>
        <span className="text-[10px] font-medium" style={{ color: T.textMuted || '#9CA3AF' }}>Click a destination for a full intel brief</span>
      </div>
      <div className="rounded-2xl overflow-hidden relative"
        style={{ boxShadow: '0 2px 24px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)', isolation: 'isolate' }}>
        <div ref={containerRef} style={{ height: 400 }} />
        <div className="absolute bottom-3 left-3 flex items-center gap-3 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#AACC00', opacity: 0.6 }} />
            <span className="text-[10px] text-gray-300 font-medium">Major city</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#AACC00' }} />
            <span className="text-[10px] text-gray-300 font-medium">Active trip</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#6EA8C8' }} />
            <span className="text-[10px] text-gray-300 font-medium">Upcoming</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Live News Feed Widget ──────────────────────────────────────────────────────
// ── Live Intelligence Widget ───────────────────────────────────────────────────
const INTEL_REGION = {
  Nigeria: 'WEST AFRICA', Ghana: 'WEST AFRICA', Senegal: 'WEST AFRICA', Mali: 'WEST AFRICA',
  'Burkina Faso': 'WEST AFRICA', Niger: 'WEST AFRICA', Cameroon: 'WEST AFRICA',
  Kenya: 'EAST AFRICA', Ethiopia: 'EAST AFRICA', Somalia: 'EAST AFRICA',
  Tanzania: 'EAST AFRICA', Uganda: 'EAST AFRICA', Rwanda: 'EAST AFRICA',
  Sudan: 'EAST AFRICA', Chad: 'EAST AFRICA',
  'South Africa': 'SOUTHERN AFRICA', Zimbabwe: 'SOUTHERN AFRICA', Mozambique: 'SOUTHERN AFRICA',
  Libya: 'NORTH AFRICA', Egypt: 'NORTH AFRICA', Tunisia: 'NORTH AFRICA', Algeria: 'NORTH AFRICA',
  UAE: 'GULF', 'Saudi Arabia': 'GULF', Kuwait: 'GULF', Iraq: 'GULF',
  Lebanon: 'LEVANT', Yemen: 'LEVANT', Syria: 'LEVANT',
  Afghanistan: 'CENTRAL ASIA', Pakistan: 'CENTRAL ASIA', Myanmar: 'SOUTHEAST ASIA',
  'Democratic Republic of Congo': 'CENTRAL AFRICA', Iran: 'MIDDLE EAST',
}

const INTEL_SEV_STYLE = {
  5: { bg: 'rgba(168,53,53,0.15)',   color: '#FCA5A5', border: 'rgba(168,53,53,0.30)',   bar: '#EF4444', label: 'CRITICAL' },
  4: { bg: 'rgba(249,115,22,0.12)',  color: '#FDBA74', border: 'rgba(249,115,22,0.25)',  bar: '#F97316', label: 'HIGH' },
  3: { bg: 'rgba(234,179,8,0.12)',   color: '#FDE68A', border: 'rgba(234,179,8,0.25)',   bar: '#EAB308', label: 'MEDIUM' },
  2: { bg: 'rgba(170,204,0,0.08)',   color: '#AACC00', border: 'rgba(170,204,0,0.18)',   bar: '#AACC00', label: 'LOW' },
  1: { bg: 'rgba(148,163,184,0.08)', color: '#94A3B8', border: 'rgba(148,163,184,0.18)', bar: '#94A3B8', label: 'INFO' },
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
      headers: { 'Accept-Language': 'en' }, signal: AbortSignal.timeout(4000),
    })
    const data = await res.json()
    return data?.address?.country || null
  } catch { return null }
}

function LiveIntelWidget({ trips = [], compact = false }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [locationCountry, setLocationCountry] = useState(null)
  const [locationAsked, setLocationAsked] = useState(false)
  const LIMIT = compact ? 4 : 7

  // Derive unique destination countries from booked trips
  const tripCountries = [...new Set(
    (trips || []).map(t => cityToCountry(t.arrival_city) || t.arrival_city).filter(Boolean)
  )]

  // Ask for location once
  useEffect(() => {
    if (locationAsked) return
    setLocationAsked(true)
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const country = await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
        if (country) setLocationCountry(country)
      },
      () => {}
    )
  }, [locationAsked])

  useEffect(() => {
    const priorityCountries = [...new Set([...tripCountries, locationCountry].filter(Boolean))]
    const FIELDS = 'id, country, city, severity, movement_impact, raw_title, raw_summary, ingested_at, event_type'

    async function load() {
      setLoading(true)
      let priority = [], general = []

      if (priorityCountries.length > 0) {
        const { data } = await supabase
          .from('live_intelligence')
          .select(FIELDS)
          .eq('is_active', true)
          .in('country', priorityCountries)
          .order('severity', { ascending: false })
          .order('ingested_at', { ascending: false })
          .limit(Math.ceil(LIMIT * 0.6))
        priority = data || []
      }

      const seenCountries = priority.map(r => r.country)
      const remaining = LIMIT - priority.length

      if (remaining > 0) {
        let q = supabase
          .from('live_intelligence')
          .select(FIELDS)
          .eq('is_active', true)
          .order('severity', { ascending: false })
          .order('ingested_at', { ascending: false })
          .limit(remaining + seenCountries.length)
        const { data } = await q
        general = (data || []).filter(r => !seenCountries.includes(r.country)).slice(0, remaining)
      }

      setItems([...priority, ...general])
      setLoading(false)
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationCountry, trips?.length, compact])

  const utc = new Date().toUTCString().slice(17, 25)
  const contextLabel = tripCountries.length > 0
    ? `Prioritising: ${tripCountries.slice(0, 2).join(', ')}${tripCountries.length > 2 ? ` +${tripCountries.length - 2}` : ''}`
    : locationCountry
      ? `Localised to: ${locationCountry}`
      : 'Global operational feed'

  return (
    <div style={{ background: '#11131A', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(170,204,0,0.10)' }}>
            <Radio size={14} style={{ color: BRAND_GREEN }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5' }}>Live Intelligence Feed</h2>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, color: BRAND_GREEN, letterSpacing: '0.1em' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: BRAND_GREEN, display: 'inline-block', animation: 'pulse 2s infinite' }} />
                LIVE
              </span>
            </div>
            <p style={{ fontSize: 11, color: '#6E7480' }}>{utc} UTC · {contextLabel}</p>
          </div>
        </div>
        <Link to="/alerts" style={{ fontSize: 11, fontWeight: 600, color: BRAND_GREEN, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          All alerts <ChevronRight size={12} />
        </Link>
      </div>

      {/* Items */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
          {[1,2,3].map(i => <div key={i} style={{ height: 72, background: 'rgba(255,255,255,0.03)' }} className="animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: 8 }}>
          <Radio size={24} style={{ color: '#3C4050' }} />
          <p style={{ fontSize: 13, color: '#6E7480' }}>Feed updating — check back shortly</p>
        </div>
      ) : (
        <div>
          {items.map((item, i) => {
            const sev = INTEL_SEV_STYLE[item.severity] || INTEL_SEV_STYLE[2]
            const isPriority = tripCountries.includes(item.country) || item.country === locationCountry
            const region = INTEL_REGION[item.country] || (item.country?.toUpperCase() ?? 'GLOBAL')
            const location = item.city ? `${item.city}, ${item.country}` : item.country
            const mins = Math.floor((Date.now() - new Date(item.ingested_at).getTime()) / 60000)
            const timeStr = mins < 60 ? `${mins}m ago` : `${Math.floor(mins/60)}h ${mins%60}m ago`
            return (
              <div key={item.id} style={{
                padding: '12px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: isPriority ? sev.bg : 'transparent',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, flexShrink: 0, background: sev.bar }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3, gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: sev.color, textTransform: 'uppercase' }}>{region}</span>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>·</span>
                      <span style={{ fontSize: 9, fontWeight: 600, color: sev.color, textTransform: 'uppercase', padding: '1px 5px', background: sev.bg, border: `1px solid ${sev.border}` }}>{sev.label}</span>
                      {isPriority && <span style={{ fontSize: 9, fontWeight: 700, color: BRAND_GREEN, padding: '1px 5px', background: 'rgba(170,204,0,0.10)', border: '1px solid rgba(170,204,0,0.20)' }}>YOUR ROUTE</span>}
                    </div>
                    <span style={{ fontSize: 9, color: '#3C4050', fontFamily: 'monospace', flexShrink: 0 }}>{timeStr}</span>
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#EAEEF5', lineHeight: 1.4, marginBottom: 3 }}>{(item.raw_title || '').slice(0, 80)}</p>
                  {!compact && item.raw_summary && (
                    <p style={{ fontSize: 11, color: '#6E7480', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.raw_summary.slice(0, 160)}</p>
                  )}
                  {location && <p style={{ fontSize: 10, color: '#3C4050', marginTop: 3 }}>{location}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const NEWS_FEEDS = ['osac', 'bbc-africa', 'african-arguments', 'iss-africa', 'crisis-group-africa']
const FEED_LABELS = { osac: 'OSAC', 'bbc-africa': 'BBC Africa', 'african-arguments': 'African Arguments', 'iss-africa': 'ISS Africa', 'crisis-group-africa': 'Crisis Group' }

function LiveNewsFeed({ compact = false }) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeFeed, setActiveFeed] = useState('osac')

  useEffect(() => {
    setLoading(true)
    setArticles([])
    getFeedById(activeFeed, 6)
      .then(d => { setArticles(d.articles || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [activeFeed])

  return (
    <div style={{ background: '#11131A', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(170,204,0,0.10)' }}>
            <Radio size={14} style={{ color: BRAND_GREEN }} />
          </div>
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5' }}>Latest News</h2>
            <p style={{ fontSize: 11, color: '#6E7480' }}>Live security & risk intelligence</p>
          </div>
        </div>
        <Link to="/intel-feeds" style={{ fontSize: 11, fontWeight: 600, color: BRAND_GREEN, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          All feeds <ChevronRight size={12} />
        </Link>
      </div>

      {/* Feed tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '12px 16px 8px', overflowX: 'auto' }}>
        {NEWS_FEEDS.map(id => (
          <button key={id} onClick={() => setActiveFeed(id)}
            style={{ flexShrink: 0, padding: '4px 10px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: activeFeed === id ? BRAND_GREEN : 'rgba(255,255,255,0.06)',
              color: activeFeed === id ? '#090A0C' : '#6E7480',
            }}>
            {FEED_LABELS[id]}
          </button>
        ))}
      </div>

      {/* Articles */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
          {[1,2,3].map(i => <div key={i} style={{ height: 44, background: 'rgba(255,255,255,0.03)' }} className="animate-pulse"/>)}
        </div>
      ) : articles.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 8 }}>
          <Radio size={24} style={{ color: '#3C4050' }} />
          <p style={{ fontSize: 13, color: '#6E7480' }}>No articles available</p>
        </div>
      ) : (
        <div>
          {articles.slice(0, compact ? 4 : 6).map((art, i) => (
            <a key={i} href={art.link} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', textDecoration: 'none', transition: 'background 0.15s' }}
              className="group">
              <div style={{ marginTop: 6, width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: 'rgba(170,204,0,0.4)', transition: 'background 0.15s' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#EAEEF5', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{art.title}</p>
                <p style={{ fontSize: 11, color: '#3C4050', marginTop: 2 }}>{FEED_LABELS[activeFeed]} · {timeAgo(art.pubDate)}</p>
              </div>
              <ChevronRight size={12} style={{ color: '#3C4050', flexShrink: 0, marginTop: 6 }} />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Solo News Widget ───────────────────────────────────────────────────────────
function SoloNewsWidget({ alerts, hasTrips = false, loading, onCountryClick, T = {} }) {
  const isDark = true // always dark operational theme

  if (loading) return (
    <div className="mb-7">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: DS.redDim }}>
          <Radio size={13} style={{ color: '#EF4444' }} />
        </div>
        <h2 className="text-sm font-bold" style={{ color: DS.white }}>
          {hasTrips ? 'Destination Intelligence' : 'Global Intel Feed'}
        </h2>
      </div>
      <div className="space-y-2">
        {[1,2,3].map(i => <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: DS.surface, border: `1px solid ${DS.border}` }} />)}
      </div>
    </div>
  )

  // "LIVE" only if newest alert is within 7 days
  const newestDate = alerts?.[0]?.date_issued ? new Date(alerts[0].date_issued) : null
  const isLive = newestDate && (Date.now() - newestDate.getTime()) < 7 * 24 * 60 * 60 * 1000
  const title = hasTrips ? 'Destination Intelligence' : 'Global Intel Feed'

  if (!alerts?.length) return (
    <div className="mb-7">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: DS.redDim }}>
          <Radio size={13} style={{ color: '#EF4444' }} />
        </div>
        <h2 className="text-sm font-bold" style={{ color: DS.white }}>{title}</h2>
      </div>
      <div className="rounded-2xl px-5 py-8 text-center" style={{ background: DS.surface, border: `1px solid ${DS.border}` }}>
        {hasTrips ? (
          <>
            <CheckCircle2 size={20} className="text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-600 mb-0.5">No active alerts for your destinations</p>
            <p className="text-xs text-gray-400">We'll surface any relevant threats here as they emerge.</p>
          </>
        ) : (
          <>
            <Globe size={20} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-500 mb-0.5">No critical global alerts right now</p>
            <p className="text-xs text-gray-400">
              <Link to="/itinerary" className="underline" style={{ color: BRAND_GREEN }}>Add a trip</Link> to see destination-specific intelligence.
            </p>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: DS.redDim }}>
            <Radio size={13} style={{ color: '#EF4444' }} />
          </div>
          <h2 className="text-sm font-bold" style={{ color: DS.white }}>{title}</h2>
          {isLive && (
            <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: DS.redDim, color: DS.redText, border: `1px solid ${'rgba(138,46,46,0.35)'}` }}>
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" /> LIVE
            </span>
          )}
        </div>
        <Link to="/alerts" className="text-xs font-semibold hover:underline flex items-center gap-1" style={{ color: BRAND_GREEN }}>
          View all <ChevronRight size={11} />
        </Link>
      </div>
      <div className="space-y-2">
        {alerts.map(alert => {
          const pill = SEVERITY_PILL[alert.severity] || SEVERITY_PILL.Low
          const cardBg     = pill.bg
          const cardBorder = pill.border
          return (
            <div key={alert.id} className="rounded-2xl flex items-start gap-3 px-4 py-3.5 transition-all hover:opacity-90 cursor-default"
              style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
              <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: pill.bar }} />
              <span className="text-base shrink-0 leading-none mt-0.5">{ALERT_TYPE_ICON[alert.alert_type] || '⚠️'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <p className="text-sm font-semibold leading-snug" style={{ color: DS.white }}>{alert.title}</p>
                  <span className="text-[10px] font-bold uppercase shrink-0 px-2 py-0.5 rounded-full"
                    style={{ background: pill.bg, color: pill.text }}>{alert.severity}</span>
                </div>
                {alert.description && (
                  <p className="text-xs leading-relaxed line-clamp-2 mb-1.5" style={{ color: DS.textSub }}>{alert.description}</p>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  {alert.country && (
                    <button onClick={() => onCountryClick(alert.country)}
                      className="text-[11px] font-semibold flex items-center gap-1 hover:underline" style={{ color: BRAND_GREEN }}>
                      <Globe size={9} /> {alert.country} intel →
                    </button>
                  )}
                  {alert.date_issued && (
                    <span className="text-[10px]" style={{ color: T.textMuted || '#9CA3AF' }}>{fmtEventDate(alert.date_issued)}</span>
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

// ── Solo Trip Risk Report ─────────────────────────────────────────────────────
const RISK_CONFIG = {
  Critical: { bar: '#EF4444', label: 'Critical',   pct: 100, dot: '#EF4444' },
  High:     { bar: '#F97316', label: 'High',        pct: 75,  dot: '#F97316' },
  Medium:   { bar: '#EAB308', label: 'Medium',      pct: 50,  dot: '#EAB308' },
  Low:      { bar: '#22C55E', label: 'Low',         pct: 25,  dot: '#22C55E' },
  Info:     { bar: '#60A5FA', label: 'Info',        pct: 10,  dot: '#60A5FA' },
}

function SoloTripRiskReport({ trips, destRisk, destAlerts, loading, onCountryClick, T }) {
  const isDark = true // always dark operational theme
  const todayISO = new Date().toISOString().split('T')[0]

  if (loading) return (
    <div className="mb-7">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: DS.greenDim }}>
          <Shield size={13} style={{ color: BRAND_GREEN }} />
        </div>
        <h2 className="text-sm font-bold" style={{ color: DS.white }}>Trip Risk Report</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1,2].map(i => <div key={i} className="h-36 rounded-2xl animate-pulse" style={{ background: DS.surface, border: `1px solid ${DS.border}` }} />)}
      </div>
    </div>
  )

  if (!trips.length) return (
    <div className="mb-7 rounded-2xl p-6 flex items-center gap-4"
      style={{ background: DS.surface, border: `1px solid ${DS.border}`, boxShadow: T?.cardShadow }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: DS.greenDim }}>
        <Plane size={18} style={{ color: BRAND_GREEN }} />
      </div>
      <div>
        <p className="text-sm font-bold mb-0.5" style={{ color: DS.white }}>No trips booked yet</p>
        <p className="text-xs" style={{ color: DS.textSub }}>Add a trip to see a real-time risk report for your destination.</p>
      </div>
      <Link to="/itinerary" className="ml-auto text-xs font-bold px-3 py-2 rounded-xl shrink-0 transition-opacity hover:opacity-80"
        style={{ background: BRAND_GREEN, color: DS.bg }}>
        Plan a Trip →
      </Link>
    </div>
  )

  return (
    <div className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: DS.greenDim }}>
            <Shield size={13} style={{ color: BRAND_GREEN }} />
          </div>
          <h2 className="text-sm font-bold" style={{ color: DS.white }}>Trip Risk Report</h2>
        </div>
        <span className="text-[10px] font-medium" style={{ color: T?.textMuted || '#9CA3AF' }}>
          {trips.length} trip{trips.length !== 1 ? 's' : ''} · live risk data
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {trips.map(trip => {
          const country  = cityToCountry(trip.arrival_city) || trip.arrival_city
          const risk     = destRisk[country]
          const alertCnt = destAlerts[country] ?? 0
          const sev      = risk?.severity || null
          const cfg      = RISK_CONFIG[sev] || { bar: 'rgba(255,255,255,0.12)', label: 'Scanning…', pct: 0, dot: '#9CA3AF' }
          const isActive = trip.depart_date <= todayISO && trip.return_date >= todayISO
          const departs  = new Date(trip.depart_date)
          const daysOut  = Math.max(0, Math.ceil((departs - new Date()) / 86400000))
          const statusLabel = isActive ? '✈️ Active now' : daysOut === 0 ? 'Departing today' : daysOut === 1 ? 'Tomorrow' : `In ${daysOut} days`

          return (
            <button key={trip.id} onClick={() => onCountryClick(country)}
              className="rounded-2xl p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg flex flex-col gap-3 w-full"
              style={{ background: DS.surface, border: `1px solid ${DS.border}`, boxShadow: T?.cardShadow || '0 1px 3px rgba(0,0,0,0.06)' }}>

              {/* Top row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: DS.white }}>{trip.trip_name}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: DS.textSub }}>{trip.arrival_city} · {country}</p>
                </div>
                {isActive ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${BRAND_GREEN}20`, color: BRAND_GREEN }}>LIVE</span>
                ) : (
                  <span className="text-[10px] font-medium shrink-0" style={{ color: T?.textMuted || '#9CA3AF' }}>{statusLabel}</span>
                )}
              </div>

              {/* Risk gauge */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.dot }} />
                    <span className="text-xs font-bold" style={{ color: cfg.dot }}>{cfg.label} Risk</span>
                  </div>
                  {alertCnt > 0 && (
                    <span className="text-[10px] font-semibold" style={{ color: DS.redText }}>
                      {alertCnt} active alert{alertCnt !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${cfg.pct}%`, background: cfg.bar }} />
                </div>
              </div>

              {/* Summary */}
              {risk?.summary ? (
                <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: DS.textSub }}>
                  {risk.summary}
                </p>
              ) : (
                <p className="text-[11px]" style={{ color: T?.textMuted || '#9CA3AF' }}>
                  {sev ? '' : 'Tap to load full country intel →'}
                </p>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-1" style={{ borderTop: `1px solid ${DS.border}` }}>
                <span className="text-[10px]" style={{ color: T?.textMuted || '#9CA3AF' }}>
                  {trip.depart_date} → {trip.return_date}
                </span>
                <span className="text-[10px] font-semibold" style={{ color: BRAND_GREEN }}>
                  Full Intel →
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Simple markdown → HTML for AI chat bubbles ───────────────────────────────
function mdToHtml(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^#{1,3} (.+)$/gm, '<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-*] (.+)$/gm, '• $1')
    .replace(/\n{2,}/g, '</p><p style="margin:6px 0 0">')
    .replace(/\n/g, '<br/>')
}

// ── Dashboard AI Chat ─────────────────────────────────────────────────────────
function DashboardAiChat({ profile, trips, orgName, role, dark = false }) {
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
  const msgContainerRef         = useRef(null)

  // Scroll the messages container directly — never the page.
  // scrollIntoView() in Safari scrolls the nearest scroll ancestor which can
  // be the page itself, causing the whole dashboard to jump.
  useEffect(() => {
    if (messages.length > 1 && msgContainerRef.current) {
      msgContainerRef.current.scrollTop = msgContainerRef.current.scrollHeight
    }
  }, [messages])

  const QUICK = role === 'admin' || role === 'org_admin'
    ? ['What are the highest risk destinations my staff may travel to?', 'What is our duty of care?', 'Summarise current global threat landscape']
    : trips.length
      ? [`What should I know before travelling to ${cityToCountry(trips[0]?.arrival_city) || trips[0]?.arrival_city}?`, 'What to do in a medical emergency abroad?', 'What vaccinations might I need?']
      : ['What are the safest countries to travel to right now?', 'What should I pack for a business trip?', 'How do I stay safe in high-risk areas?']

  const send = async (msg) => {
    const text = (msg || input).trim()
    if (!text || sending) return
    setInput('')
    const history = messages  // capture full history before state update
    setMessages(prev => [...prev, { role: 'user', text }])
    setSending(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      const data = await sendAssistantMessage(text, token, {
        history,
        context: {
          travelerName: profile?.full_name,
          activeTrips:  tripSummary,
          orgName,
          country: trips[0] ? (cityToCountry(trips[0].arrival_city) || trips[0].arrival_city) : null,
          tripName: trips[0]?.trip_name,
          mode: 'dashboard',
        },
      })
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply || data.error || 'No response received.' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Connection error. Please try again.' }])
    }
    setSending(false)
  }

  const accentColor = BRAND_GREEN
  const msgBg       = DS.bgAlt
  const divider     = DS.divider

  return (
    <div style={{ overflow: 'hidden', background: DS.surface, border: `1px solid ${DS.borderHi}`, boxShadow: '0 4px 32px rgba(0,0,0,0.5)' }}>

      {/* Header */}
      <div className="relative px-5 py-4 overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#0C0E12 0%,#11131A 100%)', borderBottom: `1px solid ${'rgba(170,204,0,0.15)'}` }}>
        {/* Subtle background glow */}
        <div className="absolute inset-0 opacity-20"
          style={{ background: `radial-gradient(ellipse at 80% 50%, ${BRAND_GREEN} 0%, transparent 70%)` }} />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${BRAND_GREEN}25`, border: `1px solid ${BRAND_GREEN}40` }}>
            <Sparkles size={17} color={BRAND_GREEN} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">AI Security Analyst</span>
              <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
              </span>
            </div>
            <p className="text-[11px] mt-0.5 text-white/50">Powered by Claude · ask anything about travel risk or your destinations</p>
          </div>
          {messages.length > 1 && (
            <button onClick={() => setMessages([{ role: 'assistant', text: initialMsg }])}
              className="text-[10px] font-semibold text-white/40 hover:text-white/70 shrink-0 transition-colors">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={msgContainerRef} className="p-4 space-y-3 overflow-y-auto" style={{ background: msgBg, height: 340 }}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mr-2 mt-0.5 flex-shrink-0"
                style={{ background: DS.greenDim }}>
                <Sparkles size={10} style={{ color: BRAND_GREEN }} />
              </div>
            )}
            <div
              style={m.role === 'user'
                ? { maxWidth: '82%', padding: '8px 14px', fontSize: 12, lineHeight: 1.6, background: BRAND_GREEN, color: '#090A0C', fontWeight: 600 }
                : { maxWidth: '82%', padding: '8px 14px', fontSize: 12, lineHeight: 1.6, background: DS.bgAlt, border: `1px solid ${DS.border}`, color: DS.white }}
              dangerouslySetInnerHTML={m.role === 'assistant'
                ? { __html: `<p style="margin:0">${mdToHtml(m.text)}</p>` }
                : undefined}
            >
              {m.role === 'user' ? m.text : null}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="w-6 h-6 flex items-center justify-center shrink-0 mr-2 mt-0.5"
              style={{ background: DS.greenDim }}>
              <Sparkles size={10} style={{ color: BRAND_GREEN }} />
            </div>
            <div style={{ padding: '10px 14px', background: DS.surface, border: `1px solid ${DS.border}` }}>
              <div className="flex gap-1 items-center">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: BRAND_GREEN, animationDelay: `${d}ms`, opacity: 0.6 }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick suggestions — always rendered to prevent layout shift */}
      <div className="px-4 py-3 flex flex-wrap gap-1.5" style={{ borderTop: `1px solid ${divider}`, background: DS.surface }}>
        {QUICK.map((q, i) => (
          <button key={i} onClick={() => send(q)}
            className="text-[11px] font-medium px-3 py-1.5 rounded-full border transition-all hover:scale-[1.02]"
            style={{ color: DS.textSub, borderColor: DS.borderHi, background: 'transparent' }}>
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: `1px solid ${divider}`, background: DS.surface }}>
        <input
          className="flex-1 text-xs outline-none bg-transparent"
          style={{ color: DS.white }}
          placeholder="Ask about risk, safety, destinations…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          disabled={sending}
        />
        <button onClick={() => send()}
          disabled={!input.trim() || sending}
          className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors disabled:opacity-40"
          style={{ backgroundColor: accentColor }}>
          <Send size={13} color={dark ? '#090D1A' : 'white'} />
        </button>
      </div>

      {/* CAIRO CTA */}
      <div className="px-4 py-2.5 flex items-center justify-between"
        style={{ borderTop: `1px solid ${divider}`, background: dark ? 'rgba(170,204,0,0.04)' : 'rgba(1,24,161,0.03)' }}>
        <span className="text-[10px]" style={{ color: dark ? 'rgba(255,255,255,0.35)' : '#9CA3AF' }}>
          Need a full operational risk advisory?
        </span>
        <Link to="/journey-agent"
          className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 rounded-full transition-all hover:opacity-80"
          style={{ background: DS.greenDim, color: BRAND_GREEN, border: `1px solid rgba(170,204,0,0.25)` }}>
          <Navigation size={9} />
          Ask CAIRO →
        </Link>
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
  const [overdueCheckin, setOverdueCheckin] = useState(null)
  const [pendingBriefings, setPendingBriefings] = useState([])
  const [nudgeModule, setNudgeModule]   = useState(null)
  const [nudgeHealthTrip, setNudgeHealthTrip] = useState(null)

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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { loadingRef.current = false; return }

    const uid   = user.id
    const today = new Date().toISOString().split('T')[0]

    // Load profile + role first
    const { data: prof } = await supabase.from('profiles').select('*, organisations(name)').eq('id', uid).single()
    const rawRole = prof?.role || 'traveller'
    // Treat unaffiliated travellers (no org) as solo — consistent with Onboarding.jsx logic
    const adminRoles = ['admin', 'org_admin', 'developer']
    const userRole = rawRole === 'traveller' && !prof?.org_id && !adminRoles.includes(rawRole)
      ? 'solo'
      : rawRole
    setRole(userRole)
    setProfile({ ...prof, id: uid, email: user.email })

    // Alerts are loaded per-role after trip destinations are known — see each branch below

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

      // Relevant alerts: all countries from active org trips (arrival + departure for multi-leg)
      const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const orgTripCountries = [...new Set((activeTrips || []).flatMap(t => [
        cityToCountry(t.arrival_city),
        cityToCountry(t.departure_city),
      ]).filter(Boolean))]
      if (orgTripCountries.length > 0) {
        const perCountry = await Promise.all(orgTripCountries.map(c =>
          supabase.from('alerts').select('*').eq('status', 'Active').gte('date_issued', cutoff7d)
            .ilike('country', `%${c}%`).order('date_issued', { ascending: false }).limit(3)
        ))
        const seen = new Set()
        const deduped = perCountry.flatMap(r => r.data || []).filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true })
        setRecentAlerts(deduped)
      } else {
        const { data: critAlerts } = await supabase.from('alerts').select('*')
          .eq('status', 'Active').eq('severity', 'Critical').gte('date_issued', cutoff7d)
          .order('date_issued', { ascending: false }).limit(5)
        setRecentAlerts(critAlerts || [])
      }

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
      fetch('/api/feed-status', { signal: AbortSignal.timeout(3000) }).then(r => r.json()).catch(() => ({})),
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

    // Health declaration nudge — find first approved trip without a completed declaration
    const approvedTrips = (trips || []).filter(t => t.approval_status === 'approved' && t.status !== 'Completed')
    if (approvedTrips.length > 0) {
      const { data: healthDecs } = await supabase
        .from('pre_travel_health').select('trip_id')
        .in('trip_id', approvedTrips.map(t => t.id)).eq('user_id', uid)
      const healthSet = new Set((healthDecs || []).map(d => d.trip_id))
      setNudgeHealthTrip(approvedTrips.find(t => !healthSet.has(t.id)) || null)
    } else {
      setNudgeHealthTrip(null)
    }

    // Fetch unacknowledged briefings for this user
    const { data: briefings } = await supabase
      .from('travel_briefings')
      .select('id, document_ref, destination, depart_date, risk_level')
      .eq('user_id', uid)
      .is('acknowledged_at', null)
      .order('created_at', { ascending: false })
    setPendingBriefings(briefings || [])
    // Normalise nudge module — join puts module info under training_modules key
    const rawNudge = incompleteModules?.[0] || null
    setNudgeModule(rawNudge ? {
      id:           rawNudge.id,
      module_order: rawNudge.training_modules?.module_order,
      module_name:  rawNudge.training_modules?.title,
    } : null)

    // Relevant alerts: all trip countries (arrival AND departure for multi-leg trips)
    // departure_city is included so intermediate stops like "Accra" in a
    // JHB → Ghana → Kenya itinerary are covered, not just the final destination.
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const countries = [...new Set((trips || []).flatMap(t => [
      cityToCountry(t.arrival_city),
      cityToCountry(t.departure_city),
    ]).filter(Boolean))]
    if (countries.length > 0) {
      const perCountry = await Promise.all(countries.map(c =>
        supabase.from('alerts').select('*').eq('status', 'Active').gte('date_issued', cutoff7d)
          .ilike('country', `%${c}%`).order('date_issued', { ascending: false }).limit(3)
      ))
      const seen = new Set()
      const deduped = perCountry.flatMap(r => r.data || []).filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true })
      setRecentAlerts(deduped)
    } else {
      const { data: critAlerts } = await supabase.from('alerts').select('*')
        .eq('status', 'Active').eq('severity', 'Critical').gte('date_issued', cutoff7d)
        .order('date_issued', { ascending: false }).limit(5)
      setRecentAlerts(critAlerts || [])
    }

    if (countries.length > 0) {
      const [riskResults, alertResults] = await Promise.all([
        Promise.all(countries.map(c =>
          getCountryRisk(c).then(d => [c, d]).catch(() => [c, null])
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
    const channel = supabase.channel('dashboard-watch-v4')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itineraries' },           () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_alerts' },            () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' },                 () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_events' },             () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' },              () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'control_room_requests' },  () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_checkins' },     () => load())
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

  const dark = true
  const T = {
    pageBg:      '#090A0C',
    card:        '#11131A',
    cardBorder:  'rgba(255,255,255,0.07)',
    cardShadow:  '0 1px 3px rgba(0,0,0,0.4)',
    textPrimary: '#EAEEF5',
    textSub:     '#6E7480',
    textMuted:   '#3C4050',
    iconBg:      'rgba(170,204,0,0.10)',
    divider:     'rgba(255,255,255,0.06)',
    inputBg:     '#0C0E12',
  }

  return (
    <Layout>
      {selectedCountry && <IntelBrief country={selectedCountry} onClose={() => setSelectedCountry(null)} />}

      {/* Header */}
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: T.textMuted, letterSpacing: '0.18em' }}>{todayStr}</p>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: T.textPrimary }}>{greeting()}</h1>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <p className="text-sm" style={{ color: T.textSub }}>{subtitles[role] || subtitles.traveller}</p>
          {(role === 'traveller' || role === 'solo') && nextTrip && daysToTrip !== null && (
            <Link to="/itinerary"
              className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors hover:opacity-80"
              style={{ background: DS.greenDim, color: BRAND_GREEN, border: `1px solid rgba(170,204,0,0.25)` }}>
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

      {/* ── Pending briefing banners ── */}
      {(role === 'traveller' || role === 'solo') && pendingBriefings.map(b => (
        <Link key={b.id} to={`/briefing/${b.id}`}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', marginBottom: 16, background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.30)', textDecoration: 'none', transition: 'opacity 0.15s' }}>
          <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#D97706' }}>
            <FileText size={16} color="white" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#FDE68A' }}>
              Action Required: Pre-Travel Security Briefing
            </p>
            <p style={{ fontSize: 11, color: 'rgba(253,230,138,0.65)', marginTop: 2 }}>
              {b.destination} · Departs {b.depart_date} · Ref: {b.document_ref} — Please read and acknowledge before departure
            </p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '6px 12px', flexShrink: 0, background: DS.amberDim, color: DS.amberText, border: `1px solid ${DS.amber}44` }}>
            Review →
          </span>
        </Link>
      ))}

      {/* ── Passport expiry banner (traveller / solo) ── */}
      {(role === 'traveller' || role === 'solo') && (() => {
        if (!profile?.passport_expiry) return null
        const days = Math.floor((new Date(profile.passport_expiry) - new Date()) / 86400000)
        if (days > 180) return null
        const expired  = days < 0
        const critical = days <= 30
        const bg       = expired || critical ? DS.redDim    : DS.amberDim
        const border   = expired || critical ? 'rgba(138,46,46,0.35)' : 'rgba(144,106,37,0.35)'
        const iconBg   = expired || critical ? DS.red       : DS.amber
        const titleCol = expired || critical ? DS.redText   : DS.amberText
        const textCol  = expired || critical ? DS.redText   : DS.amberText
        const emoji    = expired ? '🚨' : critical ? '⚠️' : '📋'
        const title    = expired
          ? 'Passport Expired — Travel Blocked'
          : critical
            ? `Passport Expiring in ${days} Day${days !== 1 ? 's' : ''} — Renew Immediately`
            : `Passport Renewal Due — ${days} Days Remaining`
        const sub      = expired
          ? 'Your passport has expired. Most countries will deny entry. Renew before booking any travel.'
          : `Most countries require 6 months passport validity beyond your travel dates. Please renew as soon as possible.`
        return (
          <Link to="/profile"
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', marginBottom: 16, background: expired || critical ? 'rgba(168,53,53,0.15)' : 'rgba(234,179,8,0.12)', border: `1px solid ${expired || critical ? 'rgba(168,53,53,0.30)' : 'rgba(234,179,8,0.25)'}`, textDecoration: 'none', transition: 'opacity 0.15s' }}>
            <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: iconBg }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{emoji}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: titleCol }}>{title}</p>
              <p style={{ fontSize: 11, marginTop: 2, color: DS.textSub }}>{sub}</p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '6px 12px', flexShrink: 0, background: bg, color: titleCol, border: `1px solid ${border}` }}>
              Update →
            </span>
          </Link>
        )
      })()}

      {/* Morning brief (traveller + solo + developer) */}
      {role !== 'admin' && (briefLoading || morningBrief) && (
        <MorningBriefCard brief={morningBrief} loading={briefLoading} />
      )}

      {/* ── SOLO: AI assistant at top ── */}
      {role === 'solo' && (
        <div className="mb-7">
          <DashboardAiChat profile={profile} trips={myTrips} orgName={null} role={role} dark={dark} />
        </div>
      )}

      {/* ── DEVELOPER PLATFORM HEALTH ── */}
      {role === 'developer' && (
        <>
          {/* Compact stat strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Orgs',         value: devMetrics.orgs,        to: '/organisations', color: BRAND_GREEN },
              { label: 'Travellers',   value: devMetrics.travellers,  to: '/admin',         color: BRAND_GREEN },
              { label: 'Active Trips', value: devMetrics.activeTrips, to: '/tracker',       color: '#60A5FA' },
              { label: 'Active Feeds', value: metrics.activeFeeds,    to: '/intel-feeds',   color: '#4ADE80' },
            ].map(s => (
              <Link key={s.label} to={s.to}
                style={{ background: '#11131A', border: '1px solid rgba(255,255,255,0.07)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2, textDecoration: 'none', transition: 'border-color 0.15s' }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3C4050' }}>{s.label}</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: loading ? '#3C4050' : s.color }}>
                  {loading ? '–' : s.value}
                </span>
              </Link>
            ))}
          </div>

          {/* Platform Health Monitor */}
          <div style={{ background: '#11131A', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 28, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(170,204,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(170,204,0,0.10)' }}>
                  <Activity size={14} style={{ color: BRAND_GREEN }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5' }}>Platform Health Monitor</h2>
                  <p style={{ fontSize: 11, color: '#6E7480' }}>Issues detected from live platform data</p>
                </div>
              </div>
              {!loading && (() => {
                const hasCrit = healthIssues.some(i => i.severity === 'critical')
                const hasWarn = healthIssues.some(i => i.severity === 'warning')
                const [bg, color, border, label] = hasCrit
                  ? ['rgba(168,53,53,0.15)', '#FCA5A5', 'rgba(168,53,53,0.30)', 'Critical']
                  : hasWarn
                  ? ['rgba(234,179,8,0.12)', '#FDE68A', 'rgba(234,179,8,0.25)', 'Needs Attention']
                  : healthIssues.length > 0
                  ? ['rgba(59,130,246,0.12)', '#93C5FD', 'rgba(59,130,246,0.25)', 'Minor Issues']
                  : ['rgba(74,222,128,0.12)', '#4ADE80', 'rgba(74,222,128,0.25)', 'All Clear']
                return <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', background: bg, color, border: `1px solid ${border}` }}>{label}</span>
              })()}
            </div>

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: '#6E7480', fontSize: 13, gap: 8 }}>
                <div style={{ width: 14, height: 14, border: `2px solid ${BRAND_GREEN}`, borderTopColor: 'transparent', borderRadius: '50%' }} className="animate-spin" />
                Scanning platform…
              </div>
            ) : healthIssues.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 8 }}>
                <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(74,222,128,0.10)' }}>
                  <CheckCircle2 size={24} style={{ color: '#4ADE80' }} />
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#EAEEF5' }}>No issues detected</p>
                <p style={{ fontSize: 11, color: '#6E7480' }}>Platform is operating normally</p>
              </div>
            ) : (
              <div>
                {healthIssues.map((issue, i) => {
                  const cfg = {
                    critical: { bar: '#EF4444', text: '#FCA5A5',  badge: ['rgba(168,53,53,0.15)', '#FCA5A5',  'rgba(168,53,53,0.30)'],  label: 'Critical' },
                    warning:  { bar: '#F59E0B', text: '#FDE68A',  badge: ['rgba(234,179,8,0.12)',  '#FDE68A',  'rgba(234,179,8,0.25)'],   label: 'Warning' },
                    info:     { bar: '#60A5FA', text: '#93C5FD',  badge: ['rgba(59,130,246,0.12)', '#93C5FD',  'rgba(59,130,246,0.25)'],  label: 'Info' },
                  }[issue.severity]
                  return (
                    <Link key={i} to={issue.link}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', textDecoration: 'none', transition: 'background 0.15s' }}
                      className="group">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.bar, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: '#EAEEF5' }}>{issue.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', background: cfg.badge[0], color: cfg.badge[1], border: `1px solid ${cfg.badge[2]}` }}>{cfg.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: cfg.text }}>{issue.count}</span>
                        <ChevronRight size={14} style={{ color: '#3C4050' }} />
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
            <MetricCard dark={dark} label="Our Travellers"       value={loading ? '–' : adminMetrics.travellers}       icon={Users}         valueColor="text-[#AACC00]" accent="#AACC00" to="/org/users" />
            <MetricCard dark={dark} label="Currently Travelling" value={loading ? '–' : adminMetrics.travelling}       icon={Plane}         valueColor="text-[#60A5FA]" accent="#60A5FA" to="/tracker" />
            <MetricCard dark={dark} label="Pending Approvals"    value={loading ? '–' : adminMetrics.pendingApprovals} icon={ClipboardList}
              valueColor={adminMetrics.pendingApprovals > 0 ? 'text-[#FDE68A]' : 'text-[#AACC00]'}
              accent={adminMetrics.pendingApprovals > 0 ? '#F59E0B' : '#AACC00'} to="/approvals" />
            <MetricCard dark={dark} label="Overdue Check-ins"    value={loading ? '–' : adminMetrics.overdueCheckins}  icon={Clock}
              valueColor={adminMetrics.overdueCheckins > 0 ? 'text-[#FCA5A5]' : 'text-[#4ADE80]'}
              accent={adminMetrics.overdueCheckins > 0 ? '#EF4444' : '#4ADE80'} to="/control-room" />
          </div>

          {/* Urgent banners */}
          {!loading && (adminMetrics.pendingApprovals > 0 || adminMetrics.overdueCheckins > 0) && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              {adminMetrics.pendingApprovals > 0 && (
                <Link to="/approvals" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)', color: '#FDE68A', textDecoration: 'none', transition: 'opacity 0.15s' }}>
                  <ClipboardList size={14} />
                  {adminMetrics.pendingApprovals} trip{adminMetrics.pendingApprovals !== 1 ? 's' : ''} awaiting approval
                  <ChevronRight size={13} />
                </Link>
              )}
              {adminMetrics.overdueCheckins > 0 && (
                <Link to="/tracker" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, background: 'rgba(168,53,53,0.15)', border: '1px solid rgba(168,53,53,0.30)', color: '#FCA5A5', textDecoration: 'none', transition: 'opacity 0.15s' }}>
                  <Clock size={14} />
                  {adminMetrics.overdueCheckins} overdue check-in{adminMetrics.overdueCheckins !== 1 ? 's' : ''}
                  <ChevronRight size={13} />
                </Link>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3C4050', marginBottom: 12 }}>Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Invite Traveller',    icon: Users,          to: '/org/users',    color: BRAND_GREEN, desc: 'Add staff to your team' },
                { label: 'Travel Approvals',    icon: ClipboardList,  to: '/approvals',    color: '#FDE68A',   desc: 'Review pending trips' },
                { label: 'Training & Courses',  icon: GraduationCap,  to: '/org/training', color: '#A78BFA',   desc: 'Assign or upload training' },
                { label: 'Policies & Docs',     icon: FileText,       to: '/policies',     color: '#4ADE80',   desc: 'Upload company policies' },
              ].map(a => {
                const Icon = a.icon
                return (
                  <Link key={a.label} to={a.to}
                    style={{ background: '#11131A', border: '1px solid rgba(255,255,255,0.07)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, textDecoration: 'none', transition: 'border-color 0.15s' }}>
                    <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${a.color}18` }}>
                      <Icon size={17} style={{ color: a.color }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5' }}>{a.label}</p>
                      <p style={{ fontSize: 11, color: '#6E7480', marginTop: 2 }}>{a.desc}</p>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#3C4050', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 'auto' }}>Open →</span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Currently Travelling + Live Risk Alerts — side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">

            {/* Currently Travelling */}
            <div style={{ background: '#11131A', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(170,204,0,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(170,204,0,0.10)' }}>
                    <Plane size={14} style={{ color: BRAND_GREEN }} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5' }}>Currently Travelling</h2>
                    <p style={{ fontSize: 11, color: '#6E7480' }}>Staff on active trips right now</p>
                  </div>
                </div>
                <Link to="/tracker" style={{ fontSize: 11, fontWeight: 600, color: BRAND_GREEN, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Full tracker <ChevronRight size={12} />
                </Link>
              </div>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: '#6E7480', fontSize: 13, gap: 8 }}>
                  <div style={{ width: 14, height: 14, border: `2px solid ${BRAND_GREEN}`, borderTopColor: 'transparent', borderRadius: '50%' }} className="animate-spin" />
                  Loading…
                </div>
              ) : activeTravellers.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 8 }}>
                  <Plane size={28} style={{ color: '#3C4050' }} />
                  <p style={{ fontSize: 13, color: '#6E7480' }}>No staff currently travelling</p>
                </div>
              ) : (
                <div>
                  {activeTravellers.map(({ trip, profile: tp }) => {
                    const daysLeft = trip.return_date
                      ? Math.max(0, Math.ceil((new Date(trip.return_date) - new Date()) / 86400000))
                      : null
                    return (
                      <div key={trip.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}>
                        <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: BRAND_GREEN, color: '#090A0C', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {(tp.full_name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 600, color: '#EAEEF5', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tp.full_name || tp.email}</p>
                          <p style={{ fontSize: 11, color: '#6E7480', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {trip.departure_city && trip.arrival_city
                              ? `${trip.departure_city} → ${trip.arrival_city}`
                              : trip.trip_name || 'Trip'}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {daysLeft !== null && (
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#6E7480' }}>
                              {daysLeft === 0 ? 'Returns today' : `${daysLeft}d remaining`}
                            </p>
                          )}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#4ADE80', background: 'rgba(74,222,128,0.10)', padding: '2px 8px', marginTop: 2 }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ADE80', display: 'inline-block' }} className="animate-pulse" /> Active
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Live Intelligence Feed */}
            <LiveIntelWidget trips={myTrips} />
          </div>

          {/* Latest Check-in Locations */}
          {!loading && latestCheckins.filter(c => c.latitude && c.longitude).length > 0 && (
            <div style={{ background: '#11131A', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 24, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(170,204,0,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(170,204,0,0.10)' }}>
                    <MapPin size={14} style={{ color: BRAND_GREEN }} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5' }}>Latest Check-in Locations</h2>
                    <p style={{ fontSize: 11, color: '#6E7480' }}>Most recent GPS check-in per traveller</p>
                  </div>
                </div>
                <Link to="/tracker" style={{ fontSize: 11, fontWeight: 600, color: BRAND_GREEN, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Live map <ChevronRight size={12} />
                </Link>
              </div>
              <div>
                {latestCheckins.filter(c => c.latitude && c.longitude).slice(0, 5).map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#EAEEF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                      <p style={{ fontSize: 11, color: '#6E7480', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.location_label || `${Number(c.latitude).toFixed(4)}, ${Number(c.longitude).toFixed(4)}`}
                      </p>
                    </div>
                    <p style={{ fontSize: 11, color: '#3C4050', flexShrink: 0 }}>
                      {c.completed_at ? new Date(c.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contact SafeGuard360 */}
          <div style={{ background: 'rgba(170,204,0,0.05)', border: '1px solid rgba(170,204,0,0.15)', marginBottom: 24, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5' }}>Need help or a custom solution?</p>
                <p style={{ fontSize: 11, color: '#6E7480', marginTop: 2 }}>Request bespoke training, policies, or platform support from the SafeGuard360 team.</p>
              </div>
              <a href="mailto:support@risk360.co"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, color: '#090A0C', background: BRAND_GREEN, flexShrink: 0, textDecoration: 'none' }}>
                <Send size={13} /> Contact SafeGuard360
              </a>
            </div>
          </div>

          {/* AI Security Analyst */}
          {!loading && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(170,204,0,0.10)', border: '1px solid rgba(170,204,0,0.20)' }}>
                  <Brain size={13} style={{ color: BRAND_GREEN }} />
                </div>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5' }}>AI Security Analyst</h2>
              </div>
              <DashboardAiChat profile={profile} trips={[]} orgName={profile?.organisations?.name} role={role} dark={dark} />
            </div>
          )}
        </>
      )}

      {/* ── TRAVELLER / SOLO METRICS ── */}
      {(role === 'traveller' || role === 'solo') && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
            {role === 'solo' ? (
              <>
                <MetricCard dark={dark} label="Active Alerts"  value={loading ? '–' : metrics.activeAlerts} icon={Bell}
                  valueColor={metrics.activeAlerts > 0 ? 'text-[#FCA5A5]' : 'text-[#EAEEF5]'}
                  accent={metrics.activeAlerts > 0 ? '#EF4444' : '#AACC00'} to="/alerts" />
                <MetricCard dark={dark} label="My Trips"       value={loading ? '–' : myTrips.length}       icon={Plane}  valueColor="text-[#AACC00]" accent="#AACC00" to="/itinerary" />
                <MetricCard dark={dark} label="Active Feeds"   value={loading ? '–' : metrics.activeFeeds}  icon={Radio}  valueColor="text-[#AACC00]" accent="#AACC00" to="/intel-feeds" />
                <MetricCard dark={dark} label="SOS Ready"      value={loading ? '–' : '✓'}                  icon={Shield} valueColor="text-[#4ADE80]" accent="#4ADE80" to="/sos" />
              </>
            ) : (
              <>
                <MetricCard dark={dark} label="My Compliance"  value={loading ? '–' : complianceBreakdown ? `${complianceBreakdown.total}%` : '–'} icon={BarChart2} valueColor="text-[#AACC00]" accent="#AACC00" to="/training" />
                <MetricCard dark={dark} label="Active Alerts"  value={loading ? '–' : metrics.activeAlerts} icon={Bell}
                  valueColor={metrics.activeAlerts > 0 ? 'text-[#FCA5A5]' : 'text-[#EAEEF5]'}
                  accent={metrics.activeAlerts > 0 ? '#EF4444' : '#AACC00'} to="/alerts" />
                <MetricCard dark={dark} label="My Trips"       value={loading ? '–' : myTrips.length}       icon={Plane}  valueColor="text-[#AACC00]" accent="#AACC00" to="/itinerary" />
                <MetricCard dark={dark} label="Active Feeds"   value={loading ? '–' : metrics.activeFeeds}  icon={Radio}  valueColor="text-[#4ADE80]" accent="#4ADE80" to="/intel-feeds" />
              </>
            )}
          </div>

          {/* Quick action shortcuts */}
          <QuickActions role={role} hasActiveTrip={myTrips.some(t => t.status === 'Active')} dark={dark} />

          {/* Training nudge — org travellers only */}
          {role !== 'solo' && !loading && (
            <TrainingNudge
              module={nudgeModule}
              score={complianceBreakdown?.total ?? 100}
            />
          )}

          {/* Health declaration nudge — org travellers with approved trips */}
          {(role === 'traveller') && !loading && (
            <HealthNudge trip={nudgeHealthTrip} />
          )}

          {/* 24/7 Assistance CTA */}
          {role !== 'solo' && <AssistanceCTA />}

          {/* Solo: trip risk report + world map + news feed */}
          {role === 'solo' && (
            <>
              <SoloTripRiskReport
                trips={myTrips}
                destRisk={destRisk}
                destAlerts={destAlerts}
                loading={loading}
                onCountryClick={setSelectedCountry}
                T={T}
              />
              <SoloWorldMap trips={myTrips} onCountryClick={setSelectedCountry} T={T} />
              <LiveIntelWidget trips={myTrips} />
            </>
          )}

          {/* Org traveller: trip map */}
          {role !== 'solo' && !loading && (
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(170,204,0,0.10)', border: '1px solid rgba(170,204,0,0.20)' }}>
                <Globe size={13} style={{ color: BRAND_GREEN }} />
              </div>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#EAEEF5' }}>My Travel Intel</h2>
            </div>
            <span style={{ fontSize: 12, color: '#6E7480', fontWeight: 500 }}>{myTrips.length} trip{myTrips.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {myTrips.map(trip => {
              const country  = cityToCountry(trip.arrival_city) || trip.arrival_city
              const risk     = destRisk[country]
              const sev      = risk?.severity || trip.risk_level || null
              const alerts   = destAlerts[country] ?? null
              const isActive = trip.depart_date <= new Date().toISOString().split('T')[0]
              const pill     = sev ? SEVERITY_PILL_DARK[sev] : null
              return (
                <button key={trip.id} onClick={() => setSelectedCountry(country)}
                  style={{ background: '#11131A', border: '1px solid rgba(255,255,255,0.07)', padding: 20, textAlign: 'left', cursor: 'pointer', transition: 'border-color 0.15s', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', letterSpacing: '0.08em',
                      ...(isActive ? { background: 'rgba(170,204,0,0.12)', color: BRAND_GREEN } : { background: 'rgba(255,255,255,0.06)', color: '#6E7480' }) }}>
                      {isActive ? '✈ ACTIVE' : '⏳ UPCOMING'}
                    </span>
                    {pill && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', background: pill.bg, color: pill.color, border: `1px solid ${pill.border}` }}>{sev}</span>
                    )}
                  </div>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{trip.trip_name}</h3>
                  <p style={{ fontSize: 11, color: '#6E7480', marginBottom: 16 }}>{trip.arrival_city}{country !== trip.arrival_city ? ` · ${country}` : ''}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#3C4050', marginBottom: 12 }}>
                    <Calendar size={10} />{fmtDate(trip.depart_date)} — {fmtDate(trip.return_date)}
                  </div>
                  {alerts !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, marginBottom: 16, color: alerts > 0 ? '#FCA5A5' : '#4ADE80' }}>
                      {alerts > 0 ? <><AlertCircle size={11} />{alerts} active alert{alerts !== 1 ? 's' : ''}</> : <><CheckCircle2 size={11} />No active alerts</>}
                    </div>
                  )}
                  {trip.approval_status === 'pending' && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#FDE68A', background: 'rgba(234,179,8,0.12)', padding: '4px 8px', border: '1px solid rgba(234,179,8,0.25)', marginBottom: 12 }}>
                      ⏳ Awaiting approval
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', color: BRAND_GREEN, transition: 'gap 0.15s' }}>
                    View Full Intel Brief <ChevronRight size={11} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── AI SECURITY ANALYST (traveller) ── */}
      {role === 'traveller' && !loading && (
        <div style={{ marginBottom: 28 }}>
          <DashboardAiChat
            profile={profile}
            trips={myTrips}
            orgName={profile?.organisations?.name}
            role={role}
            dark={dark}
          />
        </div>
      )}

      {/* ── BOTTOM PANELS ── */}
      <div className="flex flex-col lg:flex-row gap-5">

        {/* Live Intelligence Feed — shown for travellers */}
        <div className={`${role === 'traveller' ? 'lg:w-3/5' : 'lg:w-full'} ${(role === 'admin' || role === 'org_admin' || role === 'solo') ? 'hidden' : ''}`}>
          <LiveIntelWidget trips={myTrips} compact />
        </div>

        {/* Right column — compliance for org travellers */}
        {role === 'traveller' && (
          <div className="lg:w-2/5 flex flex-col gap-5">
            <ComplianceScoreCard breakdown={complianceBreakdown} loading={loading} />
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
