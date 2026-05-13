/**
 * /api/visa-letter
 * POST — Generate a visa support letter and save the request
 *
 * Auth: Bearer <user JWT>
 * Body: {
 *   tripId?, passportCountry, destinationCountry, travelPurpose,
 *   tripName, departDate, returnDate, departTime?, returnTime?,
 *   flightOut?, flightBack?, accommodation?,
 *   traveler: { name, passport, nationality, jobTitle? },
 *   organisation: { name, address, phone, email, regNumber? },
 *   manager: { name, title, email, phone }
 * }
 * Returns: { letterText, requestId }
 */

import { resolveModel } from './_claudeSynth.js'
import { adapt } from './_adapter.js'
import { checkRateLimit } from './_rateLimit.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON_KEY     = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) { res.status(503).json({ error: 'AI not configured' }); return }

  // Auth
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) { res.status(401).json({ error: 'Unauthorised' }); return }

  let userId
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    })
    if (!userRes.ok) throw new Error('auth failed')
    const u = await userRes.json()
    userId = u.id
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' }); return
  }

  // Rate limit: 10 letter generations per user per hour (heavy AI operation)
  const { allowed } = checkRateLimit(req, 'visa-letter', { max: 10, windowMs: 3_600_000 })
  if (!allowed) return res.status(429).json({ error: 'Rate limit exceeded — try again in an hour' })

  const {
    tripId, passportCountry, destinationCountry, travelPurpose = 'Business',
    tripName, departDate, returnDate, departTime = '', returnTime = '',
    flightOut = '', flightBack = '', accommodation = '',
    traveler = {}, organisation = {}, manager = {},
  } = req.body || {}

  if (!passportCountry || !destinationCountry || !traveler.name) {
    res.status(400).json({ error: 'Missing required fields' }); return
  }

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const refNo = `VL-${Date.now().toString(36).toUpperCase()}`

  const isOrgLetter = !!(organisation?.name)
  const letterType  = isOrgLetter ? 'employer visa support letter' : 'personal declaration letter'

  const prompt = `You are a professional legal document writer. Generate a formal ${letterType} for a visa application.

LETTER DETAILS:
- Reference: ${refNo}
- Date: ${today}
- Travel purpose: ${travelPurpose}
- Destination: ${destinationCountry}
- Passport country: ${passportCountry}

TRAVELLER:
- Full name: ${traveler.name}
- Passport number: ${traveler.passport || 'Not provided'}
- Nationality: ${traveler.nationality || passportCountry}
- Job title: ${traveler.jobTitle || ''}

TRAVEL DATES:
- Departure: ${departDate}${departTime ? ` at ${departTime}` : ''}
- Return: ${returnDate}${returnTime ? ` at ${returnTime}` : ''}
- Trip name / purpose: ${tripName || travelPurpose}
${flightOut ? `- Outbound flight: ${flightOut}` : ''}
${flightBack ? `- Return flight: ${flightBack}` : ''}
${accommodation ? `- Accommodation: ${accommodation}` : ''}

${isOrgLetter ? `ORGANISATION:
- Company name: ${organisation.name}
- Address: ${organisation.address || ''}
- Phone: ${organisation.phone || ''}
- Email: ${organisation.email || ''}
${organisation.regNumber ? `- Registration number: ${organisation.regNumber}` : ''}

LINE MANAGER / SIGNATORY:
- Name: ${manager.name || ''}
- Title: ${manager.title || ''}
- Email: ${manager.email || ''}
- Phone: ${manager.phone || ''}` : `SELF-DECLARATION (no employer)`}

Write a complete, formal visa support letter. Requirements:
- Use proper formal business letter format
- Include the reference number and date at the top right
- Address it "To Whom It May Concern" or "To the Visa Officer"
- For employer letters: confirm employment, state purpose of travel is official business, confirm the company takes financial responsibility, confirm the traveller will return
- For ${travelPurpose} travel: include purpose-specific language (e.g. for Medical include hospital/treatment reference; for Study include institution; for Tourism include financial sufficiency statement)
- Include all travel details (dates, destination, flights if provided)
- Close with a clear signatory block including contact details for verification
- Use professional, formal English appropriate for a visa application
- Do NOT include placeholder text like [INSERT ...] — use the actual data provided or omit gracefully
- Output the letter as plain text only — no markdown, no asterisks, no headings with hashes`

  try {
    const model = await resolveModel(ANTHROPIC_API_KEY)
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!r.ok) { res.status(502).json({ error: 'AI service error' }); return }

    const aiData    = await r.json()
    const letterText = aiData.content?.[0]?.text?.trim() || ''

    // Save to Supabase
    let requestId = null
    if (SUPABASE_URL && SERVICE_KEY) {
      try {
        const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/visa_letter_requests`, {
          method: 'POST',
          headers: { ...sbHeaders(SERVICE_KEY), Prefer: 'return=representation' },
          body: JSON.stringify({
            user_id:             userId,
            org_id:              organisation?.id || null,
            trip_id:             tripId || null,
            passport_country:    passportCountry,
            destination_country: destinationCountry,
            travel_purpose:      travelPurpose,
            trip_name:           tripName || null,
            depart_date:         departDate || null,
            return_date:         returnDate || null,
            letter_text:         letterText,
            status:              'generated',
          }),
        })
        if (insertRes.ok) {
          const rows = await insertRes.json()
          requestId = rows?.[0]?.id
        }
      } catch (e) {
        console.error('Supabase insert error:', e)
      }
    }

    res.status(200).json({ letterText, requestId, refNo })
  } catch (err) {
    console.error('visa-letter error:', err)
    res.status(500).json({ error: err.message })
  }
}

export default adapt(handler)
