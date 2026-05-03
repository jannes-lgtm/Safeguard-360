import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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

      if (adminOnly) {
        // Read role from auth metadata — bypasses RLS
        const metaRole = user.app_metadata?.role || user.user_metadata?.role

        if (metaRole !== 'admin') {
          // Fallback: check profiles table
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

          if (!profile || profile.role !== 'admin') {
            navigate('/dashboard')
            return
          }
        }
      }

      setChecking(false)
    }

    checkAuth()
  }, [navigate, adminOnly])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-5 h-5 border-2 border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">Loading...</span>
        </div>
      </div>
    )
  }

  return children
}
