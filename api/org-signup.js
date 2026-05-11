import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, password, full_name, company_name, country } = req.body

  if (!email || !password || !full_name || !company_name) {
    return res.status(400).json({ error: 'Missing required fields.' })
  }

  try {
    // 1. Create the organisation
    const { data: org, error: orgErr } = await supabaseAdmin
      .from('organisations')
      .insert({ name: company_name.trim(), country: country?.trim() || null, is_active: true })
      .select('id,name')
      .single()

    if (orgErr) throw new Error(orgErr.message)

    // 2. Create the auth user
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim(), role: 'org_admin', org_id: org.id },
    })

    if (authErr) {
      // Roll back org
      await supabaseAdmin.from('organisations').delete().eq('id', org.id)
      throw new Error(authErr.message)
    }

    // 3. Upsert the profile with correct role + org_id
    await supabaseAdmin
      .from('profiles')
      .upsert({
        id:       authData.user.id,
        email,
        full_name: full_name.trim(),
        role:     'org_admin',
        org_id:   org.id,
      })

    // Notify admin (fire-and-forget)
    fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''}/api/notify-signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: full_name.trim(), email, company_name, role: 'org_admin' }),
    }).catch(() => {})

    return res.status(200).json({ success: true, org_id: org.id })
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Signup failed.' })
  }
}
