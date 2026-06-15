/**
 * api/gdelt-dlq.js
 *
 * Dead Letter Queue (DLQ) visibility for the gdelt-ingestion queue.
 *
 * A QStash message lands in the DLQ when it has exhausted all retries
 * (default: 3 attempts) without receiving a 2xx response from the worker.
 * This endpoint surfaces those failures so you can diagnose which countries
 * consistently fail GDELT ingestion and why.
 *
 * Usage:
 *   GET /api/gdelt-dlq               — list all failed countries
 *   GET /api/gdelt-dlq?retry=true    — re-queue all DLQ messages for retry
 *   GET /api/gdelt-dlq?clear=true    — delete all DLQ messages (after diagnosis)
 *
 * Auth: admin/developer only (CRON_SECRET header or internal Vercel cron).
 *
 * Required env vars:
 *   QSTASH_TOKEN  — Upstash QStash publish token
 *
 * ── Future alerting ──────────────────────────────────────────────────────────
 * To hook this into Slack/Discord/PagerDuty, call this endpoint from the
 * ops-analyze cron (already runs every 12h) and POST the summary to a webhook.
 * See the "Future alerting" section at the bottom of this file for a template.
 */

import { Client } from '@upstash/qstash'
import { adapt }  from './_adapter.js'

const QSTASH_TOKEN  = process.env.QSTASH_TOKEN  || ''
const CRON_SECRET   = process.env.CRON_SECRET   || ''
const QUEUE_NAME    = 'gdelt-ingestion'

// ── Auth guard ────────────────────────────────────────────────────────────────
function isAuthorized(req) {
  // Allow Vercel cron (internal) or requests with the CRON_SECRET header
  const cronHeader = req.headers?.['x-cron-secret'] || req.headers?.authorization?.replace('Bearer ', '')
  return !CRON_SECRET || cronHeader === CRON_SECRET
}

// ── Parse country from QStash message body ────────────────────────────────────
// QStash stores the body as a base64-encoded string or plain JSON.
function parseCountry(message) {
  try {
    let raw = message.body ?? ''
    // QStash may base64-encode the body
    if (raw && !raw.startsWith('{')) {
      raw = Buffer.from(raw, 'base64').toString('utf8')
    }
    const parsed = JSON.parse(raw)
    return parsed?.country ?? null
  } catch {
    return null
  }
}

// ── Format a single DLQ entry for the diagnostic report ──────────────────────
function formatEntry(msg) {
  const country       = parseCountry(msg)
  const failedAt      = msg.failedAt ? new Date(msg.failedAt).toISOString() : 'unknown'
  const lastStatus    = msg.responseStatus ?? 'unknown'
  const lastBody      = msg.responseBody   ? String(msg.responseBody).slice(0, 120) : 'no response'
  const attempts      = msg.maxRetries != null ? msg.maxRetries + 1 : 'unknown'

  return {
    dlqId:      msg.dlqId,
    messageId:  msg.messageId,
    country:    country ?? '(could not parse)',
    failedAt,
    lastStatus,
    lastBody,
    attempts,
  }
}

