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
 * Total delivery window: 102 countries × ~18s avg = ~31 minutes.
 * Cache TTL is 60 minutes — all countries stay fresh for every hourly run.
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
const STAGGER_SECONDS = 6   // 6s minimum gap between messages

// ── All 102 monitored countries — priority-ordered (highest risk first) ────────

const ALL_COUNTRIES = [
  // ── Tier 1: Critical conflict zones ─────────────────────────────────────────
  'Somalia', 'South Sudan', 'Sudan', 'Libya', 'Mali',
  'Niger', 'Burkina Faso', 'Central African Republic', 'Democratic Republic of Congo', 'Syria',
  'Yemen', 'Iraq', 'Afghanistan', 'Myanmar', 'Ukraine',
  'Russia', 'Iran', 'Nigeria', 'Pakistan', 'Ethiopia',
  'Haiti', 'Lebanon', 'Venezuela', 'Colombia', 'Egypt',
  'India', 'Turkey', 'Mexico', 'Israel', 'Bangladesh',

  // ── Tier 2: High-risk regional ────────────────────────────────────────────
  'Kenya', 'Mozambique', 'Cameroon', 'Chad', 'Zimbabwe',
  'Belarus', 'Azerbaijan', 'Philippines', 'Indonesia', 'Tunisia',
  'Saudi Arabia', 'North Korea', 'Serbia', 'Georgia', 'Brazil',
  'Argentina', 'Peru', 'Ecuador', 'Bolivia', 'Chile',
  'South Africa', 'Ghana', 'Senegal', 'Ivory Coast', 'Guinea',
  'Uganda', 'Tanzania', 'Rwanda', 'Angola', 'Zambia',

  // ── Africa: expanded coverage ─────────────────────────────────────────────
  'Morocco', 'Algeria', 'Mauritania', 'Eritrea', 'Djibouti',
  'Burundi', 'Malawi', 'Madagascar', 'Liberia', 'Sierra Leone',
  'Guinea-Bissau', 'Togo', 'Benin', 'Gambia', 'Namibia',
  'Botswana', 'Congo', 'Gabon',

  // ── Middle East: expanded coverage ────────────────────────────────────────
  'Jordan', 'United Arab Emirates', 'Palestine', 'Kuwait', 'Oman',
  'Qatar', 'Bahrain',

  // ── Central America ───────────────────────────────────────────────────────
  'Guatemala', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica',
  'Panama', 'Belize',

  // ── Caribbean ─────────────────────────────────────────────────────────────
  'Cuba', 'Dominican Republic', 'Jamaica', 'Trinidad and Tobago',
  'Bahamas', 'Barbados', 'Guyana', 'Suriname',

  // ── South America: remaining ──────────────────────────────────────────────
  'Paraguay', 'Uruguay',
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

  // ── Publish all countries in parallel batches of 10 ─────────────────────
  // Each batch fires 10 enqueueJSON() calls concurrently via Promise.all().
  // Batches are still sequential so we don't flood Upstash with 102 simultaneous
  // connections. At ~50-100ms per call, 10 parallel = ~100ms per batch,
  // 11 batches = ~1.1s total — well under the 60s maxDuration.
  const BATCH_SIZE = 10
  const queued     = []
  const errored    = []

  for (let b = 0; b < ALL_COUNTRIES.length; b += BATCH_SIZE) {
    const batch = ALL_COUNTRIES.slice(b, b + BATCH_SIZE)

    const results = await Promise.all(
      batch.map(async (country, localIdx) => {
        const globalIdx = b + localIdx
        const delaySec  = globalIdx * STAGGER_SECONDS
        try {
          const result = await client.queue({ queueName: QUEUE_NAME }).enqueueJSON({
            url:     workerUrl,
            body:    { country },
            delay:   delaySec,
            retries: 3,
          })
          return { ok: true, country, messageId: result.messageId, delaySec }
        } catch (err) {
          console.error(`[gdelt-trigger] Failed to queue ${country}:`, err.message)
          return { ok: false, country, error: err.message }
        }
      })
    )

    for (const r of results) {
      if (r.ok) queued.push({ country: r.country, messageId: r.messageId, delaySec: r.delaySec })
      else       errored.push({ country: r.country, error: r.error })
    }
  }

  console.log(`[gdelt-trigger] Queued ${queued.length}/${ALL_COUNTRIES.length} countries in ${Math.ceil(ALL_COUNTRIES.length / BATCH_SIZE)} batches. Errors: ${errored.length}`)

  return res.status(200).json({
    queued:  queued.length,
    total:   ALL_COUNTRIES.length,
    errored: errored.length,
    errors:  errored.length ? errored : undefined,
  })
}

export const handler = adapt(_handler)
export default handler
