/**
 * _telemetry.js
 * Fire-and-forget operational event emitter.
 * Writes to ops_events — the platform's operational memory.
 *
 * All writes are non-blocking and silently swallowed on failure.
 * Never let telemetry failures affect the business path.
 *
 * Usage (server-side only):
 *   import { emit } from './_telemetry.js'
 *   emit({ type: 'feed_fetch', feedId: 'osac', success: true, durationMs: 1240 })
 *   emit({ type: 'notification_sent', channel: 'email', success: false, region: 'nigeria' })
 */

import crypto from 'crypto'
import { getSupabaseAdmin } from './_supabase.js'

/**
 * Emit a single operational event.
 * Non-blocking — returns immediately, write happens in background.
 *
 * @param {object} event
 * @param {string}  event.type        — event_type (required)
 * @param {string}  [event.endpoint]
 * @param {string}  [event.region]
 * @param {string}  [event.feedId]
 * @param {number}  [event.durationMs]
 * @param {boolean} [event.success]
 * @param {number}  [event.attempt]
 * @param {string}  [event.errorCode]
 * @param {string}  [event.errorMsg]
 * @param {object}  [event.metadata]
 * @param {string}  [event.reqId]     — correlation ID from _logger.js
 */
export function emit(event) {
  _write(event).catch(() => {})  // truly fire-and-forget
}

/** Emit multiple events in one insert round-trip */
export function emitBatch(events) {
  _writeBatch(events).catch(() => {})
}

/**
 * Record a notification delivery attempt.
 * Also writes to notification_delivery table for delivery analytics.
 */
export function emitNotification({ channel, notificationType, recipientRaw, region, success, durationMs, attempt = 1, errorCode, provider, isSynthetic = false }) {
  const recipientHash = recipientRaw
    ? crypto.createHash('sha256').update(String(recipientRaw)).digest('hex').slice(0, 16)
    : null

  // Write to notification_delivery (dedicated delivery analytics)
  _writeDelivery({ channel, notificationType, recipientHash, region, success, durationMs, attempt, errorCode, provider, isSynthetic }).catch(() => {})

  // Also write to ops_events (unified log)
  emit({
    type:      success ? 'notification_sent' : 'notification_failed',
    endpoint:  'notify',
    region,
    durationMs,
    success,
    attempt,
    errorCode,
    metadata:  { channel, notification_type: notificationType, provider, is_synthetic: isSynthetic },
  })
}

/**
 * Record an escalation attempt (missed check-in, SOS, incident).
 */
export function emitEscalation({ escalationType, tripId, userId, attemptedChannels, failedChannels, contactsAttempted, contactsReached, region, errorDetails, isSynthetic = false }) {
  _writeEscalation({ escalationType, tripId, userId, attemptedChannels, failedChannels, contactsAttempted, contactsReached, region, errorDetails, isSynthetic }).catch(() => {})

  if (contactsReached === 0 || (contactsAttempted > 0 && contactsReached / contactsAttempted < 0.5)) {
    emit({
      type:     'escalation',
      endpoint: escalationType,
      region,
      success:  contactsReached > 0,
      metadata: { contacts_attempted: contactsAttempted, contacts_reached: contactsReached, failed_channels: failedChannels },
    })
  }
}

// ── Internal writers ─────────────────────────────────────────────────────────

async function _write(event) {
  const sb = getSupabaseAdmin()
  await sb.from('ops_events').insert({
    event_type:  event.type,
    endpoint:    event.endpoint || null,
    region:      event.region   || null,
    feed_id:     event.feedId   || null,
    duration_ms: event.durationMs != null ? Math.round(event.durationMs) : null,
    success:     event.success  != null ? Boolean(event.success) : null,
    attempt:     event.attempt  || 1,
    error_code:  event.errorCode || null,
    error_msg:   event.errorMsg ? String(event.errorMsg).slice(0, 500) : null,
    metadata:    event.metadata || null,
    req_id:      event.reqId    || null,
  })
}

async function _writeBatch(events) {
  const sb = getSupabaseAdmin()
  await sb.from('ops_events').insert(
    events.map(e => ({
      event_type:  e.type,
      endpoint:    e.endpoint   || null,
      region:      e.region     || null,
      feed_id:     e.feedId     || null,
      duration_ms: e.durationMs != null ? Math.round(e.durationMs) : null,
      success:     e.success    != null ? Boolean(e.success) : null,
      attempt:     e.attempt    || 1,
      error_code:  e.errorCode  || null,
      error_msg:   e.errorMsg   ? String(e.errorMsg).slice(0, 500) : null,
      metadata:    e.metadata   || null,
      req_id:      e.reqId      || null,
    }))
  )
}

async function _writeDelivery({ channel, notificationType, recipientHash, region, success, durationMs, attempt, errorCode, provider, isSynthetic }) {
  const sb = getSupabaseAdmin()
  await sb.from('notification_delivery').insert({
    channel,
    notification_type: notificationType || null,
    recipient_hash:    recipientHash    || null,
    region:            region           || null,
    success:           Boolean(success),
    attempt:           attempt          || 1,
    duration_ms:       durationMs != null ? Math.round(durationMs) : null,
    error_code:        errorCode        || null,
    provider:          provider         || null,
    is_synthetic:      isSynthetic      || false,
  })
}

async function _writeEscalation({ escalationType, tripId, userId, attemptedChannels, failedChannels, contactsAttempted, contactsReached, region, errorDetails, isSynthetic }) {
  const sb = getSupabaseAdmin()
  await sb.from('escalation_failures').insert({
    escalation_type:   escalationType   || null,
    trip_id:           tripId           || null,
    user_id:           userId           || null,
    attempted_channels: attemptedChannels || [],
    failed_channels:   failedChannels   || [],
    contacts_attempted: contactsAttempted || 0,
    contacts_reached:  contactsReached  || 0,
    region:            region           || null,
    error_details:     errorDetails     || null,
    is_synthetic:      isSynthetic      || false,
  })
}
