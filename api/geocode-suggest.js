/**
 * GET /api/geocode-suggest?q=Johannes&limit=5
 *
 * Server-side proxy to HERE Autocomplete API.
 * Keeps the HERE API key off the client bundle.
 * Returns up to `limit` address suggestions for the given query.
 */

import { adapt } from './_adapter.js'

const HERE_KEY = () => process.env.HERE_API_KEY || ''

async function _handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { q, limit = '6' } = req.query || {}
  if (!q || q.trim().length < 2) return res.status(200).json({ items: [] })

  const key = HERE_KEY()
  if (!key) return res.status(200).json({ items: [] })

  try {
    const url = `https://autocomplete.search.hereapi.com/v1/autocomplete?` +
      new URLSearchParams({
        q:      q.trim(),
        limit:  Math.min(parseInt(limit) || 6, 8),
        apiKey: key,
        types:  'city,street,houseNumber,place',
      })

    const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return res.status(200).json({ items: [] })

    const data = await r.json()

    const items = (data.items || []).map(item => {
      const addr = item.address || {}
      const city    = addr.city || addr.county || addr.district || ''
      const country = addr.countryName || ''
      const label   = addr.label || item.title || ''
      // Short display label: city + country (or just label if short)
      const display = city && country ? `${city}, ${country}` : label
      return { label, display, city, country }
    })

    return res.status(200).json({ items })
  } catch {
    return res.status(200).json({ items: [] })
  }
}

export const handler = adapt(_handler)
export default handler
