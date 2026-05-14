import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly at startup — a silent broken client causes confusing downstream auth
  // errors that are hard to diagnose. This surfaces the real problem immediately.
  const msg = '[SafeGuard360] VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY are not set.'
  console.error(msg)
  if (import.meta.env.DEV) {
    throw new Error(msg + '\nCheck your .env.local file.')
  }
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession:     true,   // survive page refresh and PWA reinstall
    autoRefreshToken:   true,   // silently refresh before expiry
    detectSessionInUrl: true,   // handle magic links and OAuth callbacks
  },
})
