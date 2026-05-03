// Returns the authenticated user's role — uses service role key via direct REST
// calls to bypass ALL Supabase RLS. No JS client needed.

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ role: 'traveller' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ role: 'traveller', error: 'no_token' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl) return res.status(500).json({ role: 'traveller', error: 'no_url' })

  // Step 1: verify the user's JWT and get their ID
  const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: serviceKey || anonKey,
    },
  })

  if (!authRes.ok) {
    return res.status(401).json({ role: 'traveller', error: 'invalid_token', status: authRes.status })
  }

  const user = await authRes.json()
  const userId = user.id

  if (!userId) return res.status(401).json({ role: 'traveller', error: 'no_user_id' })

  // Step 2: read the role from profiles using service role (bypasses RLS)
  const key = serviceKey || anonKey
  const profRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=role&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        Accept: 'application/json',
      },
    }
  )

  if (profRes.ok) {
    const profiles = await profRes.json()
    const role = profiles?.[0]?.role
    if (role) return res.json({ role, source: serviceKey ? 'service_role' : 'anon_rls' })
  }

  // Step 3: fall back to app_metadata in the JWT
  const metaRole = user.app_metadata?.role
  if (metaRole) return res.json({ role: metaRole, source: 'app_metadata' })

  return res.json({ role: 'traveller', source: 'fallback' })
}
