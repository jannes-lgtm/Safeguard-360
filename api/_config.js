export const MODELS = {
  fast:    'claude-haiku-4-5-20251001',
  smart:   'claude-sonnet-4-6',
}

export const TOKEN_LIMITS = {
  summary:  400,
  standard: 1200,
  report:   4000,
}

export const TIMEOUTS = {
  fast:     8_000,
  standard: 20_000,
  long:     28_000,
}

export const CACHE_TTL = {
  news:    5   * 60 * 1000,
  intel:   10  * 60 * 1000,
  risk:    60  * 60 * 1000,
  static:  24  * 60 * 60 * 1000,
}
