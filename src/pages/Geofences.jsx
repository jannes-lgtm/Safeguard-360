/**
 * Geofences — Alert Zone Management
 *
 * Org admins draw polygon alert zones on the map.
 * The geofence-check API (cron + on-demand) detects when travellers
 * enter or exit a zone and logs events + sends notifications.
 *
 * Run supabase-migration-geofences.sql before using.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  Plus, X, Trash2, Edit3, CheckCircle2, AlertTriangle,
  Users, Activity, Layers, Eye, EyeOff, RefreshCw,
  Pencil, Check, MapPin, Shield,
} from 'lucide-react'
import Layout from '../components/Layout'
import { MAP_STYLES } from '../lib/mapConfig'
import { supabase } from '../lib/supabase'
import { DS } from '../lib/ds'

// ── Constants ─────────────────────────────────────────────────────────────────

const SEV_COLOR = { Critical: '#c0392b', High: '#d35400', Medium: '#d4a017', Low: '#1e8449' }
const SEV_LIGHT = { Critical: '#FEF2F2', High: '#FFF7ED', Medium: '#FEFCE8', Low: '#F0FDF4' }
const SEV_TEXT  = { Critical: '#B91C1C', High: '#C2410C', Medium: '#A16207', Low: '#15803D' }
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low']

const EMPTY_FORM = { name: '', description: '', severity: 'High' }

// ── Point-in-polygon (ray casting) ───────────────────────────────────────────

function pointInPolygon([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

// ── Zone GeoJSON builders ─────────────────────────────────────────────────────

function zonesToFeatureCollection(zones) {
  return {
    type: 'FeatureCollection',
    features: zones.map(z => ({
      type: 'Feature',
      id: z.id,
      properties: { id: z.id, name: z.name, severity: z.severity, is_active: z.is_active },
      geometry: { type: 'Polygon', coordinates: [z.coordinates] },
    })),
  }
}

function previewFeatureCollection(points) {
  if (points.length < 2) return { type: 'FeatureCollection', features: [] }
  const ring = points.length >= 3 ? [...points, points[0]] : points
  const features = []
  if (points.length >= 3) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {},
    })
  }
  features.push({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: ring },
    properties: {},
  })
  features.push({
    type: 'Feature',
    geometry: { type: 'MultiPoint', coordinates: points },
    properties: {},
  })
  return { type: 'FeatureCollection', features }
}

// ── Severity pill ─────────────────────────────────────────────────────────────

function SevPill({ severity }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide"
      style={{ background: SEV_LIGHT[severity], color: SEV_TEXT[severity], border: `1px solid ${SEV_COLOR[severity]}40` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: SEV_COLOR[severity] }} />
      {severity}
    </span>
  )
}

// ── Zone form modal ───────────────────────────────────────────────────────────

function ZoneFormModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-gray-900">Name this zone</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Zone Name <span className="text-[#EF7474]">*</span>
            </label>
            <input autoFocus value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Conflict Buffer Zone — Northern Mali"
              className="w-full text-sm text-gray-800 placeholder-gray-300 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Severity</label>
            <div className="grid grid-cols-4 gap-1.5">
              {SEVERITIES.map(s => (
                <button key={s} type="button" onClick={() => set('severity', s)}
                  className="py-1.5 rounded-lg text-[10px] font-bold border transition-all"
                  style={form.severity === s
                    ? { background: SEV_LIGHT[s], color: SEV_TEXT[s], borderColor: SEV_COLOR[s] }
                    : { background: DS.bgAlt, color: '#94A3B8', borderColor: '#E2E8F0' }
                  }>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Why is this zone flagged? What should travellers be aware of?"
              rows={3}
              className="w-full text-sm text-gray-800 placeholder-gray-300 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none resize-none" />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={() => form.name.trim() && onSave(form)} disabled={!form.name.trim()}
            className="flex-1 py-2.5 text-sm font-bold rounded-xl transition-all disabled:opacity-40"
            style={{ background: DS.green, color: 'white' }}>
            Save Zone
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Geofences() {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)

  const [zones,       setZones]       = useState([])
  const [events,      setEvents]      = useState([])
  const [travellers,  setTravellers]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [profile,     setProfile]     = useState(null)

  // Draw state
  const [drawMode,    setDrawMode]    = useState(false)
  const [drawPoints,  setDrawPoints]  = useState([])
  const [showForm,    setShowForm]    = useState(false)
  const [editZone,    setEditZone]    = useState(null)   // zone being edited
  const [selectedZone,setSelectedZone]= useState(null)
  const [saving,      setSaving]      = useState(false)
  const [checking,    setChecking]    = useState(false)

  const drawPointsRef = useRef([])
  const drawModeRef   = useRef(false)

  // Keep refs in sync for map handlers
  useEffect(() => { drawPointsRef.current = drawPoints }, [drawPoints])
  useEffect(() => { drawModeRef.current = drawMode }, [drawMode])

  // ── Data loading ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(prof)

    const [{ data: zoneData }, { data: eventData }, { data: travData }] = await Promise.all([
      supabase.from('alert_zones').select('*').order('created_at', { ascending: false }),
      supabase.from('geofence_events').select('*').order('ts', { ascending: false }).limit(50),
      supabase.from('staff_locations').select('*').eq('is_sharing', true)
        .gte('recorded_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    ])

    setZones(zoneData || [])
    setEvents(eventData || [])
    setTravellers(travData || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Realtime subscriptions ──────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel('geofences-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_locations' }, ({ eventType, new: loc, old }) => {
        if (eventType === 'DELETE') {
          setTravellers(prev => prev.filter(t => t.id !== old.id))
        } else {
          setTravellers(prev => {
            const idx = prev.findIndex(t => t.user_id === loc.user_id)
            if (!loc.is_sharing) return prev.filter(t => t.user_id !== loc.user_id)
            if (idx >= 0) { const next = [...prev]; next[idx] = loc; return next }
            return [loc, ...prev]
          })
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'geofence_events' }, ({ new: ev }) => {
        setEvents(prev => [ev, ...prev].slice(0, 50))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alert_zones' }, () => {
        supabase.from('alert_zones').select('*').order('created_at', { ascending: false })
          .then(({ data }) => { if (data) setZones(data) })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── Who is inside each zone ─────────────────────────────────────────────────

  const occupants = useCallback((zone) => {
    return travellers.filter(t =>
      pointInPolygon([t.longitude, t.latitude], zone.coordinates)
    )
  }, [travellers])

  // ── Map init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLES.operational,
      center: [20, 5],
      zoom: 2.5,
    })
    mapRef.current = map

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right')

    const popupStyle = document.createElement('style')
    popupStyle.textContent = `
      .maplibregl-popup-content {
        background: #11131A; color: #EAEEF5;
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 10px; padding: 12px 14px;
        font-family: system-ui, sans-serif;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        min-width: 180px;
      }
      .maplibregl-popup-tip { display: none !important; }
      .maplibregl-popup-close-button { color: #6E7480; font-size: 16px; }
    `
    document.head.appendChild(popupStyle)

    map.on('load', () => {
      // ── Zone fills ──────────────────────────────────────────────────────────
      map.addSource('zones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, generateId: true })

      map.addLayer({
        id: 'zone-fill',
        type: 'fill',
        source: 'zones',
        filter: ['==', ['get', 'is_active'], true],
        paint: {
          'fill-color': ['match', ['get', 'severity'],
            'Critical', '#c0392b', 'High', '#d35400', 'Medium', '#d4a017', '#1e8449'],
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.35, 0.20],
        },
      })

      map.addLayer({
        id: 'zone-fill-inactive',
        type: 'fill',
        source: 'zones',
        filter: ['==', ['get', 'is_active'], false],
        paint: { 'fill-color': '#64748B', 'fill-opacity': 0.10 },
      })

      map.addLayer({
        id: 'zone-border',
        type: 'line',
        source: 'zones',
        paint: {
          'line-color': ['match', ['get', 'severity'],
            'Critical', '#c0392b', 'High', '#d35400', 'Medium', '#d4a017', '#1e8449'],
          'line-width': ['case', ['==', ['get', 'is_active'], true], 2, 1],
          'line-opacity': ['case', ['==', ['get', 'is_active'], true], 0.80, 0.30],
          'line-dasharray': ['case', ['==', ['get', 'is_active'], false], ['literal', [4, 4]], ['literal', [1]]],
        },
      })

      map.addLayer({
        id: 'zone-labels',
        type: 'symbol',
        source: 'zones',
        filter: ['==', ['get', 'is_active'], true],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Bold', 'Open Sans Regular'],
          'text-size': 11,
          'text-max-width': 8,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': 'rgba(255,255,255,0.90)',
          'text-halo-color': 'rgba(0,0,0,0.70)',
          'text-halo-width': 1.5,
        },
      })

      // ── Draw preview ────────────────────────────────────────────────────────
      map.addSource('draw-preview', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

      map.addLayer({
        id: 'draw-fill',
        type: 'fill',
        source: 'draw-preview',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#AACC00', 'fill-opacity': 0.15 },
      })
      map.addLayer({
        id: 'draw-line',
        type: 'line',
        source: 'draw-preview',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#AACC00', 'line-width': 2, 'line-dasharray': [3, 2] },
      })
      map.addLayer({
        id: 'draw-vertices',
        type: 'circle',
        source: 'draw-preview',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-color': '#AACC00', 'circle-radius': 5, 'circle-stroke-width': 2, 'circle-stroke-color': 'white' },
      })

      // ── Traveller dots ──────────────────────────────────────────────────────
      map.addSource('travellers', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'traveller-dots',
        type: 'circle',
        source: 'travellers',
        paint: {
          'circle-color': '#3B82F6',
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': 'white',
          'circle-opacity': 0.9,
        },
      })

      // ── Zone hover ──────────────────────────────────────────────────────────
      let hoveredId = null
      map.on('mousemove', 'zone-fill', (e) => {
        if (!drawModeRef.current && e.features?.length) {
          if (hoveredId !== null) map.setFeatureState({ source: 'zones', id: hoveredId }, { hover: false })
          hoveredId = e.features[0].id
          map.setFeatureState({ source: 'zones', id: hoveredId }, { hover: true })
          map.getCanvas().style.cursor = 'pointer'
        }
      })
      map.on('mouseleave', 'zone-fill', () => {
        if (hoveredId !== null) { map.setFeatureState({ source: 'zones', id: hoveredId }, { hover: false }); hoveredId = null }
        if (!drawModeRef.current) map.getCanvas().style.cursor = ''
      })

      // ── Zone click ──────────────────────────────────────────────────────────
      map.on('click', 'zone-fill', (e) => {
        if (drawModeRef.current) return
        const props = e.features[0].properties
        setSelectedZone(props.id)
      })

      // ── Traveller click ─────────────────────────────────────────────────────
      map.on('click', 'traveller-dots', (e) => {
        if (drawModeRef.current) return
        const p = e.features[0].properties
        new maplibregl.Popup({ closeButton: true })
          .setLngLat(e.features[0].geometry.coordinates)
          .setHTML(`<div style="font-weight:700;font-size:12px;margin-bottom:3px">${p.name}</div>
            <div style="font-size:10px;color:#6E7480">${p.trip || 'Location sharing active'}</div>`)
          .addTo(map)
      })

      // ── Draw click ──────────────────────────────────────────────────────────
      map.on('click', (e) => {
        if (!drawModeRef.current) return
        const pt = [e.lngLat.lng, e.lngLat.lat]
        const next = [...drawPointsRef.current, pt]
        drawPointsRef.current = next
        setDrawPoints(next)
        const src = map.getSource('draw-preview')
        if (src) src.setData(previewFeatureCollection(next))
      })
    })

    return () => { map.remove(); mapRef.current = null; popupStyle.remove() }
  }, [])

  // ── Sync zones to map ───────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    const src = map.getSource('zones')
    if (src) src.setData(zonesToFeatureCollection(zones))
  }, [zones])

  // ── Sync travellers to map ──────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    const src = map.getSource('travellers')
    if (src) src.setData({
      type: 'FeatureCollection',
      features: travellers.map(t => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [t.longitude, t.latitude] },
        properties: { name: t.full_name, trip: t.trip_name },
      })),
    })
  }, [travellers])

  // ── Draw controls ───────────────────────────────────────────────────────────

  const startDraw = () => {
    setDrawMode(true)
    setDrawPoints([])
    setSelectedZone(null)
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'crosshair'
  }

  const cancelDraw = () => {
    setDrawMode(false)
    setDrawPoints([])
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = ''
      const src = mapRef.current.getSource('draw-preview')
      if (src) src.setData({ type: 'FeatureCollection', features: [] })
    }
  }

  const undoPoint = () => {
    const next = drawPoints.slice(0, -1)
    setDrawPoints(next)
    const src = mapRef.current?.getSource('draw-preview')
    if (src) src.setData(previewFeatureCollection(next))
  }

  const finishDraw = () => {
    if (drawPoints.length < 3) return
    setShowForm(true)
  }

  // ── Save zone ───────────────────────────────────────────────────────────────

  const saveZone = async (form) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      name:        form.name,
      description: form.description || null,
      severity:    form.severity,
      coordinates: drawPoints,
      is_active:   true,
      created_by:  user.id,
      org_id:      profile?.org_id || null,
    }

    if (editZone) {
      await supabase.from('alert_zones').update({ name: form.name, description: form.description, severity: form.severity }).eq('id', editZone.id)
    } else {
      await supabase.from('alert_zones').insert(payload)
    }

    setShowForm(false)
    setEditZone(null)
    cancelDraw()
    setSaving(false)
    load()
  }

  // ── Toggle zone active ──────────────────────────────────────────────────────

  const toggleZone = async (zone) => {
    await supabase.from('alert_zones').update({ is_active: !zone.is_active }).eq('id', zone.id)
    setZones(prev => prev.map(z => z.id === zone.id ? { ...z, is_active: !z.is_active } : z))
  }

  // ── Delete zone ─────────────────────────────────────────────────────────────

  const deleteZone = async (id) => {
    if (!confirm('Delete this alert zone?')) return
    await supabase.from('alert_zones').delete().eq('id', id)
    setZones(prev => prev.filter(z => z.id !== id))
    setSelectedZone(null)
  }

  // ── Run geofence check on-demand ────────────────────────────────────────────

  const runCheck = async () => {
    setChecking(true)
    // Client-side check: log enter events for travellers inside active zones
    const entered = []
    for (const zone of zones.filter(z => z.is_active)) {
      for (const t of travellers) {
        if (pointInPolygon([t.longitude, t.latitude], zone.coordinates)) {
          entered.push({ zone_id: zone.id, zone_name: zone.name, user_id: t.user_id, user_name: t.full_name, event_type: 'enter', latitude: t.latitude, longitude: t.longitude })
        }
      }
    }
    if (entered.length > 0) {
      await supabase.from('geofence_events').insert(entered)
    }
    await load()
    setChecking(false)
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const selectedZoneData = zones.find(z => z.id === selectedZone)
  const totalOccupants   = zones.filter(z => z.is_active).reduce((n, z) => n + occupants(z).length, 0)
  const activeZones      = zones.filter(z => z.is_active).length

  const fmtTime = d => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <Layout>
      <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', margin: '0 -1rem' }}>

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-3">
            <Shield size={16} className="text-[#AACC00]" />
            <div>
              <h1 className="text-sm font-bold text-gray-900">Alert Zones</h1>
              <p className="text-[10px] text-gray-400">{activeZones} active · {totalOccupants} traveller{totalOccupants !== 1 ? 's' : ''} inside zones</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {drawMode ? (
              <>
                <span className="text-[10px] text-[#AACC00] font-semibold animate-pulse">
                  Click map to add points ({drawPoints.length})
                </span>
                {drawPoints.length > 0 && (
                  <button onClick={undoPoint}
                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-gray-500 border border-gray-200 hover:bg-gray-50">
                    Undo
                  </button>
                )}
                <button onClick={cancelDraw}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-gray-500 border border-gray-200 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={finishDraw} disabled={drawPoints.length < 3}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all disabled:opacity-40"
                  style={{ background: '#AACC00', color: '#09090B' }}>
                  <Check size={11} /> Finish Zone
                </button>
              </>
            ) : (
              <>
                <button onClick={runCheck} disabled={checking}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  <RefreshCw size={11} className={checking ? 'animate-spin' : ''} />
                  Check Now
                </button>
                <button onClick={startDraw}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-white"
                  style={{ background: DS.green }}>
                  <Pencil size={11} /> Draw Zone
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Main layout ─────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left panel */}
          <div className="w-64 shrink-0 flex flex-col border-r border-gray-100 bg-white overflow-hidden">

            {/* Stat strip */}
            <div className="grid grid-cols-2 gap-2 p-3 border-b border-gray-100">
              {[
                { label: 'Zones',      value: zones.length,      color: DS.bg },
                { label: 'In zones',   value: totalOccupants,    color: '#EF4444' },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-2.5 text-center" style={{ background: `${s.color}08` }}>
                  <div className="text-base font-bold" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Zone list */}
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
              {loading ? (
                <div className="p-4 space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
              ) : zones.length === 0 ? (
                <div className="p-6 text-center">
                  <Layers size={24} className="mx-auto mb-2 text-gray-200" />
                  <p className="text-xs text-gray-400">No zones yet</p>
                  <p className="text-[10px] text-gray-300 mt-1">Click "Draw Zone" to start</p>
                </div>
              ) : (
                zones.map(zone => {
                  const inside = occupants(zone)
                  const isSelected = selectedZone === zone.id
                  return (
                    <div key={zone.id}
                      className="px-3 py-2.5 border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50"
                      style={isSelected ? { background: `${SEV_COLOR[zone.severity]}08`, borderLeft: `3px solid ${SEV_COLOR[zone.severity]}` } : {}}
                      onClick={() => setSelectedZone(isSelected ? null : zone.id)}>
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <p className="text-[11px] font-semibold text-gray-800 leading-snug flex-1">{zone.name}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={e => { e.stopPropagation(); toggleZone(zone) }}
                            className="p-1 rounded-md hover:bg-gray-100 transition-colors">
                            {zone.is_active
                              ? <Eye size={11} className="text-[#AACC00]" />
                              : <EyeOff size={11} className="text-gray-300" />
                            }
                          </button>
                          <button onClick={e => { e.stopPropagation(); deleteZone(zone.id) }}
                            className="p-1 rounded-md hover:bg-[rgba(138,46,46,0.12)] transition-colors">
                            <Trash2 size={11} className="text-gray-300 hover:text-red-400" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <SevPill severity={zone.severity} />
                        {inside.length > 0 && (
                          <span className="text-[9px] font-bold text-[#EF7474] flex items-center gap-0.5">
                            <Users size={8} /> {inside.length} inside
                          </span>
                        )}
                        {!zone.is_active && (
                          <span className="text-[9px] text-gray-400">inactive</span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Recent events */}
            {events.length > 0 && (
              <div className="border-t border-gray-100 shrink-0" style={{ maxHeight: 180 }}>
                <div className="px-3 py-2 flex items-center gap-1.5">
                  <Activity size={10} className="text-gray-400" />
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Recent Events</p>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 140, scrollbarWidth: 'none' }}>
                  {events.slice(0, 20).map(ev => (
                    <div key={ev.id} className="px-3 py-1.5 border-b border-gray-50">
                      <p className="text-[10px] font-semibold text-gray-700">
                        <span className={ev.event_type === 'enter' ? 'text-[#EF7474]' : 'text-[#AACC00]'}>
                          {ev.event_type === 'enter' ? '▶' : '◀'}
                        </span>
                        {' '}{ev.user_name}
                      </p>
                      <p className="text-[9px] text-gray-400">{ev.zone_name} · {fmtTime(ev.ts)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Map */}
          <div className="flex-1 relative">
            <div ref={containerRef} className="absolute inset-0" />

            {/* Zone detail overlay */}
            {selectedZoneData && !drawMode && (
              <div className="absolute top-3 right-3 z-10 w-64 rounded-2xl overflow-hidden"
                style={{ background: 'rgba(9,10,12,0.95)', border: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(16px)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                <div className="px-4 py-3 flex items-start justify-between"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div>
                    <p className="text-xs font-bold text-white leading-snug">{selectedZoneData.name}</p>
                    <div className="mt-1">
                      <SevPill severity={selectedZoneData.severity} />
                    </div>
                  </div>
                  <button onClick={() => setSelectedZone(null)} className="text-white/30 hover:text-white/60 transition-colors p-1">
                    <X size={12} />
                  </button>
                </div>

                {selectedZoneData.description && (
                  <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="text-[10px] text-white/55 leading-relaxed">{selectedZoneData.description}</p>
                  </div>
                )}

                <div className="px-4 py-2.5">
                  <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mb-2">Travellers inside</p>
                  {occupants(selectedZoneData).length === 0 ? (
                    <p className="text-[10px] text-white/30">None currently</p>
                  ) : (
                    occupants(selectedZoneData).map(t => (
                      <div key={t.id} className="flex items-center gap-2 py-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        <p className="text-[10px] text-white/80 font-medium">{t.full_name}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="px-4 pb-3 flex gap-2">
                  <button onClick={() => toggleZone(selectedZoneData)}
                    className="flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-colors"
                    style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}>
                    {selectedZoneData.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => deleteZone(selectedZoneData.id)}
                    className="py-1.5 px-2.5 rounded-lg text-[10px] font-bold text-red-400 transition-colors hover:bg-red-400/10">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            )}

            {/* Draw instructions */}
            {drawMode && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 px-4 py-2.5 rounded-full"
                style={{ background: 'rgba(9,10,12,0.92)', border: '1px solid rgba(170,204,0,0.3)', backdropFilter: 'blur(12px)' }}>
                <p className="text-[11px] font-semibold text-white/80">
                  {drawPoints.length < 3
                    ? `Click to place points (${drawPoints.length}/3 minimum)`
                    : `${drawPoints.length} points — click "Finish Zone" when done`
                  }
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Zone name modal */}
      {showForm && (
        <ZoneFormModal
          onSave={saveZone}
          onClose={() => { setShowForm(false); cancelDraw() }}
        />
      )}

      <style>{`
        .maplibregl-ctrl-bottom-right { bottom: 12px !important; right: 12px !important; }
      `}</style>
    </Layout>
  )
}
