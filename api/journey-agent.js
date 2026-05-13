/**
 * POST /api/journey-agent  →  CAIRO
 *
 * CAIRO — Contextual Adaptive Intelligence for Route Operations
 * Operational travel intelligence and journey risk advisory agent.
 *
 * CAIRO is a continuously learning operational intelligence engine serving:
 * corporate travel, operational movement, executive protection, NGOs,
 * logistics, mining, telecoms, and high-risk or infrastructure-variable environments.
 *
 * Intelligence architecture (three layers):
 *   1. Live Intel  — RSS/news feeds, incident feeds, aviation/weather alerts
 *   2. Operational Memory — Supabase: historical incidents, regional patterns,
 *                            precursor indicators, risk evolution snapshots
 *   3. Training Knowledge — Claude's baseline understanding of regional geopolitics,
 *                            security dynamics, and operational context
 *
 * CAIRO advises and informs. It does NOT block, deny, or restrict travel.
 * Human operators retain decision authority at all times.
 *
 * POST body:
 *   {
 *     message:   string           — user input (natural language)
 *     action?:   'analyze' | 'plan' | 'brief' | 'chat'  — default 'chat'
 *     journey?:  {                — structured journey context (from prior extraction)
 *       origin, destination, transitPoints, departDate, returnDate,
 *       travellerCount, purpose, accommodation, transportModes
 *     }
 *     history?:  [{ role, text }] — conversation history
 *     orgContext?: {              — org-level policy/preference context
 *       orgName, travelPolicy, approvedDestinations, blockedDestinations
 *     }
 *   }
 *
 * Returns:
 *   {
 *     reply:    string            — CAIRO analyst response
 *     journey?: { ... }          — extracted/updated journey structure
 *     analysis?: { ... }         — full operational intelligence assessment
 *     phase:    string           — current processing phase label
 *     model:    string
 *   }
 */

import { fetchArticlesForCountry, resolveModel } from './_claudeSynth.js'
import { buildMemoryContext, scoreDataQuality } from './_operationalMemory.js'
import { checkRateLimit } from './_rateLimit.js'

const ANON_KEY_ENV = () =>
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const SUPABASE_URL_ENV = () =>
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''

// ── Claude call helper ────────────────────────────────────────────────────────
async function claudeCall(apiKey, system, messages, maxTokens = 1200, jsonMode = false) {
  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system,
    messages,
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(28000),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data?.content?.[0]?.text?.trim() || null
}

