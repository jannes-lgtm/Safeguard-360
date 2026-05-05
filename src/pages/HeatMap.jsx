import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { useNavigate } from 'react-router-dom'
import { Layers } from 'lucide-react'
import Layout from '../components/Layout'

// ── Country data: capital coordinates + static base risk ─────────────────────
const COUNTRIES = {
  // ── Critical ──────────────────────────────────────────────────────────────
  'Somalia':                       { lat: 2.0469,   lon: 45.3182,  risk: 'Critical', region: 'Africa' },
  'South Sudan':                   { lat: 4.8594,   lon: 31.5713,  risk: 'Critical', region: 'Africa' },
  'Sudan':                         { lat: 15.5007,  lon: 32.5599,  risk: 'Critical', region: 'Africa' },
  'Libya':                         { lat: 32.9020,  lon: 13.1800,  risk: 'Critical', region: 'Africa' },
  'Syria':                         { lat: 33.5102,  lon: 36.2913,  risk: 'Critical', region: 'Middle East' },
  'Yemen':                         { lat: 15.3694,  lon: 44.1910,  risk: 'Critical', region: 'Middle East' },
  'Iraq':                          { lat: 33.3152,  lon: 44.3661,  risk: 'Critical', region: 'Middle East' },
  'Afghanistan':                   { lat: 34.5553,  lon: 69.2075,  risk: 'Critical', region: 'Asia' },
  'Democratic Republic of Congo':  { lat: -4.3217,  lon: 15.3222,  risk: 'Critical', region: 'Africa' },
  // ── High ──────────────────────────────────────────────────────────────────
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
  // ── Medium ────────────────────────────────────────────────────────────────
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
  // ── Low ───────────────────────────────────────────────────────────────────
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

const RISK_STYLE = {
  Critical: { color: '#dc2626', fillColor: '#dc2626', radius: 18, bg: 'bg-red-600',    text: 'text-white' },
  High:     { color: '#ea580c', fillColor: '#ea580c', radius: 14, bg: 'bg-orange-500', text: 'text-white' },
  Medium:   { color: '#ca8a04', fillColor: '#eab308', radius: 11, bg: 'bg-yellow-400', text: 'text-gray-900' },
  Low:      { color: '#16a34a', fillColor: '#22c55e', radius: 8,  bg: 'bg-green-500',  text: 'text-white' },
  Unknown:  { color: '#9ca3af', fillColor: '#d1d5db', radius: 8,  bg: 'bg-gray-400',   text: 'text-white' },
}
const rs = (r) => RISK_STYLE[r] || RISK_STYLE.Unknown

function riskCounts(data) {
  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 }
  Object.values(data).forEach(c => { if (counts[c.risk] !== undefined) counts[c.risk]++ })
  return counts
}

const REGIONS = ['All', 'Africa', 'Middle East', 'Europe', 'Asia', 'Americas', 'Oceania']

