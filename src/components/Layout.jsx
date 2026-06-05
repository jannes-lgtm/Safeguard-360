/**
 * Layout — role-aware application shell.
 *
 * Navigation is fully data-driven from src/lib/permissions.js.
 * Adding a new module or changing role access requires only a permissions.js
 * edit — no component changes needed.
 *
 * Structure:
 *   Desktop: fixed 230px sidebar + main content area
 *   Mobile:  top bar + slide-in sidebar + optional bottom nav
 *
 * Sidebar sections:
 *   [Logo]
 *   [Role pill + org name]
 *   [DomainNav — renders domains/modules filtered by role]
 *   [User footer — initials, name, sign out]
 *
 * UX density:
 *   minimal     — solo traveler: standard spacing, calm
 *   standard    — corporate traveler / org admin
 *   operational — admin / developer: tighter but legible
 *   tactical    — GSOC: compact, high-density, map-first
 */

import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  // Navigation & layout
  LayoutGrid, MapPin, Navigation, Globe, Menu, X, LogOut,
  // Intelligence
  Compass, Radio, Shield, Newspaper, Brain, Activity,
  // Operations
  MonitorCheck, Clock, Radar, Headphones, Flame, Hexagon, Car, Layers, FolderOpen,
  // Response
  AlertOctagon, Megaphone, Siren, Briefcase,
  // Compliance
  FileText, BookOpen, GraduationCap,
  // Admin / Account
  ClipboardList, CheckCircle, Users, BarChart2, Building2, Code2, CreditCard, UserCircle,
  // Role icons
  HardHat,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import usePassiveLocation from '../hooks/usePassiveLocation'
import { BRAND_GREEN } from '../lib/colors'
import { getVisibleDomains, ROLE_META, UX_PROFILE } from '../lib/permissions'
import { useRole } from '../contexts/RoleContext'

// ── Icon registry ─────────────────────────────────────────────────────────────
// Maps the icon string keys in permissions.js to Lucide components.
const ICON_MAP = {
  LayoutGrid,  MapPin,       Navigation,  Globe,
  Compass,     Radio,        Shield,      Newspaper,   Brain,      Activity,
  MonitorCheck, Clock,       Radar,       Headphones,  Flame,      Hexagon,
  Car,         Layers,       FolderOpen,
  AlertOctagon, Megaphone,   Siren,       Briefcase,
  FileText,    BookOpen,     GraduationCap,
  ClipboardList, CheckCircle, Users,      BarChart2,   Building2,  Code2,
  CreditCard,  UserCircle,   HardHat,
}

// ── Nav primitives ────────────────────────────────────────────────────────────

function NavSection({ label, compact }) {
  return (
    <div className={compact ? 'px-4 pt-4 pb-1' : 'px-4 pt-6 pb-1.5'}>
      <span
        className="text-[9px] font-bold tracking-[0.18em] uppercase"
        style={{ color: 'rgba(170,204,0,0.45)' }}
      >
        {label}
      </span>
    </div>
  )
}

