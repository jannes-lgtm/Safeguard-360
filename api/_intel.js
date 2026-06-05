/**
 * _intel.js — Unified Operational Intelligence Core
 * ─────────────────────────────────────────────────────────────────────────────
 * Single retrieval layer consumed by ALL CAIRO endpoints:
 *   - askAssistant (CAIRO chat)
 *   - journey-agent (trip intelligence)
 *   - cairo-context (API endpoint)
 *   - country-risk / comprehensiveRiskScan
 *   - generate-briefing
 *
 * Architecture:
 *   query → query embedding → vector search → keyword fallback →
 *   freshness weighting → reranking → context compression → attribution
 *
 * Every result carries: source title, type, similarity, created_at, countries.
 * Callers inject the formatted block directly into system prompts.
 */

import { generateQueryEmbedding } from './_embeddings.js'
import { EMBEDDING_DIMS }         from './_embedding-config.js'

// ── Freshness decay ───────────────────────────────────────────────────────────
// Score multiplier based on age of document.
// Recent intel (< 7 days) gets full weight; 6-month-old gets 0.6×.
function freshnessMultiplier(createdAt) {
  if (!createdAt) return 0.75
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 86400)
  if (ageDays < 7)   return 1.0
  if (ageDays < 30)  return 0.95
  if (ageDays < 90)  return 0.85
  if (ageDays < 180) return 0.75
  return 0.65
}

// ── Source confidence ranking ─────────────────────────────────────────────────
const SOURCE_RANK = { sop: 1.0, report: 0.95, case: 0.90 }

// ── Simple keyword scorer (fallback when no vector search) ───────────────────
function keywordScore(doc, tokens, country, region) {
  let score = 0
  const dc = (doc.countries || []).map(c => c.toLowerCase())
  const dr = (doc.regions   || []).map(r => r.toLowerCase())
  const dt = (doc.threat_categories || []).map(t => t.toLowerCase())
  const dg = (doc.tags || []).map(t => t.toLowerCase())
  const text = `${doc.title} ${doc.summary} ${(doc.content || '').slice(0, 500)}`.toLowerCase()

  if (dc.length === 0 && dr.length === 0) score += 0.5   // global doc
  if (country) {
    const cl = country.toLowerCase()
    if (dc.some(c => c.includes(cl) || cl.includes(c))) score += 4
  }
  if (region) {
    const rl = region.toLowerCase()
    if (dr.some(r => r.includes(rl) || rl.includes(r))) score += 2
  }
  for (const t of tokens) {
    if (text.includes(t)) score += 0.5
    if (dt.some(d => d.includes(t)) || dg.some(d => d.includes(t))) score += 1
  }
  return score
}

// ── Main retrieval function ───────────────────────────────────────────────────
/**
 * Retrieve grounded intelligence for a query/context pair.
 *
 * @param {object} supabase     Supabase client (service role)
 * @param {object} opts
 * @param {string} opts.query         Natural language query (used for vector search)
 * @param {string} [opts.country]     Destination country
 * @param {string} [opts.region]      Destination region
 * @param {string[]} [opts.threats]   Threat categories of interest
 * @param {string} [opts.org_id]      Filter to org or null for platform-wide
 * @param {number} [opts.limit]       Max docs to return (default 6)
 * @param {number} [opts.threshold]   Vector similarity threshold (default 0.35)
 * @returns {Promise<IntelResult>}
 */
