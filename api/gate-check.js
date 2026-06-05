/**
 * api/gate-check.js
 *
 * GET /api/gate-check
 *
 * Verifies the signed gate cookie issued by /api/gate-auth.
 * Returns { ok: true } if valid and unexpired, { ok: false } otherwise.
 */

import crypto from 'crypto'

const GATE_SECRET = process.env.APP_GATE_SECRET || ''
const COOKIE_NAME = 'sg360_gate'

function sign(payload) {
  return crypto
    .createHmac('sha256', GATE_SECRET)
    .update(payload)
    .digest('hex')
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map(c => {
      const [k, ...v] = c.trim().split('=')
      return [k?.trim(), v.join('=').trim()]
    })
  )
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()

  // Gate not configured — open access
  if (!GATE_SECRET || !process.env.APP_GATE_PASSWORD) {
    return res.status(200).json({ ok: true })
  }

  const cookies = parseCookies(req.headers?.cookie || '')
  const token   = cookies[COOKIE_NAME]

  if (!token) return res.status(200).json({ ok: false })

  const [payload, sig] = token.split('.')
  if (!payload || !sig) return res.status(200).json({ ok: false })

  // Verify signature
  const expected = sign(payload)
  const sigBuf   = Buffer.from(sig,      'hex')
  const expBuf   = Buffer.from(expected, 'hex')

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(200).json({ ok: false })
  }

  // Check expiry
  const expires = parseInt(payload, 10)
  if (isNaN(expires) || Date.now() > expires) {
    return res.status(200).json({ ok: false })
  }

  return res.status(200).json({ ok: true })
}
