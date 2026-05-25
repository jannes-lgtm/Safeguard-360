/**
 * GSOC Global Watch Board
 * Dark operational dashboard for security operations centre staff.
 * Map: risk heatmap (same circles as CountryRiskReport) + live asset/SOS markers.
 * Panels: SOS, incidents, escalations, assets, tasks, threat feed, live news.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertOctagon, Siren, Shield, MapPin, Activity, CheckSquare,
  Radio, Users, Clock, ChevronRight, RefreshCw, Zap, Globe,
  TriangleAlert, TrendingUp, Plus, Newspaper,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getFeedsByCategory } from '../../services/intelligenceService'
import { RISK_MAP, buildRiskGeoJSON } from '../../lib/riskData'
import { timeAgo } from '../../lib/dateUtils'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const DARK_MAP  = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
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

function Empty({ label }) {
  return <div className="flex items-center justify-center h-20 text-white/20 text-xs">{label}</div>
}

// ── Panel sub-components ──────────────────────────────────────────────────────
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
                <p className="text-[11px] text-white/50 truncate">
                  {e.location_label || (e.latitude ? `${e.latitude?.toFixed(4)}, ${e.longitude?.toFixed(4)}` : 'Location unknown')}
                </p>
                {e.message && <p className="text-[11px] text-red-300 mt-0.5 line-clamp-2">"{e.message}"</p>}
              </div>
            </div>
            <span className="text-[10px] text-white/30 shrink-0 mt-0.5">{timeAgo(e.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

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
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
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

function ThreatFeedPanel({ items, loading }) {
  if (loading) return <Empty label="Fetching threat feed…" />
  if (!items.length) return <Empty label="No threat feed items" />
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} className="px-4 py-2.5 border-b border-white/5 last:border-0">
          <p className="text-[12px] text-white/80 leading-snug line-clamp-2">{item.title}</p>
          <p className="text-[10px] text-white/30 mt-0.5">{item.source} · {timeAgo(item.date)}</p>
        </div>
      ))}
    </div>
  )
}

function NewsFeedPanel({ items, loading }) {
  if (loading) return <Empty label="Fetching live news…" />
  if (!items.length) return <Empty label="No news items" />
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} className="px-4 py-2.5 border-b border-white/5 last:border-0">
          {item.url
            ? <a href={item.url} target="_blank" rel="noopener noreferrer"
                className="text-[12px] text-white/80 leading-snug line-clamp-2 hover:text-white transition-colors block">
                {item.title}
              </a>
            : <p className="text-[12px] text-white/80 leading-snug line-clamp-2">{item.title}</p>
          }
          <p className="text-[10px] text-white/30 mt-0.5">{item.source} · {timeAgo(item.date)}</p>
        </div>
      ))}
    </div>
  )
}

function TasksPanel({ tasks }) {
  if (!tasks.length) return <Empty label="No open tasks" />
  return (
    <div>
      {tasks.map(t => {
        const s = sev(t.priority)
        return (
          <div key={t.id} className="px-4 py-2.5 border-b border-white/5 last:border-0 flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
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
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
        </div>
      ))}
    </div>
  )
}

// ── Live Map: risk heatmap + asset/SOS markers ────────────────────────────────
function LiveMap({ locations, sosEvents }) {
  const mapRef  = useRef(null)
  const mapInst = useRef(null)
  const markersRef = useRef([])

  // Init map once
  useEffect(() => {
    if (!mapRef.current || mapInst.current) return

    const map = new maplibregl.Map({
      container: mapRef.current,
      style:     DARK_MAP,
      center:    [20, 5],
      zoom:      2.5,
      attributionControl: false,
    })
    mapInst.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      // ── Risk heatmap circles (same style as CountryRiskReport) ──────────────
      map.addSource('risk-countries', { type: 'geojson', data: buildRiskGeoJSON() })

      map.addLayer({
        id: 'risk-circles',
        type: 'circle',
        source: 'risk-countries',
        paint: {
          'circle-radius':        ['match', ['get', 'risk'], 'Critical', 18, 'High', 14, 'Medium', 11, 8],
          'circle-color':         ['match', ['get', 'risk'], 'Critical', '#dc2626', 'High', '#ea580c', 'Medium', '#eab308', '#22c55e'],
          'circle-opacity':       0.65,
          'circle-stroke-width':  1.5,
          'circle-stroke-color':  ['match', ['get', 'risk'], 'Critical', '#b91c1c', 'High', '#c2410c', 'Medium', '#ca8a04', '#16a34a'],
          'circle-stroke-opacity': 0.9,
        },
      })

      // Country popup on click
      map.on('click', 'risk-circles', (e) => {
        const { name, risk } = e.features[0].properties
        const colors = { Critical: '#dc2626', High: '#ea580c', Medium: '#eab308', Low: '#22c55e' }
        const color  = colors[risk] || '#6b7280'

        const el = document.createElement('div')
        el.style.cssText = 'font-family:sans-serif;padding:4px 0;min-width:150px'
        el.innerHTML = `
          <div style="font-weight:700;font-size:13px;color:#fff;margin-bottom:5px">${name}</div>
          <div style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${color};color:${risk === 'Medium' ? '#1f2937' : '#fff'}">${risk} Risk</div>
        `

        new maplibregl.Popup({ closeButton: true, maxWidth: '200px',
          className: 'gsoc-popup' })
          .setLngLat(e.features[0].geometry.coordinates.slice())
          .setDOMContent(el)
          .addTo(map)
      })

      map.on('mouseenter', 'risk-circles', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'risk-circles', () => { map.getCanvas().style.cursor = '' })
    })

    return () => { map.remove(); mapInst.current = null }
  }, [])

  // Update asset/SOS markers whenever data changes
  useEffect(() => {
    const map = mapInst.current
    if (!map) return

    // Clear previous markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    const addMarker = (lat, lng, color, title, pulse = false) => {
      if (!lat || !lng) return
      const el = document.createElement('div')
      el.className = 'gsoc-marker'
      el.style.cssText = `width:12px;height:12px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.7);cursor:pointer;z-index:10;${pulse ? 'animation:gsoc-pulse 1.5s infinite;' : ''}`
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(new maplibregl.Popup({ offset: 10, closeButton: false }).setHTML(
          `<div style="font-size:11px;color:#fff;background:#1f2937;padding:6px 10px;border-radius:6px">${title}</div>`
        ))
        .addTo(map)
      markersRef.current.push(marker)
    }

    locations.forEach(l => {
      if (l.latitude && l.longitude)
        addMarker(l.latitude, l.longitude, '#AACC00', l.profiles?.full_name || 'Asset')
    })
    sosEvents.forEach(e => {
      if (e.latitude && e.longitude)
        addMarker(e.latitude, e.longitude, '#ef4444', `SOS: ${e.profiles?.full_name || 'Unknown'}`, true)
    })
  }, [locations, sosEvents])

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden">
      <div ref={mapRef} className="w-full h-full" />
      <style>{`
        @keyframes gsoc-pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.7)}70%{box-shadow:0 0 0 8px rgba(239,68,68,0)}}
        .gsoc-popup .maplibregl-popup-content{background:#111827!important;border:1px solid rgba(255,255,255,0.1);padding:8px 12px}
        .gsoc-popup .maplibregl-popup-tip{border-top-color:#111827!important}
      `}</style>
      <div className="absolute bottom-2 left-2 flex items-center gap-3 text-[10px] text-white/60 bg-black/70 px-2.5 py-1.5 rounded-lg backdrop-blur-sm">
        <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full bg-red-600 border border-red-400 inline-block" />Critical</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-500 border border-orange-400 inline-block" />High</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 border border-yellow-400 inline-block" />Medium</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Low</span>
        <span className="w-px h-3 bg-white/20" />
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#AACC00] inline-block" />Asset</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />SOS</span>
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
  const [shiftLog,     setShiftLog]     = useState(null)
  const [lastRefresh,  setLastRefresh]  = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [rtStatus,     setRtStatus]     = useState('connecting') // connecting | live | error

  const [threatFeed,   setThreatFeed]   = useState([])
  const [newsFeed,     setNewsFeed]     = useState([])
  const [feedsLoading, setFeedsLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const cutoff    = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const locCutoff = new Date(Date.now() - 2  * 60 * 60 * 1000).toISOString()

    const [sosRes, incRes, escRes, taskRes, locRes, shiftRes] = await Promise.allSettled([
      supabase.from('sos_events')
        .select('*, profiles(full_name, email)')
        .eq('status', 'active')
        .order('created_at', { ascending: false }).limit(20),

      supabase.from('incidents')
        .select('id,title,severity,status,country,location,created_at,incident_type')
        .in('status', ['Open', 'Under Review'])
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false }).limit(20),

      supabase.from('gsoc_escalations')
        .select('*')
        .in('status', ['open', 'acknowledged', 'in_progress'])
        .order('created_at', { ascending: false }).limit(20),

      supabase.from('gsoc_tasks')
        .select('*, gsoc_projects(name)')
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false }).limit(15),

      supabase.from('staff_locations')
        .select('*, profiles(full_name)')
        .eq('is_sharing', true)
        .gte('recorded_at', locCutoff)
        .order('recorded_at', { ascending: false }).limit(50),

      supabase.from('gsoc_shift_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle(),
    ])

    if (sosRes.status   === 'fulfilled') setSosEvents(sosRes.value?.data   || [])
    if (incRes.status   === 'fulfilled') setIncidents(incRes.value?.data   || [])
    if (escRes.status   === 'fulfilled') setEscalations(escRes.value?.data || [])
    if (taskRes.status  === 'fulfilled') setTasks(taskRes.value?.data      || [])
    if (locRes.status   === 'fulfilled') setLocations(locRes.value?.data   || [])
    if (shiftRes.status === 'fulfilled') setShiftLog(shiftRes.value?.data  || null)
    setLastRefresh(new Date())
    setLoading(false)
  }, [])

  const fetchFeeds = useCallback(async () => {
    setFeedsLoading(true)
    try {
      const [secRes, newsRes] = await Promise.allSettled([
        getFeedsByCategory('security', 12),
        getFeedsByCategory('conflict', 10),
      ])

      if (secRes.status === 'fulfilled') {
        const d = secRes.value
        setThreatFeed((d.articles || []).map(a => ({
          title:  a.title,
          source: a.source || d.feed?.name || '',
          date:   a.date,
          url:    a.url,
        })))
      }

      if (newsRes.status === 'fulfilled') {
        const d = newsRes.value
        setNewsFeed((d.articles || []).map(a => ({
          title:  a.title,
          source: a.source || d.feed?.name || '',
          date:   a.date,
          url:    a.url,
        })))
      }
    } catch { /* feed unavailable */ }
    setFeedsLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    fetchFeeds()

    // ── Polling fallback (keeps data fresh if Realtime connection drops) ──────
    const interval     = setInterval(fetchAll, REFRESH_MS)
    const feedInterval = setInterval(fetchFeeds, 5 * 60 * 1000)

    // ── Supabase Realtime — instant push on any operational change ─────────────
    // Fires fetchAll immediately when rows change in any watched table.
    // Keeps 30s poll as belt-and-suspenders fallback.
    const channel = supabase
      .channel('gsoc-realtime-v1')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_events' },        fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' },          fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gsoc_escalations' },   fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gsoc_tasks' },         fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_locations' },    fetchAll)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRtStatus('live')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRtStatus('error')
        else setRtStatus('connecting')
      })

    return () => {
      clearInterval(interval)
      clearInterval(feedInterval)
      supabase.removeChannel(channel)
    }
  }, [fetchAll, fetchFeeds])

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
          <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: '#AACC00' }}>
            <Globe size={14} style={{ color: '#0118A1' }} />
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-wide">GSOC</p>
            <p className="text-[10px] text-white/30 uppercase tracking-widest">Global Security Operations Centre</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <LiveClock />
          <button onClick={() => { fetchAll(); fetchFeeds() }}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
            title="Refresh">
            <RefreshCw size={14} />
          </button>
          {/* Realtime connection status */}
          <span className="hidden sm:flex items-center gap-1.5 text-[10px]">
            <span className={`w-1.5 h-1.5 rounded-full ${
              rtStatus === 'live'       ? 'bg-emerald-400 animate-pulse' :
              rtStatus === 'error'      ? 'bg-red-500' :
                                          'bg-yellow-500 animate-pulse'
            }`} />
            <span className={
              rtStatus === 'live'  ? 'text-emerald-400 font-semibold' :
              rtStatus === 'error' ? 'text-red-400' :
                                     'text-white/30'
            }>
              {rtStatus === 'live' ? 'LIVE' : rtStatus === 'error' ? 'OFFLINE' : 'CONNECTING'}
            </span>
          </span>
          {lastRefresh && (
            <span className="text-[10px] text-white/20 hidden sm:block">Updated {timeAgo(lastRefresh)}</span>
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
        <KPI icon={AlertOctagon} label="Active SOS"     value={sosCount}   color="#ef4444" pulse={sosCount > 0} />
        <KPI icon={Siren}        label="Open Incidents" value={incCount}   color="#f97316" />
        <KPI icon={TrendingUp}   label="Escalations"    value={escCount}   color="#f59e0b" pulse={escCount > 0} />
        <KPI icon={Users}        label="Assets Online"  value={assetCount} color="#10b981" />
        <KPI icon={CheckSquare}  label="Open Tasks"     value={taskCount}  color="#60a5fa" />
      </div>

      {/* ── Main grid ── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 px-6 pb-6 min-h-0">

        {/* Left: Map (2 cols) + Incidents + Escalations */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Panel title="Global Risk & Live Operations Map" icon={MapPin} iconColor="#10b981"
            className="flex-1 min-h-64"
            action={
              <span className="text-[10px] text-white/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {assetCount} assets online
              </span>
            }>
            <div className="h-80 lg:h-full p-2">
              <LiveMap locations={locations} sosEvents={sosEvents} />
            </div>
          </Panel>

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
                <button onClick={async () => {
                  const title = prompt('Escalation title:')
                  if (!title) return
                  const s = prompt('Severity (critical/high/medium/low):', 'high')
                  await supabase.from('gsoc_escalations').insert({
                    title, severity: s || 'high', source_type: 'manual', status: 'open',
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

          <Panel title="SOS Activations" icon={AlertOctagon} iconColor="#ef4444"
            className="max-h-48"
            action={sosCount > 0 ? (
              <span className="text-[10px] font-bold text-red-400 animate-pulse">{sosCount} ACTIVE</span>
            ) : null}>
            <SOSPanel events={sosEvents} />
          </Panel>

          <Panel title="Active Assets" icon={Users} iconColor="#10b981" className="max-h-44">
            <AssetsPanel locations={locations} />
          </Panel>

          <Panel title="Open Tasks" icon={CheckSquare} iconColor="#60a5fa"
            className="max-h-44"
            action={
              <Link to="/gsoc/projects" className="text-[10px] text-white/30 hover:text-white/60 flex items-center gap-1">
                Manage <ChevronRight size={10} />
              </Link>
            }>
            <TasksPanel tasks={tasks} />
          </Panel>

          {/* Threat Feed — security category */}
          <Panel title="Threat Intelligence Feed" icon={Radio} iconColor="#a78bfa" className="max-h-52">
            <ThreatFeedPanel items={threatFeed} loading={feedsLoading && !threatFeed.length} />
          </Panel>

          {/* Live News — conflict category */}
          <Panel title="Live News & Conflict" icon={Newspaper} iconColor="#38bdf8" className="flex-1 min-h-40">
            <NewsFeedPanel items={newsFeed} loading={feedsLoading && !newsFeed.length} />
          </Panel>

          {/* Last shift summary */}
          {shiftLog && (
            <div className="rounded-xl border border-white/8 px-4 py-3"
              style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock size={10} /> Last Shift
                </span>
                <Link to="/gsoc/shift-log" className="text-[10px] text-white/30 hover:text-white/60">View all</Link>
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
