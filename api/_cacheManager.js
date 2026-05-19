/**
 * Shared in-process TTL cache for Netlify Functions.
 * Replaces 13+ independent Map/object caches scattered across API files.
 *
 * Usage:
 *   import { cache } from './_cacheManager.js'
 *   const hit = cache.get('rss:https://...')
 *   if (hit) return res.json(hit)
 *   cache.set('rss:https://...', data, 30 * 60 * 1000)
 *
 * Keys should be namespaced: 'rss:', 'risk:', 'health:', 'model:', etc.
 * Note: cache is per-function-instance — cold starts start empty.
 */

const _store = new Map()

export const cache = {
  get(key) {
    const entry = _store.get(key)
    if (!entry) return null
    if (Date.now() - entry.ts > entry.ttl) {
      _store.delete(key)
      return null
    }
    return entry.data
  },

  set(key, data, ttlMs) {
    _store.set(key, { data, ts: Date.now(), ttl: ttlMs })
  },

  has(key) {
    return this.get(key) !== null
  },

  delete(key) {
    _store.delete(key)
  },

  invalidatePrefix(prefix) {
    for (const key of _store.keys()) {
      if (key.startsWith(prefix)) _store.delete(key)
    }
  },

  size() {
    return _store.size
  },
}
