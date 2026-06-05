/**
 * Sentry — Frontend error & performance monitoring.
 *
 * Import this module once at app entry (src/main.jsx) BEFORE ReactDOM.createRoot.
 * It is a safe no-op when VITE_SENTRY_DSN is not configured.
 *
 * Captures:
 *   - Unhandled JS exceptions + promise rejections
 *   - React render crashes (via ErrorBoundary.componentDidCatch)
 *   - API fetch failures
 *   - Performance traces (10% sample)
 *   - Session replays on error (100%) and normal sessions (5%)
 */

import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT
      || (import.meta.env.PROD ? 'production' : 'development'),
    release: import.meta.env.VITE_SENTRY_RELEASE,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText:   false,
        blockAllMedia: false,
      }),
    ],

    // Performance: trace 10% of page loads + navigations
    tracesSampleRate: 0.1,

    // Session replay: capture all error sessions, 5% of normal sessions
    replaysOnErrorSampleRate:  1.0,
    replaysSessionSampleRate:  0.05,

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

export { Sentry }
