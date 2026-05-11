const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const RESEND_KEY   = process.env.RESEND_API_KEY || ''

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { org_id, org_name, status } = req.body
  if (!org_id || !status) return res.status(400).json({ error: 'Missing fields' })

  try {
    // Get the org admin's email
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?org_id=eq.${org_id}&role=eq.org_admin&select=email,full_name&limit=1`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
    )
    const profiles = await profileRes.json()
    const admin = profiles?.[0]
    if (!admin?.email) return res.status(200).json({ sent: false, reason: 'No org admin found' })

    const approved = status === 'approved'
    const subject = approved
      ? `✅ Your SafeGuard360 organisation has been approved`
      : `Your SafeGuard360 application was not approved`

    const html = approved ? `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <img src="https://www.risk360.co/logo-blue.png" alt="SafeGuard360" style="height:40px;margin-bottom:24px"/>
        <h2 style="color:#0118A1">Welcome to SafeGuard360, ${admin.full_name || 'there'}!</h2>
        <p>Great news — <strong>${org_name}</strong> has been approved and your platform access is now active.</p>
        <p>You can log in and start configuring your organisation, inviting travellers, and setting up your travel risk workflows.</p>
        <a href="https://www.risk360.co/login"
          style="display:inline-block;background:#AACC00;color:#0118A1;padding:12px 24px;border-radius:8px;font-weight:bold;text-decoration:none;margin:16px 0">
          Log In Now →
        </a>
        <p style="color:#6B7280;font-size:13px">If you have any questions, contact us at support@risk360.co</p>
      </div>` : `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <img src="https://www.risk360.co/logo-blue.png" alt="SafeGuard360" style="height:40px;margin-bottom:24px"/>
        <h2 style="color:#0118A1">Application Update</h2>
        <p>Thank you for your interest in SafeGuard360. Unfortunately, we were unable to approve <strong>${org_name}</strong>'s application at this time.</p>
        <p>Please contact our team for more information or to discuss your requirements.</p>
        <a href="mailto:support@risk360.co"
          style="display:inline-block;background:#0118A1;color:white;padding:12px 24px;border-radius:8px;font-weight:bold;text-decoration:none;margin:16px 0">
          Contact Support
        </a>
      </div>`

    if (RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'SafeGuard360 <noreply@risk360.co>',
          to: admin.email,
          subject,
          html,
        }),
      })
    }

    return res.status(200).json({ sent: true })
  } catch (err) {
    console.error('[notify-org-approval]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
