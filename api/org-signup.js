/**
 * api/org-signup.js
 *
 * Creates a new organisation and its first org_admin user atomically.
 * Three steps with full compensating rollback if any step fails.
 *
 * POST body: { email, password, full_name, company_name, country? }
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const headers = () => ({
  'Content-Type':  'application/json',
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'apikey':        SERVICE_KEY,
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function restPost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method:  'POST',
    headers: { ...headers(), 'Prefer': 'return=representation' },
    body:    JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }
  if (!res.ok) throw new Error(data?.[0]?.message || data?.message || text || res.statusText)
  return Array.isArray(data) ? data[0] : data
}

async function createAuthUser(email, password, metadata) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method:  'POST',
    headers: headers(),
    body: JSON.stringify({
      email,
      password,
      email_confirm: false,  // send real confirmation email — don't silently activate
      user_metadata: metadata,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.msg || data?.message || data?.error_description || JSON.stringify(data))
  return data
}

async function deleteAuthUser(userId) {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE', headers: headers(),
    })
  } catch (e) {
    console.error('[org-signup] rollback: deleteAuthUser failed', e.message)
  }
}

async function deleteOrg(orgId) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/organisations?id=eq.${orgId}`, {
      method: 'DELETE', headers: headers(),
    })
  } catch (e) {
    console.error('[org-signup] rollback: deleteOrg failed', e.message)
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server configuration error.' })
  }

  const { email, password, full_name, company_name, country } = req.body || {}
  if (!email?.trim() || !password || !full_name?.trim() || !company_name?.trim()) {
    return res.status(400).json({ error: 'Missing required fields.' })
  }

  let orgId  = null
  let userId = null

  try {
    // ── Step 1: Create organisation ──────────────────────────────────────────
    // Only pass columns guaranteed to exist. billing_status/stripe fields
    // are added via supabase-migration-billing.sql — omit here for safety
    // so the insert works even if the migration hasn't run yet.
    const org = await restPost('organisations', {
      name:              company_name.trim(),
      country:           country?.trim() || null,
      is_active:         true,
      subscription_plan: 'solo',      // billing migration renamed 'starter' → 'solo'
    })
    orgId = org.id
    console.log('[org-signup] step1 org created', orgId)

    // ── Step 2: Create auth user (sends confirmation email) ─────────────────
    const user = await createAuthUser(email.trim(), password, {
      full_name: full_name.trim(),
      role:      'org_admin',
      org_id:    orgId,
    })
    userId = user.id
    console.log('[org-signup] step2 auth user created', userId)

    // ── Step 3: Upsert profile (DB trigger may have already created it) ──────
    // Use merge-duplicates so this is idempotent whether or not the trigger ran.
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method:  'POST',
      headers: { ...headers(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id:        userId,
        email:     email.trim(),
        full_name: full_name.trim(),
        role:      'org_admin',
        org_id:    orgId,
        status:    'active',
      }),
    })
    if (!profileRes.ok) {
      const t = await profileRes.text()
      throw new Error(`Profile upsert failed: ${t}`)
    }
    console.log('[org-signup] step3 profile upserted', userId)

    return res.status(200).json({ success: true, org_id: orgId })

  } catch (err) {
    // ── Compensating rollback — best effort, log every failure ───────────────
    console.error('[org-signup] failed:', err.message)
    if (userId) await deleteAuthUser(userId)
    if (orgId)  await deleteOrg(orgId)

    // Surface a clean message — not raw Postgres errors
    let message = 'Signup failed. Please try again.'
    if (err.message.includes('already registered') || err.message.includes('already exists')) {
      message = 'An account with this email already exists. Please sign in.'
    } else if (err.message.includes('check constraint') || err.message.includes('violates')) {
      message = 'Account setup error — please contact support.'
      console.error('[org-signup] CONSTRAINT VIOLATION — check subscription_plan value and DB schema:', err.message)
    } else if (err.message.includes('not-null')) {
      message = 'Account setup error — please contact support.'
      console.error('[org-signup] NOT-NULL VIOLATION:', err.message)
    }

    return res.status(400).json({ error: message })
  }
}
