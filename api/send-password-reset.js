import { adapt } from './_adapter.js'

const SUPABASE_URL      = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_KEY        = process.env.RESEND_API_KEY
const FROM_EMAIL        = process.env.RESEND_FROM_EMAIL || 'noreply@risk360.co'
const APP_URL           = process.env.APP_URL || 'https://www.risk360.co'

async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { email } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Email is required' })

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !RESEND_KEY) {
    console.error('send-password-reset: missing env vars')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  try {
    // 1. Generate a password reset link via Supabase admin API
    const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        'apikey':        SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        type:        'recovery',
        email:       email.trim().toLowerCase(),
        redirect_to: `${APP_URL}/reset-password`,
      }),
    })

    if (!linkRes.ok) {
      const err = await linkRes.json().catch(() => ({}))
      // If user not found, return 200 anyway (security best practice — don't reveal existence)
      if (err.message?.includes('User not found') || err.code === 'user_not_found') {
        return res.status(200).json({ ok: true })
      }
      console.error('Supabase generate_link error:', err)
      return res.status(500).json({ error: 'Could not generate reset link' })
    }

    const { action_link } = await linkRes.json()
    if (!action_link) return res.status(500).json({ error: 'No reset link returned' })

    // 2. Send via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    `SafeGuard360 <${FROM_EMAIL}>`,
        to:      [email],
        subject: 'Reset your SafeGuard360 password',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#090A0C;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#11131A;border:1px solid rgba(255,255,255,0.07);">
    <div style="padding:32px 40px;border-bottom:1px solid rgba(255,255,255,0.07);">
      <img src="${APP_URL}/logo-transparent.png" alt="SafeGuard360" style="height:48px;width:auto;" />
    </div>
    <div style="padding:40px;">
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#EAEEF5;letter-spacing:-0.01em;">
        Reset your password
      </h2>
      <p style="margin:0 0 24px;font-size:14px;color:#6E7480;line-height:1.6;">
        We received a request to reset the password for your SafeGuard360 account associated with this email address.
        Click the button below to reset your password. This link expires in 1 hour.
      </p>
      <a href="${action_link}"
        style="display:inline-block;background:#AACC00;color:#090A0C;font-size:13px;font-weight:700;
               letter-spacing:0.06em;text-transform:uppercase;text-decoration:none;padding:14px 28px;">
        Reset Password
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#3C4050;line-height:1.6;">
        If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#3C4050;">
        Or copy this link into your browser:<br>
        <span style="color:#6E7480;word-break:break-all;">${action_link}</span>
      </p>
    </div>
    <div style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.07);">
      <p style="margin:0;font-size:11px;color:#3C4050;">
        SafeGuard360 — risk360.co &nbsp;|&nbsp; CONFIDENTIAL
      </p>
    </div>
  </div>
</body>
</html>`,
      }),
    })

    if (!emailRes.ok) {
      const err = await emailRes.json().catch(() => ({}))
      console.error('Resend error:', err)
      return res.status(500).json({ error: 'Failed to send email' })
    }

    return res.status(200).json({ ok: true })

  } catch (err) {
    console.error('send-password-reset error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default adapt(handler)
