/**
 * POST /api/backfill-embeddings
 * Auth: developer/admin only
 *
 * Add ?diag=1 to run a single-doc diagnostic trace instead of full backfill.
 * Every operation logs its exact payload, types, and error so we can identify
 * the failing table/field/query deterministically.
 */

import { createClient }    from '@supabase/supabase-js'
import { generateEmbedding, buildEmbeddingText } from './_embeddings.js'
import {
  validateEmbedding,
  EMBEDDING_MODEL,
  EMBEDDING_DIMS,
  VOYAGE_EMBEDDINGS_URL,
} from './_embedding-config.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Field-level type inspector ────────────────────────────────────────────────
function inspectPayload(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      out[k] = `Array(${v.length}) sample=[${v.slice(0, 3).map(x => typeof x === 'number' ? x.toFixed(4) : JSON.stringify(x))}...]`
    } else if (v === null) {
      out[k] = 'null'
    } else {
      out[k] = `${typeof v}(${String(v).slice(0, 60)})`
    }
  }
  return out
}

// ── Pre-insert validation ─────────────────────────────────────────────────────
function validateInsertPayload(payload) {
  const errors = []

  // UUID check
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (payload.id && !uuidRe.test(payload.id)) errors.push(`id is not a valid UUID: ${payload.id}`)

  // Timestamp checks
  if (payload.indexed_at && isNaN(Date.parse(payload.indexed_at)))
    errors.push(`indexed_at is not a valid ISO timestamp: ${payload.indexed_at}`)

  // Embedding checks
  if (payload.embedding !== undefined && payload.embedding !== null) {
    if (typeof payload.embedding === 'string')
      errors.push(`embedding is a STRING — must be a numeric array, not JSON.stringify()'d`)
    else {
      const v = validateEmbedding(payload.embedding)
      if (!v.ok) errors.push(`embedding invalid: ${v.error}`)
    }
  }

  // Status string checks
  const validStatuses = ['pending', 'active', 'partial', 'failed', 'done']
  if (payload.embedding_status && !validStatuses.includes(payload.embedding_status))
    errors.push(`embedding_status "${payload.embedding_status}" not in allowed set`)
  if (payload.ingestion_status && !validStatuses.includes(payload.ingestion_status))
    errors.push(`ingestion_status "${payload.ingestion_status}" not in allowed set`)

  return errors
}

// ── Dead-letter helper ────────────────────────────────────────────────────────
async function deadLetter({ document_id, document_title, failure_stage, failure_reason }) {
  await supabase.from('cairo_dead_letter').insert({
    document_id: document_id || null,
    document_title,
    failure_stage,
    failure_reason: failure_reason?.slice(0, 1000),
  }).catch(() => {})
}

// ── Retrieval smoke test ──────────────────────────────────────────────────────
async function smokeTestRetrieval(embedding, docId) {
  const { data, error } = await supabase.rpc('match_cairo_knowledge', {
    query_embedding: embedding,
    match_threshold: 0.0,
    match_count:     3,
  })
  if (error) return { ok: false, error: error.message, code: error.code }
  return { ok: true, neighbors: data?.length || 0, self_found: data?.some(d => d.id === docId) }
}

