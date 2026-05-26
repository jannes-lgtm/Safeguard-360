/**
 * POST /api/backfill-embeddings
 * Auth: developer/admin only
 *
 * Generates Voyage AI embeddings for all cairo_knowledge rows without one.
 * Add ?diag=1 to process only the first doc and return full trace.
 *
 * All Supabase operations go through _db.js wrappers — no .catch() chaining.
 */

import { createClient }  from '@supabase/supabase-js'
import { generateEmbedding, buildEmbeddingText } from './_embeddings.js'
import { validateEmbedding, EMBEDDING_MODEL, EMBEDDING_DIMS, VOYAGE_EMBEDDINGS_URL } from './_embedding-config.js'
import { dbInsert, dbUpdate, dbSelect, dbRpc, dbFireAndForget } from './_db.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Field-level type inspector ────────────────────────────────────────────────
function inspectPayload(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      out[k] = `Array(${v.length}) sample=[${v.slice(0, 3).map(x => (typeof x === 'number' ? x.toFixed(5) : JSON.stringify(x)))}]`
    } else if (v === null || v === undefined) {
      out[k] = String(v)
    } else {
      out[k] = `${typeof v}(${String(v).slice(0, 60)})`
    }
  }
  return out
}

// ── Pre-insert validation ─────────────────────────────────────────────────────
function validateUpdatePayload(payload) {
  const errors = []
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  if (payload.indexed_at && isNaN(Date.parse(payload.indexed_at)))
    errors.push(`indexed_at not a valid ISO timestamp: ${payload.indexed_at}`)

  if (payload.embedding !== undefined && payload.embedding !== null) {
    if (typeof payload.embedding === 'string')
      errors.push(`embedding is a STRING — must be a numeric array, not serialized`)
    else {
      const v = validateEmbedding(payload.embedding)
      if (!v.ok) errors.push(`embedding: ${v.error}`)
    }
  }

  const validStatuses = ['pending', 'active', 'partial', 'failed', 'done']
  if (payload.embedding_status && !validStatuses.includes(payload.embedding_status))
    errors.push(`embedding_status "${payload.embedding_status}" not allowed`)

  return errors
}

// ── Dead-letter ────────────────────────────────────────────────────────────────
async function deadLetter(supabase, { document_id, document_title, failure_stage, failure_reason }) {
  const { error } = await dbInsert(supabase, 'cairo_dead_letter', {
    document_id:    document_id || null,
    document_title: document_title || null,
    failure_stage,
    failure_reason: failure_reason?.slice(0, 1000),
  })
  if (error) console.warn('[backfill] dead-letter insert failed:', error.message)
}

