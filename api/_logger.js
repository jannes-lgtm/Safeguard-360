/**
 * _logger.js
 * Structured JSON logger with per-request correlation IDs.
 *
 * Usage:
 *   import { createLogger } from './_logger.js'
 *
 *   async function _handler(req, res) {
 *     const log = createLogger(req, 'my-endpoint')
 *     log.info('starting', { trip_id })
 *     // ... work ...
 *     log.info('done', { sent: 3 })
 *     log.error('something broke', err)
 *   }
 *
 * Output (each line is a valid JSON object):
 *   {"ts":"2026-05-13T09:00:00.000Z","reqId":"a3f8b2","endpoint":"my-endpoint","level":"info","msg":"starting","trip_id":"uuid"}
 *
 * Vercel surfaces stdout as structured logs in the dashboard.
 * The reqId can be correlated across log lines for a single request.
 */

import crypto from 'crypto'

function reqId(req) {
  // Reuse if Vercel or a proxy already set one
  return (
    req?.headers?.['x-request-id'] ||
    req?.headers?.['x-vercel-id'] ||
    crypto.randomBytes(4).toString('hex')
  )
}

/**
 * @param {object}  req       — Express/Vercel request object
 * @param {string}  endpoint  — short endpoint name e.g. 'scan-all'
 * @returns {{ info, warn, error, time }}
 */
export function createLogger(req, endpoint) {
  const id = reqId(req)
  const t0 = Date.now()

  function emit(level, msg, meta = {}) {
    const entry = {
      ts:       new Date().toISOString(),
      reqId:    id,
      endpoint,
      level,
      msg,
      ...flatten(meta),
    }
    // Vercel captures console.log as structured text; stringify keeps each line parseable
    if (level === 'error') {
      console.error(JSON.stringify(entry))
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry))
    } else {
      console.log(JSON.stringify(entry))
    }
  }

  return {
    /** @param {string} msg @param {object} [meta] */
    info:  (msg, meta) => emit('info', msg, meta),
    warn:  (msg, meta) => emit('warn', msg, meta),
    /** @param {string} msg @param {Error|object} [errOrMeta] */
    error: (msg, errOrMeta) => {
      if (errOrMeta instanceof Error) {
        emit('error', msg, { error: errOrMeta.message, stack: errOrMeta.stack?.split('\n')[1]?.trim() })
      } else {
        emit('error', msg, errOrMeta)
      }
    },
    /**
     * Log request duration and final status.
     * Call at the end of the handler before returning.
     * @param {number} status — HTTP status code
     * @param {object} [meta]
     */
    done: (status, meta) => emit('info', 'request completed', { status, ms: Date.now() - t0, ...meta }),
    /** Expose the correlation ID so it can be forwarded to downstream calls */
    id,
  }
}

/** Flatten one level of nested objects for clean top-level log fields */
function flatten(obj) {
  if (!obj || typeof obj !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) out[k] = v
  }
  return out
}
