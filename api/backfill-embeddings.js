/**
 * POST /api/backfill-embeddings
 * Auth: developer/admin only
 *
 * Generates Voyage AI embeddings for all cairo_knowledge rows
 * that don't have one yet. Safe to call multiple times.
 *
 * Returns full ingestion diagnostics per document.
 */

import { createClient }    from '@supabase/supabase-js'
import { generateEmbedding, buildEmbeddingText } from './_embeddings.js'
import { validateEmbedding, EMBEDDING_MODEL, EMBEDDING_DIMS, VOYAGE_EMBEDDINGS_URL } from './_embedding-config.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Dead-letter helper ────────────────────────────────────────────────────────
async function deadLetter({ document_id, document_title, failure_stage, failure_reason, raw_error }) {
  await supabase.from('cairo_dead_letter').insert({
    document_id,
    document_title,
    failure_stage,
    failure_reason,
    raw_error: raw_error?.slice(0, 2000),
  }).catch(() => {})
}

// ── Retrieval smoke test ──────────────────────────────────────────────────────
async function smokeTestRetrieval(embedding, docId) {
  try {
    const { data, error } = await supabase.rpc('match_cairo_knowledge', {
      query_embedding: embedding,
      match_threshold: 0.0,   // low threshold — just verify the search executes
      match_count:     1,
    })
    if (error) return { ok: false, error: error.message }
    const found = data?.some(d => d.id === docId)
    return { ok: true, neighbors: data?.length || 0, self_found: found }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!['admin', 'developer'].includes(profile?.role))
    return res.status(403).json({ error: 'Admin only' })

  if (!process.env.VOYAGE_API_KEY)
    return res.status(400).json({ error: 'VOYAGE_API_KEY not configured' })

  // ── Migration safety: verify DB column dimension matches config ───────────
  const { data: dimCheck } = await supabase.rpc('check_embedding_column_dims').catch(() => ({ data: null }))
  if (dimCheck && dimCheck.dims && dimCheck.dims !== EMBEDDING_DIMS) {
    return res.status(400).json({
      error: `Schema mismatch: DB column is vector(${dimCheck.dims}), config expects ${EMBEDDING_DIMS}. Run cairo-embeddings-v3.sql migration first.`,
      db_dims: dimCheck.dims,
      config_dims: EMBEDDING_DIMS,
    })
  }

  // ── Connectivity test ─────────────────────────────────────────────────────
  try {
    const testRes = await fetch(VOYAGE_EMBEDDINGS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: ['connectivity test'], input_type: 'document' }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!testRes.ok) {
      const errText = await testRes.text().catch(() => '')
      return res.status(400).json({
        error: `Voyage API rejected (HTTP ${testRes.status}): ${errText.slice(0, 300)}`,
        provider: 'voyageai',
        model: EMBEDDING_MODEL,
      })
    }
    const testData = await testRes.json()
    const testEmbedding = testData.data?.[0]?.embedding
    const testValid = validateEmbedding(testEmbedding)
    if (!testValid.ok) {
      return res.status(400).json({
        error: `Voyage connectivity test produced invalid embedding: ${testValid.error}`,
        model: EMBEDDING_MODEL,
        expected_dims: EMBEDDING_DIMS,
      })
    }
    console.log(`[backfill] Voyage OK — model=${EMBEDDING_MODEL} dims=${testEmbedding.length}`)
  } catch (e) {
    return res.status(400).json({ error: `Voyage connectivity failed: ${e.message}` })
  }

  // ── Fetch docs without embeddings ─────────────────────────────────────────
  const { data: docs, error: fetchErr } = await supabase
    .from('cairo_knowledge')
    .select('id, title, content, summary, countries, regions, threat_categories, tags')
    .is('embedding', null)
    .not('content', 'is', null)
    .limit(200)

  if (fetchErr) return res.status(500).json({ error: fetchErr.message })
  if (!docs?.length) return res.json({
    ok: true, processed: 0,
    message: 'All documents already have embeddings.',
    provider: 'voyageai', model: EMBEDDING_MODEL, dims: EMBEDDING_DIMS,
  })

  const results = {
    success: 0, failed: 0,
    errors: [],
    diagnostics: [],   // per-doc detail
    smoke_test: null,  // first successful retrieval check
  }

  for (const doc of docs) {
    const diag = {
      id: doc.id,
      title: doc.title,
      content_length: doc.content?.length || 0,
      embedding_dims: null,
      vector_inserted: false,
      stage_failed: null,
      error: null,
    }

    // Guard: skip docs with no usable text
    const text = buildEmbeddingText(doc)
    if (!text || text.trim().length < 10) {
      diag.stage_failed = 'build_text'
      diag.error = 'no usable text — content empty or too short'
      results.failed++
      results.errors.push(`"${doc.title}": ${diag.error}`)
      await deadLetter({ document_id: doc.id, document_title: doc.title, failure_stage: 'build_text', failure_reason: diag.error })
      results.diagnostics.push(diag)
      continue
    }

    // Generate embedding
    let embedding
    try {
      embedding = await generateEmbedding(text)
      diag.embedding_dims = embedding.length
    } catch (err) {
      diag.stage_failed = 'generate_embedding'
      diag.error = err.message
      results.failed++
      results.errors.push(`"${doc.title}": ${err.message}`)
      await deadLetter({ document_id: doc.id, document_title: doc.title, failure_stage: 'generate_embedding', failure_reason: err.message, raw_error: err.message })
      results.diagnostics.push(diag)
      continue
    }

    // Pre-insert validation
    const valid = validateEmbedding(embedding)
    if (!valid.ok) {
      diag.stage_failed = 'validate_embedding'
      diag.error = valid.error
      results.failed++
      results.errors.push(`"${doc.title}": ${valid.error}`)
      await deadLetter({ document_id: doc.id, document_title: doc.title, failure_stage: 'validate_embedding', failure_reason: valid.error })
      results.diagnostics.push(diag)
      continue
    }

    // DB update
    const { error: updateErr } = await supabase
      .from('cairo_knowledge')
      .update({
        embedding,
        embedding_status:     'done',
        retrieval_ready:      true,
        intelligence_enabled: true,
        is_active:            true,
        indexed_at:           new Date().toISOString(),
      })
      .eq('id', doc.id)

    if (updateErr) {
      diag.stage_failed = 'db_insert'
      diag.error = updateErr.message
      results.failed++
      results.errors.push(`"${doc.title}": DB error — ${updateErr.message}`)
      await deadLetter({ document_id: doc.id, document_title: doc.title, failure_stage: 'db_insert', failure_reason: updateErr.message, raw_error: updateErr.message })
      results.diagnostics.push(diag)
      continue
    }

    diag.vector_inserted = true
    results.success++

    // Retrieval smoke test on first success
    if (results.success === 1 && results.smoke_test === null) {
      results.smoke_test = await smokeTestRetrieval(embedding, doc.id)
    }

    // Telemetry
    supabase.from('cairo_ingestion_log').insert({
      knowledge_id:    doc.id,
      event:           'embedding_backfilled',
      detail:          `model=${EMBEDDING_MODEL} dims=${EMBEDDING_DIMS}`,
    }).catch(() => {})

    results.diagnostics.push(diag)
  }

  return res.json({
    ok:           true,
    provider:     'voyageai',
    model:        EMBEDDING_MODEL,
    dims:         EMBEDDING_DIMS,
    total:        docs.length,
    success:      results.success,
    failed:       results.failed,
    errors:       results.errors.slice(0, 10),
    smoke_test:   results.smoke_test,
    diagnostics:  results.diagnostics.slice(0, 20),
  })
}
