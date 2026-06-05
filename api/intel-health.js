/**
 * GET /api/intel-health
 * Auth: admin/developer only
 *
 * Operational intelligence health dashboard endpoint.
 * Returns real-time metrics on:
 *   - ingestion pipeline status
 *   - embedding integrity
 *   - retrieval validation
 *   - feed freshness
 *   - dead letter queue
 *   - stale intelligence detection
 */

import { createClient } from '@supabase/supabase-js'
import { checkRetrievalHealth } from './_intel.js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!['admin', 'developer'].includes(profile?.role))
    return res.status(403).json({ error: 'Admin only' })

  try {
    // ── Core retrieval health ─────────────────────────────────────────────────
    const retrieval = await checkRetrievalHealth(supabase)

    // ── Ingestion status breakdown ────────────────────────────────────────────
    const { data: ingestionStats } = await supabase
      .from('cairo_knowledge')
      .select('ingestion_status, embedding_status, type, created_at')

    const statusCounts = { active: 0, partial: 0, pending: 0, failed: 0 }
    const embeddingCounts = { done: 0, pending: 0, failed: 0 }
    const typeCounts = { report: 0, sop: 0, case: 0 }

    for (const row of (ingestionStats || [])) {
      if (statusCounts[row.ingestion_status] !== undefined) statusCounts[row.ingestion_status]++
      if (embeddingCounts[row.embedding_status] !== undefined) embeddingCounts[row.embedding_status]++
      if (typeCounts[row.type] !== undefined) typeCounts[row.type]++
    }

    // ── Dead letter queue ─────────────────────────────────────────────────────
    const { data: deadLetters } = await supabase
      .from('cairo_dead_letter')
      .select('failure_stage, created_at, resolved')
      .order('created_at', { ascending: false })
      .limit(100)

    const unresolved = (deadLetters || []).filter(d => !d.resolved)
    const byStage = {}
    for (const d of unresolved) {
      byStage[d.failure_stage] = (byStage[d.failure_stage] || 0) + 1
    }

    // ── Recent ingestion log ──────────────────────────────────────────────────
    const { data: recentLog } = await supabase
      .from('cairo_ingestion_log')
      .select('event, detail, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    // ── Stale intelligence detection ──────────────────────────────────────────
    const { data: staleCheck } = await supabase
      .from('cairo_knowledge')
      .select('id, title, created_at')
      .eq('intelligence_enabled', true)
      .lt('created_at', new Date(Date.now() - 90 * 86400000).toISOString())  // > 90 days old
      .limit(10)

    // ── Embedding integrity ───────────────────────────────────────────────────
    const embeddingIntegrity = {
      total:     retrieval.doc_count,
      embedded:  retrieval.embedded_count,
      missing:   retrieval.doc_count - retrieval.embedded_count,
      pct:       retrieval.doc_count
        ? Math.round((retrieval.embedded_count / retrieval.doc_count) * 100)
        : 0,
    }

    // ── Overall health score (0–100) ─────────────────────────────────────────
    let score = 100
    if (!retrieval.vector_ok)                     score -= 30
    if (!retrieval.keyword_ok)                    score -= 20
    if (embeddingIntegrity.missing > 0)           score -= Math.min(20, embeddingIntegrity.missing * 2)
    if (unresolved.length > 0)                    score -= Math.min(15, unresolved.length * 3)
    if (statusCounts.failed > 0)                  score -= Math.min(10, statusCounts.failed * 2)
    if (retrieval.fresh_7d === 0 && retrieval.doc_count > 0) score -= 5

    return res.json({
      ok:          true,
      health_score: Math.max(0, score),
      healthy:     score >= 70,
      timestamp:   new Date().toISOString(),

      retrieval: {
        vector_ok:       retrieval.vector_ok,
        keyword_ok:      retrieval.keyword_ok,
        vector_results:  retrieval.vector_results,
        errors:          retrieval.errors,
      },

      documents: {
        total:              retrieval.doc_count,
        retrieval_ready:    retrieval.retrieval_ready_count,
        fresh_7d:           retrieval.fresh_7d,
        fresh_30d:          retrieval.fresh_30d,
        stale_90d:          staleCheck?.length || 0,
        stale_examples:     staleCheck?.slice(0, 3).map(d => d.title) || [],
        by_status:          statusCounts,
        by_type:            typeCounts,
      },

      embeddings: embeddingIntegrity,

      dead_letter: {
        unresolved:     unresolved.length,
        by_stage:       byStage,
        recent:         (deadLetters || []).slice(0, 5).map(d => ({
          stage:      d.failure_stage,
          resolved:   d.resolved,
          created_at: d.created_at,
        })),
      },

      ingestion: {
        by_embedding_status: embeddingCounts,
        recent_events:       (recentLog || []).slice(0, 10).map(e => ({
          event:      e.event,
          created_at: e.created_at,
        })),
      },
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
