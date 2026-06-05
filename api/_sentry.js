/**
 * Sentry — Backend error monitoring for Vercel serverless functions.
 *
 * Call initSentry() once per cold start (handled automatically by captureApiException).
 * captureApiException(err, context) is the main helper — call it from _adapter.js
 * and any catch block where you want Sentry capture.
 *
 * Safe no-op when SENTRY_DSN is not configured.
 */

import * as Sentry from '@sentry/node'

let initialized = false

export function initSentry() {
  if (initialized || !process.env.SENTRY_DSN) return
  initialized = true

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV || 'production',
    release: process.env.VERCEL_GIT_COMMIT_SHA
      ? `safeguard360@${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8)}`
      : undefined,

    // Trace 10% of requests for performance monitoring
    tracesSampleRate: 0.1,

    // Strip PII before sending
    beforeSend(event) {
      if (event.user) {
        delete event.user.email
        delete event.user.ip_address
        delete event.user.username
      }
      return event
    },
  })
}

/**
 * Capture an exception from an API route.
 *
 * @param {Error}  err       The error to capture.
 * @param {object} context   Additional key/value pairs attached as extras.
 */
export async function captureApiException(err, context = {}) {
  if (!process.env.SENTRY_DSN) return
  initSentry()

  Sentry.withScope(scope => {
    if (Object.keys(context).length > 0) {
      scope.setExtras(context)
    }
    Sentry.captureException(err)
  })

  // Flush pending events — serverless functions can exit before events are sent
  await Sentry.flush(2000).catch(() => {})
}

export { Sentry }