export default function HeatMap() {
  const navigate = useNavigate()
  const containerRef  = useRef(null)   // DOM div for Leaflet
  const mapRef        = useRef(null)   // L.Map instance
  const markersRef    = useRef([])     // active L.CircleMarker instances
  const [regionFilter, setRegionFilter] = useState('All')
  const [highlighted,  setHighlighted]  = useState(null)
  const [mapReady,     setMapReady]     = useState(false)

  const counts = riskCounts(COUNTRIES)

  // Register global goto handler for popup buttons (Leaflet popup HTML can't
  // access React context, so we bridge via window)
  useEffect(() => {
    window.__heatmapGoto = (country) =>
      navigate(`/country-risk?country=${encodeURIComponent(country)}`)
    return () => { delete window.__heatmapGoto }
  }, [navigate])

  // Initialise Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center:          [5, 20],
      zoom:            3,
      zoomControl:     true,
      scrollWheelZoom: true,
    })

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; <a href="https://carto.com">CARTO</a>', subdomains: 'abcd', maxZoom: 19 }
    ).addTo(map)

    mapRef.current = map
    setMapReady(true)

    return () => {
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [])

  // Add / refresh circle markers whenever filter or map readiness changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    // Remove existing markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    const filtered = Object.entries(COUNTRIES).filter(([, c]) =>
      regionFilter === 'All' || c.region === regionFilter
    )

    filtered.forEach(([name, c]) => {
      const s = rs(c.risk)
      const safeName = name.replace(/'/g, "\\'")

      const marker = L.circleMarker([c.lat, c.lon], {
        radius:      s.radius,
        color:       s.color,
        fillColor:   s.fillColor,
        fillOpacity: 0.65,
        weight:      1.5,
      })

      marker.bindPopup(`
        <div style="font-family:sans-serif;padding:4px 0;min-width:170px">
          <div style="font-weight:700;font-size:14px;margin-bottom:6px">${name}</div>
          <div style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;
            background:${s.fillColor};color:${c.risk === 'Medium' ? '#1f2937' : '#fff'};margin-bottom:8px">
            ${c.risk} Risk
          </div>
          <div style="font-size:11px;color:#6b7280;margin-bottom:10px">${c.region}</div>
          <button
            onclick="window.__heatmapGoto('${safeName}')"
            style="display:block;width:100%;background:#0118A1;color:#fff;border:none;
              border-radius:6px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer">
            View Full Report
          </button>
        </div>
      `)

      marker.addTo(map)
      markersRef.current.push(marker)
    })
  }, [mapReady, regionFilter])

  // Fly to highlighted country
  useEffect(() => {
    if (!mapRef.current || !highlighted) return
    const c = COUNTRIES[highlighted]
    if (c) mapRef.current.flyTo([c.lat, c.lon], 5, { duration: 1.2 })
  }, [highlighted])

  const filtered = Object.entries(COUNTRIES).filter(([, c]) =>
    regionFilter === 'All' || c.region === regionFilter
  )

  return (
    <Layout>
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Layers size={20} className="text-[#0118A1]" />
          <h1 className="text-2xl font-bold text-gray-900">Global Risk Heat Map</h1>
        </div>
        <p className="text-sm text-gray-500">
          Real-time risk levels across all monitored countries. Click a country to view the full risk report.
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {['Critical', 'High', 'Medium', 'Low'].map(level => {
          const s = RISK_STYLE[level]
          return (
            <div key={level} className="bg-white border border-gray-200 rounded-[8px] p-3 flex items-center gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <div className={`w-3 h-3 rounded-full ${s.bg}`} />
              <div>
                <div className="text-lg font-bold text-gray-900 leading-none">{counts[level]}</div>
                <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">{level}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-4 items-start">
        {/* ── Map ── */}
        <div className="flex-1 min-w-0">
          {/* Region filter */}
          <div className="flex gap-1.5 mb-3 flex-wrap">
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

          <div className="rounded-[10px] overflow-hidden border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
            style={{ height: 520 }}>
            <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-5 bg-white border border-gray-200 rounded-[8px] px-4 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">Risk Level</span>
            {['Critical', 'High', 'Medium', 'Low'].map(level => {
              const s = RISK_STYLE[level]
              return (
                <div key={level} className="flex items-center gap-1.5">
                  <div className="rounded-full shrink-0"
                    style={{ width: s.radius * 1.2, height: s.radius * 1.2, background: s.fillColor, opacity: 0.85 }} />
                  <span className="text-xs text-gray-600">{level}</span>
                </div>
              )
            })}
            <span className="ml-auto text-[10px] text-gray-400">{filtered.length} countries shown</span>
          </div>
        </div>

        {/* ── Right sidebar: country list ── */}
        <div className="w-56 shrink-0">
          <div className="bg-white border border-gray-200 rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Countries</span>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 520 }}>
              {['Critical', 'High', 'Medium', 'Low'].map(level => {
                const group = filtered.filter(([, c]) => c.risk === level)
                if (!group.length) return null
                const s = RISK_STYLE[level]
                return (
                  <div key={level}>
                    <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${s.bg} ${s.text}`}>
                      {level} ({group.length})
                    </div>
                    {group.map(([name]) => (
                      <button key={name}
                        onClick={() => {
                          setHighlighted(name)
                          navigate(`/country-risk?country=${encodeURIComponent(name)}`)
                        }}
                        className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-50 text-sm transition-colors
                          ${highlighted === name ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        <div className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: RISK_STYLE[level].fillColor }} />
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
