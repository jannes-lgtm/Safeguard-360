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
 *   value: { overall_severity, summary, key_risks, ... }
 *
 * Response: { [countryNameLower]: 'Critical|High|Medium|Low', _count, _ttl }
 * Cache-Control: 10 minutes (map refresh cadence)
 */

import { getSupabaseAdmin } from './_supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()

  res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=120')

  try {
    const sb = getSupabaseAdmin()

    // Pull all non-expired AI country risk entries in one query
    const { data, error } = await sb
      .from('api_cache')
      .select('key, value')
      .ilike('key', 'country-risk:ai:%')
      .gt('expires_at', new Date().toISOString())

    if (error) {
      console.error('[country-risk-summary] db error:', error.message)
      return res.status(500).json({ error: error.message })
    }

    const risks = {}
    for (const row of data || []) {
      // key = "country-risk:ai:nigeria"  →  countryKey = "nigeria"
      const countryKey = row.key.replace('country-risk:ai:', '').trim()
      const severity   = row.value?.overall_severity

      // Only include valid severity values
      if (severity && ['Critical', 'High', 'Medium', 'Low'].includes(severity)) {
        risks[countryKey] = severity
      }
    }

    return res.status(200).json({
      risks,
      _count: Object.keys(risks).length,
      _ts:    new Date().toISOString(),
    })
  } catch (err) {
    console.error('[country-risk-summary]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
