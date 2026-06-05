/**
 * api/_geocoder.js
 *
 * Google Geocoding API wrapper with Supabase-backed cache.
 *
 * City coordinates don't change — results are cached for 30 days.
 * Reuses the existing api_cache table (no new Supabase table required).
 * Falls back gracefully to null on any error so the ingest pipeline
 * continues uninterrupted.
 *
 * Reuses the GOOGLE_MAPS_API_KEY already present in the Vercel env.
 * Ensure the key has "Geocoding API" enabled in Google Cloud Console.
 */

import { dbCacheGet, dbCacheSet } from './_dbCache.js'

const GOOGLE_KEY = () => process.env.GOOGLE_MAPS_API_KEY || ''

// 30 days — city coordinates are static
const TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Resolve a city + country string to { lat, lon } via Google Geocoding API.
 * Results are cached in api_cache. Returns null on miss, error, or missing key.
 *
 * @param {string} city
 * @param {string} country
 * @returns {Promise<{lat: number, lon: number}|null>}
 */
export async function geocodeCity(city, country) {
  if (!city || !country) return null

  const cacheKey = `geocode:${city.toLowerCase().trim()}:${country.toLowerCase().trim()}`

  const cached = await dbCacheGet(cacheKey)
  if (cached) return cached

  const key = GOOGLE_KEY()
  if (!key) {
    console.warn('[geocoder] GOOGLE_MAPS_API_KEY not set — skipping geocode')
    return null
  }

  try {
    const query   = encodeURIComponent(`${city}, ${country}`)
    const url     = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${key}`
    const res     = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null

    const data = await res.json()
    if (data.status !== 'OK' || !data.results?.[0]) return null

    const { lat, lng } = data.results[0].geometry.location
    const coords = { lat, lon: lng }

    await dbCacheSet(cacheKey, coords, TTL_MS)
    return coords
  } catch {
    return null  // fail open — never block ingest
  }
}

/**
 * Geocode a batch of normalized events in parallel (max 8 concurrent).
 * Attaches city_lat and city_lon to each event where resolution succeeds.
 * Events without a city, or where geocoding fails, are returned unchanged.
 *
 * @param {object[]} events  — normalized articles from _intelNormalizer
 * @returns {Promise<object[]>}
 */
export async function enrichWithCoordinates(events) {
  if (!events?.length) return events

  const CONCURRENCY = 8
  const results     = [...events]

  for (let i = 0; i < results.length; i += CONCURRENCY) {
    const batch = results.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (event, idx) => {
        if (!event.city || event.city_lat != null) return
        const coords = await geocodeCity(event.city, event.country)
        if (coords) {
          results[i + idx] = { ...event, city_lat: coords.lat, city_lon: coords.lon }
        }
      })
    )
  }

  return results
}
