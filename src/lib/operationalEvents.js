/**
 * operationalEvents.js — Operational Event Type Registry
 *
 * Single source of truth for all event type strings used across the platform.
 * Used by:
 *   - api/_operationalEventEmitter.js  (server-side emission)
 *   - Supabase Realtime listeners      (subscribe to specific event types)
 *   - CAIRO context assembly           (filter relevant events)
 *   - WatchBoard / operational UI      (display + filter by category)
 *
 * Architecture note:
 *   These are NOT an event bus. They are typed constants that:
 *   1. Prevent string-literal drift across files
 *   2. Define the contract for the `operational_events` DB table
 *   3. Prepare the platform for centralized orchestration without requiring it now
 *
 *   When a full event bus is introduced (Phase 2), these constants migrate
 *   directly into the bus's event type registry with no rename needed.
 *
 * Naming convention:
 *   <domain>.<action>
 *   Domain examples: sos, incident, checkin, intel, movement, traveler, escalation
 *   Action examples: created, updated, resolved, failed, missed, offline, escalated
 */

// ── SOS Events ────────────────────────────────────────────────────────────────
export const EV_SOS_CREATED          = 'sos.created'
export const EV_SOS_ACKNOWLEDGED     = 'sos.acknowledged'
export const EV_SOS_RESOLVED         = 'sos.resolved'
export const EV_SOS_DELIVERY_FAILED  = 'sos.delivery_failed'
export const EV_SOS_ESCALATION_SENT  = 'sos.escalation_sent'
export const EV_SOS_ESCALATION_FAILED = 'sos.escalation_failed'

// ── Incident Events ───────────────────────────────────────────────────────────
export const EV_INCIDENT_CREATED     = 'incident.created'
export const EV_INCIDENT_UPDATED     = 'incident.updated'
export const EV_INCIDENT_ESCALATED   = 'incident.escalated'
export const EV_INCIDENT_RESOLVED    = 'incident.resolved'
export const EV_INCIDENT_CLOSED      = 'incident.closed'

// ── Check-in Events ───────────────────────────────────────────────────────────
export const EV_CHECKIN_COMPLETED    = 'checkin.completed'
export const EV_CHECKIN_MISSED       = 'checkin.missed'
export const EV_CHECKIN_OVERDUE      = 'checkin.overdue'
export const EV_CHECKIN_LATE         = 'checkin.late'

// ── Intelligence Events ───────────────────────────────────────────────────────
export const EV_HIGH_RISK_ALERT      = 'intel.high_risk_alert'
export const EV_CRITICAL_ALERT       = 'intel.critical_alert'
export const EV_COUNTRY_RISK_CHANGE  = 'intel.country_risk_change'
export const EV_INTEL_FEED_INGESTED  = 'intel.feed_ingested'

// ── Movement Events ───────────────────────────────────────────────────────────
export const EV_MOVEMENT_ANOMALY     = 'movement.anomaly'
export const EV_MOVEMENT_PROXIMITY   = 'movement.proximity_warning'
export const EV_MOVEMENT_STARTED     = 'movement.sharing_started'
export const EV_MOVEMENT_STOPPED     = 'movement.sharing_stopped'

// ── Traveler Events ───────────────────────────────────────────────────────────
export const EV_TRAVELER_OFFLINE     = 'traveler.offline'
export const EV_TRAVELER_ARRIVED     = 'traveler.arrived'
export const EV_TRAVELER_DEPARTED    = 'traveler.departed'
export const EV_TRAVELER_AT_RISK     = 'traveler.at_risk_zone'

// ── Escalation Events ─────────────────────────────────────────────────────────
export const EV_ESCALATION_CREATED   = 'escalation.created'
export const EV_ESCALATION_ACKED     = 'escalation.acknowledged'
export const EV_ESCALATION_CLOSED    = 'escalation.closed'
export const EV_ESCALATION_TIMEOUT   = 'escalation.timeout'

// ── GSOC Operational Events ───────────────────────────────────────────────────
export const EV_SHIFT_STARTED        = 'gsoc.shift_started'
export const EV_SHIFT_ENDED          = 'gsoc.shift_ended'
export const EV_TASK_ASSIGNED        = 'gsoc.task_assigned'
export const EV_TASK_COMPLETED       = 'gsoc.task_completed'

// ── System Events ─────────────────────────────────────────────────────────────
export const EV_NOTIFICATION_FAILED  = 'system.notification_failed'
export const EV_CRON_SCAN_COMPLETE   = 'system.cron_scan_complete'
export const EV_AUTH_SESSION_EXPIRED = 'system.auth_session_expired'

// ── Grouped sets (for filtering / subscription) ───────────────────────────────
// Use these in Realtime filters or CAIRO context assembly

/** All events that indicate immediate danger — route to GSOC + auto-escalation */
export const CRITICAL_EVENTS = [
  EV_SOS_CREATED,
  EV_SOS_DELIVERY_FAILED,
  EV_INCIDENT_ESCALATED,
  EV_CRITICAL_ALERT,
  EV_TRAVELER_AT_RISK,
]

/** Events that change the operational picture for a traveler */
export const TRAVELER_LIFECYCLE_EVENTS = [
  EV_TRAVELER_OFFLINE,
  EV_TRAVELER_ARRIVED,
  EV_TRAVELER_DEPARTED,
  EV_TRAVELER_AT_RISK,
  EV_CHECKIN_MISSED,
  EV_CHECKIN_OVERDUE,
  EV_MOVEMENT_ANOMALY,
]

/** Events relevant to GSOC situational awareness */
export const GSOC_MONITOR_EVENTS = [
  EV_SOS_CREATED,
  EV_SOS_DELIVERY_FAILED,
  EV_SOS_ESCALATION_SENT,
  EV_INCIDENT_CREATED,
  EV_INCIDENT_ESCALATED,
  EV_ESCALATION_CREATED,
  EV_ESCALATION_TIMEOUT,
  EV_HIGH_RISK_ALERT,
  EV_CRITICAL_ALERT,
  EV_CHECKIN_MISSED,
  EV_TRAVELER_OFFLINE,
]

/** Events that should be included in CAIRO context assembly */
export const CAIRO_CONTEXT_EVENTS = [
  ...GSOC_MONITOR_EVENTS,
  EV_MOVEMENT_ANOMALY,
  EV_MOVEMENT_PROXIMITY,
  EV_COUNTRY_RISK_CHANGE,
  EV_TRAVELER_AT_RISK,
]

// ── Severity helpers ──────────────────────────────────────────────────────────

const SEVERITY_MAP = {
  [EV_SOS_CREATED]:          'critical',
  [EV_SOS_DELIVERY_FAILED]:  'critical',
  [EV_SOS_ESCALATION_FAILED]:'critical',
  [EV_INCIDENT_ESCALATED]:   'critical',
  [EV_CRITICAL_ALERT]:       'critical',
  [EV_TRAVELER_AT_RISK]:     'critical',
  [EV_CHECKIN_MISSED]:       'warning',
  [EV_CHECKIN_OVERDUE]:      'warning',
  [EV_TRAVELER_OFFLINE]:     'warning',
  [EV_MOVEMENT_ANOMALY]:     'warning',
  [EV_HIGH_RISK_ALERT]:      'warning',
  [EV_ESCALATION_TIMEOUT]:   'warning',
}

/** Returns 'critical' | 'warning' | 'info' for a given event type */
export function getEventSeverity(eventType) {
  return SEVERITY_MAP[eventType] || 'info'
}

/** Returns true if the event type requires immediate GSOC attention */
export function isCriticalEvent(eventType) {
  return CRITICAL_EVENTS.includes(eventType)
}
