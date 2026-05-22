import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutGrid, MapPin, Bell, FileText, CheckCircle,
  Users, LogOut, UserCircle, Radio, Newspaper, Briefcase,
  AlertOctagon, Navigation, Shield, Siren, ClipboardList,
  Building2, GraduationCap, BookOpen, Globe, Settings,
  BarChart2, Code2, Headphones, Menu, X, Megaphone, Activity,
  CreditCard, Compass, MonitorCheck, FolderOpen, Clock, Radar,
  Layers, HardHat, Brain, Car,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import usePassiveLocation from '../hooks/usePassiveLocation'
import { BRAND_BLUE, BRAND_GREEN } from '../lib/colors'

// ── Nav primitives ────────────────────────────────────────────────────────────
function NavSection({ label }) {
  return (
    <div className="px-4 pt-6 pb-1.5">
      <span className="text-[9px] font-bold tracking-[0.18em] uppercase"
        style={{ color: 'rgba(170,204,0,0.45)' }}>
        {label}
      </span>
    </div>
  )
}

function NavItem({ to, icon: Icon, label, badge, red }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-4 py-2.5 mx-2 text-sm font-medium transition-all duration-150
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
            <Icon size={16} />
          </span>
          <span className="flex-1 leading-none">{label}</span>
          {badge > 0 && (
            <span className="ml-auto text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1"
              style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

// ── Role pill shown in the user footer ───────────────────────────────────────
const ROLE_LABELS = {
  developer:     { label: 'Developer',        color: '#a78bfa' },
  admin:         { label: 'Corporate Admin',  color: BRAND_GREEN },
  org_admin:     { label: 'Company Admin',    color: BRAND_GREEN },
  traveller:     { label: 'Traveller',        color: '#60a5fa' },
  solo:          { label: 'Solo Traveller',   color: '#f472b6' },
  gsoc_operator:     { label: 'GSOC Operator',    color: '#f97316' },
  gsoc_admin:        { label: 'GSOC Admin',       color: '#ef4444' },
  project_manager:   { label: 'Project Manager',  color: '#34d399' },
  project_operator:  { label: 'Project Operator', color: '#22d3ee' },
}

// ── Nav configs per role ──────────────────────────────────────────────────────

function DeveloperNav({ alertCount }) {
  return (
    <>
      <NavSection label="Platform" />
      <NavItem to="/dashboard"      icon={LayoutGrid}   label="Dashboard" />
      <NavItem to="/admin"          icon={BarChart2}    label="Developer Control Center" />
      <NavItem to="/organisations"  icon={Building2}    label="Organisations" />
      <NavItem to="/tracker"        icon={Users}        label="All Users" />

      <NavSection label="Intelligence" />
      <NavItem to="/journey-agent"  icon={Compass}      label="CAIRO" />

      <NavItem to="/cairo/knowledge" icon={Brain}       label="Knowledge Base" />
      <NavItem to="/country-risk"   icon={Shield}       label="Country Risk Reports" />
      <NavItem to="/news"           icon={Newspaper}    label="News Updates" />
      <NavItem to="/alerts"         icon={Bell}         label="Risk Alerts" badge={alertCount} />
      <NavItem to="/intel-feed"     icon={Radio}        label="Live Intel Feed" />
      <NavItem to="/intel-feeds"    icon={Radio}        label="Intel Feeds" />

      <NavSection label="Operations" />
      <NavItem to="/movement"       icon={Radar}        label="Movement Intel" />
      <NavItem to="/live-traffic"   icon={Car}          label="Live Traffic" />
      <NavItem to="/projects"       icon={Layers}       label="Projects" />
      <NavItem to="/control-room"   icon={Headphones}   label="Live Control Room" />
      <NavItem to="/approvals"      icon={ClipboardList} label="Travel Approvals" />
      <NavItem to="/ops-intel"      icon={Activity}     label="Operational Intelligence" />

      <NavSection label="Compliance" />
      <NavItem to="/travel-policy"  icon={FileText}     label="Travel Policy" />
      <NavItem to="/policies"       icon={BookOpen}     label="Policy Library" />
      <NavItem to="/training"       icon={GraduationCap} label="ISO Training" />
      <NavItem to="/visa"           icon={Globe}         label="Visa Assistant" />

      <NavSection label="24/7 Support" />
      <NavItem to="/assistance"     icon={Headphones}   label="Assistance Requests" />
      <NavItem to="/incidents"      icon={Siren}        label="Incident Reports" />
      <NavItem to="/services"       icon={Briefcase}    label="Service Providers" />

      <NavSection label="Account" />
      <NavItem to="/billing"        icon={CreditCard}   label="Billing & Plan" />
      <NavItem to="/profile"        icon={UserCircle}   label="My Profile" />
    </>
  )
}

function CorporateAdminNav({ alertCount, pendingApprovals }) {
  return (
    <>
      <NavSection label="Platform" />
      <NavItem to="/dashboard"      icon={LayoutGrid}   label="Dashboard" />
      <NavItem to="/admin"          icon={BarChart2}    label="Developer Control Center" />
      <NavItem to="/organisations"  icon={Building2}    label="All Organisations" />

      <NavSection label="My Company" />
      <NavItem to="/org/users"      icon={Users}        label="Our Travellers" />
      <NavItem to="/approvals"      icon={ClipboardList} label="Travel Approvals" badge={pendingApprovals} />
      <NavItem to="/tracker"        icon={Navigation}   label="Staff Tracker" />

      <NavSection label="Intelligence" />
      <NavItem to="/journey-agent"  icon={Compass}      label="CAIRO" />
      <NavItem to="/cairo/knowledge" icon={Brain}       label="Knowledge Base" />
      <NavItem to="/country-risk"   icon={Shield}       label="Country Risk Reports" />
      <NavItem to="/news"           icon={Newspaper}    label="News Updates" />
      <NavItem to="/alerts"         icon={Bell}         label="Risk Alerts" badge={alertCount} />
      <NavItem to="/intel-feed"     icon={Radio}        label="Live Intel Feed" />

      <NavSection label="Compliance" />
      <NavItem to="/travel-policy"  icon={FileText}     label="Travel Policy" />
      <NavItem to="/policies"       icon={BookOpen}     label="Policy Library" />
      <NavItem to="/training"       icon={GraduationCap} label="ISO Training" />
      <NavItem to="/visa"           icon={Globe}         label="Visa Assistant" />
      <NavItem to="/org/training"   icon={BookOpen}     label="Company Training" />
      <NavItem to="/movement"       icon={Radar}        label="Movement Intel" />
      <NavItem to="/live-traffic"   icon={Car}          label="Live Traffic" />

      <NavSection label="24/7 Support" />
      <NavItem to="/crisis-broadcast" icon={Megaphone}   label="Crisis Broadcast" />
      <NavItem to="/control-room"   icon={Headphones}   label="Assistance Requests" />
      <NavItem to="/incidents"      icon={Siren}        label="Incident Reports" />
      <NavItem to="/services"       icon={Briefcase}    label="Service Providers" />

      <NavSection label="Account" />
      <NavItem to="/billing"        icon={CreditCard}   label="Billing & Plan" />
      <NavItem to="/profile"        icon={UserCircle}   label="My Profile" />
    </>
  )
}

function OrgAdminNav({ alertCount, pendingApprovals }) {
  return (
    <>
      <NavSection label="Overview" />
      <NavItem to="/dashboard"      icon={LayoutGrid}   label="Dashboard" />

      <NavSection label="My Company" />
      <NavItem to="/org/analytics"  icon={BarChart2}    label="Analytics" />
      <NavItem to="/org/users"      icon={Users}        label="Our Travellers" />
      <NavItem to="/approvals"      icon={ClipboardList} label="Travel Approvals" badge={pendingApprovals} />
      <NavItem to="/tracker"        icon={Navigation}   label="Staff Tracker" />

      <NavSection label="Intelligence" />
      <NavItem to="/journey-agent"  icon={Compass}      label="CAIRO" />
      <NavItem to="/cairo/knowledge" icon={Brain}       label="Knowledge Base" />
      <NavItem to="/country-risk"   icon={Shield}       label="Country Risk Reports" />
      <NavItem to="/news"           icon={Newspaper}    label="News Updates" />
      <NavItem to="/alerts"         icon={Bell}         label="Risk Alerts" badge={alertCount} />
      <NavItem to="/intel-feed"     icon={Radio}        label="Live Intel Feed" />

      <NavSection label="Compliance" />
      <NavItem to="/travel-policy"  icon={FileText}     label="Travel Policy" />
      <NavItem to="/policies"       icon={BookOpen}     label="Policy Library" />
      <NavItem to="/training"       icon={GraduationCap} label="ISO Training" />
      <NavItem to="/visa"           icon={Globe}         label="Visa Assistant" />
      <NavItem to="/org/training"   icon={BookOpen}     label="Company Training" />
      <NavItem to="/movement"       icon={Radar}        label="Movement Intel" />
      <NavItem to="/live-traffic"   icon={Car}          label="Live Traffic" />

      <NavSection label="24/7 Support" />
      <NavItem to="/crisis-broadcast" icon={Megaphone}   label="Crisis Broadcast" />
      <NavItem to="/control-room"   icon={Headphones}   label="Assistance Requests" />
      <NavItem to="/incidents"      icon={Siren}        label="Incident Reports" />
      <NavItem to="/services"       icon={Briefcase}    label="Service Providers" />

      <NavSection label="Account" />
      <NavItem to="/billing"        icon={CreditCard}   label="Billing & Plan" />
      <NavItem to="/profile"        icon={UserCircle}   label="My Profile" />
    </>
  )
}

function TravellerNav({ alertCount, tripAlertCount }) {
  return (
    <>
      <NavSection label="Overview" />
      <NavItem to="/dashboard"      icon={LayoutGrid}   label="Dashboard" />

      <NavSection label="My Travel" />
      <NavItem to="/journey-agent"  icon={Compass}      label="CAIRO" />
      <NavItem to="/itinerary"      icon={MapPin}       label="My Itinerary" />
      <NavItem to="/alerts"         icon={Bell}         label="Risk Alerts" badge={alertCount + tripAlertCount} />
      <NavItem to="/intel-feed"     icon={Radio}        label="Live Intel Feed" />
      <NavItem to="/checkin"        icon={CheckCircle}  label="Check In" />
      <NavItem to="/live-map"       icon={Navigation}   label="Live Location" />
      <NavItem to="/sos"            icon={AlertOctagon} label="SOS Emergency" red />

      <NavSection label="Intelligence" />
      <NavItem to="/movement"       icon={Radar}        label="Movement Intel" />
      <NavItem to="/country-risk"   icon={Shield}       label="Country Risk Reports" />
      <NavItem to="/news"           icon={Newspaper}    label="News Updates" />

      <NavSection label="Compliance" />
      <NavItem to="/travel-policy"  icon={FileText}     label="Travel Policy" />
      <NavItem to="/policies"       icon={BookOpen}     label="Policy Library" />
      <NavItem to="/training"       icon={GraduationCap} label="ISO Training" />
      <NavItem to="/visa"           icon={Globe}         label="Visa Assistant" />

      <NavSection label="24/7 Support" />
      <NavItem to="/assistance"     icon={Headphones}   label="Assistance Requests" />
      <NavItem to="/incidents"      icon={Siren}        label="Incident Reports" />
      <NavItem to="/services"       icon={Briefcase}    label="Service Providers" />

      <NavSection label="Account" />
      <NavItem to="/profile"        icon={UserCircle}   label="My Profile" />
    </>
  )
}

function GSOCNav({ alertCount, isAdmin }) {
  return (
    <>
      <NavSection label="GSOC" />
      <NavItem to="/gsoc"              icon={MonitorCheck} label="Watch Board" />
      <NavItem to="/gsoc/projects"     icon={FolderOpen}   label="Projects" />
      <NavItem to="/gsoc/shift-log"    icon={Clock}        label="Shift Log" />

      <NavSection label="Intelligence" />
      <NavItem to="/journey-agent"     icon={Compass}      label="CAIRO" />
      <NavItem to="/country-risk"      icon={Shield}       label="Country Risk" />
      <NavItem to="/news"              icon={Newspaper}    label="Threat News" />
      <NavItem to="/alerts"            icon={Bell}         label="Risk Alerts" badge={alertCount} />
      <NavItem to="/intel-feed"        icon={Radio}        label="Live Intel Feed" />

      <NavSection label="Operations" />
      <NavItem to="/projects"          icon={Layers}       label="Projects" />
      <NavItem to="/incidents"         icon={Siren}        label="Incident Reports" />
      <NavItem to="/tracker"           icon={Navigation}   label="Asset Tracker" />

      {isAdmin && (
        <>
          <NavSection label="Admin" />
          <NavItem to="/admin"         icon={BarChart2}    label="Control Center" />
          <NavItem to="/organisations" icon={Building2}    label="Organisations" />
        </>
      )}

      <NavSection label="Account" />
      <NavItem to="/profile"           icon={UserCircle}   label="My Profile" />
    </>
  )
}

function ProjectNav({ alertCount, isManager }) {
  return (
    <>
      <NavSection label="Projects" />
      <NavItem to="/projects"       icon={Layers}        label="My Projects" />

      <NavSection label="Intelligence" />
      <NavItem to="/journey-agent"  icon={Compass}       label="CAIRO" />
      <NavItem to="/country-risk"   icon={Shield}        label="Country Risk" />
      <NavItem to="/news"           icon={Newspaper}     label="News Updates" />
      <NavItem to="/alerts"         icon={Bell}          label="Risk Alerts" badge={alertCount} />
      <NavItem to="/intel-feed"     icon={Radio}         label="Live Intel Feed" />

      <NavSection label="Operations" />
      <NavItem to="/incidents"      icon={Siren}         label="Incident Reports" />
      <NavItem to="/tracker"        icon={Navigation}    label="Asset Tracker" />

      {isManager && (
        <>
          <NavSection label="Admin" />
          <NavItem to="/org/users"  icon={Users}         label="Personnel" />
        </>
      )}

      <NavSection label="Account" />
      <NavItem to="/profile"        icon={UserCircle}    label="My Profile" />
    </>
  )
}

function SoloTravellerNav({ alertCount, tripAlertCount }) {
  return (
    <>
      <NavSection label="Overview" />
      <NavItem to="/dashboard"      icon={LayoutGrid}   label="Dashboard" />

      <NavSection label="My Travel" />
      <NavItem to="/journey-agent"  icon={Compass}      label="CAIRO" />
      <NavItem to="/itinerary"      icon={MapPin}       label="My Trips" />
      <NavItem to="/alerts"         icon={Bell}         label="Risk Alerts" badge={alertCount + tripAlertCount} />
      <NavItem to="/intel-feed"     icon={Radio}        label="Live Intel Feed" />
      <NavItem to="/checkin"        icon={CheckCircle}  label="Check In" />
      <NavItem to="/live-map"       icon={Navigation}   label="Live Location" />
      <NavItem to="/sos"            icon={AlertOctagon} label="SOS Emergency" red />

      <NavSection label="Intelligence" />
      <NavItem to="/movement"       icon={Radar}        label="Movement Intel" />
      <NavItem to="/country-risk"   icon={Shield}       label="Country Risk Reports" />
      <NavItem to="/news"           icon={Newspaper}    label="News Updates" />

      <NavSection label="Compliance" />
      <NavItem to="/travel-policy"  icon={FileText}     label="Travel Policy" />
      <NavItem to="/policies"       icon={BookOpen}     label="Policy Library" />
      <NavItem to="/training"       icon={GraduationCap} label="ISO Training" />
      <NavItem to="/visa"           icon={Globe}         label="Visa Assistant" />

      <NavSection label="24/7 Support" />
      <NavItem to="/assistance"     icon={Headphones}   label="Assistance Requests" />
      <NavItem to="/incidents"      icon={Siren}        label="Incident Reports" />
      <NavItem to="/services"       icon={Briefcase}    label="Service Providers" />

      <NavSection label="Account" />
      <NavItem to="/profile"        icon={UserCircle}   label="My Profile" />
    </>
  )
}

// ── Mobile bottom navigation bar ─────────────────────────────────────────────
function MobileBottomNav({ role, alertCount }) {
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
        <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${active ? 'bg-red-700' : 'bg-red-600'}`}
          style={{ boxShadow: '0 0 0 3px rgba(220,38,38,0.15)' }}>
          <AlertOctagon size={22} color="white" strokeWidth={2.5} />
        </div>
        <span className="text-[9px] font-semibold tracking-wide text-red-500 mt-0.5">SOS</span>
      </NavLink>
    )
  }

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
      style={{ background: 'rgba(12,14,18,0.97)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(255,255,255,0.07)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <Item to="/dashboard" icon={LayoutGrid} label="Home" />
      <Item to="/checkin"   icon={CheckCircle} label="Check-in" />
      <SOSButton />
      <Item to="/alerts"    icon={Bell} label={alertCount > 0 ? `Alerts` : 'Alerts'} />
      <Item to="/profile"   icon={UserCircle} label="Profile" />
    </div>
  )
}

// ── Main layout ───────────────────────────────────────────────────────────────
export default function Layout({ children, dark = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [profile, setProfile]                   = useState(null)
  const [activeAlertCount, setActiveAlertCount] = useState(0)
  const [tripAlertCount, setTripAlertCount]     = useState(0)
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0)
  const [sidebarOpen, setSidebarOpen]           = useState(false)

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  // Passive location tracking — fires silently on every page, once per 15 min
  usePassiveLocation(profile)

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase
        .from('profiles')
        .select('*, organisations(name)')
        .eq('id', user.id)
        .single()

      const finalRole =
        prof?.role ||
        'traveller'

      setProfile({
        id: user.id,
        email: user.email,
        ...(prof || {}),
        role: finalRole,
        org_name: prof?.organisations?.name || null,
      })

      const queries = [
        supabase.from('alerts')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'Active'),
        supabase.from('trip_alerts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false),
      ]

      if (['admin', 'developer', 'org_admin'].includes(finalRole)) {
        queries.push(
          supabase.from('itineraries')
            .select('*', { count: 'exact', head: true })
            .eq('approval_status', 'pending')
        )
      }

      const results = await Promise.all(queries)
      setActiveAlertCount(results[0].count || 0)
      setTripAlertCount(results[1].count || 0)
      if (['admin', 'developer', 'org_admin'].includes(finalRole)) {
        setPendingApprovalsCount(results[2]?.count || 0)
      }
    }
    loadData()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : profile?.email?.[0]?.toUpperCase() || '?'

  const role = profile?.role || 'traveller'
  const roleInfo = ROLE_LABELS[role] || ROLE_LABELS.traveller

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-5 pt-5 pb-3">
        <img src="/logo-transparent.png" alt="SafeGuard360" style={{ height: 46, width: 'auto' }} />
      </div>

      {/* Divider */}
      <div className="mx-4 mb-1" style={{ height: '1px', background: 'rgba(255,255,255,0.07)' }} />

      {/* Role indicator strip */}
      {profile && (
        <div className="mx-3 mb-2 px-3 py-1.5 flex items-center gap-2"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {role === 'developer'     && <Code2 size={11} style={{ color: roleInfo.color }} />}
          {role === 'admin'         && <Building2 size={11} style={{ color: roleInfo.color }} />}
          {role === 'org_admin'     && <Building2 size={11} style={{ color: roleInfo.color }} />}
          {role === 'traveller'     && <UserCircle size={11} style={{ color: roleInfo.color }} />}
          {role === 'solo'          && <UserCircle size={11} style={{ color: roleInfo.color }} />}
          {role === 'gsoc_operator'    && <Radar    size={11} style={{ color: roleInfo.color }} />}
          {role === 'gsoc_admin'       && <Radar    size={11} style={{ color: roleInfo.color }} />}
          {role === 'project_manager'  && <HardHat  size={11} style={{ color: roleInfo.color }} />}
          {role === 'project_operator' && <HardHat  size={11} style={{ color: roleInfo.color }} />}
          <span className="text-[10px] font-bold" style={{ color: roleInfo.color }}>
            {roleInfo.label}
          </span>
          {profile.org_name && (
            <span className="text-[10px] text-white/30 truncate ml-auto">{profile.org_name}</span>
          )}
        </div>
      )}

      {/* Nav — role-based */}
      <nav className="flex-1 py-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {role === 'developer'     && <DeveloperNav alertCount={activeAlertCount} />}
        {role === 'admin'         && <CorporateAdminNav alertCount={activeAlertCount} pendingApprovals={pendingApprovalsCount} />}
        {role === 'org_admin'     && <OrgAdminNav alertCount={activeAlertCount} pendingApprovals={pendingApprovalsCount} />}
        {role === 'traveller'     && <TravellerNav alertCount={activeAlertCount} tripAlertCount={tripAlertCount} />}
        {role === 'solo'          && <SoloTravellerNav alertCount={activeAlertCount} tripAlertCount={tripAlertCount} />}
        {role === 'gsoc_operator'    && <GSOCNav    alertCount={activeAlertCount} isAdmin={false} />}
        {role === 'gsoc_admin'       && <GSOCNav    alertCount={activeAlertCount} isAdmin={true} />}
        {role === 'project_manager'  && <ProjectNav alertCount={activeAlertCount} isManager={true} />}
        {role === 'project_operator' && <ProjectNav alertCount={activeAlertCount} isManager={false} />}
      </nav>

      {/* User footer */}
      <div className="mx-3 mb-3 p-3"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: BRAND_GREEN, color: '#090A0C' }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate leading-tight">
              {profile?.full_name || profile?.email || 'User'}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: roleInfo.color }}>{roleInfo.label}</p>
          </div>
          <button onClick={handleSignOut} title="Sign out"
            className="p-1.5 rounded-lg transition-all hover:bg-white/10"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </>
  )

  const sidebarStyle = {
    background: '#0C0E12',
    borderRight: '1px solid rgba(255,255,255,0.06)',
  }

  return (
    <div className="flex min-h-screen" style={{ background: dark ? '#090A0C' : '#0F1117' }}>

      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <aside className="hidden lg:flex w-[230px] shrink-0 flex-col fixed top-0 left-0 h-full z-30" style={sidebarStyle}>
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
        {/* Close button */}
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
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 h-14"
        style={{ background: '#0C0E12', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-white/10" style={{ color: 'rgba(255,255,255,0.6)' }}>
          <Menu size={22} />
        </button>
        <img src="/logo-transparent.png" alt="SafeGuard360" className="h-11 object-contain" />
        <div className="w-8 h-8 flex items-center justify-center text-xs font-bold"
          style={{ background: BRAND_GREEN, color: '#090A0C' }}>
          {initials}
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 lg:ml-[230px] min-h-screen pt-14 lg:pt-0">
        <div className={`p-4 lg:p-7 max-w-6xl mx-auto ${['traveller','solo','org_admin','admin'].includes(profile?.role) ? 'pb-24 lg:pb-7' : ''}`}>
          {children}
        </div>
      </main>

      {/* ── Mobile bottom nav (traveller / org_admin / admin) ── */}
      {profile && ['traveller','solo','org_admin','admin'].includes(profile.role) && (
        <MobileBottomNav role={profile.role} alertCount={activeAlertCount} />
      )}
    </div>
  )
}
