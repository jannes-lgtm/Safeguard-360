// Send a WhatsApp message via Twilio
// POST /api/whatsapp-send { to, message }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM // whatsapp:+14155238886

  if (!accountSid || !authToken || !from) {
    return res.status(503).json({ error: 'WhatsApp not configured' })
  }

  let parsed
  try {
    parsed = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body)
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const { to, message } = parsed

  if (!to || !message) return res.status(400).json({ error: 'to and message are required' })

  // Normalise number — ensure it has whatsapp: prefix
  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`

  try {
    const params = new URLSearchParams()
    params.append('From', from)
    params.append('To', toFormatted)
    params.append('Body', message)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: controller.signal,
      }
    )
    clearTimeout(timeout)

    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message || 'Twilio error' })

    res.json({ ok: true, sid: data.sid })
  } catch (e) {
    if (e.name === 'AbortError') return res.status(504).json({ error: 'WhatsApp send timed out' })
    res.status(500).json({ error: e.message || 'Internal error' })
  }
}

// Reusable helper for sending WhatsApp from other API routes (monitor, notify etc.)
export async function sendWhatsApp(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM

  if (!accountSid || !authToken || !from || !to || !message) return false

  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`

  try {
    const params = new URLSearchParams()
    params.append('From', from)
    params.append('To', toFormatted)
    params.append('Body', message)

    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    )
    return r.ok
  } catch {
    return false
  }
}
