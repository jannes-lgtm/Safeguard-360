/**
 * /api/ai-assistant.js
 *
 * Conversational AI assistant endpoint for SafeGuard360.
 * Auth-gated — requires a valid Supabase JWT.
 *
 * POST body:
 *   {
 *     message:  string           — user's question
 *     context?: {                — optional platform context
 *       country?:       string,
 *       city?:          string,
 *       tripName?:      string,
 *       travelerName?:  string,
 *       activeAlerts?:  string,  — pre-formatted alert summary
 *       mode?:          'country' | 'trip' | 'dashboard' | 'general'
 *     }
 *   }
 *
 * Returns:
 *   { reply: string, model: string }
 */

import { askAssistant, resolveModel } from './_claudeSynth.js'

async function _handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  const SUPABASE_URL      = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const ANON_KEY          = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI assistant not configured (missing ANTHROPIC_API_KEY)' })
  }

  // ── Auth validation ────────────────────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' })
  }

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

  const { message, context = {} } = req.body || {}
  if (!message?.trim()) {
    return res.status(400).json({ error: 'message is required' })
  }

  const reply = await askAssistant(message, context, ANTHROPIC_API_KEY)
  if (!reply) {
    return res.status(502).json({ error: 'AI service temporarily unavailable. Please try again.' })
  }

  const model = await resolveModel(ANTHROPIC_API_KEY)
  return res.status(200).json({ reply, model })
}

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default handler
