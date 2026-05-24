/**
 * src/pages/MovementIntel.jsx
 *
 * Operational Movement Intelligence — full-screen dark map with:
 * - Lime-green city dots (330+ cities, global)
 * - Traffic corridor lines coloured by congestion
 * - Layer panel: MOVEMENT · INTELLIGENCE · INFRASTRUCTURE · WEATHER
 * - Route Planner floating panel
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  Navigation, MapPin, Route, ChevronDown,
  RefreshCw, X, AlertTriangle, Clock, Search,
  LocateFixed, ArrowRight, TrendingUp, Info,
  Heart, Shield, Flame, Layers,
  Building2, Cloud, CloudRain, Wind, Thermometer, Plane,
} from 'lucide-react'
import Layout from '../components/Layout'
import LocationAutocomplete from '../components/LocationAutocomplete'
import { MAP_STYLES } from '../lib/mapConfig'
import { supabase } from '../lib/supabase'
import { CITIES, CITIES_FC } from '../lib/mappedCities'

// ── Congestion palette ────────────────────────────────────────────────────────
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

// ── Facility colours ──────────────────────────────────────────────────────────
const FAC_COLOR  = { hospital: '#f87171', police: '#60a5fa', fire: '#fb923c' }
const FAC_LABEL  = { hospital: 'Hospital', police: 'Police Station', fire: 'Fire Station' }

// ── Incident severity colours ─────────────────────────────────────────────────
const SEV_COLOR  = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' }

// ── OpenWeatherMap key (add VITE_OPENWEATHERMAP_KEY to .env.local + Vercel) ───
const OWM_KEY = import.meta.env.VITE_OPENWEATHERMAP_KEY || ''

// ── Layer groups config (drives the LayerPanel UI) ───────────────────────────
const LAYER_GROUPS = [
  {
    id: 'movement', label: 'MOVEMENT', Icon: Route,
    layers: [
      { id: 'corridors',  label: 'Traffic Corridors', Icon: Route,       color: '#AACC00' },
      { id: 'cities',     label: 'City Network',      Icon: MapPin,       color: '#AACC00' },
      { id: 'airfields',  label: 'Airfields & Strips', Icon: Plane,       color: '#60a5fa' },
    ],
  },
  {
    id: 'intelligence', label: 'INTELLIGENCE', Icon: AlertTriangle,
    layers: [
      { id: 'incidents',  label: 'Active Incidents',  Icon: AlertTriangle, color: '#ef4444' },
    ],
  },
  {
    id: 'infrastructure', label: 'INFRASTRUCTURE', Icon: Building2,
    layers: [
      { id: 'hospitals',  label: 'Hospitals',          Icon: Heart,   color: '#f87171' },
      { id: 'police',     label: 'Police Stations',    Icon: Shield,  color: '#60a5fa' },
      { id: 'fire',       label: 'Fire Stations',      Icon: Flame,   color: '#fb923c' },
    ],
  },
  {
    id: 'weather', label: 'WEATHER', Icon: Cloud,
    layers: [
      { id: 'weatherPrecip', label: 'Precipitation',  Icon: CloudRain,   color: '#38bdf8', owm: true },
      { id: 'weatherWind',   label: 'Wind Speed',     Icon: Wind,        color: '#a78bfa', owm: true },
      { id: 'weatherTemp',   label: 'Temperature',    Icon: Thermometer, color: '#fb923c', owm: true },
      { id: 'weatherCloud',  label: 'Cloud Cover',    Icon: Cloud,       color: '#94a3b8', owm: true },
    ],
  },
]

function fmtMins(secs) {
  if (!secs) return null
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
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

// ── Toggle pill ───────────────────────────────────────────────────────────────
function TogglePill({ active }) {
  return (
    <div
      className="w-7 h-3.5 rounded-full transition-colors shrink-0 relative"
      style={{ background: active ? '#AACC00' : 'rgba(255,255,255,0.12)' }}
    >
      <div
        className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all duration-150"
        style={{ left: active ? '13px' : '2px' }}
      />
    </div>
  )
}

// ── Layer Panel ───────────────────────────────────────────────────────────────
function LayerPanel({ activeLayers, onToggle, onGroupAll, onClose }) {
  const allIds     = LAYER_GROUPS.flatMap(g => g.layers.map(l => l.id))
  const allActive  = allIds.every(id => activeLayers[id])

  return (
    <div className="absolute z-20" style={{ top: 72, right: 14, width: 268 }}>
      <div
        className="rounded-[14px] overflow-hidden"
        style={{
          background:    'rgba(9,10,12,0.97)',
          border:        '1px solid rgba(255,255,255,0.1)',
          backdropFilter:'blur(20px)',
          boxShadow:     '0 12px 48px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2">
            <Layers size={12} className="text-[#AACC00]" />
            <span className="text-[11px] font-bold text-white tracking-widest uppercase">Map Layers</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onGroupAll(allIds, !allActive)}
              className="text-[9px] font-bold uppercase tracking-wider transition-colors"
              style={{ color: allActive ? '#AACC00' : 'rgba(255,255,255,0.35)' }}
            >
              {allActive ? 'Deselect All' : 'Select All'}
            </button>
            <button onClick={onClose} className="text-white/35 hover:text-white/70 transition-colors">
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Groups */}
        <div
          className="p-3 space-y-5 overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 180px)', scrollbarWidth: 'none' }}
        >
          {LAYER_GROUPS.map(group => {
            const groupIds  = group.layers.map(l => l.id)
            const groupAll  = groupIds.every(id => activeLayers[id])
            const noOWM     = group.id === 'weather' && !OWM_KEY

            return (
              <div key={group.id}>
                {/* Group header */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <group.Icon size={9} className="text-white/25" />
                    <span className="text-[8px] font-bold text-white/25 uppercase tracking-wider">
                      {group.label}
                    </span>
                    {noOWM && (
                      <span className="text-[7px] text-orange-400/60 uppercase tracking-wide ml-1">
                        key required
                      </span>
                    )}
                  </div>
                  {!noOWM && (
                    <button
                      onClick={() => onGroupAll(groupIds, !groupAll)}
                      className="text-[8px] font-semibold uppercase tracking-wider transition-colors"
                      style={{ color: groupAll ? '#AACC00' : 'rgba(255,255,255,0.25)' }}
                    >
                      {groupAll ? 'None' : 'All'}
                    </button>
                  )}
                </div>

                {/* Layer rows */}
                <div className="space-y-0.5">
                  {group.layers.map(layer => {
                    const disabled = layer.owm && !OWM_KEY
                    const active   = activeLayers[layer.id]
                    return (
                      <button
                        key={layer.id}
                        onClick={() => !disabled && onToggle(layer.id)}
                        disabled={disabled}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {/* Dot indicator */}
                        <div
                          className="w-2 h-2 rounded-full shrink-0 transition-all"
                          style={{
                            background:  active ? layer.color : 'transparent',
                            border:      `1.5px solid ${active ? layer.color : 'rgba(255,255,255,0.2)'}`,
                            boxShadow:   active ? `0 0 6px ${layer.color}60` : 'none',
                          }}
                        />
                        {/* Icon */}
                        <layer.Icon
                          size={10}
                          style={{ color: active ? layer.color : 'rgba(255,255,255,0.35)' }}
                          className="shrink-0"
                        />
                        {/* Label */}
                        <span
                          className="text-[11px] text-left flex-1"
                          style={{ color: active ? '#EAEEF5' : 'rgba(255,255,255,0.40)' }}
                        >
                          {layer.label}
                        </span>
                        {/* Toggle pill */}
                        <TogglePill active={active} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer attribution */}
        <div className="px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="text-[8px] text-white/15">
            Facilities: OpenStreetMap · Weather: OpenWeatherMap
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MovementIntel() {
  const containerRef  = useRef(null)
  const mapRef        = useRef(null)
  const markersRef    = useRef({ origin: null, dest: null })
  const facLoadedRef  = useRef({ hospital: false, police: false, fire: false })

  const [mapReady,         setMapReady]         = useState(false)
  const [corridors,        setCorridors]        = useState([])
  const [snapshots,        setSnapshots]        = useState([])
  const [loading,          setLoading]          = useState(true)
  const [aoList,           setAoList]           = useState(['All'])
  const [activeAO,         setActiveAO]         = useState('All')
  const [aoOpen,           setAoOpen]           = useState(false)
  const [incidents,        setIncidents]        = useState([])
  const [geoStatus,        setGeoStatus]        = useState('idle')
  const userLocationRef = useRef(null)

  const [activeLayers, setActiveLayers] = useState({
    corridors:     true,
    cities:        true,
    airfields:     false,
    incidents:     false,
    hospitals:     false,
    police:        false,
    fire:          false,
    weatherPrecip: false,
    weatherWind:   false,
    weatherTemp:   false,
    weatherCloud:  false,
  })
  const [layerPanelOpen, setLayerPanelOpen] = useState(false)

  const [routePlannerOpen, setRoutePlannerOpen] = useState(false)
  const [routeOrigin,      setRouteOrigin]      = useState('')
  const [routeDest,        setRouteDest]        = useState('')
  const [routeResult,      setRouteResult]      = useState(null)
  const [routeLoading,     setRouteLoading]     = useState(false)
  const [routeError,       setRouteError]       = useState(null)

  const toggleLayer   = useCallback(id => setActiveLayers(p => ({ ...p, [id]: !p[id] })), [])
  const setGroupAll   = useCallback((ids, val) =>
    setActiveLayers(p => { const n = { ...p }; ids.forEach(id => { n[id] = val }); return n })
  , [])

  // ── Init map ────────────────────────────────────────────────────────────────
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
        max-width: 240px;
      }
      .maplibregl-popup-close-button { color: #6E7480; font-size: 16px; }
      .maplibregl-popup-tip { display: none !important; }
      .maplibregl-ctrl-bottom-right { bottom: 28px !important; }
    `
    document.head.appendChild(style)

    map.on('load', () => {
      const empty = { type: 'FeatureCollection', features: [] }

      // ── 1. Weather raster sources (bottom of stack) ────────────────────────
      if (OWM_KEY) {
        const WX = [
          { id: 'precip', tile: 'precipitation_new' },
          { id: 'wind',   tile: 'wind_new' },
          { id: 'temp',   tile: 'temp_new' },
          { id: 'cloud',  tile: 'clouds_new' },
        ]
        for (const { id, tile } of WX) {
          map.addSource(`wx-${id}`, {
            type:        'raster',
            tiles:       [`https://tile.openweathermap.org/map/${tile}/{z}/{x}/{y}.png?appid=${OWM_KEY}`],
            tileSize:    256,
            attribution: '© OpenWeatherMap',
          })
          map.addLayer({
            id:     `wx-${id}-layer`,
            type:   'raster',
            source: `wx-${id}`,
            paint:  { 'raster-opacity': 0.60 },
            layout: { visibility: 'none' },
          })
        }
      }

      // ── 2. Facilities sources ──────────────────────────────────────────────
      for (const t of ['hospital', 'police', 'fire']) {
        map.addSource(`fac-${t}`, { type: 'geojson', data: empty })
        map.addLayer({
          id:     `fac-${t}-circle`,
          type:   'circle',
          source: `fac-${t}`,
          paint: {
            'circle-radius':       ['interpolate', ['linear'], ['zoom'], 4, 4, 9, 7, 12, 10],
            'circle-color':         FAC_COLOR[t],
            'circle-opacity':       0.85,
            'circle-stroke-width':  1.5,
            'circle-stroke-color':  '#11131A',
          },
          layout: { visibility: 'none' },
        })
      }

      // ── 3. Airfields source ────────────────────────────────────────────────
      map.addSource('airfields', { type: 'geojson', data: empty })

      // Halo for large/medium airports
      map.addLayer({
        id: 'airfields-halo', type: 'circle', source: 'airfields',
        filter: ['in', ['get', 'type'], ['literal', ['large_airport', 'medium_airport']]],
        paint: {
          'circle-radius':  ['interpolate', ['linear'], ['zoom'], 4, 7, 10, 14],
          'circle-color':   '#60a5fa',
          'circle-opacity': 0.10,
          'circle-blur':    1,
        },
        layout: { visibility: 'none' },
      })

      // Main airfield dot — colour by type
      map.addLayer({
        id: 'airfields-dot', type: 'circle', source: 'airfields',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, ['match', ['get', 'type'], 'large_airport', 5, 'medium_airport', 3, 2],
            8, ['match', ['get', 'type'], 'large_airport', 9, 'medium_airport', 6, 4],
          ],
          'circle-color': [
            'match', ['get', 'type'],
            'large_airport',  '#3b82f6',
            'medium_airport', '#60a5fa',
            'small_airport',  '#93c5fd',
            'heliport',       '#a78bfa',
            'seaplane_base',  '#06b6d4',
            '#93c5fd',
          ],
          'circle-opacity':      0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#11131A',
        },
        layout: { visibility: 'none' },
      })

      // ICAO label — visible at zoom 6+
      map.addLayer({
        id: 'airfields-label', type: 'symbol', source: 'airfields',
        minzoom: 6,
        filter: ['in', ['get', 'type'], ['literal', ['large_airport', 'medium_airport']]],
        layout: {
          'text-field':    ['coalesce', ['get', 'ident'], ['get', 'name']],
          'text-font':     ['Open Sans Regular'],
          'text-size':     9,
          'text-offset':   [0, 1.4],
          'text-anchor':   'top',
          'text-optional': true,
        },
        paint: {
          'text-color':      'rgba(96,165,250,0.85)',
          'text-halo-color': 'rgba(0,0,0,0.6)',
          'text-halo-width': 1,
        },
      })

      // Click popup
      map.on('click', 'airfields-dot', e => {
        const p = e.features?.[0]?.properties
        if (!p) return
        const TYPE_LABEL = {
          large_airport:  'International Airport',
          medium_airport: 'Regional Airport',
          small_airport:  'Airstrip / Bush Strip',
          heliport:       'Heliport',
          seaplane_base:  'Seaplane Base',
        }
        const TYPE_COLOR = {
          large_airport: '#3b82f6', medium_airport: '#60a5fa',
          small_airport: '#93c5fd', heliport: '#a78bfa', seaplane_base: '#06b6d4',
        }
        const col   = TYPE_COLOR[p.type] || '#60a5fa'
        const label = TYPE_LABEL[p.type]  || p.type
        new maplibregl.Popup({ closeButton: true, offset: 10 })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="line-height:1.6">
              <div style="font-weight:700;font-size:13px;color:#EAEEF5">${p.name}</div>
              ${p.ident ? `<div style="font-size:10px;font-weight:700;color:${col};margin-bottom:4px">${p.ident}${p.iata_code ? ` · ${p.iata_code}` : ''}</div>` : ''}
              <span style="background:${col}22;color:${col};border:1px solid ${col}44;padding:2px 8px;border-radius:999px;font-size:9px;font-weight:700">${label.toUpperCase()}</span>
              <div style="margin-top:8px;font-size:10px;color:#6E7480">
                ${p.municipality ? `<div>${p.municipality}${p.country ? `, ${p.country}` : ''}</div>` : ''}
                ${p.elevation_ft ? `<div>Elevation: ${p.elevation_ft.toLocaleString()} ft</div>` : ''}
              </div>
            </div>
          `)
          .addTo(map)
      })
      map.on('mouseenter', 'airfields-dot', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'airfields-dot', () => { map.getCanvas().style.cursor = '' })

      // ── 4. Incidents sources ───────────────────────────────────────────────
      map.addSource('incidents', { type: 'geojson', data: empty })
      map.addLayer({
        id: 'incidents-halo', type: 'circle', source: 'incidents',
        paint: {
          'circle-radius':  ['interpolate', ['linear'], ['zoom'], 3, 10, 8, 18],
          'circle-color':   ['get', 'color'],
          'circle-opacity': 0.12,
          'circle-blur':    1,
        },
        layout: { visibility: 'none' },
      })
      map.addLayer({
        id: 'incidents-dot', type: 'circle', source: 'incidents',
        paint: {
          'circle-radius':       ['interpolate', ['linear'], ['zoom'], 3, 4, 8, 7],
          'circle-color':        ['get', 'color'],
          'circle-opacity':       0.9,
          'circle-stroke-width':  1.5,
          'circle-stroke-color':  '#11131A',
        },
        layout: { visibility: 'none' },
      })

      // ── 4. City dots ───────────────────────────────────────────────────────
      map.addSource('africa-cities', { type: 'geojson', data: CITIES_FC })
      map.addLayer({
        id: 'city-halo', type: 'circle', source: 'africa-cities',
        paint: {
          'circle-radius':  ['interpolate', ['linear'], ['zoom'], 2, 5, 5, 9, 8, 14],
          'circle-color':    '#AACC00',
          'circle-opacity':  0.08,
          'circle-blur':     1,
        },
      })
      map.addLayer({
        id: 'city-dot', type: 'circle', source: 'africa-cities',
        paint: {
          'circle-radius':       ['interpolate', ['linear'], ['zoom'], 2, 2, 5, 3, 8, 4.5],
          'circle-color':         '#AACC00',
          'circle-opacity':       ['interpolate', ['linear'], ['zoom'], 2, 0.5, 4, 0.8, 7, 0.95],
          'circle-stroke-width':  ['interpolate', ['linear'], ['zoom'], 2, 0, 5, 1],
          'circle-stroke-color':  'rgba(170,204,0,0.4)',
        },
      })
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
          'text-color':       'rgba(170,204,0,0.75)',
          'text-halo-color':  'rgba(0,0,0,0.6)',
          'text-halo-width':  1,
        },
      })

      // ── 5. Corridor + route sources & layers ───────────────────────────────
      map.addSource('corridors',      { type: 'geojson', data: empty })
      map.addSource('route-alt',      { type: 'geojson', data: empty })
      map.addSource('route-primary',  { type: 'geojson', data: empty })
      map.addSource('route-segments', { type: 'geojson', data: empty })

      map.addLayer({
        id: 'corridors-glow', type: 'line', source: 'corridors',
        paint: { 'line-color': ['get', 'color'], 'line-width': 10, 'line-opacity': 0.15, 'line-blur': 5 },
      })
      map.addLayer({
        id: 'corridors-line', type: 'line', source: 'corridors',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2, 8, 4, 12, 6],
          'line-opacity': 0.9,
        },
      })
      map.addLayer({
        id: 'route-alt-line', type: 'line', source: 'route-alt',
        paint: { 'line-color': '#64748b', 'line-width': 2, 'line-dasharray': [5, 4], 'line-opacity': 0.6 },
      })
      map.addLayer({
        id: 'route-primary-glow', type: 'line', source: 'route-primary',
        paint: { 'line-color': '#3b82f6', 'line-width': 14, 'line-opacity': 0.18, 'line-blur': 8 },
      })
      map.addLayer({
        id: 'route-primary-line', type: 'line', source: 'route-primary',
        paint: {
          'line-color':   '#3b82f6',
          'line-width':   ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 5, 12, 7],
          'line-opacity': 0.95,
        },
      })
      map.addLayer({
        id: 'route-segments-line', type: 'line', source: 'route-segments',
        paint: {
          'line-color':   ['get', 'color'],
          'line-width':   ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 5, 12, 7],
          'line-opacity': 0.97,
        },
      })

      // ── Popups ─────────────────────────────────────────────────────────────
      map.on('click', 'corridors-line', e => {
        const p = e.features?.[0]?.properties
        if (!p) return
        new maplibregl.Popup({ closeButton: true, offset: 10 })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="line-height:1.5">
              <div style="font-weight:700;font-size:13px">${p.name}</div>
              <div style="font-size:11px;color:#6E7480;margin-bottom:6px">${p.country || ''}</div>
              <span style="background:${p.color}22;color:${p.color};border:1px solid ${p.color}44;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700">${(p.level || 'UNKNOWN').toUpperCase()}</span>
              ${p.travelMins ? `<div style="margin-top:6px;font-size:11px">Travel: ~<b>${p.travelMins}m</b></div>` : ''}
              ${p.delayMins > 0 ? `<div style="font-size:11px;color:#f87171">Delay: +${p.delayMins}m</div>` : ''}
            </div>
          `)
          .addTo(map)
      })

      map.on('click', 'city-dot', e => {
        const name   = e.features?.[0]?.properties?.name
        if (!name) return
        const coords = e.features[0].geometry.coordinates
        new maplibregl.Popup({ closeButton: false, offset: 8 })
          .setLngLat(coords)
          .setHTML(`<div style="font-size:12px;font-weight:600;color:#AACC00">${name}</div>`)
          .addTo(map)
      })

      map.on('click', 'incidents-dot', e => {
        const p = e.features?.[0]?.properties
        if (!p) return
        const col = p.color || '#f97316'
        new maplibregl.Popup({ closeButton: true, offset: 10 })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="line-height:1.5">
              <div style="font-weight:700;font-size:12px;margin-bottom:4px">${p.name || 'Incident'}</div>
              <div style="font-size:10px;color:#6E7480">${p.city || ''}${p.country ? `, ${p.country}` : ''}</div>
              ${p.event_type ? `<div style="font-size:10px;color:#9ca3af;text-transform:capitalize;margin-top:3px">${p.event_type}</div>` : ''}
              <span style="background:${col}22;color:${col};border:1px solid ${col}44;padding:2px 8px;border-radius:999px;font-size:9px;font-weight:700;display:inline-block;margin-top:6px">${(p.severity || 'UNKNOWN').toUpperCase()}</span>
            </div>
          `)
          .addTo(map)
      })

      for (const t of ['hospital', 'police', 'fire']) {
        map.on('click', `fac-${t}-circle`, e => {
          const p = e.features?.[0]?.properties
          if (!p) return
          new maplibregl.Popup({ closeButton: false, offset: 8 })
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="line-height:1.5">
                <div style="font-weight:700;font-size:11px;color:${FAC_COLOR[t]}">${FAC_LABEL[t]}</div>
                <div style="font-size:12px;color:#EAEEF5;margin-top:2px">${p.name || 'Unknown'}</div>
                ${p.city ? `<div style="font-size:10px;color:#6E7480">${p.city}${p.country ? `, ${p.country}` : ''}</div>` : ''}
              </div>
            `)
            .addTo(map)
        })
        map.on('mouseenter', `fac-${t}-circle`, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', `fac-${t}-circle`, () => { map.getCanvas().style.cursor = '' })
      }

      map.on('mouseenter', 'corridors-line', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'corridors-line', () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'city-dot',       () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'city-dot',       () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'incidents-dot',  () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'incidents-dot',  () => { map.getCanvas().style.cursor = '' })

      setMapReady(true)
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      document.head.removeChild(style)
    }
  }, [])

  // ── Load corridors ──────────────────────────────────────────────────────────
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

  // ── Corridor GeoJSON ────────────────────────────────────────────────────────
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
            coordinates: [[c.origin_lon, c.origin_lat], [c.dest_lon, c.dest_lat]],
          },
          properties: { id: c.id, name: c.name, country: c.country, level, color, travelMins, delayMins },
        }
      })

    map.getSource('corridors').setData({ type: 'FeatureCollection', features })
  }, [mapReady, corridors, snapshots, activeAO])

  // ── Unified layer visibility ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const set = (id, vis) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis ? 'visible' : 'none') }

    set('corridors-line',    activeLayers.corridors)
    set('corridors-glow',    activeLayers.corridors)
    set('city-dot',          activeLayers.cities)
    set('city-halo',         activeLayers.cities)
    set('city-label',        activeLayers.cities)
    set('airfields-halo',    activeLayers.airfields)
    set('airfields-dot',     activeLayers.airfields)
    set('airfields-label',   activeLayers.airfields)
    set('incidents-dot',     activeLayers.incidents)
    set('incidents-halo',    activeLayers.incidents)
    set('fac-hospital-circle', activeLayers.hospitals)
    set('fac-police-circle',   activeLayers.police)
    set('fac-fire-circle',     activeLayers.fire)
    if (OWM_KEY) {
      set('wx-precip-layer', activeLayers.weatherPrecip)
      set('wx-wind-layer',   activeLayers.weatherWind)
      set('wx-temp-layer',   activeLayers.weatherTemp)
      set('wx-cloud-layer',  activeLayers.weatherCloud)
    }
  }, [mapReady, activeLayers])

  // ── Lazy-load facilities data when layer first enabled ───────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const FACS = [
      { key: 'hospitals', type: 'hospital' },
      { key: 'police',    type: 'police'   },
      { key: 'fire',      type: 'fire'     },
    ]

    for (const { key, type } of FACS) {
      if (activeLayers[key] && !facLoadedRef.current[type]) {
        facLoadedRef.current[type] = true
        fetch(`/api/facilities?type=${type}`)
          .then(r => r.json())
          .then(fc => {
            if (map.getSource(`fac-${type}`)) map.getSource(`fac-${type}`).setData(fc)
          })
          .catch(err => console.warn(`[facilities/${type}]`, err.message))
      }
    }
  }, [mapReady, activeLayers.hospitals, activeLayers.police, activeLayers.fire])

  // ── Lazy-load airfields on first enable ─────────────────────────────────────
  const airfieldsLoadedRef = useRef(false)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !activeLayers.airfields) return
    if (airfieldsLoadedRef.current) return
    airfieldsLoadedRef.current = true

    fetch('/api/airfields')
      .then(r => r.json())
      .then(fc => {
        if (map.getSource('airfields')) map.getSource('airfields').setData(fc)
      })
      .catch(err => console.warn('[airfields]', err.message))
  }, [mapReady, activeLayers.airfields])

  // ── Load incidents when layer enabled ───────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !activeLayers.incidents) return
    const map = mapRef.current
    if (!map) return

    async function loadIncidents() {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('live_intelligence')
        .select('id,title,city,country,city_lat,city_lon,event_type,severity,published_at')
        .gte('published_at', cutoff)
        .not('city_lat', 'is', null)
        .not('city_lon', 'is', null)
        .order('published_at', { ascending: false })
        .limit(500)

      if (!data?.length) return
      setIncidents(data)

      const fc = {
        type: 'FeatureCollection',
        features: data.map(inc => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [inc.city_lon, inc.city_lat] },
          properties: {
            name:       inc.title,
            city:       inc.city,
            country:    inc.country,
            event_type: inc.event_type,
            severity:   inc.severity,
            color:      SEV_COLOR[inc.severity] || '#f97316',
          },
        })),
      }

      if (map.getSource('incidents')) map.getSource('incidents').setData(fc)
    }

    loadIncidents().catch(err => console.warn('[incidents]', err.message))
  }, [mapReady, activeLayers.incidents])

  // ── Geolocation ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return
    setGeoStatus('detecting')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lon } = pos.coords
        userLocationRef.current = { lat, lon }
        setGeoStatus('detected')
        setRouteOrigin(`${lat.toFixed(5)}, ${lon.toFixed(5)}`)
      },
      () => setGeoStatus('denied'),
      { timeout: 10000, maximumAge: 120000 }
    )
  }, [])

  // ── Plan route ──────────────────────────────────────────────────────────────
  const planRoute = useCallback(async () => {
    if (!routeOrigin.trim() || !routeDest.trim()) return
    setRouteLoading(true)
    setRouteError(null)
    setRouteResult(null)

    markersRef.current.origin?.remove()
    markersRef.current.dest?.remove()
    if (mapRef.current?.getSource('route-primary')) {
      const emptyFC = { type: 'FeatureCollection', features: [] }
      mapRef.current.getSource('route-primary').setData(emptyFC)
      mapRef.current.getSource('route-segments').setData(emptyFC)
      mapRef.current.getSource('route-alt').setData(emptyFC)
    }

    try {
      const coordRe = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/
      const params  = new URLSearchParams()

      if (coordRe.test(routeOrigin.trim())) {
        const [lat, lon] = routeOrigin.trim().split(',').map(Number)
        params.set('originLat', lat); params.set('originLon', lon)
      } else {
        params.set('origin', routeOrigin.trim())
      }
      if (coordRe.test(routeDest.trim())) {
        const [lat, lon] = routeDest.trim().split(',').map(Number)
        params.set('destLat', lat); params.set('destLon', lon)
      } else {
        params.set('destination', routeDest.trim())
      }

      const res  = await fetch(`/api/route-lookup?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Route lookup failed')
      setRouteResult(data)

      const map = mapRef.current
      if (map) {
        if (data.here?.geometry) {
          if (data.routeSegments) {
            map.getSource('route-segments').setData(data.routeSegments)
            map.setPaintProperty('route-primary-line', 'line-opacity', 0.15)
          } else {
            map.setPaintProperty('route-primary-line', 'line-opacity', 0.95)
          }
          map.getSource('route-primary').setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: data.here.geometry, properties: {} }],
          })
        }

        const altFeatures = (data.here?.alternatives || [])
          .filter(a => a.geometry)
          .map(a => ({ type: 'Feature', geometry: a.geometry, properties: {} }))
        map.getSource('route-alt').setData({ type: 'FeatureCollection', features: altFeatures })

        const originEl = document.createElement('div')
        originEl.style.cssText = `width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid white;box-shadow:0 0 0 3px rgba(34,197,94,0.3);`
        markersRef.current.origin = new maplibregl.Marker({ element: originEl, anchor: 'center' })
          .setLngLat([data.origin.lon, data.origin.lat]).addTo(map)

        const destEl = document.createElement('div')
        destEl.style.cssText = `width:12px;height:12px;border-radius:50%;background:#ef4444;border:2px solid white;box-shadow:0 0 0 3px rgba(239,68,68,0.3);`
        markersRef.current.dest = new maplibregl.Marker({ element: destEl, anchor: 'center' })
          .setLngLat([data.destination.lon, data.destination.lat]).addTo(map)

        const coords = data.here?.geometry?.coordinates
        if (coords?.length >= 2) {
          const lats = coords.map(c => c[1])
          const lons = coords.map(c => c[0])
          map.fitBounds(
            [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
            { padding: { top: 80, bottom: 80, left: 80, right: 80 }, duration: 1200 }
          )
        }
      }
    } catch (err) {
      setRouteError(err.message)
    } finally {
      setRouteLoading(false)
    }
  }, [routeOrigin, routeDest])

  const alertCount    = corridors.filter(c => {
    const snap = snapshots.find(s => s.corridor_id === c.id)
    return ['heavy','standstill'].includes(snap?.congestion_level)
  }).length
  const activeLayerCount = Object.values(activeLayers).filter(Boolean).length

  return (
    <Layout>
      <div className="relative -mx-4 lg:-mx-7" style={{ height: 'calc(100vh - 56px)' }}>

        {/* ── Map ───────────────────────────────────────────────────────────── */}
        <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 0 }} />

        {/* ── Top bar ───────────────────────────────────────────────────────── */}
        <div className="absolute z-20" style={{ top: 14, left: 14, right: 14, pointerEvents: 'none' }}>
          <div
            className="flex items-center gap-2 px-4 h-11 rounded-[12px]"
            style={{
              background:    'rgba(9,10,12,0.90)',
              border:        '1px solid rgba(255,255,255,0.09)',
              backdropFilter:'blur(16px)',
              boxShadow:     '0 4px 32px rgba(0,0,0,0.5)',
              pointerEvents: 'auto',
            }}
          >
            {/* Brand */}
            <Layers size={13} className="text-[#AACC00] shrink-0" />
            <span className="text-[11px] font-bold text-white tracking-widest uppercase">Movement Intel</span>

            <div className="w-px h-4 bg-white/10 mx-0.5" />

            {/* AO dropdown */}
            <div className="relative">
              <button
                onClick={() => setAoOpen(o => !o)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-white/70 hover:text-white px-2 py-1 rounded-lg hover:bg-white/8 transition-colors"
              >
                <MapPin size={11} className="text-[#AACC00]" />
                {activeAO}
                <ChevronDown size={10} className="text-white/40" />
              </button>
              {aoOpen && (
                <div
                  className="absolute top-full left-0 mt-1.5 rounded-[10px] overflow-hidden shadow-2xl"
                  style={{ background: '#0C0E12', border: '1px solid rgba(255,255,255,0.1)', minWidth: 170, maxHeight: 240, overflowY: 'auto', zIndex: 100 }}
                >
                  {aoList.map(ao => (
                    <button
                      key={ao}
                      onClick={() => { setActiveAO(ao); setAoOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-[11px] font-medium transition-colors hover:bg-white/8 ${activeAO === ao ? 'text-[#AACC00]' : 'text-white/65'}`}
                    >
                      {ao}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="w-px h-4 bg-white/10 mx-0.5" />

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
            {activeLayers.incidents && incidents.length > 0 && (
              <span className="text-[10px] font-semibold" style={{ color: '#f97316' }}>
                · {incidents.length} incidents
              </span>
            )}

            <span className="text-[10px] text-white/20 ml-1">{CITIES.length} cities · Africa · Middle East · Caribbean · Americas</span>

            <div className="flex-1" />

            {/* Active route indicator */}
            {routeResult && !routePlannerOpen && (
              <button
                onClick={() => setRoutePlannerOpen(true)}
                className="flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-white/8 transition-colors"
              >
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: routeResult.exposure?.color || '#AACC00', boxShadow: `0 0 6px ${routeResult.exposure?.color || '#AACC00'}` }}
                />
                <span className="text-[10px] text-white/55">
                  {routeResult.origin?.city || '—'} → {routeResult.destination?.city || '—'}
                </span>
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${routeResult.exposure?.color || '#AACC00'}18`, color: routeResult.exposure?.color || '#AACC00' }}>
                  {routeResult.exposure?.status || 'Active'}
                </span>
              </button>
            )}

            {/* Layers toggle */}
            <button
              onClick={() => setLayerPanelOpen(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[11px] font-semibold transition-all"
              style={layerPanelOpen
                ? { background: 'rgba(170,204,0,0.12)', color: '#AACC00', border: '1px solid rgba(170,204,0,0.25)' }
                : { color: 'rgba(255,255,255,0.55)' }
              }
            >
              <Layers size={12} />
              Layers
              {activeLayerCount > 0 && (
                <span
                  className="text-[8px] font-bold px-1 py-0.5 rounded-full min-w-[14px] text-center"
                  style={{ background: '#AACC00', color: '#0A1628' }}
                >
                  {activeLayerCount}
                </span>
              )}
            </button>

            {/* Plan Route CTA */}
            <button
              onClick={() => setRoutePlannerOpen(v => !v)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[8px] text-[11px] font-bold transition-all active:scale-95"
              style={routePlannerOpen
                ? { background: 'rgba(170,204,0,0.12)', color: '#AACC00', border: '1px solid rgba(170,204,0,0.25)' }
                : { background: '#AACC00', color: '#0A1628' }
              }
            >
              <Navigation size={12} />
              Plan Route
            </button>
          </div>
        </div>

        {/* ── Layer Panel ───────────────────────────────────────────────────── */}
        {layerPanelOpen && (
          <LayerPanel
            activeLayers={activeLayers}
            onToggle={toggleLayer}
            onGroupAll={setGroupAll}
            onClose={() => setLayerPanelOpen(false)}
          />
        )}

        {/* ── Route Planner panel ───────────────────────────────────────────── */}
        {routePlannerOpen && (
          <div
            className="absolute z-20"
            style={{ top: 72, left: 14, width: 'min(480px, calc(100vw - 28px))' }}
          >
            <div
              className="rounded-[14px] overflow-hidden"
              style={{
                background:    'rgba(9,10,12,0.97)',
                border:        '1px solid rgba(255,255,255,0.1)',
                backdropFilter:'blur(20px)',
                boxShadow:     '0 12px 48px rgba(0,0,0,0.7)',
              }}
            >
              {/* Panel header */}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div className="flex items-center gap-2">
                  <Navigation size={13} className="text-[#AACC00]" />
                  <span className="text-[11px] font-bold text-white tracking-widest uppercase">Route Planner</span>
                  {routeResult && (
                    <span
                      className="ml-1 text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wide"
                      style={{
                        background: `${routeResult.exposure?.color || '#AACC00'}15`,
                        color:      routeResult.exposure?.color || '#AACC00',
                        border:     `1px solid ${routeResult.exposure?.color || '#AACC00'}35`,
                      }}
                    >
                      {routeResult.exposure?.status || 'Active'}
                    </span>
                  )}
                </div>
                <button onClick={() => setRoutePlannerOpen(false)} className="text-white/35 hover:text-white/70 transition-colors">
                  <X size={14} />
                </button>
              </div>

              {/* Input row */}
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="block text-[9px] font-bold text-white/35 uppercase tracking-wider mb-1">
                      Origin
                      {geoStatus === 'detected' && <LocateFixed size={8} className="inline ml-1.5 text-green-400" />}
                    </label>
                    <LocationAutocomplete
                      value={routeOrigin}
                      onChange={e => setRouteOrigin(e.target.value)}
                      onSelect={item => setRouteOrigin(item.display || item.label)}
                      placeholder="City, address or lat,lon"
                      dark
                      className="w-full px-3 py-2 rounded-[8px] text-[12px] text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-[#AACC00]/40"
                      inputStyle={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </div>

                  <div className="mt-4 shrink-0">
                    <ArrowRight size={14} className="text-white/20" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <label className="block text-[9px] font-bold text-white/35 uppercase tracking-wider mb-1">
                      Destination
                    </label>
                    <LocationAutocomplete
                      value={routeDest}
                      onChange={e => setRouteDest(e.target.value)}
                      onSelect={item => setRouteDest(item.display || item.label)}
                      placeholder="City, address or lat,lon"
                      dark
                      className="w-full px-3 py-2 rounded-[8px] text-[12px] text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-[#AACC00]/40"
                      inputStyle={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </div>

                  <button
                    onClick={planRoute}
                    disabled={routeLoading || !routeOrigin.trim() || !routeDest.trim()}
                    className="mt-4 shrink-0 w-9 h-9 rounded-[8px] flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                    style={{ background: routeLoading ? '#374151' : '#AACC00' }}
                    title="Plan route"
                  >
                    {routeLoading
                      ? <RefreshCw size={14} className="animate-spin text-white/60" />
                      : <Search size={14} className="text-[#0A1628]" />
                    }
                  </button>
                </div>
              </div>

              {/* Error */}
              {routeError && (
                <div className="mx-4 mb-3 rounded-[8px] p-3 text-[11px] text-red-300 flex items-start gap-2"
                  style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)' }}>
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  {routeError}
                </div>
              )}

              {/* ── Route Result ─────────────────────────────────────────────── */}
              {routeResult && !routeError && (
                <div
                  className="overflow-y-auto"
                  style={{ maxHeight: 'calc(100vh - 260px)', scrollbarWidth: 'none', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="p-4 space-y-3">

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-white/70 truncate">
                        {routeResult.origin?.city || routeResult.origin?.label}
                      </span>
                      <ArrowRight size={10} className="shrink-0 text-white/25" />
                      <span className="text-[11px] font-semibold text-white/70 truncate">
                        {routeResult.destination?.city || routeResult.destination?.label}
                      </span>
                      {routeResult.distKm && (
                        <span className="ml-auto text-[9px] text-white/30 shrink-0">{routeResult.distKm} km</span>
                      )}
                    </div>

                    <div className="rounded-[10px] p-3"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="text-[8px] font-bold text-white/25 uppercase tracking-wider mb-2.5">Transit Time</div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-[8px] text-white/35 mb-1">Current</div>
                          <div className="text-[17px] font-bold text-white leading-none">{fmtMins(routeResult.here?.travel) || '—'}</div>
                          <div className="text-[8px] text-white/25 mt-1">live traffic</div>
                        </div>
                        <div>
                          <div className="text-[8px] text-white/35 mb-1">Yesterday</div>
                          <div className="text-[17px] font-bold text-white/55 leading-none">{fmtMins(routeResult.timeEstimates?.yesterday) || '—'}</div>
                          <div className="text-[8px] text-white/25 mt-1">same time</div>
                        </div>
                        <div>
                          <div className="text-[8px] text-white/35 mb-1">No Traffic</div>
                          <div className="text-[17px] font-bold leading-none" style={{ color: '#4ade80' }}>{fmtMins(routeResult.timeEstimates?.freeFlow ?? routeResult.here?.freeFlow) || '—'}</div>
                          <div className="text-[8px] text-white/25 mt-1">free-flow</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2.5 pt-2"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center gap-1.5 text-[9px]">
                          <TrendingUp size={9} className={routeResult.here?.delay > 0 ? 'text-red-400' : 'text-green-400'} />
                          <span className={routeResult.here?.delay > 0 ? 'text-red-400' : 'text-green-400'}>
                            {routeResult.here?.delay > 0 ? `+${Math.round(routeResult.here.delay / 60)}m delay` : 'No delay'}
                          </span>
                        </div>
                        <LevelBadge level={routeResult.consensus} small />
                      </div>
                    </div>

                    {(routeResult.exposure || routeResult.safeCorridor || routeResult.peakWindow) && (
                      <div className="rounded-[10px] p-3 space-y-2"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        {routeResult.exposure && (
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-white/30 uppercase tracking-wider font-semibold">Exposure Level</span>
                            <span className="text-[11px] font-bold" style={{ color: routeResult.exposure.color }}>{routeResult.exposure.status}</span>
                          </div>
                        )}
                        {routeResult.safeCorridor && (
                          <div className="flex items-center justify-between pt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <span className="text-[9px] text-white/30 uppercase tracking-wider font-semibold">Corridor Status</span>
                            <span className="text-[11px] font-bold" style={{ color: routeResult.safeCorridor.color }}>{routeResult.safeCorridor.label}</span>
                          </div>
                        )}
                        {routeResult.peakWindow && (
                          <div className="flex items-center justify-between pt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <span className="text-[9px] text-white/30 uppercase tracking-wider font-semibold">Peak Window</span>
                            <span className="text-[9px] text-white/50">{routeResult.peakWindow}</span>
                          </div>
                        )}
                        {routeResult.timeEstimates?.peak && (
                          <div className="flex items-center justify-between pt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <span className="text-[9px] text-white/30 uppercase tracking-wider font-semibold">Rush Hour ETA</span>
                            <span className="text-[11px] font-bold text-red-400">{fmtMins(routeResult.timeEstimates.peak)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {routeResult.operationalAlerts?.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <AlertTriangle size={10} className="text-orange-400 shrink-0" />
                          <span className="text-[9px] font-bold text-white/35 uppercase tracking-wider">Operational Alerts</span>
                          <span className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c' }}>
                            {routeResult.operationalAlerts.length}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {routeResult.operationalAlerts.map((a, i) => {
                            const sig = a.operationalClass === 'Operationally Significant'
                            const bg  = sig ? 'rgba(239,68,68,0.08)'  : 'rgba(249,115,22,0.07)'
                            const bd  = sig ? 'rgba(239,68,68,0.18)'  : 'rgba(249,115,22,0.14)'
                            const tx  = sig ? '#f87171'               : '#fb923c'
                            return (
                              <div key={i} className="rounded-[7px] px-2.5 py-2" style={{ background: bg, border: `1px solid ${bd}` }}>
                                <div className="text-[10px] font-medium leading-snug" style={{ color: tx }}>{a.raw_title || a.title}</div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {a.proximityLabel && a.proximityLabel !== 'In Country' && (
                                    <span className="text-[8px] text-white/35 font-semibold uppercase tracking-wide">{a.proximityLabel}</span>
                                  )}
                                  {a.distKm != null && <span className="text-[8px] text-white/25">{a.distKm} km</span>}
                                  {a.movement_impact && a.movement_impact !== 'none' && (
                                    <span className="text-[8px] text-white/30 capitalize">{a.movement_impact} impact</span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {routeResult.emergencyServices?.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Heart size={10} className="text-red-400 shrink-0" />
                          <span className="text-[9px] font-bold text-white/35 uppercase tracking-wider">Emergency Support</span>
                        </div>
                        <div className="space-y-0.5">
                          {routeResult.emergencyServices.slice(0, 5).map((s, i) => {
                            const Icon  = s.type === 'hospital' ? Heart : s.type === 'police' ? Shield : Flame
                            const color = s.type === 'hospital' ? '#f87171' : s.type === 'police' ? '#60a5fa' : '#fb923c'
                            const label = s.type === 'hospital' ? 'Hospital' : s.type === 'police' ? 'Police' : 'Fire'
                            return (
                              <div key={i} className="flex items-center gap-2 py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <Icon size={9} style={{ color }} className="shrink-0" />
                                <span className="text-[10px] text-white/55 truncate flex-1">{s.name || label}</span>
                                <span className="text-[8px] shrink-0" style={{ color: `${color}88` }}>{label}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {routeResult.nearestCorridor && (
                      <div className="rounded-[7px] p-2.5 flex items-start gap-2"
                        style={{ background: 'rgba(170,204,0,0.05)', border: '1px solid rgba(170,204,0,0.12)' }}>
                        <Info size={10} className="text-[#AACC00] shrink-0 mt-0.5" />
                        <div className="text-[9px] text-white/40 leading-relaxed">
                          Nearest corridor: <span className="text-white/60">{routeResult.nearestCorridor.name}</span>
                          {' '}({routeResult.nearestCorridor.proximityKm} km)
                        </div>
                      </div>
                    )}

                    {routeResult.recommendations?.best?.length > 0 && (
                      <div>
                        <div className="text-[8px] font-bold text-white/20 uppercase tracking-wider mb-1.5">Best Travel Windows</div>
                        {routeResult.recommendations.best.slice(0, 3).map((b, i) => (
                          <div key={i} className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <span className="text-[9px] text-white/40">{b.day} {b.hourLabel}</span>
                            <div className="flex items-center gap-2">
                              {b.avgTravelSecs && <span className="text-[9px] text-white/30">{Math.round(b.avgTravelSecs / 60)}m</span>}
                              <LevelBadge level={b.level} small />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3 flex-wrap">
                      {routeResult.here?.alternatives?.length > 0 && (
                        <span className="text-[9px] text-white/20 flex items-center gap-1">
                          <Route size={9} />
                          {routeResult.here.alternatives.length} alternate{routeResult.here.alternatives.length > 1 ? 's' : ''} on map
                        </span>
                      )}
                      {routeResult.google?.ok && (
                        <span className="text-[9px] text-white/20 flex items-center gap-1.5">
                          Google: {fmtMins(routeResult.google.travel)}
                          <LevelBadge level={routeResult.google.level} small />
                        </span>
                      )}
                    </div>

                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Congestion legend (bottom left) ───────────────────────────────── */}
        <div
          className="absolute z-10 flex items-center gap-2.5 px-3 py-2 rounded-[8px]"
          style={{
            bottom:        14,
            left:          14,
            background:    'rgba(9,10,12,0.82)',
            border:        '1px solid rgba(255,255,255,0.07)',
            backdropFilter:'blur(10px)',
          }}
        >
          <span className="text-[8px] font-bold text-white/20 uppercase tracking-wider">Congestion</span>
          {Object.entries(CONG_COLOR).filter(([k]) => k !== 'unknown').map(([level, color]) => (
            <div key={level} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              <span className="text-[8px] text-white/35 capitalize">{level}</span>
            </div>
          ))}
        </div>

        {/* ── City dot legend (bottom centre) ───────────────────────────────── */}
        <div
          className="absolute z-10 flex items-center gap-1.5 px-3 py-2 rounded-[8px]"
          style={{
            bottom:        14,
            left:          '50%',
            transform:     'translateX(-50%)',
            background:    'rgba(9,10,12,0.82)',
            border:        '1px solid rgba(255,255,255,0.07)',
            backdropFilter:'blur(10px)',
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#AACC00', boxShadow: '0 0 4px #AACC00' }} />
          <span className="text-[8px] text-white/35">{CITIES.length} mapped cities · click to query</span>
        </div>

      </div>
    </Layout>
  )
}