async function _handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!QSTASH_TOKEN) {
    return res.status(500).json({ error: 'QSTASH_TOKEN not configured' })
  }

  const client  = new Client({ token: QSTASH_TOKEN })
  const doRetry = req.query?.retry === 'true'
  const doClear = req.query?.clear === 'true'

  // ── 1. Fetch all DLQ messages for this queue ────────────────────────────────
  // Paginate if needed — QStash returns up to 100 per page.
  const allMessages = []
  let cursor

  do {
    const page = await client.dlq.listMessages({
      filter: { queueName: QUEUE_NAME },
      ...(cursor ? { cursor } : {}),
    })
    allMessages.push(...(page.messages ?? []))
    cursor = page.cursor
  } while (cursor)

  if (allMessages.length === 0) {
    return res.status(200).json({
      queue:    QUEUE_NAME,
      status:   'clean',
      failed:   0,
      message:  'No messages in DLQ — all countries are ingesting successfully.',
    })
  }

  // ── 2. Parse and format each failed message ─────────────────────────────────
  const entries  = allMessages.map(formatEntry)
  const countries = entries.map(e => e.country).filter(Boolean)

  // Group by last HTTP status for quick diagnosis
  const byStatus = {}
  for (const e of entries) {
    const key = String(e.lastStatus)
    byStatus[key] = (byStatus[key] || [])
    byStatus[key].push(e.country)
  }

  console.log(`[gdelt-dlq] ${allMessages.length} messages in DLQ for queue '${QUEUE_NAME}'`)
  console.log('[gdelt-dlq] Failed countries:', countries.join(', '))

  // ── 3. Optional: retry all DLQ messages ────────────────────────────────────
  let retryResult
  if (doRetry) {
    const dlqIds = allMessages.map(m => m.dlqId).filter(Boolean)
    if (dlqIds.length) {
      retryResult = await client.dlq.retry({ dlqIds })
      console.log(`[gdelt-dlq] Retried ${dlqIds.length} messages`)
    }
  }

  // ── 4. Optional: clear all DLQ messages ────────────────────────────────────
  let clearResult
  if (doClear && !doRetry) {
    const dlqIds = allMessages.map(m => m.dlqId).filter(Boolean)
    if (dlqIds.length) {
      clearResult = await client.dlq.delete({ dlqIds })
      console.log(`[gdelt-dlq] Cleared ${dlqIds.length} messages from DLQ`)
    }
  }

  // ── 5. Return diagnostic report ─────────────────────────────────────────────
  return res.status(200).json({
    queue:          QUEUE_NAME,
    status:         'failed_messages_found',
    failed:         allMessages.length,
    countries,
    breakdown_by_status: byStatus,
    entries,
    ...(retryResult !== undefined ? { retried: true, retryResult } : {}),
    ...(clearResult !== undefined ? { cleared: true, clearResult } : {}),
  })
}

export const handler = adapt(_handler)
export default handler

/*
 * ── Future alerting templates ─────────────────────────────────────────────────
 *
 * OPTION A — Slack webhook (add to ops-analyze.js or a daily cron):
 *
 *   const dlqRes = await fetch('https://www.risk360.co/api/gdelt-dlq', {
 *     headers: { 'x-cron-secret': process.env.CRON_SECRET }
 *   })
 *   const dlq = await dlqRes.json()
 *   if (dlq.failed > 0) {
 *     await fetch(process.env.SLACK_WEBHOOK_URL, {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({
 *         text: `⚠️ *GDELT DLQ Alert* — ${dlq.failed} countries failed all retries:\n${dlq.countries.join(', ')}`
 *       })
 *     })
 *   }
 *
 * OPTION B — Discord webhook (same pattern, different payload shape):
 *
 *   body: JSON.stringify({
 *     content: `⚠️ **GDELT DLQ** — ${dlq.failed} failed: ${dlq.countries.join(', ')}`
 *   })
 *
 * OPTION C — Add to vercel.json as a daily cron (silent unless failures exist):
 *
 *   { "path": "/api/gdelt-dlq", "schedule": "0 8 * * *" }
 *   — Runs at 08:00 UTC, logs failures to Vercel function logs.
 *   — Hook into your log drain (Datadog, Axiom, Sentry) for alerting.
 *
 * OPTION D — Manual on-demand queries:
 *
 *   Check:   curl https://www.risk360.co/api/gdelt-dlq -H "x-cron-secret: <secret>"
 *   Retry:   curl https://www.risk360.co/api/gdelt-dlq?retry=true -H "x-cron-secret: <secret>"
 *   Clear:   curl https://www.risk360.co/api/gdelt-dlq?clear=true -H "x-cron-secret: <secret>"
 */
