/**
 * GET /api/debug-twilio
 * Temporary diagnostic endpoint — tests Twilio WhatsApp credentials
 * and returns the raw Twilio response. Remove after debugging.
 *
 * Protected by SCAN_SECRET to prevent abuse.
 */

import { adapt } from './_adapter.js'

async function _handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const secret = req.query?.secret || req.headers.get?.('x-scan-secret') || req.headers['x-scan-secret']
  if (secret !== process.env.SCAN_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' })
  }

  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_WHATSAPP_FROM
  const to    = process.env.DEBUG_WHATSAPP_TO || '+27829277441'

  const envCheck = {
    TWILIO_ACCOUNT_SID:  sid   ? `${sid.slice(0, 6)}...` : 'MISSING',
    TWILIO_AUTH_TOKEN:   token ? `${token.slice(0, 4)}...` : 'MISSING',
    TWILIO_WHATSAPP_FROM: from || 'MISSING',
  }

  if (!sid || !token || !from) {
    return res.status(200).json({ ok: false, env: envCheck, error: 'Missing Twilio credentials' })
  }

  try {
    const params = new URLSearchParams({
      Body: 'SafeGuard 360 test message 🛡️',
      From: from,
      To:   `whatsapp:${to}`,
    })

    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    )

    const text = await r.text()
    let json
    try { json = JSON.parse(text) } catch { json = { raw: text } }

    return res.status(200).json({
      ok:         r.ok,
      httpStatus: r.status,
      env:        envCheck,
      twilio:     json,
    })
  } catch (e) {
    return res.status(200).json({ ok: false, env: envCheck, error: e.message })
  }
}

export const handler = adapt(_handler)
export default handler
