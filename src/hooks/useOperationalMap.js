/**
 * useOperationalMap — shared MapLibre GL map setup hook.
 *
 * Handles map creation, resize observer, and cleanup.
 * Returns mapRef (for imperative access) and a ready flag.
 *
 * Usage:
 *   const { mapRef, ready } = useOperationalMap(containerRef, {
 *     style:  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
 *     center: [36.8, -1.3],
 *     zoom:   4,
 *   })
 *
 *   useEffect(() => {
 *     if (!ready) return
 *     mapRef.current.addSource(...)
 *   }, [ready])
 */

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'

const DARK_STYLE  = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

export { DARK_STYLE, LIGHT_STYLE }

export default function useOperationalMap(containerRef, {
  style  = LIGHT_STYLE,
  center = [20, 10],
  zoom   = 2,
  minZoom,
  maxZoom,
  controls = true,
} = {}) {
  const mapRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center,
      zoom,
      ...(minZoom !== undefined && { minZoom }),
      ...(maxZoom !== undefined && { maxZoom }),
    })

    if (controls) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left')
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    }

    map.on('load', () => setReady(true))
    mapRef.current = map

    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, []) // intentionally empty — map mounts once per component lifetime

  return { mapRef, ready }
}
