import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const TERMS_VERSION    = '1.0'
const ONBOARDING_ROLES = ['traveller', 'solo']
const ADMIN_ROLES      = ['admin', 'developer']
const ORG_ROLES        = ['admin', 'developer', 'org_admin']

export default function ProtectedRoute({
  children,
  adminOnly      = false,
  orgAdminAllowed = false,
  noGates        = false,
}) {
  const navigate   = useNavigate()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // ── 1. Verify session ────────────────────────────────────────────────
        const { data: { user }, error: userErr } = await supabase.auth.getUser()
        if (userErr || !user) { navigate('/login'); return }

        if (noGates) { setChecking(false); return }

        // ── 2. Load profile — use maybeSingle so missing row = null, not error ─
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('role, terms_version, terms_accepted_at, onboarding_completed_at, org_id')
          .eq('id', user.id)
          .maybeSingle()

        if (profileErr) {
          console.error('[ProtectedRoute] profile fetch error:', profileErr.message)
          navigate('/login')
          return
        }

        // ── 3. Derive role — ONLY from DB profile; never from JWT metadata ───
        //    If profile is missing entirely, the user account is broken.
        //    Redirect to onboarding which will repair the state.
        if (!profile) {
          console.warn('[ProtectedRoute] no profile row for user', user.id, '— redirecting to onboarding')
          navigate('/onboarding')
          return
        }

        const role = profile.role || 'traveller'

        // ── Gate 1: Terms & Conditions ────────────────────────────────────────
        if (!ADMIN_ROLES.includes(role) && profile.terms_version !== TERMS_VERSION) {
          navigate('/terms')
          return
        }

        // ── Gate 2: Org admin — needs an org that is approved ─────────────────
        if (role === 'org_admin') {
          if (!profile.org_id) {
            navigate('/org-onboarding')
            return
          }
          const { data: org } = await supabase
            .from('organisations')
            .select('approval_status')
            .eq('id', profile.org_id)
            .maybeSingle()

          if (!org || org.approval_status === 'pending' || org.approval_status === 'rejected') {
            navigate('/pending-approval')
            return
          }
        }

        // ── Gate 3: Travellers must complete personal onboarding ──────────────
        if (ONBOARDING_ROLES.includes(role) && !profile.onboarding_completed_at) {
          navigate('/onboarding')
          return
        }

        // ── Gate 4: Admin-only routes ─────────────────────────────────────────
        if (adminOnly && !ADMIN_ROLES.includes(role)) {
          navigate('/dashboard')
          return
        }

        // ── Gate 5: Org-admin-allowed routes ─────────────────────────────────
        if (orgAdminAllowed && !ORG_ROLES.includes(role)) {
          navigate('/dashboard')
          return
        }

        setChecking(false)
      } catch (err) {
        console.error('[ProtectedRoute] unexpected error:', err)
        navigate('/login')
      }
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
