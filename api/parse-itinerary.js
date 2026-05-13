const HIGH_RISK_CRITICAL = ['lagos', 'kinshasa', 'mogadishu', 'kabul', 'juba', 'khartoum', 'tripoli', 'baghdad']
const HIGH_RISK_HIGH = ['nairobi', 'kampala', 'harare', 'lusaka', 'moscow', 'kyiv', 'tehran', 'karachi']

function getRiskLevel(city) {
  const c = (city || '').toLowerCase().trim()
  if (HIGH_RISK_CRITICAL.some(r => c === r || c.startsWith(r + ' '))) return 'Critical'
  if (HIGH_RISK_HIGH.some(r => c === r || c.startsWith(r + ' '))) return 'High'
  return 'Medium'
}

function computeStatus(departDate, returnDate) {
  const now = new Date()
  const depart = new Date(departDate)
  const ret = new Date(returnDate || departDate)
  if (now >= depart && now <= ret) return 'Active'
  if (now > ret) return 'Completed'
  return 'Upcoming'
}

const MOCK_TRIPS = [
  {
    trip_name: 'Sample Nairobi Business Trip',
    flight_number: 'KQ100',
    departure_city: 'London',
    arrival_city: 'Nairobi',
    depart_date: '2026-06-10',
    return_date: '2026-06-17',
    hotel_name: 'Serena Hotel Nairobi',
    meetings: 'Board meeting on June 11, client visits June 12-13',
    traveler_name: 'Jane Smith',
    risk_level: 'High',
    status: 'Upcoming',
  },
]

const PROMPT = `You are a travel itinerary parser. Extract all travel segments from the provided itinerary.

Return ONLY a valid JSON array of trip objects, no explanation or markdown. Each trip represents a stay in one destination city.

For each trip extract:
- trip_name: descriptive name e.g. "Nairobi Business Trip" or "Kinshasa Conference"
- flight_number: outbound flight number e.g. "BA123", or null
- departure_city: departure city name ONLY — no country suffix (e.g. "London" not "London, UK")
- arrival_city: destination city name ONLY — no country, no parentheses (e.g. "Nairobi" not "Nairobi, Kenya")
- depart_date: departure date in YYYY-MM-DD format
- return_date: return/end date in YYYY-MM-DD format
- hotel_name: hotel name if mentioned, or null
- meetings: brief summary of meetings/events/activities at destination, or null
- traveler_name: full name of traveler if mentioned, or null

Rules:
- Multi-destination trips (A→B→C→A): create one trip per destination
- If year not specified assume 2026
- If only month/day given use 2026
- Return ONLY the JSON array, nothing else`

// Resolve the best available model from the Anthropic API at call time
// so the code never breaks due to model deprecation.
let _cachedModel = null
let _cachedModelTs = 0

async function resolveModel(apiKey) {
  // Cache for 1 hour
  if (_cachedModel && Date.now() - _cachedModelTs < 60 * 60 * 1000) {
    return _cachedModel
  }
  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    })
    if (r.ok) {
      const { data } = await r.json()
      // Prefer smallest/fastest model — haiku first, then sonnet, then anything
      const sorted = (data || []).sort((a, b) => {
        const rank = id => {
          if (id.includes('haiku'))  return 0
          if (id.includes('sonnet')) return 1
          return 2
        }
        const r1 = rank(a.id), r2 = rank(b.id)
        if (r1 !== r2) return r1 - r2
        // Within same family, prefer newer (higher date string)
        return b.id.localeCompare(a.id)
      })
      if (sorted.length > 0) {
        _cachedModel = sorted[0].id
        _cachedModelTs = Date.now()
        console.log('Resolved model:', _cachedModel)
        return _cachedModel
      }
    }
  } catch (e) {
    console.error('Model list fetch failed:', e.message)
  }
  // Hard fallback — try a sequence of known model IDs
  return 'claude-3-haiku-20240307'
}

import { checkRateLimit } from './_rateLimit.js'

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

async function _handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Require authenticated user — this endpoint calls paid AI
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (!token || !(await verifyToken(token))) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  // Rate limit: 20 parse requests per user per hour
  const { allowed } = checkRateLimit(req, 'parse-itinerary', { max: 20, windowMs: 3_600_000 })
  if (!allowed) return res.status(429).json({ error: 'Rate limit exceeded — try again in an hour' })

  const { content, type, filename } = req.body || {}

  if (!content || !type) {
    return res.status(400).json({ error: 'Missing content or type' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI not configured — add ANTHROPIC_API_KEY to Vercel environment variables' })
  }

  const model = await resolveModel(process.env.ANTHROPIC_API_KEY)

  let messages
  if (type === 'pdf') {
    messages = [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: content,
            },
          },
          {
            type: 'text',
            text: PROMPT,
          },
        ],
      },
    ]
  } else {
    messages = [
      {
        role: 'user',
        content: `${PROMPT}\n\n${content}`,
      },
    ]
  }

  let claudeText
  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages,
      }),
    })

    if (!claudeRes.ok) {
      let errMessage = `Claude API error ${claudeRes.status}`
      try {
        const errBody = await claudeRes.json()
        errMessage = errBody?.error?.message || errMessage
      } catch { /* ignore parse errors */ }
      console.error('Claude API error:', claudeRes.status, errMessage)
      return res.status(502).json({ error: errMessage })
    }

    const claudeData = await claudeRes.json()
    claudeText = claudeData?.content?.[0]?.text || ''
  } catch (e) {
    console.error('Fetch to Claude failed:', e)
    return res.status(500).json({ error: 'Failed to contact AI service. Please try again.' })
  }

  // Strip accidental markdown code fences
  const cleaned = claudeText.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim()

  // Extract the JSON array
  const match = cleaned.match(/\[[\s\S]*\]/)
  if (!match) {
    console.error('Could not find JSON array in Claude response:', claudeText)
    return res.status(422).json({ error: 'Could not parse itinerary. Please try pasting the text manually.' })
  }

  let trips
  try {
    trips = JSON.parse(match[0])
  } catch (e) {
    console.error('JSON parse error:', e, 'Raw:', match[0])
    return res.status(422).json({ error: 'Could not parse itinerary. Please try pasting the text manually.' })
  }

  if (!Array.isArray(trips)) {
    return res.status(422).json({ error: 'Could not parse itinerary. Please try pasting the text manually.' })
  }

  // Validate and enrich each trip
  const valid = trips.filter(t => t.arrival_city && t.depart_date)
  if (valid.length === 0) {
    return res.status(422).json({ error: 'Could not parse itinerary. Please try pasting the text manually.' })
  }

  const enriched = valid.map(trip => ({
    ...trip,
    risk_level: getRiskLevel(trip.arrival_city),
    status: computeStatus(trip.depart_date, trip.return_date),
  }))

  return res.status(200).json({ trips: enriched })
}

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default handler
