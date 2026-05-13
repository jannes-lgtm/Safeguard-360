/**
 * /api/health-requirements
 * Returns vaccination and health risk requirements for a destination.
 *
 * Strategy (graceful degradation):
 *   1. Try AI (Claude) with live WHO/Africa CDC outbreak data  → freshest, destination-specific
 *   2. If AI fails or API key missing → use curated static database → always works
 *
 * POST body: { destination, country, depart_date }
 * Auth: Supabase JWT
 * Cache: 6h per destination
 */

import { fetchHealthOutbreaks, resolveModel } from './_claudeSynth.js'
import { adapt } from './_adapter.js'
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

// ── Static fallback database ──────────────────────────────────────────────────
// Curated, medically accurate baselines. AI result always takes precedence.
const STATIC_DB = {
  'democratic republic of the congo': {
    vaccinations: [
      { name: 'Yellow Fever', category: 'required', notes: 'Entry requirement — proof of vaccination mandatory for all travellers' },
      { name: 'Hepatitis A', category: 'recommended', notes: 'High risk via contaminated food and water' },
      { name: 'Typhoid', category: 'recommended', notes: 'Risk via food and water in DRC' },
      { name: 'Hepatitis B', category: 'recommended', notes: 'Recommended for stays over 4 weeks or with potential medical exposure' },
      { name: 'Cholera', category: 'recommended', notes: 'Active transmission, especially eastern provinces' },
      { name: 'Meningococcal', category: 'recommended', notes: 'Recommended for travel to eastern DRC and crowded settings' },
      { name: 'Rabies', category: 'consider', notes: 'Pre-exposure recommended for remote or rural travel' },
      { name: 'Mpox (Monkeypox)', category: 'consider', notes: 'Endemic in DRC — discuss with travel health provider' },
    ],
    health_risks: [
      { name: 'Malaria', severity: 'High', description: 'Malaria is endemic throughout the DRC including Kinshasa — year-round transmission.', prevention: 'Take prescription antimalarial medication; use DEET repellent and sleep under treated nets' },
      { name: 'Ebola (MVD)', severity: 'High', description: 'Periodic outbreaks in eastern DRC (North Kivu, South Kivu, Ituri). Monitor active alerts.', prevention: 'Avoid contact with sick individuals, bush meat, and animal carcasses' },
      { name: 'Cholera', severity: 'High', description: 'Endemic cholera with active outbreaks — particularly in displacement camps and Kivu provinces.', prevention: 'Drink only bottled or boiled water; avoid uncooked food from street vendors' },
      { name: 'Typhoid', severity: 'Medium', description: 'Risk via contaminated food and water throughout the country.', prevention: 'Get vaccinated; eat only thoroughly cooked food; drink bottled water' },
      { name: 'Yellow Fever', severity: 'High', description: 'Endemic risk — vaccination is required for entry and provides essential protection.', prevention: 'Ensure vaccination is current; use mosquito repellent during daytime hours' },
    ],
    general_advice: 'Medical facilities in Kinshasa and throughout the DRC are extremely limited — comprehensive travel health insurance including medical evacuation is essential. Carry a personal medical kit including sterile supplies. Avoid tap water entirely; use bottled water for drinking and brushing teeth.',
    sources: ['WHO', 'Africa CDC', 'CDC Travel Health'],
  },
  'kenya': {
    vaccinations: [
      { name: 'Yellow Fever', category: 'required', notes: 'Required if arriving from a yellow fever endemic country; recommended for travel outside Nairobi' },
      { name: 'Hepatitis A', category: 'recommended', notes: 'Risk via food and water' },
      { name: 'Typhoid', category: 'recommended', notes: 'Recommended for travel outside major hotels' },
      { name: 'Hepatitis B', category: 'recommended', notes: 'Recommended for stays over 4 weeks' },
      { name: 'Rabies', category: 'consider', notes: 'Recommended for wildlife areas and rural travel' },
      { name: 'Meningococcal', category: 'consider', notes: 'Consider for extended stays in rural northern Kenya' },
    ],
    health_risks: [
      { name: 'Malaria', severity: 'High', description: 'Malaria risk in coastal regions and at altitudes below 2,500m. Nairobi is generally low risk.', prevention: 'Take antimalarials for high-risk areas; use DEET and bed nets' },
      { name: 'Dengue Fever', severity: 'Medium', description: 'Dengue outbreaks reported in Mombasa and coastal areas, particularly during rainy season.', prevention: 'Use mosquito repellent day and night; wear long sleeves' },
      { name: 'Rift Valley Fever', severity: 'Medium', description: 'Periodic outbreaks following heavy rainfall, particularly in pastoralist areas.', prevention: 'Avoid contact with livestock and unpasteurised dairy products' },
    ],
    general_advice: 'Medical facilities in Nairobi (Nairobi Hospital, Aga Khan Hospital) are good by regional standards. Outside the capital, facilities are limited — carry comprehensive travel insurance with evacuation cover. Altitude sickness is a risk if trekking on Mount Kenya.',
    sources: ['WHO', 'CDC Travel Health', 'KEMSA'],
  },
  'nigeria': {
    vaccinations: [
      { name: 'Yellow Fever', category: 'required', notes: 'Entry requirement — vaccination certificate required for all travellers' },
      { name: 'Hepatitis A', category: 'recommended', notes: 'High risk via food and water' },
      { name: 'Typhoid', category: 'recommended', notes: 'Widespread risk, especially outside major hotels' },
      { name: 'Meningococcal', category: 'recommended', notes: 'Recommended, especially for northern Nigeria (meningitis belt)' },
      { name: 'Hepatitis B', category: 'recommended', notes: 'Recommended for all travellers' },
      { name: 'Rabies', category: 'consider', notes: 'Pre-exposure recommended for extended stays or rural travel' },
    ],
    health_risks: [
      { name: 'Malaria', severity: 'High', description: 'Malaria is endemic throughout Nigeria including Lagos — high risk year-round.', prevention: 'Take prescription antimalarials; use insect repellent and sleep under treated nets' },
      { name: 'Lassa Fever', severity: 'High', description: 'Endemic to Nigeria with annual outbreaks reported. Multi-state cases recorded regularly.', prevention: 'Avoid contact with rodents; do not consume food potentially contaminated by rats' },
      { name: 'Cholera', severity: 'Medium', description: 'Seasonal cholera outbreaks, particularly during rainy season in densely populated areas.', prevention: 'Drink only bottled or boiled water; avoid raw foods' },
    ],
    general_advice: 'Medical facilities in Lagos and Abuja are available but quality is variable — international medical evacuation cover is essential. Air quality in Lagos can be poor. Carry adequate supplies of any prescription medications as availability cannot be guaranteed.',
    sources: ['WHO', 'Africa CDC', 'NCDC Nigeria'],
  },
  'united arab emirates': {
    vaccinations: [
      { name: 'Routine vaccinations', category: 'recommended', notes: 'Ensure MMR, DTP, Varicella, and influenza are up to date' },
      { name: 'Hepatitis A', category: 'recommended', notes: 'Low risk in UAE but recommended as general travel precaution' },
      { name: 'Hepatitis B', category: 'recommended', notes: 'Recommended for extended stays or those with potential medical exposure' },
    ],
    health_risks: [
      { name: 'Extreme Heat', severity: 'High', description: 'Temperatures frequently exceed 45°C (113°F) in summer months (June–September). Heat stroke risk is significant.', prevention: 'Stay hydrated; avoid outdoor activity during peak hours (11am–4pm); carry water at all times' },
      { name: 'MERS-CoV', severity: 'Low', description: 'Middle East Respiratory Syndrome occasionally reported in the region — transmitted via camels.', prevention: 'Avoid contact with camels and camel products; maintain hand hygiene' },
      { name: 'Sand / Dust Storms', severity: 'Medium', description: 'Seasonal sandstorms (Shamal) can cause respiratory issues and significantly reduce visibility.', prevention: 'Monitor forecasts; carry an N95 mask; stay indoors during severe events' },
    ],
    general_advice: 'The UAE has excellent medical facilities in Dubai and Abu Dhabi. EU/UK standard private hospitals are widely available. Travel insurance is strongly recommended as private healthcare costs are high. MERS-CoV cases are rare but remain a regional consideration.',
    sources: ['WHO', 'UAE Ministry of Health'],
  },
  'south africa': {
    vaccinations: [
      { name: 'Yellow Fever', category: 'required', notes: 'Required only if arriving from a yellow fever endemic country' },
      { name: 'Hepatitis A', category: 'recommended', notes: 'Recommended for travel outside major cities' },
      { name: 'Typhoid', category: 'recommended', notes: 'Consider for rural areas and townships' },
      { name: 'Hepatitis B', category: 'recommended', notes: 'Recommended due to high prevalence in local population' },
      { name: 'Rabies', category: 'consider', notes: 'Consider for wildlife reserves and rural travel' },
    ],
    health_risks: [
      { name: 'Malaria', severity: 'High', description: 'Malaria risk in Limpopo, Mpumalanga (Kruger area), and KwaZulu-Natal (northern) — seasonal risk peaking Nov–May.', prevention: 'Take antimalarials for high-risk regions; use repellent and nets' },
      { name: 'Bilharzia (Schistosomiasis)', severity: 'Medium', description: 'Risk in freshwater lakes and slow-moving rivers, particularly in the north and east.', prevention: 'Avoid swimming or wading in fresh water; use only chlorinated pools' },
      { name: 'Crime & Trauma', severity: 'High', description: 'Johannesburg and Cape Town have high rates of violent crime — travellers should exercise significant caution.', prevention: 'Avoid walking alone at night; use registered taxis; secure valuables' },
    ],
    general_advice: 'South Africa has good private medical facilities in major cities (Johannesburg, Cape Town, Durban). Comprehensive medical insurance is essential. Blood supply safety can be a concern — carry a blood transfusion awareness card. Altitude in Johannesburg (1,750m) may affect those with cardiac conditions.',
    sources: ['WHO', 'CDC Travel Health', 'NICD South Africa'],
  },
  'india': {
    vaccinations: [
      { name: 'Hepatitis A', category: 'recommended', notes: 'High risk across India — essential for all travellers' },
      { name: 'Typhoid', category: 'recommended', notes: 'High risk — vaccination strongly recommended for all travellers' },
      { name: 'Japanese Encephalitis', category: 'recommended', notes: 'Recommended for travel to rural areas, particularly during monsoon season' },
      { name: 'Hepatitis B', category: 'recommended', notes: 'Recommended, especially for longer stays' },
      { name: 'Rabies', category: 'consider', notes: 'India has the highest rabies burden globally — pre-exposure recommended for extended trips' },
      { name: 'Cholera', category: 'consider', notes: 'Consider for high-risk areas and humanitarian workers' },
    ],
    health_risks: [
      { name: 'Malaria', severity: 'High', description: 'Malaria is present in rural areas, parts of Rajasthan, Odisha, and northeastern states.', prevention: 'Take antimalarials for high-risk areas; use DEET and bed nets' },
      { name: 'Dengue Fever', severity: 'High', description: 'Dengue outbreaks reported across urban and rural India, particularly post-monsoon (Jul–Nov).', prevention: 'Use mosquito repellent day and night; eliminate standing water near accommodation' },
      { name: 'Air Pollution', severity: 'High', description: 'Severe air pollution in Delhi, Mumbai, and northern India — particularly Oct–Feb. AQI regularly exceeds hazardous levels.', prevention: 'Use N95 masks outdoors; monitor AQI daily; avoid outdoor exercise on bad days' },
    ],
    general_advice: 'Drink only bottled or purified water — ice in drinks may also be unsafe. Delhi Belly (traveller\'s diarrhoea) is extremely common — carry oral rehydration salts. Private hospitals in major cities (Apollo, Fortis) are good quality; rural facilities are limited. Medical evacuation insurance is strongly recommended.',
    sources: ['WHO', 'CDC Travel Health', 'NVBDCP India'],
  },
  'thailand': {
    vaccinations: [
      { name: 'Hepatitis A', category: 'recommended', notes: 'Risk via food and water — essential for all travellers' },
      { name: 'Typhoid', category: 'recommended', notes: 'Recommended for travel outside resort hotels and major cities' },
      { name: 'Japanese Encephalitis', category: 'recommended', notes: 'Recommended for rural areas, stays over 4 weeks, or during rainy season' },
      { name: 'Hepatitis B', category: 'recommended', notes: 'Recommended for all travellers' },
      { name: 'Rabies', category: 'consider', notes: 'Dog and monkey bites are common — pre-exposure vaccination simplifies post-exposure management' },
    ],
    health_risks: [
      { name: 'Dengue Fever', severity: 'High', description: 'Dengue is widespread across Thailand, year-round, with higher incidence May–September.', prevention: 'Use DEET mosquito repellent at all times; wear long clothing at dawn and dusk' },
      { name: 'Malaria', severity: 'Low', description: 'Malaria risk mainly in forested border areas with Myanmar, Cambodia, Laos. Bangkok and major tourist areas are low risk.', prevention: 'Take antimalarials only for high-risk border areas; consult travel health provider' },
      { name: 'Zika Virus', severity: 'Low', description: 'Localised transmission reported — pregnant travellers or those planning pregnancy should seek specialist advice.', prevention: 'Use mosquito repellent; follow pregnancy-specific travel health advice' },
    ],
    general_advice: 'Thailand has excellent private hospitals in Bangkok (Bumrungrad, Bangkok Hospital) and Chiang Mai. Healthcare outside major cities is more limited. Food safety is generally good in established restaurants but street food hygiene varies. Road traffic accidents are a leading cause of traveller injury.',
    sources: ['WHO', 'CDC Travel Health', 'Thailand MoPH'],
  },
}

