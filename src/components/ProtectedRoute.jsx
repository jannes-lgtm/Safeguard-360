import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const TERMS_VERSION = '1.0'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        navigate('/login')
        return
      }

      // Load profile for role + terms check
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, terms_version, terms_accepted_at')
        .eq('id', user.id)
        .single()

      const role = profile?.role
        || user.app_metadata?.role
        || user.user_metadata?.role
        || 'traveller'

      // T&C gate — redirect to /terms if not accepted (developer exempt for testing)
      if (role !== 'developer' && profile?.terms_version !== TERMS_VERSION) {
        navigate('/terms')
        return
      }

      // Admin-only gate — allow admin AND developer
      if (adminOnly && role !== 'admin' && role !== 'developer') {
        navigate('/dashboard')
        return
      }

      setChecking(false)
    }

    checkAuth()
  }, [navigate, adminOnly])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-5 h-5 border-2 border-[#0118A1] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">Loading…</span>
        </div>
      </div>
    )
  }

  return children
}
