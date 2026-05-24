/**
 * api/gate-auth.js
 *
 * POST /api/gate-auth
 * Body: { password: string }
 *
 * Validates the platform access password server-side.
 * On success, issues a signed httpOnly cookie valid for 7 days.
 * The password never touches the client bundle.
 *
 * Env vars required (server-side only — no VITE_ prefix):
 *   APP_GATE_PASSWORD  — the access password
 *   APP_GATE_SECRET    — random 32+ char string for HMAC signing
 */

import crypto from 'crypto'

const GATE_PASSWORD = process.env.APP_GATE_PASSWORD || ''
const GATE_SECRET   = process.env.APP_GATE_SECRET   || ''
const COOKIE_NAME   = 'sg360_gate'
const TTL_MS        = 7 * 24 * 60 * 60 * 1000  // 7 days

function sign(payload) {
  return crypto
    .createHmac('sha256', GATE_SECRET)
    .update(payload)
    .digest('hex')
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  if (!GATE_PASSWORD || !GATE_SECRET) {
    // Gate not configured — open access (dev mode)
    return res.status(200).json({ ok: true })
  }

  const { password } = req.body || {}

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ ok: false, error: 'Password required' })
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(GATE_PASSWORD)
  const received  = Buffer.from(password)
  const match = expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)

  if (!match) {
    return res.status(401).json({ ok: false, error: 'Invalid access code' })
  }

  // Issue signed token: "expires|signature"
  const expires = Date.now() + TTL_MS
  const payload  = `${expires}`
  const token    = `${payload}.${sign(payload)}`

  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${TTL_MS / 1000}`,
  ])

  return res.status(200).json({ ok: true })
}