export default async function handler(req, res) {
  // Always return JSON — never let this function crash silently
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const trace = []  // full execution trace returned in every response
  const log = (step, data) => {
    console.log(`[backfill:${step}]`, JSON.stringify(data).slice(0, 500))
    trace.push({ step, ...data })
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorised', trace })

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token', trace })
    log('auth', { user_id: user.id })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (!['admin', 'developer'].includes(profile?.role))
      return res.status(403).json({ error: 'Admin only', trace })

    // ── Env check ───────────────────────────────────────────────────────────
    log('env', {
      VOYAGE_API_KEY_set: !!process.env.VOYAGE_API_KEY,
      SUPABASE_URL_set:   !!process.env.SUPABASE_URL,
      SERVICE_KEY_set:    !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      config: { model: EMBEDDING_MODEL, dims: EMBEDDING_DIMS },
    })
    if (!process.env.VOYAGE_API_KEY)
      return res.status(400).json({ error: 'VOYAGE_API_KEY not configured', trace })

    // ── Voyage connectivity test ────────────────────────────────────────────
    let testEmbedding
    try {
      const testRes = await fetch(VOYAGE_EMBEDDINGS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
        body:    JSON.stringify({ model: EMBEDDING_MODEL, input: ['connectivity test'], input_type: 'document' }),
        signal:  AbortSignal.timeout(10_000),
      })
      const testBody = await testRes.text()
      log('voyage_connectivity', {
        status:      testRes.status,
        ok:          testRes.ok,
        body_slice:  testBody.slice(0, 200),
      })
      if (!testRes.ok)
        return res.status(400).json({ error: `Voyage rejected (HTTP ${testRes.status}): ${testBody.slice(0, 300)}`, trace })

      const testData = JSON.parse(testBody)
      testEmbedding = testData.data?.[0]?.embedding
      const testValid = validateEmbedding(testEmbedding)
      log('voyage_test_embedding', {
        type:       typeof testEmbedding,
        is_array:   Array.isArray(testEmbedding),
        length:     testEmbedding?.length,
        sample:     testEmbedding?.slice(0, 3),
        valid:      testValid.ok,
        error:      testValid.ok ? null : testValid.error,
      })
      if (!testValid.ok)
        return res.status(400).json({ error: `Voyage test embedding invalid: ${testValid.error}`, trace })
    } catch (e) {
      return res.status(400).json({ error: `Voyage connectivity failed: ${e.message}`, trace })
    }

    // ── Fetch docs ──────────────────────────────────────────────────────────
    const { data: docs, error: fetchErr } = await supabase
      .from('cairo_knowledge')
      .select('id, title, content, summary, countries, regions, threat_categories, tags')
      .is('embedding', null)
      .not('content', 'is', null)
      .limit(200)

    log('fetch_docs', {
      count:    docs?.length,
      error:    fetchErr?.message,
      sample_id: docs?.[0]?.id,
      sample_title: docs?.[0]?.title?.slice(0, 50),
    })
    if (fetchErr) return res.status(500).json({ error: fetchErr.message, trace })
    if (!docs?.length) return res.json({ ok: true, processed: 0, message: 'All docs already embedded.', trace })

    // ── Diagnostic mode: trace single doc only ──────────────────────────────
    const diagMode = req.query?.diag === '1' || req.url?.includes('diag=1')
    const docsToProcess = diagMode ? docs.slice(0, 1) : docs

    const results = { success: 0, failed: 0, errors: [], smoke_test: null }

    for (const doc of docsToProcess) {
      const docLog = { id: doc.id, title: doc.title?.slice(0, 50) }

      // ── Build embedding text ──────────────────────────────────────────────
      const text = buildEmbeddingText(doc)
      docLog.text_length = text?.length
      docLog.text_sample = text?.slice(0, 80)

      if (!text || text.trim().length < 10) {
        docLog.fail_stage = 'build_text'
        docLog.error = 'no usable text'
        results.failed++
        results.errors.push(`"${doc.title}": no usable text`)
        log('doc_skip', docLog)
        await deadLetter({ document_id: doc.id, document_title: doc.title, failure_stage: 'build_text', failure_reason: 'no usable text' })
        continue
      }

      // ── Generate embedding ────────────────────────────────────────────────
      let embedding
      try {
        embedding = await generateEmbedding(text)
        docLog.embedding_type    = typeof embedding
        docLog.embedding_is_array = Array.isArray(embedding)
        docLog.embedding_length  = embedding?.length
        docLog.embedding_sample  = embedding?.slice(0, 3)
        docLog.embedding_typeof_first = typeof embedding?.[0]
      } catch (err) {
        docLog.fail_stage = 'generate_embedding'
        docLog.error = err.message
        results.failed++
        results.errors.push(`"${doc.title}": ${err.message}`)
        log('doc_embed_fail', docLog)
        await deadLetter({ document_id: doc.id, document_title: doc.title, failure_stage: 'generate_embedding', failure_reason: err.message })
        continue
      }

      // ── Pre-insert validation ─────────────────────────────────────────────
      const valid = validateEmbedding(embedding)
      docLog.embedding_valid = valid.ok
      docLog.embedding_valid_error = valid.ok ? null : valid.error
      if (!valid.ok) {
        docLog.fail_stage = 'validate_embedding'
        results.failed++
        results.errors.push(`"${doc.title}": ${valid.error}`)
        log('doc_validate_fail', docLog)
        await deadLetter({ document_id: doc.id, document_title: doc.title, failure_stage: 'validate_embedding', failure_reason: valid.error })
        continue
      }

      // ── Build update payload & validate ──────────────────────────────────
      const updatePayload = {
        embedding,
        embedding_status:     'done',
        retrieval_ready:      true,
        intelligence_enabled: true,
        is_active:            true,
        indexed_at:           new Date().toISOString(),
      }
      const payloadErrors = validateInsertPayload(updatePayload)
      docLog.payload_inspection  = inspectPayload(updatePayload)
      docLog.payload_errors      = payloadErrors

      if (payloadErrors.length > 0) {
        docLog.fail_stage = 'payload_validation'
        results.failed++
        results.errors.push(`"${doc.title}": payload invalid — ${payloadErrors.join('; ')}`)
        log('doc_payload_fail', docLog)
        await deadLetter({ document_id: doc.id, document_title: doc.title, failure_stage: 'payload_validation', failure_reason: payloadErrors.join('; ') })
        continue
      }

      // ── Supabase UPDATE ────────────────────────────────────────────────────
      const { data: updated, error: updateErr } = await supabase
        .from('cairo_knowledge')
        .update(updatePayload)
        .eq('id', doc.id)
        .select('id, embedding_status, retrieval_ready')

      docLog.db_error        = updateErr ? { message: updateErr.message, code: updateErr.code, details: updateErr.details, hint: updateErr.hint } : null
      docLog.db_update_count = updated?.length
      docLog.db_success      = !updateErr

      if (updateErr) {
        docLog.fail_stage = 'db_update'
        results.failed++
        results.errors.push(`"${doc.title}": DB error [${updateErr.code}] ${updateErr.message} — hint: ${updateErr.hint}`)
        log('doc_db_fail', docLog)
        await deadLetter({ document_id: doc.id, document_title: doc.title, failure_stage: 'db_update', failure_reason: `${updateErr.code}: ${updateErr.message}` })
        continue
      }

      results.success++
      log('doc_ok', docLog)

      // ── Retrieval smoke test (first success only) ─────────────────────────
      if (results.success === 1 && !results.smoke_test) {
        results.smoke_test = await smokeTestRetrieval(embedding, doc.id)
        log('smoke_test', results.smoke_test)
      }

      // Telemetry
      supabase.from('cairo_ingestion_log').insert({
        knowledge_id: doc.id,
        event:        'embedding_backfilled',
        detail:       `model=${EMBEDDING_MODEL} dims=${EMBEDDING_DIMS}`,
        embedding_model: EMBEDDING_MODEL,
        embedding_dims:  EMBEDDING_DIMS,
        retrieval_ok:    results.smoke_test?.ok ?? null,
      }).catch(() => {})
    }

    return res.json({
      ok:         true,
      diag_mode:  diagMode,
      provider:   'voyageai',
      model:      EMBEDDING_MODEL,
      dims:       EMBEDDING_DIMS,
      total:      docsToProcess.length,
      success:    results.success,
      failed:     results.failed,
      errors:     results.errors.slice(0, 10),
      smoke_test: results.smoke_test,
      trace,
    })

  } catch (topErr) {
    // Catch-all: never return non-JSON
    log('unhandled_exception', { message: topErr.message, stack: topErr.stack?.slice(0, 500) })
    return res.status(500).json({ error: `Unhandled: ${topErr.message}`, trace })
  }
}
