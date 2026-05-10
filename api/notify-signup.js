import { adapt } from './_adapter.js'

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'admin@risk360.co'
const RESEND_KEY  = process.env.RESEND_API_KEY
const FROM_EMAIL  = process.env.RESEND_FROM_EMAIL || 'noreply@risk360.co'

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { full_name, email, company_name, role } = req.body || {}

  if (!email) {
    res.status(400).json({ error: 'Missing email' })
    return
  }

  if (!RESEND_KEY) {
    // Silently succeed if Resend not configured yet
    res.status(200).json({ ok: true, skipped: true })
    return
  }

  const isOrgSignup  = role === 'org_admin' && company_name
  const isInviteUser = role !== 'org_admin'

  const subject = isOrgSignup
    ? `New organisation signup — ${company_name}`
    : `New user signup — ${full_name || email}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff;">

      <div style="background: linear-gradient(135deg, #0118A1 0%, #010e7a 100%); padding: 32px 36px; border-radius: 12px 12px 0 0;">
        <img src="https://www.risk360.co/logo-transparent.png" alt="SafeGuard360" style="height: 48px; width: auto;" />
      </div>

      <div style="padding: 32px 36px; border: 1px solid #e2e6f3; border-top: none; border-radius: 0 0 12px 12px;">

        <h2 style="margin: 0 0 6px; font-size: 20px; color: #0118A1;">
          ${isOrgSignup ? '🏢 New Organisation Signed Up' : '👤 New User Signed Up'}
        </h2>
        <p style="margin: 0 0 24px; color: #888; font-size: 13px;">
          ${new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}
        </p>

        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 10px 12px; background: #f7f9ff; border-radius: 6px 0 0 0; color: #666; font-weight: 600; width: 36%;">Name</td>
            <td style="padding: 10px 12px; background: #f7f9ff; border-radius: 0 6px 0 0; color: #1a1a2e;">${full_name || '—'}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f0f2f8; color: #666; font-weight: 600;">Email</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f0f2f8; color: #1a1a2e;">${email}</td>
          </tr>
          ${isOrgSignup ? `
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f0f2f8; color: #666; font-weight: 600;">Company</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f0f2f8; color: #1a1a2e;">${company_name}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 10px 12px; background: #f7f9ff; border-radius: 0 0 0 6px; color: #666; font-weight: 600;">Role</td>
            <td style="padding: 10px 12px; background: #f7f9ff; border-radius: 0 0 6px 0; color: #1a1a2e;">
              ${role === 'org_admin' ? 'Company Administrator' : role === 'traveller' ? 'Traveller' : role || '—'}
            </td>
          </tr>
        </table>

        <div style="margin-top: 24px; padding: 14px 16px; background: #AACC0020; border-left: 3px solid #AACC00; border-radius: 0 8px 8px 0;">
          <p style="margin: 0; font-size: 13px; color: #555;">
            ${isOrgSignup
              ? 'A new organisation has registered. They will need to confirm their email before they can log in. You may want to reach out to welcome them.'
              : 'A new user has accepted an invite and signed up. They will need to confirm their email before they can log in.'}
          </p>
        </div>

        <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #f0f2f8;">
          <p style="margin: 0; font-size: 11px; color: #aaa;">
            SafeGuard360 &nbsp;·&nbsp; <a href="https://www.risk360.co" style="color: #0118A1;">risk360.co</a>
          </p>
        </div>
      </div>
    </div>
  `

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `SafeGuard360 <${FROM_EMAIL}>`,
        to:   [ADMIN_EMAIL],
        subject,
        html,
      }),
    })

    if (!r.ok) {
      const err = await r.text()
      console.error('Resend error:', err)
      res.status(500).json({ error: 'Failed to send notification' })
      return
    }

    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('notify-signup error:', err)
    res.status(500).json({ error: err.message })
  }
}

export default adapt(handler)
