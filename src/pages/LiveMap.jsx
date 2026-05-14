/**
 * LiveMap — Operational Geospatial Intelligence
 *
 * Engine: MapLibre GL JS (WebGL, GPU-accelerated, 60fps)
 * Tiles:  CartoDB Dark Matter (free, no key) | MapTiler (with VITE_MAPTILER_KEY)
 *
 * Features:
 *  - Realtime traveller positions via Supabase Realtime channel (no polling)
 *  - WS reconnect with exponential backoff
 *  - Location write throttled to 30s (vs previous 500ms)
 *  - Risk zone overlays coloured by severity
 *  - Proximity alerts (haversine, client-side)
 *  - Style switching: Operational Dark / Standard / Satellite / Terrain
 *  - Layer toggles: Travellers / Risk Zones
 *  - Full-height responsive layout (not fixed 480px)
 *  - Mobile-optimised floating control panel
 *  - No window.* global pollution
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  Navigation, MapPin, RefreshCw, Radio, EyeOff, Users,
  AlertCircle, AlertTriangle, Layers, Satellite, Map,
  Wifi, WifiOff, ChevronDown, ChevronUp, X, Mountain,
} from 'lucide-react'
import Layout from '../components/Layout'
import IntelBrief from '../components/IntelBrief'
import { supabase } from '../lib/supabase'
import { log } from '../lib/logger'
import { cityToCountry, COUNTRY_META } from '../data/intelData'
import {
  MAP_STYLES, MAP_DEFAULTS, RISK_STYLE,
  PROXIMITY_KM, WS_RECONNECT, LOCATION_WRITE_THROTTLE_MS, HAS_MAPTILER,
} from '../lib/mapConfig'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(d) {
  if (!d) return '—'
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function initials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// Build a traveller marker element (custom HTML → maplibre Marker)
function buildMarkerEl(name, color, isMe = false, isSOS = false) {
  const el = document.createElement('div')
  el.className = 'op-marker'
  el.style.cssText = `
    position: relative;
    width: ${isMe ? '20px' : '32px'};
    height: ${isMe ? '20px' : '32px'};
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    background: ${color};
    border: 2px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.2s;
  `
  if (isMe) {
    el.style.borderRadius = '50%'
    el.style.transform = 'none'
    el.style.width = '18px'
    el.style.height = '18px'
    el.style.boxShadow = `0 0 0 4px ${color}40, 0 2px 8px rgba(0,0,0,0.4)`
  }

  if (!isMe) {
    const inner = document.createElement('span')
    inner.style.cssText = `
      display: inline-flex; align-items: center; justify-content: center;
      transform: rotate(45deg);
      color: white;
      font-family: system-ui, sans-serif;
      font-weight: 700;
      font-size: ${isSOS ? '9px' : '10px'};
      line-height: 1;
      text-align: center;
      width: 100%;
    `
    inner.textContent = isSOS ? '🆘' : initials(name)
    el.appendChild(inner)
  }

  // Pulse ring for SOS or active sharing
  if (isSOS) {
    const pulse = document.createElement('div')
    pulse.style.cssText = `
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(45deg);
      width: 48px; height: 48px;
      border-radius: 50%;
      background: rgba(239,68,68,0.3);
      animation: op-pulse 1.5s ease-out infinite;
      pointer-events: none;
      z-index: -1;
    `
    el.appendChild(pulse)
  }

  return el
}

// ── Style switcher config ─────────────────────────────────────────────────────
const STYLE_OPTIONS = [
  { id: 'operational', label: 'Operational', icon: Radio,    dark: true  },
  { id: 'standard',    label: 'Standard',    icon: Map,      dark: false },
  { id: 'satellite',   label: 'Satellite',   icon: Satellite,dark: true  },
  { id: 'terrain',     label: 'Terrain',     icon: Mountain, dark: false },
]

// ── Main component ────────────────────────────────────────────────────────────
export default function LiveMap() {
  const [profile,            setProfile]            = useState(null)
  const [activeTrip,         setActiveTrip]         = useState(null)
  const [isAdmin,            setIsAdmin]            = useState(false)
  const [isSolo,             setIsSolo]             = useState(false)
  const [sharing,            setSharing]            = useState(false)
  const [myPos,              setMyPos]              = useState(null)
  const [gpsErr,             setGpsErr]             = useState(null)
  const [locations,          setLocations]          = useState([])
  const [loading,            setLoading]            = useState(true)
  const [tripAlerts,         setTripAlerts]         = useState([])
  const [proximityWarnings,  setProximityWarnings]  = useState([])
  const [intelCountry,       setIntelCountry]       = useState(null)
  const [activeStyle,        setActiveStyle]        = useState('operational')
  const [layersOpen,         setLayersOpen]         = useState(false)
  const [panelOpen,          setPanelOpen]          = useState(true)
  const [showTravellers,     setShowTravellers]     = useState(true)
  const [showRiskZones,      setShowRiskZones]      = useState(true)
  const [wsStatus,           setWsStatus]           = useState('connecting') // 'connected'|'reconnecting'|'offline'
  const [reconnectAttempts,  setReconnectAttempts]  = useState(0)

  // Refs
  const containerRef     = useRef(null)
  const mapRef           = useRef(null)
  const markersRef       = useRef({})        // { user_id: maplibregl.Marker }
  const myMarkerRef      = useRef(null)
  const channelRef       = useRef(null)
  const watchRef         = useRef(null)
  const lastWriteRef     = useRef(0)
  const reconnectTimer   = useRef(null)
  const styleChanging    = useRef(false)
  const locationsRef     = useRef([])        // keep ref in sync for closure access

  // ── Initial data load ───────────────────────────────────────────────────────
  const loadInitialData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const today = new Date().toISOString().split('T')[0]
    const [{ data: prof }, { data: trip }, { data: locs }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('itineraries').select('*')
        .eq('user_id', user.id).lte('depart_date', today).gte('return_date', today)
        .limit(1).maybeSingle(),
      supabase.from('staff_locations').select('*')
        .eq('is_sharing', true)
        .gte('recorded_at', new Date(Date.now() - 86_400_000).toISOString())
        .order('recorded_at', { ascending: false }),
    ])

    const role = prof?.role || user.app_metadata?.role || 'traveller'
    const isSoloRole = role === 'solo' || (!prof?.org_id && !['admin','developer','org_admin'].includes(role))
    setIsAdmin(role === 'admin' || role === 'developer')
    setIsSolo(isSoloRole)
    setProfile({ ...prof, id: user.id, email: user.email })
    setActiveTrip(trip || null)

    // Clear any stale is_sharing=true rows left by a previous session that
    // closed without calling stopSharing (e.g. browser tab closed).
    // Rows older than 2 hours with is_sharing=true are considered abandoned.
    const staleThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    supabase.from('staff_locations')
      .update({ is_sharing: false })
      .eq('user_id', user.id)
      .eq('is_sharing', true)
      .lt('recorded_at', staleThreshold)
      .then(() => {})  // fire-and-forget

    // Deduplicate to latest position per user
    const seen = new Set()
    const dedup = (locs || []).filter(l => { if (seen.has(l.user_id)) return false; seen.add(l.user_id); return true })
    locationsRef.current = dedup
    setLocations(dedup)
    setLoading(false)

    // Background: fetch trip alerts for risk zone overlay
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        fetch('/api/trip-alert-scan', { headers: { Authorization: `Bearer ${session.access_token}` } })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.alerts) {
              setTripAlerts(data.alerts.filter(a => ['Critical', 'High'].includes(a.severity) && a.country))
            }
          })
          .catch(() => {})
      }
    } catch {}
  }, [])

  useEffect(() => { loadInitialData() }, [loadInitialData])

  // ── Supabase Realtime subscription ─────────────────────────────────────────
  const subscribeRealtime = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    clearTimeout(reconnectTimer.current)

    // For solo users: filter to own location only (Supabase Realtime does not
    // automatically apply RLS to postgres_changes — explicit filter is required
    // to prevent cross-user location event leakage).
    // For org/admin users: no filter — they legitimately see the whole team.
    const realtimeFilter = (isSolo && profile?.id)
      ? { event: '*', schema: 'public', table: 'staff_locations', filter: `user_id=eq.${profile.id}` }
      : { event: '*', schema: 'public', table: 'staff_locations' }

    const channel = supabase
      .channel(`op-staff-locations-${profile?.id || 'shared'}`)
      .on('postgres_changes', realtimeFilter, (payload) => {
        const updated = payload.new
        if (!updated?.is_sharing || !updated?.user_id) return

        setLocations(prev => {
          const exists = prev.findIndex(l => l.user_id === updated.user_id)
          const next = exists >= 0
            ? prev.map(l => l.user_id === updated.user_id ? updated : l)
            : [updated, ...prev]
          locationsRef.current = next
          return next
        })
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setWsStatus('connected')
          setReconnectAttempts(0)
          log.realtime.connected({ channel: 'staff_locations', userId: profile?.id })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setWsStatus('reconnecting')
          supabase.removeChannel(channel)
          channelRef.current = null

          // Exponential backoff reconnect
          setReconnectAttempts(prev => {
            const attempt = prev + 1
            if (attempt > WS_RECONNECT.maxAttempts) {
              setWsStatus('offline')
              log.realtime.disconnected({ channel: 'staff_locations', status, attempts: attempt, userId: profile?.id })
              return prev
            }
            const delay = Math.min(WS_RECONNECT.baseDelayMs * 2 ** (attempt - 1), WS_RECONNECT.maxDelayMs)
            log.realtime.reconnecting({ channel: 'staff_locations', status, attempt, delayMs: delay })
            reconnectTimer.current = setTimeout(subscribeRealtime, delay)
            return attempt
          })
        }
      })

    channelRef.current = channel
  }, [isSolo, profile?.id])   // eslint-disable-line

  useEffect(() => {
    subscribeRealtime()
    return () => {
      clearTimeout(reconnectTimer.current)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [subscribeRealtime])

  // ── MapLibre initialisation ─────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const style = MAP_STYLES[activeStyle] || MAP_STYLES.operational
    if (!style) return   // satellite/terrain without key — don't init

    const map = new maplibregl.Map({
      container:    containerRef.current,
      style,
      center:       MAP_DEFAULTS.center,
      zoom:         MAP_DEFAULTS.zoom,
      minZoom:      MAP_DEFAULTS.minZoom,
      maxZoom:      MAP_DEFAULTS.maxZoom,
      attributionControl: false,
    })

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left')

    // Inject CSS for pulse animation once
    if (!document.getElementById('op-map-styles')) {
      const styleEl = document.createElement('style')
      styleEl.id = 'op-map-styles'
      styleEl.textContent = `
        @keyframes op-pulse {
          0%   { transform: translate(-50%,-50%) scale(0.8); opacity: 0.8; }
          100% { transform: translate(-50%,-50%) scale(2.2); opacity: 0; }
        }
        .op-marker:hover { filter: brightness(1.2); }
        .maplibregl-popup-content {
          border-radius: 10px !important;
          padding: 12px 14px !important;
          font-family: system-ui, sans-serif !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2) !important;
          min-width: 160px;
          max-width: 240px;
        }
        .maplibregl-popup-tip { display: none !important; }
      `
      document.head.appendChild(styleEl)
    }

    mapRef.current = map

    return () => {
      // Remove all custom markers before destroying
      Object.values(markersRef.current).forEach(m => m.remove())
      markersRef.current = {}
      if (myMarkerRef.current) { myMarkerRef.current.remove(); myMarkerRef.current = null }
      map.remove()
      mapRef.current = null
    }
  }, [])  // eslint-disable-line

  // ── Style switching ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || styleChanging.current) return
    const style = MAP_STYLES[activeStyle]
    if (!style) return   // no key for satellite/terrain

    styleChanging.current = true
    // Preserve current viewport
    const center  = map.getCenter()
    const zoom    = map.getZoom()
    const bearing = map.getBearing()
    const pitch   = map.getPitch()

    map.setStyle(style)
    map.once('styledata', () => {
      map.setCenter(center)
      map.setZoom(zoom)
      map.setBearing(bearing)
      map.setPitch(pitch)
      styleChanging.current = false
      // Re-add risk zone overlay after style change
      addRiskZoneLayers(map, tripAlerts, showRiskZones)
    })
  }, [activeStyle])  // eslint-disable-line

  // ── Risk zone overlay (GeoJSON fill + circle layers) ───────────────────────
  const addRiskZoneLayers = useCallback((map, alerts, visible) => {
    if (!map) return
    // Remove if exists
    ['risk-zones-fill', 'risk-zones-stroke', 'risk-zones-labels'].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id)
    })
    if (map.getSource('risk-zones')) map.removeSource('risk-zones')

    // Build GeoJSON from country alerts
    const byCountry = {}
    const SEV_ORDER = { Critical: 4, High: 3, Medium: 2, Low: 1 }
    for (const alert of alerts) {
      const meta = COUNTRY_META[alert.country]
      if (!meta) continue
      if (!byCountry[alert.country]) byCountry[alert.country] = { ...meta, severity: alert.severity, alerts: [] }
      byCountry[alert.country].alerts.push(alert)
      if ((SEV_ORDER[alert.severity] || 0) > (SEV_ORDER[byCountry[alert.country].severity] || 0)) {
        byCountry[alert.country].severity = alert.severity
      }
    }

    const features = Object.entries(byCountry).map(([country, data]) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [data.lon, data.lat] },
      properties: {
        country,
        severity:    data.severity,
        alertCount:  data.alerts.length,
        title:       data.alerts[0]?.title?.slice(0, 80) || '',
        color:       RISK_STYLE[data.severity]?.color || '#ef4444',
        radius:      RISK_STYLE[data.severity]?.radius || 16,
      },
    }))

    try {
      map.addSource('risk-zones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      })

      map.addLayer({
        id:     'risk-zones-fill',
        type:   'circle',
        source: 'risk-zones',
        layout: { visibility: visible ? 'visible' : 'none' },
        paint: {
          'circle-radius':          ['interpolate', ['linear'], ['zoom'], 2, 10, 6, ['get', 'radius'], 12, 28],
          'circle-color':           ['get', 'color'],
          'circle-opacity':         0.18,
          'circle-stroke-color':    ['get', 'color'],
          'circle-stroke-width':    2,
          'circle-stroke-opacity':  0.7,
        },
      })

      // Pop-up on click
      map.on('click', 'risk-zones-fill', (e) => {
        const f = e.features?.[0]
        if (!f) return
        const { country, severity, alertCount, title, color } = f.properties
        const html = `
          <div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
              <span style="width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>
              <b style="font-size:13px;color:#111">${country}</b>
              <span style="margin-left:auto;font-size:10px;font-weight:700;padding:1px 7px;border-radius:99px;background:${color}20;color:${color};border:1px solid ${color}40">${severity}</span>
            </div>
            <p style="font-size:11px;color:#555;margin:0 0 8px;line-height:1.4">${title}${alertCount > 1 ? ` +${alertCount - 1} more` : ''}</p>
            <button id="intel-btn-${country.replace(/\s/g, '_')}"
              style="width:100%;background:#0118A1;color:white;border:none;border-radius:6px;padding:6px 8px;font-size:11px;font-weight:600;cursor:pointer">
              View ${country} Intel →
            </button>
          </div>`

        const popup = new maplibregl.Popup({ closeButton: false, offset: 5 })
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map)

        // Attach click handler after popup renders
        setTimeout(() => {
          document.getElementById(`intel-btn-${country.replace(/\s/g, '_')}`)?.addEventListener('click', () => {
            popup.remove()
            setIntelCountry(country)
          })
        }, 50)
      })

      map.on('mouseenter', 'risk-zones-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'risk-zones-fill', () => { map.getCanvas().style.cursor = '' })

    } catch {
      // Source may already exist during rapid style change — ignore
    }
  }, [])  // eslint-disable-line

  // Re-apply risk zones when alerts or visibility changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const tryAdd = () => addRiskZoneLayers(map, tripAlerts, showRiskZones)

    if (map.isStyleLoaded()) {
      tryAdd()
    } else {
      map.once('load', tryAdd)
    }
  }, [tripAlerts, showRiskZones, addRiskZoneLayers])

  // ── Layer visibility toggle ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    if (map.getLayer('risk-zones-fill')) {
      map.setLayoutProperty('risk-zones-fill', 'visibility', showRiskZones ? 'visible' : 'none')
    }
  }, [showRiskZones])

  // ── Traveller markers (HTML markers, live-updated) ──────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const waitForMap = () => {
      if (!map.isStyleLoaded()) { setTimeout(waitForMap, 100); return }

      const currentIds = new Set(locations.map(l => l.user_id))

      // Remove stale markers
      Object.keys(markersRef.current).forEach(uid => {
        if (!currentIds.has(uid)) {
          markersRef.current[uid].remove()
          delete markersRef.current[uid]
        }
      })

      locations.forEach(loc => {
        const isMe    = loc.user_id === profile?.id
        const lnglat  = [parseFloat(loc.longitude), parseFloat(loc.latitude)]
        const color   = isMe ? BRAND_GREEN : BRAND_BLUE
        const el      = buildMarkerEl(loc.full_name, color, isMe, false)
        const country = loc.arrival_city ? cityToCountry(loc.arrival_city) : null

        const popupHtml = `
          <div>
            <p style="font-weight:700;font-size:13px;margin:0 0 4px;color:#111">${loc.full_name || 'Unknown'}${isMe ? ' (you)' : ''}</p>
            ${loc.trip_name  ? `<p style="font-size:11px;color:#555;margin:0 0 2px">✈️ ${loc.trip_name}</p>` : ''}
            ${loc.arrival_city ? `<p style="font-size:11px;color:#6b7280;margin:0 0 4px">📍 ${loc.arrival_city}</p>` : ''}
            <p style="font-size:10px;color:#9ca3af;margin:0 0 6px">Updated ${timeAgo(loc.recorded_at)}</p>
            ${country ? `<button id="intel-${loc.user_id}" style="width:100%;background:#0118A1;color:white;border:none;border-radius:6px;padding:5px 8px;font-size:11px;font-weight:600;cursor:pointer">${country} intel →</button>` : ''}
          </div>`

        if (markersRef.current[loc.user_id]) {
          markersRef.current[loc.user_id].setLngLat(lnglat)
          markersRef.current[loc.user_id].getPopup()?.setHTML(popupHtml)
        } else {
          if (!showTravellers) return
          const popup = new maplibregl.Popup({ closeButton: false, offset: 20 }).setHTML(popupHtml)
          popup.on('open', () => {
            setTimeout(() => {
              document.getElementById(`intel-${loc.user_id}`)?.addEventListener('click', () => {
                popup.remove()
                setIntelCountry(country)
              })
            }, 50)
          })
          markersRef.current[loc.user_id] = new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat(lnglat)
            .setPopup(popup)
            .addTo(map)
        }
      })

      // Auto-fit to all visible travellers on first load
      if (locations.length > 0 && !sharing) {
        const bounds = new maplibregl.LngLatBounds()
        locations.forEach(l => bounds.extend([parseFloat(l.longitude), parseFloat(l.latitude)]))
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 80, maxZoom: 8, duration: 1000 })
        }
      }
    }

    waitForMap()
  }, [locations, profile, showTravellers])  // eslint-disable-line

  // Toggle traveller marker visibility
  useEffect(() => {
    Object.values(markersRef.current).forEach(m => {
      m.getElement().style.display = showTravellers ? 'flex' : 'none'
    })
    if (myMarkerRef.current) {
      myMarkerRef.current.getElement().style.display = showTravellers ? 'block' : 'none'
    }
  }, [showTravellers])

  // ── My position marker ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !myPos) return

    const pos = [myPos.longitude, myPos.latitude]

    const waitForStyle = () => {
      if (!map.isStyleLoaded()) { setTimeout(waitForStyle, 100); return }
      if (myMarkerRef.current) {
        myMarkerRef.current.setLngLat(pos)
      } else {
        const el = buildMarkerEl('me', BRAND_GREEN, true)
        myMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(pos)
          .addTo(map)
      }
      map.easeTo({ center: pos, zoom: Math.max(map.getZoom(), 11), duration: 800 })
    }
    waitForStyle()
  }, [myPos])

  // ── Proximity warnings ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!myPos || !tripAlerts.length) { setProximityWarnings([]); return }
    const byCountry = {}
    const SEV_ORDER = { Critical: 4, High: 3, Medium: 2, Low: 1 }
    for (const alert of tripAlerts) {
      const meta = COUNTRY_META[alert.country]
      if (!meta) continue
      if (!byCountry[alert.country]) byCountry[alert.country] = { country: alert.country, meta, severity: alert.severity, alerts: [] }
      byCountry[alert.country].alerts.push(alert)
      if ((SEV_ORDER[alert.severity] || 0) > (SEV_ORDER[byCountry[alert.country].severity] || 0)) {
        byCountry[alert.country].severity = alert.severity
      }
    }
    const warnings = Object.values(byCountry)
      .map(({ country, meta, severity, alerts }) => {
        const km = haversineKm(myPos.latitude, myPos.longitude, meta.lat, meta.lon)
        return { country, severity, distanceKm: Math.round(km), alerts, threshold: PROXIMITY_KM[severity] || 300 }
      })
      .filter(w => w.distanceKm <= w.threshold)
      .sort((a, b) => a.distanceKm - b.distanceKm)
    setProximityWarnings(warnings)
  }, [myPos, tripAlerts])

  // ── Location sharing ────────────────────────────────────────────────────────
  // Keep a ref to pushLocation so startSharing's watchPosition callback always
  // calls the latest version — avoids a stale-closure where profile is still
  // null when the user clicks "Share" before loadInitialData has returned.
  const pushLocationRef = useRef(null)

  const pushLocation = useCallback(async (coords) => {
    const now = Date.now()
    if (now - lastWriteRef.current < LOCATION_WRITE_THROTTLE_MS) return
    lastWriteRef.current = now

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // Use auth session email as the most reliable fallback — profile state
    // may still be null if sharing started before loadInitialData resolved.
    const displayName =
      profile?.full_name ||
      profile?.email     ||
      session.user.email ||
      session.user.user_metadata?.full_name ||
      'Unknown'

    await supabase.from('staff_locations').insert({
      user_id:      session.user.id,
      full_name:    displayName,
      latitude:     coords.latitude,
      longitude:    coords.longitude,
      accuracy:     coords.accuracy,
      trip_name:    activeTrip?.trip_name    || null,
      arrival_city: activeTrip?.arrival_city || null,
      is_sharing:   true,
      recorded_at:  new Date().toISOString(),
    })
    // Realtime subscription will pick up the change — no manual loadData() needed
  }, [profile, activeTrip])

  // Keep ref current so watchPosition callback always calls the latest version
  useEffect(() => { pushLocationRef.current = pushLocation }, [pushLocation])

  const startSharing = () => {
    if (!navigator.geolocation) { setGpsErr('GPS not supported on this device'); return }
    setGpsErr(null)
    setSharing(true)
    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        setMyPos(pos.coords)
        pushLocationRef.current?.(pos.coords)  // always calls latest pushLocation
      },
      err => { setGpsErr(err.message); setSharing(false) },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 }
    )
  }

  const stopSharing = async () => {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current)
    watchRef.current = null
    setSharing(false)
    setMyPos(null)
    if (myMarkerRef.current) { myMarkerRef.current.remove(); myMarkerRef.current = null }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('staff_locations').update({ is_sharing: false }).eq('user_id', user.id)
  }

  useEffect(() => () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current) }, [])

  // ── Style switch handler ────────────────────────────────────────────────────
  const switchStyle = (styleId) => {
    if (!MAP_STYLES[styleId]) {
      alert('Satellite and terrain modes require a MapTiler API key.\nAdd VITE_MAPTILER_KEY to your Vercel environment variables.')
      return
    }
    setActiveStyle(styleId)
    setLayersOpen(false)
  }

  // ── Derived state ───────────────────────────────────────────────────────────
  const isDark    = STYLE_OPTIONS.find(s => s.id === activeStyle)?.dark ?? true
  const textColor = isDark ? 'text-white' : 'text-gray-900'
  const panelBg   = isDark ? 'bg-gray-900/90 border-white/10' : 'bg-white/95 border-gray-200'
  const panelText = isDark ? 'text-gray-100' : 'text-gray-800'
  const subText   = isDark ? 'text-gray-400' : 'text-gray-500'

  return (
    <Layout>
      {intelCountry && <IntelBrief country={intelCountry} onClose={() => setIntelCountry(null)} />}

      {/* ── Full-height operational map container ── */}
      <div className="relative -mx-4 lg:-mx-7 -mt-0" style={{ height: 'calc(100vh - 56px)' }}>

        {/* Map canvas */}
        <div ref={containerRef} className="absolute inset-0" />

        {/* ── WS status pill ── */}
        <div className="absolute top-3 left-3 z-20">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-sm border
            ${wsStatus === 'connected'     ? 'bg-green-500/20 border-green-500/40 text-green-300' :
              wsStatus === 'reconnecting'  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' :
                                             'bg-red-500/20 border-red-500/40 text-red-300'}`}>
            {wsStatus === 'connected'
              ? <><Wifi size={10} /> LIVE</>
              : wsStatus === 'reconnecting'
              ? <><RefreshCw size={10} className="animate-spin" /> RECONNECTING</>
              : <><WifiOff size={10} /> OFFLINE</>}
          </div>
        </div>

        {/* ── Style + layer switcher ── */}
        <div className="absolute top-3 right-12 z-20">
          <button
            onClick={() => setLayersOpen(p => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-sm border bg-gray-900/70 border-white/15 text-white hover:bg-gray-900/90 transition"
          >
            <Layers size={13} /> Map
          </button>

          {layersOpen && (
            <div className="absolute top-9 right-0 w-52 rounded-xl border bg-gray-900/95 border-white/15 text-white backdrop-blur-md shadow-xl overflow-hidden">
              {/* Base styles */}
              <div className="px-3 pt-2.5 pb-1 text-[9px] font-bold uppercase tracking-widest text-gray-500">Base Layer</div>
              {STYLE_OPTIONS.map(s => {
                const Icon = s.icon
                const available = !!MAP_STYLES[s.id]
                return (
                  <button key={s.id} onClick={() => switchStyle(s.id)}
                    disabled={!available}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition
                      ${activeStyle === s.id ? 'bg-white/15 text-white' : 'text-gray-300 hover:bg-white/8 disabled:opacity-40 disabled:cursor-not-allowed'}`}>
                    <Icon size={13} />
                    {s.label}
                    {!available && <span className="ml-auto text-[9px] text-gray-500">Key required</span>}
                    {activeStyle === s.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400" />}
                  </button>
                )
              })}
              {/* Operational layers */}
              <div className="px-3 pt-2.5 pb-1 mt-1 border-t border-white/10 text-[9px] font-bold uppercase tracking-widest text-gray-500">Layers</div>
              <button onClick={() => setShowTravellers(p => !p)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/8 transition">
                <Users size={13} />
                Travellers
                <span className={`ml-auto w-8 h-4 rounded-full transition-colors ${showTravellers ? 'bg-green-500' : 'bg-gray-600'}`} />
              </button>
              <button onClick={() => setShowRiskZones(p => !p)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/8 transition">
                <AlertTriangle size={13} />
                Risk Zones
                <span className={`ml-auto w-8 h-4 rounded-full transition-colors ${showRiskZones ? 'bg-green-500' : 'bg-gray-600'}`} />
              </button>
              {!HAS_MAPTILER && (
                <div className="px-3 py-2 mt-1 border-t border-white/10">
                  <p className="text-[9px] text-gray-500 leading-relaxed">Add <code className="text-amber-400">VITE_MAPTILER_KEY</code> to unlock satellite, terrain, and vector tiles.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Floating side panel ── */}
        <div className={`absolute top-3 bottom-3 right-3 z-10 flex flex-col gap-3 transition-all duration-300
          ${panelOpen ? 'w-72 sm:w-80' : 'w-9'}`}>

          {/* Collapse toggle */}
          <button
            onClick={() => setPanelOpen(p => !p)}
            className="absolute -left-8 top-0 flex items-center justify-center w-7 h-7 rounded-l-lg bg-gray-900/80 border border-white/15 border-r-0 text-white hover:bg-gray-900 transition z-10"
          >
            {panelOpen ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>

          {panelOpen && (
            <>
              {/* Stats strip */}
              <div className={`grid grid-cols-3 gap-1.5 rounded-xl p-2.5 border backdrop-blur-md ${panelBg}`}>
                {[
                  { label: 'Sharing',  value: locations.length,    color: '#0118A1' },
                  { label: 'Alerts',   value: tripAlerts.length,   color: tripAlerts.some(a => a.severity === 'Critical') ? '#ef4444' : '#f59e0b' },
                  { label: 'Nearby',   value: proximityWarnings.length, color: proximityWarnings.length ? '#ef4444' : '#6b7280' },
                ].map(s => (
                  <div key={s.label} className="text-center py-1.5 px-1 rounded-lg" style={{ background: s.color + '18' }}>
                    <p className="text-lg font-black leading-none" style={{ color: s.color }}>{s.value}</p>
                    <p className={`text-[9px] font-bold uppercase tracking-wide mt-0.5 ${subText}`}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* My location */}
              <div className={`rounded-xl p-3 border backdrop-blur-md ${panelBg}`}>
                <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${subText}`}>My Location</p>
                {sharing ? (
                  <div className="space-y-2">
                    <div className={`flex items-center gap-2 text-xs font-semibold text-green-400`}>
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      Sharing live
                    </div>
                    {myPos && (
                      <p className={`text-[10px] ${subText}`}>
                        {myPos.latitude.toFixed(4)}, {myPos.longitude.toFixed(4)} · ±{Math.round(myPos.accuracy || 0)}m
                      </p>
                    )}
                    <button onClick={stopSharing}
                      className="w-full flex items-center justify-center gap-1.5 py-2 border border-white/15 rounded-lg text-xs text-gray-300 hover:bg-white/10 transition">
                      <EyeOff size={11} /> Stop sharing
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {gpsErr && (
                      <div className="rounded-lg px-2.5 py-2 text-[10px] leading-relaxed"
                        style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
                        <p className="text-red-400 font-semibold mb-0.5">Location access blocked</p>
                        <p className="text-gray-400">
                          {gpsErr.includes('denied') || gpsErr.includes('User denied')
                            ? 'To enable: tap the lock icon in your browser address bar → Site Settings → Allow Location.'
                            : gpsErr}
                        </p>
                      </div>
                    )}
                    <button onClick={startSharing}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition"
                      style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
                      <Navigation size={12} /> Share My Location
                    </button>
                    <p className={`text-[9px] text-center ${subText}`}>Shares every 30s — not continuous</p>
                  </div>
                )}
              </div>

              {/* Proximity warnings */}
              {proximityWarnings.length > 0 && (
                <div className="rounded-xl border-2 border-red-500/60 backdrop-blur-md overflow-hidden" style={{ background: 'rgba(239,68,68,0.12)' }}>
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-red-500/30">
                    <AlertCircle size={12} className="text-red-400" />
                    <p className="text-[9px] font-bold uppercase tracking-widest text-red-300 flex-1">Nearby Risk Zones</p>
                    <span className="text-[9px] font-black bg-red-500 text-white rounded-full px-1.5 py-0.5">{proximityWarnings.length}</span>
                  </div>
                  <div className="px-2 py-2 space-y-1.5 max-h-40 overflow-y-auto">
                    {proximityWarnings.map((w, i) => (
                      <button key={i} onClick={() => setIntelCountry(w.country)}
                        className="w-full text-left p-2 rounded-lg transition hover:bg-white/10"
                        style={{ background: 'rgba(239,68,68,0.12)' }}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${w.severity === 'Critical' ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'}`}>
                            {w.severity}
                          </span>
                          <span className="text-[10px] font-semibold text-white flex-1">{w.country}</span>
                          <span className="text-[9px] text-gray-400">~{w.distanceKm.toLocaleString()} km</span>
                        </div>
                        <p className="text-[10px] text-gray-400 leading-tight truncate">{w.alerts[0]?.title?.slice(0, 55)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Staff list — hidden for solo users who have no team */}
              {!isSolo && (
              <div className={`rounded-xl border backdrop-blur-md flex-1 min-h-0 flex flex-col ${panelBg}`}>
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
                  <p className={`text-[9px] font-bold uppercase tracking-widest ${subText}`}>
                    {isAdmin ? 'All Staff' : 'My Team'}
                  </p>
                  <button onClick={loadInitialData} className="text-gray-500 hover:text-gray-300 transition">
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
                {loading ? (
                  <div className="p-3 space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-9 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />)}
                  </div>
                ) : locations.length === 0 ? (
                  <p className={`text-[10px] italic text-center py-6 ${subText}`}>No staff sharing location</p>
                ) : (
                  <div className="overflow-y-auto flex-1 p-2 space-y-1">
                    {locations.map(loc => {
                      const isMe    = loc.user_id === profile?.id
                      const country = loc.arrival_city ? cityToCountry(loc.arrival_city) : null
                      return (
                        <div key={loc.id}
                          className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-white/8 transition"
                          style={{ background: isMe ? 'rgba(170,204,0,0.12)' : 'rgba(255,255,255,0.04)' }}
                          onClick={() => {
                            const map = mapRef.current
                            if (map && loc.latitude && loc.longitude) {
                              map.easeTo({ center: [parseFloat(loc.longitude), parseFloat(loc.latitude)], zoom: 12, duration: 800 })
                            }
                          }}>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                            style={{ background: isMe ? BRAND_GREEN : BRAND_BLUE, color: isMe ? BRAND_BLUE : 'white' }}>
                            {initials(loc.full_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[11px] font-semibold truncate ${panelText}`}>{loc.full_name}{isMe && ' (you)'}</p>
                            <p className={`text-[9px] truncate ${subText}`}>{loc.arrival_city || '—'} · {timeAgo(loc.recorded_at)}</p>
                          </div>
                          {country && (
                            <button onClick={e => { e.stopPropagation(); setIntelCountry(country) }}
                              className="text-[9px] text-blue-400 hover:text-blue-200 font-semibold shrink-0 transition">
                              Intel
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              )}
            </>
          )}
        </div>

        {/* ── Mobile bottom sheet: proximity warning pill ── */}
        {proximityWarnings.length > 0 && (
          <div className="absolute bottom-4 left-4 right-4 sm:hidden z-20">
            <button
              onClick={() => setIntelCountry(proximityWarnings[0].country)}
              className="w-full flex items-center gap-2 bg-red-600/90 text-white backdrop-blur-sm px-4 py-3 rounded-xl text-xs font-bold shadow-lg">
              <AlertCircle size={14} />
              <span className="flex-1 text-left">{proximityWarnings[0].country} risk zone within {proximityWarnings[0].distanceKm.toLocaleString()} km</span>
              <ChevronUp size={14} />
            </button>
          </div>
        )}

      </div>
    </Layout>
  )
}

// Small arrow icons needed for panel collapse
function ChevronRight({ size, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
function ChevronLeft({ size, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}
