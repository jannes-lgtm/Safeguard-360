/**
 * App — root router and provider tree.
 *
 * Provider hierarchy (inside-out):
 *   PasswordGate → BrowserRouter → RoleProvider → Routes
 *
 * Route authorization strategy:
 *   module="module_id"   Preferred. Drives auth from permissions.js config.
 *   boolean flags        Legacy. Maintained for backward compatibility.
 *   (bare ProtectedRoute) Session-only gate — page content handles own access.
 *
 * When adding new routes, use module= prop and define the module in
 * src/lib/permissions.js rather than adding new boolean flags.
 */

import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { supabase } from './lib/supabase'
import { log } from './lib/logger'
import { RoleProvider } from './contexts/RoleContext'

// ── Page imports ──────────────────────────────────────────────────────────────
import Billing          from './pages/Billing'
import Login            from './pages/Login'
import Signup           from './pages/Signup'
import ComingSoon       from './pages/ComingSoon'
import Dashboard        from './pages/Dashboard'
import Itinerary        from './pages/Itinerary'
import Alerts           from './pages/Alerts'
import Policies         from './pages/Policies'
import Training         from './pages/Training'
import Tracker          from './pages/Tracker'
import Profile          from './pages/Profile'
import IntelFeeds       from './pages/IntelFeeds'
import Briefings        from './pages/Briefings'
import NewsUpdates      from './pages/NewsUpdates'
import CountryRiskReport from './pages/CountryRiskReport'
import Services         from './pages/Services'
import SOS              from './pages/SOS'
import CheckIn          from './pages/CheckIn'
import LiveMap          from './pages/LiveMap'
import Incidents        from './pages/Incidents'
import TravelApprovals  from './pages/TravelApprovals'
import Organisations    from './pages/Organisations'
import OrgUsers         from './pages/OrgUsers'
import OrgTraining      from './pages/OrgTraining'
import ControlRoom      from './pages/ControlRoom'
import Assistance       from './pages/Assistance'
import TermsAndConditions from './pages/TermsAndConditions'
import TravelPolicy     from './pages/TravelPolicy'
import Onboarding       from './pages/Onboarding'
import OrgOnboarding    from './pages/OrgOnboarding'
import AdminControlCenter from './pages/AdminControlCenter'
import LiveTraffic      from './pages/LiveTraffic'
import Visa             from './pages/Visa'
import ResetPassword    from './pages/ResetPassword'
import PendingApproval  from './pages/PendingApproval'
import TripShare        from './pages/TripShare'
import Briefing         from './pages/Briefing'
import Debrief          from './pages/Debrief'
import OrgAnalytics     from './pages/OrgAnalytics'
import CrisisBroadcast  from './pages/CrisisBroadcast'
import HealthDeclaration from './pages/HealthDeclaration'
import OperationalIntel from './pages/OperationalIntel'
import JourneyAgent     from './pages/JourneyAgent'
import KnowledgeBase    from './pages/cairo/KnowledgeBase'
import MovementIntel    from './pages/MovementIntel'
import LiveRiskFeed     from './pages/LiveRiskFeed'
import WatchBoard       from './pages/gsoc/WatchBoard'
import Projects         from './pages/gsoc/Projects'
import ShiftLog         from './pages/gsoc/ShiftLog'
import ProjectsList     from './pages/projects/ProjectsList'
import ProjectDetail    from './pages/projects/ProjectDetail'
import HeatMap          from './pages/HeatMap'
import Geofences        from './pages/Geofences'
import Landing          from './pages/Landing'
import ProtectedRoute   from './components/ProtectedRoute'
import ErrorBoundary    from './components/ErrorBoundary'

