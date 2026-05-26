/**
 * POST /api/backfill-embeddings
 * Auth: developer/admin only
 *
 * Generates Voyage AI embeddings for all cairo_knowledge rows
 * that don't have one yet. Safe to call multiple times.
 */

import { createClient }  from '@supabase/supabase-js'
import { generateEmbedding, buildEmbeddingText } from './_embeddings.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!['admin', 'developer'].includes(profile?.role)) {
    return res.status(403).json({ error: 'Admin only' })
  }

  if (!process.env.VOYAGE_API_KEY) {
    return res.status(400).json({ error: 'VOYAGE_API_KEY not configured' })
  }

  // ── Quick Voyage connectivity test ────────────────────────────────────────
  try {
    const testRes = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
      body: JSON.stringify({ model: 'voyage-3-lite', input: ['test'], input_type: 'document' }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!testRes.ok) {
      const errText = await testRes.text().catch(() => '')
      return res.status(400).json({
        error: `Voyage API key rejected (HTTP ${testRes.status}): ${errText.slice(0, 300)}`,
      })
    }
  } catch (e) {
    return res.status(400).json({ error: `Voyage connectivity failed: ${e.message}` })
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Fetch all docs without embeddings
  const { data: docs, error } = await supabase
    .from('cairo_knowledge')
    .select('id, title, content, summary, countries, regions, threat_categories, tags')
    .is('embedding', null)
    .not('content', 'is', null)
    .limit(200)

  if (error) return res.status(500).json({ error: error.message })
  if (!docs?.length) return res.json({ ok: true, processed: 0, message: 'All documents already have embeddings.' })

  const results = { success: 0, failed: 0, errors: [] }

  for (const doc of docs) {
    try {
      const text = buildEmbeddingText(doc)

      // Guard: skip docs with no usable text
      if (!text || text.trim().length < 5) {
        results.failed++
        results.errors.push(`${doc.id} "${doc.title}": no usable text (content empty?)`)
        continue
      }

      const embedding = await generateEmbedding(text)

      const { error: updateErr } = await supabase
        .from('cairo_knowledge')
        .update({
          embedding:        embedding,
          embedding_status: 'done',
          retrieval_ready:  true,
          intelligence_enabled: true,
          is_active:        true,
          indexed_at:       new Date().toISOString(),
        })
        .eq('id', doc.id)

      if (updateErr) {
        results.failed++
        results.errors.push(`${doc.title}: ${updateErr.message}`)
      } else {
        results.success++
      }
    } catch (err) {
      results.failed++
      results.errors.push(`${doc.title}: ${err.message}`)
    }
  }

  return res.json({
    ok:        true,
    total:     docs.length,
    success:   results.success,
    failed:    results.failed,
    errors:    results.errors.slice(0, 10),
  })
}
