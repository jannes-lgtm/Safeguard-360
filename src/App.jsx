import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Itinerary from './pages/Itinerary'
import Alerts from './pages/Alerts'
import Policies from './pages/Policies'
import Training from './pages/Training'
import Tracker from './pages/Tracker'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/itinerary" element={<ProtectedRoute><Itinerary /></ProtectedRoute>} />
        <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
        <Route path="/policies" element={<ProtectedRoute><Policies /></ProtectedRoute>} />
        <Route path="/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
        <Route path="/tracker" element={<ProtectedRoute adminOnly><Tracker /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
