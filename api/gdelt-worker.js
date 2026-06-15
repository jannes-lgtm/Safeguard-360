/**
 * api/gdelt-worker.js
 *
 * QStash GDELT Worker — processes one country per invocation.
 *
 * Called by Upstash QStash (via the gdelt-ingestion queue, parallelism=1).
 * Only one instance runs at a time — true serialisation across all Vercel
 * function instances, solving the shared-IP rate-limiting problem.
 *
 * Signature verification:
 *   Every incoming request is verified against the Upstash-Signature header
 *   using QSTASH_CURRENT_SIGNING_KEY + QSTASH_NEXT_SIGNING_KEY.
 *   Unsigned requests are rejected with 401.
 *
 * Retry protocol:
 *   200 — success, QStash moves to next message
 *   400 — bad payload, QStash will NOT retry (permanent failure)
 *   429 — GDELT rate-limited, QStash retries with exponential back-off
 *   503 — transient error (network/timeout), QStash retries
 *
 * Body parser is disabled so we can read the raw request body required for
 * QStash HMAC signature verification.
 *
 * Required env vars:
 *   QSTASH_CURRENT_SIGNING_KEY  — from Upstash console
 *   QSTASH_NEXT_SIGNING_KEY     — from Upstash console (for key rotation)
 */

import { Receiver }                                from '@upstash/qstash'
import { fetchGdeltSignals, GDELT_RATE_LIMITED }   from './_gdelt.js'

// Disable Vercel's automatic body parsing — we need the raw bytes for signature verification.
export const config = { api: { bodyParser: false } }

const QSTASH_CURRENT_SIGNING_KEY = process.env.QSTASH_CURRENT_SIGNING_KEY || ''
const QSTASH_NEXT_SIGNING_KEY    = process.env.QSTASH_NEXT_SIGNING_KEY    || ''

const PER_COUNTRY_CAP = 25_000  // 25s per country — gives 5s more than the direct-fetch path

// ── Raw body helper ───────────────────────────────────────────────────────────
async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end',  ()    => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ── 1. Read raw body ───────────────────────────────────────────────────────
  let rawBody
  try {
    rawBody = await readRawBody(req)
  } catch (err) {
    console.error('[gdelt-worker] Failed to read request body:', err.message)
    return res.status(400).json({ error: 'Failed to read body' })
  }

  // ── 2. Verify QStash signature ─────────────────────────────────────────────
  if (QSTASH_CURRENT_SIGNING_KEY) {
    const receiver  = new Receiver({
      currentSigningKey: QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey:    QSTASH_NEXT_SIGNING_KEY,
    })
    const signature = req.headers['upstash-signature'] || ''

    try {
      const isValid = await receiver.verify({ signature, body: rawBody })
      if (!isValid) {
        console.warn('[gdelt-worker] QStash signature invalid — rejecting request')
        return res.status(401).json({ error: 'Invalid QStash signature' })
      }
    } catch (err) {
      console.error('[gdelt-worker] Signature verification error:', err.message)
      return res.status(401).json({ error: 'Signature verification failed' })
    }
  } else {
    // In local dev (no signing key), allow unsigned requests but log a warning
    console.warn('[gdelt-worker] QSTASH_CURRENT_SIGNING_KEY not set — skipping signature check (dev mode)')
  }

  // ── 3. Parse body ──────────────────────────────────────────────────────────
  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const { country } = body || {}
  if (!country || typeof country !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid country in payload' })
  }

  // ── 4. Fetch GDELT signals with per-country timeout ────────────────────────
  const ctrl     = new AbortController()
  const capTimer = setTimeout(() => ctrl.abort(), PER_COUNTRY_CAP)

  let signals
  try {
    signals = await fetchGdeltSignals(country, ctrl.signal)
  } catch (err) {
    clearTimeout(capTimer)
    console.error(`[gdelt-worker] Error fetching "${country}":`, err.message)
    // 503 → QStash retries with back-off
    return res.status(503).json({ error: err.message, country })
  } finally {
    clearTimeout(capTimer)
  }

  // ── 5. Handle rate-limit → 429 triggers QStash native retry ───────────────
  if (signals === GDELT_RATE_LIMITED) {
    console.warn(`[gdelt-worker] GDELT rate-limited on "${country}" — returning 429 for QStash retry`)
    return res.status(429).json({ error: 'GDELT rate limited', country })
  }

  // ── 6. No data / timeout — don't retry (won't help), return 200 ───────────
  if (!signals || signals.tempoScore === null) {
    console.log(`[gdelt-worker] No data for "${country}" — skipping (status: no_data)`)
    return res.status(200).json({ country, status: 'no_data' })
  }

  // ── 7. Success ─────────────────────────────────────────────────────────────
  console.log(`[gdelt-worker] ✓ ${country}: tempo=${signals.tempoScore} trend=${signals.trend} themes=[${(signals.themes || []).join(',')}]`)
  return res.status(200).json({
    country,
    tempoScore: signals.tempoScore,
    trend:      signals.trend,
    themes:     signals.themes,
    fetchedAt:  signals.fetchedAt,
    status:     'ok',
  })
}
