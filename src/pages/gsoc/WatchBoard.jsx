/**
 * GSOC Global Watch Board
 * Dark operational dashboard for security operations centre staff.
 * Reads from existing platform tables (sos_events, incidents, staff_locations,
 * alerts) plus new GSOC tables (gsoc_escalations, gsoc_tasks).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertOctagon, Siren, Shield, MapPin, Activity, CheckSquare,
  Radio, Users, Clock, ChevronRight, RefreshCw, Zap, Globe,
  TriangleAlert, TrendingUp, Layers, Plus, Eye,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const DARK_MAP = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const REFRESH_MS = 30_000

// ── Severity colours ──────────────────────────────────────────────────────────
const SEV = {
  critical: { bg: 'bg-red-500/20',    border: 'border-red-500/40',    text: 'text-red-400',    dot: '#ef4444' },
  high:     { bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-400', dot: '#f97316' },
  medium:   { bg: 'bg-amber-500/20',  border: 'border-amber-500/40',  text: 'text-amber-400',  dot: '#f59e0b' },
  low:      { bg: 'bg-blue-500/20',   border: 'border-blue-500/40',   text: 'text-blue-400',   dot: '#3b82f6' },
  normal:   { bg: 'bg-gray-500/20',   border: 'border-gray-600',      text: 'text-gray-400',   dot: '#6b7280' },
}

function sev(s) { return SEV[s?.toLowerCase()] || SEV.normal }

// ── Live clock ────────────────────────────────────────────────────────────────
function LiveClock() {
  const [t, setT] = useState(new Date())
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i) }, [])
  return (
    <span className="font-mono text-sm text-emerald-400 tabular-nums">
      {t.toUTCString().replace(' GMT', '')} UTC
    </span>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KPI({ icon: Icon, label, value, color, pulse }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/8"
      style={{ background: 'rgba(255,255,255,0.04)' }}>
      <div className="relative">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: color + '22' }}>
          <Icon size={16} style={{ color }} />
        </div>
        {pulse && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />}
      </div>
      <div>
        <p className="text-2xl font-bold text-white leading-none">{value}</p>
        <p className="text-[10px] text-white/40 mt-0.5 uppercase tracking-wide">{label}</p>
      </div>
    </div>
  )
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────
function Panel({ title, icon: Icon, iconColor = '#60a5fa', children, action, className = '' }) {
  return (
    <div className={`rounded-xl border border-white/8 flex flex-col overflow-hidden ${className}`}
      style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
        <div className="flex items-center gap-2">
          <Icon size={14} style={{ color: iconColor }} />
          <span className="text-xs font-bold text-white/80 uppercase tracking-widest">{title}</span>
        </div>
        {action}
      </div>
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {children}
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function Empty({ label }) {
  return (
    <div className="flex items-center justify-center h-20 text-white/20 text-xs">{label}</div>
  )
}

// ── Time ago ──────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return ''
  const s = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (s < 60)  return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// ── SOS Panel ─────────────────────────────────────────────────────────────────
function SOSPanel({ events }) {
  if (!events.length) return <Empty label="No active SOS — all clear" />
  return (
    <div>
      {events.map(e => (
        <div key={e.id} className="px-4 py-3 border-b border-white/5 last:border-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0 mt-1" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{e.profiles?.full_name || 'Unknown user'}</p>
                <p className="text-[11px] text-white/50 truncate">{e.location_label || (e.latitude ? `${e.latitude?.toFixed(4)}, ${e.longitude?.toFixed(4)}` : 'Location unknown')}</p>
                {e.message && <p className="text-[11px] text-red-300 mt-0.5 line-clamp-2">"{e.message}"</p>}
              </div>
            </div>
            <span className="text-[10px] text-white/30 shrink-0 mt-0.5">{timeAgo(e.created_at)}</span>
          </div>
          {e.trip_name && (
            <p className="text-[10px] text-white/30 mt-1 ml-4">Trip: {e.trip_name}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Incidents Panel ───────────────────────────────────────────────────────────
function IncidentsPanel({ incidents }) {
  if (!incidents.length) return <Empty label="No open incidents" />
  return (
    <div>
      {incidents.map(i => {
        const s = sev(i.severity)
        return (
          <div key={i.id} className="px-4 py-3 border-b border-white/5 last:border-0">
            <div className="flex items-start gap-2">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 mt-0.5 ${s.bg} ${s.text}`}>
                {i.severity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{i.title}</p>
                <p className="text-[11px] text-white/40">{i.country}{i.location ? ` · ${i.location}` : ''} · {timeAgo(i.created_at)}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Escalation Queue ──────────────────────────────────────────────────────────
function EscalationPanel({ escalations, onAck }) {
  if (!escalations.length) return <Empty label="Escalation queue clear" />
  return (
    <div>
      {escalations.map(e => {
        const s = sev(e.severity)
        return (
          <div key={e.id} className={`px-4 py-3 border-b border-white/5 last:border-0 ${s.bg}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0`} style={{ background: s.dot }} />
                  <p className="text-sm font-semibold text-white truncate">{e.title}</p>
                </div>
                <p className="text-[11px] text-white/40">{e.source_type} · {e.country || 'Global'} · {timeAgo(e.created_at)}</p>
              </div>
              {e.status === 'open' && (
                <button onClick={() => onAck(e.id)}
                  className="text-[10px] px-2 py-0.5 rounded border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 shrink-0 transition-colors">
                  ACK
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Threat Feed ───────────────────────────────────────────────────────────────
function ThreatFeedPanel({ items }) {
  if (!items.length) return <Empty label="Fetching threat feed…" />
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} className="px-4 py-2.5 border-b border-white/5 last:border-0">
          <p className="text-[12px] text-white/80 leading-snug line-clamp-2">{item.title}</p>
          <p className="text-[10px] text-white/30 mt-0.5">{item.source} · {timeAgo(item.pubDate)}</p>
        </div>
      ))}
    </div>
  )
}

// ── Tasks Panel ───────────────────────────────────────────────────────────────
function TasksPanel({ tasks }) {
  if (!tasks.length) return <Empty label="No open tasks" />
  return (
    <div>
      {tasks.map(t => {
        const s = sev(t.priority)
        return (
          <div key={t.id} className="px-4 py-2.5 border-b border-white/5 last:border-0 flex items-center gap-3">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0`} style={{ background: s.dot }} />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-white/80 truncate">{t.title}</p>
              <p className="text-[10px] text-white/30">{t.gsoc_projects?.name || 'General'} · {t.status}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Assets Panel ─────────────────────────────────────────────────────────────
function AssetsPanel({ locations }) {
  if (!locations.length) return <Empty label="No active location shares" />
  return (
    <div>
      {locations.map(l => (
        <div key={l.id} className="px-4 py-2.5 border-b border-white/5 last:border-0 flex items-center gap-3">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
            style={{ background: '#0118A1', color: '#AACC00' }}>
            {(l.profiles?.full_name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-white/80 truncate">{l.profiles?.full_name || 'Unknown'}</p>
            <p className="text-[10px] text-white/30 truncate">{l.arrival_city || l.location_label || 'Location unknown'} · {timeAgo(l.recorded_at)}</p>
          </div>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Sharing" />
        </div>
      ))}
    </div>
  )
}

// ── Live Map ─────────────────────────────────────────────────────────────────
function LiveMap({ locations, sosEvents }) {
  const mapRef  = useRef(null)
  const mapInst = useRef(null)

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return
    mapInst.current = new maplibregl.Map({
      container: mapRef.current,
      style:     DARK_MAP,
      center:    [20, 5],
      zoom:      2.5,
      attributionControl: false,
    })
    mapInst.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
  }, [])

  // Plot markers whenever data changes
  useEffect(() => {
    const map = mapInst.current
    if (!map) return

    // Remove previous markers
    document.querySelectorAll('.gsoc-marker').forEach(el => el.remove())

    const addMarker = (lat, lng, color, title, pulse = false) => {
      if (!lat || !lng) return
      const el = document.createElement('div')
      el.className = 'gsoc-marker'
      el.style.cssText = `width:12px;height:12px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.6);cursor:pointer;${pulse ? 'animation:gsoc-pulse 1.5s infinite;' : ''}`
      new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(new maplibregl.Popup({ offset: 10, closeButton: false }).setHTML(
          `<div style="font-size:11px;color:#fff;background:#1f2937;padding:6px 10px;border-radius:6px">${title}</div>`
        ))
        .addTo(map)
    }

    locations.forEach(l => {
      if (l.latitude && l.longitude) {
        addMarker(l.latitude, l.longitude, '#AACC00', l.profiles?.full_name || 'Asset')
      }
    })

    sosEvents.forEach(e => {
      if (e.latitude && e.longitude) {
        addMarker(e.latitude, e.longitude, '#ef4444', `SOS: ${e.profiles?.full_name || 'Unknown'}`, true)
      }
    })
  }, [locations, sosEvents])

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden">
      <div ref={mapRef} className="w-full h-full" />
      <style>{`@keyframes gsoc-pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.7)}70%{box-shadow:0 0 0 8px rgba(239,68,68,0)}}`}</style>
      <div className="absolute bottom-2 left-2 flex items-center gap-3 text-[10px] text-white/60 bg-black/60 px-2 py-1 rounded">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#AACC00] inline-block" />Asset</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />SOS</span>
      </div>
    </div>
  )
}

// ── Main Watch Board ──────────────────────────────────────────────────────────
export default function WatchBoard() {
  const [sosEvents,    setSosEvents]    = useState([])
  const [incidents,    setIncidents]    = useState([])
  const [escalations,  setEscalations]  = useState([])
  const [tasks,        setTasks]        = useState([])
  const [locations,    setLocations]    = useState([])
  const [threatFeed,   setThreatFeed]   = useState([])
  const [shiftLog,     setShiftLog]     = useState(null)
  const [lastRefresh,  setLastRefresh]  = useState(null)
  const [loading,      setLoading]      = useState(true)

  const fetchAll = useCallback(async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const locCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

    const [
      sosRes, incRes, escRes, taskRes, locRes, shiftRes,
    ] = await Promise.allSettled([
      supabase.from('sos_events')
        .select('*, profiles(full_name, email)')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20),

      supabase.from('incidents')
        .select('id,title,severity,status,country,location,created_at,incident_type')
        .in('status', ['Open', 'Under Review'])
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(20),

      supabase.from('gsoc_escalations')
        .select('*')
        .in('status', ['open', 'acknowledged', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(20),

      supabase.from('gsoc_tasks')
        .select('*, gsoc_projects(name)')
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(15),

      supabase.from('staff_locations')
        .select('*, profiles(full_name)')
        .eq('is_sharing', true)
        .gte('recorded_at', locCutoff)
        .order('recorded_at', { ascending: false })
        .limit(50),

      supabase.from('gsoc_shift_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (sosRes.status  === 'fulfilled') setSosEvents(sosRes.value?.data   || [])
    if (incRes.status  === 'fulfilled') setIncidents(incRes.value?.data   || [])
    if (escRes.status  === 'fulfilled') setEscalations(escRes.value?.data || [])
    if (taskRes.status === 'fulfilled') setTasks(taskRes.value?.data      || [])
    if (locRes.status  === 'fulfilled') setLocations(locRes.value?.data   || [])
    if (shiftRes.status=== 'fulfilled') setShiftLog(shiftRes.value?.data  || null)

    setLastRefresh(new Date())
    setLoading(false)
  }, [])

  // Fetch threat feed from API
  const fetchThreatFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/rss-ingest?category=security&limit=12')
      if (!res.ok) return
      const data = await res.json()
      const items = (data.articles || data.items || []).slice(0, 12).map(a => ({
        title:   a.title,
        source:  a.source || a.feed || '',
        pubDate: a.pubDate || a.published || a.date,
      }))
      setThreatFeed(items)
    } catch { /* feed unavailable */ }
  }, [])

  useEffect(() => {
    fetchAll()
    fetchThreatFeed()
    const interval = setInterval(fetchAll, REFRESH_MS)
    return () => clearInterval(interval)
  }, [fetchAll, fetchThreatFeed])

  const ackEscalation = async (id) => {
    await supabase.from('gsoc_escalations')
      .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() })
      .eq('id', id)
    setEscalations(prev => prev.map(e => e.id === id ? { ...e, status: 'acknowledged' } : e))
  }

  const sosCount   = sosEvents.length
  const incCount   = incidents.length
  const escCount   = escalations.filter(e => e.status === 'open').length
  const assetCount = locations.length
  const taskCount  = tasks.filter(t => t.status === 'open').length

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#080D1A', color: 'white' }}>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/8"
        style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded flex items-center justify-center"
            style={{ background: '#AACC00' }}>
            <Globe size={14} style={{ color: '#0118A1' }} />
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-wide">GSOC</p>
            <p className="text-[10px] text-white/30 uppercase tracking-widest">Global Security Operations Centre</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <LiveClock />
          <button onClick={fetchAll}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
            title="Refresh">
            <RefreshCw size={14} />
          </button>
          {lastRefresh && (
            <span className="text-[10px] text-white/20 hidden sm:block">
              Updated {timeAgo(lastRefresh)}
            </span>
          )}
          <Link to="/gsoc/projects"
            className="text-[11px] px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-all">
            Projects
          </Link>
          <Link to="/gsoc/shift-log"
            className="text-[11px] px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-all">
            Shift Log
          </Link>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 px-6 py-4">
        <KPI icon={AlertOctagon} label="Active SOS"       value={sosCount}   color="#ef4444" pulse={sosCount > 0} />
        <KPI icon={Siren}        label="Open Incidents"   value={incCount}   color="#f97316" />
        <KPI icon={TrendingUp}   label="Escalations"      value={escCount}   color="#f59e0b" pulse={escCount > 0} />
        <KPI icon={Users}        label="Assets Online"    value={assetCount} color="#10b981" />
        <KPI icon={CheckSquare}  label="Open Tasks"       value={taskCount}  color="#60a5fa" />
      </div>

      {/* ── Main grid ── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 px-6 pb-6 min-h-0">

        {/* Left: Map (spans 2 cols on large) */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Panel title="Live Operator Map" icon={MapPin} iconColor="#10b981"
            className="flex-1 min-h-64"
            action={
              <span className="text-[10px] text-white/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {assetCount} assets online
              </span>
            }>
            <div className="h-72 lg:h-full p-2">
              <LiveMap locations={locations} sosEvents={sosEvents} />
            </div>
          </Panel>

          {/* Bottom row: Incidents + Escalations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Panel title="Active Incidents" icon={Siren} iconColor="#f97316"
              className="max-h-56"
              action={
                <Link to="/incidents" className="text-[10px] text-white/30 hover:text-white/60 flex items-center gap-1 transition-colors">
                  All <ChevronRight size={10} />
                </Link>
              }>
              <IncidentsPanel incidents={incidents} />
            </Panel>

            <Panel title="Escalation Queue" icon={TriangleAlert} iconColor="#f59e0b"
              className="max-h-56"
              action={
                <button
                  onClick={async () => {
                    const title = prompt('Escalation title:')
                    if (!title) return
                    const sev = prompt('Severity (critical/high/medium/low):', 'high')
                    await supabase.from('gsoc_escalations').insert({
                      title, severity: sev || 'high', source_type: 'manual',
                      status: 'open',
                    })
                    fetchAll()
                  }}
                  className="text-[10px] text-white/30 hover:text-white/60 flex items-center gap-1 transition-colors">
                  <Plus size={10} /> New
                </button>
              }>
              <EscalationPanel escalations={escalations} onAck={ackEscalation} />
            </Panel>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">

          {/* SOS */}
          <Panel title="SOS Activations" icon={AlertOctagon} iconColor="#ef4444"
            className="max-h-52"
            action={sosCount > 0 ? (
              <span className="text-[10px] font-bold text-red-400 animate-pulse">{sosCount} ACTIVE</span>
            ) : null}>
            <SOSPanel events={sosEvents} />
          </Panel>

          {/* Assets */}
          <Panel title="Active Assets" icon={Users} iconColor="#10b981" className="max-h-48">
            <AssetsPanel locations={locations} />
          </Panel>

          {/* Open Tasks */}
          <Panel title="Open Tasks" icon={CheckSquare} iconColor="#60a5fa"
            className="max-h-48"
            action={
              <Link to="/gsoc/projects" className="text-[10px] text-white/30 hover:text-white/60 flex items-center gap-1">
                Manage <ChevronRight size={10} />
              </Link>
            }>
            <TasksPanel tasks={tasks} />
          </Panel>

          {/* Threat Feed */}
          <Panel title="Threat Feed" icon={Radio} iconColor="#a78bfa" className="flex-1 min-h-40">
            <ThreatFeedPanel items={threatFeed} />
          </Panel>

          {/* Shift log summary */}
          {shiftLog && (
            <div className="rounded-xl border border-white/8 px-4 py-3"
              style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock size={10} /> Last Shift
                </span>
                <Link to="/gsoc/shift-log" className="text-[10px] text-white/30 hover:text-white/60">
                  View all
                </Link>
              </div>
              <p className="text-[11px] text-white/70 line-clamp-3">{shiftLog.summary}</p>
              {shiftLog.open_items && (
                <p className="text-[10px] text-amber-400/80 mt-1">⚠ {shiftLog.open_items.split('\n')[0]}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="fixed inset-0 flex items-center justify-center bg-[#080D1A]/80 z-50">
          <div className="flex items-center gap-3 text-white/60">
            <div className="w-5 h-5 border-2 border-[#AACC00] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading watch board…</span>
          </div>
        </div>
      )}
    </div>
  )
}
