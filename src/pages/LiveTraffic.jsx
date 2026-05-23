import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  Car, Navigation, ArrowRight, ArrowLeftRight, Search,
  RefreshCw, AlertTriangle, Clock, Zap, Loader2,
  TrendingUp, CheckCircle2, Star, ThumbsDown, BarChart2,
  ChevronRight, X,
} from 'lucide-react'
import Layout from '../components/Layout'
import LocationAutocomplete from '../components/LocationAutocomplete'
import { supabase } from '../lib/supabase'
import { MAP_STYLES } from '../lib/mapConfig'
import { BRAND_BLUE } from '../lib/colors'

// ── Congestion colours ────────────────────────────────────────────────────────
const CONGESTION = {
  free:       { label: 'Free Flow',  color: '#22c55e', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-emerald-400', pct: 5   },
  low:        { label: 'Low',        color: '#eab308', badge: 'bg-yellow-50 text-yellow-700 border-yellow-200',    bar: 'bg-yellow-400',  pct: 25  },
  moderate:   { label: 'Moderate',   color: '#f97316', badge: 'bg-orange-50 text-orange-700 border-orange-200',    bar: 'bg-orange-400',  pct: 55  },
  heavy:      { label: 'Heavy',      color: '#dc2626', badge: 'bg-red-50 text-red-700 border-red-200',             bar: 'bg-red-500',     pct: 80  },
  standstill: { label: 'Standstill', color: '#7f1d1d', badge: 'bg-red-100 text-red-900 border-red-300',            bar: 'bg-red-900',     pct: 100 },
  unknown:    { label: 'No Data',    color: '#3f3f46', badge: 'bg-gray-100 text-gray-500 border-gray-200',         bar: 'bg-gray-400',    pct: 0   },
}

function fmtMins(secs) {
  if (!secs) return '—'
  const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function CongestionBadge({ level }) {
  const cs = CONGESTION[level] || CONGESTION.unknown
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${cs.badge}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cs.color }} />
      {cs.label}
    </span>
  )
}

// ── Build GeoJSON from corridors + snapshots ──────────────────────────────────
function buildCorridorGeoJSON(corridors, snapshots) {
  const features = corridors
    .filter(c => c.origin_lat && c.origin_lon && c.dest_lat && c.dest_lon)
    .map(c => {
      const snap  = snapshots[c.id]
      const level = snap?.congestion_level || 'unknown'
      const cs    = CONGESTION[level] || CONGESTION.unknown
      return {
        type: 'Feature',
        properties: {
          id:           c.id,
          name:         c.name,
          country:      c.country,
          distance_km:  c.distance_km,
          origin_name:  c.origin_name,
          dest_name:    c.dest_name,
          level,
          color:        cs.color,
          label:        cs.label,
          travel_time:  fmtMins(snap?.travel_time_secs),
          free_flow:    fmtMins(snap?.free_flow_secs),
          delay_mins:   snap?.delay_secs ? Math.round(snap.delay_secs / 60) : 0,
          jam_factor:   snap?.here_jam_factor ?? null,
          captured_at:  snap?.captured_at ?? null,
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [c.origin_lon, c.origin_lat],
            [c.dest_lon,   c.dest_lat],
          ],
        },
      }
    })
  return { type: 'FeatureCollection', features }
}

