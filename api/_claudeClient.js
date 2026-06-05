/**
 * Unified Anthropic Claude API client for Netlify Functions.
 * Replaces 5+ independent fetch implementations across API files.
 *
 * Usage:
 *   import { claudeCall } from './_claudeClient.js'
 *   const text = await claudeCall(apiKey, { system, messages, maxTokens: 1200 })
 */

import { MODELS, TIMEOUTS } from './_config.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Call the Claude API and return the response text.
 *
 * @param {string} apiKey - Anthropic API key
 * @param {object} opts
 * @param {string} [opts.system] - System prompt
 * @param {{ role: string, content: any }[]} opts.messages - Message array
 * @param {string} [opts.model] - Model ID (default: MODELS.fast)
 * @param {number} [opts.maxTokens=1200] - Max output tokens
 * @param {number} [opts.timeout] - AbortSignal timeout in ms (default: TIMEOUTS.standard)
 * @param {boolean} [opts.jsonMode=false] - Hint to Claude to return JSON (adds instruction to system)
 * @param {string[]} [opts.betaHeaders] - Anthropic beta header values (e.g. ['pdfs-2024-09-25'])
 * @returns {Promise<string>} - Response text content
 */
export async function claudeCall(apiKey, {
  system,
  messages,
  model       = MODELS.fast,
  maxTokens   = 1200,
  timeout     = TIMEOUTS.standard,
  jsonMode    = false,
  betaHeaders = [],
}) {
  const systemPrompt = jsonMode && system
    ? `${system}\n\nRespond with valid JSON only.`
    : jsonMode
    ? 'Respond with valid JSON only.'
    : system

  const headers = {
    'x-api-key':          apiKey,
    'anthropic-version':  ANTHROPIC_VERSION,
    'content-type':       'application/json',
  }
  if (betaHeaders.length > 0) {
    headers['anthropic-beta'] = betaHeaders.join(',')
  }

  const body = { model, max_tokens: maxTokens, messages }
  if (systemPrompt) body.system = systemPrompt

  const res = await fetch(ANTHROPIC_URL, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(timeout),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Claude API ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data?.content?.[0]?.text?.trim() ?? ''
}