// Resolve country key from name variations
function resolveStaticKey(country) {
  const q = (country || '').toLowerCase().trim()
  if (q.includes('congo') || q.includes('drc')) return 'democratic republic of the congo'
  if (q.includes('kenya'))                       return 'kenya'
  if (q.includes('nigeria'))                     return 'nigeria'
  if (q.includes('arab emirates') || q.includes('uae') || q.includes('dubai')) return 'united arab emirates'
  if (q.includes('south africa'))                return 'south africa'
  if (q.includes('india'))                       return 'india'
  if (q.includes('thailand'))                    return 'thailand'
  return null
}

// Generic fallback for destinations not in the static DB
function genericFallback(destination) {
  return {
    vaccinations: [
      { name: 'Routine vaccinations', category: 'recommended', notes: 'Ensure MMR, DTP, and influenza are up to date before any international travel' },
      { name: 'Hepatitis A', category: 'recommended', notes: 'Recommended for most international destinations' },
      { name: 'Hepatitis B', category: 'consider', notes: 'Recommended for extended stays or those with potential medical exposure' },
      { name: 'Typhoid', category: 'consider', notes: 'Recommended if visiting areas with limited food safety standards' },
    ],
    health_risks: [
      { name: 'Traveller\'s Diarrhoea', severity: 'Medium', description: 'Risk from contaminated food or water at most international destinations.', prevention: 'Drink bottled water; avoid raw foods; carry oral rehydration salts' },
    ],
    general_advice: `Always consult a travel health clinic 4–6 weeks before departing to ${destination}. Carry comprehensive travel insurance including medical evacuation. Bring adequate supplies of any prescription medications.`,
    sources: ['WHO', 'CDC Travel Health'],
  }
}

