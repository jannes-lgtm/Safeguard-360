/**
 * api/_claudeSynth.js
 *
 * Shared Claude AI synthesis engine + live feed helpers.
 * Underscore prefix → Vercel does NOT expose this as an API route.
 * Imported by country-risk.js, trip-alert-scan.js, and ai-assistant.js.
 */

// ── Model resolution (module-level cache survives warm invocations) ────────────
let _cachedModel = null
let _cachedModelTs = 0

export async function resolveModel(apiKey) {
  if (_cachedModel && Date.now() - _cachedModelTs < 60 * 60 * 1000) {
    return _cachedModel
  }
  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(4000),
    })
    if (r.ok) {
      const { data } = await r.json()
      const sorted = (data || []).sort((a, b) => {
        const rank = id =>
          id.includes('haiku') ? 0 : id.includes('sonnet') ? 1 : 2
        const r1 = rank(a.id), r2 = rank(b.id)
        if (r1 !== r2) return r1 - r2
        return b.id.localeCompare(a.id)
      })
      if (sorted.length > 0) {
        _cachedModel = sorted[0].id
        _cachedModelTs = Date.now()
        console.log('[_claudeSynth] Resolved model:', _cachedModel)
        return _cachedModel
      }
    }
  } catch (e) {
    console.warn('[_claudeSynth] Model list failed:', e.message)
  }
  return 'claude-3-haiku-20240307'
}

// ── GDACS live disaster events ────────────────────────────────────────────────
export async function fetchGDACS(country) {
  try {
    const qs = new URLSearchParams({
      eventlist: 'EQ,TC,FL,VO,DR,WF',
      alertlevel: 'Green,Orange,Red',
      limit: '100',
    })
    const r = await fetch(
      `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?${qs}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!r?.ok) return []
    const data = await r.json()
    const q = country.toLowerCase()
    return (data?.features || []).filter(f => {
      const c = (f.properties?.country || '').toLowerCase()
      return c.includes(q) || q.includes(c.split(',')[0].trim())
    })
  } catch {
    return []
  }
}

// ── USGS M5+ earthquakes (last 7 days) ───────────────────────────────────────
export async function fetchUSGS(country) {
  try {
    const now  = new Date()
    const past = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const qs   = new URLSearchParams({
      format: 'geojson',
      starttime: past.toISOString().split('T')[0],
      endtime:   now.toISOString().split('T')[0],
      minmagnitude: '5.0',
      orderby: 'magnitude',
      limit: '50',
    })
    const r = await fetch(
      `https://earthquake.usgs.gov/fdsnws/event/1/query?${qs}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!r?.ok) return []
    const data = await r.json()
    const q = country.toLowerCase()
    return (data?.features || []).filter(f =>
      (f.properties?.place || '').toLowerCase().includes(q)
    )
  } catch {
    return []
  }
}

// ── Claude AI country security synthesis ─────────────────────────────────────
/**
 * Synthesise a structured travel security brief using Claude.
 *
 * @param {string}      country
 * @param {string|null} city         - Specific city within the country (optional)
 * @param {{ fcdo, gdacs, usgs, iss }} sources - Live feed data
 * @param {string}      apiKey
 * @returns {Promise<{summary, threat_level, key_risks, recommendations}|null>}
 */
export async function synthesiseBrief(country, city, sources, apiKey) {
  if (!apiKey) return null

  const { fcdo, gdacs = [], usgs = [], iss } = sources
  const location = city ? `${city}, ${country}` : country

  const fcdoLine = fcdo
    ? `UK FCDO Level ${fcdo.level}/4 — ${fcdo.message}`
    : 'UK FCDO: Advisory data unavailable'

  const gdacsText = gdacs.length
    ? gdacs.slice(0, 4).map(e =>
        `${e.properties?.eventname || e.properties?.eventtype || 'Event'} [${e.properties?.alertlevel || '?'}]`
      ).join('; ')
    : 'None'

  const usgsText = usgs.length
    ? usgs.slice(0, 4).map(e =>
        `M${(e.properties?.mag || 0).toFixed(1)} – ${e.properties?.place || '?'}`
      ).join('; ')
    : 'None in past 7 days'

  const issText = iss?.articles?.length
    ? iss.articles.slice(0, 3).map(a => a.title).join('; ')
    : 'No recent articles'

  const prompt = `You are a corporate travel security analyst briefing a risk manager.
Analyse live intelligence for ${location} and give a concise assessment.

Advisory: ${fcdoLine}
Active disasters (GDACS): ${gdacsText}
Earthquakes M5+ / 7d (USGS): ${usgsText}
Security news (ISS Africa): ${issText}

Respond ONLY with valid JSON, no markdown:
{"summary":"2-3 sentence executive situation summary","threat_level":"Low|Medium|High|Critical","key_risks":["specific risk 1","specific risk 2","specific risk 3"],"recommendations":["actionable rec 1","actionable rec 2"]}`

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
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[_claudeSynth] synthesis HTTP error:', res.status, err?.error?.message)
      return null
    }

    const data   = await res.json()
    const raw    = (data?.content?.[0]?.text || '').replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
    const match  = raw.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error('[_claudeSynth] no JSON in Claude response:', raw.slice(0, 200))
      return null
    }
    return JSON.parse(match[0])
  } catch (e) {
    console.error('[_claudeSynth] synthesis failed:', e.message)
    return null
  }
}

