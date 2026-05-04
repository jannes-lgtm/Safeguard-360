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
- departure_city: city they are departing FROM
- arrival_city: destination city they are travelling TO
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { content, type, filename } = req.body || {}

  if (!content || !type) {
    return res.status(400).json({ error: 'Missing content or type' })
  }

  // If no API key, return mock data so the UI works for testing
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({ trips: MOCK_TRIPS })
  }

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
        model: 'claude-3-5-haiku-latest',
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
