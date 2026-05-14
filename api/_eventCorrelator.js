/**
 * api/_eventCorrelator.js
 *
 * Event Correlation Engine for CAIRO.
 *
 * Ingests an array of normalized intelligence objects and:
 *   1. Identifies corroboration clusters (same event, multiple sources)
 *   2. Detects geographic + temporal proximity patterns
 *   3. Resolves conflicting severity reports
 *   4. Deduplicates near-identical articles from the same source
 *   5. Identifies escalation patterns within a cluster
 *
 * Design principle:
 *   Multiple independent reports of the same event increase confidence.
 *   Conflicting severity reports flag uncertainty — never inflate confidence.
 *   Geographic clustering in the same city/country within 72h is significant.
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const MIN_CLUSTER_SIZE    = 2       // Minimum events to form a cluster
const CLUSTER_WINDOW_HOURS = 72     // Max age gap between events to correlate
const IMPACT_RANK = { severe: 5, significant: 4, moderate: 3, minor: 2, none: 1 }

// ── Related event type groups ─────────────────────────────────────────────────
// Events in the same group can be correlated with each other
const RELATED_TYPE_GROUPS = [
  ['civil_unrest', 'political'],
  ['civil_unrest', 'crime'],
  ['civil_unrest', 'infrastructure'],   // unrest often disrupts infrastructure
  ['armed_conflict', 'terrorism'],
  ['armed_conflict', 'kidnap_ransom'],
  ['terrorism', 'kidnap_ransom'],
  ['political', 'economic'],
  ['infrastructure', 'economic'],
  ['infrastructure', 'aviation_disruption'],
  ['weather_disaster', 'infrastructure'],
  ['weather_disaster', 'aviation_disruption'],
]

function areEventTypesRelated(typeA, typeB) {
  if (typeA === typeB) return true
  return RELATED_TYPE_GROUPS.some(([a, b]) =>
    (typeA === a && typeB === b) || (typeA === b && typeB === a)
  )
}

// ── Correlation decision ──────────────────────────────────────────────────────
function shouldCorrelate(a, b) {
  if (!a.country || a.country !== b.country) return false
  if (!areEventTypesRelated(a.event_type, b.event_type)) return false

  const tA = new Date(a.event_timestamp).getTime()
  const tB = new Date(b.event_timestamp).getTime()
  const hoursDiff = Math.abs(tA - tB) / (1000 * 60 * 60)
  if (hoursDiff > CLUSTER_WINDOW_HOURS) return false

  // Same city is strong signal
  if (a.city && b.city && a.city === b.city) return true

  // Shared keywords (at least 1 common operational keyword)
  const sharedKw = (a.keywords || []).filter(kw => (b.keywords || []).includes(kw))
  if (sharedKw.length >= 1) return true

  // Both have significant/severe movement impact
  if (IMPACT_RANK[a.movement_impact] >= 3 && IMPACT_RANK[b.movement_impact] >= 3) return true

  return false
}

// ── Build a cluster object from a group of correlated events ──────────────────
function buildCluster(events) {
  const severities   = events.map(e => e.severity)
  const confidences  = events.map(e => e.confidence)
  const tiers        = events.map(e => e.source_tier)
  const uniqueSources = new Set(events.map(e => e.source_name)).size

  // Corroboration score: diverse high-tier sources + consistency
  const tierBonus = tiers.some(t => t === 1) ? 0.15
    : tiers.some(t => t === 2) ? 0.08
    : 0.00

  const avgConfidence = confidences.reduce((s, c) => s + c, 0) / confidences.length
  const diversityFactor = Math.min(0.30, (uniqueSources - 1) * 0.10)
  const corroboration = Math.min(0.98,
    Math.round((avgConfidence * 0.55 + diversityFactor + tierBonus) * 100) / 100
  )

  // Detect escalation: severity increasing over time
  const sorted = [...events].sort((a, b) =>
    new Date(a.event_timestamp) - new Date(b.event_timestamp)
  )
  const firstSev = sorted[0]?.severity || 1
  const lastSev  = sorted[sorted.length - 1]?.severity || 1
  const isEscalating = lastSev > firstSev

  // Worst-case movement impact in the cluster
  const worstImpact = events
    .map(e => e.movement_impact)
    .sort((a, b) => (IMPACT_RANK[b] || 0) - (IMPACT_RANK[a] || 0))[0] || 'minor'

  return {
    cluster_id:          generateId(),
    event_type:          events[0].event_type,
    country:             events[0].country,
    city:                events.find(e => e.city)?.city || null,
    event_count:         events.length,
    severity_consensus:  Math.max(...severities),
    severity_average:    Math.round((severities.reduce((s, v) => s + v, 0) / severities.length) * 10) / 10,
    corroboration_score: corroboration,
    confidence:          Math.round(Math.max(...confidences) * 100) / 100,
    movement_impact:     worstImpact,
    is_escalating:       isEscalating,
    sources:             [...new Set(events.map(e => e.source_name))],
    first_signal_at:     sorted[0]?.event_timestamp,
    latest_signal_at:    sorted[sorted.length - 1]?.event_timestamp,
    keywords:            [...new Set(events.flatMap(e => e.keywords || []))].slice(0, 12),
    events,              // full intel objects in this cluster
  }
}

// ── Main correlation function ─────────────────────────────────────────────────
/**
 * Groups intel objects into corroboration clusters.
 * Only returns clusters with ≥ MIN_CLUSTER_SIZE events.
 * @param {object[]} intelObjects  Normalized intelligence objects
 * @returns {object[]}             Correlation clusters
 */
