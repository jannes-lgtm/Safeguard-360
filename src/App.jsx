import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ComingSoon from './pages/ComingSoon'
import Dashboard from './pages/Dashboard'
import Itinerary from './pages/Itinerary'
import Alerts from './pages/Alerts'
import Policies from './pages/Policies'
import Training from './pages/Training'
import Tracker from './pages/Tracker'
import Profile from './pages/Profile'
import IntelFeeds from './pages/IntelFeeds'
import Briefings from './pages/Briefings'
import NewsUpdates from './pages/NewsUpdates'
import CountryRiskReport from './pages/CountryRiskReport'
import Services from './pages/Services'
import SOS from './pages/SOS'
import CheckIn from './pages/CheckIn'
import LiveMap from './pages/LiveMap'
import Incidents from './pages/Incidents'
import TravelApprovals from './pages/TravelApprovals'
import Organisations from './pages/Organisations'
import OrgUsers from './pages/OrgUsers'
import OrgTraining from './pages/OrgTraining'
import ControlRoom from './pages/ControlRoom'
import Assistance from './pages/Assistance'
import TermsAndConditions from './pages/TermsAndConditions'
import TravelPolicy from './pages/TravelPolicy'
import Onboarding from './pages/Onboarding'
import OrgOnboarding from './pages/OrgOnboarding'
import AdminControlCenter from './pages/AdminControlCenter'
import Visa from './pages/Visa'
import ResetPassword from './pages/ResetPassword'
import PendingApproval from './pages/PendingApproval'
import TripShare from './pages/TripShare'
import Briefing from './pages/Briefing'
import Debrief from './pages/Debrief'
import OrgAnalytics from './pages/OrgAnalytics'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pending-approval" element={<PendingApproval />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/terms" element={<TermsAndConditions />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/org-onboarding" element={<OrgOnboarding />} />
        <Route path="/trip-share/:token" element={<TripShare />} />
        <Route path="/briefing/:briefingId" element={<Briefing />} />
        <Route path="/debrief/:tripId" element={<Debrief />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/itinerary" element={<ProtectedRoute><Itinerary /></ProtectedRoute>} />
        <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
        <Route path="/policies" element={<ProtectedRoute><Policies /></ProtectedRoute>} />
        <Route path="/travel-policy" element={<ProtectedRoute><TravelPolicy /></ProtectedRoute>} />
        <Route path="/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
        <Route path="/incidents" element={<ProtectedRoute><Incidents /></ProtectedRoute>} />
        <Route path="/tracker" element={<ProtectedRoute orgAdminAllowed><Tracker /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/intel-feeds" element={<ProtectedRoute adminOnly><IntelFeeds /></ProtectedRoute>} />
        <Route path="/briefings" element={<ProtectedRoute><Briefings /></ProtectedRoute>} />
        <Route path="/news" element={<ProtectedRoute><NewsUpdates /></ProtectedRoute>} />
        <Route path="/country-risk" element={<ProtectedRoute><CountryRiskReport /></ProtectedRoute>} />
        <Route path="/heat-map" element={<Navigate to="/country-risk" replace />} />
        <Route path="/services" element={<ProtectedRoute><Services /></ProtectedRoute>} />
        <Route path="/sos" element={<ProtectedRoute><SOS /></ProtectedRoute>} />
        <Route path="/checkin" element={<ProtectedRoute><CheckIn /></ProtectedRoute>} />
        <Route path="/live-map" element={<ProtectedRoute><LiveMap /></ProtectedRoute>} />
        <Route path="/approvals"      element={<ProtectedRoute orgAdminAllowed><TravelApprovals /></ProtectedRoute>} />
        <Route path="/admin"           element={<ProtectedRoute adminOnly><AdminControlCenter /></ProtectedRoute>} />
        <Route path="/organisations"   element={<ProtectedRoute adminOnly><Organisations /></ProtectedRoute>} />
        <Route path="/org/users"       element={<ProtectedRoute orgAdminAllowed><OrgUsers /></ProtectedRoute>} />
        <Route path="/org/training"    element={<ProtectedRoute orgAdminAllowed><OrgTraining /></ProtectedRoute>} />
        <Route path="/org/analytics"   element={<ProtectedRoute orgAdminAllowed><OrgAnalytics /></ProtectedRoute>} />
        <Route path="/control-room"    element={<ProtectedRoute orgAdminAllowed><ControlRoom /></ProtectedRoute>} />
        <Route path="/assistance"      element={<ProtectedRoute><Assistance /></ProtectedRoute>} />
        <Route path="/visa"            element={<ProtectedRoute><Visa /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
