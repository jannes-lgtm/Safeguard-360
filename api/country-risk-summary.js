/**
 * api/country-risk-summary.js
 *
 * GET /api/country-risk-summary
 *
 * Returns all cached AI risk assessments for the choropleth heat map.
 * Reads directly from the api_cache table — zero AI calls, lightweight DB read.
 *
 * Each entry was written by country-risk.js after AI synthesis:
 *   key:   "country-risk:ai:{country_lowercase}"
 *   value: { overall_severity, summary, key_risks, last_generated_at, source_count, ... }
 *
 * Response includes:
 *   risks  — live (non-expired) entries: { countryLower: severity }
 *   stale  — recently-expired entries (≤6h old): { countryLower: severity }
 *            shown on the Heat Map with a visual stale indicator
 *   meta   — per-country audit metadata
 *   _count, _stale_count, _ts
 *
 * Cache-Control: 10 minutes (map refresh cadence).
 * Stale window: serve expired entries up to 6 hours old rather than falling
 * back to the hardcoded riskData.js static baseline.
 */

import { getSupabaseAdmin } from './_supabase.js'

const STALE_WINDOW_MS = 6 * 60 * 60 * 1000   // 6 hours — how long to serve stale data
const VALID_SEVERITIES = new Set(['Critical', 'High', 'Medium', 'Low'])

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Reduce browser cache to 5 minutes — live entries now stay valid 3 hours so
  // the map refreshes more promptly when warmup writes a new entry.
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')

  try {
    const sb  = getSupabaseAdmin()
    const now = new Date()

    // ── Live entries (not yet expired) ────────────────────────────────────────
    const { data: liveData, error: liveErr } = await sb
      .from('api_cache')
      .select('key, value, created_at, expires_at')
      .ilike('key', 'country-risk:ai:%')
      .gt('expires_at', now.toISOString())

    if (liveErr) {
      console.error('[country-risk-summary] live query error:', liveErr.message)
      return res.status(500).json({ error: liveErr.message })
    }

    // ── Stale entries (expired within the last STALE_WINDOW_MS) ──────────────
    const staleFrom = new Date(now.getTime() - STALE_WINDOW_MS).toISOString()
    const { data: staleData } = await sb
      .from('api_cache')
      .select('key, value, created_at, expires_at')
      .ilike('key', 'country-risk:ai:%')
      .lt('expires_at', now.toISOString())
      .gt('expires_at', staleFrom)

    // ── Build response maps ───────────────────────────────────────────────────
    const risks = {}   // live
    const stale = {}   // expired but recently cached — shown with warning
    const meta  = {}   // audit fields per country

    for (const row of liveData || []) {
      const countryKey = row.key.replace('country-risk:ai:', '').trim()
      const v          = row.value
      const severity   = v?.overall_severity

      if (severity && VALID_SEVERITIES.has(severity)) {
        risks[countryKey] = severity
        meta[countryKey]  = {
          cached_at:          row.created_at,
          expires_at:         row.expires_at,
          last_generated_at:  v.last_generated_at  || null,
          last_refreshed_at:  v.last_refreshed_at  || null,
          source_count:       v.source_count       ?? null,
          intelligence_count: v.intelligence_count ?? null,
        }
      }
    }

    // Only include stale entries that don't have a live replacement
    for (const row of staleData || []) {
      const countryKey = row.key.replace('country-risk:ai:', '').trim()
      if (risks[countryKey]) continue   // live entry takes precedence

      const v        = row.value
      const severity = v?.overall_severity

      if (severity && VALID_SEVERITIES.has(severity)) {
        stale[countryKey] = severity
        meta[countryKey]  = {
          cached_at:          row.created_at,
          expires_at:         row.expires_at,
          last_generated_at:  v.last_generated_at  || null,
          last_refreshed_at:  v.last_refreshed_at  || null,
          source_count:       v.source_count       ?? null,
          intelligence_count: v.intelligence_count ?? null,
          is_stale:           true,
          stale_age_minutes:  Math.round((now.getTime() - new Date(row.expires_at).getTime()) / 60000),
        }
      }
    }

    return res.status(200).json({
      risks,
      stale,
      meta,
      _count:       Object.keys(risks).length,
      _stale_count: Object.keys(stale).length,
      _ts:          now.toISOString(),
    })
  } catch (err) {
    console.error('[country-risk-summary]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
