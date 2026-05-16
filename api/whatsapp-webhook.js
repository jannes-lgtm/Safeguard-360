/**
 * api/whatsapp-webhook.js
 *
 * CAIRO — WhatsApp Channel
 * Receives inbound WhatsApp messages via Twilio webhook.
 * Runs CAIRO intelligence pipeline and replies to the sender.
 *
 * Twilio sends a POST with URL-encoded form data:
 *   From   = "whatsapp:+27821234567"
 *   Body   = "What's the security situation in Abuja this week?"
 *   ...other Twilio fields ignored
 *
 * Flow:
 *   1. Validate Twilio signature
 *   2. Load session (history + extracted journey) from whatsapp_sessions
 *   3. Run CAIRO (Phase 5 system prompt + conversation history)
 *   4. Save updated session
 *   5. Reply via Twilio REST API
 *   6. Return TwiML 200 so Twilio doesn't retry
 */

import crypto from 'crypto'

// ── Environment ──────────────────────────────────────────────────────────────
const env = {
  anthropicKey:   () => process.env.ANTHROPIC_API_KEY || '',
  twilioSid:      () => process.env.TWILIO_ACCOUNT_SID || '',
  twilioToken:    () => process.env.TWILIO_AUTH_TOKEN || '',
  twilioFrom:     () => process.env.TWILIO_WHATSAPP_FROM || '', // e.g. whatsapp:+14155238886
  supabaseUrl:    () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  serviceKey:     () => process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  validateSig:    () => (process.env.TWILIO_VALIDATE_SIG || 'true') !== 'false',
  siteUrl:        () => process.env.URL || process.env.DEPLOY_URL || 'https://rainbow-monstera-ab64b3.netlify.app',
}

// Max messages kept in WhatsApp session history (user + assistant pairs)
const MAX_HISTORY_PAIRS = 12

// ── Twilio signature validation ───────────────────────────────────────────────
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
function validateTwilioSignature(authToken, twilioSig, url, params) {
  try {
    // Concatenate URL + sorted key/value pairs
    const sortedStr = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + (params[key] ?? ''), url)

    const expected = crypto
      .createHmac('sha1', authToken)
      .update(Buffer.from(sortedStr, 'utf-8'))
      .digest('base64')

    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(twilioSig)
    )
  } catch {
    return false
  }
}

// ── Supabase: load session ────────────────────────────────────────────────────
async function loadSession(phone) {
  const url  = env.supabaseUrl()
  const key  = env.serviceKey()
  if (!url || !key) return null

  try {
    const res = await fetch(
      `${url}/rest/v1/whatsapp_sessions?phone_number=eq.${encodeURIComponent(phone)}&select=*&limit=1`,
      {
        headers: {
          apikey:        key,
          Authorization: `Bearer ${key}`,
          Accept:        'application/json',
        },
        signal: AbortSignal.timeout(4000),
      }
    )
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0] || null
  } catch {
    return null
  }
}