// ── Retrieval smoke test ──────────────────────────────────────────────────────
async function smokeTest(embedding, docId) {
  const { data, error } = await dbRpc(supabase, 'match_cairo_knowledge', {
    query_embedding: embedding,
    match_threshold: 0.0,
    match_count:     3,
  })
  if (error) return { ok: false, error: error.message, code: error.code }
  return { ok: true, neighbors: data?.length || 0, self_found: data?.some(d => d.id === docId) }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const trace = []
  const log = (step, data) => {
    const entry = { step, ...data }
    console.log(`[backfill:${step}]`, JSON.stringify(entry).slice(0, 600))
    trace.push(entry)
  }

  // Top-level try ensures this handler always returns JSON
  try {

    // ── Auth ──────────────────────────────────────────────────────────────────
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorised', trace })

    let user
    try {
      const { data, error } = await supabase.auth.getUser(token)
      if (error || !data?.user) return res.status(401).json({ error: 'Invalid token', trace })
      user = data.user
    } catch (err) {
      return res.status(401).json({ error: `Auth failed: ${err.message}`, trace })
    }
    log('auth', { user_id: user.id })

    const { data: profile, error: profileErr } = await dbSelect(
      supabase, 'profiles', 'role', q => q.eq('id', user.id).maybeSingle()
    )
    if (profileErr) return res.status(500).json({ error: `Profile fetch: ${profileErr.message}`, trace })
    if (!['admin', 'developer'].includes(profile?.role))
      return res.status(403).json({ error: 'Admin only', trace })

    // ── Env check ─────────────────────────────────────────────────────────────
    log('env', {
      VOYAGE_API_KEY_set:  !!process.env.VOYAGE_API_KEY,
      SUPABASE_URL_set:    !!process.env.SUPABASE_URL,
      SERVICE_KEY_set:     !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      model: EMBEDDING_MODEL,
      dims:  EMBEDDING_DIMS,
    })
    if (!process.env.VOYAGE_API_KEY)
      return res.status(400).json({ error: 'VOYAGE_API_KEY not configured', trace })

    // ── Voyage connectivity test ──────────────────────────────────────────────
    let testEmbedding
    try {
      const testRes = await fetch(VOYAGE_EMBEDDINGS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
        body:    JSON.stringify({ model: EMBEDDING_MODEL, input: ['connectivity test'], input_type: 'document' }),
        signal:  AbortSignal.timeout(10_000),
      })
      const testBodyText = await testRes.text()
      log('voyage_connectivity', { status: testRes.status, ok: testRes.ok, body_slice: testBodyText.slice(0, 200) })

      if (!testRes.ok)
        return res.status(400).json({ error: `Voyage rejected (HTTP ${testRes.status}): ${testBodyText.slice(0, 300)}`, trace })

      const testData = JSON.parse(testBodyText)
      testEmbedding = testData.data?.[0]?.embedding

      log('voyage_test_embedding', {
        type:      typeof testEmbedding,
        is_array:  Array.isArray(testEmbedding),
        length:    testEmbedding?.length,
        sample:    testEmbedding?.slice(0, 3),
        expected:  EMBEDDING_DIMS,
      })

      const testValid = validateEmbedding(testEmbedding)
      if (!testValid.ok)
        return res.status(400).json({ error: `Voyage test embedding invalid: ${testValid.error}`, trace })

    } catch (err) {
      return res.status(400).json({ error: `Voyage connectivity failed: ${err.message}`, trace })
    }

    // ── Fetch docs without embeddings ─────────────────────────────────────────
    const { data: docs, error: fetchErr } = await dbSelect(
      supabase,
      'cairo_knowledge',
      'id, title, content, summary, countries, regions, threat_categories, tags',
      q => q.is('embedding', null).not('content', 'is', null).limit(200)
    )
    log('fetch_docs', { count: docs?.length, error: fetchErr?.message, sample_id: docs?.[0]?.id })

    if (fetchErr) return res.status(500).json({ error: fetchErr.message, trace })
    if (!docs?.length) return res.json({ ok: true, processed: 0, message: 'All docs already embedded.', trace })

    const diagMode = String(req.url || '').includes('diag=1')
    const docsToProcess = diagMode ? docs.slice(0, 1) : docs
    log('processing', { total: docsToProcess.length, diag_mode: diagMode })

    const results = { success: 0, failed: 0, errors: [], smoke_test: null }

    for (const doc of docsToProcess) {
      const docLog = { id: doc.id, title: doc.title?.slice(0, 50) }

      // ── Build text ───────────────────────────────────────────────────────
      const text = buildEmbeddingText(doc)
      docLog.text_length = text?.length || 0
      docLog.text_sample = text?.slice(0, 80)

      if (!text || text.trim().length < 10) {
        docLog.fail_stage = 'build_text'
        results.failed++
        results.errors.push(`"${doc.title}": no usable text`)
        log('doc_skip', docLog)
        await deadLetter(supabase, { document_id: doc.id, document_title: doc.title, failure_stage: 'build_text', failure_reason: 'no usable text' })
        continue
      }

      // ── Generate embedding ────────────────────────────────────────────────
      let embedding
      try {
        embedding = await generateEmbedding(text)
        docLog.embedding_is_array = Array.isArray(embedding)
        docLog.embedding_length   = embedding?.length
        docLog.embedding_typeof_0 = typeof embedding?.[0]
        docLog.embedding_sample   = embedding?.slice(0, 3)
      } catch (err) {
        docLog.fail_stage = 'generate_embedding'
        docLog.error = err.message
        results.failed++
        results.errors.push(`"${doc.title}": ${err.message}`)
        log('doc_embed_fail', docLog)
        await deadLetter(supabase, { document_id: doc.id, document_title: doc.title, failure_stage: 'generate_embedding', failure_reason: err.message })
        continue
      }

      // ── Pre-insert validation ─────────────────────────────────────────────
      const valid = validateEmbedding(embedding)
      if (!valid.ok) {
        docLog.fail_stage = 'validate_embedding'
        docLog.error = valid.error
        results.failed++
        results.errors.push(`"${doc.title}": ${valid.error}`)
        log('doc_validate_fail', docLog)
        await deadLetter(supabase, { document_id: doc.id, document_title: doc.title, failure_stage: 'validate_embedding', failure_reason: valid.error })
        continue
      }

      // ── Build and validate payload ────────────────────────────────────────
      const payload = {
        embedding,
        embedding_status:     'done',
        retrieval_ready:      true,
        intelligence_enabled: true,
        is_active:            true,
        indexed_at:           new Date().toISOString(),
      }
      const payloadErrors = validateUpdatePayload(payload)
      docLog.payload_types  = inspectPayload(payload)
      docLog.payload_errors = payloadErrors

      if (payloadErrors.length > 0) {
        docLog.fail_stage = 'payload_validation'
        results.failed++
        results.errors.push(`"${doc.title}": payload invalid — ${payloadErrors.join('; ')}`)
        log('doc_payload_fail', docLog)
        await deadLetter(supabase, { document_id: doc.id, document_title: doc.title, failure_stage: 'payload_validation', failure_reason: payloadErrors.join('; ') })
        continue
      }

      // ── Supabase UPDATE ───────────────────────────────────────────────────
      const { data: updated, error: updateErr, durationMs } = await dbUpdate(
        supabase,
        'cairo_knowledge',
        payload,
        { id: doc.id },
        { select: 'id, embedding_status, retrieval_ready' }
      )

      docLog.db_duration_ms = durationMs
      docLog.db_error       = updateErr
        ? { message: updateErr.message, code: updateErr.code, details: updateErr.details, hint: updateErr.hint }
        : null
      docLog.db_rows_updated = updated?.length || (updated ? 1 : 0)

      if (updateErr) {
        docLog.fail_stage = 'db_update'
        results.failed++
        results.errors.push(`"${doc.title}": DB [${updateErr.code}] ${updateErr.message} hint=${updateErr.hint}`)
        log('doc_db_fail', docLog)
        await deadLetter(supabase, {
          document_id:    doc.id,
          document_title: doc.title,
          failure_stage:  'db_update',
          failure_reason: `${updateErr.code}: ${updateErr.message}`,
        })
        continue
      }

      results.success++
      log('doc_ok', docLog)

      // ── Retrieval smoke test (first success only) ─────────────────────────
      if (results.success === 1 && !results.smoke_test) {
        results.smoke_test = await smokeTest(embedding, doc.id)
        log('smoke_test', results.smoke_test)
      }

      // ── Telemetry (fire and forget) ───────────────────────────────────────
      dbFireAndForget(`ingestion_log:${doc.id}`, () =>
        dbInsert(supabase, 'cairo_ingestion_log', {
          knowledge_id:    doc.id,
          event:           'embedding_backfilled',
          detail:          `model=${EMBEDDING_MODEL} dims=${EMBEDDING_DIMS}`,
          embedding_model: EMBEDDING_MODEL,
          embedding_dims:  EMBEDDING_DIMS,
          retrieval_ok:    results.smoke_test?.ok ?? null,
        })
      )
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
    // Absolute last resort — always return JSON
    console.error('[backfill] unhandled exception:', topErr.message, topErr.stack)
    return res.status(500).json({
      error: `Unhandled exception: ${topErr.message}`,
      stack: topErr.stack?.split('\n').slice(0, 5),
      trace,
    })
  }
}
