/**
 * src/pages/MovementIntel.jsx
 *
 * Operational Movement Intelligence — full-screen Africa map with:
 * - Lime green city dots for every mapped African location
 * - Traffic corridor lines coloured by congestion
 * - Floating top bar (AO filter, layer toggles, Plan Route CTA)
 * - Route Planner as a centered dropdown panel
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  Navigation, MapPin, Route, ChevronDown,
  RefreshCw, X, AlertTriangle, Clock, Search,
  LocateFixed, ArrowRight, TrendingUp, Info,
  Heart, Shield, Flame, Layers,
} from 'lucide-react'
import Layout from '../components/Layout'
import LocationAutocomplete from '../components/LocationAutocomplete'
import { MAP_STYLES } from '../lib/mapConfig'
import { supabase } from '../lib/supabase'

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
const CONG_ORDER = { standstill: 0, heavy: 1, moderate: 2, low: 3, free: 4, unknown: 5 }

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

// ── African city dots (lon, lat for MapLibre) ─────────────────────────────────
// All cities covered by our CITY_COORDS lookup, Africa-only
const AF = [
  // West Africa
  ['Lagos',           3.3792,  6.5244], ['Abuja',          7.3986,  9.0765],
  ['Kano',            8.5920, 12.0022], ['Port Harcourt',  7.0498,  4.8156],
  ['Kaduna',          7.4380, 10.5264], ['Ibadan',         3.9470,  7.3775],
  ['Benin City',      5.6037,  6.3350], ['Enugu',          7.5464,  6.4584],
  ['Warri',           5.7500,  5.5167], ['Aba',            7.3664,  5.1066],
  ['Maiduguri',      13.1520, 11.8311], ['Jos',            8.8583,  9.8965],
  ['Ilorin',          4.5500,  8.5000], ['Akure',          5.2058,  7.2571],
  ['Abidjan',        -4.0083,  5.3600], ['Yamoussoukro',  -5.2893,  6.8276],
  ['Accra',          -0.1870,  5.6037], ['Kumasi',        -1.6244,  6.6884],
  ['Tamale',         -0.8424,  9.4035], ['Lomé',           1.2123,  6.1375],
  ['Cotonou',         2.4183,  6.3654], ['Porto-Novo',     2.6289,  6.4969],
  ['Conakry',       -13.6773,  9.5370], ['Freetown',     -13.2344,  8.4830],
  ['Monrovia',      -10.7605,  6.2907], ['Bissau',       -15.5977, 11.8636],
  ['Dakar',         -17.4677, 14.7167], ['Ziguinchor',   -16.2719, 12.5607],
  ['Banjul',        -16.5790, 13.4549], ['Bamako',        -8.0029, 12.6392],
  ['Gao',            -0.0503, 16.2666], ['Mopti',         -4.1975, 14.4943],
  ['Timbuktu',       -3.0026, 16.7666], ['Ségou',         -6.2676, 13.4317],
  ['Ouagadougou',    -1.5197, 12.3714], ['Bobo-Dioulasso',-4.2979, 11.1771],
  ['Ouahigouya',     -2.4284, 13.5731], ['Niamey',         2.1098, 13.5137],
  ['Zinder',          8.9895, 13.8070], ['Agadez',         7.9992, 16.9742],
  ['Maradi',          7.1000, 13.5000], ['Tahoua',         5.2642, 14.8892],
  ['Nouakchott',    -15.9582, 18.0735],
  // Central Africa
  ['Yaoundé',        11.5021,  3.8480], ['Douala',         9.7679,  4.0511],
  ['Bamenda',         9.7085,  5.9597], ['Garoua',        13.3942,  9.3017],
  ['Maroua',         14.3241, 10.5956], ["N'Djamena",     15.0557, 12.1348],
  ['Sarh',           18.3910,  9.1445], ['Moundou',       16.0833,  8.5667],
  ['Bangui',         18.5550,  4.3612], ['Libreville',     9.4544,  0.3901],
  ['Port-Gentil',     8.7815, -0.7193], ['Brazzaville',   15.2712, -4.2694],
  ['Pointe-Noire',   11.8659, -4.7692], ['Kinshasa',      15.2663, -4.4419],
  ['Goma',           29.2278, -1.6796], ['Lubumbashi',    27.4794,-11.6609],
  ['Bukavu',         28.8608, -2.5083], ['Beni',          29.4739,  0.4907],
  ['Butembo',        29.2897,  0.1439], ['Kisangani',     25.1906,  0.5167],
  ['Mbuji-Mayi',     23.6000, -6.1500], ['Kolwezi',       25.4667,-10.7167],
  ['Matadi',         13.4500, -5.8167], ['Malabo',         8.7833,  3.7500],
  ['São Tomé',        6.7273,  0.3365],
  // East Africa
  ['Nairobi',        36.8219, -1.2921], ['Mombasa',       39.6682, -4.0435],
  ['Kisumu',         34.7617, -0.1022], ['Nakuru',        36.0800, -0.3031],
  ['Eldoret',        35.2698,  0.5143], ['Garissa',       39.6401, -0.4536],
  ['Addis Ababa',    40.4897,  9.1450], ['Dire Dawa',     41.8661,  9.5930],
  ['Mekelle',        39.4753, 13.4967], ['Gondar',        37.4667, 12.6000],
  ['Bahir Dar',      37.3614, 11.5742], ['Hawassa',       38.4761,  7.0621],
  ['Jimma',          36.8347,  7.6767], ['Jijiga',        42.7833,  9.3500],
  ['Khartoum',       32.5599, 15.5007], ['Omdurman',      32.4881, 15.6452],
  ['Port Sudan',     37.2164, 19.6158], ['El Fasher',     25.3511, 13.6279],
  ['Kassala',        36.4000, 15.4500], ['Nyala',         24.8816, 12.0490],
  ['El Geneina',     22.4500, 13.4500], ['Wau',           28.0000,  7.7000],
  ['Juba',           31.5825,  4.8517], ['Malakal',       31.6583,  9.5333],
  ['Asmara',         38.9317, 15.3381], ['Massawa',       39.4499, 15.6092],
  ['Djibouti City',  43.1456, 11.5720], ['Kampala',       32.5825,  0.3476],
  ['Entebbe',        32.4637,  0.0512], ['Gulu',          32.2990,  2.7749],
  ['Jinja',          33.2000,  0.4500], ['Mbarara',       30.6500, -0.6167],
  ['Lira',           32.8998,  2.2492], ['Kigali',        30.0619, -1.9441],
  ['Gisenyi',        29.2561, -1.7003], ['Bujumbura',     29.3619, -3.3869],
  ['Gitega',         29.9306, -3.4264], ['Dar es Salaam', 39.2083, -6.7924],
  ['Dodoma',         35.7516, -6.1630], ['Arusha',        36.6830, -3.3869],
  ['Zanzibar',       39.2026, -6.1659], ['Mwanza',        32.9000, -2.5167],
  ['Tanga',          39.0988, -5.0686], ['Mbeya',         33.4500, -8.9000],
  ['Mogadishu',      45.3182,  2.0469], ['Hargeisa',      44.0650,  9.5607],
  ['Kismayo',        42.5454, -0.3582], ['Bosasso',       49.1833, 11.2750],
  ['Garowe',         48.4845,  8.4054],
  // Southern Africa
  ['Johannesburg',   28.0473,-26.2041], ['Cape Town',     18.4241,-33.9249],
  ['Pretoria',       28.2293,-25.7479], ['Durban',        31.0218,-29.8587],
  ['Port Elizabeth', 25.5936,-33.9608], ['Bloemfontein',  26.2140,-29.1186],
  ['East London',    27.9116,-33.0153], ['Nelspruit',     30.9703,-25.4745],
  ['Polokwane',      29.4688,-23.9045], ['Pietermaritzburg',30.3794,-29.6006],
  ['Rustenburg',     27.2500,-25.6667], ['Kimberley',     24.7499,-28.7282],
  ['Maputo',         32.5732,-25.9692], ['Beira',         34.8389,-19.8437],
  ['Nampula',        39.2666,-15.1165], ['Pemba',         40.5176,-12.9716],
  ['Quelimane',      36.8883,-17.8787], ['Tete',          33.5867,-16.1564],
  ['Harare',         31.0335,-17.8252], ['Bulawayo',      28.5833,-20.1500],
  ['Mutare',         32.6709,-18.9707], ['Lusaka',        28.2833,-15.4167],
  ['Ndola',          28.6366,-12.9587], ['Kitwe',         28.2132,-12.8024],
  ['Livingstone',    25.8500,-17.8667], ['Lilongwe',      33.7873,-13.9669],
  ['Blantyre',       35.0058,-15.7861], ['Mzuzu',         34.0167,-11.4667],
  ['Gaborone',       25.9231,-24.6282], ['Francistown',   27.5167,-21.1667],
  ['Windhoek',       17.0832,-22.5597], ['Walvis Bay',    14.5053,-22.9575],
  ['Maseru',         27.4833,-29.3167], ['Mbabane',       31.1333,-26.3167],
  ['Manzini',        31.3667,-26.4833], ['Antananarivo',  47.5361,-18.9137],
  ['Toamasina',      49.4023,-18.1492], ['Fianarantsoa',  47.0856,-21.4531],
  ['Luanda',         13.2894, -8.8390], ['Huambo',        15.7390,-12.7756],
  ['Lobito',         13.5494,-12.3560], ['Lubango',       13.5000,-14.9167],
  ['Moroni',         43.2551,-11.7022], ['Port Louis',    57.4977,-20.1609],
  // North Africa
  ['Cairo',          31.2357, 30.0444], ['Alexandria',    29.9187, 31.2001],
  ['Sharm el-Sheikh',34.3300, 27.9158], ['Luxor',         32.6396, 25.6872],
  ['Aswan',          32.8998, 24.0889], ['Port Said',     32.3019, 31.2653],
  ['Suez',           32.5263, 29.9737], ['Tripoli',       13.1913, 32.8872],
  ['Benghazi',       20.0868, 32.1194], ['Misrata',       15.0925, 32.3754],
  ['Sirte',          16.5887, 31.2089], ['Sabha',         14.4290, 27.0374],
  ['Tunis',          10.1658, 36.8190], ['Sfax',          10.7600, 34.7400],
  ['Sousse',         10.6333, 35.8333], ['Algiers',        3.0588, 36.7538],
  ['Oran',           -0.6331, 35.6969], ['Constantine',    6.6147, 36.3650],
  ['Annaba',          7.7667, 36.9000], ['Casablanca',    -7.5898, 33.5731],
  ['Rabat',          -6.8326, 34.0133], ['Marrakech',     -7.9811, 31.6295],
  ['Fes',            -5.0078, 34.0181], ['Tangier',       -5.8340, 35.7595],
  ['Agadir',         -9.5981, 30.4278],
]

// Build GeoJSON for city dot layer
const AFRICA_CITIES_FC = {
  type: 'FeatureCollection',
  features: AF.map(([name, lon, lat]) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { name },
  })),
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MovementIntel() {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const markersRef   = useRef({ origin: null, dest: null })

  const [mapReady,         setMapReady]         = useState(false)
  const [corridors,        setCorridors]        = useState([])
  const [snapshots,        setSnapshots]        = useState([])
  const [loading,          setLoading]          = useState(true)
  const [aoList,           setAoList]           = useState(['All'])
  const [activeAO,         setActiveAO]         = useState('All')
  const [aoOpen,           setAoOpen]           = useState(false)
  const [showCorridors,    setShowCorridors]    = useState(true)
  const [geoStatus,        setGeoStatus]        = useState('idle')
  const userLocationRef = useRef(null)

  const [routePlannerOpen, setRoutePlannerOpen] = useState(false)
  const [routeOrigin,      setRouteOrigin]      = useState('')
  const [routeDest,        setRouteDest]        = useState('')
  const [routeResult,      setRouteResult]      = useState(null)
  const [routeLoading,     setRouteLoading]     = useState(false)
  const [routeError,       setRouteError]       = useState(null)

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
        max-width: 220px;
      }
      .maplibregl-popup-close-button { color: #6E7480; font-size: 16px; }
      .maplibregl-popup-tip { display: none !important; }
      .maplibregl-ctrl-bottom-right { bottom: 28px !important; }
    `
    document.head.appendChild(style)

    map.on('load', () => {
      const empty = { type: 'FeatureCollection', features: [] }

      // ── Sources ────────────────────────────────────────────────────────────
      map.addSource('africa-cities',   { type: 'geojson', data: AFRICA_CITIES_FC })
      map.addSource('corridors',       { type: 'geojson', data: empty })
      map.addSource('route-alt',       { type: 'geojson', data: empty })
      map.addSource('route-primary',   { type: 'geojson', data: empty })
      map.addSource('route-segments',  { type: 'geojson', data: empty })

      // ── Africa city dot halo ───────────────────────────────────────────────
      map.addLayer({
        id: 'city-halo', type: 'circle', source: 'africa-cities',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 5, 5, 9, 8, 14],
          'circle-color': '#AACC00',
          'circle-opacity': 0.08,
          'circle-blur': 1,
        },
      })

      // ── Africa city dots ──────────────────────────────────────────────────
      map.addLayer({
        id: 'city-dot', type: 'circle', source: 'africa-cities',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 2, 5, 3, 8, 4.5],
          'circle-color': '#AACC00',
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 4, 0.8, 7, 0.95],
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 2, 0, 5, 1],
          'circle-stroke-color': 'rgba(170,204,0,0.4)',
        },
      })

      // ── City label (visible at higher zoom) ───────────────────────────────
      map.addLayer({
        id: 'city-label', type: 'symbol', source: 'africa-cities',
        minzoom: 6,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular'],
          'text-size': 10,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: {
          'text-color': 'rgba(170,204,0,0.75)',
          'text-halo-color': 'rgba(0,0,0,0.6)',
          'text-halo-width': 1,
        },
      })

      // ── Corridor glow ──────────────────────────────────────────────────────
      map.addLayer({
        id: 'corridors-glow', type: 'line', source: 'corridors',
        paint: { 'line-color': ['get', 'color'], 'line-width': 10, 'line-opacity': 0.15, 'line-blur': 5 },
      })

      // ── Corridor lines ─────────────────────────────────────────────────────
      map.addLayer({
        id: 'corridors-line', type: 'line', source: 'corridors',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2, 8, 4, 12, 6],
          'line-opacity': 0.9,
        },
      })

      // ── Alternate route ────────────────────────────────────────────────────
      map.addLayer({
        id: 'route-alt-line', type: 'line', source: 'route-alt',
        paint: { 'line-color': '#64748b', 'line-width': 2, 'line-dasharray': [5, 4], 'line-opacity': 0.6 },
      })

      // ── Primary route glow ─────────────────────────────────────────────────
      map.addLayer({
        id: 'route-primary-glow', type: 'line', source: 'route-primary',
        paint: { 'line-color': '#3b82f6', 'line-width': 14, 'line-opacity': 0.18, 'line-blur': 8 },
      })

      // ── Primary route ──────────────────────────────────────────────────────
      map.addLayer({
        id: 'route-primary-line', type: 'line', source: 'route-primary',
        paint: {
          'line-color': '#3b82f6',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 5, 12, 7],
          'line-opacity': 0.95,
        },
      })

      // ── Risk-coloured route segments ───────────────────────────────────────
      map.addLayer({
        id: 'route-segments-line', type: 'line', source: 'route-segments',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 5, 12, 7],
          'line-opacity': 0.97,
        },
      })

      // ── Corridor click popup ───────────────────────────────────────────────
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
              ${p.travelMins ? `<div style="margin-top:6px;font-size:11px">Travel: ~<b>${p.travelMins}m</b></div>` : ''}
              ${p.delayMins > 0 ? `<div style="font-size:11px;color:#f87171">Delay: +${p.delayMins}m</div>` : ''}
            </div>
          `)
          .addTo(map)
      })

      // ── City dot click popup ───────────────────────────────────────────────
      map.on('click', 'city-dot', (e) => {
        const name = e.features?.[0]?.properties?.name
        if (!name) return
        const coords = e.features[0].geometry.coordinates
        new maplibregl.Popup({ closeButton: false, offset: 8 })
          .setLngLat(coords)
          .setHTML(`<div style="font-size:12px;font-weight:600;color:#AACC00">${name}</div>`)
          .addTo(map)
      })

      map.on('mouseenter', 'corridors-line', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'corridors-line', () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'city-dot', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'city-dot', () => { map.getCanvas().style.cursor = '' })

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
    const vis = showCorridors ? 'visible' : 'none'
    map.setLayoutProperty('corridors-line', 'visibility', vis)
    map.setLayoutProperty('corridors-glow', 'visibility', vis)
  }, [mapReady, corridors, snapshots, activeAO, showCorridors])

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

  const alertCount = corridors.filter(c => {
    const snap = snapshots.find(s => s.corridor_id === c.id)
    return ['heavy','standstill'].includes(snap?.congestion_level)
  }).length

  return (
    <Layout>
      <div className="relative -mx-4 lg:-mx-7" style={{ height: 'calc(100vh - 56px)' }}>

        {/* ── Map ───────────────────────────────────────────────────────────── */}
        <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 0 }} />

        {/* ── Top bar ───────────────────────────────────────────────────────── */}
        <div
          className="absolute z-20"
          style={{ top: 14, left: 14, right: 14, pointerEvents: 'none' }}
        >
          <div
            className="flex items-center gap-2 px-4 h-11 rounded-[12px]"
            style={{
              background: 'rgba(9,10,12,0.90)',
              border: '1px solid rgba(255,255,255,0.09)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 4px 32px rgba(0,0,0,0.5)',
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

            {/* Corridor toggle */}
            <button
              onClick={() => setShowCorridors(v => !v)}
              title="Toggle corridors"
              className={`p-1.5 rounded-lg transition-colors ${showCorridors ? 'text-[#AACC00] bg-[#AACC00]/12' : 'text-white/30 hover:bg-white/8'}`}
            >
              <Route size={13} />
            </button>

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

            {/* City dot count */}
            <span className="text-[10px] text-white/20 ml-1">{AF.length} cities mapped</span>

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

        {/* ── Route Planner panel ───────────────────────────────────────────── */}
        {routePlannerOpen && (
          <div
            className="absolute z-20"
            style={{
              top: 72,
              left: 14,
              width: 'min(480px, calc(100vw - 28px))',
            }}
          >
            <div
              className="rounded-[14px] overflow-hidden"
              style={{
                background: 'rgba(9,10,12,0.97)',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 12px 48px rgba(0,0,0,0.7)',
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
                        color: routeResult.exposure?.color || '#AACC00',
                        border: `1px solid ${routeResult.exposure?.color || '#AACC00'}35`,
                      }}
                    >
                      {routeResult.exposure?.status || 'Active'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setRoutePlannerOpen(false)}
                  className="text-white/35 hover:text-white/70 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Input row */}
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-center gap-2">
                  {/* Origin */}
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

                  {/* Arrow */}
                  <div className="mt-4 shrink-0">
                    <ArrowRight size={14} className="text-white/20" />
                  </div>

                  {/* Destination */}
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

                  {/* Plan button */}
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

              {/* ── Route Result (scrollable) ─────────────────────────────── */}
              {routeResult && !routeError && (
                <div
                  className="overflow-y-auto"
                  style={{ maxHeight: 'calc(100vh - 260px)', scrollbarWidth: 'none', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="p-4 space-y-3">

                    {/* Route header */}
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

                    {/* Transit times */}
                    <div className="rounded-[10px] p-3"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="text-[8px] font-bold text-white/25 uppercase tracking-wider mb-2.5">Transit Time</div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-[8px] text-white/35 mb-1">Current</div>
                          <div className="text-[17px] font-bold text-white leading-none">
                            {fmtMins(routeResult.here?.travel) || '—'}
                          </div>
                          <div className="text-[8px] text-white/25 mt-1">live traffic</div>
                        </div>
                        <div>
                          <div className="text-[8px] text-white/35 mb-1">Yesterday</div>
                          <div className="text-[17px] font-bold text-white/55 leading-none">
                            {fmtMins(routeResult.timeEstimates?.yesterday) || '—'}
                          </div>
                          <div className="text-[8px] text-white/25 mt-1">same time</div>
                        </div>
                        <div>
                          <div className="text-[8px] text-white/35 mb-1">No Traffic</div>
                          <div className="text-[17px] font-bold leading-none" style={{ color: '#4ade80' }}>
                            {fmtMins(routeResult.timeEstimates?.freeFlow ?? routeResult.here?.freeFlow) || '—'}
                          </div>
                          <div className="text-[8px] text-white/25 mt-1">free-flow</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2.5 pt-2"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center gap-1.5 text-[9px]">
                          <TrendingUp size={9} className={routeResult.here?.delay > 0 ? 'text-red-400' : 'text-green-400'} />
                          <span className={routeResult.here?.delay > 0 ? 'text-red-400' : 'text-green-400'}>
                            {routeResult.here?.delay > 0
                              ? `+${Math.round(routeResult.here.delay / 60)}m delay`
                              : 'No delay'}
                          </span>
                        </div>
                        <LevelBadge level={routeResult.consensus} small />
                      </div>
                    </div>

                    {/* Exposure + Corridor Status + Peak */}
                    {(routeResult.exposure || routeResult.safeCorridor || routeResult.peakWindow) && (
                      <div className="rounded-[10px] p-3 space-y-2"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        {routeResult.exposure && (
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-white/30 uppercase tracking-wider font-semibold">Exposure Level</span>
                            <span className="text-[11px] font-bold" style={{ color: routeResult.exposure.color }}>
                              {routeResult.exposure.status}
                            </span>
                          </div>
                        )}
                        {routeResult.safeCorridor && (
                          <div className="flex items-center justify-between pt-1.5"
                            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <span className="text-[9px] text-white/30 uppercase tracking-wider font-semibold">Corridor Status</span>
                            <span className="text-[11px] font-bold" style={{ color: routeResult.safeCorridor.color }}>
                              {routeResult.safeCorridor.label}
                            </span>
                          </div>
                        )}
                        {routeResult.peakWindow && (
                          <div className="flex items-center justify-between pt-1.5"
                            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <span className="text-[9px] text-white/30 uppercase tracking-wider font-semibold">Peak Window</span>
                            <span className="text-[9px] text-white/50">{routeResult.peakWindow}</span>
                          </div>
                        )}
                        {routeResult.timeEstimates?.peak && (
                          <div className="flex items-center justify-between pt-1.5"
                            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <span className="text-[9px] text-white/30 uppercase tracking-wider font-semibold">Rush Hour ETA</span>
                            <span className="text-[11px] font-bold text-red-400">{fmtMins(routeResult.timeEstimates.peak)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Operational Alerts */}
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
                              <div key={i} className="rounded-[7px] px-2.5 py-2"
                                style={{ background: bg, border: `1px solid ${bd}` }}>
                                <div className="text-[10px] font-medium leading-snug" style={{ color: tx }}>
                                  {a.raw_title || a.title}
                                </div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {a.proximityLabel && a.proximityLabel !== 'In Country' && (
                                    <span className="text-[8px] text-white/35 font-semibold uppercase tracking-wide">{a.proximityLabel}</span>
                                  )}
                                  {a.distKm != null && (
                                    <span className="text-[8px] text-white/25">{a.distKm} km</span>
                                  )}
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

                    {/* Emergency Support */}
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
                              <div key={i} className="flex items-center gap-2 py-1"
                                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <Icon size={9} style={{ color }} className="shrink-0" />
                                <span className="text-[10px] text-white/55 truncate flex-1">{s.name || label}</span>
                                <span className="text-[8px] shrink-0" style={{ color: `${color}88` }}>{label}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Nearest corridor */}
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

                    {/* Best travel windows */}
                    {routeResult.recommendations?.best?.length > 0 && (
                      <div>
                        <div className="text-[8px] font-bold text-white/20 uppercase tracking-wider mb-1.5">Best Travel Windows</div>
                        {routeResult.recommendations.best.slice(0, 3).map((b, i) => (
                          <div key={i} className="flex items-center justify-between py-1"
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <span className="text-[9px] text-white/40">{b.day} {b.hourLabel}</span>
                            <div className="flex items-center gap-2">
                              {b.avgTravelSecs && (
                                <span className="text-[9px] text-white/30">{Math.round(b.avgTravelSecs / 60)}m</span>
                              )}
                              <LevelBadge level={b.level} small />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Alternates + Google */}
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
            bottom: 14,
            left: 14,
            background: 'rgba(9,10,12,0.82)',
            border: '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(10px)',
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

        {/* ── City dot legend (bottom right of legend area) ─────────────────── */}
        <div
          className="absolute z-10 flex items-center gap-1.5 px-3 py-2 rounded-[8px]"
          style={{
            bottom: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(9,10,12,0.82)',
            border: '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#AACC00', boxShadow: '0 0 4px #AACC00' }} />
          <span className="text-[8px] text-white/35">{AF.length} mapped cities · click to query</span>
        </div>

      </div>
    </Layout>
  )
}
