/**
 * api/ingest-feeds.js
 *
 * CAIRO Live Intelligence Ingestion Pipeline
 * Vercel Cron: every hour (0 * * * *)
 *
 * Continuously fetches RSS/news feeds for all monitored locations,
 * normalizes them into structured intelligence objects, stores them
 * in Supabase, and computes event correlation clusters.
 *
 * This pre-populates the live_intelligence and event_correlations tables
 * so the Context Assembly Engine has rich, pre-processed data available
 * immediately when a journey analysis is triggered.
 *
 * Batch processing: 5 locations per wave, 300ms between waves,
 * to avoid overwhelming RSS sources and Supabase.
 */

import { fetchArticlesForCountry } from './_claudeSynth.js'
import { normalizeArticles }       from './_intelNormalizer.js'
import { correlateEvents }         from './_eventCorrelator.js'
import { adapt }                   from './_adapter.js'

const SUPABASE_URL = () => process.env.SUPABASE_URL || ''
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// ── Monitored locations ────────────────────────────────────────────────────────
// Continuously monitored — all high-risk and operationally active environments
const MONITORED_LOCATIONS = [
  // Sub-Saharan Africa — Tier A (highest operational activity)
  'Nigeria', 'Kenya', 'South Africa', 'Ethiopia',
  'Democratic Republic of Congo', 'Sudan', 'Somalia',
  'Mali', 'Burkina Faso', 'Niger', 'Mozambique',

  // Sub-Saharan Africa — Tier B
  'Tanzania', 'Uganda', 'Ghana', 'Senegal', 'Rwanda',
  'Zimbabwe', 'Cameroon', 'Chad', 'Côte d\'Ivoire',

  // North Africa
  'Libya', 'Egypt', 'Tunisia', 'Algeria',

  // MENA
  'Lebanon', 'Yemen', 'Iraq', 'Syria', 'Iran', 'Palestine',

  // Gulf
  'UAE', 'Saudi Arabia', 'Kuwait',

  // Other active environments
  'Afghanistan', 'Pakistan', 'Myanmar',
]

const INTEL_TTL_HOURS  = 72      // Intelligence expires after 72 hours
const BATCH_SIZE       = 5       // Locations per processing wave
const BATCH_DELAY_MS   = 400     // Delay between waves
const MIN_SEVERITY     = 2       // Don't store trivial events (severity < 2)
const MIN_RELIABILITY  = 0.28    // Don't store low-reliability objects

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function sbPost(table, data, upsertOn) {
  const url = `${SUPABASE_URL()}/rest/v1/${table}`
  const headers = {
    apikey:          SERVICE_KEY(),
    Authorization:   `Bearer ${SERVICE_KEY()}`,
    'Content-Type':  'application/json',
    Prefer:          'return=minimal',
  }
  if (upsertOn) headers['Prefer'] = `resolution=ignore-duplicates,return=minimal`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body:   JSON.stringify(data),
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch {
    return false
  }
}

async function sbPatch(table, filter, data) {
  const url = `${SUPABASE_URL()}/rest/v1/${table}?${new URLSearchParams(filter)}`
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        apikey:          SERVICE_KEY(),
        Authorization:   `Bearer ${SERVICE_KEY()}`,
        'Content-Type':  'application/json',
        Prefer:          'return=minimal',
      },
      body:   JSON.stringify(data),
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}

// ── Expire old intelligence ───────────────────────────────────────────────────
async function expireOldIntel() {
  const cutoff = new Date(Date.now() - INTEL_TTL_HOURS * 60 * 60 * 1000).toISOString()
  const [ok1, ok2] = await Promise.all([
    sbPatch('live_intelligence',  { 'ingested_at': `lt.${cutoff}`, 'is_active': 'eq.true' }, { is_active: false }),
    sbPatch('event_correlations', { 'latest_signal_at': `lt.${cutoff}`, 'is_active': 'eq.true' }, { is_active: false }),
  ])
  return { intel: ok1, correlations: ok2 }
}

