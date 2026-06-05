/**
 * cairo-context — retrieve relevant knowledge base entries for CAIRO injection.
 *
 * GET /api/cairo-context
 *   ?query=What is the security situation in Kenya   (natural language — enables vector search)
 *   ?country=Kenya
 *   ?region=East+Africa
 *   ?threats=close+protection,kidnap+prevention      (comma-separated, optional)
 *   ?type=sop|case|report|all                        (default: all)
 *   ?org_id=uuid                                     (optional)
 *   ?limit=8                                         (default: 8)
 */

import { createClient }            from '@supabase/supabase-js'
import { generateQueryEmbedding }  from './_embeddings.js'
import { EMBEDDING_MODEL, EMBEDDING_DIMS } from './_embedding-config.js'
import { verifyAdminJwt }          from './_supabase.js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Auth — admin or developer JWT required (service role bypasses RLS on cairo_knowledge)
  const jwt = await verifyAdminJwt(req.headers['authorization'] || '')
  if (!jwt.ok) return res.status(jwt.status).json({ error: jwt.error })

  const {
    query,
    country,
    region,
    threats,
    type   = 'all',
    org_id,
    limit  = '8',
  } = req.query

  const limitN = Math.min(parseInt(limit) || 8, 20)

  try {
    const country_lc = country?.toLowerCase() || ''
    const region_lc  = region?.toLowerCase()  || ''
    const threatList = threats
      ? threats.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      : []

    let docs = []
    let method = 'keyword'

    // ── Path A: Vector search (if query provided and Voyage key set) ─────────
    if (query && process.env.VOYAGE_API_KEY) {
      const queryEmbedding = await generateQueryEmbedding(
        [query, country, region, threats].filter(Boolean).join(' ')
      ).catch(() => null)

      if (queryEmbedding) {
        // Build org filter for RPC call (PostgREST RPC doesn't support .or directly)
        const { data: vectorDocs, error: vecErr } = await supabase.rpc('match_cairo_knowledge', {
          query_embedding: queryEmbedding,
          match_threshold: 0.4,
          match_count:     limitN * 2,  // over-fetch, then filter by org
        })

        if (!vecErr && vectorDocs?.length) {
          // Apply org filter client-side
          docs = vectorDocs.filter(d => !org_id || !d.org_id || d.org_id === org_id)
          method = 'vector'
        }
      }
    }

    // ── Path B: Keyword / filter search (fallback or when no query) ──────────
    if (!docs.length) {
      let q = supabase
        .from('cairo_knowledge')
        .select('id, type, title, content, summary, countries, regions, threat_categories, tags, doc_tier')
        .eq('retrieval_ready', true)
        .eq('intelligence_enabled', true)
        .limit(Math.min(limitN * 3, 60))  // over-fetch for client-side scoring

      if (type !== 'all') q = q.eq('type', type)

      if (org_id) {
        q = q.or(`org_id.is.null,org_id.eq.${org_id}`)
      } else {
        q = q.is('org_id', null)
      }

      const { data, error } = await q
      if (error) throw error

      // Score client-side
      const scored = (data || []).map(doc => {
        let score = 0
        const dc = (doc.countries || []).map(c => c.toLowerCase())
        const dr = (doc.regions   || []).map(r => r.toLowerCase())
        const dt = (doc.threat_categories || []).map(t => t.toLowerCase())
        const dg = (doc.tags || []).map(t => t.toLowerCase())

        // No country/region = global doc — always relevant
        if (dc.length === 0 && dr.length === 0) score += 1
        if (country_lc && dc.some(c => c.includes(country_lc) || country_lc.includes(c))) score += 4
        if (region_lc  && dr.some(r => r.includes(region_lc)  || region_lc.includes(r)))  score += 2

        if (threatList.length) {
          const matches = threatList.filter(t =>
            dt.some(d => d.includes(t) || t.includes(d)) ||
            dg.some(d => d.includes(t) || t.includes(d))
          )
          score += matches.length * 3
        }

        if (doc.type === 'sop') score += 0.5
        return { ...doc, _score: score }
      })

      docs = scored
        .filter(d => d._score > 0 || scored.length <= 3)
        .sort((a, b) => b._score - a._score)
        .slice(0, limitN)
        .map(({ _score, ...d }) => d)
    }

    return res.json({
      docs,
      total:   docs.length,
      country,
      region,
      method,
      embedding_model: method === 'vector' ? EMBEDDING_MODEL : null,
      embedding_dims:  method === 'vector' ? EMBEDDING_DIMS  : null,
    })
  } catch (err) {
    console.error('[cairo-context]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
