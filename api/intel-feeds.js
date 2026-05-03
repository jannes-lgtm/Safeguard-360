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
    // ── Community Intelligence ──────────────────────────────────
    {
      id: 'whatsapp',
      name: 'WhatsApp Community Reports',
      category: 'Community Intelligence',
      categoryColor: 'green',
      description: 'Ground-truth incident reports submitted via WhatsApp by field contacts and travellers. Each report is reviewed and distributed to affected travellers.',
      geography: 'All regions (community-sourced)',
      updateFrequency: 'Real-time (inbound messages)',
      status: waStatus,
      apiKeyEnv: 'TWILIO_ACCOUNT_SID / AUTH_TOKEN',
      sourceUrl: null,
      docsUrl: null,
      endpoint: '/api/whatsapp-inbound',
      configured: twilioKey,
      stats: waData ? {
        total: waData.total,
        pending: waData.pending,
        recent: waData.recent.map(r => ({
          from: r.reported_by,
          message: r.message?.slice(0, 120),
          status: r.status,
          time: r.created_at,
        })),
      } : null,
    },

    // ── Load Shedding ───────────────────────────────────────────
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

    // ── Armed Conflict ──────────────────────────────────────────
    {
      id: 'acled',
      name: 'ACLED',
      category: 'Armed Conflict',
      categoryColor: 'red',
      description: 'Armed Conflict Location & Event Data — GPS-tagged security incidents, protests, and violence across Africa. Free for non-commercial use.',
      geography: 'Africa-wide',
      updateFrequency: 'Daily',
      status: acledKey ? feedStatus(acledRes) : 'no_key',
      apiKeyEnv: 'ACLED_API_KEY + ACLED_EMAIL',
      sourceUrl: 'https://acleddata.com/register/',
      docsUrl: 'https://acleddata.com/resources/acleddatanerd/',
      endpoint: '/api/acled',
      configured: acledKey,
    },

    // ── Crime Statistics ────────────────────────────────────────
    {
      id: 'police-intel',
      name: 'Police / Crime Registry',
      category: 'Crime Statistics',
      categoryColor: 'blue',
      description: 'Country-specific police agency data for 10 African nations. South Africa (SAPS), Kenya (NPS), Nigeria (NPF), Ghana, Tanzania, Zambia, Mozambique, Botswana, Zimbabwe, Uganda.',
      geography: 'SA + 9 African countries',
      updateFrequency: 'Quarterly to Annual (per country)',
      status: feedStatus(policeRes),
      apiKeyEnv: null,
      sourceUrl: 'https://www.saps.gov.za/services/crimestats.php',
      docsUrl: null,
      endpoint: '/api/police-intel?country=south+africa',
      configured: true,
    },

    // ── Security Intelligence ───────────────────────────────────
    {
      id: 'iss',
      name: 'ISS Africa',
      category: 'Security Intelligence',
      categoryColor: 'purple',
      description: 'Institute for Security Studies — African security analysis, early warning reports and country risk assessments via RSS.',
      geography: 'Africa-wide',
      updateFrequency: 'Daily articles (4 hr cache)',
      status: feedStatus(issRes),
      apiKeyEnv: null,
      sourceUrl: 'https://issafrica.org/iss-today',
      docsUrl: 'https://issafrica.org/rss/iss-today',
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
      description: 'Premium Africa-focused risk intelligence — country briefs, incident alerts and evacuation support.',
      geography: 'Africa-wide',
      updateFrequency: 'Partnership required',
      status: 'partnership',
      apiKeyEnv: null,
      sourceUrl: 'https://www.africariskconsulting.com',
      docsUrl: null,
      endpoint: 'Pending partnership',
      configured: false,
    },

    // ── Country Risk ────────────────────────────────────────────
    {
      id: 'state-dept',
      name: 'US State Dept',
      category: 'Country Risk',
      categoryColor: 'indigo',
      description: 'US State Department travel advisories — 4-level risk ratings for every country globally.',
      geography: 'Global',
      updateFrequency: 'As issued (1 hr cache)',
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
      description: 'UK Foreign Commonwealth & Development Office travel advisories — 4-level ratings with detailed region breakdowns.',
      geography: 'Global',
      updateFrequency: 'As issued (1 hr cache)',
      status: feedStatus(fcdoRes),
      apiKeyEnv: null,
      sourceUrl: 'https://www.gov.uk/foreign-travel-advice',
      docsUrl: 'https://www.gov.uk/api/content/foreign-travel-advice',
      endpoint: '/api/country-risk (integrated)',
      configured: true,
    },
  ]

  res.json({ feeds, timestamp: new Date().toISOString() })
}
