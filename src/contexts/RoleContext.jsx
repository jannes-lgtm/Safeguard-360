/**
 * RoleContext — centralized role and profile state for the platform.
 *
 * Provides:
 *   role       — current user's role string
 *   profile    — full profile row from Supabase (includes org_name)
 *   isLoading  — true while initial profile fetch is in progress
 *   roleMeta   — { label, color, icon, family } from ROLE_META
 *   can(id)    — returns true if current role can access module by id
 *   hasRole()  — variadic: hasRole('admin','developer') → boolean
 *   refresh()  — re-fetches profile (call after role change)
 *
 * Usage:
 *   import { useRole } from '../contexts/RoleContext'
 *   const { role, can, profile } = useRole()
 *
 * Security note:
 *   This context is for display and navigation only.
 *   ProtectedRoute performs its own independent server-verified
 *   profile fetch for all route authorization decisions.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { canAccess, ROLE_META } from '../lib/permissions'

// ── Context ───────────────────────────────────────────────────────────────────
const RoleContext = createContext(null)

// ── Provider ──────────────────────────────────────────────────────────────────
export function RoleProvider({ children }) {
  const [profile,   setProfile]   = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const cancelledRef = useRef(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelledRef.current) {
        setIsLoading(false)
        return
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('*, organisations(name)')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelledRef.current) return

      setProfile(
        prof
          ? {
              id:       user.id,
              email:    user.email,
              ...prof,
              role:     prof.role || 'traveller',
              org_name: prof.organisations?.name || null,
            }
          : null
      )
    } catch {
      // Silently fail — ProtectedRoute handles hard auth errors
    } finally {
      if (!cancelledRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    load()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN')  load()
      if (event === 'SIGNED_OUT') { setProfile(null); setIsLoading(false) }
    })

    return () => {
      cancelledRef.current = true
      subscription.unsubscribe()
    }
  }, [load])

  const role = profile?.role || 'traveller'

  const value = {
    profile,
    role,
    isLoading,
    roleMeta:  ROLE_META[role] || ROLE_META.traveller,
    can:       (moduleId) => canAccess(role, moduleId),
    hasRole:   (...roles)  => roles.includes(role),
    refresh:   load,
  }

  return (
    <RoleContext.Provider value={value}>
      {children}
    </RoleContext.Provider>
  )
}

// ── Consumer hook ─────────────────────────────────────────────────────────────
export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole must be used within a <RoleProvider>')
  return ctx
}

export default RoleContext
