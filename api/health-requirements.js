/**
 * /api/health-requirements
 * Returns AI-generated, live vaccination and health risk requirements
 * for a given destination. Uses WHO/Africa CDC/PAHO outbreak feeds + Claude.
 *
 * POST body: { destination, country, depart_date }
 * Auth: Supabase JWT
 * Cache: 6h per destination (module-level — survives warm invocations)
 */

import { fetchHealthOutbreaks, resolveModel } from './_claudeSynth.js'
import { adapt } from './_adapter.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const ANON_KEY     = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

async function verifyToken(token) {
  if (!token || !SUPABASE_URL || !ANON_KEY) return false
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    })
    return r.ok
  } catch { return false }
}

// 6-hour module-level cache per destination key
const CACHE     = {}
const CACHE_TTL = 6 * 60 * 60 * 1000

async function fetchRequirements(destination, country, departDate, apiKey) {
  const cacheKey = `${(country || destination).toLowerCase()}:${departDate || 'any'}`
  const cached   = CACHE[cacheKey]
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  // Pull live outbreak data from WHO, Africa CDC, PAHO, CIDRAP, etc.
  const health = await fetchHealthOutbreaks(country || destination)

  const outbreakLines = health.matches.length
    ? health.matches.map(a => `[${a.source}] ${a.title}`).join('\n')
    : 'No destination-specific outbreak alerts currently.'

  const globalLines = health.recent.length
    ? health.recent.slice(0, 4).map(a => `[${a.source}] ${a.title}`).join('\n')
    : 'No recent global outbreak headlines.'

  const prompt = `You are a travel medicine specialist and epidemiologist. A traveller is departing to ${destination}${departDate ? ` on ${departDate}` : ''}.

Using the live disease surveillance data below, generate a structured pre-travel health requirements assessment.

== LIVE OUTBREAK SURVEILLANCE (WHO / Africa CDC / PAHO / CIDRAP) ==
Destination-specific alerts:
${outbreakLines}

Recent global outbreak headlines:
${globalLines}

== INSTRUCTIONS ==
Return ONLY valid JSON — no markdown, no explanation. Be specific to the destination. Vaccinations marked "required" must have documentary evidence for entry or are legally mandated. "recommended" means medical consensus advises it. "consider" means optional but worth discussing with a doctor.

{
  "vaccinations": [
    {
      "name": "vaccine name",
      "category": "required|recommended|consider",
      "notes": "brief reason or entry requirement detail"
    }
  ],
  "health_risks": [
    {
      "name": "risk name",
      "severity": "High|Medium|Low",
      "description": "1-sentence description of the specific risk for this destination right now",
      "prevention": "practical prevention measure"
    }
  ],
  "general_advice": "2-3 sentences of general health and hygiene advice specific to this destination",
  "sources": ["WHO", "Africa CDC"]
}`

  try {
    const model = await resolveModel(apiKey)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) return null
    const data  = await res.json()
    const raw   = (data?.content?.[0]?.text || '').replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null

    const result = JSON.parse(match[0])
    CACHE[cacheKey] = { data: result, ts: Date.now() }
    return result
  } catch (e) {
    console.error('[health-requirements] Claude call failed:', e.message)
    return null
  }
}

async function _handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  const valid  = await verifyToken(token)
  if (!valid) return res.status(401).json({ error: 'Unauthorized' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'AI not configured' })

  const { destination, country, depart_date } = req.body || {}
  if (!destination && !country) return res.status(400).json({ error: 'destination required' })

  // country is the resolved country name (e.g. "Democratic Republic of the Congo")
  // destination is the city (e.g. "Kinshasa") — used for display in the AI prompt
  const resolvedCountry = country || destination
  const displayDest     = destination || country
  const result = await fetchRequirements(displayDest, resolvedCountry, depart_date, apiKey)
  if (!result) return res.status(502).json({ error: 'Could not generate health requirements. Please try again.' })

  return res.json(result)
}

export const handler = adapt(_handler)
export default handler