// ── Corridor detail panel ─────────────────────────────────────────────────────
function CorridorPanel({ corridor, onClose }) {
  if (!corridor) return null
  const cs = CONGESTION[corridor.level] || CONGESTION.unknown
  return (
    <div className="absolute top-[72px] right-4 w-[320px] z-20 rounded-xl overflow-hidden shadow-2xl"
      style={{ background: 'rgba(9,10,12,0.95)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <span className="text-white font-semibold text-sm">{corridor.name}</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400 text-xs flex items-center gap-1">
            <Navigation size={10} />{corridor.origin_name} → {corridor.dest_name}
          </span>
          <CongestionBadge level={corridor.level} />
        </div>
        {corridor.distance_km && (
          <p className="text-zinc-500 text-[11px]">{corridor.distance_km} km · {corridor.country}</p>
        )}
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${cs.pct}%`, background: cs.color }} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Travel',    value: corridor.travel_time },
            { label: 'Free Flow', value: corridor.free_flow },
            { label: 'Delay',     value: corridor.delay_mins > 0 ? `+${corridor.delay_mins}m` : '—' },
          ].map(s => (
            <div key={s.label} className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="text-[9px] text-zinc-500 uppercase tracking-wide mb-0.5">{s.label}</div>
              <div className="text-xs font-bold text-white">{s.value}</div>
            </div>
          ))}
        </div>
        {corridor.captured_at && (
          <p className="text-[10px] text-zinc-600 text-right">
            Updated {new Date(corridor.captured_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Corridor list panel ───────────────────────────────────────────────────────
function CorridorListPanel({ corridors, snapshots, onSelect, lastRun, ingesting, onIngest }) {
  const [filter, setFilter] = useState('All')
  const countries = ['All', ...new Set(corridors.map(c => c.country).filter(Boolean).sort())]
  const visible   = filter === 'All' ? corridors : corridors.filter(c => c.country === filter)

  return (
    <div className="absolute top-[72px] left-4 w-[300px] z-20 rounded-xl overflow-hidden shadow-2xl flex flex-col"
      style={{ background: 'rgba(9,10,12,0.95)', border: '1px solid rgba(255,255,255,0.08)', maxHeight: 'calc(100vh - 110px)' }}>

      {/* Header */}
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between shrink-0">
        <div>
          <span className="text-white font-semibold text-sm">Live Corridors</span>
          {lastRun && (
            <p className="text-zinc-500 text-[10px] mt-0.5">
              Updated {new Date(lastRun).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button onClick={onIngest} disabled={ingesting}
          className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.06)', color: ingesting ? '#52525B' : '#AACC00' }}
          title="Refresh">
          <RefreshCw size={12} className={ingesting ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Country filter */}
      <div className="px-3 py-2 flex gap-1.5 flex-wrap shrink-0 border-b border-white/5">
        {countries.slice(0, 8).map(c => (
          <button key={c} onClick={() => setFilter(c)}
            className="px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors"
            style={{
              background: filter === c ? '#AACC00' : 'rgba(255,255,255,0.06)',
              color:      filter === c ? '#09090B' : '#A1A1AA',
            }}>
            {c}
          </button>
        ))}
      </div>

      {/* Corridor rows */}
      <div className="overflow-y-auto flex-1">
        {visible.map(corridor => {
          const snap  = snapshots[corridor.id]
          const level = snap?.congestion_level || 'unknown'
          const cs    = CONGESTION[level] || CONGESTION.unknown
          const delay = snap?.delay_secs ? Math.round(snap.delay_secs / 60) : 0
          return (
            <button key={corridor.id} onClick={() => onSelect(corridor)}
              className="w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white text-xs font-semibold truncate pr-2">{corridor.name}</span>
                <span className="text-[10px] font-bold shrink-0" style={{ color: cs.color }}>{cs.label}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 text-[10px]">{corridor.origin_name} → {corridor.dest_name}</span>
                {delay > 0 && <span className="text-orange-400 text-[10px]">+{delay}m</span>}
              </div>
              <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full" style={{ width: `${cs.pct}%`, background: cs.color }} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LiveTraffic() {
  const mapRef       = useRef(null)
  const mapInstance  = useRef(null)
  const popupRef     = useRef(null)

  const [corridors,   setCorridors]   = useState([])
  const [snapshots,   setSnapshots]   = useState({})
  const [loading,     setLoading]     = useState(true)
  const [ingesting,   setIngesting]   = useState(false)
  const [lastRun,     setLastRun]     = useState(null)
  const [selected,    setSelected]    = useState(null)
  const [showList,    setShowList]    = useState(true)
  const [mapReady,    setMapReady]    = useState(false)
  const [counts,      setCounts]      = useState({ free: 0, degraded: 0, heavy: 0 })

  // ── Load data ────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: cors } = await supabase
      .from('traffic_corridors')
      .select('id,name,country,region,origin_name,dest_name,distance_km,origin_lat,origin_lon,dest_lat,dest_lon')
      .eq('is_active', true)
      .order('country')

    const { data: snaps } = await supabase
      .from('traffic_snapshots')
      .select('*')
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

    // Count by congestion band
    const vals = Object.values(latest)
    setCounts({
      free:     vals.filter(s => s.congestion_level === 'free' || s.congestion_level === 'low').length,
      degraded: vals.filter(s => s.congestion_level === 'moderate').length,
      heavy:    vals.filter(s => s.congestion_level === 'heavy' || s.congestion_level === 'standstill').length,
    })

    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Init map ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    const map = new maplibregl.Map({
      container: mapRef.current,
      style:     MAP_STYLES.operational,
      center:    [20, 2],
      zoom:      3.5,
      minZoom:   2,
      maxZoom:   16,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.on('load', () => { mapInstance.current = map; setMapReady(true) })
    return () => { map.remove(); mapInstance.current = null }
  }, [])

  // ── Update corridor layers when data or map is ready ─────────────────────────
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !mapReady || corridors.length === 0) return

    const geojson = buildCorridorGeoJSON(corridors, snapshots)

    if (map.getSource('corridors')) {
      map.getSource('corridors').setData(geojson)
    } else {
      map.addSource('corridors', { type: 'geojson', data: geojson })

      // Glow layer
      map.addLayer({
        id:     'corridors-glow',
        type:   'line',
        source: 'corridors',
        paint: {
          'line-color':   ['get', 'color'],
          'line-width':   8,
          'line-opacity': 0.18,
          'line-blur':    4,
        },
      })

      // Main line
      map.addLayer({
        id:     'corridors-line',
        type:   'line',
        source: 'corridors',
        paint: {
          'line-color':   ['get', 'color'],
          'line-width':   3,
          'line-opacity': 0.9,
        },
      })

      // Origin dots
      map.addSource('corridor-dots', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: corridors
            .filter(c => c.origin_lat && c.origin_lon)
            .map(c => {
              const snap  = snapshots[c.id]
              const level = snap?.congestion_level || 'unknown'
              return {
                type: 'Feature',
                properties: { color: (CONGESTION[level] || CONGESTION.unknown).color, id: c.id },
                geometry: { type: 'Point', coordinates: [c.origin_lon, c.origin_lat] },
              }
            }),
        },
      })

      map.addLayer({
        id:     'corridor-dots',
        type:   'circle',
        source: 'corridor-dots',
        paint: {
          'circle-radius':       5,
          'circle-color':        ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#09090B',
          'circle-opacity':      0.9,
        },
      })

      // Click handler
      map.on('click', 'corridors-line', (e) => {
        const props = e.features?.[0]?.properties
        if (!props) return
        setSelected(props)
        setShowList(false)
      })

      map.on('mouseenter', 'corridors-line', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'corridors-line', () => { map.getCanvas().style.cursor = '' })
    }
  }, [corridors, snapshots, mapReady])

  async function triggerIngest() {
    setIngesting(true)
    try { await fetch('/api/traffic-ingest', { method: 'POST' }) } catch { /* ignore */ }
    await loadData()
    setIngesting(false)
  }

  function handleSelectCorridor(corridor) {
    const snap  = snapshots[corridor.id]
    const level = snap?.congestion_level || 'unknown'
    const cs    = CONGESTION[level] || CONGESTION.unknown
    setSelected({
      ...corridor,
      level,
      color:       cs.color,
      label:       cs.label,
      travel_time: fmtMins(snap?.travel_time_secs),
      free_flow:   fmtMins(snap?.free_flow_secs),
      delay_mins:  snap?.delay_secs ? Math.round(snap.delay_secs / 60) : 0,
      captured_at: snap?.captured_at ?? null,
    })
    setShowList(false)

    // Fly to corridor
    const map = mapInstance.current
    if (map && corridor.origin_lat && corridor.dest_lat) {
      map.flyTo({
        center: [
          (corridor.origin_lon + corridor.dest_lon) / 2,
          (corridor.origin_lat + corridor.dest_lat) / 2,
        ],
        zoom: 6,
        duration: 1000,
      })
    }
  }

  return (
    <Layout fullWidth noPadding>
      <div className="relative w-full h-[calc(100vh-0px)] overflow-hidden" style={{ background: '#09090B' }}>

        {/* Map */}
        <div ref={mapRef} className="absolute inset-0" />

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between gap-3 px-4 py-3"
          style={{ background: 'rgba(9,10,12,0.90)', borderBottom: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)' }}>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Car size={16} color="#AACC00" />
              <span className="text-white font-bold text-sm tracking-tight">Live Traffic Intelligence</span>
            </div>
            <span className="text-zinc-600 text-xs hidden sm:block">HERE · Google · OSM · 30-min cycle</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Congestion counts */}
            {!loading && (
              <div className="hidden sm:flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-zinc-400">{counts.free} free</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-400" /><span className="text-zinc-400">{counts.degraded} moderate</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500" /><span className="text-zinc-400">{counts.heavy} heavy</span>
                </span>
              </div>
            )}

            {lastRun && (
              <span className="text-zinc-500 text-[10px] hidden md:block">
                Updated {new Date(lastRun).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}

            <button onClick={() => { setShowList(v => !v); setSelected(null) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: showList ? '#AACC00' : 'rgba(255,255,255,0.08)', color: showList ? '#09090B' : '#A1A1AA' }}>
              <TrendingUp size={12} />
              Corridors
            </button>

            <button onClick={triggerIngest} disabled={ingesting}
              className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#A1A1AA' }}>
              <RefreshCw size={13} className={ingesting ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center" style={{ background: 'rgba(9,10,12,0.7)' }}>
            <div className="flex items-center gap-3 text-white">
              <Loader2 size={18} className="animate-spin text-[#AACC00]" />
              <span className="text-sm">Loading corridor data…</span>
            </div>
          </div>
        )}

        {/* Corridor list panel */}
        {showList && !loading && (
          <CorridorListPanel
            corridors={corridors}
            snapshots={snapshots}
            onSelect={handleSelectCorridor}
            lastRun={lastRun}
            ingesting={ingesting}
            onIngest={triggerIngest}
          />
        )}

        {/* Selected corridor detail */}
        {selected && (
          <CorridorPanel corridor={selected} onClose={() => { setSelected(null); setShowList(true) }} />
        )}

        {/* Legend */}
        <div className="absolute bottom-8 left-4 z-10 flex flex-col gap-1.5 px-3 py-2.5 rounded-xl"
          style={{ background: 'rgba(9,10,12,0.85)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="text-zinc-500 text-[9px] uppercase tracking-widest mb-0.5">Congestion</span>
          {[
            { label: 'Free Flow',  color: '#22c55e' },
            { label: 'Low',        color: '#eab308' },
            { label: 'Moderate',   color: '#f97316' },
            { label: 'Heavy',      color: '#dc2626' },
            { label: 'Standstill', color: '#7f1d1d' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-4 h-0.5 rounded-full" style={{ background: color }} />
              <span className="text-zinc-400 text-[10px]">{label}</span>
            </div>
          ))}
        </div>

        {/* Corridor count */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full text-[10px] text-zinc-500"
          style={{ background: 'rgba(9,10,12,0.85)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {corridors.length} monitored corridors · 30-min refresh
        </div>

      </div>
    </Layout>
  )
}