// ── Auth state watcher ────────────────────────────────────────────────────────
// Handles session expiry and token refresh events.
// Must be inside BrowserRouter to use useNavigate.
function AuthStateWatcher() {
  const navigate = useNavigate()
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        log.auth.sessionExpired({ event })
        navigate('/login', { replace: true })
      }
      if (event === 'TOKEN_REFRESHED') {
        log.info('AUTH', 'token_refreshed', { userId: session?.user?.id })
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate])
  return null
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
        <AuthStateWatcher />

        {/* RoleProvider — centralized profile/role state for Layout and components.
            Must be inside BrowserRouter. Does NOT replace ProtectedRoute security. */}
        <RoleProvider>
          <Routes>

            {/* ── Public routes ─────────────────────────────────────────────── */}
            <Route path="/"               element={<Landing />} />
            <Route path="/pricing"        element={<Navigate to="/" replace />} />
            <Route path="/login"          element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/pending-approval" element={<PendingApproval />} />
            <Route path="/signup"         element={<Signup />} />
            <Route path="/terms"          element={<TermsAndConditions />} />
            <Route path="/trip-share/:token" element={<TripShare />} />

            {/* ── Onboarding (session required, no role gates) ──────────────── */}
            <Route path="/onboarding"     element={<ProtectedRoute noGates><Onboarding /></ProtectedRoute>} />
            <Route path="/org-onboarding" element={<ProtectedRoute noGates><OrgOnboarding /></ProtectedRoute>} />

            {/* ── TRAVEL domain ─────────────────────────────────────────────── */}
            <Route path="/dashboard"      element={<ErrorBoundary context="Dashboard"><ProtectedRoute><Dashboard /></ProtectedRoute></ErrorBoundary>} />
            <Route path="/itinerary"      element={<ProtectedRoute module="my_trips"><Itinerary /></ProtectedRoute>} />
            <Route path="/approvals"      element={<ProtectedRoute module="travel_approvals"><TravelApprovals /></ProtectedRoute>} />
            <Route path="/checkin"        element={<ProtectedRoute module="check_in"><CheckIn /></ProtectedRoute>} />
            <Route path="/live-map"       element={<ErrorBoundary context="LiveMap"><ProtectedRoute module="live_location"><LiveMap /></ProtectedRoute></ErrorBoundary>} />
            <Route path="/visa"           element={<ProtectedRoute module="visa"><Visa /></ProtectedRoute>} />

            {/* Briefing / debrief are travel-adjacent, session-gated only */}
            <Route path="/briefing/:briefingId" element={<ProtectedRoute><Briefing /></ProtectedRoute>} />
            <Route path="/debrief/:tripId"      element={<ProtectedRoute><Debrief /></ProtectedRoute>} />
            <Route path="/health/:tripId"       element={<ProtectedRoute><HealthDeclaration /></ProtectedRoute>} />
            <Route path="/briefings"            element={<ProtectedRoute><Briefings /></ProtectedRoute>} />

            {/* ── INTELLIGENCE domain ───────────────────────────────────────── */}
            <Route path="/journey-agent"  element={<ProtectedRoute module="cairo"><JourneyAgent /></ProtectedRoute>} />
            <Route path="/live-risk-feed" element={<ProtectedRoute module="live_risk_feed"><LiveRiskFeed /></ProtectedRoute>} />
            <Route path="/country-risk"   element={<ProtectedRoute module="country_risk"><CountryRiskReport /></ProtectedRoute>} />
            <Route path="/news"           element={<ProtectedRoute module="news"><NewsUpdates /></ProtectedRoute>} />
            <Route path="/cairo/knowledge" element={<ProtectedRoute module="knowledge_base"><KnowledgeBase /></ProtectedRoute>} />
            <Route path="/intel-feeds"    element={<ProtectedRoute module="intel_feeds"><IntelFeeds /></ProtectedRoute>} />

            {/* ── OPERATIONS domain ─────────────────────────────────────────── */}
            <Route path="/gsoc"           element={<ErrorBoundary context="WatchBoard"><ProtectedRoute module="watch_board"><WatchBoard /></ProtectedRoute></ErrorBoundary>} />
            <Route path="/gsoc/projects"  element={<ProtectedRoute module="gsoc_projects"><Projects /></ProtectedRoute>} />
            <Route path="/gsoc/shift-log" element={<ProtectedRoute module="shift_log"><ShiftLog /></ProtectedRoute>} />
            <Route path="/movement"       element={<ErrorBoundary context="MovementIntel"><ProtectedRoute module="movement_intel"><MovementIntel /></ProtectedRoute></ErrorBoundary>} />
            <Route path="/control-room"   element={<ErrorBoundary context="ControlRoom"><ProtectedRoute module="control_room"><ControlRoom /></ProtectedRoute></ErrorBoundary>} />
            <Route path="/heat-map"       element={<ErrorBoundary context="HeatMap"><ProtectedRoute module="heat_map"><HeatMap /></ProtectedRoute></ErrorBoundary>} />
            <Route path="/geofences"      element={<ErrorBoundary context="Geofences"><ProtectedRoute module="alert_zones"><Geofences /></ProtectedRoute></ErrorBoundary>} />
            <Route path="/live-traffic"   element={<ErrorBoundary context="LiveTraffic"><ProtectedRoute module="live_traffic"><LiveTraffic /></ProtectedRoute></ErrorBoundary>} />
            <Route path="/ops-intel"      element={<ProtectedRoute module="route_intel"><OperationalIntel /></ProtectedRoute>} />
            <Route path="/projects"       element={<ProtectedRoute module="projects"><ProjectsList /></ProtectedRoute>} />
            <Route path="/projects/:id"   element={<ProtectedRoute module="projects"><ProjectDetail /></ProtectedRoute>} />
            <Route path="/tracker"        element={<ErrorBoundary context="Tracker"><ProtectedRoute module="asset_tracker"><Tracker /></ProtectedRoute></ErrorBoundary>} />

            {/* ── RESPONSE domain ───────────────────────────────────────────── */}
            <Route path="/sos"            element={<ProtectedRoute module="sos"><SOS /></ProtectedRoute>} />
            <Route path="/crisis-broadcast" element={<ProtectedRoute module="crisis_broadcast"><CrisisBroadcast /></ProtectedRoute>} />
            <Route path="/assistance"     element={<ProtectedRoute module="assistance"><Assistance /></ProtectedRoute>} />
            <Route path="/incidents"      element={<ProtectedRoute module="incidents"><Incidents /></ProtectedRoute>} />
            <Route path="/services"       element={<ProtectedRoute module="services"><Services /></ProtectedRoute>} />

            {/* ── COMPLIANCE domain ─────────────────────────────────────────── */}
            <Route path="/travel-policy"  element={<ProtectedRoute module="travel_policy"><TravelPolicy /></ProtectedRoute>} />
            <Route path="/policies"       element={<ProtectedRoute module="policy_library"><Policies /></ProtectedRoute>} />
            <Route path="/training"       element={<ProtectedRoute module="iso_training"><Training /></ProtectedRoute>} />
            <Route path="/org/training"   element={<ProtectedRoute module="company_training"><OrgTraining /></ProtectedRoute>} />

            {/* ── ADMIN domain ──────────────────────────────────────────────── */}
            <Route path="/org/users"      element={<ProtectedRoute module="user_management"><OrgUsers /></ProtectedRoute>} />
            <Route path="/org/analytics"  element={<ProtectedRoute module="company_analytics"><OrgAnalytics /></ProtectedRoute>} />
            <Route path="/organisations"  element={<ProtectedRoute module="organisations"><Organisations /></ProtectedRoute>} />
            <Route path="/admin"          element={<ProtectedRoute module="developer_console"><AdminControlCenter /></ProtectedRoute>} />

            {/* ── ACCOUNT domain ────────────────────────────────────────────── */}
            <Route path="/billing"        element={<ProtectedRoute module="billing"><Billing /></ProtectedRoute>} />
            <Route path="/profile"        element={<ProtectedRoute module="profile"><Profile /></ProtectedRoute>} />

            {/* ── Redirects ─────────────────────────────────────────────────── */}
            <Route path="/intel-feed"     element={<Navigate to="/live-risk-feed" replace />} />
            <Route path="/alerts"         element={<Navigate to="/live-risk-feed" replace />} />

          </Routes>
        </RoleProvider>
      </BrowserRouter>
  )
}