export function correlateEvents(intelObjects) {
  if (!intelObjects?.length) return []

  const clusters = []
  const assigned = new Set()

  for (let i = 0; i < intelObjects.length; i++) {
    if (assigned.has(i)) continue

    const anchor  = intelObjects[i]
    const cluster = [anchor]
    assigned.add(i)

    for (let j = i + 1; j < intelObjects.length; j++) {
      if (assigned.has(j)) continue
      if (shouldCorrelate(anchor, intelObjects[j])) {
        cluster.push(intelObjects[j])
        assigned.add(j)
      }
    }

    if (cluster.length >= MIN_CLUSTER_SIZE) {
      clusters.push(buildCluster(cluster))
    }
  }

  // Sort: highest corroboration + severity first
  return clusters.sort((a, b) =>
    (b.corroboration_score * b.severity_consensus) -
    (a.corroboration_score * a.severity_consensus)
  )
}

// ── Deduplication ─────────────────────────────────────────────────────────────
/**
 * Removes near-duplicate articles (same source reporting the same event twice).
 * Keeps the highest-reliability version of each duplicate.
 */
export function deduplicateIntel(intelObjects) {
  const seen = new Map()
  const result = []

  for (const obj of intelObjects) {
    // Key: country + event_type + first 60 chars of title (normalised)
    const titleKey = (obj.raw_title || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 60).trim()
    const key = `${obj.country}|${obj.event_type}|${titleKey}`

    if (!seen.has(key)) {
      seen.set(key, { obj, idx: result.length })
      result.push(obj)
    } else {
      // Replace with higher-reliability version
      const existing = seen.get(key)
      if (obj.source_reliability > existing.obj.source_reliability) {
        result[existing.idx] = obj
        seen.set(key, { obj, idx: existing.idx })
      }
    }
  }

  return result
}

// ── Conflict resolution ───────────────────────────────────────────────────────
/**
 * When multiple sources report conflicting severity for the same event,
 * flag the conflict rather than averaging it away.
 * Tier 1 sources take precedence; otherwise flag low consensus.
 */
export function resolveConflicts(intelObjects) {
  // Group by country + event_type + city (rough event identity)
  const groups = new Map()

  for (const obj of intelObjects) {
    const key = `${obj.country}|${obj.event_type}|${obj.city || ''}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(obj)
  }

  const resolved = []

  for (const group of groups.values()) {
    if (group.length === 1) {
      resolved.push(group[0])
      continue
    }

    const severities   = group.map(e => e.severity)
    const maxSev       = Math.max(...severities)
    const minSev       = Math.min(...severities)
    const divergence   = maxSev - minSev
    const tier1Report  = group.find(e => e.source_tier === 1)

    // Primary: prefer Tier 1 source, else highest reliability
    const primary = tier1Report ||
      [...group].sort((a, b) => b.source_reliability - a.source_reliability)[0]

    resolved.push({
      ...primary,
      _conflict_detected:    divergence >= 2,
      _conflicting_reports:  group.length,
      _severity_consensus:   divergence < 2 ? 'high' : 'low',
      _severity_range:       `${minSev}–${maxSev}`,
      // Reduce confidence when sources conflict significantly
      confidence: divergence >= 2
        ? Math.max(0.25, Math.round((primary.confidence * 0.80) * 100) / 100)
        : primary.confidence,
    })
  }

  return resolved
}

// ── Escalation detection ──────────────────────────────────────────────────────
/**
 * Detects whether a sequence of intelligence objects shows escalation
 * (severity trending upward within a time window).
 * @param {object[]} intelObjects  Sorted array (oldest first)
 * @returns {{ escalating: boolean, pattern: string }}
 */
export function detectEscalation(intelObjects) {
  if (intelObjects.length < 3) return { escalating: false, pattern: 'insufficient_data' }

  const recentFour = [...intelObjects]
    .sort((a, b) => new Date(b.event_timestamp) - new Date(a.event_timestamp))
    .slice(0, 4)

  const severities = recentFour.map(e => e.severity)

  // Simple linear trend: is severity going up?
  const isEscalating = severities[0] >= severities[1] && severities[1] >= severities[2]

  if (isEscalating && severities[0] >= 4) {
    return { escalating: true, pattern: 'rapid_escalation' }
  }
  if (isEscalating && severities[0] >= 3) {
    return { escalating: true, pattern: 'gradual_escalation' }
  }

  const isDeEscalating = severities[0] <= severities[1] && severities[1] <= severities[2]
  if (isDeEscalating) {
    return { escalating: false, pattern: 'de-escalation' }
  }

  return { escalating: false, pattern: 'volatile' }
}

// ── Utility ───────────────────────────────────────────────────────────────────
function generateId() {
  return Math.random().toString(36).slice(2, 10)
}
