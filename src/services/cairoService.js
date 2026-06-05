/**
 * cairoService — shared access to all AI / CAIRO platform APIs.
 *
 * Wraps: ai-assistant, journey-agent, generate-briefing
 *
 * All CAIRO endpoints require a Supabase JWT. Pass the access_token from
 * supabase.auth.getSession() as the `token` parameter.
 *
 * Existing pages continue to call the APIs directly — this service is for
 * new consumers (GSOC, Projects) and future page migrations.
 */

const api   = (path) => `/api/${path}`
const auth  = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` })
const post  = (url, body, token) =>
  fetch(url, { method: 'POST', headers: auth(token), body: JSON.stringify(body) })

// ── AI Assistant (Dashboard / contextual chat) ────────────────────────────────

/**
 * Send a message to the AI assistant.
 * @param {string} message - User message
 * @param {string} token   - Supabase access_token
 * @param {object} [opts]
 * @param {Array}  [opts.history]  - Prior [{role,text}] turns
 * @param {object} [opts.context] - { country, city, tripName, travelerName, activeAlerts, mode }
 * @returns {Promise<{reply: string, model: string}>}
 */
export async function sendAssistantMessage(message, token, { history = [], context = {} } = {}) {
  const res = await post(api('ai-assistant'), { message, history, context }, token)
  if (!res.ok) throw new Error(`ai-assistant ${res.status}`)
  return res.json()
}

// ── Journey Agent / CAIRO ─────────────────────────────────────────────────────

/**
 * Send a message to the CAIRO journey agent.
 * Handles all phases: gathering_info → journey_ready → analysis_complete
 *
 * @param {string} message - User message
 * @param {string} token   - Supabase access_token
 * @param {object} [opts]
 * @param {Array}  [opts.history]    - Prior [{role,text}] turns
 * @param {object} [opts.journey]    - Current journey state (origin, destination, dates, etc.)
 * @param {object} [opts.orgContext] - { orgName, travelPolicy, approvedDestinations[], blockedDestinations[] }
 * @returns {Promise<{reply, phase, journey?, analysis?, assets?, model, elapsed?}>}
 */
export async function sendCairoMessage(message, token, { history = [], journey, orgContext } = {}) {
  const body = { message, history }
  if (journey)    body.journey    = journey
  if (orgContext) body.orgContext = orgContext
  const res = await post(api('journey-agent'), body, token)
  if (!res.ok) throw new Error(`journey-agent ${res.status}`)
  return res.json()
}

/**
 * Run a full CAIRO risk analysis for a complete journey definition.
 * Skips the conversational gathering phase — use when journey is already known.
 *
 * @param {object} journey  - { origin, destination, transitPoints[], departDate, returnDate,
 *                             travellerCount, purpose, accommodation, transportModes[], riskProfile }
 * @param {string} token
 * @param {object} [opts]
 * @param {object} [opts.orgContext]
 * @returns {Promise<{reply, phase: 'analysis_complete', analysis, assets, model, elapsed}>}
 */
export async function runCairoAnalysis(journey, token, { orgContext } = {}) {
  const body = { message: 'Analyse this journey', action: 'analyze', journey }
  if (orgContext) body.orgContext = orgContext
  const res = await post(api('journey-agent'), body, token)
  if (!res.ok) throw new Error(`journey-agent ${res.status}`)
  return res.json()
}

// ── Pre-Trip Briefing ─────────────────────────────────────────────────────────

/**
 * Generate a pre-trip briefing document for a trip.
 * Idempotent — returns existing briefing_id if already generated.
 *
 * @param {string} tripId - itineraries.id UUID
 * @param {string} token  - Supabase access_token
 * @returns {Promise<{ok: bool, briefing_id: string, ref: string, already_exists?: bool}>}
 */
export async function generateBriefing(tripId, token) {
  const res = await post(api('generate-briefing'), { trip_id: tripId }, token)
  if (!res.ok) throw new Error(`generate-briefing ${res.status}`)
  return res.json()
}
