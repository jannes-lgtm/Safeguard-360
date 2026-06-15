/**
 * api/gdelt-trigger.js
 *
 * QStash GDELT Trigger — replaces the 12 per-batch cron jobs.
 *
 * Runs once per hour (cron: "0 * * * *"). Publishes one QStash message per
 * country to the 'gdelt-ingestion' queue (parallelism=1), staggered by 6s.
 *
 * QStash enforces strict serialisation via parallelism=1 — only one country
 * is ever in-flight at a time, regardless of how many Vercel instances exist.
 * This eliminates the shared-IP rate-limiting problem with GDELT.
 *
 * If the worker returns 429 or 503, QStash retries with exponential back-off
 * automatically — no custom retry logic needed.
 *
 * Total delivery window: 60 countries × 6s stagger = 6 minutes. Well inside
 * the 30-minute GDELT cache TTL (results stay fresh for 30 min).
 *
 * Required env vars:
 *   QSTASH_TOKEN        — Upstash QStash publish token
 *   WORKER_BASE_URL     — e.g. https://www.risk360.co (no trailing slash)
 */

import { Client } from '@upstash/qstash'
import { adapt }  from './_adapter.js'

const QSTASH_TOKEN    = process.env.QSTASH_TOKEN    || ''
const WORKER_BASE_URL = process.env.WORKER_BASE_URL || 'https://www.risk360.co'
const QUEUE_NAME      = 'gdelt-ingestion'
const STAGGER_SECONDS = 6   // 6s between messages → 60 countries = 6 min total

// ── All 60 monitored countries — priority-ordered (high-risk first) ───────────
const ALL_COUNTRIES = [
  // Tier 1 — Critical & High-risk
  'Somalia', 'South Sudan', 'Sudan', 'Libya', 'Mali',
  'Niger', 'Burkina Faso', 'Central African Republic', 'Democratic Republic of Congo', 'Syria',
  'Yemen', 'Iraq', 'Afghanistan', 'Myanmar', 'Ukraine',
  'Russia', 'Iran', 'Nigeria', 'Pakistan', 'Ethiopia',
  'Haiti', 'Lebanon', 'Venezuela', 'Colombia', 'Egypt',
  'India', 'Turkey', 'Mexico', 'Israel', 'Bangladesh',
  // Tier 2 — Expanded regional coverage
  'Kenya', 'Mozambique', 'Cameroon', 'Chad', 'Zimbabwe',
  'Belarus', 'Azerbaijan', 'Philippines', 'Indonesia', 'Tunisia',
  'Saudi Arabia', 'North Korea', 'Serbia', 'Georgia', 'Brazil',
  'Argentina', 'Peru', 'Ecuador', 'Bolivia', 'Chile',
  'South Africa', 'Ghana', 'Senegal', 'Ivory Coast', 'Guinea',
  'Uganda', 'Tanzania', 'Rwanda', 'Angola', 'Zambia',
]

async function _handler(req, res) {
  if (!QSTASH_TOKEN) {
    return res.status(500).json({ error: 'QSTASH_TOKEN not configured' })
  }

  const client     = new Client({ token: QSTASH_TOKEN })
  const workerUrl  = `${WORKER_BASE_URL}/api/gdelt-worker`

  // ── Ensure queue exists with parallelism=1 (idempotent) ──────────────────
  try {
    await client.queues.upsert({ queueName: QUEUE_NAME, parallelism: 1 })
  } catch (err) {
    // Non-fatal — queue may already be configured correctly
    console.warn('[gdelt-trigger] Queue upsert warning:', err.message)
  }

  // ── Publish one message per country with staggered delay ──────────────────
  const queued  = []
  const errored = []

  for (let i = 0; i < ALL_COUNTRIES.length; i++) {
    const country  = ALL_COUNTRIES[i]
    const delaySec = i * STAGGER_SECONDS

    try {
      const result = await client.queue({ queueName: QUEUE_NAME }).enqueueJSON({
        url:     workerUrl,
        body:    { country },
        delay:   delaySec,
        retries: 3,
      })
      queued.push({ country, messageId: result.messageId, delaySec })
    } catch (err) {
      console.error(`[gdelt-trigger] Failed to queue ${country}:`, err.message)
      errored.push({ country, error: err.message })
    }
  }

  console.log(`[gdelt-trigger] Queued ${queued.length}/${ALL_COUNTRIES.length} countries. Errors: ${errored.length}`)

  return res.status(200).json({
    queued:  queued.length,
    total:   ALL_COUNTRIES.length,
    errored: errored.length,
    errors:  errored.length ? errored : undefined,
  })
}

export const handler = adapt(_handler)
export default handler
