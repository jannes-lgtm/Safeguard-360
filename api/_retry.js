/**
 * _retry.js
 * Exponential backoff retry wrapper for async operations.
 *
 * Usage:
 *   import { withRetry, fetchWithRetry } from './_retry.js'
 *
 *   // Retry any async function
 *   const data = await withRetry(() => supabase.from('x').select('*'), { label: 'fetch-x' })
 *
 *   // Retry a fetch() call (retries on network errors and 5xx responses)
 *   const r = await fetchWithRetry('https://api.example.com/data', { headers: {...} })
 */

/**
 * Retry an async function with exponential backoff.
 *
 * @param {() => Promise<any>}  fn       — async function to retry
 * @param {object}              opts
 * @param {number}  opts.attempts  — max attempts (default 3)
 * @param {number}  opts.baseMs    — base delay in ms (default 500; doubles each attempt)
 * @param {string}  opts.label     — label for log output
 * @param {(err: Error) => boolean} opts.shouldRetry — return false to stop retrying (default: always retry)
 * @returns {Promise<any>}
 */
export async function withRetry(fn, { attempts = 3, baseMs = 500, label = 'op', shouldRetry } = {}) {
  let lastErr
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i === attempts) break
      if (shouldRetry && !shouldRetry(err)) break
      const delay = baseMs * Math.pow(2, i - 1) + Math.random() * 100  // jitter
      console.warn(JSON.stringify({
        level: 'warn',
        msg:   `${label} attempt ${i}/${attempts} failed — retrying in ${Math.round(delay)}ms`,
        error: err.message,
      }))
      await sleep(delay)
    }
  }
  throw lastErr
}

/**
 * fetch() with retry on network errors and configurable 5xx retry.
 *
 * @param {string}        url
 * @param {RequestInit}   init     — standard fetch options
 * @param {object}        retryOpts
 * @param {number}  retryOpts.attempts    — max attempts (default 3)
 * @param {number}  retryOpts.baseMs      — base delay ms (default 600)
 * @param {number[]} retryOpts.retryCodes — HTTP status codes to retry (default [502, 503, 504])
 * @param {string}  retryOpts.label
 * @returns {Promise<Response>}  — resolves to the last response (including non-retried 4xx)
 */
export async function fetchWithRetry(url, init = {}, { attempts = 3, baseMs = 600, retryCodes = [502, 503, 504], label = 'fetch' } = {}) {
  let lastErr
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(url, init)
      if (retryCodes.includes(r.status) && i < attempts) {
        const delay = baseMs * Math.pow(2, i - 1) + Math.random() * 100
        console.warn(JSON.stringify({
          level:  'warn',
          msg:    `${label} HTTP ${r.status} — retrying in ${Math.round(delay)}ms (${i}/${attempts})`,
          url,
        }))
        await sleep(delay)
        continue
      }
      return r
    } catch (err) {
      lastErr = err
      if (i === attempts) break
      const delay = baseMs * Math.pow(2, i - 1) + Math.random() * 100
      console.warn(JSON.stringify({
        level: 'warn',
        msg:   `${label} network error — retrying in ${Math.round(delay)}ms (${i}/${attempts})`,
        error: err.message,
        url,
      }))
      await sleep(delay)
    }
  }
  if (lastErr) throw lastErr
  // If we get here all attempts returned retryable status codes — do one final non-retried call
  return fetch(url, init)
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms))
