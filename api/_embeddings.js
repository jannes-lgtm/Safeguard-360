/**
 * _embeddings.js — Vector embedding helper for CAIRO intelligence pipeline.
 *
 * Uses Voyage AI voyage-3-lite (1024 dims) — Anthropic's recommended
 * embedding model for RAG with Claude.
 *
 * Requires env var: VOYAGE_API_KEY
 * Get a free key at: https://www.voyageai.com
 *
 * Gracefully returns null if key is not configured — system falls back
 * to keyword search automatically.
 */

const VOYAGE_URL   = 'https://api.voyageai.com/v1/embeddings'
const VOYAGE_MODEL = 'voyage-3-lite'   // 1024 dims, optimised for retrieval
const MAX_CHARS    = 16_000            // ~4k tokens — Voyage context limit

/**
 * Generate a 1024-dimension embedding vector for a text string.
 * Returns null (not an error) if VOYAGE_API_KEY is not set.
 *
 * @param {string} text
 * @returns {Promise<number[]|null>}
 */
export async function generateEmbedding(text) {
  const key = process.env.VOYAGE_API_KEY
  if (!key) return null

  try {
    const res = await fetch(VOYAGE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: [text.slice(0, MAX_CHARS)],
        input_type: 'document',
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.warn('[embeddings] Voyage API error:', res.status, err.slice(0, 200))
      return null
    }

    const data = await res.json()
    return data.data?.[0]?.embedding || null
  } catch (err) {
    console.warn('[embeddings] embedding generation failed:', err.message)
    return null
  }
}

/**
 * Generate an embedding for a search query (uses query input_type).
 * @param {string} query
 * @returns {Promise<number[]|null>}
 */
export async function generateQueryEmbedding(query) {
  const key = process.env.VOYAGE_API_KEY
  if (!key) return null

  try {
    const res = await fetch(VOYAGE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model:      VOYAGE_MODEL,
        input:      [query.slice(0, 2000)],
        input_type: 'query',
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) return null
    const data = await res.json()
    return data.data?.[0]?.embedding || null
  } catch {
    return null
  }
}

/**
 * Build the embedding text from a knowledge document.
 * Combines title, tags, countries, and content for richer semantic matching.
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
