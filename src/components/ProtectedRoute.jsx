import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const TERMS_VERSION = '1.0'
const ONBOARDING_ROLES = ['traveller', 'solo']

export default function ProtectedRoute({ children, adminOnly = false, orgAdminAllowed = false, noGates = false }) {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/login'); return }

      // noGates — auth-only check used for onboarding routes to avoid redirect loops
      if (noGates) { setChecking(false); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, terms_version, terms_accepted_at, onboarding_completed_at, org_id')
        .eq('id', user.id)
        .single()

      const role = profile?.role
        || user.app_metadata?.role
        || user.user_metadata?.role
        || 'traveller'

      // Gate 1 — T&C (developer exempt)
      if (role !== 'developer' && profile?.terms_version !== TERMS_VERSION) {
        navigate('/terms')
        return
      }

      // Gate 2 — Org admin: needs org, org must be approved
      if (role === 'org_admin') {
        if (!profile?.org_id) {
          navigate('/org-onboarding')
          return
        }
        const { data: org } = await supabase
          .from('organisations')
          .select('approval_status')
          .eq('id', profile.org_id)
          .single()

        if (!org || org.approval_status === 'pending' || org.approval_status === 'rejected') {
          navigate('/pending-approval')
          return
        }
      }

      // Gate 3 — Travellers must complete personal onboarding first
      if (ONBOARDING_ROLES.includes(role) && !profile?.onboarding_completed_at) {
        navigate('/onboarding')
        return
      }

      // Gate 4 — adminOnly: platform admin + developer only
      if (adminOnly && !['admin', 'developer'].includes(role)) {
        navigate('/dashboard')
        return
      }

      // Gate 5 — orgAdminAllowed: org_admin, platform admin, developer
      if (orgAdminAllowed && !['admin', 'developer', 'org_admin'].includes(role)) {
        navigate('/dashboard')
        return
      }

      setChecking(false)
    }

    checkAuth()
  }, [navigate, adminOnly, orgAdminAllowed, noGates])

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
