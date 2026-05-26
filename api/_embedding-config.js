/**
 * _embedding-config.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the embedding model in use.
 *
 * HOW TO CHANGE MODELS:
 *  1. Update EMBEDDING_MODEL and EMBEDDING_DIMS below.
 *  2. Run the migration safety check (see cairo-embeddings-v3.sql) to verify
 *     the DB column matches the new dimension.
 *  3. Re-run backfill to regenerate all embeddings.
 *
 * Current provider : Voyage AI   (https://docs.voyageai.com)
 * Current model    : voyage-3-lite  ← 1024 dims, fast, Anthropic-recommended
 * Alternative      : voyage-3       ← 1024 dims, higher recall, 2× slower
 */

export const EMBEDDING_PROVIDER    = 'voyageai'
export const EMBEDDING_MODEL       = 'voyage-3-lite'
export const EMBEDDING_DIMS        = 1024            // ← the ONE place this lives
export const VOYAGE_EMBEDDINGS_URL = 'https://api.voyageai.com/v1/embeddings'
export const MAX_EMBEDDING_CHARS   = 16_000          // ~4k tokens — Voyage context limit
export const EMBEDDING_TIMEOUT_MS  = 15_000

/**
 * Validate an embedding vector before any DB insert.
 * Returns { ok: true } or { ok: false, error: string }.
 *
 * Checks:
 *   1. Not null / undefined
 *   2. Is a plain array
 *   3. Correct dimension
 *   4. No NaN / Infinity values (corrupted vector)
 *   5. Not a zero vector (degenerate embedding)
 */
export function validateEmbedding(embedding) {
  if (embedding === null || embedding === undefined)
    return { ok: false, error: 'null embedding' }

  if (!Array.isArray(embedding))
    return { ok: false, error: `embedding is not an array (got ${typeof embedding})` }

  if (embedding.length === 0)
    return { ok: false, error: 'empty embedding array' }

  if (embedding.length !== EMBEDDING_DIMS)
    return { ok: false, error: `dimension mismatch: got ${embedding.length}, expected ${EMBEDDING_DIMS} (${EMBEDDING_MODEL})` }

  const hasInvalid = embedding.some(v => typeof v !== 'number' || !isFinite(v))
  if (hasInvalid)
    return { ok: false, error: 'corrupted vector: non-finite values detected' }

  const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0))
  if (norm === 0)
    return { ok: false, error: 'zero vector — degenerate embedding' }

  return { ok: true }
}
