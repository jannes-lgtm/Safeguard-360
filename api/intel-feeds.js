// Intel Feeds aggregator — returns status + sample data for all intel sources
// Admin-only endpoint — used by the Intel Feeds ops panel

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

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

  // Fetch WhatsApp incident stats from Supabase + ping external feeds in parallel
  const [
    incidentsResult,
    eskomRes,
    acledRes,
    sapsRes,
    policeRes,
    issRes,
    stateRes,
    fcdoRes,
  ] = await Promise.allSettled([
    // WhatsApp incidents from Supabase
    (async () => {
      const supabase = getSupabase()
      const { count: total } = await supabase
        .from('incidents')
        .select('*', { count: 'exact', head: true })

      const { count: pending } = await supabase
        .from('incidents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Pending Review')

      const { data: recent } = await supabase
        .from('incidents')
        .select('reported_by, message, source, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5)

      return { total: total || 0, pending: pending || 0, recent: recent || [] }
    })(),
    ping(`${baseUrl}/api/loadshedding`),
    ping(`${baseUrl}/api/acled?country=South+Africa&days=7&limit=3`),
    ping(`${baseUrl}/api/saps`),
    ping(`${baseUrl}/api/police-intel`),
    ping('https://issafrica.org/rss/iss-today', {}, 6000),
    ping('https://travel.state.gov/content/dam/traveladvisories/Feeds/TravelAdvisoryJSON.json', {}, 6000),
    ping('https://www.gov.uk/api/content/foreign-travel-advice/south-africa', { headers: { Accept: 'application/json' } }, 6000),
  ])

  const eskomKey = !!process.env.ESKOMSEPUSH_API_KEY
  const acledKey = !!process.env.ACLED_API_KEY && !!process.env.ACLED_EMAIL
  const twilioKey = !!process.env.TWILIO_ACCOUNT_SID

  function feedStatus(settled, hasKey = true) {
    if (!hasKey) return 'no_key'
    if (settled.status === 'rejected') return 'error'
    if (settled.value?.ok) return 'live'
    return 'error'
  }

  // WhatsApp incident stats
  const waData = incidentsResult.status === 'fulfilled' ? incidentsResult.value : null
  const waStatus = twilioKey && waData ? 'live' : twilioKey ? 'error' : 'no_key'

  const feeds = [
    {
      id: 'eskomsepush',
      name: 'EskomSePush',
      category: 'Load Shedding',
      description: 'Live Eskom load shedding stage and area schedules across South Africa.',
      geography: 'South Africa',
      updateFrequency: 'Real-time (15 min cache)',
      status: eskomKey ? feedStatus(eskomRes) : 'no_key',
      apiKeyEnv: 'ESKOMSEPUSH_API_KEY',
      sourceUrl: 'https://eskomsepush.gumroad.com/l/api',
      endpoint: '/api/loadshedding',
      configured: eskomKey,
    },
    {
      id: 'acled',
      name: 'ACLED',
      category: 'Armed Conflict',
      description: 'Armed Conflict Location & Event Data — GPS-tagged security incidents, protests, and violence across Africa.',
      geography: 'Africa-wide',
      updateFrequency: 'Daily',
      status: acledKey ? feedStatus(acledRes) : 'no_key',
      apiKeyEnv: 'ACLED_API_KEY + ACLED_EMAIL',
      sourceUrl: 'https://acleddata.com/register/',
      endpoint: '/api/acled',
      configured: acledKey,
    },
    {
      id: 'riley-risk',
      name: 'Riley Risk',
      category: 'Security Intelligence',
      description: 'South Africa-based travel security intelligence — local ground truth for SA and sub-Saharan Africa.',
      geography: 'South Africa + Sub-Saharan Africa',
      updateFrequency: 'Partnership required',
      status: 'partnership',
      apiKeyEnv: null,
      sourceUrl: 'https://www.rileyrisk.com',
      endpoint: 'Pending partnership',
      configured: false,
    },
  ]

  res.json({ feeds, timestamp: new Date().toISOString() })
}
