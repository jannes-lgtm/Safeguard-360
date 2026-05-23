/**
 * src/pages/LiveTraffic.jsx
 *
 * Live Traffic Intelligence — full-screen Africa map with:
 * - Lime green city dots for every mapped African location (same as MovementIntel)
 * - Traffic corridor lines coloured by congestion level
 * - Floating rounded top bar matching MovementIntel style
 * - Left corridor list panel + right corridor detail panel
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  Car, Navigation, RefreshCw, X, TrendingUp,
  Route, Layers, ChevronDown, MapPin,
} from 'lucide-react'
import Layout from '../components/Layout'
import { MAP_STYLES } from '../lib/mapConfig'
import { supabase } from '../lib/supabase'
import { CITIES, CITIES_FC } from '../lib/mappedCities'

// ── Congestion palette (same as MovementIntel) ────────────────────────────────
const CONG_COLOR = {
  free:       '#22c55e',
  low:        '#84cc16',
  moderate:   '#f97316',
  heavy:      '#ef4444',
  standstill: '#991b1b',
  unknown:    '#AACC00',
}
const CONG_LABEL = {
  free: 'CLEAR', low: 'LIGHT', moderate: 'MODERATE',
  heavy: 'HEAVY', standstill: 'STANDSTILL', unknown: 'MONITORING',
}
const CONG_PCT = {
  free: 5, low: 25, moderate: 55, heavy: 80, standstill: 100, unknown: 0,
}

function fmtMins(secs) {
  if (!secs) return '—'
  const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function LevelBadge({ level, small }) {
  const color = CONG_COLOR[level] || CONG_COLOR.unknown
  const label = CONG_LABEL[level] || level?.toUpperCase() || 'NO DATA'
  return (
    <span
      className={`font-bold rounded-full border ${small ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'}`}
      style={{ background: `${color}18`, color, borderColor: `${color}44` }}
    >
      {label}
    </span>
  )
}

// ── Corridor detail panel ─────────────────────────────────────────────────────
function CorridorPanel({ corridor, onClose }) {
  if (!corridor) return null
  const color = CONG_COLOR[corridor.level] || CONG_COLOR.unknown
  const label = CONG_LABEL[corridor.level] || 'MONITORING'
  const pct   = CONG_PCT[corridor.level]   ?? 0
  return (
    <div
      className="absolute z-20 rounded-[14px] overflow-hidden"
      style={{
        top: 72, right: 14, width: 300,
        background: 'rgba(9,10,12,0.97)',
        border: '1px solid rgba(255,255,255,0.10)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 12px 48px rgba(0,0,0,0.7)',
      }}
    >
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2">
          <Route size={12} style={{ color: '#AACC00' }} />
          <span className="text-[11px] font-bold text-white tracking-widest uppercase truncate">{corridor.name}</span>
        </div>
        <button onClick={onClose} className="text-white/35 hover:text-white/70 transition-colors ml-2 shrink-0">
          <X size={14} />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-white/50">{corridor.origin_name} → {corridor.dest_name}</span>
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full border"
            style={{ background: `${color}18`, color, borderColor: `${color}44` }}
          >
            {label}
          </span>
        </div>
        {corridor.distance_km && (
          <p className="text-[10px] text-white/30">{corridor.distance_km} km · {corridor.country}</p>
        )}
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Travel',    value: corridor.travel_time },
            { label: 'Free Flow', value: corridor.free_flow },
            { label: 'Delay',     value: corridor.delay_mins > 0 ? `+${corridor.delay_mins}m` : '—' },
          ].map(s => (
            <div key={s.label} className="rounded-[8px] p-2 text-center"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-[8px] text-white/30 uppercase tracking-wide mb-0.5">{s.label}</div>
              <div className="text-[11px] font-bold text-white">{s.value}</div>
            </div>
          ))}
        </div>
        {corridor.captured_at && (
          <p className="text-[9px] text-white/25 text-right">
            Updated {new Date(corridor.captured_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Corridor list panel ───────────────────────────────────────────────────────
function CorridorListPanel({ corridors, snapshots, onSelect, lastRun }) {
  const [filter, setFilter] = useState('All')
  const countries = ['All', ...new Set(corridors.map(c => c.country).filter(Boolean).sort())]
  const visible   = filter === 'All' ? corridors : corridors.filter(c => c.country === filter)

  return (
    <div
      className="absolute z-20 rounded-[14px] overflow-hidden flex flex-col"
      style={{
        top: 72, left: 14, width: 290,
        maxHeight: 'calc(100vh - 120px)',
        background: 'rgba(9,10,12,0.97)',
        border: '1px solid rgba(255,255,255,0.10)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 12px 48px rgba(0,0,0,0.7)',
      }}
    >
      <div className="px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2 mb-0.5">
          <Route size={11} style={{ color: '#AACC00' }} />
          <span className="text-[11px] font-bold text-white tracking-widest uppercase">Live Corridors</span>
        </div>
        {lastRun && (
          <p className="text-[9px] text-white/25 mt-0.5">
            Updated {new Date(lastRun).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Country filter pills */}
      <div className="px-3 py-2 flex gap-1.5 flex-wrap shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {countries.slice(0, 7).map(c => (
          <button key={c} onClick={() => setFilter(c)}
            className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide transition-colors"
            style={{
              background: filter === c ? '#AACC00' : 'rgba(255,255,255,0.06)',
              color:      filter === c ? '#09090B' : 'rgba(255,255,255,0.40)',
            }}>
            {c}
          </button>
        ))}
      </div>

      {/* Corridor rows */}
      <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' }}>
        {visible.map(corridor => {
          const snap  = snapshots[corridor.id]
          const level = snap?.congestion_level || 'unknown'
          const color = CONG_COLOR[level] || CONG_COLOR.unknown
          const label = CONG_LABEL[level] || 'MONITORING'
          const pct   = CONG_PCT[level]   ?? 0
          const delay = snap?.delay_secs ? Math.round(snap.delay_secs / 60) : 0
          return (
            <button key={corridor.id} onClick={() => onSelect(corridor)}
              className="w-full text-left px-4 py-3 transition-colors hover:bg-white/5"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-white text-[11px] font-semibold truncate pr-2">{corridor.name}</span>
                <span className="text-[9px] font-bold shrink-0" style={{ color }}>{label}</span>
              </div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] text-white/30">{corridor.origin_name} → {corridor.dest_name}</span>
                {delay > 0 && <span className="text-[9px] text-orange-400 shrink-0">+{delay}m</span>}
              </div>
              <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LiveTraffic() {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)

  const [mapReady,   setMapReady]   = useState(false)
  const [corridors,  setCorridors]  = useState([])
  const [snapshots,  setSnapshots]  = useState({})
  const [loading,    setLoading]    = useState(true)
  const [ingesting,  setIngesting]  = useState(false)
  const [lastRun,    setLastRun]    = useState(null)
  const [selected,   setSelected]   = useState(null)
  const [showList,   setShowList]   = useState(true)
  const [counts,     setCounts]     = useState({ free: 0, degraded: 0, heavy: 0 })

  // ── Load data ────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: cors } = await supabase
        .from('traffic_corridors')
        .select('id,name,country,region,origin_name,dest_name,distance_km,origin_lat,origin_lon,dest_lat,dest_lon')
        .eq('is_active', true)
        .order('country')

      const { data: snaps } = await supabase
        .from('traffic_snapshots')
        .select('corridor_id,congestion_level,travel_time_secs,free_flow_secs,delay_secs,here_jam_factor,captured_at')
        .in('corridor_id', (cors || []).map(c => c.id))
        .order('captured_at', { ascending: false })

      const latest = {}
      for (const s of (snaps || [])) {
        if (!latest[s.corridor_id]) latest[s.corridor_id] = s
      }

      setCorridors(cors || [])
      setSnapshots(latest)

      const newest = Object.values(latest).sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))[0]
      if (newest) setLastRun(newest.captured_at)

      const vals = Object.values(latest)
      setCounts({
        free:     vals.filter(s => s.congestion_level === 'free' || s.congestion_level === 'low').length,
        degraded: vals.filter(s => s.congestion_level === 'moderate').length,
        heavy:    vals.filter(s => ['heavy', 'standstill'].includes(s.congestion_level)).length,
      })
    } catch (err) {
      console.warn('[LiveTraffic] load error:', err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Init map ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     MAP_STYLES.operational,
      center:    [20, 2],
      zoom:      3.5,
      minZoom:   2,
      maxZoom:   18,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-right')

    const style = document.createElement('style')
    style.textContent = `
      .maplibregl-popup-content {
        background: #11131A;
        color: #EAEEF5;
        border: 1px solid rgba(170,204,0,0.25);
        border-radius: 8px;
        padding: 10px 12px;
        font-family: system-ui, sans-serif;
        box-shadow: 0 4px 24px rgba(0,0,0,0.5);
        max-width: 220px;
      }
      .maplibregl-popup-close-button { color: #6E7480; font-size: 16px; }
      .maplibregl-popup-tip { display: none !important; }
      .maplibregl-ctrl-bottom-right { bottom: 28px !important; }
    `
    document.head.appendChild(style)

    const empty = { type: 'FeatureCollection', features: [] }

    map.on('load', () => {
      // ── Sources ──────────────────────────────────────────────────────────────
      map.addSource('africa-cities', { type: 'geojson', data: CITIES_FC })
      map.addSource('corridors',     { type: 'geojson', data: empty })

      // ── City dot halo ────────────────────────────────────────────────────────
      map.addLayer({
        id: 'city-halo', type: 'circle', source: 'africa-cities',
        paint: {
          'circle-radius':  ['interpolate', ['linear'], ['zoom'], 2, 5, 5, 9, 8, 14],
          'circle-color':   '#AACC00',
          'circle-opacity': 0.08,
          'circle-blur':    1,
        },
      })

      // ── City dots ────────────────────────────────────────────────────────────
      map.addLayer({
        id: 'city-dot', type: 'circle', source: 'africa-cities',
        paint: {
          'circle-radius':       ['interpolate', ['linear'], ['zoom'], 2, 2, 5, 3, 8, 4.5],
          'circle-color':        '#AACC00',
          'circle-opacity':      ['interpolate', ['linear'], ['zoom'], 2, 0.5, 4, 0.8, 7, 0.95],
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 2, 0, 5, 1],
          'circle-stroke-color': 'rgba(170,204,0,0.4)',
        },
      })

      // ── City labels (high zoom) ──────────────────────────────────────────────
      map.addLayer({
        id: 'city-label', type: 'symbol', source: 'africa-cities',
        minzoom: 6,
        layout: {
          'text-field':    ['get', 'name'],
          'text-font':     ['Open Sans Regular'],
          'text-size':     10,
          'text-offset':   [0, 1.2],
          'text-anchor':   'top',
          'text-optional': true,
        },
        paint: {
          'text-color':      'rgba(170,204,0,0.75)',
          'text-halo-color': 'rgba(0,0,0,0.6)',
          'text-halo-width': 1,
        },
      })

      // ── Corridor glow ────────────────────────────────────────────────────────
      map.addLayer({
        id: 'corridors-glow', type: 'line', source: 'corridors',
        paint: { 'line-color': ['get', 'color'], 'line-width': 10, 'line-opacity': 0.15, 'line-blur': 5 },
      })

      // ── Corridor lines ───────────────────────────────────────────────────────
      map.addLayer({
        id: 'corridors-line', type: 'line', source: 'corridors',
        paint: {
          'line-color':   ['get', 'color'],
          'line-width':   ['interpolate', ['linear'], ['zoom'], 3, 2, 8, 4, 12, 6],
          'line-opacity': 0.9,
        },
      })

      // ── Corridor click popup ─────────────────────────────────────────────────
      map.on('click', 'corridors-line', (e) => {
        const p = e.features?.[0]?.properties
        if (!p) return
        new maplibregl.Popup({ closeButton: true, offset: 10 })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="line-height:1.5">
              <div style="font-weight:700;font-size:13px">${p.name}</div>
              <div style="font-size:11px;color:#6E7480;margin-bottom:6px">${p.country || ''}</div>
              <span style="background:${p.color}22;color:${p.color};border:1px solid ${p.color}44;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700">${(p.level || 'UNKNOWN').toUpperCase()}</span>
              ${p.travel_time && p.travel_time !== '—' ? `<div style="margin-top:6px;font-size:11px">Travel: ~<b>${p.travel_time}</b></div>` : ''}
              ${p.delay_mins > 0 ? `<div style="font-size:11px;color:#f87171">Delay: +${p.delay_mins}m</div>` : ''}
            </div>
          `)
          .addTo(map)
      })

      // ── City dot popup ───────────────────────────────────────────────────────
      map.on('click', 'city-dot', (e) => {
        const name = e.features?.[0]?.properties?.name
        if (!name) return
        new maplibregl.Popup({ closeButton: false, offset: 8 })
          .setLngLat(e.features[0].geometry.coordinates)
          .setHTML(`<div style="font-size:12px;font-weight:600;color:#AACC00">${name}</div>`)
          .addTo(map)
      })

      map.on('mouseenter', 'corridors-line', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'corridors-line', () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'city-dot',       () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'city-dot',       () => { map.getCanvas().style.cursor = '' })

      setMapReady(true)
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      document.head.removeChild(style)
    }
  }, [])

  // ── Update corridors on map ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const src = map.getSource('corridors')
    if (!src) return

    const features = corridors
      .filter(c => c.origin_lat && c.origin_lon && c.dest_lat && c.dest_lon)
      .map(c => {
        const snap       = snapshots[c.id]
        const level      = snap?.congestion_level || 'unknown'
        const color      = CONG_COLOR[level] || CONG_COLOR.unknown
        const travel_time = fmtMins(snap?.travel_time_secs)
        const delay_mins  = snap?.delay_secs ? Math.round(snap.delay_secs / 60) : 0
        return {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[c.origin_lon, c.origin_lat], [c.dest_lon, c.dest_lat]] },
          properties: { id: c.id, name: c.name, country: c.country, level, color, travel_time, delay_mins },
        }
      })

    src.setData({ type: 'FeatureCollection', features })
  }, [mapReady, corridors, snapshots])

  async function triggerIngest() {
    setIngesting(true)
    try { await fetch('/api/traffic-ingest', { method: 'POST' }) } catch { /* ignore */ }
    await loadData()
    setIngesting(false)
  }

  function handleSelectCorridor(corridor) {
    const snap = snapshots[corridor.id]
    const level = snap?.congestion_level || 'unknown'
    setSelected({
      ...corridor,
      level,
      travel_time: fmtMins(snap?.travel_time_secs),
      free_flow:   fmtMins(snap?.free_flow_secs),
      delay_mins:  snap?.delay_secs ? Math.round(snap.delay_secs / 60) : 0,
      captured_at: snap?.captured_at ?? null,
    })
    setShowList(false)

    const map = mapRef.current
    if (map && corridor.origin_lat && corridor.dest_lat) {
      map.flyTo({
        center: [(corridor.origin_lon + corridor.dest_lon) / 2, (corridor.origin_lat + corridor.dest_lat) / 2],
        zoom: 6, duration: 1000,
      })
    }
  }

  const alertCount = Object.values(snapshots).filter(s => ['heavy', 'standstill'].includes(s.congestion_level)).length

  return (
    <Layout>
      <div className="relative -mx-4 lg:-mx-7" style={{ height: 'calc(100vh - 56px)' }}>

        {/* Map */}
        <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 0 }} />

        {/* ── Top bar (floating, rounded — matches MovementIntel) ─────────────── */}
        <div className="absolute z-20" style={{ top: 14, left: 14, right: 14, pointerEvents: 'none' }}>
          <div
            className="flex items-center gap-2 px-4 h-11 rounded-[12px]"
            style={{
              background:     'rgba(9,10,12,0.90)',
              border:         '1px solid rgba(255,255,255,0.09)',
              backdropFilter: 'blur(16px)',
              boxShadow:      '0 4px 32px rgba(0,0,0,0.5)',
              pointerEvents:  'auto',
            }}
          >
            {/* Brand */}
            <Car size={13} className="text-[#AACC00] shrink-0" />
            <span className="text-[11px] font-bold text-white tracking-widest uppercase">Live Traffic</span>

            <div className="w-px h-4 bg-white/10 mx-0.5" />

            {/* Congestion counts */}
            {!loading && (
              <>
                <span className="flex items-center gap-1.5 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
                  <span className="text-white/50">{counts.free} clear</span>
                </span>
                <span className="flex items-center gap-1.5 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#f97316' }} />
                  <span className="text-white/50">{counts.degraded} moderate</span>
                </span>
                <span className="flex items-center gap-1.5 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ef4444' }} />
                  <span className="text-white/50">{counts.heavy} heavy</span>
                </span>
                <div className="w-px h-4 bg-white/10 mx-0.5" />
              </>
            )}

            {/* Status */}
            {loading ? (
              <span className="flex items-center gap-1.5 text-[10px] text-white/35">
                <RefreshCw size={9} className="animate-spin" /> Loading…
              </span>
            ) : (
              <span className="text-[10px] text-white/35">
                {corridors.length} corridors
                {alertCount > 0 && (
                  <span className="ml-2 font-semibold" style={{ color: '#f87171' }}>
                    {alertCount} alert{alertCount > 1 ? 's' : ''}
                  </span>
                )}
              </span>
            )}

            <span className="text-[10px] text-white/20 ml-1">{CITIES.length} cities mapped</span>

            <div className="flex-1" />

            {lastRun && (
              <span className="text-[10px] text-white/25 hidden md:block">
                {new Date(lastRun).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}

            {/* Corridors toggle */}
            <button
              onClick={() => { setShowList(v => !v); setSelected(null) }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[10px] font-bold transition-all`}
              style={showList
                ? { background: 'rgba(170,204,0,0.12)', color: '#AACC00', border: '1px solid rgba(170,204,0,0.25)' }
                : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }
              }
            >
              <Route size={11} />
              Corridors
            </button>

            {/* Refresh */}
            <button
              onClick={triggerIngest}
              disabled={ingesting}
              className="p-1.5 rounded-[8px] transition-colors disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#A1A1AA' }}
              title="Refresh traffic data"
            >
              <RefreshCw size={12} className={ingesting ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Corridor list panel */}
        {showList && !loading && (
          <CorridorListPanel
            corridors={corridors}
            snapshots={snapshots}
            onSelect={handleSelectCorridor}
            lastRun={lastRun}
          />
        )}

        {/* Corridor detail panel */}
        {selected && (
          <CorridorPanel
            corridor={selected}
            onClose={() => { setSelected(null); setShowList(true) }}
          />
        )}

        {/* ── Congestion legend (bottom left) ─────────────────────────────────── */}
        <div
          className="absolute z-10 flex items-center gap-2.5 px-3 py-2 rounded-[8px]"
          style={{
            bottom: 14, left: 14,
            background:     'rgba(9,10,12,0.82)',
            border:         '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <span className="text-[8px] font-bold text-white/20 uppercase tracking-wider">Congestion</span>
          {Object.entries(CONG_COLOR).filter(([k]) => k !== 'unknown').map(([level, color]) => (
            <div key={level} className="flex items-center gap-1">
              <div className="w-3 h-0.5 rounded-full" style={{ background: color }} />
              <span className="text-[8px] text-white/35 capitalize">{level}</span>
            </div>
          ))}
        </div>

        {/* ── City dot legend (bottom centre) ─────────────────────────────────── */}
        <div
          className="absolute z-10 flex items-center gap-1.5 px-3 py-2 rounded-[8px]"
          style={{
            bottom: 14, left: '50%', transform: 'translateX(-50%)',
            background:     'rgba(9,10,12,0.82)',
            border:         '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#AACC00', boxShadow: '0 0 4px #AACC00' }} />
          <span className="text-[8px] text-white/35">{CITIES.length} cities · Africa · Middle East · Caribbean · Americas</span>
        </div>

      </div>
    </Layout>
  )
}