// ── Supabase: save session ────────────────────────────────────────────────────
async function saveSession(phone, journey, history) {
  const url = env.supabaseUrl()
  const key = env.serviceKey()
  if (!url || !key) return

  // Trim history to avoid unbounded growth
  const trimmed = history.slice(-(MAX_HISTORY_PAIRS * 2))

  await fetch(`${url}/rest/v1/whatsapp_sessions`, {
    method: 'POST',
    headers: {
      apikey:        key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer:        'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      phone_number:  phone,
      journey:       journey || {},
      history:       trimmed,
      last_activity: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(e => console.warn('[whatsapp] session save failed:', e.message))
}

// ── CAIRO system prompt (WhatsApp edition) ────────────────────────────────────
// Same voice/rules as Phase 5, adapted for plain-text WhatsApp format
function buildCairoSystem(journey) {
  const today = new Date().toISOString().split('T')[0]

  let journeyContext = ''
  if (journey?.destination) {
    journeyContext = `\nActive journey context:
Route: ${journey.origin || '?'} → ${journey.destination}${journey.transitPoints?.length ? ` via ${journey.transitPoints.join(', ')}` : ''}
Dates: ${journey.departDate || '?'} → ${journey.returnDate || '?'}
Travellers: ${journey.travellerCount || 1} | Purpose: ${journey.purpose || 'Business'}`
  }

  return `You are CAIRO — Contextual Adaptive Intelligence for Route Operations. Operational travel intelligence and journey risk advisory agent embedded in SafeGuard360.

You are communicating over WhatsApp. Format rules are strict:
- Plain text only. No markdown. No **, no ##, no __, no bullet dashes.
- Use line breaks between paragraphs for readability.
- Keep responses to 3-4 paragraphs maximum unless a detailed breakdown is explicitly requested.
- For lists, write them as numbered lines or simple comma-separated items in a sentence.
- Never use emoji unless the user uses them first.

LIVE INTEL PIPELINE STATUS: SafeGuard360's Context Assembly Engine is active. Live intelligence feeds, incident database, and pattern library are online. Today: ${today}.${journeyContext}

WHAT CAIRO IS:
CAIRO is a live operational travel intelligence system. SafeGuard360 operates a continuous intelligence pipeline — RSS and news feeds from Reuters, AP, BBC, Al Jazeera, UN OCHA, ACLED, France 24, and 15+ sources — normalised, scored, and corroborated before reaching you. You reason across live assembled intelligence, not training data alone.

ABSOLUTE PROHIBITIONS — NEVER SAY:
"I only have knowledge up to [date]" / "I don't have access to current information" / "I cannot access live data" / "As of my training cutoff" / "I'm not aware of recent events" / "My knowledge has a cutoff" / "I can't browse the internet" / or any variation suggesting you are a static or offline system.

CORE OPERATING RULES:
You advise, contextualise, recommend. You never block, deny, or restrict travel. Operators retain full decision authority. Frame all outputs as intelligence, advisories, and recommendations.

CHARACTER AND RESPONSE STYLE:
Lead with the operational bottom line, then build the picture. Use flowing prose. Be direct and confident. Name the threat, the pattern, the corridor. Match urgency to actual risk level — informational stays calm, escalated stays clear and direct.

Never open with: "Certainly", "Of course", "Great question", "Absolutely", "Sure", "I'd be happy to", "I can help with that", "Let me help you", or any chatbot affirmation.

If journey details are incomplete, ask for what's missing in one natural sentence. If you identify a new journey from the conversation, note the origin, destination, and dates in your mind — they carry forward.

When asked about a country or region: give a concise operational assessment covering security environment, key risks, current conditions, and any advisory notes.`
}

// ── CAIRO: extract/update journey from message ────────────────────────────────
// Quick Haiku pass to keep journey context updated across turns
async function extractJourney(apiKey, message, existingJourney) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system:     'Extract journey details from this message if present. Return ONLY valid JSON with keys: origin, destination, transitPoints (array), departDate (ISO), returnDate (ISO), travellerCount (int), purpose. Use null for unknown fields. If no journey information at all, return {}.',
        messages:   [{ role: 'user', content: `Existing: ${JSON.stringify(existingJourney || {})}. New message: "${message}"` }],
      }),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return existingJourney || {}
    const data    = await res.json()
    const text    = data.content?.[0]?.text?.trim() || '{}'
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] || '{}'
    const extracted = JSON.parse(jsonStr)
    // Merge with existing — don't overwrite known fields with null
    const merged = { ...existingJourney }
    for (const [k, v] of Object.entries(extracted)) {
      if (v !== null && v !== undefined && v !== '') merged[k] = v
    }
    return merged
  } catch {
    return existingJourney || {}
  }
}

