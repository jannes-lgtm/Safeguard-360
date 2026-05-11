import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server configuration error. Please contact support.' })
  }

  const { email, password, full_name, company_name, country } = req.body
  if (!email || !password || !full_name || !company_name) {
    return res.status(400).json({ error: 'Missing required fields.' })
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  let orgId = null

  try {
    // 1. Create the organisation
    const { data: org, error: orgErr } = await supabaseAdmin
      .from('organisations')
      .insert({ name: company_name.trim(), country: country?.trim() || null, is_active: true })
      .select('id,name')
      .single()

    if (orgErr) throw new Error(`Organisation error: ${orgErr.message}`)
    orgId = org.id

    // 2. Create the auth user (trigger will create a basic profile row)
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim(), role: 'org_admin', org_id: org.id },
    })

    if (authErr) throw new Error(`Auth error: ${authErr.message}`)

    // 3. Ensure profile has correct role + org_id (trigger may have set defaults)
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id:        authData.user.id,
        email,
        full_name: full_name.trim(),
        role:      'org_admin',
        org_id:    org.id,
        status:    'active',
      }, { onConflict: 'id' })

    if (profileErr) throw new Error(`Profile error: ${profileErr.message}`)

    // Notify admin (fire-and-forget)
    fetch(`${SUPABASE_URL.replace('supabase.co', 'vercel.app')}/api/notify-signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: full_name.trim(), email, company_name, role: 'org_admin' }),
    }).catch(() => {})

    return res.status(200).json({ success: true, org_id: org.id })
  } catch (err) {
    // Roll back org if it was created
    if (orgId) {
      await supabaseAdmin.from('organisations').delete().eq('id', orgId).catch(() => {})
    }
    console.error('[org-signup] error:', err.message)
    return res.status(400).json({ error: err.message || 'Signup failed.' })
  }
}
