/**
 * intelligenceService — shared access to all intelligence data APIs.
 *
 * Wraps: country-risk, rss-ingest, acled, weather-alerts, destination-feed
 *
 * Existing pages continue to call the APIs directly — this service is for
 * new consumers (GSOC, Projects) and future page migrations.
 */

const api = (path) => `/api/${path}`

// ── Country Risk ──────────────────────────────────────────────────────────────

/**
 * Full country risk report: AI brief, FCDO level, health alerts, live sources.
 * @param {string} country
 * @returns {Promise<{country, level, severity, ai_brief, sources, health_items, ...}>}
 */
export async function getCountryRisk(country) {
  const res = await fetch(`${api('country-risk')}?country=${encodeURIComponent(country)}`)
  if (!res.ok) throw new Error(`country-risk ${res.status}`)
  return res.json()
}

// ── RSS Intelligence Feeds ────────────────────────────────────────────────────

/**
 * Fetch articles from a named category (security, conflict, health, weather).
 * @param {'security'|'conflict'|'health'|'weather'} category
 * @param {number} [limit=12]
 * @returns {Promise<{articles: {title,link,description,pubDate,source}[], total, fetchedAt}>}
 */
export async function getFeedsByCategory(category, limit = 12) {
  const res = await fetch(`${api('rss-ingest')}?category=${category}&limit=${limit}`)
  if (!res.ok) throw new Error(`rss-ingest ${res.status}`)
  return res.json()
}

/**
 * Fetch articles from a specific pre-configured feed by ID.
 * @param {string} id - Feed ID from the preconfigured list
 * @param {number} [limit=10]
 */
export async function getFeedById(id, limit = 10) {
  const res = await fetch(`${api('rss-ingest')}?id=${encodeURIComponent(id)}&limit=${limit}`)
  if (!res.ok) throw new Error(`rss-ingest ${res.status}`)
  return res.json()
}

/**
 * Fetch articles from any RSS/Atom URL.
 * @param {string} url
 * @param {number} [limit=10]
 */
export async function getFeedByUrl(url, limit = 10) {
  const res = await fetch(`${api('rss-ingest')}?url=${encodeURIComponent(url)}&limit=${limit}`)
  if (!res.ok) throw new Error(`rss-ingest ${res.status}`)
  return res.json()
}

/**
 * List all available pre-configured feeds.
 * @returns {Promise<{feeds: {id,name,category,geography,url,description}[]}>}
 */
export async function listFeeds() {
  const res = await fetch(api('rss-ingest'))
  if (!res.ok) throw new Error(`rss-ingest ${res.status}`)
  return res.json()
}

// ── Conflict Events (ACLED) ───────────────────────────────────────────────────

/**
 * Recent conflict events for a country.
 * @param {string} country
 * @param {object} [opts]
 * @param {number} [opts.days=30]
 * @param {number} [opts.limit=20]
 * @returns {Promise<{configured, country, total, fatalities, byType, recent[]}>}
 */
export async function getConflictEvents(country, { days = 30, limit = 20 } = {}) {
  const params = new URLSearchParams({ country, days, limit })
  const res = await fetch(`${api('acled')}?${params}`)
  if (!res.ok) throw new Error(`acled ${res.status}`)
  return res.json()
}

// ── Weather & Natural Disaster Alerts ────────────────────────────────────────

/**
 * All weather/disaster alert sources for a location.
 * @param {object} [opts]
 * @param {string} [opts.country]
 * @param {number} [opts.lat]
 * @param {number} [opts.lon]
 * @param {string} [opts.location]
 * @param {number} [opts.days]
 * @returns {Promise<{gdacs, usgs, owm}>}
 */
export async function getWeatherAlerts({ country, lat, lon, location, days } = {}) {
  const params = new URLSearchParams()
  if (country)  params.set('country', country)
  if (lat)      params.set('lat', lat)
  if (lon)      params.set('lon', lon)
  if (location) params.set('location', location)
  if (days)     params.set('days', days)
  const res = await fetch(`${api('weather-alerts')}?${params}`)
  if (!res.ok) throw new Error(`weather-alerts ${res.status}`)
  return res.json()
}

/**
 * Single alert source (gdacs | usgs | owm).
 * @param {'gdacs'|'usgs'|'owm'} source
 * @param {object} [opts] - same opts as getWeatherAlerts
 */
export async function getWeatherAlertsBySource(source, opts = {}) {
  const params = new URLSearchParams({ source, ...opts })
  const res = await fetch(`${api('weather-alerts')}?${params}`)
  if (!res.ok) throw new Error(`weather-alerts ${res.status}`)
  return res.json()
}

// ── Destination News Feed ─────────────────────────────────────────────────────

/**
 * Live news articles for a destination city/country.
 * @param {object} opts
 * @param {string} [opts.city]
 * @param {string} [opts.country]
 * @returns {Promise<{articles: {title,url,source,pubDate,category}[], fetchedAt}>}
 */
export async function getDestinationFeed({ city, country }) {
  const params = new URLSearchParams()
  if (city)    params.set('city', city)
  if (country) params.set('country', country)
  const res = await fetch(`${api('destination-feed')}?${params}`)
  if (!res.ok) throw new Error(`destination-feed ${res.status}`)
  return res.json()
}
