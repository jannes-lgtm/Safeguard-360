/**
 * src/pages/MovementIntel.jsx
 *
 * Live Traffic & Movement Intelligence System
 *
 * - MapLibre GL JS full-screen operational map
 * - HERE traffic tile overlay (if VITE_HERE_API_KEY set)
 * - Corridor lines coloured by live congestion level
 * - Auto-geolocation + city/AO detection
 * - Route planner with ETA, delay, and HERE route geometry
 * - Alternate route rendering (dashed)
 * - Left panel: Corridor Status | Route Planner
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  Navigation, MapPin, Route, ChevronDown,
  Layers, RefreshCw, X, ChevronLeft, ChevronRight,
  AlertTriangle, Clock, Search, LocateFixed,
  ArrowRight, TrendingUp, Info, Heart, Shield, Flame,
} from 'lucide-react'
import Layout from '../components/Layout'
import LocationAutocomplete from '../components/LocationAutocomplete'
import { MAP_STYLES, MAP_DEFAULTS } from '../lib/mapConfig'
import { supabase } from '../lib/supabase'

// ── Congestion colour palette ─────────────────────────────────────────────────
const CONG_COLOR = {
  free:       '#22c55e',
  low:        '#84cc16',
  moderate:   '#f97316',
  heavy:      '#ef4444',
  standstill: '#991b1b',
  unknown:    '#AACC00',
}

const CONG_LABEL = {
  free:       'CLEAR',
  low:        'LIGHT',
  moderate:   'MODERATE',
  heavy:      'HEAVY',
  standstill: 'STANDSTILL',
  unknown:    'MONITORING',
}

const CONG_ORDER = { standstill: 0, heavy: 1, moderate: 2, low: 3, free: 4, unknown: 5 }

function fmtMins(secs) {
  if (!secs) return null
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ── Corridor status badge ─────────────────────────────────────────────────────
function LevelBadge({ level, small }) {
  const color = CONG_COLOR[level] || CONG_COLOR.unknown
  const label = CONG_LABEL[level] || level?.toUpperCase() || 'NO DATA'
  return (
    <span
      className={`font-bold rounded-full border ${small ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'}`}
      style={{
        background: `${color}18`,
        color,
        borderColor: `${color}44`,
      }}
    >
      {label}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MovementIntel() {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const markersRef   = useRef({ origin: null, dest: null })

  const [mapReady,   setMapReady]   = useState(false)
  const [corridors,  setCorridors]  = useState([])
  const [snapshots,  setSnapshots]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [aoList,     setAoList]     = useState(['All'])
  const [activeAO,   setActiveAO]   = useState('All')
  const [aoOpen,     setAoOpen]     = useState(false)

  const [panelTab,   setPanelTab]   = useState('corridors')
  const [isMobile,   setIsMobile]   = useState(() => window.innerWidth < 768)
  const [panelOpen,  setPanelOpen]  = useState(() => window.innerWidth >= 768)

  const [showCorridors, setShowCorridors] = useState(true)
  const [showRoute,     setShowRoute]     = useState(true)

  const [geoStatus,    setGeoStatus]    = useState('idle')
  const userLocationRef = useRef(null)

  const [routeOrigin,  setRouteOrigin]  = useState('')
  const [routeDest,    setRouteDest]    = useState('')
  const [routeResult,  setRouteResult]  = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError,   setRouteError]   = useState(null)

  // ── Track mobile breakpoint ─────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) setPanelOpen(true)
    }
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     MAP_STYLES.operational,
      center:    MAP_DEFAULTS.center,
      zoom:      MAP_DEFAULTS.zoom,
      minZoom:   MAP_DEFAULTS.minZoom,
      maxZoom:   MAP_DEFAULTS.maxZoom,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-right')

    const style = document.createElement('style')
    style.textContent = `
      .maplibregl-popup-content {
        background: #1e293b;
        color: #f1f5f9;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 10px 12px;
        font-family: system-ui, sans-serif;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        max-width: 220px;
      }
      .maplibregl-popup-close-button { color: #94a3b8; font-size: 16px; }
      .maplibregl-popup-tip { display: none !important; }
    `
    document.head.appendChild(style)

    map.on('load', () => {
      // ── Sources ──────────────────────────────────────────────────────────────
      const empty = { type: 'FeatureCollection', features: [] }
      map.addSource('corridors',       { type: 'geojson', data: empty })
      map.addSource('route-alt',       { type: 'geojson', data: empty })
      map.addSource('route-primary',   { type: 'geojson', data: empty })
      map.addSource('route-segments',  { type: 'geojson', data: empty })

      // ── Corridor glow (behind main line) ──────────────────────────────────
      map.addLayer({
        id: 'corridors-glow', type: 'line', source: 'corridors',
        paint: { 'line-color': ['get', 'color'], 'line-width': 10, 'line-opacity': 0.15, 'line-blur': 5 },
      })

      // ── Corridor lines ────────────────────────────────────────────────────
      map.addLayer({
        id: 'corridors-line', type: 'line', source: 'corridors',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2, 8, 4, 12, 6],
          'line-opacity': 0.9,
        },
      })

      // ── Alternate route (dashed gray) ─────────────────────────────────────
      map.addLayer({
        id: 'route-alt-line', type: 'line', source: 'route-alt',
        paint: {
          'line-color': '#64748b',
          'line-width': 2,
          'line-dasharray': [5, 4],
          'line-opacity': 0.6,
        },
      })

      // ── Primary route glow ────────────────────────────────────────────────
      map.addLayer({
        id: 'route-primary-glow', type: 'line', source: 'route-primary',
        paint: { 'line-color': '#3b82f6', 'line-width': 14, 'line-opacity': 0.18, 'line-blur': 8 },
      })

      // ── Primary route (fallback blue line) ───────────────────────────────
      map.addLayer({
        id: 'route-primary-line', type: 'line', source: 'route-primary',
        paint: {
          'line-color': '#3b82f6',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 5, 12, 7],
          'line-opacity': 0.95,
        },
      })

      // ── Risk-coloured route segments (overrides primary when present) ─────
      map.addLayer({
        id: 'route-segments-line', type: 'line', source: 'route-segments',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 5, 12, 7],
          'line-opacity': 0.97,
        },
      })

      // ── Corridor click popup ──────────────────────────────────────────────
      map.on('click', 'corridors-line', (e) => {
        const p = e.features?.[0]?.properties
        if (!p) return
        new maplibregl.Popup({ closeButton: true, offset: 10 })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="line-height:1.5">
              <div style="font-weight:700;font-size:13px">${p.name}</div>
              <div style="font-size:11px;color:#94a3b8;margin-bottom:6px">${p.country || ''}</div>
              <span style="background:${p.color}22;color:${p.color};border:1px solid ${p.color}44;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700">${(p.level || 'UNKNOWN').toUpperCase()}</span>
              ${p.travelMins ? `<div style="margin-top:6px;font-size:11px">Travel: ~<b>${p.travelMins}m</b></div>` : ''}
              ${p.delayMins > 0 ? `<div style="font-size:11px;color:#f87171">Delay: +${p.delayMins}m</div>` : ''}
            </div>
          `)
          .addTo(map)
      })

      map.on('mouseenter', 'corridors-line', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'corridors-line', () => { map.getCanvas().style.cursor = '' })

      setMapReady(true)
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      document.head.removeChild(style)
    }
  }, [])

  // ── Fetch corridor + snapshot data ──────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { data: cors } = await supabase
          .from('traffic_corridors')
          .select('id,name,country,region,origin_name,dest_name,origin_lat,origin_lon,dest_lat,dest_lon,route_type,route_geometry')
          .eq('is_active', true)

        const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
        const { data: snaps } = await supabase
          .from('traffic_snapshots')
          .select('corridor_id,congestion_level,congestion_ratio,travel_time_secs,free_flow_secs,delay_secs,captured_at')
          .gte('captured_at', cutoff)
          .order('captured_at', { ascending: false })

        const corridorList = Array.isArray(cors)  ? cors  : []
        const snapList     = Array.isArray(snaps) ? snaps : []

        setCorridors(corridorList)
        setSnapshots(snapList)

        const cities = new Set()
        for (const c of corridorList) {
          if (c.origin_name) cities.add(c.origin_name)
          if (c.dest_name)   cities.add(c.dest_name)
        }
        setAoList(['All', ...Array.from(cities).sort()])
      } catch (err) {
        console.warn('[MovementIntel] load error:', err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Update corridor GeoJSON on map ──────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    if (!map.getSource('corridors')) return

    const latestSnap = {}
    for (const s of snapshots) {
      if (!latestSnap[s.corridor_id]) latestSnap[s.corridor_id] = s
    }

    const filtered = activeAO === 'All'
      ? corridors
      : corridors.filter(c =>
          (c.origin_name || '').toLowerCase().includes(activeAO.toLowerCase()) ||
          (c.dest_name   || '').toLowerCase().includes(activeAO.toLowerCase()) ||
          (c.region      || '').toLowerCase().includes(activeAO.toLowerCase())
        )

    const features = filtered
      .filter(c => c.origin_lat && c.origin_lon && c.dest_lat && c.dest_lon)
      .map(c => {
        const snap       = latestSnap[c.id]
        const level      = snap?.congestion_level || 'unknown'
        const color      = CONG_COLOR[level] || CONG_COLOR.unknown
        const travelMins = snap?.travel_time_secs ? Math.round(snap.travel_time_secs / 60) : null
        const delayMins  = snap?.delay_secs       ? Math.round(snap.delay_secs  / 60)      : 0
        return {
          type: 'Feature',
          geometry: c.route_geometry || {
            type: 'LineString',
            coordinates: [
              [c.origin_lon, c.origin_lat],
              [c.dest_lon,   c.dest_lat],
            ],
          },
          properties: { id: c.id, name: c.name, country: c.country, level, color, travelMins, delayMins },
        }
      })

    map.getSource('corridors').setData({ type: 'FeatureCollection', features })
    const vis = showCorridors ? 'visible' : 'none'
    map.setLayoutProperty('corridors-line', 'visibility', vis)
    map.setLayoutProperty('corridors-glow', 'visibility', vis)
  }, [mapReady, corridors, snapshots, activeAO, showCorridors])

  // ── Route visibility toggle ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    const vis = showRoute ? 'visible' : 'none'
    ;['route-primary-line','route-primary-glow','route-alt-line'].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
    })
  }, [mapReady, showRoute])

  // ── Auto-geolocation on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return
    setGeoStatus('detecting')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lon } = pos.coords
        userLocationRef.current = { lat, lon }
        setGeoStatus('detected')
        setRouteOrigin(`${lat.toFixed(5)}, ${lon.toFixed(5)}`)
        mapRef.current?.flyTo({ center: [lon, lat], zoom: 7, duration: 1500 })

        // Try to match AO from location
        if (corridors.length > 0) {
          const nearest = corridors.reduce((best, c) => {
            const d = Math.min(
              Math.hypot(lat - c.origin_lat, lon - c.origin_lon),
              Math.hypot(lat - c.dest_lat,   lon - c.dest_lon)
            )
            return d < best.d ? { d, name: c.origin_name || c.dest_name } : best
          }, { d: Infinity, name: null })
          if (nearest.name && nearest.d < 3) setActiveAO(nearest.name)
        }
      },
      () => setGeoStatus('denied'),
      { timeout: 10000, maximumAge: 120000 }
    )
  }, [corridors])

  // ── Plan route ──────────────────────────────────────────────────────────────
  const planRoute = useCallback(async () => {
    if (!routeOrigin.trim() || !routeDest.trim()) return
    setRouteLoading(true)
    setRouteError(null)
    setRouteResult(null)

    // Remove previous markers and clear route layers
    markersRef.current.origin?.remove()
    markersRef.current.dest?.remove()
    if (mapRef.current?.getSource('route-primary')) {
      const emptyFC = { type: 'FeatureCollection', features: [] }
      mapRef.current.getSource('route-primary').setData(emptyFC)
      mapRef.current.getSource('route-segments').setData(emptyFC)
      mapRef.current.getSource('route-alt').setData(emptyFC)
    }

    try {
      // Detect if origin looks like coordinates
      const coordRe = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/
      const params  = new URLSearchParams()

      if (coordRe.test(routeOrigin.trim())) {
        const [lat, lon] = routeOrigin.trim().split(',').map(Number)
        params.set('originLat', lat)
        params.set('originLon', lon)
      } else {
        params.set('origin', routeOrigin.trim())
      }

      if (coordRe.test(routeDest.trim())) {
        const [lat, lon] = routeDest.trim().split(',').map(Number)
        params.set('destLat', lat)
        params.set('destLon', lon)
      } else {
        params.set('destination', routeDest.trim())
      }

      const res  = await fetch(`/api/route-lookup?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Route lookup failed')
      setRouteResult(data)
      setPanelTab('route')

      const map = mapRef.current
      if (map) {
        // Route geometry — use coloured segments when available, blue fallback otherwise
        if (data.here?.geometry) {
          if (data.routeSegments) {
            map.getSource('route-segments').setData(data.routeSegments)
            map.setPaintProperty('route-primary-line', 'line-opacity', 0.15) // dim fallback; keep glow
          } else {
            map.getSource('route-primary').setData({
              type: 'FeatureCollection',
              features: [{ type: 'Feature', geometry: data.here.geometry, properties: {} }],
            })
            map.setPaintProperty('route-primary-line', 'line-opacity', 0.95)
          }
          // Always set primary for glow layer
          map.getSource('route-primary').setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: data.here.geometry, properties: {} }],
          })
        }

        // Alternates
        const altFeatures = (data.here?.alternatives || [])
          .filter(a => a.geometry)
          .map(a => ({ type: 'Feature', geometry: a.geometry, properties: {} }))
        map.getSource('route-alt').setData({
          type: 'FeatureCollection',
          features: altFeatures,
        })

        // Origin marker
        const originEl = document.createElement('div')
        originEl.style.cssText = `width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid white;box-shadow:0 0 0 3px rgba(34,197,94,0.3);`
        markersRef.current.origin = new maplibregl.Marker({ element: originEl, anchor: 'center' })
          .setLngLat([data.origin.lon, data.origin.lat])
          .addTo(map)

        // Destination marker
        const destEl = document.createElement('div')
        destEl.style.cssText = `width:14px;height:14px;border-radius:50%;background:#ef4444;border:2px solid white;box-shadow:0 0 0 3px rgba(239,68,68,0.3);`
        markersRef.current.dest = new maplibregl.Marker({ element: destEl, anchor: 'center' })
          .setLngLat([data.destination.lon, data.destination.lat])
          .addTo(map)

        // Fit bounds to route
        const coords = data.here?.geometry?.coordinates
        if (coords?.length >= 2) {
          const lats = coords.map(c => c[1])
          const lons = coords.map(c => c[0])
          map.fitBounds(
            [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
            { padding: { top: 60, bottom: 60, left: panelOpen ? 380 : 60, right: 60 }, duration: 1200 }
          )
        } else {
          map.flyTo({ center: [data.origin.lon, data.origin.lat], zoom: 8, duration: 1200 })
        }
      }
    } catch (err) {
      setRouteError(err.message)
    } finally {
      setRouteLoading(false)
    }
  }, [routeOrigin, routeDest, panelOpen])

  // ── Derived: enriched corridor list for panel ───────────────────────────────
  const latestSnap = {}
  for (const s of snapshots) {
    if (!latestSnap[s.corridor_id]) latestSnap[s.corridor_id] = s
  }

  const filteredCorridors = (activeAO === 'All'
    ? corridors
    : corridors.filter(c =>
        (c.origin_name || '').toLowerCase().includes(activeAO.toLowerCase()) ||
        (c.dest_name   || '').toLowerCase().includes(activeAO.toLowerCase())
      )
  ).map(c => ({ ...c, snap: latestSnap[c.id] || null }))
   .sort((a, b) =>
     (CONG_ORDER[a.snap?.congestion_level || 'unknown'] ?? 5) -
     (CONG_ORDER[b.snap?.congestion_level || 'unknown'] ?? 5)
   )

  const alertCount = filteredCorridors.filter(c =>
    ['heavy','standstill'].includes(c.snap?.congestion_level)
  ).length

  // ── Fly to corridor on click in panel ──────────────────────────────────────
  const flyToCorridor = useCallback((c) => {
    if (!mapRef.current) return
    const lat = (c.origin_lat + c.dest_lat) / 2
    const lon = (c.origin_lon + c.dest_lon) / 2
    mapRef.current.flyTo({ center: [lon, lat], zoom: 8, duration: 1000 })
  }, [])

  return (
    <Layout>
      <div className="relative -mx-4 lg:-mx-7" style={{ height: 'calc(100vh - 56px)' }}>

        {/* ── Floating top bar ─────────────────────────────────────────────── */}
        <div
          className="absolute z-20 flex items-center gap-2 px-3 py-2 rounded-[10px] shadow-xl"
          style={{
            top: 12,
            left: panelOpen && !isMobile ? 'calc(320px + 12px)' : 12,
            background: 'rgba(15,23,42,0.92)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(8px)',
            transition: 'left 0.2s ease',
            maxWidth: 'calc(100vw - 180px)',
          }}
        >
          {/* AO dropdown */}
          <div className="relative">
            <button
              onClick={() => setAoOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/90 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <MapPin size={12} className="text-[#AACC00]" />
              {activeAO}
              <ChevronDown size={11} className="text-white/50" />
            </button>
            {aoOpen && (
              <div
                className="absolute top-full left-0 mt-1 rounded-[8px] overflow-hidden shadow-xl"
                style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', minWidth: 160, maxHeight: 240, overflowY: 'auto', zIndex: 100 }}
              >
                {aoList.map(ao => (
                  <button
                    key={ao}
                    onClick={() => { setActiveAO(ao); setAoOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-white/10 ${activeAO === ao ? 'text-[#AACC00]' : 'text-white/80'}`}
                  >
                    {ao}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-white/15" />

          {/* Layer toggles */}
          <button
            onClick={() => setShowCorridors(v => !v)}
            title="Toggle corridors"
            className={`p-1.5 rounded-lg transition-colors ${showCorridors ? 'text-[#AACC00] bg-[#AACC00]/15' : 'text-white/40 hover:bg-white/10'}`}
          >
            <Route size={14} />
          </button>
          <button
            onClick={() => setShowRoute(v => !v)}
            title="Toggle route"
            className={`p-1.5 rounded-lg transition-colors ${showRoute ? 'text-blue-400 bg-blue-500/15' : 'text-white/40 hover:bg-white/10'}`}
          >
            <Navigation size={14} />
          </button>

          <div className="w-px h-4 bg-white/15" />

          {/* Status */}
          {loading ? (
            <span className="flex items-center gap-1.5 text-[10px] text-white/50">
              <RefreshCw size={10} className="animate-spin" /> Loading…
            </span>
          ) : (
            <span className="text-[10px] text-white/50">
              {corridors.length} corridors
              {alertCount > 0 && (
                <span className="ml-2 text-red-400 font-semibold">{alertCount} alert{alertCount > 1 ? 's' : ''}</span>
              )}
            </span>
          )}
        </div>

        {/* ── Left panel ───────────────────────────────────────────────────── */}
        <div
          className="absolute z-10 flex flex-col"
          style={{
            top: 0,
            left: 0,
            bottom: 0,
            width: isMobile ? '100%' : 320,
            background: 'rgba(15,23,42,0.95)',
            borderRight: '1px solid rgba(255,255,255,0.09)',
            backdropFilter: 'blur(12px)',
            transform: panelOpen ? 'translateX(0)' : isMobile ? 'translateX(-100%)' : 'translateX(-320px)',
            transition: 'transform 0.22s ease',
          }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-[#AACC00]" />
              <span className="text-xs font-bold text-white tracking-wide">MOVEMENT INTEL</span>
            </div>
            <button onClick={() => setPanelOpen(false)} className="text-white/40 hover:text-white/80 transition-colors">
              <X size={14} />
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-white/[0.08]">
            {[
              { id: 'corridors', label: 'Corridor Status', icon: Route },
              { id: 'route',     label: 'Route Planner',   icon: Navigation },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setPanelTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold transition-colors border-b-2 ${
                  panelTab === id
                    ? 'text-[#AACC00] border-[#AACC00]'
                    : 'text-white/40 border-transparent hover:text-white/70'
                }`}
              >
                <Icon size={11} />{label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>

            {/* ── Corridor Status tab ─────────────────────────────────────── */}
            {panelTab === 'corridors' && (
              <div className="p-3 space-y-1">
                {loading && (
                  <div className="flex items-center justify-center py-10 text-white/30">
                    <RefreshCw size={16} className="animate-spin mr-2" />
                    <span className="text-xs">Loading corridors…</span>
                  </div>
                )}
                {!loading && filteredCorridors.length === 0 && (
                  <div className="py-10 text-center text-xs text-white/30">
                    No corridors match this AO.
                  </div>
                )}
                {filteredCorridors.map(c => {
                  const level    = c.snap?.congestion_level || 'unknown'
                  const travel   = c.snap?.travel_time_secs ? Math.round(c.snap.travel_time_secs / 60) : null
                  const delay    = c.snap?.delay_secs       ? Math.round(c.snap.delay_secs / 60)       : 0
                  return (
                    <button
                      key={c.id}
                      onClick={() => flyToCorridor(c)}
                      className="w-full text-left rounded-[8px] px-3 py-2.5 hover:bg-white/[0.06] transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-semibold text-white/90 truncate leading-snug">{c.name}</div>
                          <div className="text-[10px] text-white/35 mt-0.5">{c.country} {c.region ? `· ${c.region}` : ''}</div>
                        </div>
                        <LevelBadge level={level} small />
                      </div>
                      {(travel || delay > 0) && (
                        <div className="flex items-center gap-3 mt-1.5">
                          {travel && (
                            <span className="flex items-center gap-1 text-[10px] text-white/50">
                              <Clock size={9} /> {travel}m
                            </span>
                          )}
                          {delay > 0 && (
                            <span className="flex items-center gap-1 text-[10px] text-red-400">
                              <TrendingUp size={9} /> +{delay}m delay
                            </span>
                          )}
                        </div>
                      )}
                      {!c.snap && (
                        <div className="text-[10px] text-white/25 mt-1">No recent snapshot</div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* ── Route Planner tab ───────────────────────────────────────── */}
            {panelTab === 'route' && (
              <div className="p-4 space-y-4">

                {/* Origin field */}
                <div>
                  <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1.5">
                    Origin
                    {geoStatus === 'detected' && (
                      <LocateFixed size={9} className="inline ml-1.5 text-green-400" />
                    )}
                  </label>
                  <LocationAutocomplete
                    value={routeOrigin}
                    onChange={e => setRouteOrigin(e.target.value)}
                    onSelect={item => setRouteOrigin(item.display || item.label)}
                    placeholder="City, address or lat,lon"
                    dark
                    className="w-full px-3 py-2.5 rounded-[8px] text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-[#AACC00]/50"
                    inputStyle={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                  />
                </div>

                {/* Destination field */}
                <div>
                  <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1.5">
                    Destination
                  </label>
                  <LocationAutocomplete
                    value={routeDest}
                    onChange={e => setRouteDest(e.target.value)}
                    onSelect={item => setRouteDest(item.display || item.label)}
                    placeholder="City, address or lat,lon"
                    dark
                    className="w-full px-3 py-2.5 rounded-[8px] text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-[#AACC00]/50"
                    inputStyle={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                  />
                </div>

                {/* Plan button */}
                <button
                  onClick={planRoute}
                  disabled={routeLoading || !routeOrigin.trim() || !routeDest.trim()}
                  className="w-full py-2.5 rounded-[8px] text-xs font-bold text-[#0A1628] transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: routeLoading ? '#6b7280' : '#AACC00' }}
                >
                  {routeLoading
                    ? <><RefreshCw size={12} className="animate-spin" /> Planning route…</>
                    : <><Search size={12} /> Plan Route</>
                  }
                </button>

                {/* Error */}
                {routeError && (
                  <div className="rounded-[8px] p-3 text-xs text-red-300 flex items-start gap-2"
                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    {routeError}
                  </div>
                )}

                {/* ── Operational route result ──────────────────────────── */}
                {routeResult && !routeError && (
                  <div className="space-y-3">

                    {/* Header: route + exposure status badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="text-[10px] text-white/65 font-medium truncate">
                          {routeResult.origin?.city || routeResult.origin?.label}
                        </span>
                        <ArrowRight size={9} className="shrink-0 text-white/30" />
                        <span className="text-[10px] text-white/65 font-medium truncate">
                          {routeResult.destination?.city || routeResult.destination?.label}
                        </span>
                      </div>
                      {routeResult.exposure && (
                        <span
                          className="text-[8px] font-bold px-2 py-0.5 rounded shrink-0 uppercase tracking-wide"
                          style={{
                            background: `${routeResult.exposure.color}18`,
                            color: routeResult.exposure.color,
                            border: `1px solid ${routeResult.exposure.color}44`,
                          }}
                        >
                          {routeResult.exposure.status}
                        </span>
                      )}
                    </div>

                    {/* Transit times: Current / Yesterday / No Traffic */}
                    <div
                      className="rounded-[10px] p-3"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      <div className="text-[8px] font-bold text-white/30 uppercase tracking-wider mb-2.5">Transit Time</div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-[8px] text-white/35 mb-1">Current</div>
                          <div className="text-[15px] font-bold text-white leading-none">
                            {fmtMins(routeResult.here?.travel) || '—'}
                          </div>
                          <div className="text-[8px] text-white/25 mt-1">live traffic</div>
                        </div>
                        <div>
                          <div className="text-[8px] text-white/35 mb-1">Yesterday</div>
                          <div className="text-[15px] font-bold text-white/60 leading-none">
                            {fmtMins(routeResult.timeEstimates?.yesterday) || '—'}
                          </div>
                          <div className="text-[8px] text-white/25 mt-1">same time</div>
                        </div>
                        <div>
                          <div className="text-[8px] text-white/35 mb-1">No Traffic</div>
                          <div className="text-[15px] font-bold text-green-400 leading-none">
                            {fmtMins(routeResult.timeEstimates?.freeFlow ?? routeResult.here?.freeFlow) || '—'}
                          </div>
                          <div className="text-[8px] text-white/25 mt-1">free-flow</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/[0.06]">
                        <div className="flex items-center gap-1.5 text-[9px]">
                          <TrendingUp size={9} className={routeResult.here?.delay > 0 ? 'text-red-400' : 'text-green-400'} />
                          <span className={routeResult.here?.delay > 0 ? 'text-red-400' : 'text-green-400'}>
                            {routeResult.here?.delay > 0
                              ? `+${Math.round(routeResult.here.delay / 60)}m delay`
                              : 'No delay'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {routeResult.distKm && (
                            <span className="text-[9px] text-white/30">{routeResult.distKm} km</span>
                          )}
                          <LevelBadge level={routeResult.consensus} small />
                        </div>
                      </div>
                    </div>

                    {/* Exposure level + Safe Corridor + Peak Window */}
                    {(routeResult.exposure || routeResult.safeCorridor || routeResult.peakWindow) && (
                      <div
                        className="rounded-[10px] p-3 space-y-2"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                      >
                        {routeResult.exposure && (
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-white/35 uppercase tracking-wider font-semibold">Exposure Level</span>
                            <span className="text-[10px] font-bold" style={{ color: routeResult.exposure.color }}>
                              {routeResult.exposure.status}
                            </span>
                          </div>
                        )}
                        {routeResult.safeCorridor && (
                          <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.06]">
                            <span className="text-[9px] text-white/35 uppercase tracking-wider font-semibold">Corridor Status</span>
                            <span className="text-[10px] font-bold" style={{ color: routeResult.safeCorridor.color }}>
                              {routeResult.safeCorridor.label}
                            </span>
                          </div>
                        )}
                        {routeResult.peakWindow && (
                          <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.06]">
                            <span className="text-[9px] text-white/35 uppercase tracking-wider font-semibold">Peak Window</span>
                            <span className="text-[9px] text-white/55">{routeResult.peakWindow}</span>
                          </div>
                        )}
                        {/* Peak rush-hour ETA if available */}
                        {routeResult.timeEstimates?.peak && (
                          <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.06]">
                            <span className="text-[9px] text-white/35 uppercase tracking-wider font-semibold">Rush Hour ETA</span>
                            <span className="text-[10px] font-bold text-red-400">
                              {fmtMins(routeResult.timeEstimates.peak)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Operational Alerts (proximity-scored, movement-relevant) */}
                    {routeResult.operationalAlerts?.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <AlertTriangle size={10} className="text-orange-400 shrink-0" />
                          <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                            Operational Alerts
                          </span>
                          <span
                            className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c' }}
                          >
                            {routeResult.operationalAlerts.length}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {routeResult.operationalAlerts.map((a, i) => {
                            const sig = a.operationalClass === 'Operationally Significant'
                            const bg  = sig ? 'rgba(239,68,68,0.08)'  : 'rgba(249,115,22,0.07)'
                            const bd  = sig ? 'rgba(239,68,68,0.20)'  : 'rgba(249,115,22,0.15)'
                            const tx  = sig ? '#f87171'               : '#fb923c'
                            return (
                              <div key={i} className="rounded-[7px] px-2.5 py-2"
                                style={{ background: bg, border: `1px solid ${bd}` }}>
                                <div className="text-[10px] font-medium leading-snug" style={{ color: tx }}>
                                  {a.raw_title || a.title}
                                </div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {a.proximityLabel && a.proximityLabel !== 'In Country' && (
                                    <span className="text-[8px] text-white/40 font-semibold uppercase tracking-wide">
                                      {a.proximityLabel}
                                    </span>
                                  )}
                                  {a.distKm != null && (
                                    <span className="text-[8px] text-white/30">{a.distKm} km</span>
                                  )}
                                  {a.movement_impact && a.movement_impact !== 'none' && (
                                    <span className="text-[8px] text-white/35 capitalize">{a.movement_impact} impact</span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Emergency Support */}
                    {routeResult.emergencyServices?.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Heart size={10} className="text-red-400 shrink-0" />
                          <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                            Emergency Support
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {routeResult.emergencyServices.slice(0, 5).map((s, i) => {
                            const Icon  = s.type === 'hospital' ? Heart : s.type === 'police' ? Shield : Flame
                            const color = s.type === 'hospital' ? '#f87171' : s.type === 'police' ? '#60a5fa' : '#fb923c'
                            const label = s.type === 'hospital' ? 'Hospital' : s.type === 'police' ? 'Police' : 'Fire'
                            return (
                              <div key={i} className="flex items-center gap-2 py-1 border-b border-white/[0.05] last:border-0">
                                <Icon size={9} style={{ color }} className="shrink-0" />
                                <span className="text-[10px] text-white/60 truncate flex-1">
                                  {s.name || label}
                                </span>
                                <span className="text-[8px] shrink-0" style={{ color: `${color}99` }}>{label}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Secondary: nearest corridor */}
                    {routeResult.nearestCorridor && (
                      <div className="rounded-[7px] p-2.5 flex items-start gap-2"
                        style={{ background: 'rgba(170,204,0,0.06)', border: '1px solid rgba(170,204,0,0.15)' }}>
                        <Info size={10} className="text-[#AACC00] shrink-0 mt-0.5" />
                        <div className="text-[9px] text-white/45 leading-relaxed">
                          Nearest corridor: <span className="text-white/65">{routeResult.nearestCorridor.name}</span>
                          {' '}({routeResult.nearestCorridor.proximityKm} km)
                        </div>
                      </div>
                    )}

                    {/* Secondary: historical best windows */}
                    {routeResult.recommendations?.best?.length > 0 && (
                      <div>
                        <div className="text-[9px] font-bold text-white/25 uppercase tracking-wider mb-1.5">Best Travel Windows</div>
                        {routeResult.recommendations.best.slice(0, 3).map((b, i) => (
                          <div key={i} className="flex items-center justify-between py-1 border-b border-white/[0.05] last:border-0">
                            <span className="text-[9px] text-white/45">{b.day} {b.hourLabel}</span>
                            <div className="flex items-center gap-2">
                              {b.avgTravelSecs && (
                                <span className="text-[9px] text-white/35">{Math.round(b.avgTravelSecs / 60)}m</span>
                              )}
                              <LevelBadge level={b.level} small />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Secondary: alternates + Google corroboration */}
                    <div className="flex items-center gap-3 flex-wrap">
                      {routeResult.here?.alternatives?.length > 0 && (
                        <span className="text-[9px] text-white/25 flex items-center gap-1">
                          <Route size={9} />
                          {routeResult.here.alternatives.length} alternate{routeResult.here.alternatives.length > 1 ? 's' : ''} (dashed)
                        </span>
                      )}
                      {routeResult.google?.ok && (
                        <span className="text-[9px] text-white/25 flex items-center gap-1.5">
                          Google: {fmtMins(routeResult.google.travel)}
                          <LevelBadge level={routeResult.google.level} small />
                        </span>
                      )}
                    </div>

                  </div>
                )}
              </div>
            )}
          </div>

          {/* Congestion legend */}
          <div className="px-4 py-3 border-t border-white/[0.06]">
            <div className="text-[9px] font-bold text-white/30 uppercase tracking-wider mb-2">Congestion</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {Object.entries(CONG_COLOR).filter(([k]) => k !== 'unknown').map(([level, color]) => (
                <div key={level} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-[9px] text-white/45 capitalize">{level}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Panel toggle button ───────────────────────────────────────────── */}
        <button
          onClick={() => setPanelOpen(v => !v)}
          className="absolute z-20 w-6 h-12 flex items-center justify-center rounded-r-[8px] transition-all"
          style={{
            top: '50%',
            transform: 'translateY(-50%)',
            left: panelOpen && !isMobile ? 320 : 0,
            background: 'rgba(15,23,42,0.9)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderLeft: panelOpen && isMobile ? '1px solid rgba(255,255,255,0.1)' : 'none',
            display: panelOpen && isMobile ? 'none' : 'flex',
            transition: 'left 0.22s ease',
          }}
        >
          {panelOpen
            ? <ChevronLeft size={14} className="text-white/60" />
            : <ChevronRight size={14} className="text-white/60" />
          }
        </button>

        {/* ── Map container ────────────────────────────────────────────────── */}
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ zIndex: 0 }}
        />

      </div>
    </Layout>
  )
}