// ── Process a single location ─────────────────────────────────────────────────
async function ingestLocation(location) {
  const now     = Date.now()
  const result  = { location, fetched: 0, stored: 0, clusters: 0, error: null }

  try {
    // 1. Fetch articles
    const articles = await fetchArticlesForCountry(location)
    if (!articles?.length) return result
    result.fetched = articles.length

    // 2. Normalize
    const normalized = normalizeArticles(articles, location, now)

    // 3. Filter noise — only store operationally significant events
    const significant = normalized.filter(obj =>
      obj.severity >= MIN_SEVERITY &&
      obj.source_reliability >= MIN_RELIABILITY
    )
    if (!significant.length) return result

    // 4. Store in live_intelligence (ignore duplicates on raw_title + country)
    const expiresAt = new Date(now + INTEL_TTL_HOURS * 60 * 60 * 1000).toISOString()
    const ingestedAt = new Date(now).toISOString()

    for (const obj of significant) {
      // Strip runtime-only fields before inserting
      const { _raw_text, relevance_score, ...clean } = obj
      const ok = await sbPost('live_intelligence', {
        ...clean,
        expires_at:  expiresAt,
        ingested_at: ingestedAt,
        is_active:   true,
      })
      if (ok) result.stored++
    }

    // 5. Correlate events for this location
    const clusters = correlateEvents(significant)
    for (const cluster of clusters) {
      const ok = await sbPost('event_correlations', {
        event_type:          cluster.event_type,
        country:             cluster.country,
        city:                cluster.city,
        signal_count:        cluster.event_count,
        corroboration_score: cluster.corroboration_score,
        severity_consensus:  cluster.severity_consensus,
        movement_impact:     cluster.movement_impact,
        first_signal_at:     cluster.first_signal_at,
        latest_signal_at:    cluster.latest_signal_at,
        is_active:           true,
      })
      if (ok) result.clusters++
    }

    console.log(`[ingest] ${location}: fetched=${result.fetched} stored=${result.stored} clusters=${result.clusters}`)

  } catch (err) {
    result.error = err.message
    console.error(`[ingest] ${location} error:`, err.message)
  }

  return result
}

// ── Delay helper ──────────────────────────────────────────────────────────────
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// ── Main handler ──────────────────────────────────────────────────────────────
async function _handler(req, res) {
  // Authorization: Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const cronSecret  = process.env.CRON_SECRET || ''
  const authHeader  = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()

  if (cronSecret && authHeader !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized — invalid cron secret' })
  }

  const start = Date.now()
  console.log(`[ingest] CAIRO feed ingestion pipeline started — ${MONITORED_LOCATIONS.length} locations`)

  // Step 1: Expire old intelligence
  await expireOldIntel()

  // Step 2: Process in batches
  const allResults = []

  for (let i = 0; i < MONITORED_LOCATIONS.length; i += BATCH_SIZE) {
    const batch       = MONITORED_LOCATIONS.slice(i, i + BATCH_SIZE)
    const batchResult = await Promise.allSettled(batch.map(ingestLocation))

    allResults.push(
      ...batchResult.filter(r => r.status === 'fulfilled').map(r => r.value)
    )

    // Don't hammer RSS sources
    if (i + BATCH_SIZE < MONITORED_LOCATIONS.length) {
      await delay(BATCH_DELAY_MS)
    }
  }

  // Step 3: Summary
  const totalFetched  = allResults.reduce((s, r) => s + (r.fetched  || 0), 0)
  const totalStored   = allResults.reduce((s, r) => s + (r.stored   || 0), 0)
  const totalClusters = allResults.reduce((s, r) => s + (r.clusters || 0), 0)
  const errors        = allResults.filter(r => r.error).length
  const elapsed       = Date.now() - start

  console.log(`[ingest] Complete — fetched=${totalFetched} stored=${totalStored} clusters=${totalClusters} errors=${errors} elapsed=${elapsed}ms`)

  return res.status(200).json({
    ok:                      true,
    locations_processed:     MONITORED_LOCATIONS.length,
    articles_fetched:        totalFetched,
    intel_objects_stored:    totalStored,
    correlation_clusters:    totalClusters,
    locations_with_errors:   errors,
    elapsed_ms:              elapsed,
    timestamp:               new Date().toISOString(),
  })
}

export const handler = adapt(_handler)
export default _handler
