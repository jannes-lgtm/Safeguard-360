/**
 * cairo-context — retrieve relevant knowledge base entries for CAIRO injection.
 *
 * GET /api/cairo-context
 *   ?country=Kenya
 *   &region=East+Africa
 *   &threats=close+protection,kidnap+prevention   (comma-separated, optional)
 *   &type=sop|case|all                            (default: all)
 *   &org_id=uuid                                  (optional, includes org-specific + global)
 *   &limit=8                                      (default: 8)
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const {
    country,
    region,
    threats,
    type   = 'all',
    org_id,
    limit  = '8',
  } = req.query

  const limitN = Math.min(parseInt(limit) || 8, 20)

  try {
    let query = supabase
      .from('cairo_knowledge')
      .select('id, type, title, content, summary, countries, regions, threat_categories, tags, outcome')
      .eq('is_active', true)
      .order('type', { ascending: true }) // sop before case alphabetically — reversed below
      .limit(limitN)

    if (type !== 'all') query = query.eq('type', type)

    // Org filter: platform-wide (org_id IS NULL) always included; org-specific added if org_id provided
    if (org_id) {
      query = query.or(`org_id.is.null,org_id.eq.${org_id}`)
    } else {
      query = query.is('org_id', null)
    }

    const { data, error } = await query
    if (error) throw error

    // Score and sort client-side for relevance
    const country_lc  = country?.toLowerCase() || ''
    const region_lc   = region?.toLowerCase()  || ''
    const threatList  = threats
      ? threats.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      : []

    const scored = (data || []).map(doc => {
      let score = 0
      const docCountries = (doc.countries || []).map(c => c.toLowerCase())
      const docRegions   = (doc.regions   || []).map(r => r.toLowerCase())
      const docThreats   = (doc.threat_categories || []).map(t => t.toLowerCase())
      const docTags      = (doc.tags || []).map(t => t.toLowerCase())

      // Global docs (no country/region) always relevant
      if (docCountries.length === 0 && docRegions.length === 0) score += 1

      // Country match
      if (country_lc && docCountries.some(c => c.includes(country_lc) || country_lc.includes(c))) score += 4

      // Region match
      if (region_lc && docRegions.some(r => r.includes(region_lc) || region_lc.includes(r))) score += 2

      // Threat category match
      if (threatList.length > 0) {
        const matches = threatList.filter(t =>
          docThreats.some(dt => dt.includes(t) || t.includes(dt)) ||
          docTags.some(dt => dt.includes(t) || t.includes(dt))
        )
        score += matches.length * 3
      }

      // SOPs get a slight priority over cases as baseline reference
      if (doc.type === 'sop') score += 0.5

      return { ...doc, _score: score }
    })

    // Filter out zero-score docs unless very few results, then sort by score desc
    const relevant = scored
      .filter(d => d._score > 0 || scored.length <= 3)
      .sort((a, b) => b._score - a._score)
      .slice(0, limitN)
      .map(({ _score, ...doc }) => doc) // strip internal score field

    return res.json({ docs: relevant, total: relevant.length, country, region })
  } catch (err) {
    console.error('[cairo-context]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
