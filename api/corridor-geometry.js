/**
 * GET /api/corridor-geometry?force=false
 *
 * Pre-computes road-following polyline geometry for active traffic corridors
 * using HERE Routing v8, then stores decoded GeoJSON in traffic_corridors.route_geometry.
 *
 * Requires DB migration:
 *   ALTER TABLE traffic_corridors ADD COLUMN IF NOT EXISTS route_geometry JSONB;
 *
 * ?force=true  — recompute all corridors (even those with existing geometry)
 * ?force=false — compute only corridors missing geometry (default)
 * ?id=<uuid>   — compute a single corridor by ID
 */

import { adapt } from './_adapter.js'

const HERE_KEY = () => process.env.HERE_API_KEY        || ''
const SB_URL   = () => process.env.SUPABASE_URL        || process.env.VITE_SUPABASE_URL || ''
const SB_KEY   = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// ── HERE Flexible Polyline decoder (same as route-lookup.js) ──────────────────
const FP_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const FP_DECODE   = Object.fromEntries([...FP_ALPHABET].map((c, i) => [c, i]))

function fpUvarint(enc, idx) {
  let result = 0, shift = 0, i = idx
  while (i < enc.length) {
    const val = FP_DECODE[enc[i++]]
    result |= (val & 0x1f) << shift
    if (!(val & 0x20)) break
    shift += 5
  }
  return { value: result, next: i }
}

function fpSigned(raw) { return (raw & 1) ? ~(raw >> 1) : (raw >> 1) }

function decodeFlexPolyline(encoded) {
  if (!encoded) return null
  try {
    let idx = 0
    const ver = fpUvarint(encoded, idx); idx = ver.next
    if (ver.value !== 1) return null
    const hdr = fpUvarint(encoded, idx); idx = hdr.next
    const precision = hdr.value & 0x0f
    const thirdDim  = (hdr.value >> 4) & 0x07
    const factor    = Math.pow(10, precision)
    const coords = []
    let lat = 0, lon = 0
    while (idx < encoded.length) {
      const dLat = fpUvarint(encoded, idx); idx = dLat.next
      lat += fpSigned(dLat.value)
      const dLon = fpUvarint(encoded, idx); idx = dLon.next
      lon += fpSigned(dLon.value)
      if (thirdDim) { const dZ = fpUvarint(encoded, idx); idx = dZ.next }
      coords.push([lon / factor, lat / factor])
    }
    return coords.length ? { type: 'LineString', coordinates: coords } : null
  } catch { return null }
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function sbFetch(path) {
  const res = await fetch(`${SB_URL()}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}` },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`SB fetch ${res.status}: ${await res.text()}`)
  return res.json()
}

async function sbPatch(table, id, body) {
  const res = await fetch(`${SB_URL()}/rest/v1/${table}?id=eq.${id}`, {
    method:  'PATCH',
    headers: {
      apikey:         SB_KEY(),
      Authorization:  `Bearer ${SB_KEY()}`,
      'Content-Type': 'application/json',
      Prefer:         'return=minimal',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`SB patch ${res.status}`)
}

// ── Fetch HERE road geometry for one corridor ─────────────────────────────────
async function fetchGeometry(corridor, key) {
  const url = `https://router.hereapi.com/v8/routes?` +
    new URLSearchParams({
      transportMode: 'car',
      origin:        `${corridor.origin_lat},${corridor.origin_lon}`,
      destination:   `${corridor.dest_lat},${corridor.dest_lon}`,
      return:        'polyline',
      apiKey:        key,
    })
  const res  = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`HERE ${res.status}`)
  const data = await res.json()
  const poly = data?.routes?.[0]?.sections?.[0]?.polyline
  return decodeFlexPolyline(poly)
}

// ── Handler ───────────────────────────────────────────────────────────────────
async function _handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const key = HERE_KEY()
  if (!key) return res.status(503).json({ error: 'HERE_API_KEY not configured' })
  if (!SB_URL() || !SB_KEY()) return res.status(503).json({ error: 'Supabase not configured' })

  const force   = req.query?.force === 'true'
  const singleId = req.query?.id || null

  try {
    let corridors
    if (singleId) {
      corridors = await sbFetch(`traffic_corridors?id=eq.${singleId}&select=id,name,origin_lat,origin_lon,dest_lat,dest_lon`)
    } else if (force) {
      corridors = await sbFetch('traffic_corridors?is_active=eq.true&select=id,name,origin_lat,origin_lon,dest_lat,dest_lon')
    } else {
      corridors = await sbFetch('traffic_corridors?is_active=eq.true&route_geometry=is.null&select=id,name,origin_lat,origin_lon,dest_lat,dest_lon')
    }

    if (!corridors.length) {
      return res.status(200).json({ message: 'All corridors already have geometry', updated: 0, total: 0 })
    }

    const results = { updated: 0, failed: 0, errors: [] }

    // Process in batches of 4 to respect HERE rate limits
    for (let i = 0; i < corridors.length; i += 4) {
      const batch = corridors.slice(i, i + 4)
      await Promise.allSettled(
        batch.map(async (c) => {
          try {
            const geometry = await fetchGeometry(c, key)
            if (!geometry) throw new Error('No geometry decoded')
            await sbPatch('traffic_corridors', c.id, { route_geometry: geometry })
            results.updated++
          } catch (err) {
            results.failed++
            results.errors.push({ corridor: c.name, error: err.message })
          }
        })
      )
      // Brief pause between batches to avoid rate limits
      if (i + 4 < corridors.length) {
        await new Promise(r => setTimeout(r, 300))
      }
    }

    return res.status(200).json({
      message:  `Processed ${corridors.length} corridor(s)`,
      updated:  results.updated,
      failed:   results.failed,
      errors:   results.errors,
    })
  } catch (err) {
    console.error('[corridor-geometry]', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export const handler = adapt(_handler)
export default handler