export async function retrieveIntelligence(supabase, opts = {}) {
  const {
    query    = '',
    country  = null,
    region   = null,
    threats  = [],
    org_id   = null,
    limit    = 6,
    threshold = 0.35,
  } = opts

  const t0 = Date.now()
  let docs = []
  let method = 'keyword'
  let queryEmbedding = null

  // ── Path A: Vector search ─────────────────────────────────────────────────
  if (query && process.env.VOYAGE_API_KEY) {
    try {
      const queryText = [query, country, region, ...threats].filter(Boolean).join(' ')
      queryEmbedding  = await generateQueryEmbedding(queryText)
    } catch { /* fall through */ }

    if (queryEmbedding) {
      try {
        const { data: vectorDocs, error } = await supabase.rpc('match_cairo_knowledge', {
          query_embedding: queryEmbedding,
          match_threshold: threshold,
          match_count:     limit * 2,   // over-fetch for reranking
        })
        if (!error && vectorDocs?.length) {
          docs   = vectorDocs
          method = 'vector'
        }
      } catch { /* fall through to keyword */ }
    }
  }

  // ── Path B: Keyword/filter search ────────────────────────────────────────
  if (!docs.length) {
    try {
      let q = supabase
        .from('cairo_knowledge')
        .select('id, type, title, content, summary, countries, regions, threat_categories, tags, doc_tier, created_at, org_id, analyst_confidence, is_suppressed')
        .eq('retrieval_ready',      true)
        .eq('intelligence_enabled', true)
        .limit(80)

      if (org_id) q = q.or(`org_id.is.null,org_id.eq.${org_id}`)
      else        q = q.is('org_id', null)

      const { data, error } = await q
      if (!error && data?.length) {
        const tokens = query.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(t => t.length > 3)
        docs = data
          .filter(d => !d.is_suppressed)
          .map(d => ({ ...d, _kw: keywordScore(d, tokens, country, region) }))
          .filter(d => d._kw > 0 || !country)
          .sort((a, b) => b._kw - a._kw)
      }
    } catch { /* return empty */ }
  }

  if (!docs.length) return { docs: [], method, durationMs: Date.now() - t0, queryEmbedding }

  // ── Reranking: apply freshness + source confidence ────────────────────────
  const ranked = docs
    .filter(d => !d.is_suppressed)
    .map(d => {
      const similarity  = d.similarity    ?? null
      const freshness   = freshnessMultiplier(d.created_at)
      const srcConf     = SOURCE_RANK[d.type] ?? 0.85
      const analystConf = d.analyst_confidence ?? 1.0
      const finalScore  = (similarity ?? (d._kw || 0.5)) * freshness * srcConf * analystConf
      return { ...d, _score: finalScore, similarity, freshness }
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)

  // ── Apply org filter for vector results ───────────────────────────────────
  const filtered = org_id
    ? ranked.filter(d => !d.org_id || d.org_id === org_id)
    : ranked

  return {
    docs:          filtered,
    method,
    durationMs:    Date.now() - t0,
    queryEmbedding,
    total_fetched: docs.length,
  }
}

// ── Format for system prompt injection ───────────────────────────────────────
/**
 * Format retrieved intel docs into a system prompt block with full attribution.
 *
 * @param {object[]} docs   Ranked intel docs from retrieveIntelligence()
 * @param {string}   method 'vector' | 'keyword'
 * @returns {string}        Formatted block for system prompt injection
 */
export function formatIntelBlock(docs, method = 'keyword') {
  if (!docs?.length) return ''

  const lines = [
    `## OPERATIONAL INTELLIGENCE — PROPRIETARY KNOWLEDGE BASE`,
    `Retrieval method: ${method}. ${docs.length} source(s). Reference by name in your response.`,
    `These reports take precedence over general knowledge. Cite titles when used.`,
    '',
  ]

  for (const [i, doc] of docs.entries()) {
    const age = doc.created_at
      ? `${Math.round((Date.now() - new Date(doc.created_at).getTime()) / 86400000)}d ago`
      : 'unknown age'
    const sim = doc.similarity != null ? ` · ${(doc.similarity * 100).toFixed(0)}% match` : ''
    const geo = doc.countries?.length ? ` · ${doc.countries.slice(0, 3).join(', ')}` : ''

    lines.push(`### [${i + 1}] ${doc.title}`)
    lines.push(`Type: ${doc.type || 'report'} · ${age}${geo}${sim}`)
    if (doc.summary) lines.push(`Summary: ${doc.summary}`)
    lines.push(doc.content?.slice(0, 1800) || doc.excerpt || '')
    lines.push('---')
  }

  return lines.join('\n')
}

// ── Retrieval health check ────────────────────────────────────────────────────
/**
 * Run a smoke test against the vector index and return health metrics.
 * Called by intel-health.js and after ingestion.
 */
export async function checkRetrievalHealth(supabase) {
  const results = { vector_ok: false, keyword_ok: false, doc_count: 0, embedded_count: 0, errors: [] }

  try {
    // Count docs
    const { data: counts } = await supabase
      .from('cairo_knowledge')
      .select('id, embedding, retrieval_ready, intelligence_enabled, created_at')
      .eq('intelligence_enabled', true)
    results.doc_count      = counts?.length || 0
    results.embedded_count = counts?.filter(d => d.embedding !== null).length || 0
    results.retrieval_ready_count = counts?.filter(d => d.retrieval_ready).length || 0

    // Freshness breakdown
    const now = Date.now()
    results.fresh_7d  = counts?.filter(d => d.created_at && (now - new Date(d.created_at).getTime()) < 7 * 86400000).length || 0
    results.fresh_30d = counts?.filter(d => d.created_at && (now - new Date(d.created_at).getTime()) < 30 * 86400000).length || 0
  } catch (e) {
    results.errors.push(`count_query: ${e.message}`)
  }

  // Vector smoke test
  if (process.env.VOYAGE_API_KEY && results.embedded_count > 0) {
    try {
      const testEmb = await generateQueryEmbedding('security threat travel advisory')
      if (testEmb) {
        const { data, error } = await supabase.rpc('match_cairo_knowledge', {
          query_embedding: testEmb,
          match_threshold: 0.0,
          match_count:     3,
        })
        results.vector_ok      = !error && Array.isArray(data)
        results.vector_results = data?.length || 0
        if (error) results.errors.push(`vector_search: ${error.message}`)
      }
    } catch (e) {
      results.errors.push(`vector_smoke: ${e.message}`)
    }
  }

  // Keyword smoke test
  try {
    const { data, error } = await supabase
      .from('cairo_knowledge')
      .select('id')
      .eq('retrieval_ready', true)
      .eq('intelligence_enabled', true)
      .limit(1)
    results.keyword_ok = !error && Array.isArray(data)
    if (error) results.errors.push(`keyword_search: ${error.message}`)
  } catch (e) {
    results.errors.push(`keyword_smoke: ${e.message}`)
  }

  results.healthy = results.keyword_ok && results.errors.length === 0
  return results
}
