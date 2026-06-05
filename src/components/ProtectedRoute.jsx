/**
 * ProtectedRoute — server-verified route authorization gate.
 *
 * Authorization modes (use one per route):
 *
 *   module="module_id"   — checks permissions.js canAccess(role, moduleId).
 *                          Recommended for all new routes. Keeps role logic
 *                          centralized in permissions.js.
 *
 *   adminOnly            — legacy: admin + developer only
 *   developerOnly        — legacy: developer only
 *   gsocOnly             — legacy: gsoc + admin + developer
 *   orgAdminAllowed      — legacy: org_admin + admin + developer
 *   projectsAllowed      — legacy: project + admin + developer + gsoc_admin
 *
 * If both `module` and a boolean flag are provided, `module` takes precedence.
 *
 * Security:
 *   Uses getUser() (server-verified JWT) not getSession().
 *   Profile is fetched independently from RoleContext for security isolation.
 *   RoleContext is display-only and must never be used as a security gate.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { log } from '../lib/logger'
import { canAccess } from '../lib/permissions'

// ── Legacy role sets (kept for backward compatibility) ────────────────────────
const TERMS_VERSION    = '1.0'
const ONBOARDING_ROLES = ['traveller', 'solo']
const ADMIN_ROLES      = ['admin', 'developer']
const ORG_ROLES        = ['admin', 'developer', 'org_admin']
const GSOC_ROLES       = ['gsoc_operator', 'gsoc_admin', 'developer', 'admin']
const PROJECT_ROLES    = ['project_manager', 'project_operator', 'admin', 'developer', 'gsoc_admin']

export default function ProtectedRoute({
  children,
  // ── Permissions-config-based authorization (recommended) ──────────────────
  module          = null,      // module id from permissions.js DOMAINS
  // ── Legacy boolean flags (maintained for backward compatibility) ──────────
  adminOnly       = false,
  developerOnly   = false,
  gsocOnly        = false,
  orgAdminAllowed = false,
  projectsAllowed = false,
  noGates         = false,
}) {
  const navigate   = useNavigate()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // ── 1. Verify session (server-side) ──────────────────────────────────
        const { data: { user }, error: userErr } = await supabase.auth.getUser()
        if (userErr || !user) {
          if (userErr) log.auth.sessionExpired({ error: userErr.message, path: window.location.pathname })
          navigate('/login')
          return
        }

        if (noGates) { setChecking(false); return }

        // ── 2. Load profile ───────────────────────────────────────────────────
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('role, terms_version, terms_accepted_at, onboarding_completed_at, org_id')
          .eq('id', user.id)
          .maybeSingle()

        if (profileErr) {
          log.auth.profileMissing({ userId: user.id, error: profileErr.message })
          navigate('/login')
          return
        }

        if (!profile) {
          log.auth.profileMissing({ userId: user.id, action: 'redirecting_to_onboarding' })
          navigate('/onboarding')
          return
        }

        const role = profile.role || 'traveller'

        // ── Gate 1: Terms & Conditions ────────────────────────────────────────
        if (!ADMIN_ROLES.includes(role) && profile.terms_version !== TERMS_VERSION) {
          navigate('/terms')
          return
        }

        // ── Gate 2: Org admin — needs an approved org ─────────────────────────
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

        // ── Gate 4: Module-based authorization (permissions.js) ───────────────
        // Preferred over boolean flags for all new routes.
        if (module !== null) {
          if (!canAccess(role, module)) {
            navigate('/dashboard')
            return
          }
          setChecking(false)
          return
        }

        // ── Gate 5: Legacy boolean flags ──────────────────────────────────────
        // Kept for backward compatibility. Migrate to `module` over time.

        if (developerOnly && role !== 'developer') {
          navigate('/dashboard')
          return
        }

        if (gsocOnly && !GSOC_ROLES.includes(role)) {
          navigate('/dashboard')
          return
        }

        if (adminOnly && !ADMIN_ROLES.includes(role)) {
          navigate('/dashboard')
          return
        }

        if (orgAdminAllowed && !ORG_ROLES.includes(role)) {
          navigate('/dashboard')
          return
        }

        if (projectsAllowed && !PROJECT_ROLES.includes(role)) {
          navigate('/dashboard')
          return
        }

        setChecking(false)
      } catch (err) {
        log.error('AUTH', 'protected_route_crash', { error: err.message, path: window.location.pathname })
        navigate('/login')
      }
    }

    checkAuth()
  }, [navigate, module, adminOnly, developerOnly, gsocOnly, orgAdminAllowed, projectsAllowed, noGates])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#090A0C' }}>
        <div className="flex items-center gap-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#AACC00', borderTopColor: 'transparent' }} />
          <span className="text-sm font-medium tracking-wide">Verifying access…</span>
        </div>
      </div>
    )
  }

  return children
}
