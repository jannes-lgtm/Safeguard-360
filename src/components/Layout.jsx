import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutGrid, MapPin, Bell, FileText, CheckCircle,
  Users, LogOut, UserCircle
} from 'lucide-react'
import { supabase } from '../lib/supabase'

function NavSection({ label }) {
  return (
    <div className="px-4 pt-5 pb-1">
      <span className="text-[10px] font-bold text-blue-200 tracking-widest uppercase">{label}</span>
    </div>
  )
}

function NavItem({ to, icon: Icon, label, badge }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-[6px] text-sm font-medium transition-colors
        ${isActive
          ? 'bg-[#C8D42F]/20 text-[#C8D42F]'
          : 'text-blue-100 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      <Icon size={17} />
      <span>{label}</span>
      {badge > 0 && (
        <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {badge}
        </span>
      )}
    </NavLink>
  )
}

export default function Layout({ children }) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [activeAlertCount, setActiveAlertCount] = useState(0)

  useEffect(() => {
    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      setProfile(prof)

      const { count } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Active')
      setActiveAlertCount(count || 0)
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
    <div className="flex min-h-screen bg-[#F9FAFB]">
      {/* Sidebar */}
      <aside className="w-[220px] shrink-0 bg-[#1E2461] flex flex-col fixed top-0 left-0 h-full z-30">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-white/10">
          <div className="bg-white rounded-lg px-3 py-2">
            <img src="/logo-white.png" alt="SafeGuard360" className="h-7 w-auto" />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          <NavSection label="My Overview" />
          <NavItem to="/dashboard" icon={LayoutGrid} label="Dashboard" />

          <NavSection label="My Travel" />
          <NavItem to="/itinerary" icon={MapPin} label="My Itinerary" />
          <NavItem to="/alerts" icon={Bell} label="Risk Alerts" badge={activeAlertCount} />

          <NavSection label="Compliance" />
          <NavItem to="/policies" icon={FileText} label="Policy Library" />
          <NavItem to="/training" icon={CheckCircle} label="ISO Training" />

          <NavSection label="Account" />
          <NavItem to="/profile" icon={UserCircle} label="My Profile" />

          {profile?.role === 'admin' && (
            <>
              <NavSection label="Admin" />
              <NavItem to="/tracker" icon={Users} label="Staff Tracker" />
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#C8D42F] flex items-center justify-center text-[#1E2461] text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-semibold truncate">
                {profile?.full_name || profile?.email || 'User'}
              </div>
              <div className="text-blue-300 text-[10px] capitalize">{profile?.role || 'traveller'}</div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="text-blue-300 hover:text-white transition-colors ml-1"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-[220px] min-h-screen">
        <div className="p-6 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