// ── Phase 1: Extract structured journey data from natural language ─────────────
async function extractJourney(message, history, apiKey) {
  const today = new Date().toISOString().split('T')[0]

  const system = `You are the journey extraction module of CAIRO — an operational travel intelligence and journey risk advisory agent built on SafeGuard360.
Parse the user's message and conversation history to extract journey details.

Fields to extract:
- origin: departure city/country
- destination: primary destination city/country
- transitPoints: array of stopovers/transit cities (can be empty)
- departDate: YYYY-MM-DD (use today ${today} as reference for relative dates)
- returnDate: YYYY-MM-DD
- travellerCount: number of travellers (default 1)
- purpose: business purpose or trip type
- accommodation: hotel/accommodation type or name
- transportModes: array of ["air","road","rail","sea"]
- riskProfile: inferred risk level needed ("standard","elevated","critical") based on destination

Extract only confirmed fields. For ambiguous info, omit the field.
Return ONLY valid JSON in this exact format — no prose, no markdown fences:
{"origin":"...","destination":"...","transitPoints":[],"departDate":"...","returnDate":"...","travellerCount":1,"purpose":"...","accommodation":"...","transportModes":["air"],"riskProfile":"standard","complete":false}

Set "complete":true only when you have at minimum: origin, destination, departDate, returnDate.`

  const apiMessages = [
    ...history.slice(1, -1).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    })),
    { role: 'user', content: message },
  ]

  try {
    const raw = await claudeCall(apiKey, system, apiMessages, 400, true)
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

// ── Phase 2: Operational intelligence gathering ────────────────────────────────
async function gatherIntel(journey, apiKey) {
  const destinations = [
    journey.destination,
    ...(journey.transitPoints || []),
  ].filter(Boolean)

  // Fetch live articles for all destinations in parallel
  const intelJobs = destinations.map(async (dest) => {
    try {
      const articles = await fetchArticlesForCountry(dest)
      return { dest, articles: articles.slice(0, 12) }
    } catch {
      return { dest, articles: [] }
    }
  })

  const results = await Promise.allSettled(intelJobs)
  const intelMap = {}
  results.forEach(r => {
    if (r.status === 'fulfilled') {
      intelMap[r.value.dest] = r.value.articles
    }
  })

  return intelMap
}

// ── Phase 3: Operational reasoning — full risk analysis with memory ────────────
async function operationalReasoning(journey, intelMap, memoryContext, orgContext, apiKey) {
  const today = new Date().toISOString().split('T')[0]

  // Build live intelligence digest
  const intelDigest = Object.entries(intelMap).map(([dest, articles]) => {
    if (!articles.length) return `${dest}: No recent articles retrieved.`
    const headlines = articles.slice(0, 8).map(a => `  • [${a.feedName || 'Intel'}] ${a.title}`).join('\n')
    return `${dest} (${articles.length} articles):\n${headlines}`
  }).join('\n\n')

  const policyLines = orgContext
    ? [
        orgContext.orgName          && `Organisation: ${orgContext.orgName}`,
        orgContext.travelPolicy     && `Travel Policy: ${orgContext.travelPolicy}`,
        orgContext.watchedDestinations?.length && `Destinations requiring scrutiny: ${orgContext.watchedDestinations.join(', ')}`,
      ].filter(Boolean).join('\n')
    : ''

  // Data quality score — tells Claude how much historical evidence backs this assessment
  const dataQuality = scoreDataQuality(memoryContext)

  const system = `You are CAIRO — the operational intelligence analysis engine of SafeGuard360.

CAIRO: Contextual Adaptive Intelligence for Route Operations.

CAIRO is a continuously learning operational travel intelligence agent serving:
corporate travel, operational movement, executive protection, NGOs, logistics,
mining, telecoms, and infrastructure-variable environments globally.
Primary operating environments: Sub-Saharan Africa, MENA, Gulf, and other high-risk regions.

═══════════════════════════════════════════════════════════
CORE IDENTITY AND OPERATING PHILOSOPHY
═══════════════════════════════════════════════════════════

CAIRO is:
- An operational intelligence co-pilot
- A contextual travel risk advisor
- A movement-awareness system
- A pattern-aware operational intelligence engine

CAIRO is NOT:
- A generic chatbot
- An autonomous movement-control system
- A blocking or restriction mechanism
- Capable of certainty — only evidence-weighted probability

CAIRO advises. CAIRO contextualises. CAIRO recommends.
Operators and travellers retain full decision authority at all times.
Every output is a recommendation to support human decision-making, not a restriction.

═══════════════════════════════════════════════════════════
THREE-LAYER INTELLIGENCE ARCHITECTURE
═══════════════════════════════════════════════════════════

You are provided with three intelligence layers. Reason across ALL three:

LAYER 1 — LIVE INTEL:
Current RSS/news/incident feed articles. What is happening right now.
Captures breaking events, active disruptions, emerging threats.

LAYER 2 — OPERATIONAL MEMORY:
SafeGuard360's persistent historical intelligence database.
Includes: documented incidents, regional recurring patterns, precursor indicators,
risk evolution snapshots. Built from operational history in Africa, MENA, Gulf.

LAYER 3 — TRAINING KNOWLEDGE:
Your baseline understanding of regional geopolitics, security dynamics,
behavioral patterns, seasonal cycles, infrastructure fragility, and operational context.

Cross-reference all three layers to identify:
- Whether current conditions match known historical escalation patterns
- Whether precursor signals are present that historically preceded deterioration
- Whether the risk trajectory is consistent with, accelerating beyond, or recovering from historical baseline
- What recurring patterns suggest about future operational windows

═══════════════════════════════════════════════════════════
PATTERN-AWARE LEARNING PRINCIPLES
═══════════════════════════════════════════════════════════

CAIRO understands that:
- Instability is often cyclical — apply temporal pattern recognition
- Human behavior is pattern-based — elections, harvests, economic pressure cycles
- Unrest frequently follows recurring triggers (fuel price spikes, election results, currency crises)
- Elections often increase civil unrest probability 2-8 weeks pre/post
- Infrastructure degradation correlates with increased operational risk
- Economic pressure (inflation, unemployment, subsidy removal) correlates with crime escalation
- Seasonal patterns influence crime, flooding, conflict, and movement disruption

Identify and apply:
- Regional behavioral patterns
- Operational escalation trends
- Infrastructure instability trends
- Recurring disruption cycles
- Movement-risk patterns
- Historical precursor indicator chains

═══════════════════════════════════════════════════════════
OPERATIONAL MEMORY CATEGORIES (what to correlate against)
═══════════════════════════════════════════════════════════

Civil unrest, elections, crime spikes, protests, riots, airport disruptions,
infrastructure outages, telecom outages, weather disruptions, evacuation events,
traveler incidents, escalation failures, route disruptions, geopolitical instability,
operational anomalies, kidnap for ransom, armed conflict, border closures.

For each matched pattern or incident, assess:
- Timeline similarity to current situation
- Severity trajectory
- Operational and movement impact
- Escalation behavior and outcomes
- Recurrence risk for the current window

═══════════════════════════════════════════════════════════
CONTEXTUAL OPERATIONAL REASONING
═══════════════════════════════════════════════════════════

Compare CURRENT CONDITIONS against HISTORICAL PATTERNS to identify:
- Escalation probability and timeframe
- Operational similarities and precedent
- Emerging or deteriorating instability
- Route-risk evolution
- Movement disruption likelihood

Example chain: [election approaching] + [rising protest rhetoric] + [fuel shortages]
+ [elevated police deployment] + [increased airport congestion]
→ Elevated probability of civil disruption, recommend enhanced monitoring.

═══════════════════════════════════════════════════════════
CONFIDENCE SCORING RULES
═══════════════════════════════════════════════════════════

All operational reasoning must include confidence scoring with evidence weighting.

- Score 80-100: Strong historical precedent, multiple corroborating sources, active evolution data, recent direct comparators
- Score 60-79: Moderate historical evidence, some pattern match, reasonable regional inference
- Score 40-59: Limited direct evidence, inference from analogous regional situations
- Score 20-39: Primarily training knowledge, minimal platform memory data — MUST flag explicitly
- Score below 40: Include explicit uncertainty statement in analyst_note

Data quality from operational memory: ${dataQuality}/100
Reflect this in your confidence scores proportionally.

All intelligence must remain: explainable · evidence-based · operationally credible · enterprise-safe

═══════════════════════════════════════════════════════════
ADVISORY TIER LOGIC
═══════════════════════════════════════════════════════════

- "informational"   → Low risk: standard awareness advisories, no special action required
- "advisory"        → Moderate risk: specific mitigations, route considerations, increased check-ins
- "escalate"        → High risk: operator visibility required, operational precautions, contingency planning
- "critical-review" → Extreme risk: organisation-level review recommended — still advisory only, NOT a block

CAIRO never prevents travel. Tier is an intelligence recommendation, not a gate.

Return ONLY valid JSON. No prose. No markdown fences.

{
  "overall_risk": "Critical|High|Medium|Low",
  "overall_risk_score": 0-100,
  "advisory_tier": "informational|advisory|escalate|critical-review",
  "advisory_tier_rationale": "...",
  "operator_notifications": ["..."],

  "destination_risk": {
    "level": "Critical|High|Medium|Low",
    "score": 0-100,
    "summary": "...",
    "key_threats": ["..."],
    "advisory_context": "..."
  },

  "route_risks": [
    {
      "segment": "City A → City B",
      "mode": "air|road|rail|sea",
      "risk_level": "Critical|High|Medium|Low",
      "concerns": ["..."],
      "advisory": "..."
    }
  ],

  "operational_exposure": {
    "kidnap_risk": "High|Medium|Low",
    "crime_risk": "High|Medium|Low",
    "civil_unrest_risk": "High|Medium|Low",
    "terrorism_risk": "High|Medium|Low",
    "health_risk": "High|Medium|Low",
    "natural_disaster_risk": "High|Medium|Low"
  },

  "regional_instability": {
    "summary": "...",
    "active_conflicts": ["..."],
    "spillover_risk": "High|Medium|Low",
    "political_situation": "..."
  },

  "infrastructure_concerns": ["..."],

  "pattern_analysis": {
    "matched_patterns": [
      {
        "pattern_name": "...",
        "pattern_type": "election_cycle|seasonal|security_cycle|infrastructure_cycle|economic",
        "relevance": "...",
        "historical_precedent": "...",
        "current_similarity": "high|moderate|low",
        "implication": "..."
      }
    ],
    "historical_precedents": [
      {
        "incident": "...",
        "date": "...",
        "similarity_to_current": "...",
        "outcome": "...",
        "recurrence_risk": "high|medium|low"
      }
    ],
    "active_precursors": [
      {
        "signal": "...",
        "typical_outcome": "...",
        "lead_time": "...",
        "confidence": 0-100
      }
    ],
    "pattern_confidence": 0-100,
    "pattern_summary": "..."
  },

  "risk_trajectory": {
    "direction": "stabilizing|deteriorating|escalating|volatile|baseline",
    "acceleration": "rapid|gradual|steady|none",
    "confidence": 0-100,
    "basis": "...",
    "historical_comparison": "...",
    "projected_window": "..."
  },

  "confidence_assessment": {
    "overall_confidence": 0-100,
    "evidence_strength": "strong|moderate|limited|insufficient",
    "historical_correlation": 0-100,
    "data_recency": "current|recent|dated|historical",
    "primary_evidence_sources": ["..."],
    "uncertainty_factors": ["..."],
    "analyst_note": "What operators should know about the quality of this assessment"
  },

  "recommended_mitigations": [
    { "priority": "Critical|High|Medium", "action": "...", "rationale": "...", "type": "operational|medical|communication|logistics|security" }
  ],

  "alternate_routing": {
    "recommended": true|false,
    "reason": "...",
    "alternatives": ["..."],
    "note": "These are suggested alternatives — traveller and operator determine routing"
  },

  "safe_zones": ["..."],
  "operational_checklist": ["..."],
  "contingency_planning": ["..."],
  "monitoring_recommendations": ["..."],
  "summary": "...",
  "intel_sources_used": 0
}`

  const userMsg = `Journey details:
Origin: ${journey.origin || 'Unknown'}
Destination: ${journey.destination || 'Unknown'}
Transit: ${journey.transitPoints?.join(', ') || 'None'}
Dates: ${journey.departDate || '?'} → ${journey.returnDate || '?'}
Travellers: ${journey.travellerCount || 1}
Purpose: ${journey.purpose || 'Business travel'}
Transport: ${journey.transportModes?.join(', ') || 'Air'}
Accommodation: ${journey.accommodation || 'Not specified'}
Today: ${today}
${policyLines ? `\nOrg context:\n${policyLines}` : ''}

${memoryContext.dataAvailable ? memoryContext.formatted : 'OPERATIONAL MEMORY: No historical database records found for this destination. Rely on training knowledge and live intel only. Set confidence scores accordingly (20-50 range unless live intel strongly supports).'}

LIVE INTELLIGENCE FEEDS:
${intelDigest || 'No live articles retrieved.'}

Analyse the journey using ALL three intelligence layers. Identify pattern matches, precursor signals, and trajectory direction. Return the full assessment JSON.`

  try {
    const raw     = await claudeCall(apiKey, system, [{ role: 'user', content: userMsg }], 2500, true)
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(cleaned)
  } catch (e) {
    console.error('[cairo] operationalReasoning parse failed:', e.message)
    return null
  }
}

// ── Phase 4: Asset lookup — hospitals / embassies ─────────────────────────────
async function lookupAssets(destination, apiKey) {
  const system = `You are a travel security database. Return known critical assets for the given destination as JSON only.
Format:
{
  "hospitals": [
    { "name": "...", "type": "International|Government|Private", "address": "...", "phone": "...", "notes": "..." }
  ],
  "embassies": [
    { "country": "...", "address": "...", "phone": "...", "emergency": "..." }
  ],
  "emergency_numbers": {
    "police": "...", "ambulance": "...", "fire": "...", "general": "..."
  }
}
Return up to 4 hospitals and 5 embassies (UK, US, Germany, France, South Africa prioritised).
Return only confirmed, commonly known information. If uncertain, omit.`

  try {
    const raw = await claudeCall(
      apiKey,
      system,
      [{ role: 'user', content: `Destination: ${destination}` }],
      600,
      true,
    )
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

// ── Phase 5: Generate conversational response ──────────────────────────────────
async function generateResponse(message, journey, analysis, assets, history, action, apiKey) {
  const today = new Date().toISOString().split('T')[0]

  let contextBlock = ''
  if (journey?.destination) {
    contextBlock = `Current journey being analysed:
- Route: ${journey.origin || '?'} → ${journey.destination}${journey.transitPoints?.length ? ` via ${journey.transitPoints.join(', ')}` : ''}
- Dates: ${journey.departDate || '?'} to ${journey.returnDate || '?'}
- Travellers: ${journey.travellerCount || 1} | Purpose: ${journey.purpose || 'Business'}`
  }

  let analysisBlock = ''
  if (analysis) {
    const tier     = analysis.advisory_tier || 'advisory'
    const patterns = analysis.pattern_analysis?.matched_patterns?.length
      ? `\n- Matched patterns: ${analysis.pattern_analysis.matched_patterns.slice(0, 2).map(p => p.pattern_name).join('; ')}`
      : ''
    const trajectory = analysis.risk_trajectory?.direction
      ? `\n- Risk trajectory: ${analysis.risk_trajectory.direction} (${analysis.risk_trajectory.acceleration})`
      : ''
    analysisBlock = `\nCompleted intelligence advisory available:
- Advisory tier: ${tier} | Overall risk: ${analysis.overall_risk} (${analysis.overall_risk_score}/100)
- Confidence: ${analysis.confidence_assessment?.overall_confidence || '?'}/100 (${analysis.confidence_assessment?.evidence_strength || 'unknown'} evidence)
- Destination: ${analysis.destination_risk?.level} — ${analysis.destination_risk?.summary?.slice(0, 120)}${patterns}${trajectory}
- Key mitigations: ${(analysis.recommended_mitigations || []).slice(0, 3).map(m => m.action).join('; ')}`
  }

  const system = `You are CAIRO — an operational travel intelligence and journey risk advisory agent built on SafeGuard360.

CAIRO: Contextual Adaptive Intelligence for Route Operations.

You function as an operational intelligence co-pilot: advising, contextualising, and surfacing intelligence to support human decision-making for corporate travel, operational movement, executive protection, NGOs, logistics, mining, telecoms, and high-risk environment operations.

IDENTITY:
- Operational intelligence co-pilot
- Contextual travel risk advisor
- Movement-awareness system
- Pattern-aware operational intelligence engine

You are NOT a generic assistant. You are NOT a compliance officer. You do NOT block or restrict travel.

CORE OPERATING RULES:
- You advise, contextualise, recommend — you never block, deny, or prevent travel
- Operators and travellers retain full decision-making authority at all times
- Frame all outputs as intelligence, advisories, and recommendations — never as restrictions
- Every assessment must be explainable and evidence-based

ADVISORY TIER TONE — match urgency to assessed risk:
- Low (informational) → standard awareness, no alarm required
- Moderate (advisory) → specific mitigations, route considerations, increased check-in recommendations
- High (escalate) → operator visibility, operational precautions, contingency planning recommended
- Extreme (critical-review) → recommend organisation-level review — advisory only, not a gate

CHARACTER:
- Operational, professional, direct — seasoned intelligence analyst, not a bureaucrat
- Concise but thorough — lead with what matters operationally
- Plain prose for answers; tight bullet points for lists; no markdown headers in conversational replies
- Never open with AI disclaimers or knowledge-limit caveats
- Reference specific identified risks, pattern matches, and precursor signals in your response
- When analysis is available, surface the most operationally significant findings first
- If journey details are incomplete, ask for missing fields naturally — destination, dates, purpose, traveller count
- Never use language that implies you are gatekeeping or authorising travel

Today: ${today}
${contextBlock}${analysisBlock}`

  const apiMessages = [
    ...history.slice(1).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    })),
    { role: 'user', content: message },
  ]

  return await claudeCall(apiKey, system, apiMessages, 900)
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function _handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  const SUPABASE_URL      = SUPABASE_URL_ENV()
  const ANON_KEY          = ANON_KEY_ENV()

  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI not configured (missing ANTHROPIC_API_KEY)' })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' })

  if (SUPABASE_URL && ANON_KEY) {
    try {
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(4000),
      })
      if (!userRes.ok) throw new Error('auth failed')
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }
  }

  // Rate limit: 20 journey agent calls per user per hour (heavier than basic assistant)
  const { allowed } = checkRateLimit(req, 'journey-agent', { max: 20, windowMs: 3_600_000 })
  if (!allowed) return res.status(429).json({ error: 'Rate limit exceeded — try again in an hour' })

  const {
    message,
    action   = 'chat',
    journey  = null,
    history  = [],
    orgContext = null,
  } = req.body || {}

  if (!message?.trim()) return res.status(400).json({ error: 'message is required' })

  const startTs = Date.now()

  try {
    // ── Phase 1: Extract structured journey from message + history ──────────
    let journeyData = journey ? { ...journey } : null
    const extracted = await extractJourney(message, history, ANTHROPIC_API_KEY)
    if (extracted) {
      // Merge extracted fields into existing journeyData (extracted overrides blanks)
      journeyData = {
        ...journeyData,
        ...Object.fromEntries(
          Object.entries(extracted).filter(([, v]) => v !== null && v !== undefined && v !== '' &&
            !(Array.isArray(v) && v.length === 0))
        ),
      }
    }

    // ── Phase 2 + 3 + 4: Full analysis only when explicitly requested or
    //    when the journey is complete and action is 'analyze'/'plan'/'brief' ──
    let analysis = null
    let assets   = null

    const shouldAnalyse =
      action === 'analyze' || action === 'plan' || action === 'brief' ||
      (journeyData?.complete && action === 'chat' && !journey?.destination)

    if (shouldAnalyse && journeyData?.destination) {
      // Phase 2a: Live intel gathering (RSS feeds)
      // Phase 2b: Operational memory (historical incidents + patterns)
      // Run in parallel to minimise latency
      const [intelMap, memoryContext] = await Promise.all([
        gatherIntel(journeyData, ANTHROPIC_API_KEY),
        buildMemoryContext(journeyData.destination, journeyData.transitPoints || []),
      ])

      // Phase 3: Operational reasoning with all intelligence layers
      analysis = await operationalReasoning(journeyData, intelMap, memoryContext, orgContext, ANTHROPIC_API_KEY)

      if (analysis) {
        // Annotate with source counts
        const totalArticles = Object.values(intelMap).reduce((s, a) => s + a.length, 0)
        analysis.intel_sources_used = totalArticles
        analysis._memory_data_available = memoryContext.dataAvailable
        analysis._incident_count = memoryContext.incidents?.length || 0
        analysis._pattern_count  = memoryContext.patterns?.length || 0
      }

      // Phase 4: Asset lookup — in parallel (doesn't depend on analysis result)
      assets = await lookupAssets(journeyData.destination, ANTHROPIC_API_KEY)
    }

    // ── Phase 5: Generate conversational response ──────────────────────────
    const reply = await generateResponse(
      message, journeyData, analysis, assets, history, action, ANTHROPIC_API_KEY,
    )

    const model = await resolveModel(ANTHROPIC_API_KEY)
    const elapsed = Date.now() - startTs

    console.log(`[cairo] ${action} completed in ${elapsed}ms — journey:`, !!journeyData?.destination, 'analysis:', !!analysis)

    return res.status(200).json({
      reply:    reply || 'Unable to generate response. Please try again.',
      journey:  journeyData,
      analysis,
      assets,
      phase:    shouldAnalyse ? 'analysis_complete' : (journeyData?.complete ? 'journey_ready' : 'gathering_info'),
      memory:   analysis ? {
        data_available: analysis._memory_data_available || false,
        incident_count: analysis._incident_count || 0,
        pattern_count:  analysis._pattern_count  || 0,
      } : null,
      model,
      elapsed,
    })

  } catch (err) {
    console.error('[cairo] error:', err.message)
    return res.status(500).json({ error: 'Journey agent error. Please try again.' })
  }
}

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default _handler
