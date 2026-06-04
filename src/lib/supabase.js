import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let _client

try {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      `VITE_SUPABASE_URL=${supabaseUrl ? 'set' : 'MISSING'} ` +
      `VITE_SUPABASE_ANON_KEY=${supabaseAnonKey ? 'set' : 'MISSING'}`
    )
  }

  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession:     true,
      autoRefreshToken:   true,
      detectSessionInUrl: true,
    },
  })
} catch (err) {
  // Surface the error visibly — the diag overlay in main.jsx will catch it
  // via window.onerror if it propagates, but we also throw here so the
  // module import itself fails loudly.
  const msg = `[SG360] Supabase init failed: ${err.message}`
  console.error(msg)

  // Provide a non-null stub so downstream destructuring doesn't throw
  // a second cascading error before the diagnostic overlay can show.
  _client = {
    auth: {
      getUser:          () => Promise.resolve({ data: { user: null }, error: new Error(msg) }),
      getSession:       () => Promise.resolve({ data: { session: null }, error: new Error(msg) }),
      onAuthStateChange:() => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword:()=> Promise.resolve({ data: null, error: new Error(msg) }),
      signOut:          () => Promise.resolve({ error: null }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: new Error(msg) }) }) }),
    }),
    channel:    () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  }

  // Re-throw so window.onerror / the diag overlay sees it
  throw err
}

export const supabase = _client
