/**
 * _embeddings.js — Voyage AI embedding helper for CAIRO intelligence pipeline.
 *
 * All model constants imported from _embedding-config.js — no magic numbers here.
 * Requires env var: VOYAGE_API_KEY
 */

import {
  EMBEDDING_MODEL,
  VOYAGE_EMBEDDINGS_URL,
  MAX_EMBEDDING_CHARS,
  EMBEDDING_TIMEOUT_MS,
  validateEmbedding,
} from './_embedding-config.js'

/**
 * Generate an embedding vector for a document chunk.
 * Throws on API errors so callers can log + dead-letter the failure.
 *
 * @param   {string}          text
 * @returns {Promise<number[]>}
 */
export async function generateEmbedding(text, { retries = 2, retryDelayMs = 22_000 } = {}) {
  const key = process.env.VOYAGE_API_KEY
  if (!key) throw new Error('VOYAGE_API_KEY not set')

  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // 429 rate-limit backoff: wait before retry
      console.warn(`[embeddings] rate-limited, waiting ${retryDelayMs}ms before retry ${attempt}/${retries}`)
      await new Promise(r => setTimeout(r, retryDelayMs))
    }

    const res = await fetch(VOYAGE_EMBEDDINGS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model:      EMBEDDING_MODEL,
        input:      [text.slice(0, MAX_EMBEDDING_CHARS)],
        input_type: 'document',
      }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    })

    if (res.status === 429) {
      const body = await res.text().catch(() => '')
      lastError = new Error(`Voyage HTTP 429: ${body.slice(0, 300)}`)
      continue   // retry after delay
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Voyage HTTP ${res.status}: ${body.slice(0, 300)}`)
    }

    const data = await res.json()
    const embedding = data.data?.[0]?.embedding

    const valid = validateEmbedding(embedding)
    if (!valid.ok) throw new Error(`Voyage returned invalid embedding: ${valid.error}`)

    return embedding
  }

  throw lastError || new Error('Voyage embedding failed after retries')
}

/**
 * Generate an embedding for a natural-language search query.
 * Returns null (not a throw) so search gracefully falls back to keyword mode.
 *
 * @param   {string}                query
 * @returns {Promise<number[]|null>}
 */
export async function generateQueryEmbedding(query) {
  const key = process.env.VOYAGE_API_KEY
  if (!key) return null

  try {
    const res = await fetch(VOYAGE_EMBEDDINGS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model:      EMBEDDING_MODEL,
        input:      [query.slice(0, 2000)],
        input_type: 'query',
      }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    })

    if (!res.ok) return null
    const data = await res.json()
    const embedding = data.data?.[0]?.embedding
    const valid = validateEmbedding(embedding)
    return valid.ok ? embedding : null
  } catch {
    return null
  }
}

/**
 * Build the embedding text from a knowledge document.
 * Combines title, metadata, and content for richer semantic matching.
 *
 * @param   {object} doc
 * @returns {string}
 */
export function buildEmbeddingText(doc) {
  const parts = [
    doc.title,
    doc.countries?.join(', '),
    doc.regions?.join(', '),
    doc.threat_categories?.join(', '),
    doc.tags?.join(', '),
    doc.summary,
    (doc.content || '').slice(0, 12_000),
  ].filter(Boolean)
  return parts.join('\n\n')
}