function NavItem({ to, icon: Icon, label, badge, red, compact }) {
  const py = compact ? 'py-1.5' : 'py-2.5'
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-4 ${py} mx-2 text-sm font-medium transition-all duration-150
        ${red
          ? isActive
            ? 'bg-red-500/15 text-red-400'
            : 'text-red-400/70 hover:bg-red-500/10 hover:text-red-400'
          : isActive
            ? 'text-white'
            : 'text-white/40 hover:bg-white/5 hover:text-white/70'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !red && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
              style={{ background: BRAND_GREEN }}
            />
          )}
          <span className={`shrink-0 transition-all ${isActive && !red ? 'drop-shadow-[0_0_6px_rgba(170,204,0,0.5)]' : ''}`}>
            {Icon && <Icon size={compact ? 14 : 16} />}
          </span>
          <span className="flex-1 leading-none">{label}</span>
          {badge > 0 && (
            <span
              className="ml-auto text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1"
              style={{ background: BRAND_GREEN, color: '#090A0C' }}
            >
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

// ── Domain nav — data-driven ──────────────────────────────────────────────────
// Renders all domains + modules visible to `role`.
// Replaces the 7 hardcoded per-role nav functions.

// Solo-friendly domain label overrides — same data, friendlier language
const SOLO_DOMAIN_LABELS = {
  travel:       'My Journey',
  intelligence: 'CAIRO',
  operations:   'Status',
  response:     'Emergency',
  account:      'Account',
}

function DomainNav({ role, badges, compact }) {
  const domains  = getVisibleDomains(role)
  const isSolo   = role === 'solo'
  return domains.map(domain => {
    const label = isSolo && SOLO_DOMAIN_LABELS[domain.id]
      ? SOLO_DOMAIN_LABELS[domain.id]
      : domain.label
    return (
      <div key={domain.id}>
        <NavSection label={label} compact={compact} />
        {domain.modules.map(mod => {
          const Icon = ICON_MAP[mod.icon] || null
          // Solo: rename nav items to friendlier language
          const itemLabel = isSolo
            ? ({ cairo: 'Ask CAIRO', control_room: 'My Status', news: 'News & Alerts' }[mod.id] || mod.label)
            : mod.label
          return (
            <NavItem
              key={mod.id}
              to={mod.route}
              icon={Icon}
              label={itemLabel}
              badge={mod.badge ? (badges[mod.badge] ?? 0) : 0}
              red={mod.red}
              compact={compact}
            />
          )
        })}
      </div>
    )
  })
}

// ── Mobile bottom navigation ──────────────────────────────────────────────────
function MobileBottomNav({ alertCount, role }) {
  const location = useLocation()
  const isActive = (path) => location.pathname === path

  const Item = ({ to, icon: Icon, label, red }) => {
    const active = isActive(to)
    return (
      <NavLink to={to} className="flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 relative">
        <span style={{ color: active ? (red ? '#ef4444' : BRAND_GREEN) : 'rgba(255,255,255,0.35)', transition: 'color 0.15s' }}>
          <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
        </span>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', color: active ? (red ? '#ef4444' : BRAND_GREEN) : 'rgba(255,255,255,0.35)' }}>
          {label}
        </span>
        {active && !red && (
          <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px]" style={{ background: BRAND_GREEN }} />
        )}
      </NavLink>
    )
  }

  const SOSButton = () => {
    const active = isActive('/sos')
    return (
      <NavLink to="/sos" className="flex flex-col items-center justify-center flex-1 min-w-0 py-1.5 relative">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${active ? 'bg-red-700' : 'bg-red-600'}`}
          style={{ boxShadow: '0 0 0 3px rgba(220,38,38,0.15)' }}
        >
          <AlertOctagon size={22} color="white" strokeWidth={2.5} />
        </div>
        <span className="text-[9px] font-semibold tracking-wide text-[#EF7474] mt-0.5">SOS</span>
      </NavLink>
    )
  }

  // Solo travellers get a discovery-focused nav: world map intel + CAIRO advisory.
  // /live-risk-feed is a corporate ops feed — not accessible to solo role.
  const isSolo = role === 'solo'

  return (
    <div
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
      style={{
        background: 'rgba(12,14,18,0.97)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {isSolo ? (
        <>
          <Item to="/dashboard"     icon={LayoutGrid}  label="Home" />
          <Item to="/country-risk"  icon={Globe}       label="Countries" />
          <SOSButton />
          <Item to="/journey-agent" icon={Navigation}  label="CAIRO" />
          <Item to="/profile"       icon={UserCircle}  label="Profile" />
        </>
      ) : (
        <>
          <Item to="/dashboard"      icon={LayoutGrid}  label="Home" />
          <Item to="/checkin"        icon={CheckCircle} label="Check-in" />
          <SOSButton />
          <Item to="/live-risk-feed" icon={Radio}       label="Alerts" />
          <Item to="/profile"        icon={UserCircle}  label="Profile" />
        </>
      )}
    </div>
  )
}

// ── Role icon resolver ────────────────────────────────────────────────────────
function RoleIcon({ role, color, size = 11 }) {
  const meta = ROLE_META[role]
  const Icon = meta ? (ICON_MAP[meta.icon] || UserCircle) : UserCircle
  return <Icon size={size} style={{ color }} />
}

// ── Main layout ───────────────────────────────────────────────────────────────
export default function Layout({ children, dark = false }) {
  const navigate  = useNavigate()
  const location  = useLocation()

  // ── Consume centralized role context ─────────────────────────────────────
  const { profile, role, isLoading: roleLoading } = useRole()

  // ── Badge counts (display only — not security decisions) ──────────────────
  const [activeAlertCount,       setActiveAlertCount]       = useState(0)
  const [pendingApprovalsCount,  setPendingApprovalsCount]  = useState(0)
  const [sidebarOpen,            setSidebarOpen]            = useState(false)

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  // Passive location tracking — fires silently on every page, once per 15 min
  usePassiveLocation(profile)

  // Fetch badge counts once profile is loaded
  useEffect(() => {
    if (!profile?.id) return
    const load = async () => {
      const queries = [
        supabase.from('alerts')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'Active'),
      ]

      if (['admin', 'developer', 'org_admin'].includes(role)) {
        queries.push(
          supabase.from('itineraries')
            .select('*', { count: 'exact', head: true })
            .eq('approval_status', 'pending')
        )
      }

      const results = await Promise.all(queries)
      setActiveAlertCount(results[0].count || 0)
      if (['admin', 'developer', 'org_admin'].includes(role)) {
        setPendingApprovalsCount(results[1]?.count || 0)
      }
    }
    load()
  }, [profile?.id, role])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : profile?.email?.[0]?.toUpperCase() || '?'

  const roleInfo = ROLE_META[role] || ROLE_META.traveller
  const uxProfile = UX_PROFILE[role] || UX_PROFILE.traveller
  const compact   = uxProfile.density === 'tactical'

  // Badges object — keys match `badge` field in permissions.js module definitions
  const badges = {
    pendingApprovals: pendingApprovalsCount,
    alerts:           activeAlertCount,
  }

  // ── Sidebar content (shared by desktop + mobile) ──────────────────────────
  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-5 pt-5 pb-3">
        <img src="/logo-transparent.png" alt="SafeGuard360" style={{ height: 46, width: 'auto' }} />
      </div>

      {/* Divider */}
      <div className="mx-4 mb-1" style={{ height: '1px', background: 'rgba(255,255,255,0.07)' }} />

      {/* Role pill */}
      {profile && (
        <div
          className="mx-3 mb-2 px-3 py-1.5 flex items-center gap-2"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <RoleIcon role={role} color={roleInfo.color} />
          <span className="text-[10px] font-bold" style={{ color: roleInfo.color }}>
            {roleInfo.label}
          </span>
          {profile.org_name && (
            <span className="text-[10px] text-white/30 truncate ml-auto">{profile.org_name}</span>
          )}
        </div>
      )}

      {/* Domain nav — fully data-driven from permissions.js */}
      <nav className="flex-1 py-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        <DomainNav role={role} badges={badges} compact={compact} />
      </nav>

      {/* User footer */}
      <div
        className="mx-3 mb-3 p-3"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: BRAND_GREEN, color: '#090A0C' }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate leading-tight">
              {profile?.full_name || profile?.email || 'User'}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: roleInfo.color }}>
              {roleInfo.label}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="p-1.5 rounded-lg transition-all hover:bg-white/10"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </>
  )

  const sidebarStyle = {
    background:   '#0C0E12',
    borderRight:  '1px solid rgba(255,255,255,0.06)',
  }

  return (
    <div className="flex min-h-screen" style={{ background: dark ? '#090A0C' : '#0F1117' }}>

      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden lg:flex w-[230px] shrink-0 flex-col fixed top-0 left-0 h-full z-30"
        style={sidebarStyle}
      >
        {sidebarContent}
      </aside>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Mobile slide-in sidebar ── */}
      <aside
        className={`fixed top-0 left-0 h-full z-50 flex flex-col w-[270px] lg:hidden transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={sidebarStyle}
      >
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          <X size={18} />
        </button>
        {sidebarContent}
      </aside>

      {/* ── Mobile top bar ── */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 h-14"
        style={{ background: '#0C0E12', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 hover:bg-white/10"
          style={{ color: 'rgba(255,255,255,0.6)' }}
        >
          <Menu size={22} />
        </button>
        <img src="/logo-transparent.png" alt="SafeGuard360" className="h-11 object-contain" />
        <div
          className="w-8 h-8 flex items-center justify-center text-xs font-bold"
          style={{ background: BRAND_GREEN, color: '#090A0C' }}
        >
          {initials}
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 lg:ml-[230px] min-h-screen pt-14 lg:pt-0">
        <div className={`p-4 lg:p-7 max-w-6xl mx-auto ${uxProfile.bottomNav ? 'pb-24 lg:pb-7' : ''}`}>
          {children}
        </div>
      </main>

      {/* ── Mobile bottom nav (traveler / org_admin roles only) ── */}
      {profile && uxProfile.bottomNav && (
        <MobileBottomNav alertCount={activeAlertCount} role={role} />
      )}
    </div>
  )
}
