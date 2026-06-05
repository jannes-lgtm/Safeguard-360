/**
 * useAuth — verified session + profile in one hook.
 *
 * Uses getUser() (server-verified) rather than getSession().
 * Safe to call in any component; returns a stable loading state.
 *
 * Usage:
 *   const { user, profile, role, loading, isAdmin, isOrgAdmin, isGSOC, isProject } = useAuth()
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const ADMIN_ROLES   = ['admin', 'developer']
const ORG_ROLES     = ['admin', 'developer', 'org_admin']
const GSOC_ROLES    = ['gsoc_operator', 'gsoc_admin', 'developer', 'admin']
const PROJECT_ROLES = ['project_manager', 'project_operator', 'admin', 'developer', 'gsoc_admin']

export default function useAuth() {
  const [state, setState] = useState({
    user:      null,
    profile:   null,
    role:      null,
    loading:   true,
    error:     null,
  })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser()
        if (userErr || !user) {
          if (!cancelled) setState(s => ({ ...s, loading: false, error: userErr?.message || 'No session' }))
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle()

        if (!cancelled) {
          setState({
            user,
            profile,
            role:    profile?.role || 'traveller',
            loading: false,
            error:   null,
          })
        }
      } catch (err) {
        if (!cancelled) setState(s => ({ ...s, loading: false, error: err.message }))
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const role = state.role

  return {
    ...state,
    isAdmin:    ADMIN_ROLES.includes(role),
    isOrgAdmin: ORG_ROLES.includes(role),
    isGSOC:     GSOC_ROLES.includes(role),
    isProject:  PROJECT_ROLES.includes(role),
  }
}
