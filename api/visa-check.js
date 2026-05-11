/**
 * /api/visa-check
 * POST — AI-powered visa requirements check
 *
 * Body: { passportCountry, destinationCountry, travelPurpose, travelerName? }
 * Returns: { requirements: { visaRequired, visaType, documents[], processingTime, estimatedCost, notes, embassyTip }, model }
 */

import { resolveModel } from './_claudeSynth.js'
import { adapt } from './_adapter.js'

async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) { res.status(503).json({ error: 'AI not configured' }); return }

  const { passportCountry, destinationCountry, travelPurpose = 'Tourism', travelerName } = req.body || {}
  if (!passportCountry || !destinationCountry) {
    res.status(400).json({ error: 'passportCountry and destinationCountry are required' }); return
  }

  const prompt = `You are an expert travel visa consultant. Provide accurate, current visa requirements.

Passport Country: ${passportCountry}
Destination Country: ${destinationCountry}
Purpose of Travel: ${travelPurpose}
${travelerName ? `Traveller: ${travelerName}` : ''}

Respond ONLY with a valid JSON object in this exact format (no markdown, no extra text):
{
  "visaRequired": true | false | "depends",
  "visaType": "e.g. No Visa Required / e-Visa / Visa on Arrival / Embassy Visa / Transit Visa",
  "summary": "One sentence overview",
  "documents": [
    "Valid passport (minimum 6 months validity beyond travel dates)",
    "Return flight booking",
    "Proof of accommodation",
    "Bank statements (last 3 months)",
    "Travel insurance",
    "Completed visa application form"
  ],
  "processingTime": "e.g. Immediate / 3–5 business days / 2–4 weeks",
  "estimatedCost": "e.g. Free / USD 50 / ZAR 1,250",
  "maxStay": "e.g. 90 days / 30 days / Duration of visa",
  "validity": "e.g. Single entry / Multiple entry / 1 year",
  "notes": "Any important caveats, warnings, or tips specific to this passport/destination combination",
  "embassyTip": "Practical advice on where/how to apply — embassy website, online portal, or visa on arrival counter",
  "warningLevel": "none | caution | important",
  "warning": "Any critical warning if warningLevel is not none (e.g. visa restrictions, political situation affecting entry)"
}

Be accurate and specific. If you are uncertain about exact fees or processing times, give a realistic range. Reflect the ${travelPurpose} purpose in your document requirements (e.g. for Business include invitation letter, company letter; for Tourism include accommodation proof; for Medical include hospital letter).`

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
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!r.ok) {
      const err = await r.text()
      console.error('Anthropic error:', err)
      res.status(502).json({ error: 'AI service error' }); return
    }

    const aiData = await r.json()
    const raw = aiData.content?.[0]?.text || ''

    // Strip markdown fences if present
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    let requirements
    try {
      requirements = JSON.parse(clean)
    } catch {
      res.status(502).json({ error: 'Could not parse AI response', raw }); return
    }

    res.status(200).json({ requirements, model })
  } catch (err) {
    console.error('visa-check error:', err)
    res.status(500).json({ error: err.message })
  }
}

export default adapt(handler)
