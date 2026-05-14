/**
 * SafeGuard360 — Central Logger
 * ─────────────────────────────────────────────────────────────────
 * Usage:
 *   import { log } from '../lib/logger'
 *   log.auth('login_failure', { email, error: err.message })
 *   log.telemetry('gps_denied', { userId })
 *   log.realtime('ws_disconnect', { channel, attempt })
 *   log.cairo('inference_failure', { error: err.message })
 *
 * In production these are console.error/warn so they appear in
 * Netlify function logs and browser DevTools.
 * Swap the emit() function to send to Sentry/Datadog when ready.
 */

const IS_DEV = import.meta.env.DEV

function emit(level, system, event, data = {}) {
  const entry = {
    ts:     new Date().toISOString(),
    system,
    event,
    ...data,
  }

  if (level === 'error') {
    console.error(`[SG360:${system}] ${event}`, entry)
  } else if (level === 'warn') {
    console.warn(`[SG360:${system}] ${event}`, entry)
  } else if (IS_DEV) {
    console.log(`[SG360:${system}] ${event}`, entry)
  }

  // TODO: forward to error tracking (Sentry, Datadog, Logtail, etc.)
  // if (level === 'error') Sentry.captureEvent({ message: `${system}:${event}`, extra: entry })
}

export const log = {
  // AUTH ─────────────────────────────────────────────────────────
  auth: {
    signupFailure:     (data) => emit('error', 'AUTH', 'signup_failure',        data),
    loginFailure:      (data) => emit('warn',  'AUTH', 'login_failure',         data),
    tokenRefreshFail:  (data) => emit('error', 'AUTH', 'token_refresh_failure', data),
    onboardingFailure: (data) => emit('error', 'AUTH', 'onboarding_failure',    data),
    sessionExpired:    (data) => emit('warn',  'AUTH', 'session_expired',       data),
    profileMissing:    (data) => emit('error', 'AUTH', 'profile_missing',       data),
    gateRedirect:      (data) => emit('warn',  'AUTH', 'gate_redirect',         data),
  },

  // TELEMETRY ────────────────────────────────────────────────────
  telemetry: {
    gpsDenied:       (data) => emit('warn',  'TELEMETRY', 'gps_denied',        data),
    gpsFailure:      (data) => emit('error', 'TELEMETRY', 'gps_failure',       data),
    writeFailure:    (data) => emit('error', 'TELEMETRY', 'write_failure',      data),
    staleLocation:   (data) => emit('warn',  'TELEMETRY', 'stale_location',    data),
  },

  // REALTIME ─────────────────────────────────────────────────────
  realtime: {
    connected:       (data) => emit('info',  'REALTIME', 'connected',          data),
    disconnected:    (data) => emit('warn',  'REALTIME', 'disconnected',       data),
    reconnecting:    (data) => emit('warn',  'REALTIME', 'reconnecting',       data),
    syncFailure:     (data) => emit('error', 'REALTIME', 'sync_failure',       data),
  },

  // CAIRO ────────────────────────────────────────────────────────
  cairo: {
    inferenceFailure: (data) => emit('error', 'CAIRO', 'inference_failure',    data),
    advisoryFailure:  (data) => emit('error', 'CAIRO', 'advisory_failure',     data),
    contextFailure:   (data) => emit('error', 'CAIRO', 'context_failure',      data),
    timeout:          (data) => emit('warn',  'CAIRO', 'timeout',              data),
  },

  // GENERAL ──────────────────────────────────────────────────────
  error: (system, event, data) => emit('error', system, event, data),
  warn:  (system, event, data) => emit('warn',  system, event, data),
  info:  (system, event, data) => emit('info',  system, event, data),
}
