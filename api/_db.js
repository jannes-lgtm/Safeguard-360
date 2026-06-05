/**
 * _db.js — Centralized Supabase operation wrappers.
 *
 * Rules enforced here:
 *  - NO .catch() chaining on query builders (they don't implement full Promise API)
 *  - Every operation uses try/await and returns { data, error, durationMs }
 *  - Errors are normalized to { message, code, details, hint }
 *  - All operations are logged with table, operation, timing, and error
 *  - Fire-and-forget helpers use an internal async IIFE — never .catch()
 */

// ── Error normalizer ──────────────────────────────────────────────────────────
function normalizeError(err) {
  if (!err) return null
  return {
    message: err.message || String(err),
    code:    err.code    || null,
    details: err.details || null,
    hint:    err.hint    || null,
  }
}

// ── Timed wrapper ─────────────────────────────────────────────────────────────
async function timed(label, fn) {
  const t0 = Date.now()
  try {
    const result = await fn()
    const ms = Date.now() - t0
    if (result?.error) {
      console.error(`[db:${label}] ERROR in ${ms}ms:`, JSON.stringify(normalizeError(result.error)))
    } else {
      console.log(`[db:${label}] OK in ${ms}ms rows=${Array.isArray(result?.data) ? result.data.length : (result?.data ? 1 : 0)}`)
    }
    return { ...result, durationMs: ms }
  } catch (err) {
    const ms = Date.now() - t0
    console.error(`[db:${label}] THREW in ${ms}ms:`, err.message)
    return { data: null, error: normalizeError(err), durationMs: ms }
  }
}

// ── dbInsert ─────────────────────────────────────────────────────────────────
/**
 * @param {object} supabase  - Supabase client
 * @param {string} table
 * @param {object|object[]} payload
 * @param {object} [opts]    - { select: 'col1,col2', single: true }
 */
export async function dbInsert(supabase, table, payload, opts = {}) {
  return timed(`insert:${table}`, async () => {
    let q = supabase.from(table).insert(payload)
    if (opts.select) q = q.select(opts.select)
    if (opts.single) q = q.single()
    const { data, error } = await q
    return { data, error }
  })
}

// ── dbUpdate ─────────────────────────────────────────────────────────────────
/**
 * @param {object} supabase
 * @param {string} table
 * @param {object} payload
 * @param {object} match    - { column: value } filter applied as .eq()
 * @param {object} [opts]   - { select: 'col1,col2' }
 */
export async function dbUpdate(supabase, table, payload, match, opts = {}) {
  return timed(`update:${table}`, async () => {
    let q = supabase.from(table).update(payload)
    for (const [col, val] of Object.entries(match)) {
      q = q.eq(col, val)
    }
    if (opts.select) q = q.select(opts.select)
    const { data, error } = await q
    return { data, error }
  })
}

// ── dbSelect ─────────────────────────────────────────────────────────────────
/**
 * @param {object} supabase
 * @param {string} table
 * @param {string} columns
 * @param {function} [buildQuery]  - fn(q) => q  to add .eq(), .is(), .limit() etc
 */
export async function dbSelect(supabase, table, columns, buildQuery) {
  return timed(`select:${table}`, async () => {
    let q = supabase.from(table).select(columns)
    if (buildQuery) q = buildQuery(q)
    const { data, error } = await q
    return { data, error }
  })
}

// ── dbRpc ─────────────────────────────────────────────────────────────────────
/**
 * @param {object} supabase
 * @param {string} fnName
 * @param {object} [params]
 */
export async function dbRpc(supabase, fnName, params = {}) {
  return timed(`rpc:${fnName}`, async () => {
    const { data, error } = await supabase.rpc(fnName, params)
    return { data, error }
  })
}

// ── dbFireAndForget ───────────────────────────────────────────────────────────
/**
 * Run a DB operation without blocking — errors are logged but not thrown.
 * Use this instead of .catch(() => {}) on query builders.
 *
 * @param {string}   label
 * @param {function} fn    - async () => { data, error }
 */
export function dbFireAndForget(label, fn) {
  // Deliberately NOT awaited — fire and forget
  ;(async () => {
    try {
      const result = await fn()
      if (result?.error) {
        console.warn(`[db:fire:${label}] non-fatal error:`, JSON.stringify(normalizeError(result.error)))
      }
    } catch (err) {
      console.warn(`[db:fire:${label}] non-fatal throw:`, err.message)
    }
  })()
}
