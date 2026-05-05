import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutGrid, MapPin, Bell, FileText, CheckCircle,
  Users, LogOut, UserCircle, Radio, Newspaper, Briefcase,
  AlertOctagon, Navigation, Shield, Siren
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

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
        `relative flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl text-sm font-medium transition-all duration-150
        ${red
          ? isActive
            ? 'bg-red-500/20 text-red-300'
            : 'text-red-400/80 hover:bg-red-500/10 hover:text-red-300'
          : isActive
          ? 'text-white'
          : 'text-white/50 hover:bg-white/6 hover:text-white/80'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* Active pill indicator */}
          {isActive && !red && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
              style={{ background: BRAND_GREEN }}
            />
          )}

          {/* Icon with subtle glow when active */}
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

export default function Layout({ children }) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [activeAlertCount, setActiveAlertCount] = useState(0)
  const [tripAlertCount, setTripAlertCount] = useState(0)

  useEffect(() => {
    const loadData = async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) return

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      const finalRole =
        prof?.role ||
        user.app_metadata?.role ||
        user.user_metadata?.role ||
        'traveller'

      setProfile({
        id: user.id,
        email: user.email,
        ...(prof || {}),
        role: finalRole,
      })

      const [{ count }, { count: taCount }] = await Promise.all([
        supabase.from('alerts')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'Active'),
        supabase.from('trip_alerts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false),
      ])
      setActiveAlertCount(count || 0)
      setTripAlertCount(taCount || 0)
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

  return (
    <div className="flex min-h-screen" style={{ background: '#F0F2F8' }}>

      {/* ── Sidebar ── */}
      <aside
        className="w-[230px] shrink-0 flex flex-col fixed top-0 left-0 h-full z-30"
        style={{
          background: 'linear-gradient(180deg, #010e7a 0%, #0118A1 40%, #0118A1 100%)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '4px 0 24px rgba(1,24,161,0.35)',
        }}
      >
        {/* Logo */}
        <div className="px-2 pt-1 pb-0">
          <img src="/logo-transparent.png" alt="SafeGuard360" className="w-full object-contain" />
        </div>

        {/* Subtle divider */}
        <div className="mx-4 mb-1" style={{ height: '1px', background: 'rgba(255,255,255,0.07)' }} />

        {/* Nav */}
        <nav className="flex-1 py-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          <NavSection label="Overview" />
          <NavItem to="/dashboard" icon={LayoutGrid} label="Dashboard" />

          <NavSection label="My Travel" />
          <NavItem to="/itinerary" icon={MapPin} label="My Itinerary" />
          <NavItem to="/alerts" icon={Bell} label="Risk Alerts" badge={activeAlertCount + tripAlertCount} />
          <NavItem to="/checkin" icon={CheckCircle} label="Check In" />
          <NavItem to="/live-map" icon={Navigation} label="Live Location" />
          <NavItem to="/sos" icon={AlertOctagon} label="SOS Emergency" red />

          <NavSection label="Intelligence" />
          <NavItem to="/country-risk" icon={Shield} label="Country Risk Reports" />
          <NavItem to="/news" icon={Newspaper} label="News Updates" />
          {profile?.role === 'admin' && (
            <NavItem to="/intel-feeds" icon={Radio} label="Intel Feeds" />
          )}

          <NavSection label="Services" />
          <NavItem to="/services" icon={Briefcase} label="Service Providers" />

          <NavSection label="Compliance" />
          <NavItem to="/policies" icon={FileText} label="Policy Library" />
          <NavItem to="/training" icon={CheckCircle} label="ISO Training" />
          <NavItem to="/incidents" icon={Siren} label="Incident Reports" />

          <NavSection label="Account" />
          <NavItem to="/profile" icon={UserCircle} label="My Profile" />

          {profile?.role === 'admin' && (
            <>
              <NavSection label="Admin" />
              <NavItem to="/tracker" icon={Users} label="Staff Tracker" />
            </>
          )}
        </nav>

        {/* ── User footer ── */}
        <div className="mx-3 mb-3 rounded-xl p-3"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.09)' }}>
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: BRAND_GREEN, color: BRAND_BLUE }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate leading-tight">
                {profile?.full_name || profile?.email || 'User'}
              </p>
              <p className="text-[10px] capitalize mt-0.5"
                style={{ color: 'rgba(170,204,0,0.7)' }}>
                {profile?.role || 'traveller'}
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
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 ml-[230px] min-h-screen">
        <div className="p-7 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
