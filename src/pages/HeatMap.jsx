/**
 * src/pages/HeatMap.jsx
 *
 * Global Risk Heat Map — full-screen dark operational map matching MovementIntel style.
 *
 * Layers: 'heat' (default) | 'bubble'
 * Floating top bar, left country-list panel, dark glass popups.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useNavigate } from 'react-router-dom'
import {
  Flame, CircleDot, ChevronDown, Layers,
  RefreshCw, X, MapPin,
} from 'lucide-react'
import Layout from '../components/Layout'
import { MAP_STYLES } from '../lib/mapConfig'

// ── Country dataset ───────────────────────────────────────────────────────────
const COUNTRIES = {
  // Critical
  'Somalia':                      { lat: 2.0469,   lon: 45.3182,  risk: 'Critical', region: 'Africa' },
  'South Sudan':                  { lat: 4.8594,   lon: 31.5713,  risk: 'Critical', region: 'Africa' },
  'Sudan':                        { lat: 15.5007,  lon: 32.5599,  risk: 'Critical', region: 'Africa' },
  'Libya':                        { lat: 32.9020,  lon: 13.1800,  risk: 'Critical', region: 'Africa' },
  'Syria':                        { lat: 33.5102,  lon: 36.2913,  risk: 'Critical', region: 'Middle East' },
  'Yemen':                        { lat: 15.3694,  lon: 44.1910,  risk: 'Critical', region: 'Middle East' },
  'Iraq':                         { lat: 33.3152,  lon: 44.3661,  risk: 'Critical', region: 'Middle East' },
  'Afghanistan':                  { lat: 34.5553,  lon: 69.2075,  risk: 'Critical', region: 'Asia' },
  'DR Congo':                     { lat: -4.3217,  lon: 15.3222,  risk: 'Critical', region: 'Africa' },
  // High
  'Nigeria':                      { lat: 9.0765,   lon: 7.3986,   risk: 'High',     region: 'Africa' },
  'Mali':                         { lat: 12.3714,  lon: -8.0000,  risk: 'High',     region: 'Africa' },
  'Niger':                        { lat: 13.5137,  lon: 2.1098,   risk: 'High',     region: 'Africa' },
  'Chad':                         { lat: 12.1348,  lon: 15.0557,  risk: 'High',     region: 'Africa' },
  'Ethiopia':                     { lat: 9.0320,   lon: 38.7469,  risk: 'High',     region: 'Africa' },
  'Mozambique':                   { lat: -25.9692, lon: 32.5732,  risk: 'High',     region: 'Africa' },
  'Lebanon':                      { lat: 33.8886,  lon: 35.4955,  risk: 'High',     region: 'Middle East' },
  'Pakistan':                     { lat: 33.6844,  lon: 73.0479,  risk: 'High',     region: 'Asia' },
  'Myanmar':                      { lat: 19.7633,  lon: 96.0785,  risk: 'High',     region: 'Asia' },
  'Haiti':                        { lat: 18.5944,  lon: -72.3074, risk: 'High',     region: 'Americas' },
  'Ukraine':                      { lat: 50.4501,  lon: 30.5234,  risk: 'High',     region: 'Europe' },
  'Burkina Faso':                 { lat: 12.3647,  lon: -1.5354,  risk: 'High',     region: 'Africa' },
  'Central African Republic':     { lat: 4.3947,   lon: 18.5582,  risk: 'High',     region: 'Africa' },
  // Medium
  'Kenya':                        { lat: -1.2921,  lon: 36.8219,  risk: 'Medium',   region: 'Africa' },
  'Uganda':                       { lat: 0.3476,   lon: 32.5825,  risk: 'Medium',   region: 'Africa' },
  'Tanzania':                     { lat: -6.1722,  lon: 35.7395,  risk: 'Medium',   region: 'Africa' },
  'Zimbabwe':                     { lat: -17.8292, lon: 31.0522,  risk: 'Medium',   region: 'Africa' },
  'Zambia':                       { lat: -15.4167, lon: 28.2833,  risk: 'Medium',   region: 'Africa' },
  'Cameroon':                     { lat: 3.8480,   lon: 11.5021,  risk: 'Medium',   region: 'Africa' },
  'Egypt':                        { lat: 30.0444,  lon: 31.2357,  risk: 'Medium',   region: 'Africa' },
  'Jordan':                       { lat: 31.9539,  lon: 35.9106,  risk: 'Medium',   region: 'Middle East' },
  'Tunisia':                      { lat: 36.8190,  lon: 10.1658,  risk: 'Medium',   region: 'Africa' },
  'Angola':                       { lat: -8.8383,  lon: 13.2344,  risk: 'Medium',   region: 'Africa' },
  'Sierra Leone':                 { lat: 8.4897,   lon: -13.2344, risk: 'Medium',   region: 'Africa' },
  'Mauritania':                   { lat: 18.0735,  lon: -15.9582, risk: 'Medium',   region: 'Africa' },
  'Guinea':                       { lat: 9.6412,   lon: -13.5784, risk: 'Medium',   region: 'Africa' },
  'Venezuela':                    { lat: 10.4806,  lon: -66.9036, risk: 'Medium',   region: 'Americas' },
  'Colombia':                     { lat: 4.7110,   lon: -74.0721, risk: 'Medium',   region: 'Americas' },
  'Iran':                         { lat: 35.6892,  lon: 51.3890,  risk: 'Medium',   region: 'Middle East' },
  'Russia':                       { lat: 55.7558,  lon: 37.6173,  risk: 'Medium',   region: 'Europe' },
  'Saudi Arabia':                 { lat: 24.7136,  lon: 46.6753,  risk: 'Medium',   region: 'Middle East' },
  'Indonesia':                    { lat: -6.2088,  lon: 106.8456, risk: 'Medium',   region: 'Asia' },
  'Philippines':                  { lat: 14.5995,  lon: 120.9842, risk: 'Medium',   region: 'Asia' },
  'India':                        { lat: 28.6139,  lon: 77.2090,  risk: 'Medium',   region: 'Asia' },
  'Brazil':                       { lat: -15.7801, lon: -47.9292, risk: 'Medium',   region: 'Americas' },
  'Mexico':                       { lat: 19.4326,  lon: -99.1332, risk: 'Medium',   region: 'Americas' },
  // Low
  'South Africa':                 { lat: -25.7461, lon: 28.1881,  risk: 'Low',      region: 'Africa' },
  'Ghana':                        { lat: 5.6037,   lon: -0.1870,  risk: 'Low',      region: 'Africa' },
  'Rwanda':                       { lat: -1.9441,  lon: 30.0619,  risk: 'Low',      region: 'Africa' },
  'Senegal':                      { lat: 14.7167,  lon: -17.4677, risk: 'Low',      region: 'Africa' },
  'Morocco':                      { lat: 33.9716,  lon: -6.8498,  risk: 'Low',      region: 'Africa' },
  'Botswana':                     { lat: -24.6282, lon: 25.9231,  risk: 'Low',      region: 'Africa' },
  'Namibia':                      { lat: -22.5609, lon: 17.0658,  risk: 'Low',      region: 'Africa' },
  'Malawi':                       { lat: -13.9626, lon: 33.7741,  risk: 'Low',      region: 'Africa' },
  'United Kingdom':               { lat: 51.5074,  lon: -0.1278,  risk: 'Low',      region: 'Europe' },
  'France':                       { lat: 48.8566,  lon: 2.3522,   risk: 'Low',      region: 'Europe' },
  'Germany':                      { lat: 52.5200,  lon: 13.4050,  risk: 'Low',      region: 'Europe' },
  'United States':                { lat: 38.9072,  lon: -77.0369, risk: 'Low',      region: 'Americas' },
  'Australia':                    { lat: -35.2809, lon: 149.1300, risk: 'Low',      region: 'Oceania' },
  'Singapore':                    { lat: 1.3521,   lon: 103.8198, risk: 'Low',      region: 'Asia' },
  'Japan':                        { lat: 35.6762,  lon: 139.6503, risk: 'Low',      region: 'Asia' },
  'United Arab Emirates':         { lat: 24.4539,  lon: 54.3773,  risk: 'Low',      region: 'Middle East' },
}

const RISK_WEIGHT = { Critical: 1.0, High: 0.75, Medium: 0.45, Low: 0.15 }
const RISK_COLOR  = { Critical: '#ef4444', High: '#f97316', Medium: '#eab308', Low: '#22c55e' }
const RISK_RADIUS = { Critical: 18, High: 14, Medium: 11, Low: 8 }
const REGIONS     = ['All', 'Africa', 'Middle East', 'Americas', 'Asia', 'Europe', 'Oceania']

function buildGeoJSON(filter = 'All') {
  return {
    type: 'FeatureCollection',
    features: Object.entries(COUNTRIES)
      .filter(([, c]) => filter === 'All' || c.region === filter)
      .map(([name, c]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
        properties: {
          name, risk: c.risk, region: c.region,
          riskWeight: RISK_WEIGHT[c.risk]  ?? 0.1,
          color:      RISK_COLOR[c.risk]   ?? '#9ca3af',
          radius:     RISK_RADIUS[c.risk]  ?? 8,
        },
      })),
  }
}

function riskCounts() {
  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 }
  Object.values(COUNTRIES).forEach(c => { if (counts[c.risk] !== undefined) counts[c.risk]++ })
  return counts
}

// ── Country list panel ────────────────────────────────────────────────────────
function CountryPanel({ filter, selected, onSelect, onClose }) {
  const filtered = Object.entries(COUNTRIES).filter(
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
          <Flame size={11} style={{ color: '#AACC00' }} />
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
              {group.map(([name]) => (
                <button key={name} onClick={() => onSelect(name)}
                  className="w-full text-left flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-white/5"
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: selected === name ? `${color}12` : undefined,
                  }}>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-[11px] font-medium truncate"
                    style={{ color: selected === name ? color : 'rgba(255,255,255,0.65)' }}>
                    {name}
                  </span>
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HeatMap() {
  const navigate      = useNavigate()
  const navigateRef   = useRef(navigate)
  useEffect(() => { navigateRef.current = navigate }, [navigate])

  const containerRef  = useRef(null)
  const mapRef        = useRef(null)
  const activePopup   = useRef(null)

  const [regionFilter, setRegionFilter] = useState('All')
  const [regionOpen,   setRegionOpen]   = useState(false)
  const [viewMode,     setViewMode]     = useState('heat')
  const [mapReady,     setMapReady]     = useState(false)
  const [selected,     setSelected]     = useState(null)
  const [showList,     setShowList]     = useState(true)

  const counts = riskCounts()

  // ── Map init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     MAP_STYLES.operational,
      center:    [20, 10],
      zoom:      2.5,
      minZoom:   1.5,
      maxZoom:   14,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-right')

    // Dark popup styles matching MovementIntel
    const style = document.createElement('style')
    style.textContent = `
      .maplibregl-popup-content {
        background: #11131A;
        color: #EAEEF5;
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 10px;
        padding: 12px 14px;
        font-family: system-ui, sans-serif;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        min-width: 200px;
      }
      .maplibregl-popup-close-button { color: #6E7480; font-size: 16px; top: 6px; right: 8px; }
      .maplibregl-popup-tip { display: none !important; }
      .maplibregl-ctrl-bottom-right { bottom: 28px !important; }
    `
    document.head.appendChild(style)

    map.on('load', () => {
      map.addSource('countries', { type: 'geojson', data: buildGeoJSON('All') })

      // ── Heatmap layer ──────────────────────────────────────────────────────
      map.addLayer({
        id: 'risk-heat', type: 'heatmap', source: 'countries',
        paint: {
          'heatmap-weight':    ['get', 'riskWeight'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 8, 2.5],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,   'rgba(0,0,0,0)',
            0.1, 'rgba(34,197,94,0.4)',
            0.3, 'rgba(234,179,8,0.65)',
            0.5, 'rgba(249,115,22,0.78)',
            0.7, 'rgba(239,68,68,0.88)',
            1.0, 'rgba(127,29,29,1)',
          ],
          'heatmap-radius':  ['interpolate', ['linear'], ['zoom'], 1, 20, 8, 55],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.92, 9, 0.6],
        },
      })

      // ── Bubble layer ───────────────────────────────────────────────────────
      map.addLayer({
        id: 'risk-circles', type: 'circle', source: 'countries',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
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

      // ── Country labels (bubble mode) ───────────────────────────────────────
      map.addLayer({
        id: 'risk-labels', type: 'symbol', source: 'countries',
        minzoom: 2,
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

      // ── Popup builder ──────────────────────────────────────────────────────
      const showPopup = (props, lngLat) => {
        if (activePopup.current) { activePopup.current.remove(); activePopup.current = null }
        const color = RISK_COLOR[props.risk] ?? '#9ca3af'
        const el = document.createElement('div')
        el.style.cssText = 'font-family:system-ui,-apple-system,sans-serif'
        el.innerHTML = `
          <div style="font-weight:700;font-size:13px;color:#EAEEF5;margin-bottom:5px">${props.name}</div>
          <div style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;
            background:${color}22;color:${color};border:1px solid ${color}44;margin-bottom:5px">${props.risk?.toUpperCase()} RISK</div>
          <div style="font-size:10px;color:#6E7480;margin-bottom:10px">${props.region}</div>
        `
        const btn = document.createElement('button')
        btn.textContent = 'View Full Report →'
        btn.style.cssText = [
          'display:block;width:100%;background:#AACC00;color:#09090B;border:none',
          'border-radius:6px;padding:7px 14px;font-size:11px;font-weight:700;cursor:pointer',
        ].join(';')
        btn.onmouseover = () => { btn.style.opacity = '0.85' }
        btn.onmouseout  = () => { btn.style.opacity = '1' }
        btn.onclick = () => navigateRef.current(`/country-risk?country=${encodeURIComponent(props.name)}`)
        el.appendChild(btn)

        activePopup.current = new maplibregl.Popup({ closeButton: true, maxWidth: '240px', offset: 12 })
          .setLngLat(lngLat)
          .setDOMContent(el)
          .addTo(map)
      }

      map.on('click', 'risk-circles', e => {
        const p = e.features[0].properties
        setSelected(p.name)
        showPopup(p, e.lngLat)
      })
      map.on('mouseenter', 'risk-circles', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'risk-circles', () => { map.getCanvas().style.cursor = '' })

      map.on('click', 'risk-heat', e => {
        const { lng, lat } = e.lngLat
        let nearest = null, minDist = Infinity
        Object.entries(COUNTRIES).forEach(([name, c]) => {
          const d = Math.hypot(c.lon - lng, c.lat - lat)
          if (d < minDist) { minDist = d; nearest = { name, ...c } }
        })
        if (nearest && minDist < 12) {
          setSelected(nearest.name)
          showPopup({ name: nearest.name, risk: nearest.risk, region: nearest.region }, e.lngLat)
        }
      })
      map.on('mouseenter', 'risk-heat', () => { map.getCanvas().style.cursor = 'crosshair' })
      map.on('mouseleave', 'risk-heat', () => { map.getCanvas().style.cursor = '' })

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

  // ── Update source on filter change ────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const src = mapRef.current.getSource('countries')
    if (src) src.setData(buildGeoJSON(regionFilter))
  }, [regionFilter, mapReady])

  // ── Toggle layers ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const m = mapRef.current
    if (viewMode === 'heat') {
      m.setLayoutProperty('risk-heat',    'visibility', 'visible')
      m.setLayoutProperty('risk-circles', 'visibility', 'none')
      m.setLayoutProperty('risk-labels',  'visibility', 'none')
    } else {
      m.setLayoutProperty('risk-heat',    'visibility', 'none')
      m.setLayoutProperty('risk-circles', 'visibility', 'visible')
      m.setLayoutProperty('risk-labels',  'visibility', 'visible')
    }
  }, [viewMode, mapReady])

  const flyTo = useCallback((name) => {
    const c = COUNTRIES[name]
    if (!c || !mapRef.current) return
    setSelected(name)
    mapRef.current.flyTo({ center: [c.lon, c.lat], zoom: 5, duration: 1100 })
  }, [])

  const filteredCount = Object.values(COUNTRIES).filter(
    c => regionFilter === 'All' || c.region === regionFilter
  ).length

  return (
    <Layout>
      <div className="relative -mx-4 lg:-mx-7" style={{ height: 'calc(100vh - 56px)' }}>

        {/* Map */}
        <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 0 }} />

        {/* ── Floating top bar ────────────────────────────────────────────────── */}
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
            <Flame size={13} className="text-[#AACC00] shrink-0" />
            <span className="text-[11px] font-bold text-white tracking-widest uppercase">Risk Heat Map</span>

            <div className="w-px h-4 bg-white/10 mx-0.5" />

            {/* Risk counts */}
            {[
              { label: 'Critical', color: '#ef4444' },
              { label: 'High',     color: '#f97316' },
              { label: 'Medium',   color: '#eab308' },
              { label: 'Low',      color: '#22c55e' },
            ].map(({ label, color }) => (
              <span key={label} className="flex items-center gap-1 text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="font-bold" style={{ color }}>{counts[label]}</span>
                <span className="text-white/30 hidden sm:inline">{label}</span>
              </span>
            ))}

            <div className="w-px h-4 bg-white/10 mx-0.5" />
            <span className="text-[10px] text-white/25 hidden md:block">{filteredCount} countries</span>

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
                    <button key={r} onClick={() => { setRegionFilter(r); setRegionOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-[11px] font-medium transition-colors hover:bg-white/8 ${regionFilter === r ? 'text-[#AACC00]' : 'text-white/65'}`}>
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="w-px h-4 bg-white/10 mx-0.5" />

            {/* Heatmap / Bubbles toggle */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setViewMode('heat')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-[10px] font-bold transition-all"
                style={viewMode === 'heat'
                  ? { background: 'rgba(170,204,0,0.12)', color: '#AACC00', border: '1px solid rgba(170,204,0,0.25)' }
                  : { color: 'rgba(255,255,255,0.40)' }
                }
              >
                <Flame size={10} /> Heat
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

            {/* Countries list toggle */}
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
            onSelect={(name) => {
              flyTo(name)
              navigateRef.current(`/country-risk?country=${encodeURIComponent(name)}`)
            }}
            onClose={() => setShowList(false)}
          />
        )}

        {/* ── Risk legend (bottom left) ────────────────────────────────────────── */}
        <div
          className="absolute z-10 flex items-center gap-3 px-3 py-2 rounded-[8px]"
          style={{
            bottom: 14, left: 14,
            background:     'rgba(9,10,12,0.82)',
            border:         '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <span className="text-[8px] font-bold text-white/20 uppercase tracking-wider">Risk</span>
          {['Critical', 'High', 'Medium', 'Low'].map(level => (
            <div key={level} className="flex items-center gap-1.5">
              <div className="rounded-full shrink-0"
                style={{
                  width:      RISK_RADIUS[level] * 0.9,
                  height:     RISK_RADIUS[level] * 0.9,
                  background: RISK_COLOR[level],
                  opacity:    0.85,
                }}
              />
              <span className="text-[8px] text-white/35">{level}</span>
            </div>
          ))}
        </div>

        {/* ── Country count (bottom centre) ───────────────────────────────────── */}
        <div
          className="absolute z-10 flex items-center gap-1.5 px-3 py-2 rounded-[8px]"
          style={{
            bottom: 14, left: '50%', transform: 'translateX(-50%)',
            background:     'rgba(9,10,12,0.82)',
            border:         '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <span className="text-[8px] text-white/35">{filteredCount} countries monitored · click to view full report</span>
        </div>

      </div>
    </Layout>
  )
}
