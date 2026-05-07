/**
 * what3words API utility
 * Converts lat/lng coordinates to a what3words address.
 * Results are cached in-memory for the session to avoid repeated API calls.
 */

const cache = new Map()

export async function toW3W(lat, lng) {
  if (!lat || !lng) return null

  const key = `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`
  if (cache.has(key)) return cache.get(key)

  const apiKey = import.meta.env.VITE_W3W_API_KEY
  if (!apiKey) {
    console.warn('[w3w] VITE_W3W_API_KEY not set')
    return null
  }

  try {
    const res = await fetch(
      `https://api.what3words.com/v3/convert-to-3wa?coordinates=${lat},${lng}&key=${apiKey}`
    )
    const data = await res.json()
    if (!res.ok || data?.error) {
      console.warn('[w3w] API error:', data?.error?.message || res.status)
      return null
    }
    const words = data?.words || null
    cache.set(key, words)
    return words
  } catch (e) {
    console.warn('[w3w] fetch failed:', e.message)
    return null
  }
}