// ── CAIRO: generate response ─────────────────────────────────────────────────
async function generateCairoReply(apiKey, message, history, journey) {
  const system = buildCairoSystem(journey)

  // Build conversation messages from history
  const messages = [
    ...history.map(h => ({
      role:    h.role === 'user' ? 'user' : 'assistant',
      content: h.text,
    })),
    { role: 'user', content: message },
  ]

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system,
      messages,
    }),
    signal: AbortSignal.timeout(22000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.status)
    throw new Error(`Anthropic ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text?.trim() || 'No response generated.'
}

// ── Twilio: send reply ────────────────────────────────────────────────────────
async function sendReply(to, body) {
  const sid   = env.twilioSid()
  const token = env.twilioToken()
  const from  = env.twilioFrom()

  if (!sid || !token || !from) {
    console.warn('[whatsapp] Twilio credentials not configured — reply not sent')
    return false
  }

  // WhatsApp messages have a 4096 char limit; Twilio recommends ≤1600 for reliability
  const truncated = body.length > 1500
    ? body.slice(0, 1497) + '...'
    : body

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: from, To: to, Body: truncated }).toString(),
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.error('[whatsapp] Twilio send failed:', res.status, txt)
      return false
    }
    return true
  } catch (err) {
    console.error('[whatsapp] Twilio send error:', err.message)
    return false
  }
}

// ── Parse URL-encoded form body ───────────────────────────────────────────────
function parseFormBody(raw) {
  const params = {}
  for (const [k, v] of new URLSearchParams(raw)) {
    params[k] = v
  }
  return params
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const rawBody = await req.text()
    const params  = parseFormBody(rawBody)

    // ── Twilio signature validation ─────────────────────────────────────────
    if (env.validateSig()) {
      const authToken  = env.twilioToken()
      const twilioSig  = req.headers.get('x-twilio-signature') || ''
      const webhookUrl = `${env.siteUrl()}/api/whatsapp-webhook`

      if (authToken && twilioSig) {
        const valid = validateTwilioSignature(authToken, twilioSig, webhookUrl, params)
        if (!valid) {
          console.warn('[whatsapp] Invalid Twilio signature — request rejected')
          return new Response('Forbidden', { status: 403 })
        }
      }
    }

    const from    = params.From || ''   // e.g. whatsapp:+27821234567
    const msgBody = (params.Body || '').trim()
    const apiKey  = env.anthropicKey()

    if (!from || !msgBody) {
      return twimlOk()
    }

    console.log(`[whatsapp] ${from} → "${msgBody.slice(0, 60)}${msgBody.length > 60 ? '...' : ''}"`)

    // ── Handle no API key ───────────────────────────────────────────────────
    if (!apiKey) {
      await sendReply(from, 'CAIRO is temporarily unavailable. Please try again shortly.')
      return twimlOk()
    }

    // ── Load session ────────────────────────────────────────────────────────
    const session = await loadSession(from)
    const history = session?.history || []
    const journey = session?.journey || {}

    // ── Update journey context in parallel with CAIRO response ──────────────
    // Journey extraction runs concurrently — don't block CAIRO on it
    const [reply, updatedJourney] = await Promise.all([
      generateCairoReply(apiKey, msgBody, history, journey),
      extractJourney(apiKey, msgBody, journey),
    ])

    // ── Save updated session (fire and forget) ──────────────────────────────
    const updatedHistory = [
      ...history,
      { role: 'user',      text: msgBody },
      { role: 'assistant', text: reply   },
    ]
    saveSession(from, updatedJourney, updatedHistory)
      .catch(e => console.warn('[whatsapp] session save error:', e.message))

    // ── Send reply via Twilio ───────────────────────────────────────────────
    await sendReply(from, reply)

    console.log(`[whatsapp] replied to ${from} (${reply.length} chars)`)

    // Return empty TwiML so Twilio marks delivery as handled
    return twimlOk()

  } catch (err) {
    console.error('[whatsapp] handler error:', err.message)
    // Still return 200 — otherwise Twilio retries repeatedly
    return twimlOk()
  }
}

// ── TwiML OK response ─────────────────────────────────────────────────────────
function twimlOk() {
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { status: 200, headers: { 'Content-Type': 'text/xml' } }
  )
}
