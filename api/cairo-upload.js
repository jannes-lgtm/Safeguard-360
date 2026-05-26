/**
 * cairo-upload — add a knowledge base entry (SOP, case study, or intelligence report).
 *
 * POST /api/cairo-upload
 * Auth: Bearer <supabase-jwt> (org_admin, admin, developer only)
 *
 * Body (JSON):
 *   title             string   (required)
 *   type              'sop' | 'case' | 'report'
 *   countries         string[]
 *   regions           string[]
 *   threat_categories string[]
 *   tags              string[]
 *   source_file       string   (original filename)
 *   org_id            uuid     (null = platform-wide)
 *   doc_tier          'country' | 'regional' | 'global'
 *   storage_path      string   (path in cairo-uploads bucket — preferred)
 *   pdf_base64        string   (legacy fallback)
 *   content           string   (plain text, if no PDF)
 */

import { createClient }  from '@supabase/supabase-js'
import { claudeCall }    from './_claudeClient.js'
import { MODELS, TOKEN_LIMITS, TIMEOUTS } from './_config.js'
import { generateEmbedding, buildEmbeddingText } from './_embeddings.js'
import { validateEmbedding, EMBEDDING_MODEL, EMBEDDING_DIMS } from './_embedding-config.js'
import { dbInsert, dbFireAndForget } from './_db.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ALLOWED_ROLES = ['admin', 'developer', 'org_admin']

// ── Dead-letter helper ────────────────────────────────────────────────────────
async function deadLetter({ document_id, document_title, storage_path, failure_stage, failure_reason, raw_error }) {
  const { error } = await dbInsert(supabase, 'cairo_dead_letter', {
    document_id:    document_id || null,
    document_title: document_title || null,
    storage_path:   storage_path || null,
    failure_stage,
    failure_reason,
    raw_error:      raw_error?.slice(0, 2000),
  })
  if (error) console.warn('[cairo-upload] dead-letter insert failed:', error.message)
}