// ── Cache ─────────────────────────────────────────────────────────────────────
const CACHE     = {}
const CACHE_TTL = 6 * 60 * 60 * 1000

async function fetchRequirements(destination, country, departDate, apiKey) {
  const cacheKey = `${(country || destination).toLowerCase()}:${departDate || 'any'}`
  const cached   = CACHE[cacheKey]
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  // ── Try AI first ────────────────────────────────────────────────────────────
  if (apiKey) {
    try {
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

      const model = await resolveModel(apiKey)
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(20000),
      })

      if (res.ok) {
        const data  = await res.json()
        const raw   = (data?.content?.[0]?.text || '').replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
        const match = raw.match(/\{[\s\S]*\}/)
        if (match) {
          const result = JSON.parse(match[0])
          CACHE[cacheKey] = { data: result, ts: Date.now() }
          return result
        }
      }
    } catch (e) {
      console.error('[health-requirements] AI call failed:', e.message)
    }
  }

  // ── Fallback: static curated database ───────────────────────────────────────
  const key    = resolveStaticKey(country || destination)
  const result = key ? STATIC_DB[key] : genericFallback(destination)
  CACHE[cacheKey] = { data: result, ts: Date.now() }
  return result
}

async function _handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  const valid  = await verifyToken(token)
  if (!valid) return res.status(401).json({ error: 'Unauthorized' })

  // Rate limit: 20 AI health checks per user per hour
  const { allowed } = checkRateLimit(req, 'health-requirements', { max: 20, windowMs: 3_600_000 })
  if (!allowed) return res.status(429).json({ error: 'Rate limit exceeded — try again in an hour' })

  const { destination, country, depart_date } = req.body || {}
  if (!destination && !country) return res.status(400).json({ error: 'destination required' })

  const apiKey       = process.env.ANTHROPIC_API_KEY || null  // null = skip AI, use static
  const resolvedCountry = country || destination
  const displayDest     = destination || country

  const result = await fetchRequirements(displayDest, resolvedCountry, depart_date, apiKey)
  return res.json(result)
}

export const handler = adapt(_handler)
export default handler
