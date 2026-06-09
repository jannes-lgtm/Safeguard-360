/**
 * api/_contentHash.js
 *
 * Content Hashing and URL Deduplication — Phase 3.
 *
 * Provides stable content hashes for deduplication of live_intelligence records.
 * One real-world incident should become one intelligence object regardless of
 * how many times it is re-ingested across cron cycles.
 *
 * Methods:
 *   computeContentHash(title, summary)
 *     → deterministic 16-char hex hash for deduplication keying
 *
 *   normalizeUrl(url)
 *     → canonical URL (strips UTM params, tracking fragments, session IDs)
 *
 *   isDuplicateByHash(supabase, contentHash, windowHours)
 *     → checks DB for existing record with same hash within TTL window
 *
 * Strategy:
 *   Primary dedup key: normalizedUrl (most reliable — same article, same URL)
 *   Fallback dedup key: contentHash of title + first 200 chars of summary
 *
 * This prevents the same article from being re-inserted on every cron run
 * while the article remains live in the RSS feed.
 */

// ── Simple but stable hash ─────────────────────────────────────────────────────
// Uses djb2-style hash — no crypto required, deterministic, fast.
// Produces an 8-byte hex string (16 hex chars) — sufficient for dedup purposes.
function djb2Hash(str) {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
    hash = hash & 0xFFFFFFFF  // force 32-bit int
  }
  // Return as unsigned hex, zero-padded to 8 chars
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Computes a deduplication hash for an article.
 * Uses: normalized title + first 120 chars of summary.
 *
 * Normalization:
 *   - Lowercase
 *   - Remove HTML entities
 *   - Collapse whitespace
 *   - Strip punctuation that differs between syndication versions
 *
 * @param {string} title    — article title
 * @param {string} summary  — article summary/description (first 200 chars used)
 * @returns {string}        — 16-char hex hash
 */
export function computeContentHash(title = '', summary = '') {
  const normTitle = normalizeText(title).slice(0, 120)
  const normBody  = normalizeText(summary).slice(0, 120)
  const combined  = `${normTitle}|||${normBody}`

  // Two independent hashes combined for lower collision probability
  const h1 = djb2Hash(combined)
  const h2 = djb2Hash(combined.split('').reverse().join(''))
  return `${h1}${h2}`  // 16 hex chars
}

function normalizeText(str) {
  return str
    .toLowerCase()
    .replace(/&[a-z]+;/g, ' ')           // HTML entities
    .replace(/&#\d+;/g, ' ')             // numeric entities
    .replace(/<[^>]*>/g, ' ')            // HTML tags
    .replace(/[''""]/g, "'")             // smart quotes → straight
    .replace(/[–—]/g, '-')               // em/en dash → hyphen
    .replace(/[^\w\s-]/g, ' ')           // strip most punctuation
    .replace(/\s+/g, ' ')                // collapse whitespace
    .trim()
}

// ── URL normalization ─────────────────────────────────────────────────────────
// Strips tracking parameters, session IDs, fragments, and other non-canonical
// query string elements that vary across syndication channels.

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_reader', 'fbclid', 'gclid', 'msclkid', 'twclid',
  '_ga', '_gl', 'ref', 'referrer', 'source', 'via', 'from',
  'mc_cid', 'mc_eid', 'ncid', 'cmpid', 'at_medium', 'at_campaign',
  'sid', 'session_id', 'token',
])

/**
 * Returns a canonical URL with tracking parameters removed.
 * Lowercases the scheme and host. Preserves path, meaningful query params.
 *
 * @param {string} url
 * @returns {string}    canonical URL, or original if parsing fails
 */
export function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return url || ''

  try {
    const u = new URL(url.trim())

    // Normalize scheme and host to lowercase
    u.protocol = u.protocol.toLowerCase()
    u.hostname  = u.hostname.toLowerCase()

    // Remove tracking query params
    const paramsToDelete = []
    for (const key of u.searchParams.keys()) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        paramsToDelete.push(key)
      }
    }
    paramsToDelete.forEach(k => u.searchParams.delete(k))

    // Sort remaining params for stability
    u.searchParams.sort()

    // Remove fragment (anchors) — they don't identify unique content
    u.hash = ''

    // Remove trailing slash from path for consistency
    if (u.pathname.endsWith('/') && u.pathname.length > 1) {
      u.pathname = u.pathname.slice(0, -1)
    }

    return u.toString()
  } catch {
    // Not a valid URL — return cleaned string
    return url.trim()
  }
}

/**
 * Checks whether a live_intelligence record with the given content hash
 * already exists in the database (within the TTL window).
 *
 * @param {object} supabase       — Supabase admin client
 * @param {string} contentHash    — 16-char hash from computeContentHash()
 * @param {number} windowHours    — How far back to look (default: 96h = 4 days)
 * @returns {Promise<{exists: boolean, existingId: string|null}>}
 */
export async function isDuplicateByHash(supabase, contentHash, windowHours = 96) {
  try {
    const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('live_intelligence')
      .select('id')
      .eq('content_hash', contentHash)
      .gte('ingested_at', cutoff)
      .limit(1)

    if (error) {
      // On DB error, allow insertion (fail open — better to have a duplicate than miss an article)
      console.warn('[contentHash] dedup check error:', error.message)
      return { exists: false, existingId: null }
    }

    const exists = (data?.length || 0) > 0
    return { exists, existingId: exists ? data[0].id : null }
  } catch (e) {
    console.warn('[contentHash] dedup check exception:', e.message)
    return { exists: false, existingId: null }
  }
}

/**
 * Checks whether a live_intelligence record with the given canonical URL
 * already exists in the database (within the TTL window).
 *
 * @param {object} supabase       — Supabase admin client
 * @param {string} canonicalUrl   — normalized URL from normalizeUrl()
 * @param {number} windowHours    — How far back to look (default: 96h = 4 days)
 * @returns {Promise<{exists: boolean, existingId: string|null}>}
 */
export async function isDuplicateByUrl(supabase, canonicalUrl, windowHours = 96) {
  if (!canonicalUrl) return { exists: false, existingId: null }
  try {
    const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('live_intelligence')
      .select('id')
      .eq('canonical_url', canonicalUrl)
      .gte('ingested_at', cutoff)
      .limit(1)

    if (error) {
      console.warn('[contentHash] url dedup check error:', error.message)
      return { exists: false, existingId: null }
    }

    const exists = (data?.length || 0) > 0
    return { exists, existingId: exists ? data[0].id : null }
  } catch (e) {
    console.warn('[contentHash] url dedup exception:', e.message)
    return { exists: false, existingId: null }
  }
}

/**
 * Full deduplication check: URL first (most reliable), then content hash.
 * Returns the ID of the existing duplicate if found, or null if novel.
 *
 * @param {object} supabase
 * @param {string} sourceUrl      — raw article URL
 * @param {string} contentHash    — from computeContentHash()
 * @param {number} windowHours
 * @returns {Promise<string|null>}  existingId or null
 */
export async function findDuplicate(supabase, sourceUrl, contentHash, windowHours = 96) {
  const canonical = normalizeUrl(sourceUrl)

  // Primary: URL match
  const urlCheck = await isDuplicateByUrl(supabase, canonical, windowHours)
  if (urlCheck.exists) return urlCheck.existingId

  // Fallback: content hash match (catches re-syndicated articles with different URLs)
  const hashCheck = await isDuplicateByHash(supabase, contentHash, windowHours)
  if (hashCheck.exists) return hashCheck.existingId

  return null
}
