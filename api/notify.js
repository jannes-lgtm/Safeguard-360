const FROM = 'SafeGuard360 Alerts <alerts@risk360.co>'
import { sendWhatsApp } from './whatsapp-send.js'

function flightHtml({ travelerName, ident, status, origin, destination, arrivalDelay, estimatedArrival, tripName }) {
  const delay = arrivalDelay > 0 ? `${arrivalDelay} minutes late` : ''
  const eta = estimatedArrival ? new Date(estimatedArrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  const color = status === 'Cancelled' ? '#DC2626' : '#D97706'
  const icon = status === 'Cancelled' ? '🚫' : '⚠️'

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <div style="background:#0118A1;padding:20px 24px;">
        <h1 style="color:white;margin:0;font-size:20px;">SafeGuard360</h1>
        <p style="color:#a5b4fc;margin:4px 0 0;font-size:13px;">Automated Flight Alert</p>
      </div>
      <div style="padding:24px;">
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:16px;margin-bottom:20px;">
          <p style="margin:0;font-size:16px;font-weight:bold;color:${color};">${icon} Flight ${ident || '—'} — ${status || 'Unknown'}</p>
          ${delay ? `<p style="margin:6px 0 0;color:#92400e;font-size:14px;">Delayed by ${delay}</p>` : ''}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Trip</td><td style="padding:8px 0;font-weight:600;">${tripName || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Flight</td><td style="padding:8px 0;font-weight:600;">${ident || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Route</td><td style="padding:8px 0;">${origin || '—'} → ${destination || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Status</td><td style="padding:8px 0;color:${color};font-weight:600;">${status || '—'}</td></tr>
          ${eta ? `<tr><td style="padding:8px 0;color:#6b7280;">New ETA</td><td style="padding:8px 0;">${eta}</td></tr>` : ''}
        </table>
        <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">This alert was sent to ${travelerName || 'Traveler'} and their emergency contacts by SafeGuard360.</p>
      </div>
    </div>
  `
}

function countryRiskHtml({ travelerName, country, severity, sources, tripName }) {
  const colors = { Critical: '#DC2626', High: '#D97706', Medium: '#CA8A04', Low: '#16A34A' }
  const color = colors[severity] || '#6b7280'
  const icon = severity === 'Critical' || severity === 'High' ? '🚨' : '⚠️'

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <div style="background:#0118A1;padding:20px 24px;">
        <h1 style="color:white;margin:0;font-size:20px;">SafeGuard360</h1>
        <p style="color:#a5b4fc;margin:4px 0 0;font-size:13px;">Automated Risk Alert</p>
      </div>
      <div style="padding:24px;">
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px;margin-bottom:20px;">
          <p style="margin:0;font-size:16px;font-weight:bold;color:${color};">${icon} ${country || 'Unknown'} — ${severity || 'Unknown'} Risk</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Trip</td><td style="padding:8px 0;font-weight:600;">${tripName || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Destination</td><td style="padding:8px 0;font-weight:600;">${country || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Risk Level</td><td style="padding:8px 0;color:${color};font-weight:600;">${severity || '—'}</td></tr>
        </table>
        ${Array.isArray(sources) && sources.length ? `
          <div style="margin-top:16px;">
            <p style="font-size:13px;color:#6b7280;margin:0 0 8px;">Advisory sources:</p>
            ${sources.map(s => `<a href="${s.url || '#'}" style="display:block;font-size:13px;color:#0118A1;margin-bottom:4px;">${s.name} →</a>`).join('')}
          </div>
        ` : ''}
        <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">This alert was sent to ${travelerName || 'Traveler'} and their emergency contacts by SafeGuard360.</p>
      </div>
    </div>
  `
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'Email service not configured' })

  // Parse body — use req.body if available (Vercel parses JSON automatically), else manual
  let parsed
  try {
    if (req.body && typeof req.body === 'object') {
      parsed = req.body
    } else {
      let raw = ''
      await new Promise(resolve => { req.on('data', d => raw += d); req.on('end', resolve) })
      parsed = JSON.parse(raw)
    }
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const { type, recipients, data, whatsappNumbers } = parsed

  // Validate required fields
  if (!type) return res.status(400).json({ error: 'type is required' })
  if (!Array.isArray(recipients) || recipients.length === 0) return res.status(400).json({ error: 'recipients array is required' })
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data object is required' })

  // Filter valid email addresses
  const validRecipients = recipients.filter(e => typeof e === 'string' && e.includes('@'))
  if (!validRecipients.length) return res.status(400).json({ error: 'No valid recipient email addresses' })

  let subject, html
  if (type === 'flight') {
    const isCancelled = data.status === 'Cancelled'
    subject = isCancelled
      ? `🚫 Flight ${data.ident || ''} Cancelled — ${data.tripName || 'Your trip'}`
      : `⚠️ Flight ${data.ident || ''} Delayed — ${data.tripName || 'Your trip'}`
    html = flightHtml(data)
  } else if (type === 'country_risk') {
    subject = `🚨 Risk Alert: ${data.country || 'Destination'} — ${data.severity || 'Unknown'} | ${data.tripName || 'Your trip'}`
    html = countryRiskHtml(data)
  } else {
    return res.status(400).json({ error: `Unknown notification type: ${type}` })
  }

  try {
    // 8-second timeout to avoid Vercel function timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: validRecipients, subject, html }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const result = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: result.message || result.error || 'Send failed' })

    // Also send WhatsApp if numbers provided
    if (Array.isArray(whatsappNumbers) && whatsappNumbers.length > 0) {
      const waMessage = type === 'flight'
        ? `✈️ *SafeGuard360 Flight Alert*\n\nFlight ${data.ident || ''} — *${data.status || ''}*\nTrip: ${data.tripName || '—'}\nRoute: ${data.origin || '—'} → ${data.destination || '—'}\n\n_View details at risk360.co_`
        : `🚨 *SafeGuard360 Risk Alert*\n\n*${data.country || ''}* — ${data.severity || ''} Risk\nTrip: ${data.tripName || '—'}\n\n_View details at risk360.co_`

      await Promise.allSettled(
        whatsappNumbers.filter(Boolean).map(n => sendWhatsApp(n, waMessage))
      )
    }

    res.json({ ok: true, id: result.id })
  } catch (e) {
    if (e.name === 'AbortError') return res.status(504).json({ error: 'Email service timed out' })
    res.status(500).json({ error: e.message || 'Internal error' })
  }
}
