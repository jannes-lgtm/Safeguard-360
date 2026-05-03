// Intel Feeds aggregator — returns status + sample data for all intel sources
// Used by the Intel Feeds ops panel in the frontend

async function ping(url, options = {}, ms = 5000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    const r = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeout)
    return { ok: r.ok, status: r.status }
  } catch (e) {
    clearTimeout(timeout)
    return { ok: false, status: 0, error: e.name === 'AbortError' ? 'timeout' : e.message }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  // Check each feed in parallel
  const [eskomRes, acledRes, sapsRes, issRes, stateRes, fcdoRes] = await Promise.allSettled([
    // Eskom
    ping(`${baseUrl}/api/loadshedding`),
    // ACLED
    ping(`${baseUrl}/api/acled?country=South+Africa&days=7&limit=5`),
    // SAPS
    ping(`${baseUrl}/api/saps`),
    // ISS Africa RSS
    ping('https://issafrica.org/rss/iss-today', {}, 6000),
    // US State Dept
    ping('https://travel.state.gov/content/dam/traveladvisories/Feeds/TravelAdvisoryJSON.json', {}, 6000),
    // UK FCDO
    ping('https://www.gov.uk/api/content/foreign-travel-advice/south-africa', { headers: { Accept: 'application/json' } }, 6000),
  ])

  const eskomKey = !!process.env.ESKOMSEPUSH_API_KEY
  const acledKey = !!process.env.ACLED_API_KEY && !!process.env.ACLED_EMAIL

  function feedStatus(settled, hasKey = true) {
    if (!hasKey) return 'no_key'
    if (settled.status === 'rejected') return 'error'
    if (settled.value?.ok) return 'live'
    return 'error'
  }

  const feeds = [
    {
      id: 'eskomsepush',
      name: 'EskomSePush',
      category: 'Load Shedding',
      categoryColor: 'amber',
      description: 'Live Eskom load shedding stage and area schedules across South Africa.',
      geography: 'South Africa',
      updateFrequency: 'Real-time (15 min cache)',
      status: eskomKey ? feedStatus(eskomRes) : 'no_key',
      apiKeyEnv: 'ESKOMSEPUSH_API_KEY',
      sourceUrl: 'https://eskomsepush.gumroad.com/l/api',
      docsUrl: 'https://documenter.getpostman.com/view/1296288/UzQuNk3E',
      endpoint: '/api/loadshedding',
      configured: eskomKey,
    },
    {
      id: 'acled',
      name: 'ACLED',
      category: 'Armed Conflict',
      categoryColor: 'red',
      description: 'Armed Conflict Location & Event Data — GPS-tagged security incidents, protests, and violence events across Africa.',
      geography: 'Africa-wide',
      updateFrequency: 'Daily',
      status: acledKey ? feedStatus(acledRes) : 'no_key',
      apiKeyEnv: 'ACLED_API_KEY + ACLED_EMAIL',
      sourceUrl: 'https://acleddata.com/register/',
      docsUrl: 'https://acleddata.com/resources/acleddatanerd/',
      endpoint: '/api/acled',
      configured: acledKey,
    },
    {
      id: 'saps',
      name: 'SAPS Crime Stats',
      category: 'Crime Statistics',
      categoryColor: 'blue',
      description: 'South African Police Service quarterly crime statistics by station and category.',
      geography: 'South Africa',
      updateFrequency: 'Quarterly (SAPS release cycle)',
      status: feedStatus(sapsRes),
      apiKeyEnv: null,
      sourceUrl: 'https://www.saps.gov.za/services/crimestats.php',
      docsUrl: 'https://www.saps.gov.za/services/crimestats.php',
      endpoint: '/api/saps',
      configured: true,
    },
    {
      id: 'iss',
      name: 'ISS Africa',
      category: 'Security Intelligence',
      categoryColor: 'purple',
      description: 'Institute for Security Studies — African security analysis, country risk assessments and early warning reports.',
      geography: 'Africa-wide',
      updateFrequency: 'Daily articles via RSS',
      status: feedStatus(issRes),
      apiKeyEnv: null,
      sourceUrl: 'https://issafrica.org/iss-today',
      docsUrl: 'https://issafrica.org/rss/iss-today',
      endpoint: '/api/country-risk (integrated)',
      configured: true,
    },
    {
      id: 'state-dept',
      name: 'US State Dept',
      category: 'Country Risk',
      categoryColor: 'indigo',
      description: 'US State Department travel advisories — 4-level risk ratings for every country.',
      geography: 'Global',
      updateFrequency: 'As issued (1 hour cache)',
      status: feedStatus(stateRes),
      apiKeyEnv: null,
      sourceUrl: 'https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html',
      docsUrl: 'https://travel.state.gov/content/dam/traveladvisories/Feeds/TravelAdvisoryJSON.json',
      endpoint: '/api/country-risk (integrated)',
      configured: true,
    },
    {
      id: 'fcdo',
      name: 'UK FCDO',
      category: 'Country Risk',
      categoryColor: 'indigo',
      description: 'UK Foreign Commonwealth & Development Office travel advisories — 4-level risk ratings with detailed region breakdowns.',
      geography: 'Global',
      updateFrequency: 'As issued (1 hour cache)',
      status: feedStatus(fcdoRes),
      apiKeyEnv: null,
      sourceUrl: 'https://www.gov.uk/foreign-travel-advice',
      docsUrl: 'https://www.gov.uk/api/content/foreign-travel-advice',
      endpoint: '/api/country-risk (integrated)',
      configured: true,
    },
    {
      id: 'riley-risk',
      name: 'Riley Risk',
      category: 'Security Intelligence',
      categoryColor: 'purple',
      description: 'South Africa-based travel security intelligence — local ground truth for SA and sub-Saharan Africa.',
      geography: 'South Africa + Sub-Saharan Africa',
      updateFrequency: 'Partnership required',
      status: 'partnership',
      apiKeyEnv: null,
      sourceUrl: 'https://www.rileyrisk.com',
      docsUrl: null,
      endpoint: 'Pending partnership',
      configured: false,
    },
    {
      id: 'arc',
      name: 'Africa Risk Consulting',
      category: 'Security Intelligence',
      categoryColor: 'purple',
      description: 'Premium Africa-focused risk intelligence — country briefs, incident reports, and evacuation support.',
      geography: 'Africa-wide',
      updateFrequency: 'Partnership required',
      status: 'partnership',
      apiKeyEnv: null,
      sourceUrl: 'https://www.africariskconsulting.com',
      docsUrl: null,
      endpoint: 'Pending partnership',
      configured: false,
    },
  ]

  res.json({ feeds, timestamp: new Date().toISOString() })
}
