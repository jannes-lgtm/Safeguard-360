/**
 * tests/setup.js
 *
 * Global vitest setup. Runs before every test file.
 * - Sets required env vars so modules initialise without errors
 * - Mocks _supabase.js to prevent real DB connections
 * - Mocks _telemetry.js so emit() never tries to write to ops_events
 * - Suppresses console.error/warn noise from expected error paths
 */

import { vi, beforeEach, afterEach } from 'vitest'

// ── Environment ───────────────────────────────────────────────────────────────
process.env.ANTHROPIC_API_KEY        = 'test-anthropic-key'
process.env.SUPABASE_URL             = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.SUPABASE_ANON_KEY        = 'test-anon-key'
process.env.VITE_SUPABASE_URL        = 'https://test.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY   = 'test-anon-key'
// No Redis env vars by default → memory backend

// ── Module mocks ──────────────────────────────────────────────────────────────

// Prevent real Supabase connections from _supabase.js / _telemetry.js
vi.mock('../api/_supabase.js', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      insert:  vi.fn().mockResolvedValue({ error: null }),
      select:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      in:      vi.fn().mockReturnThis(),
      order:   vi.fn().mockReturnThis(),
      limit:   vi.fn().mockResolvedValue({ data: [], error: null }),
      single:  vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}))

// Silently absorb all emit() calls — tests that care about telemetry
// import and spy on _telemetry.js directly.
vi.mock('../api/_telemetry.js', () => ({
  emit:              vi.fn(),
  emitBatch:         vi.fn(),
  emitNotification:  vi.fn(),
  emitEscalation:    vi.fn(),
}))

// ── Console noise suppression ─────────────────────────────────────────────────
// Expected error paths (parse failures, timeouts, degraded feeds) log to
// console. Suppress during tests to keep output readable.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})
