/**
 * cairo-upload — add a knowledge base entry (SOP or case study).
 *
 * POST /api/cairo-upload
 * Auth: Bearer <supabase-jwt> (org_admin, admin, developer only)
 *
 * Body (JSON):
 * {
 *   title:             string (required)
 *   content:           string (required — plain text OR extracted PDF text)
 *   type:              'sop' | 'case' (required)
 *   countries:         string[]  (optional)
 *   regions:           string[]  (optional)
 *   threat_categories: string[]  (optional)
 *   tags:              string[]  (optional)
 *   outcome:           'resolved'|'ongoing'|'escalated'|'evacuated'|'other' (cases only)
 *   source_file:       string    (original filename, optional)
 *   pdf_base64:        string    (if provided, Claude extracts text — overrides content)
 *   org_id:            uuid      (optional — null means platform-wide)
 * }
 */

import { createClient }   from '@supabase/supabase-js'
import { claudeCall }     from './_claudeClient.js'
import { MODELS, TOKEN_LIMITS } from './_config.js'
import { generateEmbedding, buildEmbeddingText } from './_embeddings.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ALLOWED_ROLES = ['admin', 'developer', 'org_admin']

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

  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' })
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  const {
    title, type, countries = [], regions = [], threat_categories = [],
    tags = [], source_file, org_id,
    doc_tier = 'global',
    storage_path,  // new: path in cairo-uploads bucket
    pdf_base64,    // legacy fallback
  } = req.body

  let { content } = req.body

  if (!title || !type) return res.status(400).json({ error: 'title and type are required' })
  if (!['sop', 'case', 'report'].includes(type)) return res.status(400).json({ error: 'type must be sop, case or report' })

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
      // Clean up temp file (non-blocking)
      supabase.storage.from('cairo-uploads').remove([storage_path]).catch(() => {})
    } catch (err) {
      return res.status(422).json({ error: `Storage download failed: ${err.message}` })
    }
  }

  // ── PDF intelligence extraction via Claude ────────────────────────────────
  let extractionWarning = null
  if (pdf_b64) {
    try {
      content = await claudeCall(ANTHROPIC_API_KEY, {
        model:       MODELS.smart,
        maxTokens:   TOKEN_LIMITS.pdf,   // 8k
        timeout:     240_000,            // 240s — under 300s Vercel limit
        betaHeaders: ['pdfs-2024-09-25'],
        system: 'You are a security intelligence analyst. Extract the key intelligence from this document into a structured digest optimised for later search and retrieval. For each event or topic covered, output: COUNTRY/REGION | DATE | CATEGORY | HEADLINE | DETAILS (2-3 sentences). Separate entries with a blank line. Keep it factual and specific.',
        messages: [{
          role: 'user',
          content: [
            {
              type:   'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdf_b64 },
            },
            {
              type: 'text',
              text: 'Extract all intelligence events and incidents from this document as a structured digest.',
            },
          ],
        }],
      })
    } catch (err) {
      // Graceful fallback — save the document even if extraction times out.
      // User can manually add content later; the title/tags still make it searchable.
      console.warn('[cairo-upload] extraction failed, saving stub:', err.message)
      extractionWarning = `Auto-extraction timed out. Document saved — add content manually to improve CAIRO search.`
      content = `[Extraction pending — ${title}]\n\nDocument uploaded but text extraction timed out. Re-upload or add content manually.`
    }
  }

  if (!content || content.trim().length < 20) {
    return res.status(400).json({ error: 'No content extracted. Paste text manually or try a smaller file.' })
  }

  // ── Auto-generate summary via Claude ─────────────────────────────────────
  let summary = null
  try {
    summary = await claudeCall(ANTHROPIC_API_KEY, {
      model:     MODELS.fast,
      maxTokens: 200,
      timeout:   TIMEOUTS.fast,
      system:    'You are a security intelligence analyst. Summarise the following document in 2-3 sentences for use as a search preview. Be specific and factual.',
      messages:  [{ role: 'user', content: content.slice(0, 6000) }],
    })
  } catch {
    // Summary is non-critical — proceed without it
  }

  // ── Insert into DB ────────────────────────────────────────────────────────
  const effectiveOrgId = org_id || (profile.role === 'org_admin' ? profile.org_id : null)

  // ── Generate embedding (non-blocking — graceful if Voyage key not set) ───
  const embeddingText = buildEmbeddingText({
    title, content, summary, countries, regions, threat_categories, tags,
  })
  const embedding = await generateEmbedding(embeddingText).catch(() => null)

  // ── Insert ────────────────────────────────────────────────────────────────
  const row = {
    title,
    type,
    content,
    summary:             summary || null,
    source_file:         source_file || null,
    countries:           Array.isArray(countries) ? countries : [],
    regions:             Array.isArray(regions) ? regions : [],
    threat_categories:   Array.isArray(threat_categories) ? threat_categories : [],
    tags:                Array.isArray(tags) ? tags : [],
    doc_tier:            doc_tier || 'global',
    org_id:              effectiveOrgId || null,
    created_by:          user.id,
    // Intelligence pipeline status
    is_active:           true,
    intelligence_enabled: true,
    retrieval_ready:     true,
    ingestion_status:    extractionWarning ? 'partial' : 'active',
    parsed_text_length:  content?.length || 0,
    embedding:           embedding,
    embedding_status:    embedding ? 'done' : 'pending',
    indexed_at:          new Date().toISOString(),
    verified_at:         extractionWarning ? null : new Date().toISOString(),
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('cairo_knowledge')
    .insert(row)
    .select('id, title, type, summary, retrieval_ready, embedding_status')
    .single()

  if (insertErr) {
    console.error('[cairo-upload] insert error:', JSON.stringify(insertErr))
    return res.status(500).json({ error: `DB error: ${insertErr.message} (code: ${insertErr.code})` })
  }

  // Log ingestion event
  supabase.from('cairo_ingestion_log').insert({
    knowledge_id: inserted.id,
    event:        extractionWarning ? 'partial' : 'indexed',
    detail:       extractionWarning || `Embedding: ${embedding ? 'generated' : 'pending (no Voyage key)'}`,
  }).catch(() => {})

  return res.json({ ok: true, ...inserted, warning: extractionWarning || undefined })
}
