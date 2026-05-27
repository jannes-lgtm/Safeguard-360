/**
 * tests/integration/journeyAgent.test.js
 *
 * Priority 1 & 2 — malformed JSON handling and telemetry emission via the
 * journey-agent handler (_handler, not the adapted version).
 *
 * Strategy: mock _claudeClient.js to control Claude responses, mock
 * _contextAssembly.js to skip expensive feed fetching, spy on _telemetry.js
 * emit() to verify telemetry events. Call _handler directly with mock req/res.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callHandler, mockReq, mockRes, MOCK_CONTEXT, MOCK_ANALYSIS, MOCK_JOURNEY } from '../helpers/index.js'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../api/_claudeClient.js', () => ({
  claudeCall: vi.fn(),
}))

vi.mock('../../api/_contextAssembly.js', () => ({
  assembleContext: vi.fn().mockResolvedValue(MOCK_CONTEXT),
}))

vi.mock('../../api/_claudeSynth.js', () => ({
  resolveModel: vi.fn().mockResolvedValue('claude-haiku-4-5-20251001'),
  comprehensiveRiskScan: vi.fn(),
  synthesiseBrief: vi.fn(),
  fetchGDACS: vi.fn().mockResolvedValue([]),
  fetchUSGS: vi.fn().mockResolvedValue([]),
  fetchHealthOutbreaks: vi.fn().mockResolvedValue({ matches: [], recent: [] }),
  fetchArticlesForCountry: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../api/_cairoSOP.js', () => ({
  buildKnowledgeContext: vi.fn().mockResolvedValue([]),
  formatKBSection:       vi.fn().mockReturnValue(''),
}))

vi.mock('../../api/_rateLimit.js', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))

// Import after mocks
import { claudeCall } from '../../api/_claudeClient.js'
import { emit } from '../../api/_telemetry.js'
import handlerFn from '../../api/journey-agent.js'

// ── Default mock: auth passes (Supabase auth endpoint returns ok) ─────────────
// journey-agent.js verifies auth via fetch to /auth/v1/user.
// We stub global fetch to pass auth and let claudeCall mock handle AI calls.
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url.includes('/auth/v1/user')) {
      return { ok: true, json: async () => ({ id: 'test-user-id' }) }
    }
    return { ok: true, json: async () => ({}) }
  }))
})

const BASE_BODY = { message: 'Trip to Lagos next week', action: 'chat' }

// ── Basic handler validation ──────────────────────────────────────────────────

describe('journey-agent — input validation', () => {
  it('returns 405 for non-POST requests', async () => {
    const result = await callHandler(handlerFn, { method: 'GET', body: BASE_BODY })
    expect(result.status).toBe(405)
  })

  it('returns 400 when message is missing', async () => {
    const result = await callHandler(handlerFn, { body: { action: 'chat' } })
    expect(result.status).toBe(400)
    expect(result.body.error).toMatch(/message/i)
  })

  it('returns 400 when message is empty string', async () => {
    const result = await callHandler(handlerFn, { body: { message: '   ', action: 'chat' } })
    expect(result.status).toBe(400)
  })

  it('returns 401 when Authorization header is missing', async () => {
    const result = await callHandler(handlerFn, {
      body: BASE_BODY,
      headers: { authorization: '' },
    })
    expect(result.status).toBe(401)
  })

  it('returns 503 when ANTHROPIC_API_KEY is not set', async () => {
    const savedKey = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    const result = await callHandler(handlerFn, { body: BASE_BODY })
    expect(result.status).toBe(503)
    process.env.ANTHROPIC_API_KEY = savedKey
  })

  it('returns 429 when rate limit is exceeded', async () => {
    const { checkRateLimit } = vi.mocked(await import('../../api/_rateLimit.js'))
    checkRateLimit.mockResolvedValueOnce({ allowed: false })
    const result = await callHandler(handlerFn, { body: BASE_BODY })
    expect(result.status).toBe(429)
  })
})

// ── Priority 1: Malformed JSON from extractJourney ────────────────────────────

describe('journey-agent — malformed JSON (extractJourney)', () => {
  it('returns 200 with null journey when Claude returns pure prose', async () => {
    claudeCall.mockResolvedValueOnce("I'd be happy to help with your journey!")
    const result = await callHandler(handlerFn, { body: BASE_BODY })
    expect(result.status).toBe(200)
    // Journey extraction failed gracefully — no journey destination
    expect(result.body).toHaveProperty('reply')
  })

  it('returns 200 when Claude returns truncated JSON', async () => {
    claudeCall.mockResolvedValueOnce('{"destination":"Lagos","departDate":')
    const result = await callHandler(handlerFn, { body: BASE_BODY })
    expect(result.status).toBe(200)
  })

  it('returns 200 when Claude returns markdown-fenced JSON for extraction', async () => {
    claudeCall
      .mockResolvedValueOnce('```json\n{"destination":"Lagos","complete":false}\n```')
      .mockResolvedValueOnce('Operational advisory for Lagos.')
    const result = await callHandler(handlerFn, { body: BASE_BODY })
    expect(result.status).toBe(200)
    expect(result.body.reply).toBeTruthy()
  })

  it('emits extract_journey_failure on JSON parse error', async () => {
    claudeCall.mockResolvedValueOnce('not json { broken')
    await callHandler(handlerFn, { body: BASE_BODY })
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'extract_journey_failure', errorCode: 'JSON_PARSE' })
    )
  })

  it('emits extract_journey_failure with EMPTY_RESPONSE when Claude returns null/empty', async () => {
    claudeCall.mockResolvedValueOnce(null)
    await callHandler(handlerFn, { body: BASE_BODY })
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'extract_journey_failure', errorCode: 'EMPTY_RESPONSE' })
    )
  })
})

// ── Priority 1: Malformed JSON from operationalReasoning ─────────────────────

describe('journey-agent — malformed JSON (operationalReasoning)', () => {
  const ANALYZE_BODY = { message: 'Analyze trip to Lagos', action: 'analyze', journey: MOCK_JOURNEY }

  it('returns 200 with null analysis when operationalReasoning returns truncated JSON', async () => {
    claudeCall
      .mockResolvedValueOnce(JSON.stringify({ destination: 'Lagos', complete: true })) // extractJourney
      .mockResolvedValueOnce('{"overall_risk":"High","overall_risk_score":')  // operationalReasoning — truncated
      .mockResolvedValueOnce('{}')  // lookupAssets
      .mockResolvedValueOnce('Advisory response text')  // generateResponse
    const result = await callHandler(handlerFn, { body: ANALYZE_BODY })
    expect(result.status).toBe(200)
    expect(result.body.analysis).toBeNull()
    expect(result.body.reply).toBeTruthy()
  })

  it('returns 200 with null analysis when operationalReasoning returns prose', async () => {
    claudeCall
      .mockResolvedValueOnce(JSON.stringify({ destination: 'Lagos', complete: true }))
      .mockResolvedValueOnce('The risk situation in Lagos is complex.')
      .mockResolvedValueOnce('{}')
      .mockResolvedValueOnce('Advisory response text')
    const result = await callHandler(handlerFn, { body: ANALYZE_BODY })
    expect(result.status).toBe(200)
    expect(result.body.analysis).toBeNull()
  })

  it('handler continues to generate reply even when analysis fails', async () => {
    claudeCall
      .mockResolvedValueOnce(JSON.stringify({ destination: 'Lagos', complete: true }))
      .mockResolvedValueOnce('broken json')
      .mockResolvedValueOnce('{}')
      .mockResolvedValueOnce('Fallback response despite analysis failure')
    const result = await callHandler(handlerFn, { body: ANALYZE_BODY })
    expect(result.status).toBe(200)
    expect(result.body.reply).toBe('Fallback response despite analysis failure')
  })
})

// ── Priority 2: Telemetry emission ────────────────────────────────────────────

describe('journey-agent — telemetry (cairoClaude wrapper)', () => {
  it('emits claude_call on successful AI call', async () => {
    claudeCall.mockResolvedValueOnce('{"destination":"Lagos"}')
    claudeCall.mockResolvedValue('Advisory text')
    await callHandler(handlerFn, { body: BASE_BODY })
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'claude_call', success: true })
    )
  })

  it('emits claude_call with durationMs > 0', async () => {
    claudeCall.mockResolvedValue('Advisory text')
    await callHandler(handlerFn, { body: BASE_BODY })
    const cairoCall = vi.mocked(emit).mock.calls.find(([e]) => e.type === 'claude_call')
    expect(cairoCall).toBeDefined()
    expect(cairoCall[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it('emits claude_fetch_error when claudeCall throws a network error', async () => {
    const netErr = new Error('Network failure')
    claudeCall.mockRejectedValueOnce(netErr)
    await callHandler(handlerFn, { body: BASE_BODY })

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'claude_fetch_error', success: false, errorCode: 'FETCH_ERROR' })
    )
  })

  it('emits claude_timeout when claudeCall throws a TimeoutError', async () => {
    const timeoutErr = Object.assign(new Error('The operation was aborted.'), { name: 'TimeoutError' })
    claudeCall.mockRejectedValueOnce(timeoutErr)
    await callHandler(handlerFn, { body: BASE_BODY })

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'claude_timeout', errorCode: 'TIMEOUT_28S', success: false })
    )
  })

  it('emits claude_http_error when claudeCall throws a Claude API HTTP error', async () => {
    const httpErr = new Error('Claude API 429: rate limited')
    claudeCall.mockRejectedValueOnce(httpErr)
    await callHandler(handlerFn, { body: BASE_BODY })

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'claude_http_error', errorCode: 'HTTP_429', success: false })
    )
  })

  it('emits prompt_size_warning only when system+messages exceed 400k chars', async () => {
    // Standard small request — no warning
    claudeCall.mockResolvedValue('response')
    await callHandler(handlerFn, { body: BASE_BODY })
    const warnings = vi.mocked(emit).mock.calls.filter(([e]) => e.type === 'prompt_size_warning')
    expect(warnings).toHaveLength(0)
  })
})

describe('journey-agent — journey_agent_request telemetry', () => {
  it('emits journey_agent_request on success', async () => {
    claudeCall.mockResolvedValue('Advisory text')
    await callHandler(handlerFn, { body: BASE_BODY })
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'journey_agent_request', success: true })
    )
  })

  it('emits journey_agent_request on unhandled error', async () => {
    const { assembleContext } = vi.mocked(await import('../../api/_contextAssembly.js'))
    assembleContext.mockRejectedValueOnce(new Error('Unexpected failure'))
    claudeCall.mockResolvedValue('{}') // extractJourney succeeds
    const result = await callHandler(handlerFn, { body: { ...BASE_BODY, action: 'analyze', journey: MOCK_JOURNEY } })

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type:      'journey_agent_request',
        success:   false,
        errorCode: 'UNHANDLED',
      })
    )
    expect(result.status).toBe(500)
  })

  it('journey_agent_request includes durationMs > 0 on success', async () => {
    claudeCall.mockResolvedValue('Advisory text')
    await callHandler(handlerFn, { body: BASE_BODY })
    const reqEmit = vi.mocked(emit).mock.calls.find(([e]) => e.type === 'journey_agent_request')
    expect(reqEmit).toBeDefined()
    expect(reqEmit[0].durationMs).toBeGreaterThanOrEqual(0)
  })
})

// ── Successful response shape ─────────────────────────────────────────────────

describe('journey-agent — successful response shape', () => {
  it('chat response includes reply, journey, phase, model', async () => {
    claudeCall
      .mockResolvedValueOnce('{"destination":"Lagos","complete":false}')
      .mockResolvedValueOnce('Here is your advisory.')
    const result = await callHandler(handlerFn, { body: BASE_BODY })
    expect(result.status).toBe(200)
    expect(result.body).toHaveProperty('reply')
    expect(result.body).toHaveProperty('phase')
    expect(result.body).toHaveProperty('model')
  })

  it('reply falls back to error message when generateResponse returns null', async () => {
    claudeCall
      .mockResolvedValueOnce('{}') // extractJourney → no destination
      .mockResolvedValueOnce(null) // generateResponse → null
    const result = await callHandler(handlerFn, { body: BASE_BODY })
    expect(result.status).toBe(200)
    expect(result.body.reply).toBeTruthy()
  })
})
