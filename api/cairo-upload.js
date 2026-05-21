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

import { createClient } from '@supabase/supabase-js'
import { claudeCall }   from './_claudeClient.js'
import { MODELS, TOKEN_LIMITS, TIMEOUTS } from './_config.js'

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
    tags = [], outcome, source_file, pdf_base64, org_id,
  } = req.body

  let { content } = req.body

  if (!title || !type) return res.status(400).json({ error: 'title and type are required' })
  if (!['sop', 'case', 'report'].includes(type)) return res.status(400).json({ error: 'type must be sop, case or report' })

  // ── PDF extraction via Claude ─────────────────────────────────────────────
  if (pdf_base64) {
    try {
      content = await claudeCall(ANTHROPIC_API_KEY, {
        model:       MODELS.fast,
        maxTokens:   TOKEN_LIMITS.report,
        timeout:     TIMEOUTS.long,
        betaHeaders: ['pdfs-2024-09-25'],
        messages: [{
          role: 'user',
          content: [
            {
              type:   'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdf_base64 },
            },
            {
              type: 'text',
              text: 'Extract the full text content of this document. Return only the extracted text, preserving headings and structure. Do not summarise — return everything.',
            },
          ],
        }],
      })
    } catch (err) {
      return res.status(422).json({ error: `PDF extraction failed: ${err.message}` })
    }
  }

  if (!content || content.trim().length < 20) {
    return res.status(400).json({ error: 'content is required (or provide pdf_base64)' })
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

  const { data: inserted, error: insertErr } = await supabase
    .from('cairo_knowledge')
    .insert({
      title,
      type,
      content,
      summary,
      source_file:       source_file || null,
      countries:         countries,
      regions:           regions,
      threat_categories: threat_categories,
      tags:              tags,
      outcome:           outcome || null,
      org_id:            effectiveOrgId,
      created_by:        user.id,
    })
    .select('id, title, type, summary')
    .single()

  if (insertErr) {
    console.error('[cairo-upload]', insertErr.message)
    return res.status(500).json({ error: insertErr.message })
  }

  return res.json({ ok: true, ...inserted })
}
