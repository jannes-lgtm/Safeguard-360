import { useEffect, useState } from 'react'
import {
  Car, Navigation, ArrowRight, ArrowLeftRight, Search,
  RefreshCw, AlertTriangle, Clock, Zap, MapPin, Loader2,
  TrendingUp, CheckCircle2,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { BRAND_BLUE } from '../lib/colors'

// ── Shared helpers ────────────────────────────────────────────────────────────
const CONGESTION_STYLE = {
  free:       { label: 'Free Flow',  dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-emerald-400', pct: 5   },
  low:        { label: 'Low',        dot: 'bg-yellow-400',  badge: 'bg-yellow-50 text-yellow-700 border-yellow-200',    bar: 'bg-yellow-400',  pct: 25  },
  moderate:   { label: 'Moderate',   dot: 'bg-orange-400',  badge: 'bg-orange-50 text-orange-700 border-orange-200',    bar: 'bg-orange-400',  pct: 55  },
  heavy:      { label: 'Heavy',      dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700 border-red-200',             bar: 'bg-red-500',     pct: 80  },
  standstill: { label: 'Standstill', dot: 'bg-red-900',     badge: 'bg-red-100 text-red-900 border-red-300',            bar: 'bg-red-900',     pct: 100 },
}

function fmtMins(secs) {
  if (!secs) return '—'
  const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function CongestionBadge({ level }) {
  const cs = CONGESTION_STYLE[level] || CONGESTION_STYLE.free
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${cs.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cs.dot}`} />
      {cs.label}
    </span>
  )
}

// ── Tab 1: Live Corridors ─────────────────────────────────────────────────────
function LiveCorridorsTab() {
  const [corridors,  setCorridors]  = useState([])
  const [snapshots,  setSnapshots]  = useState({})
  const [loading,    setLoading]    = useState(true)
  const [ingesting,  setIngesting]  = useState(false)
  const [lastRun,    setLastRun]    = useState(null)
  const [filter,     setFilter]     = useState('All')

  async function loadData() {
    setLoading(true)
    const { data: cors } = await supabase
      .from('traffic_corridors')
      .select('id,name,country,region,origin_name,dest_name,distance_km')
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
    const newest = Object.values(latest).sort((a,b) => new Date(b.captured_at) - new Date(a.captured_at))[0]
    if (newest) setLastRun(newest.captured_at)
    setLoading(false)
  }

  async function triggerIngest() {
    setIngesting(true)
    try {
      await fetch('/api/traffic-ingest', { method: 'POST' })
      await loadData()
    } catch { /* ignore */ }
    setIngesting(false)
  }

  useEffect(() => { loadData() }, [])

  const countries = ['All', ...new Set(corridors.map(c => c.country).filter(Boolean).sort())]
  const visible   = filter === 'All' ? corridors : corridors.filter(c => c.country === filter)

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={20} className="animate-spin text-[#0118A1]" />
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="bg-white rounded-[10px] border border-gray-200 shadow-sm p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
          {lastRun && (
            <span className="flex items-center gap-1.5">
              <Clock size={11} /> Last ingest: {new Date(lastRun).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
            </span>
          )}
          <span className="text-gray-300">·</span>
          <span>{corridors.length} active corridors</span>
        </div>
        <button onClick={triggerIngest} disabled={ingesting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] border border-gray-200 text-xs font-medium text-gray-600 hover:border-[#0118A1] hover:text-[#0118A1] transition-colors disabled:opacity-50">
          {ingesting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {ingesting ? 'Running…' : 'Run Ingest Now'}
        </button>
      </div>

      {/* Country filter */}
      <div className="flex gap-2 flex-wrap">
        {countries.map(c => (
          <button key={c} onClick={() => setFilter(c)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
              ${filter === c ? 'bg-[#0118A1] text-white border-[#0118A1]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            {c}
          </button>
        ))}
      </div>

      {/* Corridor cards */}
      {visible.length === 0 ? (
        <div className="bg-white rounded-[10px] border border-gray-200 p-10 text-center">
          <Car size={24} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No active corridors.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {visible.map(corridor => {
            const snap  = snapshots[corridor.id]
            const cs    = CONGESTION_STYLE[snap?.congestion_level] || CONGESTION_STYLE.free
            const delay = snap?.delay_secs ? Math.round(snap.delay_secs / 60) : 0
            const hereInc = (snap?.incidents || []).filter(i => i.source === 'here')
            const osmInc  = (snap?.incidents || []).filter(i => i.source === 'osm')

            return (
              <div key={corridor.id} className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{corridor.name}</span>
                      <span className="text-[10px] text-gray-400">{corridor.country}</span>
                      {corridor.distance_km && <span className="text-[10px] text-gray-300">{corridor.distance_km} km</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                      <Navigation size={9} />{corridor.origin_name} → {corridor.dest_name}
                    </p>
                  </div>
                  {snap
                    ? <CongestionBadge level={snap.congestion_level} />
                    : <span className="text-[11px] text-gray-300 border border-gray-100 px-2.5 py-1 rounded-full">No data</span>}
                </div>

                {snap && (
                  <>
                    <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
                      <div className={`h-full rounded-full ${cs.bar}`} style={{ width: `${cs.pct}%` }} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                      {[
                        { label: 'Travel Time', value: fmtMins(snap.travel_time_secs) },
                        { label: 'Free Flow',   value: fmtMins(snap.free_flow_secs) },
                        { label: 'Delay',       value: delay > 0 ? `+${delay}m` : '—', highlight: delay > 15 ? 'text-red-600' : delay > 5 ? 'text-orange-500' : '' },
                        { label: 'HERE Jam',    value: snap.here_jam_factor != null ? `${snap.here_jam_factor}/10` : '—' },
                      ].map(s => (
                        <div key={s.label} className="bg-gray-50 rounded-[6px] px-2.5 py-1.5">
                          <div className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">{s.label}</div>
                          <div className={`text-xs font-bold text-gray-800 ${s.highlight || ''}`}>{s.value}</div>
                        </div>
                      ))}
                    </div>

                    {snap.google_travel_secs && (
                      <div className="flex items-center gap-2 text-[11px] text-gray-500 bg-blue-50/50 border border-blue-100 rounded-[6px] px-2.5 py-1.5 mb-3">
                        <Zap size={10} className="text-blue-400 shrink-0" />
                        <span>Google: {fmtMins(snap.google_travel_secs)}</span>
                        {snap.google_delay_secs > 0 && <span className="text-orange-500">+{Math.round(snap.google_delay_secs/60)}m</span>}
                        {snap.google_congestion_level && <CongestionBadge level={snap.google_congestion_level} />}
                      </div>
                    )}

                    {snap.incident_count > 0 && (
                      <div className="space-y-1">
                        {[...hereInc.slice(0,2), ...osmInc.slice(0,1)].map((inc, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px] text-gray-600 bg-red-50/40 border border-red-100 rounded-[6px] px-2.5 py-1.5">
                            <AlertTriangle size={10} className="text-red-400 shrink-0 mt-0.5" />
                            <span className="truncate">{inc.description || inc.type}</span>
                            {inc.delay_mins && <span className="text-red-500 shrink-0">+{inc.delay_mins}m</span>}
                            <span className="text-[9px] text-gray-300 shrink-0 uppercase">{inc.source}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-2.5">
                      <div className="flex gap-1">
                        {[
                          { label: 'HERE', ok: snap.tomtom_ok },
                          { label: 'Flow', ok: snap.here_ok },
                          { label: 'Google', ok: snap.google_ok },
                          { label: 'OSM', ok: snap.osm_ok },
                        ].map(s => (
                          <span key={s.label} className={`text-[9px] px-1.5 py-0.5 rounded border
                            ${s.ok ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                            {s.label}
                          </span>
                        ))}
                      </div>
                      <span className="text-[10px] text-gray-300">
                        {snap.captured_at ? new Date(snap.captured_at).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) : ''}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Plan Route ─────────────────────────────────────────────────────────
function PlanRouteTab() {
  const [origin,  setOrigin]  = useState('')
  const [dest,    setDest]    = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState(null)

  function swap() {
    setOrigin(dest)
    setDest(origin)
    setResult(null)
  }

  async function lookup(e) {
    e.preventDefault()
    if (!origin.trim() || !dest.trim()) return
    setLoading(true); setResult(null); setError(null)
    try {
      const res  = await fetch(`/api/route-lookup?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lookup failed')
      setResult(data)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const cs = result ? (CONGESTION_STYLE[result.consensus] || CONGESTION_STYLE.free) : null

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Input form */}
      <div className="bg-white rounded-[10px] border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Enter departure and destination</h3>
        <form onSubmit={lookup} className="space-y-3">
          <div className="flex gap-2 items-center">
            <div className="flex-1 space-y-2">
              <div className="relative">
                <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0118A1]" />
                <input value={origin} onChange={e => setOrigin(e.target.value)}
                  placeholder="Origin — city or address"
                  className="w-full pl-8 pr-3 py-2.5 text-sm border border-gray-200 rounded-[8px] focus:outline-none focus:border-[#0118A1] placeholder:text-gray-300" />
              </div>
              <div className="relative">
                <Navigation size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={dest} onChange={e => setDest(e.target.value)}
                  placeholder="Destination — city or address"
                  className="w-full pl-8 pr-3 py-2.5 text-sm border border-gray-200 rounded-[8px] focus:outline-none focus:border-[#0118A1] placeholder:text-gray-300" />
              </div>
            </div>
            <button type="button" onClick={swap}
              className="p-2 rounded-[8px] border border-gray-200 text-gray-400 hover:text-[#0118A1] hover:border-[#0118A1] transition-colors shrink-0">
              <ArrowLeftRight size={14} />
            </button>
          </div>
          <button type="submit" disabled={loading || !origin.trim() || !dest.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[8px] text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: BRAND_BLUE }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? 'Looking up traffic…' : 'Check Traffic'}
          </button>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-[10px] p-4 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Results */}
      {result && cs && (
        <div className="space-y-3">
          {/* Route header */}
          <div className="bg-white rounded-[10px] border border-gray-200 shadow-sm p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 flex-wrap">
                  <span>{result.origin.city}</span>
                  <ArrowRight size={13} className="text-gray-400 shrink-0" />
                  <span>{result.destination.city}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-sm">{result.origin.label}</p>
                {result.distKm && <p className="text-[11px] text-gray-400">{result.distKm} km</p>}
              </div>
              <CongestionBadge level={result.consensus} />
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
              <div className={`h-full rounded-full ${cs.bar}`} style={{ width: `${cs.pct}%` }} />
            </div>
            <p className="text-[10px] text-gray-400">Consensus from HERE + Google</p>
          </div>

          {/* Source comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* HERE */}
            <div className={`bg-white rounded-[10px] border shadow-sm p-4 ${result.here.ok ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-700">HERE Routing</span>
                {result.here.ok
                  ? <CheckCircle2 size={13} className="text-emerald-500" />
                  : <span className="text-[10px] text-gray-400">Unavailable</span>}
              </div>
              {result.here.ok && (
                <div className="space-y-2">
                  {[
                    { label: 'Travel Time', value: fmtMins(result.here.travel) },
                    { label: 'Free Flow',   value: fmtMins(result.here.freeFlow) },
                    { label: 'Delay',       value: result.here.delay > 0 ? `+${Math.round(result.here.delay/60)}m` : 'None' },
                    { label: 'Congestion',  value: <CongestionBadge level={result.here.level} /> },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center">
                      <span className="text-[11px] text-gray-400">{row.label}</span>
                      <span className="text-xs font-semibold text-gray-800">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Google */}
            <div className={`bg-white rounded-[10px] border shadow-sm p-4 ${result.google.ok ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-700">Google Routes</span>
                {result.google.ok
                  ? <CheckCircle2 size={13} className="text-blue-500" />
                  : <span className="text-[10px] text-gray-400">Add GOOGLE_MAPS_API_KEY</span>}
              </div>
              {result.google.ok && (
                <div className="space-y-2">
                  {[
                    { label: 'Travel Time', value: fmtMins(result.google.travel) },
                    { label: 'Free Flow',   value: fmtMins(result.google.freeFlow) },
                    { label: 'Delay',       value: result.google.delay > 0 ? `+${Math.round(result.google.delay/60)}m` : 'None' },
                    { label: 'Congestion',  value: <CongestionBadge level={result.google.level} /> },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center">
                      <span className="text-[11px] text-gray-400">{row.label}</span>
                      <span className="text-xs font-semibold text-gray-800">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="text-[10px] text-gray-400 text-right">
            Generated {new Date(result.generatedAt).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'corridors', label: 'Live Corridors', icon: TrendingUp },
  { id: 'route',     label: 'Plan Route',     icon: Navigation },
]

export default function LiveTraffic() {
  const [tab, setTab] = useState('corridors')

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${BRAND_BLUE}18` }}>
            <Car size={20} color={BRAND_BLUE} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Live Traffic Intelligence</h1>
            <p className="text-xs text-gray-400 mt-0.5">HERE Routing · Google Routes · OSM Overpass · 30-min ingest cycle</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-[10px] p-1 w-fit">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-[8px] text-xs font-semibold transition-all
                ${tab === t.id ? 'bg-white text-[#0118A1] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'corridors' && <LiveCorridorsTab />}
        {tab === 'route'     && <PlanRouteTab />}
      </div>
    </Layout>
  )
}
