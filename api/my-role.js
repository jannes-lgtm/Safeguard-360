// Returns the authenticated user's role using the service role key
// — bypasses ALL RLS, always reads the real value from the profiles table
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ role: 'traveller' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceKey) {
    // Fallback: verify the JWT with the anon key and read app_metadata
    const anon = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY)
    const { data: { user }, error } = await anon.auth.getUser(token)
    if (error || !user) return res.status(401).json({ role: 'traveller' })
    return res.json({ role: user.app_metadata?.role || 'traveller', source: 'app_metadata' })
  }

  // Use service role — ignores RLS entirely
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  })

  // Verify the user's JWT first
  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ role: 'traveller' })

  // Read the actual role from profiles (service role bypasses RLS)
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role || user.app_metadata?.role || 'traveller'
  return res.json({ role, source: 'service_role' })
}
