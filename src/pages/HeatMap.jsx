/**
 * src/pages/HeatMap.jsx
 *
 * Global risk heat map — MapLibre GL JS
 *
 * Layers (toggled by viewMode):
 *   'heat'   → native MapLibre heatmap layer (default, low-zoom)
 *   'bubble' → data-driven circle + symbol layers
 *
 * No window globals — navigate accessed via ref, popups use setDOMContent.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useNavigate } from 'react-router-dom'
import { Layers, Flame, CircleDot } from 'lucide-react'
import Layout from '../components/Layout'
import { MAP_STYLES } from '../lib/mapConfig'

// ── Country dataset ───────────────────────────────────────────────────────────
const COUNTRIES = {
  // Critical
  'Somalia':                       { lat: 2.0469,   lon: 45.3182,  risk: 'Critical', region: 'Africa' },
  'South Sudan':                   { lat: 4.8594,   lon: 31.5713,  risk: 'Critical', region: 'Africa' },
  'Sudan':                         { lat: 15.5007,  lon: 32.5599,  risk: 'Critical', region: 'Africa' },
  'Libya':                         { lat: 32.9020,  lon: 13.1800,  risk: 'Critical', region: 'Africa' },
  'Syria':                         { lat: 33.5102,  lon: 36.2913,  risk: 'Critical', region: 'Middle East' },
  'Yemen':                         { lat: 15.3694,  lon: 44.1910,  risk: 'Critical', region: 'Middle East' },
  'Iraq':                          { lat: 33.3152,  lon: 44.3661,  risk: 'Critical', region: 'Middle East' },
  'Afghanistan':                   { lat: 34.5553,  lon: 69.2075,  risk: 'Critical', region: 'Asia' },
  'Democratic Republic of Congo':  { lat: -4.3217,  lon: 15.3222,  risk: 'Critical', region: 'Africa' },
  // High
  'Nigeria':                       { lat: 9.0765,   lon: 7.3986,   risk: 'High',     region: 'Africa' },
  'Mali':                          { lat: 12.3714,  lon: -8.0000,  risk: 'High',     region: 'Africa' },
  'Niger':                         { lat: 13.5137,  lon: 2.1098,   risk: 'High',     region: 'Africa' },
  'Chad':                          { lat: 12.1348,  lon: 15.0557,  risk: 'High',     region: 'Africa' },
  'Ethiopia':                      { lat: 9.0320,   lon: 38.7469,  risk: 'High',     region: 'Africa' },
  'Mozambique':                    { lat: -25.9692, lon: 32.5732,  risk: 'High',     region: 'Africa' },
  'Lebanon':                       { lat: 33.8886,  lon: 35.4955,  risk: 'High',     region: 'Middle East' },
  'Pakistan':                      { lat: 33.6844,  lon: 73.0479,  risk: 'High',     region: 'Asia' },
  'Myanmar':                       { lat: 19.7633,  lon: 96.0785,  risk: 'High',     region: 'Asia' },
  'Haiti':                         { lat: 18.5944,  lon: -72.3074, risk: 'High',     region: 'Americas' },
  'Ukraine':                       { lat: 50.4501,  lon: 30.5234,  risk: 'High',     region: 'Europe' },
  'Burkina Faso':                  { lat: 12.3647,  lon: -1.5354,  risk: 'High',     region: 'Africa' },
  'Central African Republic':      { lat: 4.3947,   lon: 18.5582,  risk: 'High',     region: 'Africa' },
  // Medium
  'Kenya':                         { lat: -1.2921,  lon: 36.8219,  risk: 'Medium',   region: 'Africa' },
  'Uganda':                        { lat: 0.3476,   lon: 32.5825,  risk: 'Medium',   region: 'Africa' },
  'Tanzania':                      { lat: -6.1722,  lon: 35.7395,  risk: 'Medium',   region: 'Africa' },
  'Zimbabwe':                      { lat: -17.8292, lon: 31.0522,  risk: 'Medium',   region: 'Africa' },
  'Zambia':                        { lat: -15.4167, lon: 28.2833,  risk: 'Medium',   region: 'Africa' },
  'Cameroon':                      { lat: 3.8480,   lon: 11.5021,  risk: 'Medium',   region: 'Africa' },
  'Egypt':                         { lat: 30.0444,  lon: 31.2357,  risk: 'Medium',   region: 'Africa' },
  'Jordan':                        { lat: 31.9539,  lon: 35.9106,  risk: 'Medium',   region: 'Middle East' },
  'Tunisia':                       { lat: 36.8190,  lon: 10.1658,  risk: 'Medium',   region: 'Africa' },
  'Angola':                        { lat: -8.8383,  lon: 13.2344,  risk: 'Medium',   region: 'Africa' },
  'Sierra Leone':                  { lat: 8.4897,   lon: -13.2344, risk: 'Medium',   region: 'Africa' },
  'Mauritania':                    { lat: 18.0735,  lon: -15.9582, risk: 'Medium',   region: 'Africa' },
  'Guinea':                        { lat: 9.6412,   lon: -13.5784, risk: 'Medium',   region: 'Africa' },
  'Venezuela':                     { lat: 10.4806,  lon: -66.9036, risk: 'Medium',   region: 'Americas' },
  'Colombia':                      { lat: 4.7110,   lon: -74.0721, risk: 'Medium',   region: 'Americas' },
  'Iran':                          { lat: 35.6892,  lon: 51.3890,  risk: 'Medium',   region: 'Middle East' },
  'Russia':                        { lat: 55.7558,  lon: 37.6173,  risk: 'Medium',   region: 'Europe' },
  'Saudi Arabia':                  { lat: 24.7136,  lon: 46.6753,  risk: 'Medium',   region: 'Middle East' },
  'Indonesia':                     { lat: -6.2088,  lon: 106.8456, risk: 'Medium',   region: 'Asia' },
  'Philippines':                   { lat: 14.5995,  lon: 120.9842, risk: 'Medium',   region: 'Asia' },
  'India':                         { lat: 28.6139,  lon: 77.2090,  risk: 'Medium',   region: 'Asia' },
  'Brazil':                        { lat: -15.7801, lon: -47.9292, risk: 'Medium',   region: 'Americas' },
  'Mexico':                        { lat: 19.4326,  lon: -99.1332, risk: 'Medium',   region: 'Americas' },
  // Low
  'South Africa':                  { lat: -25.7461, lon: 28.1881,  risk: 'Low',      region: 'Africa' },
  'Ghana':                         { lat: 5.6037,   lon: -0.1870,  risk: 'Low',      region: 'Africa' },
  'Rwanda':                        { lat: -1.9441,  lon: 30.0619,  risk: 'Low',      region: 'Africa' },
  'Senegal':                       { lat: 14.7167,  lon: -17.4677, risk: 'Low',      region: 'Africa' },
  'Morocco':                       { lat: 33.9716,  lon: -6.8498,  risk: 'Low',      region: 'Africa' },
  'Botswana':                      { lat: -24.6282, lon: 25.9231,  risk: 'Low',      region: 'Africa' },
  'Namibia':                       { lat: -22.5609, lon: 17.0658,  risk: 'Low',      region: 'Africa' },
  'Malawi':                        { lat: -13.9626, lon: 33.7741,  risk: 'Low',      region: 'Africa' },
  'United Kingdom':                { lat: 51.5074,  lon: -0.1278,  risk: 'Low',      region: 'Europe' },
  'France':                        { lat: 48.8566,  lon: 2.3522,   risk: 'Low',      region: 'Europe' },
  'Germany':                       { lat: 52.5200,  lon: 13.4050,  risk: 'Low',      region: 'Europe' },
  'United States':                 { lat: 38.9072,  lon: -77.0369, risk: 'Low',      region: 'Americas' },
  'Australia':                     { lat: -35.2809, lon: 149.1300, risk: 'Low',      region: 'Oceania' },
  'Singapore':                     { lat: 1.3521,   lon: 103.8198, risk: 'Low',      region: 'Asia' },
  'Japan':                         { lat: 35.6762,  lon: 139.6503, risk: 'Low',      region: 'Asia' },
  'United Arab Emirates':          { lat: 24.4539,  lon: 54.3773,  risk: 'Low',      region: 'Middle East' },
}

// ── Visual config ─────────────────────────────────────────────────────────────
const RISK_WEIGHT = { Critical: 1.0, High: 0.75, Medium: 0.45, Low: 0.15 }
const RISK_COLOR  = { Critical: '#ef4444', High: '#f97316', Medium: '#eab308', Low: '#22c55e', Unknown: '#9ca3af' }
const RISK_RADIUS = { Critical: 18, High: 14, Medium: 11, Low: 8, Unknown: 8 }
const RISK_BG_TW  = { Critical: 'bg-red-500',    High: 'bg-orange-500', Medium: 'bg-yellow-400', Low: 'bg-green-500' }
const REGIONS     = ['All', 'Africa', 'Middle East', 'Europe', 'Asia', 'Americas', 'Oceania']

// ── GeoJSON builder ───────────────────────────────────────────────────────────
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function HeatMap() {
  const navigate      = useNavigate()
  const navigateRef   = useRef(navigate)
  useEffect(() => { navigateRef.current = navigate }, [navigate])

  const containerRef  = useRef(null)
  const mapRef        = useRef(null)
  const activePopup   = useRef(null)

  const [regionFilter, setRegionFilter] = useState('All')
  const [viewMode,     setViewMode]     = useState('heat')   // 'heat' | 'bubble'
  const [mapReady,     setMapReady]     = useState(false)
  const [selected,     setSelected]     = useState(null)     // country name

  const counts = riskCounts()

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     MAP_STYLES.standard,
      center:    [20, 10],
      zoom:      2.5,
      minZoom:   1.5,
      maxZoom:   14,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-left')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('load', () => {
      // Source
      map.addSource('countries', { type: 'geojson', data: buildGeoJSON('All') })

      // ── Heatmap layer ──────────────────────────────────────────────────
      map.addLayer({
        id:   'risk-heat',
        type: 'heatmap',
        source: 'countries',
        paint: {
          'heatmap-weight':     ['get', 'riskWeight'],
          'heatmap-intensity':  ['interpolate', ['linear'], ['zoom'], 1, 0.6, 8, 2.5],
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

      // ── Bubble layer ───────────────────────────────────────────────────
      map.addLayer({
        id:     'risk-circles',
        type:   'circle',
        source: 'countries',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            2, ['/', ['get', 'radius'], 2.8],
            8, ['get', 'radius'],
          ],
          'circle-color':          ['get', 'color'],
          'circle-opacity':        0.72,
          'circle-stroke-width':   1.5,
          'circle-stroke-color':   ['get', 'color'],
          'circle-stroke-opacity': 0.9,
        },
      })

      // ── Country name labels (bubble mode, always visible) ─────────────
      map.addLayer({
        id:     'risk-labels',
        type:   'symbol',
        source: 'countries',
        minzoom: 2,
        layout: {
          visibility:    'none',
          'text-field':  ['get', 'name'],
          'text-size':   10,
          'text-offset': [0, 1.6],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: {
          'text-color':       '#374151',
          'text-halo-color':  'rgba(255,255,255,0.9)',
          'text-halo-width':  1.2,
        },
      })

      // ── Click on bubble layer → popup ──────────────────────────────────
      const showPopup = (props, lngLat) => {
        if (activePopup.current) { activePopup.current.remove(); activePopup.current = null }

        const color = RISK_COLOR[props.risk] ?? '#9ca3af'
        const lightText = props.risk === 'Medium'

        const el = document.createElement('div')
        el.style.cssText = 'font-family:system-ui,-apple-system,sans-serif;min-width:180px'
        el.innerHTML = `
          <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#111827">${props.name}</div>
          <div style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;
            background:${color};color:${lightText ? '#1f2937' : '#fff'};margin-bottom:6px">${props.risk} Risk</div>
          <div style="font-size:11px;color:#6b7280;margin-bottom:10px">${props.region}</div>
        `
        const btn = document.createElement('button')
        btn.textContent = 'View Full Report →'
        btn.style.cssText = [
          'display:block;width:100%;background:#0118A1;color:#fff;border:none',
          'border-radius:6px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer',
        ].join(';')
        btn.onmouseover = () => { btn.style.background = '#0a22c9' }
        btn.onmouseout  = () => { btn.style.background = '#0118A1' }
        btn.onclick = () => navigateRef.current(`/country-risk?country=${encodeURIComponent(props.name)}`)
        el.appendChild(btn)

        activePopup.current = new maplibregl.Popup({ closeButton: true, maxWidth: '220px', offset: 12 })
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

      // Heatmap click — find nearest country point within threshold
      map.on('click', 'risk-heat', e => {
        const { lng, lat } = e.lngLat
        let nearest = null, minDist = Infinity
        Object.entries(COUNTRIES).forEach(([name, c]) => {
          const d = Math.hypot(c.lon - lng, c.lat - lat)
          if (d < minDist) { minDist = d; nearest = { name, ...c } }
        })
        if (nearest && minDist < 12) {
          setSelected(nearest.name)
          showPopup(
            { name: nearest.name, risk: nearest.risk, region: nearest.region,
              color: RISK_COLOR[nearest.risk] },
            e.lngLat,
          )
        }
      })
      map.on('mouseenter', 'risk-heat', () => { map.getCanvas().style.cursor = 'crosshair' })
      map.on('mouseleave', 'risk-heat', () => { map.getCanvas().style.cursor = '' })

      setMapReady(true)
    })

    mapRef.current = map
    return () => {
      if (activePopup.current) { activePopup.current.remove() }
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Update GeoJSON source when filter changes ─────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const src = mapRef.current.getSource('countries')
    if (src) src.setData(buildGeoJSON(regionFilter))
  }, [regionFilter, mapReady])

  // ── Toggle heatmap ↔ bubble visibility ─────────────────────────────────────
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

  // ── Fly to country (from sidebar) ─────────────────────────────────────────
  const flyTo = useCallback((name) => {
    const c = COUNTRIES[name]
    if (!c || !mapRef.current) return
    setSelected(name)
    mapRef.current.flyTo({ center: [c.lon, c.lat], zoom: 5, duration: 1100 })
  }, [])

  const filtered = Object.entries(COUNTRIES).filter(([, c]) =>
    regionFilter === 'All' || c.region === regionFilter
  )

  return (
    <Layout>
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Layers size={20} className="text-[#0118A1]" />
          <h1 className="text-2xl font-bold text-gray-900">Global Risk Heat Map</h1>
        </div>
        <p className="text-sm text-gray-500">
          Click any country to view its full risk profile.
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {['Critical', 'High', 'Medium', 'Low'].map(level => (
          <div key={level}
            className="bg-white border border-gray-200 rounded-[8px] p-3 flex items-center gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <div className={`w-3 h-3 rounded-full shrink-0 ${RISK_BG_TW[level]}`} />
            <div>
              <div className="text-lg font-bold text-gray-900 leading-none">{counts[level]}</div>
              <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">{level}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        {/* Region pills */}
        <div className="flex gap-1.5 flex-wrap">
          {REGIONS.map(r => (
            <button key={r} onClick={() => setRegionFilter(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${regionFilter === r
                  ? 'bg-[#0118A1] text-white border-[#0118A1]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              {r}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-gray-100 rounded-xl p-1 shrink-0">
          <button onClick={() => setViewMode('heat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${viewMode === 'heat' ? 'bg-[#0118A1] text-white shadow-sm' : 'text-gray-600 hover:text-[#0118A1]'}`}>
            <Flame size={11} /> Heatmap
          </button>
          <button onClick={() => setViewMode('bubble')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${viewMode === 'bubble' ? 'bg-[#0118A1] text-white shadow-sm' : 'text-gray-600 hover:text-[#0118A1]'}`}>
            <CircleDot size={11} /> Bubbles
          </button>
        </div>
      </div>

      {/* Map + sidebar */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">

        {/* ── Map ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 w-full">
          <div className="rounded-[10px] overflow-hidden border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
            style={{ height: 480 }}>
            <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-4 bg-white border border-gray-200
            rounded-[8px] px-4 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Risk Level</span>
            {['Critical', 'High', 'Medium', 'Low'].map(level => (
              <div key={level} className="flex items-center gap-1.5">
                <div className="rounded-full shrink-0"
                  style={{ width: RISK_RADIUS[level] * 1.1, height: RISK_RADIUS[level] * 1.1,
                    background: RISK_COLOR[level], opacity: 0.82 }} />
                <span className="text-xs text-gray-600">{level}</span>
              </div>
            ))}
            <span className="ml-auto text-[10px] text-gray-400">{filtered.length} countries shown</span>
          </div>
        </div>

        {/* ── Country sidebar ──────────────────────────────────────────────── */}
        <div className="w-full lg:w-56 shrink-0">
          <div className="bg-white border border-gray-200 rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Countries</span>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 480 }}>
              {['Critical', 'High', 'Medium', 'Low'].map(level => {
                const group = filtered.filter(([, c]) => c.risk === level)
                if (!group.length) return null
                const color = RISK_COLOR[level]
                return (
                  <div key={level}>
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: color + '18', color }}>
                      {level} ({group.length})
                    </div>
                    {group.map(([name]) => (
                      <button key={name}
                        onClick={() => {
                          flyTo(name)
                          navigate(`/country-risk?country=${encodeURIComponent(name)}`)
                        }}
                        className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5
                          border-b border-gray-50 transition-colors
                          ${selected === name ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        <div className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: color }} />
                        <span className="text-gray-800 text-xs font-medium truncate">{name}</span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
