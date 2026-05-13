/**
 * api/enterprise-inquiry.js
 *
 * Receives enterprise contact form submissions from the Pricing page
 * and sends an internal notification email.
 *
 * POST body: { name, org, email, size, message }
 * No auth required — public endpoint.
 */

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(204).end()
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { name, org, email, size, message } = req.body || {}
    if (!name || !org || !email) {
      return res.status(400).json({ error: 'name, org and email are required' })
    }

    const RESEND_KEY = process.env.RESEND_API_KEY
    const TO_EMAIL   = process.env.ENTERPRISE_SALES_EMAIL || 'sales@risk360.co'

    const body = `
Enterprise inquiry received:

Name:           ${name}
Organisation:   ${org}
Email:          ${email}
Traveller size: ${size || 'Not specified'}

Message:
${message || '(none)'}
    `.trim()

    if (RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    'Safeguard 360 <noreply@risk360.co>',
          to:      [TO_EMAIL],
          subject: `Enterprise inquiry — ${org} (${name})`,
          text:    body,
          reply_to: email,
        }),
      })
    } else {
      // Log to console for local dev
      console.log('[enterprise-inquiry]', body)
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[enterprise-inquiry]', err)
    return res.status(500).json({ error: err.message })
  }
}
