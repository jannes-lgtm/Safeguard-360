/**
 * _intelCenter.js — CAIRO Intelligence Center
 *
 * Unified intelligence request interface. Thin orchestration wrapper around:
 *   - _contextAssembly.js   (context assembly pipeline — 11 steps)
 *   - _cairoSOP.js          (KB / SOP retrieval via RAG pipeline)
 *   - _sharedCache.js       (Redis-backed shared cache)
 *
 * PURPOSE:
 *   Provides a single, cacheable entry point for intelligence requests across
 *   the platform. Future callers (CountryRiskReport, WatchBoard, crisis-broadcast,
 *   ops-analyze) import this instead of calling assembleContext() directly,
 *   getting caching and optional layer selection for free.
 *
 * CURRENT STATE (Phase 2 Step 4):
 *   - Core context assembly wired and cached ✓
 *   - KB retrieval wired and optional ✓
 *   - includeOperationalState / includeTravelerContext / includeOrgContext:
 *     forwarded to assembleContext() but NOT YET ACTIVE — Step 5 adds
 *     those optional layers to _contextAssembly.js.
 *
 * NO EXISTING CALLERS MIGRATED YET.
 * journey-agent.js continues to call assembleContext() directly until
 * a dedicated migration step.
 *
 * USAGE:
 *   import { requestIntelligence } from './_intelCenter.js'
 *
 *   const intel = await requestIntelligence({
 *     destination: 'Lagos',
 *     journey: { origin: 'London', destination: 'Lagos', ... },
 *     includeKB: true,
 *     intent: 'travel_advisory',
 *   })
 *   // intel.context   — assembled context (from assembleContext)
 *   // intel.kb        — scored KB docs (from buildKnowledgeContext), or null
 *   // intel.fromCache — true if result was served from cache
 *
 * CACHE KEY CONVENTION:
 *   Auto-generated: 'intel:{destination}:{intent}'
 *   Override with:  { cacheKey: 'intel:custom-key' }
 *   Disable cache:  { cacheTtlMs: 0 }
 */

import { assembleContext } from './_contextAssembly.js'
import { buildKnowledgeContext } from './_cairoSOP.js'
import { sharedCache, CACHE_TTL } from './_sharedCache.js'

/**
 * Request assembled intelligence for a destination / journey.
 *
 * @param {object} opts
 * @param {string}  [opts.destination]              — primary destination (e.g. 'Lagos')
 * @param {string[]} [opts.transitPoints]           — transit/stopover points
 * @param {object}  [opts.journey]                  — full journey struct for assembleContext
 * @param {boolean} [opts.includeKB=true]           — run KB/SOP retrieval via RAG
 * @param {boolean} [opts.includeOperationalState=false] — (Step 5) live SOS/incident state
 * @param {boolean} [opts.includeTravelerContext=false]  — (Step 5) traveler profile + location
 * @param {boolean} [opts.includeOrgContext=false]       — (Step 5) org policies + config
 * @param {string}  [opts.userId]                   — for traveler context (Step 5)
 * @param {string}  [opts.orgId]                    — for org/operational context (Step 5)
 * @param {string}  [opts.userRole]                 — role hint for context weighting
 * @param {string}  [opts.intent]                   — advisory intent type for cache key
 * @param {string}  [opts.cacheKey]                 — override auto-generated cache key
 * @param {number}  [opts.cacheTtlMs]               — TTL override (0 = skip cache)
 * @param {string}  [opts.kbQuery]                  — message/query string for KB retrieval
 *
 * @returns {Promise<{
 *   context:    object,   — full assembleContext result
 *   kb:         Array|null, — scored KB docs, or null when includeKB=false
 *   fromCache:  boolean,
 *   destination: string|null,
 * }>}
 */
export async function requestIntelligence({
  destination   = null,
  transitPoints = [],
  journey       = null,
  includeKB     = true,
  includeOperationalState = false,
  includeTravelerContext  = false,
  includeOrgContext       = false,
  userId        = null,
  orgId         = null,
  userRole      = null,
  intent        = 'general',
  cacheKey      = null,
  cacheTtlMs    = null,
  kbQuery       = '',
} = {}) {

  // ── Resolve cache key ───────────────────────────────────────────────────────
  const dest       = destination || journey?.destination || null
  const resolvedKey = cacheKey || `intel:${(dest || 'global').toLowerCase()}:${intent}`
  const resolvedTtl = cacheTtlMs ?? CACHE_TTL.CAIRO_CONTEXT  // 5 min default

  // ── Cache check ─────────────────────────────────────────────────────────────
  if (resolvedTtl > 0) {
    const cached = await sharedCache.get(resolvedKey)
    if (cached) {
      return { ...cached, fromCache: true }
    }
  }

  // ── Build journey object for assembleContext ────────────────────────────────
  // assembleContext expects a journey struct. If the caller only passed
  // destination/transitPoints (not a full journey), build a minimal one.
  const journeyForAssembly = journey ?? {
    destination:   dest,
    transitPoints: transitPoints,
    origin:        null,
    departDate:    null,
    returnDate:    null,
  }

  // ── Context assembly (Step 5 options forwarded — ignored until Step 5 lands) ─
  // assembleContext currently accepts one arg. Passing the options object as a
  // second arg is safe (JS silently ignores extra positional args until the
  // function declares the parameter). Step 5 adds `options = {}` — no change here.
  const assemblyOptions = {
    includeOperationalState,
    includeTravelerContext,
    includeOrgContext,
    userId,
    orgId,
    userRole,
  }

  const context = await assembleContext(journeyForAssembly, assemblyOptions)

  // ── KB retrieval (optional) ─────────────────────────────────────────────────
  let kb = null
  if (includeKB && dest) {
    kb = await buildKnowledgeContext(dest, kbQuery || context.formatted || '')
  }

  // ── Assemble result ─────────────────────────────────────────────────────────
  const result = {
    context,
    kb,
    fromCache:   false,
    destination: dest,
  }

  // ── Cache result ────────────────────────────────────────────────────────────
  if (resolvedTtl > 0) {
    await sharedCache.set(resolvedKey, result, resolvedTtl)
  }

  return result
}

/**
 * Invalidate cached intelligence for a destination.
 * Call after a significant new event is ingested for the destination.
 *
 * @param {string} destination — destination name (matches cache key prefix)
 */
export async function invalidateIntelCache(destination) {
  if (!destination) return
  await sharedCache.invalidatePrefix(`intel:${destination.toLowerCase()}:`)
}
