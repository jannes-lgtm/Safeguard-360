const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { user_id } = req.body
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' })

  try {
    // Delete auth user — profile is cascade-deleted via FK
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    })

    if (!authRes.ok) {
      const err = await authRes.json().catch(() => ({}))
      return res.status(authRes.status).json({ error: err.message || 'Failed to delete user' })
    }

    return res.status(200).json({ deleted: true })
  } catch (err) {
    console.error('[delete-user]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
