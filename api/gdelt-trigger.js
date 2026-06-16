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
 * Serialisation is handled entirely by parallelism=1 on the queue — no
 * per-message delay needed or supported with enqueue().
 *
 * Auth: x-cron-secret header checked against CRON_SECRET env var.
 * Worker URL derived from req.headers.host — no WORKER_BASE_URL env var needed.
 *
 * Required env vars:
 *   QSTASH_TOKEN  — Upstash QStash publish token
 *   CRON_SECRET   — shared secret for cron auth
 */

import { Client } from '@upstash/qstash'
import { adapt }  from './_adapter.js'

const QSTASH_TOKEN = process.env.QSTASH_TOKEN || ''
const CRON_SECRET  = process.env.CRON_SECRET  || ''
const QUEUE_NAME   = 'gdelt-ingestion'

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
  'Botswana', 'Republic of Congo', 'Gabon',

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
  // ── Auth ──────────────────────────────────────────────────────────────────
  // Accept both x-cron-secret (manual curl) and Authorization: Bearer (Vercel cron auto-header)
  const incomingSecret = req.headers['x-cron-secret']
    || (req.headers['authorization'] || '').replace('Bearer ', '')
  if (CRON_SECRET && incomingSecret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!QSTASH_TOKEN) {
    return res.status(500).json({ error: 'QSTASH_TOKEN not configured' })
  }

  try {
    const client    = new Client({ token: QSTASH_TOKEN })
    const workerUrl = `https://${req.headers.host}/api/gdelt-worker`

    // ── Ensure queue exists with parallelism=1 (idempotent) ────────────────
    // upsert() is on the Queue instance — client.queues does not exist.
    await client.queue({ queueName: QUEUE_NAME }).upsert({ parallelism: 1 })

    // ── Publish all countries in parallel batches of 10 ──────────────────
    // No delay parameter — enqueue() does not support it.
    // Serialisation enforced by parallelism=1 on the queue.
    const CHUNK_SIZE = 10
    let totalQueued  = 0

    for (let i = 0; i < ALL_COUNTRIES.length; i += CHUNK_SIZE) {
      const chunk = ALL_COUNTRIES.slice(i, i + CHUNK_SIZE)

      await Promise.all(
        chunk.map(async (country) => {
          try {
            await client.queue({ queueName: QUEUE_NAME }).enqueueJSON({
              url:  workerUrl,
              body: { country },
            })
            totalQueued++
          } catch (err) {
            console.error(`[gdelt-trigger] Failed to queue ${country}:`, err.message)
          }
        })
      )
    }

    console.log(`[gdelt-trigger] Queued ${totalQueued}/${ALL_COUNTRIES.length} countries`)

    return res.status(200).json({
      status: 'success',
      queued: totalQueued,
      total:  ALL_COUNTRIES.length,
    })

  } catch (err) {
    console.error('[gdelt-trigger] Fatal error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export const handler = adapt(_handler)
export default handler
