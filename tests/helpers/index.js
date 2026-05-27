/**
 * tests/helpers/index.js — Shared test utilities
 */

import { vi } from 'vitest'

// ── Timing ────────────────────────────────────────────────────────────────────

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// ── HTTP mock factories ───────────────────────────────────────────────────────

/**
 * Build a mock Express-style req object for handler tests.
 */
export function mockReq({ method = 'POST', body = {}, query = {}, headers = {} } = {}) {
  return {
    method,
    body,
    query,
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer test-jwt-token',
      ...headers,
    },
  }
}

/**
 * Build a mock Express-style res object that captures status + json calls.
 * Returns { res, getResponse } — call getResponse() after handler resolves.
 */
export function mockRes() {
  let _status = 200
  let _body   = null
  const _headers = {}

  const res = {
    headersSent: false,
    status(code)    { _status = code; return res },
    json(data)      { _body = data;   res.headersSent = true; return res },
    send(data)      { _body = data;   res.headersSent = true; return res },
    setHeader(k, v) { _headers[k] = v; return res },
    end()           { res.headersSent = true; return res },
    // Expose writeHead so the adapter recognises this as a Vercel response
    writeHead()     { return res },
  }

  return {
    res,
    getResponse: () => ({ status: _status, body: _body, headers: _headers }),
  }
}

/**
 * Run a raw handler function (not the adapted version) and return { status, body }.
 */
export async function callHandler(handlerFn, reqOpts = {}) {
  const { res, getResponse } = mockRes()
  const req = mockReq(reqOpts)
  await handlerFn(req, res)
  return getResponse()
}

// ── Fetch mock factories ──────────────────────────────────────────────────────

/**
 * Build a mock fetch response.
 */
export function mockFetchResponse({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    text:  async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json:  async () => (typeof body === 'string' ? JSON.parse(body) : body),
  }
}

/**
 * Stub global fetch with a URL-routing map.
 * routes: { [urlSubstring]: response | fn }
 * Default response returned when no route matches.
 */
export function stubFetch(routes = {}, defaultBody = {}) {
  const stub = vi.fn(async (url, opts) => {
    for (const [pattern, value] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return typeof value === 'function' ? value(url, opts) : mockFetchResponse(value)
      }
    }
    return mockFetchResponse({ body: defaultBody })
  })
  vi.stubGlobal('fetch', stub)
  return stub
}

// ── Claude API mock ───────────────────────────────────────────────────────────

/**
 * Mock the Anthropic Claude API to return a specific text response.
 * Patches global fetch for api.anthropic.com calls.
 */
export function mockClaudeText(text) {
  return mockFetchResponse({
    ok: true,
    status: 200,
    body: {
      content: [{ text }],
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  })
}

export function mockClaudeJSON(obj) {
  return mockClaudeText(JSON.stringify(obj))
}

export function mockClaudeError(status, message = 'error') {
  return mockFetchResponse({ ok: false, status, body: message })
}

// ── Journey fixtures ──────────────────────────────────────────────────────────

export const MOCK_JOURNEY = {
  origin:          'London',
  destination:     'Lagos',
  transitPoints:   [],
  departDate:      '2026-06-01',
  returnDate:      '2026-06-07',
  travellerCount:  2,
  purpose:         'Business',
  transportModes:  ['air'],
  accommodation:   'Hotel',
  riskProfile:     'elevated',
  complete:        true,
}

export const MOCK_CONTEXT = {
  formatted:          'Mock context block',
  intelObjects:       [],
  correlations:       [],
  memoryContext:      { dataAvailable: false, formatted: '' },
  realTimeConfidence: { score: 45, band: 'limited', components: {} },
  escalation:         { escalating: false, pattern: null },
  trafficContext:     { hasData: false, corridors: [] },
  countryRiskContext: { hasData: false },
  operationalState:   null,
  travelerContext:    null,
  orgContext:         null,
  dataAvailable:      false,
  feedsFailed:        false,
  totalArticles:      3,
  geoContexts:        ['Lagos'],
  stats: {
    live_signals: 3, corroboration_clusters: 1,
    memory_incidents: 2, memory_patterns: 1,
    confidence_score: 45, confidence_band: 'limited',
  },
}

export const MOCK_ANALYSIS = {
  overall_risk:       'High',
  overall_risk_score: 68,
  advisory_tier:      'escalate',
  advisory_tier_rationale: 'Elevated criminal opportunism',
  operator_notifications: [],
  destination_risk:   { level: 'High', score: 68, summary: 'Elevated risk environment', key_threats: [], advisory_context: '' },
  route_risks:        [],
  operational_exposure: { kidnap_risk: 'Medium', crime_risk: 'High', civil_unrest_risk: 'Low', terrorism_risk: 'Low', health_risk: 'Low', natural_disaster_risk: 'Low' },
  crime_environment:  { overall_crime_risk: 'High', armed_robbery_risk: 'High', vehicle_hijacking_risk: 'High', express_kidnapping_risk: 'Medium', opportunistic_theft_risk: 'High', checkpoint_corruption_risk: 'Medium', hostile_surveillance_indicators: 'Not identified', high_risk_zones: [], high_risk_timing: [], criminal_pattern_summary: '', movement_mitigations: [] },
  regional_instability: { summary: '', active_conflicts: [], spillover_risk: 'Low', political_situation: '' },
  infrastructure_concerns: [],
  pattern_analysis:   { matched_patterns: [], historical_precedents: [], active_precursors: [], pattern_confidence: 40, pattern_summary: '' },
  risk_trajectory:    { direction: 'baseline', acceleration: 'none', confidence: 40, basis: '', historical_comparison: '', projected_window: '' },
  confidence_assessment: { overall_confidence: 45, evidence_strength: 'limited', historical_correlation: 40, data_recency: 'recent', primary_evidence_sources: [], uncertainty_factors: [], analyst_note: '' },
  recommended_mitigations: [],
  alternate_routing:  { recommended: false, reason: '', alternatives: [], note: '' },
  safe_zones: [],
  operational_checklist: [],
  contingency_planning: [],
  monitoring_recommendations: [],
  summary: 'Test analysis summary',
  intel_sources_used: 3,
}