// ── Retrieval smoke test ──────────────────────────────────────────────────────
async function smokeTestRetrieval(embedding, docId) {
  try {
    const { data, error } = await supabase.rpc('match_cairo_knowledge', {
      query_embedding: embedding,
      match_threshold: 0.0,
      match_count:     3,
    })
    if (error) return { ok: false, error: error.message }
    const self_found = data?.some(d => d.id === docId)
    return { ok: true, neighbors: data?.length || 0, self_found }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).maybeSingle()

  if (!profile || !ALLOWED_ROLES.includes(profile.role))
    return res.status(403).json({ error: 'Insufficient permissions' })

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  const {
    title, type,
    countries = [], regions = [], threat_categories = [], tags = [],
    source_file, org_id,
    doc_tier    = 'global',
    storage_path,   // preferred: path in cairo-uploads bucket
    pdf_base64,     // legacy fallback
  } = req.body

  let { content } = req.body

  if (!title || !type)
    return res.status(400).json({ error: 'title and type are required' })
  if (!['sop', 'case', 'report'].includes(type))
    return res.status(400).json({ error: 'type must be sop, case or report' })

  // ── Resolve PDF: download from storage or use legacy base64 ──────────────
  let pdf_b64 = pdf_base64 || null

  if (storage_path) {
    try {
      const { data: fileData, error: dlErr } = await supabase.storage
        .from('cairo-uploads')
        .download(storage_path)
      if (dlErr) throw new Error(dlErr.message)
      const buffer = Buffer.from(await fileData.arrayBuffer())
      pdf_b64 = buffer.toString('base64')
      // Clean up temp file (fire and forget)
      dbFireAndForget(`storage_remove:${storage_path}`, async () => {
        const { error } = await supabase.storage.from('cairo-uploads').remove([storage_path])
        return { error }
      })
    } catch (err) {
      await deadLetter({ document_title: title, storage_path, failure_stage: 'storage_download', failure_reason: err.message, raw_error: err.message })
      return res.status(422).json({ error: `Storage download failed: ${err.message}` })
    }
  }

  // ── PDF intelligence extraction via Claude ────────────────────────────────
  let extractionWarning = null
  if (pdf_b64) {
    try {
      content = await claudeCall(ANTHROPIC_API_KEY, {
        model:       MODELS.smart,
        maxTokens:   TOKEN_LIMITS.pdf,
        timeout:     240_000,
        betaHeaders: ['pdfs-2024-09-25'],
        system: 'You are a security intelligence analyst. Extract the key intelligence from this document into a structured digest optimised for later search and retrieval. For each event or topic covered, output: COUNTRY/REGION | DATE | CATEGORY | HEADLINE | DETAILS (2-3 sentences). Separate entries with a blank line. Keep it factual and specific.',
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf_b64 } },
            { type: 'text', text: 'Extract all intelligence events and incidents from this document as a structured digest.' },
          ],
        }],
      })
    } catch (err) {
      console.warn('[cairo-upload] extraction failed, saving stub:', err.message)
      extractionWarning = `Auto-extraction timed out. Document saved — add content manually to improve CAIRO search.`
      content = `[Extraction pending — ${title}]\n\nDocument uploaded but text extraction timed out. Re-upload or add content manually.`
      await deadLetter({ document_title: title, storage_path, failure_stage: 'pdf_extraction', failure_reason: extractionWarning, raw_error: err.message })
    }
  }

  if (!content || content.trim().length < 20)
    return res.status(400).json({ error: 'No content extracted. Paste text manually or try a smaller file.' })

  // ── Auto-generate summary via Claude ─────────────────────────────────────
  let summary = null
  try {
    summary = await claudeCall(ANTHROPIC_API_KEY, {
      model:     MODELS.fast,
      maxTokens: 200,
      timeout:   TIMEOUTS.fast,
      system:    'You are a security intelligence analyst. Summarise this document in 2-3 sentences for use as a search preview. Be specific and factual.',
      messages:  [{ role: 'user', content: content.slice(0, 6000) }],
    })
  } catch { /* non-critical */ }

  // ── Generate + validate embedding ─────────────────────────────────────────
  const embeddingText = buildEmbeddingText({ title, content, summary, countries, regions, threat_categories, tags })
  let embedding = null
  let embeddingStatus = 'pending'
  let embeddingDiag = { attempted: false, dims: null, valid: false, error: null }

  if (process.env.VOYAGE_API_KEY) {
    embeddingDiag.attempted = true
    try {
      embedding = await generateEmbedding(embeddingText)

      // Pre-insert dimension validation
      const valid = validateEmbedding(embedding)
      if (!valid.ok) {
        throw new Error(`Embedding validation failed: ${valid.error}`)
      }
      embeddingDiag.dims  = embedding.length
      embeddingDiag.valid = true
      embeddingStatus     = 'done'
    } catch (err) {
      console.warn('[cairo-upload] embedding failed:', err.message)
      embeddingDiag.error = err.message
      embedding           = null
      embeddingStatus     = 'failed'
    }
  }

  // ── DB insert ─────────────────────────────────────────────────────────────
  const effectiveOrgId = org_id || (profile.role === 'org_admin' ? profile.org_id : null)

  const row = {
    title,
    type,
    content,
    summary:              summary || null,
    source_file:          source_file || null,
    countries:            Array.isArray(countries) ? countries : [],
    regions:              Array.isArray(regions) ? regions : [],
    threat_categories:    Array.isArray(threat_categories) ? threat_categories : [],
    tags:                 Array.isArray(tags) ? tags : [],
    doc_tier:             doc_tier || 'global',
    org_id:               effectiveOrgId || null,
    created_by:           user.id,
    is_active:            true,
    intelligence_enabled: true,
    retrieval_ready:      embeddingStatus === 'done',
    ingestion_status:     extractionWarning ? 'partial' : embeddingStatus === 'done' ? 'active' : 'partial',
    parsed_text_length:   content?.length || 0,
    embedding:            embedding,
    embedding_status:     embeddingStatus,
    indexed_at:           new Date().toISOString(),
    verified_at:          (!extractionWarning && embeddingStatus === 'done') ? new Date().toISOString() : null,
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('cairo_knowledge')
    .insert(row)
    .select('id, title, type, summary, retrieval_ready, embedding_status')
    .single()

  if (insertErr) {
    console.error('[cairo-upload] insert error:', JSON.stringify(insertErr))
    await deadLetter({ document_title: title, storage_path, failure_stage: 'db_insert', failure_reason: insertErr.message, raw_error: insertErr.message })
    return res.status(500).json({ error: `DB error: ${insertErr.message} (code: ${insertErr.code})` })
  }

  // If embedding generation failed after insert, log to dead letter
  if (embeddingDiag.attempted && !embeddingDiag.valid) {
    await deadLetter({
      document_id:    inserted.id,
      document_title: title,
      failure_stage:  'embedding',
      failure_reason: embeddingDiag.error || 'embedding generation failed',
      raw_error:      embeddingDiag.error,
    })
  }

  // ── Retrieval smoke test (only if embedding present) ──────────────────────
  let smokeTest = null
  if (embedding) {
    smokeTest = await smokeTestRetrieval(embedding, inserted.id)
    if (!smokeTest.ok) {
      console.warn('[cairo-upload] retrieval smoke test failed:', smokeTest.error)
    }
  }

  // ── Telemetry log (fire and forget) ──────────────────────────────────────
  dbFireAndForget(`ingestion_log:${inserted.id}`, () =>
    dbInsert(supabase, 'cairo_ingestion_log', {
      knowledge_id:  inserted.id,
      event:         extractionWarning ? 'partial' : 'indexed',
      detail: JSON.stringify({
        extraction:     extractionWarning ? 'timed_out' : 'ok',
        embedding:      embeddingStatus,
        model:          embeddingStatus === 'done' ? EMBEDDING_MODEL : null,
        dims:           embeddingDiag.dims,
        smoke_test:     smokeTest,
        content_length: content?.length,
      }),
    })
  )

  return res.json({
    ok: true,
    ...inserted,
    warning:    extractionWarning || undefined,
    embedding:  {
      status:     embeddingStatus,
      model:      embeddingStatus === 'done' ? EMBEDDING_MODEL : null,
      dims:       embeddingDiag.dims,
      error:      embeddingDiag.error || undefined,
    },
    smoke_test: smokeTest || undefined,
  })
}