// ── Conversational AI assistant ───────────────────────────────────────────────
/**
 * Single-turn AI assistant response, with optional platform context injected.
 *
 * @param {string} userMessage
 * @param {{ country?, tripName?, travelerName?, activeAlerts?, role? }} context
 * @param {string} apiKey
 * @returns {Promise<string|null>}
 */
export async function askAssistant(userMessage, context = {}, apiKey) {
  if (!apiKey || !userMessage?.trim()) return null

  const today = new Date().toISOString().split('T')[0]
  const contextLines = [
    context.country      && `Destination: ${context.country}`,
    context.travelerName && `Traveler: ${context.travelerName}`,
    context.tripName     && `Trip: ${context.tripName}`,
    context.activeAlerts && `Active alerts: ${context.activeAlerts}`,
  ].filter(Boolean).join('\n')

  const system = `You are an expert travel security AI assistant embedded in SafeGuard360, a corporate travel risk management platform.
You help security managers, risk officers and travellers understand threats, make decisions and stay safe.
Be concise, factual and actionable. If you are uncertain about real-time conditions, say so and reference official sources (FCDO, US State Dept, ACLED).
Today: ${today}.${contextLines ? `\n\nCurrent context:\n${contextLines}` : ''}`

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
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) return null
    const data = await res.json()
    return data?.content?.[0]?.text?.trim() || null
  } catch (e) {
    console.error('[_claudeSynth] askAssistant failed:', e.message)
    return null
  }
}

// ── AI morning brief (admin dashboard) ───────────────────────────────────────
/**
 * Generate an admin morning briefing summarising all active situations.
 *
 * @param {{ trips: Array, alerts: Array, countries: string[] }} data
 * @param {string} apiKey
 * @returns {Promise<{headline, situations, priority_actions}|null>}
 */
export async function generateMorningBrief(data, apiKey) {
  if (!apiKey) return null

  const { trips = [], alerts = [], countries = [] } = data

  const tripLines = trips.slice(0, 8).map(t =>
    `• ${t.traveler_name || 'Traveller'} → ${t.arrival_city} (${t.depart_date}–${t.return_date || '?'}) [${t.risk_level || 'Unknown'} risk]`
  ).join('\n') || 'No active or upcoming trips.'

  const alertLines = alerts.slice(0, 6).map(a =>
    `• [${a.severity}] ${a.title} — ${a.country || ''}`
  ).join('\n') || 'No active alerts.'

  const countriesList = countries.length ? countries.join(', ') : 'None'

  const prompt = `You are a senior travel security analyst. Produce a concise morning briefing for a corporate security manager.

Active/upcoming trips:\n${tripLines}

Live alerts:\n${alertLines}

Countries of interest: ${countriesList}

Return ONLY valid JSON:
{"headline":"one-sentence overall situation assessment","situations":[{"country":"name","summary":"1-2 sentence situation","severity":"Low|Medium|High|Critical"}],"priority_actions":["action 1","action 2","action 3"]}`

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
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) return null
    const d   = await res.json()
    const raw = (d?.content?.[0]?.text || '').replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0])
  } catch (e) {
    console.error('[_claudeSynth] morningBrief failed:', e.message)
    return null
  }
}
