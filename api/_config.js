export const MODELS = {
  fast:    'claude-haiku-4-5-20251001',
  smart:   'claude-sonnet-4-6',
}

export const TOKEN_LIMITS = {
  summary:  400,
  standard: 1200,
  report:   4000,
  pdf:      8000,   // full document extraction
}

export const TIMEOUTS = {
  fast:     8_000,
  standard: 20_000,
  long:     28_000,
  upload:   100_000, // PDF ingestion — well under 120s Vercel limit
}

export const CACHE_TTL = {
  news:    5   * 60 * 1000,
  intel:   10  * 60 * 1000,
  risk:    60  * 60 * 1000,
  static:  24  * 60 * 60 * 1000,
}
