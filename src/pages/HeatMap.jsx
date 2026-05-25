/**
 * src/pages/HeatMap.jsx
 *
 * Global Risk Map — choropleth country-fill (default) + bubble overlay.
 *
 * Data sources (layered, highest precedence first):
 *   1. AI synthesis — /api/country-risk-summary reads cached Claude assessments
 *      that incorporate: FCDO advisories, BBC/Reuters/Al Jazeera/ISS/ACLED/
 *      Crisis Group feeds, GDACS disasters, USGS earthquakes, health outbreaks,
 *      AND any documents uploaded to Cairo (proprietary intelligence).
 *   2. Static baseline — RISK_MAP from riskData.js (fallback if no AI cache yet)
 *
 * When a user views any country's risk report page the AI synthesis runs and
 * updates the cache. The country-risk-warmup cron also pre-warms all countries
 * hourly. So the map reflects the live intelligence picture within ~1 hour.
 *
 * Country polygons: Natural Earth 110m via D3 gallery CDN (~1.5 MB)
 * View modes: choropleth (default) | bubble
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useNavigate } from 'react-router-dom'
import {
  Globe, CircleDot, ChevronDown, Layers, X, MapPin, RefreshCw,
} from 'lucide-react'
import Layout from '../components/Layout'
import { MAP_STYLES } from '../lib/mapConfig'
import { RISK_MAP } from '../lib/riskData'

// RISK_MAP is the shared baseline from riskData.js.
// We alias it for internal use and merge live AI overrides on top.
const COUNTRIES = RISK_MAP

// ── Constants ─────────────────────────────────────────────────────────────────
const RISK_COLOR  = { Critical: '#ef4444', High: '#f97316', Medium: '#eab308', Low: '#22c55e' }
const RISK_RADIUS = { Critical: 18, High: 14, Medium: 11, Low: 8 }
const RISK_WEIGHT = { Critical: 1.0, High: 0.75, Medium: 0.45, Low: 0.15 }
const REGIONS     = ['All', 'Africa', 'Middle East', 'Americas', 'Asia', 'Europe', 'Oceania']

// The D3/holtzy world.geojson uses the "name" property for country names.
// These differ from our COUNTRIES keys — verified against the actual file:
const GEO_NAME_MAP = {
  'DR Congo':                      'Democratic Republic of the Congo',
  'Democratic Republic of Congo':  'Democratic Republic of the Congo',
  'United States':                 'USA',
  'United Kingdom':                'England',
  'Tanzania':                      'United Republic of Tanzania',
  'Ivory Coast':                   'Ivory Coast',
  'Eswatini':                      'Swaziland',
  'Republic of Congo':             'Republic of the Congo',
  'Guinea-Bissau':                 'Guinea Bissau',
  'Bahamas':                       'The Bahamas',
  'West Bank':                     'West Bank',
}

// Reverse map: GeoJSON name → our COUNTRIES key
const GEO_NAME_REVERSE = Object.fromEntries(
  Object.entries(GEO_NAME_MAP).map(([k, v]) => [v, k])
)

function ourKeyToGeoName(name) {
  return GEO_NAME_MAP[name] || name
}

function geoNameToOurKey(geoName) {
  return GEO_NAME_REVERSE[geoName] || geoName
}

// ── MapLibre match expressions ─────────────────────────────────────────────────
// The GeoJSON property field is "name" (lowercase) in the holtzy world.geojson
// All builders accept an explicit dataset so they work with live-merged data.

// Fill color — rated countries get risk colour, all others transparent (base shows through)
function buildFillColorExprFrom(dataset, filter = 'All') {
  const pairs = []
  Object.entries(dataset).forEach(([name, c]) => {
    if (filter !== 'All' && c.region !== filter) return
    pairs.push(ourKeyToGeoName(name), RISK_COLOR[c.risk])
  })
  if (pairs.length === 0) return 'rgba(255,255,255,0)'
  return ['match', ['get', 'name'], ...pairs, 'rgba(0,0,0,0)']
}

// Border color — rated countries get a subtle tinted border
function buildBorderColorExprFrom(dataset, filter = 'All') {
  const pairs = []
  Object.entries(dataset).forEach(([name, c]) => {
    if (filter !== 'All' && c.region !== filter) return
    pairs.push(ourKeyToGeoName(name), RISK_COLOR[c.risk])
  })
  if (pairs.length === 0) return 'rgba(255,255,255,0.06)'
  return ['match', ['get', 'name'], ...pairs, 'rgba(255,255,255,0.06)']
}

// Convenience wrappers using static COUNTRIES for initial map load
function buildFillColorExpr(filter = 'All')   { return buildFillColorExprFrom(COUNTRIES, filter) }
function buildBorderColorExpr(filter = 'All') { return buildBorderColorExprFrom(COUNTRIES, filter) }

// ── Point GeoJSON for bubble mode ─────────────────────────────────────────────
function buildPointGeoJSONFrom(dataset, filter = 'All') {
  return {
    type: 'FeatureCollection',
    features: Object.entries(dataset)
      .filter(([, c]) => filter === 'All' || c.region === filter)
      .map(([name, c]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
        properties: {
          name, risk: c.risk, region: c.region,
          riskWeight: RISK_WEIGHT[c.risk] ?? 0.1,
          color:      RISK_COLOR[c.risk]  ?? '#9ca3af',
          radius:     RISK_RADIUS[c.risk] ?? 8,
        },
      })),
  }
}

function buildPointGeoJSON(filter = 'All') { return buildPointGeoJSONFrom(COUNTRIES, filter) }

function riskCounts(dataset = COUNTRIES) {
  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 }
  Object.values(dataset).forEach(c => { if (counts[c.risk] !== undefined) counts[c.risk]++ })
  return counts
}

// ── Country list panel ────────────────────────────────────────────────────────
function CountryPanel({ filter, selected, onSelect, onClose, dataset }) {
  const filtered = Object.entries(dataset || COUNTRIES).filter(
    ([, c]) => filter === 'All' || c.region === filter
  )
  return (
    <div
      className="absolute z-20 rounded-[14px] overflow-hidden flex flex-col"
      style={{
        top: 72, left: 14, width: 240,
        maxHeight: 'calc(100vh - 120px)',
        background: 'rgba(9,10,12,0.97)',
        border: '1px solid rgba(255,255,255,0.10)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 12px 48px rgba(0,0,0,0.7)',
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2">
          <Globe size={11} style={{ color: '#AACC00' }} />
          <span className="text-[11px] font-bold text-white tracking-widest uppercase">Countries</span>
        </div>
        <button onClick={onClose} className="text-white/35 hover:text-white/70 transition-colors">
          <X size={13} />
        </button>
      </div>

      <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' }}>
        {['Critical', 'High', 'Medium', 'Low'].map(level => {
          const group = filtered.filter(([, c]) => c.risk === level)
          if (!group.length) return null
          const color = RISK_COLOR[level]
          return (
            <div key={level}>
              <div className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest"
                style={{ background: `${color}18`, color }}>
                {level} · {group.length}
              </div>
              {group.map(([name, data]) => (
                <button key={name} onClick={() => onSelect(name)}
                  className="w-full text-left flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-white/5"
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: selected === name ? `${color}12` : undefined,
                  }}>
                  <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
                  <span className="text-[11px] font-medium truncate flex-1"
                    style={{ color: selected === name ? color : 'rgba(255,255,255,0.65)' }}>
                    {name}
                  </span>
                  {data.isLive && (
                    <span style={{ fontSize: 7, fontWeight: 700, padding: '1px 4px',
                      borderRadius: 999, background: 'rgba(170,204,0,0.12)',
                      color: '#AACC00', border: '1px solid rgba(170,204,0,0.2)',
                      letterSpacing: '0.06em', flexShrink: 0 }}>AI</span>
                  )}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── World GeoJSON URL ─────────────────────────────────────────────────────────
// Self-hosted in /public — served from Vercel CDN, no CORS, no external dependency
const WORLD_GEOJSON_URL = '/world.geojson'

// ── Build effective COUNTRIES map — static baseline merged with live AI data ──
// liveRisks: { [countryNameLower]: 'Critical|High|Medium|Low' }
function mergeWithLive(liveRisks) {
  if (!liveRisks || !Object.keys(liveRisks).length) return COUNTRIES
  const merged = {}
  for (const [name, data] of Object.entries(COUNTRIES)) {
    const liveRisk = liveRisks[name.toLowerCase()]
    merged[name] = liveRisk
      ? { ...data, risk: liveRisk, isLive: true }
      : data
  }
  return merged
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HeatMap() {
  const navigate     = useNavigate()
  const navigateRef  = useRef(navigate)
  useEffect(() => { navigateRef.current = navigate }, [navigate])

  const containerRef          = useRef(null)
  const mapRef                = useRef(null)
  const activePopup           = useRef(null)
  const hoveredId             = useRef(null)
  const effectiveCountriesRef = useRef(COUNTRIES)  // kept current for map click handlers

  const [regionFilter,  setRegionFilter]  = useState('All')
  const [regionOpen,    setRegionOpen]    = useState(false)
  const [viewMode,      setViewMode]      = useState('choropleth')  // choropleth | bubble
  const [mapReady,      setMapReady]      = useState(false)
  const [selected,      setSelected]      = useState(null)
  const [showList,      setShowList]      = useState(true)
  const [liveRisks,     setLiveRisks]     = useState({})  // { countryLower: severity }
  const [liveCount,     setLiveCount]     = useState(0)
  const [dataSource,    setDataSource]    = useState('static')  // 'static' | 'live'

  // Effective dataset — static baseline overridden by live AI assessments
  const effectiveCountries = mergeWithLive(liveRisks)
  // Keep ref in sync so map click handlers always see current data
  useEffect(() => { effectiveCountriesRef.current = effectiveCountries }, [effectiveCountries])

  const counts = riskCounts(effectiveCountries)
  const filteredCount = Object.values(effectiveCountries).filter(
    c => regionFilter === 'All' || c.region === regionFilter
  ).length

  // ── Fetch live AI risk assessments ────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/country-risk-summary', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.risks && Object.keys(d.risks).length > 0) {
          setLiveRisks(d.risks)
          setLiveCount(d._count || 0)
          setDataSource('live')
        }
      })
      .catch(() => { /* fall through to static */ })
  }, [])

  // ── Map init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     MAP_STYLES.operational,
      center:    [20, 10],
      zoom:      2.2,
      minZoom:   1.5,
      maxZoom:   14,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-right')

    // Dark popup styles
    const style = document.createElement('style')
    style.textContent = `
      .maplibregl-popup-content {
        background: #0D0F15;
        color: #EAEEF5;
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 12px;
        padding: 14px 16px;
        font-family: system-ui, sans-serif;
        box-shadow: 0 12px 48px rgba(0,0,0,0.7);
        min-width: 210px;
      }
      .maplibregl-popup-close-button {
        color: rgba(255,255,255,0.25);
        font-size: 18px;
        top: 8px;
        right: 10px;
        line-height: 1;
      }
      .maplibregl-popup-close-button:hover { color: rgba(255,255,255,0.6); }
      .maplibregl-popup-tip { display: none !important; }
      .maplibregl-ctrl-bottom-right { bottom: 28px !important; }
    `
    document.head.appendChild(style)

    map.on('load', () => {
      // ── 1. World country polygons (choropleth) ──────────────────────────────
      map.addSource('world', {
        type: 'geojson',
        data: WORLD_GEOJSON_URL,
        generateId: true,   // assigns sequential .id for feature-state
      })

      // Dark translucent fill for ALL unrated countries (base layer)
      map.addLayer({
        id: 'country-base',
        type: 'fill',
        source: 'world',
        paint: {
          'fill-color':   '#0f111a',
          'fill-opacity': 0.60,
        },
      })

      // Risk-coloured fill — only rated countries get colour
      map.addLayer({
        id: 'country-fill',
        type: 'fill',
        source: 'world',
        paint: {
          'fill-color':   buildFillColorExpr('All'),
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.88,
            0.65,
          ],
        },
      })

      // Subtle country border lines
      map.addLayer({
        id: 'country-borders',
        type: 'line',
        source: 'world',
        paint: {
          'line-color': buildBorderColorExpr('All'),
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            2, 0.4,
            6, 1.0,
          ],
          'line-opacity': 0.45,
        },
      })

      // ── 2. Point source for bubble mode ────────────────────────────────────
      map.addSource('country-points', {
        type: 'geojson',
        data: buildPointGeoJSON('All'),
      })

      map.addLayer({
        id: 'risk-circles',
        type: 'circle',
        source: 'country-points',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            2, ['/', ['get', 'radius'], 2.8],
            8, ['get', 'radius'],
          ],
          'circle-color':          ['get', 'color'],
          'circle-opacity':        0.80,
          'circle-stroke-width':   1.5,
          'circle-stroke-color':   ['get', 'color'],
          'circle-stroke-opacity': 1,
        },
      })

      map.addLayer({
        id: 'risk-labels',
        type: 'symbol',
        source: 'country-points',
        minzoom: 2.5,
        layout: {
          visibility:      'none',
          'text-field':    ['get', 'name'],
          'text-size':     10,
          'text-offset':   [0, 1.6],
          'text-anchor':   'top',
          'text-optional': true,
        },
        paint: {
          'text-color':      'rgba(170,204,0,0.75)',
          'text-halo-color': 'rgba(0,0,0,0.7)',
          'text-halo-width': 1.2,
        },
      })

      // ── 3. Country name labels ──────────────────────────────────────────────
      map.addLayer({
        id: 'country-labels',
        type: 'symbol',
        source: 'world',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Bold', 'Open Sans Regular'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            2, 9,
            4, 11,
            6, 13,
          ],
          'text-max-width': 6,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': 'rgba(255,255,255,0.88)',
          'text-halo-color': 'rgba(0,0,0,0.70)',
          'text-halo-width': 1.5,
          'text-halo-blur': 0.5,
        },
      })

      // ── 4. Hover state ──────────────────────────────────────────────────────
      map.on('mousemove', 'country-fill', (e) => {
        if (!e.features?.length) return
        const feat    = e.features[0]
        const geoName = feat.properties?.name || ''
        const key     = geoNameToOurKey(geoName)

        if (hoveredId.current !== null) {
          map.setFeatureState({ source: 'world', id: hoveredId.current }, { hover: false })
        }
        hoveredId.current = feat.id
        map.setFeatureState({ source: 'world', id: feat.id }, { hover: true })
        map.getCanvas().style.cursor = effectiveCountriesRef.current[key] ? 'pointer' : 'default'
      })

      map.on('mouseleave', 'country-fill', () => {
        if (hoveredId.current !== null) {
          map.setFeatureState({ source: 'world', id: hoveredId.current }, { hover: false })
          hoveredId.current = null
        }
        map.getCanvas().style.cursor = ''
      })

      // ── 4. Popup builder ────────────────────────────────────────────────────
      const showPopup = (name, risk, region, lngLat, isLive = false) => {
        if (activePopup.current) { activePopup.current.remove(); activePopup.current = null }
        const color = RISK_COLOR[risk] ?? '#9ca3af'
        const el = document.createElement('div')
        el.style.fontFamily = 'system-ui,-apple-system,sans-serif'
        el.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:11px;font-weight:600;letter-spacing:0.06em;
              color:rgba(255,255,255,0.35);text-transform:uppercase">${region}</span>
            ${isLive ? `<span style="font-size:8px;font-weight:700;padding:1px 6px;border-radius:999px;
              background:rgba(170,204,0,0.12);color:#AACC00;border:1px solid rgba(170,204,0,0.25);
              letter-spacing:0.08em">AI LIVE</span>` : ''}
          </div>
          <div style="font-weight:800;font-size:15px;color:#EAEEF5;margin-bottom:8px;
            letter-spacing:0.01em;line-height:1.2">${name}</div>
          <div style="display:inline-flex;align-items:center;gap:6px;
            padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;
            background:${color}20;color:${color};border:1px solid ${color}45;
            letter-spacing:0.08em;margin-bottom:12px">
            <span style="width:6px;height:6px;border-radius:50%;
              background:${color};display:inline-block"></span>
            ${risk?.toUpperCase()} RISK
          </div>
        `
        const btn = document.createElement('button')
        btn.textContent = 'View Country Report →'
        btn.style.cssText = [
          'display:block;width:100%;background:#AACC00;color:#09090B;border:none',
          'border-radius:8px;padding:8px 14px;font-size:11px;font-weight:800;cursor:pointer',
          'letter-spacing:0.06em;text-transform:uppercase;transition:opacity 0.15s',
        ].join(';')
        btn.onmouseover = () => { btn.style.opacity = '0.85' }
        btn.onmouseout  = () => { btn.style.opacity = '1' }
        btn.onclick = () => navigateRef.current(`/country-risk?country=${encodeURIComponent(name)}`)
        el.appendChild(btn)

        activePopup.current = new maplibregl.Popup({
          closeButton: true, maxWidth: '260px', offset: 8,
        })
          .setLngLat(lngLat)
          .setDOMContent(el)
          .addTo(map)
      }

      // ── 5. Click handlers ───────────────────────────────────────────────────
      map.on('click', 'country-fill', (e) => {
        const geoName = e.features?.[0]?.properties?.name || ''
        const key     = geoNameToOurKey(geoName)
        const data    = effectiveCountriesRef.current[key]
        if (!data) return
        setSelected(key)
        showPopup(key, data.risk, data.region, e.lngLat, data.isLive)
      })

      map.on('click', 'risk-circles', (e) => {
        const p = e.features[0].properties
        const liveData = effectiveCountriesRef.current[p.name]
        setSelected(p.name)
        showPopup(p.name, liveData?.risk || p.risk, p.region, e.lngLat, liveData?.isLive)
      })
      map.on('mouseenter', 'risk-circles', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'risk-circles', () => { map.getCanvas().style.cursor = '' })

      setGeoLoaded(true)
      setMapReady(true)
    })

    mapRef.current = map
    return () => {
      if (activePopup.current) activePopup.current.remove()
      map.remove()
      mapRef.current = null
      document.head.removeChild(style)
    }
  }, [])

  // ── Update choropleth when region filter OR live data changes ────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const m = mapRef.current
    // Rebuild expressions using effectiveCountries (live overrides applied)
    const fillExpr   = buildFillColorExprFrom(effectiveCountries, regionFilter)
    const borderExpr = buildBorderColorExprFrom(effectiveCountries, regionFilter)
    try {
      m.setPaintProperty('country-fill',    'fill-color', fillExpr)
      m.setPaintProperty('country-borders', 'line-color', borderExpr)
    } catch (_) { /* layer may not exist yet */ }
    const src = m.getSource('country-points')
    if (src) src.setData(buildPointGeoJSONFrom(effectiveCountries, regionFilter))
  }, [regionFilter, mapReady, liveRisks])

  // ── Toggle view mode ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const m = mapRef.current
    const choroplethVisible = viewMode === 'choropleth'
    const bubbleVisible     = viewMode === 'bubble'
    try {
      m.setLayoutProperty('country-base',    'visibility', choroplethVisible ? 'visible' : 'none')
      m.setLayoutProperty('country-fill',    'visibility', choroplethVisible ? 'visible' : 'none')
      m.setLayoutProperty('country-borders', 'visibility', choroplethVisible ? 'visible' : 'none')
      m.setLayoutProperty('risk-circles',    'visibility', bubbleVisible     ? 'visible' : 'none')
      m.setLayoutProperty('risk-labels',     'visibility', bubbleVisible     ? 'visible' : 'none')
    } catch (_) { /* layer may not exist yet */ }
  }, [viewMode, mapReady])

  // ── Fly to country ────────────────────────────────────────────────────────
  const flyTo = useCallback((name) => {
    const c = effectiveCountriesRef.current[name]
    if (!c || !mapRef.current) return
    setSelected(name)
    mapRef.current.flyTo({ center: [c.lon, c.lat], zoom: 5, duration: 1100 })
  }, [])

  return (
    <Layout>
      <div className="relative -mx-4 lg:-mx-7" style={{ height: 'calc(100vh - 56px)' }}>

        {/* Map */}
        <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 0 }} />

        {/* ── Floating top bar ──────────────────────────────────────────────── */}
        <div className="absolute z-20" style={{ top: 14, left: 14, right: 14, pointerEvents: 'none' }}>
          <div
            className="flex items-center gap-2 px-4 h-11 rounded-[12px]"
            style={{
              background:     'rgba(9,10,12,0.92)',
              border:         '1px solid rgba(255,255,255,0.09)',
              backdropFilter: 'blur(20px)',
              boxShadow:      '0 4px 32px rgba(0,0,0,0.55)',
              pointerEvents:  'auto',
            }}
          >
            {/* Brand */}
            <Globe size={13} className="text-[#AACC00] shrink-0" />
            <span className="text-[11px] font-bold text-white tracking-widest uppercase">
              Global Risk Map
            </span>

            <div className="w-px h-4 bg-white/10 mx-0.5" />

            {/* Risk tier counts */}
            {[
              { label: 'Critical', color: '#ef4444' },
              { label: 'High',     color: '#f97316' },
              { label: 'Medium',   color: '#eab308' },
              { label: 'Low',      color: '#22c55e' },
            ].map(({ label, color }) => (
              <span key={label} className="flex items-center gap-1 text-[10px]">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
                <span className="font-bold" style={{ color }}>{counts[label]}</span>
                <span className="text-white/30 hidden sm:inline">{label}</span>
              </span>
            ))}

            <div className="w-px h-4 bg-white/10 mx-0.5" />
            {dataSource === 'live' ? (
              <span className="hidden md:flex items-center gap-1 text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#AACC00] animate-pulse" />
                <span className="text-[#AACC00] font-semibold">{liveCount} AI assessed</span>
                <span className="text-white/25">· {filteredCount} monitored</span>
              </span>
            ) : (
              <span className="text-[10px] text-white/25 hidden md:block">{filteredCount} countries monitored</span>
            )}

            <div className="flex-1" />

            {/* Region dropdown */}
            <div className="relative">
              <button
                onClick={() => setRegionOpen(o => !o)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-white/70 hover:text-white px-2 py-1 rounded-lg hover:bg-white/8 transition-colors"
              >
                <MapPin size={11} className="text-[#AACC00]" />
                {regionFilter}
                <ChevronDown size={10} className="text-white/40" />
              </button>
              {regionOpen && (
                <div
                  className="absolute top-full right-0 mt-1.5 rounded-[10px] overflow-hidden shadow-2xl"
                  style={{ background: '#0C0E12', border: '1px solid rgba(255,255,255,0.10)', minWidth: 140, zIndex: 100 }}
                >
                  {REGIONS.map(r => (
                    <button
                      key={r}
                      onClick={() => { setRegionFilter(r); setRegionOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-[11px] font-medium transition-colors hover:bg-white/8 ${regionFilter === r ? 'text-[#AACC00]' : 'text-white/65'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="w-px h-4 bg-white/10 mx-0.5" />

            {/* View mode toggle */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setViewMode('choropleth')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-[10px] font-bold transition-all"
                style={viewMode === 'choropleth'
                  ? { background: 'rgba(170,204,0,0.12)', color: '#AACC00', border: '1px solid rgba(170,204,0,0.25)' }
                  : { color: 'rgba(255,255,255,0.40)' }
                }
              >
                <Globe size={10} /> Countries
              </button>
              <button
                onClick={() => setViewMode('bubble')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-[10px] font-bold transition-all"
                style={viewMode === 'bubble'
                  ? { background: 'rgba(170,204,0,0.12)', color: '#AACC00', border: '1px solid rgba(170,204,0,0.25)' }
                  : { color: 'rgba(255,255,255,0.40)' }
                }
              >
                <CircleDot size={10} /> Bubbles
              </button>
            </div>

            <div className="w-px h-4 bg-white/10 mx-0.5" />

            {/* Country list toggle */}
            <button
              onClick={() => setShowList(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[10px] font-bold transition-all"
              style={showList
                ? { background: 'rgba(170,204,0,0.12)', color: '#AACC00', border: '1px solid rgba(170,204,0,0.25)' }
                : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }
              }
            >
              <Layers size={11} />
              Countries
            </button>
          </div>
        </div>

        {/* Country list panel */}
        {showList && (
          <CountryPanel
            filter={regionFilter}
            selected={selected}
            dataset={effectiveCountries}
            onSelect={(name) => {
              flyTo(name)
              navigateRef.current(`/country-risk?country=${encodeURIComponent(name)}`)
            }}
            onClose={() => setShowList(false)}
          />
        )}

        {/* ── Risk legend ──────────────────────────────────────────────────── */}
        <div
          className="absolute z-10 flex items-center gap-4 px-4 py-2.5 rounded-[10px]"
          style={{
            bottom: 14, left: 14,
            background:     'rgba(9,10,12,0.88)',
            border:         '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(12px)',
            boxShadow:      '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          <span className="text-[8px] font-bold text-white/20 uppercase tracking-wider shrink-0">Risk Level</span>
          {['Critical', 'High', 'Medium', 'Low'].map(level => (
            <div key={level} className="flex items-center gap-1.5">
              <div
                className="rounded-sm shrink-0"
                style={{ width: 12, height: 12, background: RISK_COLOR[level], opacity: 0.85 }}
              />
              <span className="text-[9px] font-medium text-white/45">{level}</span>
            </div>
          ))}
          <div className="w-px h-3 bg-white/10" />
          <div className="flex items-center gap-1.5">
            <div className="rounded-sm shrink-0" style={{ width: 12, height: 12, background: '#1a1c28' }} />
            <span className="text-[9px] font-medium text-white/25">Unrated</span>
          </div>
        </div>

        {/* ── Footer note ──────────────────────────────────────────────────── */}
        <div
          className="absolute z-10 flex items-center gap-1.5 px-3 py-2 rounded-[8px]"
          style={{
            bottom: 14, left: '50%', transform: 'translateX(-50%)',
            background:     'rgba(9,10,12,0.82)',
            border:         '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <span className="text-[8px] text-white/30">
            {filteredCount} countries monitored · click any country to view full report
          </span>
        </div>

      </div>
    </Layout>
  )
}
