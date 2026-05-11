const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const headers = () => ({
  'Content-Type':  'application/json',
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'apikey':        SERVICE_KEY,
})

async function restPost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method:  'POST',
    headers: { ...headers(), 'Prefer': 'return=representation' },
    body:    JSON.stringify(body),
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(data?.[0]?.message || data?.message || text || res.statusText)
  return Array.isArray(data) ? data[0] : data
}

async function restPatch(path, match, body) {
  const params = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join('&')
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}?${params}`, {
    method:  'PATCH',
    headers: { ...headers(), 'Prefer': 'return=representation' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
}

async function createAuthUser(email, password, metadata) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method:  'POST',
    headers: headers(),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.msg || data?.message || data?.error_description || JSON.stringify(data))
  return data
}

async function deleteAuthUser(userId) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method:  'DELETE',
    headers: headers(),
  }).catch(() => {})
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server configuration error.' })
  }

  const { email, password, full_name, company_name, country } = req.body
  if (!email || !password || !full_name || !company_name) {
    return res.status(400).json({ error: 'Missing required fields.' })
  }

  let orgId  = null
  let userId = null

  try {
    // 1. Create the organisation
    const org = await restPost('organisations', {
      name:      company_name.trim(),
      country:   country?.trim() || null,
      is_active: true,
    })
    orgId = org.id

    // 2. Create auth user via admin REST API
    const user = await createAuthUser(email, password, {
      full_name: full_name.trim(),
      role:      'org_admin',
      org_id:    orgId,
    })
    userId = user.id

    // 3. Upsert profile — works whether trigger created it or not
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method:  'POST',
      headers: { ...headers(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id:        userId,
        email,
        full_name: full_name.trim(),
        role:      'org_admin',
        org_id:    orgId,
        status:    'active',
      }),
    })
    if (!profileRes.ok) {
      const t = await profileRes.text()
      throw new Error(`Profile error: ${t}`)
    }

    return res.status(200).json({ success: true, org_id: orgId })
  } catch (err) {
    console.error('[org-signup]', err.message)
    if (userId) await deleteAuthUser(userId)
    if (orgId)  {
      await fetch(`${SUPABASE_URL}/rest/v1/organisations?id=eq.${orgId}`, {
        method: 'DELETE', headers: headers(),
      }).catch(() => {})
    }
    return res.status(400).json({ error: err.message || 'Signup failed. Please try again.' })
  }
}
