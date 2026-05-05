// Live Location & Map Page
// Required Supabase table:
// create table staff_locations (
//   id uuid primary key default gen_random_uuid(),
//   user_id uuid references auth.users(id) on delete cascade,
//   full_name text,
//   latitude decimal(10,8) not null, longitude decimal(11,8) not null,
//   accuracy decimal,
//   trip_name text, arrival_city text,
//   is_sharing boolean not null default true,
//   recorded_at timestamptz not null default now()
// );
// alter table staff_locations enable row level security;
// create policy "users_own"  on staff_locations for all using (auth.uid() = user_id);
// create policy "admin_all"  on staff_locations for all using (
//   exists (select 1 from profiles where id = auth.uid() and role = 'admin')
// );

import { useEffect, useState, useRef, useCallback } from 'react'
import L from 'leaflet'
import {
  Navigation, MapPin, RefreshCw, Radio,
  EyeOff, Users, Clock, AlertCircle, CheckCircle, AlertTriangle
} from 'lucide-react'
import Layout from '../components/Layout'
import IntelBrief from '../components/IntelBrief'
import { supabase } from '../lib/supabase'
import { cityToCountry, COUNTRY_META } from '../data/intelData'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

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

// Build a pin-shaped div icon
function makeIcon(color, initials) {
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${color};color:white;
      width:32px;height:32px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;
      font-weight:bold;font-size:10px;font-family:sans-serif;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;">
      <span style="transform:rotate(45deg)">${initials}</span></div>`,
    iconSize:    [32, 32],
    iconAnchor:  [16, 32],
    popupAnchor: [0, -36],
  })
}

function myIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${color};width:20px;height:20px;border-radius:50%;
      box-shadow:0 0 0 4px ${color}40,0 2px 6px rgba(0,0,0,0.3);
      border:2px solid white;"></div>`,
    iconSize:    [20, 20],
    iconAnchor:  [10, 10],
    popupAnchor: [0, -14],
  })
}

// Haversine distance in km between two GPS coordinates
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function LiveMap() {
  const [profile,       setProfile]       = useState(null)
  const [activeTrip,    setActiveTrip]    = useState(null)
  const [isAdmin,       setIsAdmin]       = useState(false)
  const [sharing,       setSharing]       = useState(false)
  const [myPos,         setMyPos]         = useState(null)
  const [gpsErr,        setGpsErr]        = useState(null)
  const [locations,     setLocations]     = useState([])
  const [loading,       setLoading]       = useState(true)
  const [intelCountry,  setIntelCountry]  = useState(null)
  const [mapReady,      setMapReady]      = useState(false)
  const [tripAlerts,    setTripAlerts]    = useState([])   // live risk alerts from AI scan
  const [proximityWarnings, setProximityWarnings] = useState([])  // nearby risk zones

  const containerRef   = useRef(null)   // DOM div
  const mapRef         = useRef(null)   // L.Map instance
  const myMarkerRef    = useRef(null)   // my position marker
  const staffMarkers   = useRef({})     // { user_id: L.Marker }
  const alertMarkers   = useRef([])     // L.CircleMarker[] for risk alerts
  const watchRef       = useRef(null)
  const updateRef      = useRef(null)

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const today = new Date().toISOString().split('T')[0]
    const [{ data: prof }, { data: trip }, { data: locs }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('itineraries').select('*')
        .eq('user_id', user.id).lte('depart_date', today).gte('return_date', today)
        .limit(1).single(),
      supabase.from('staff_locations').select('*')
        .eq('is_sharing', true)
        .gte('recorded_at', new Date(Date.now() - 86400000).toISOString())
        .order('recorded_at', { ascending: false }),
    ])

    const role = prof?.role || user.app_metadata?.role || 'traveller'
    setIsAdmin(role === 'admin')
    setProfile({ ...prof, id: user.id, email: user.email })
    setActiveTrip(trip || null)

    const seen = new Set()
    const dedup = (locs || []).filter(l => {
      if (seen.has(l.user_id)) return false
      seen.add(l.user_id)
      return true
    })
    setLocations(dedup)
    setLoading(false)

    // Fetch trip alerts in the background (fire & forget)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        fetch('/api/trip-alert-scan', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.alerts) {
              // Only show Critical / High severity alerts on the map
              const mapAlerts = data.alerts.filter(a =>
                ['Critical', 'High'].includes(a.severity) &&
                a.alert_type !== 'ai_brief' &&
                a.country
              )
              setTripAlerts(mapAlerts)
            }
          })
          .catch(() => {})
      }
    } catch {}
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Leaflet init ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center:      [-1.2921, 36.8219],   // Nairobi default
      zoom:        5,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    mapRef.current = map
    setMapReady(true)

    return () => {
      map.remove()
      mapRef.current       = null
      myMarkerRef.current  = null
      staffMarkers.current = {}
      alertMarkers.current = []
      setMapReady(false)
    }
  }, [])

  // ── Update my position marker ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady || !myPos) return
    const pos = [myPos.latitude, myPos.longitude]
    if (myMarkerRef.current) {
      myMarkerRef.current.setLatLng(pos)
    } else {
      myMarkerRef.current = L.marker(pos, { icon: myIcon(BRAND_GREEN) })
        .addTo(mapRef.current)
    }
    mapRef.current.setView(pos, 12, { animate: true })
  }, [myPos, mapReady])

  // ── Update staff markers ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return

    const currentIds = new Set(locations.map(l => l.user_id))

    // Remove markers for users no longer in list
    Object.keys(staffMarkers.current).forEach(uid => {
      if (!currentIds.has(uid)) {
        staffMarkers.current[uid].remove()
        delete staffMarkers.current[uid]
      }
    })

    // Add / update markers
    locations.forEach(loc => {
      if (loc.user_id === profile?.id) return   // skip self (shown separately)
      const pos    = [loc.latitude, loc.longitude]
      const inits  = (loc.full_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
      const country = loc.arrival_city ? cityToCountry(loc.arrival_city) : null

      const popupHtml = `
        <div style="font-family:sans-serif;font-size:12px;min-width:140px">
          <p style="font-weight:700;font-size:14px;margin:0 0 4px">${loc.full_name || 'Unknown'}</p>
          ${loc.trip_name ? `<p style="color:#374151;margin:0 0 2px">${loc.trip_name}</p>` : ''}
          ${loc.arrival_city ? `<p style="color:#6b7280;margin:0 0 2px">📍 ${loc.arrival_city}</p>` : ''}
          <p style="color:#9ca3af;margin:0 0 6px">Updated ${timeAgo(loc.recorded_at)}</p>
          ${country ? `<button onclick="window.__livemapIntel('${country.replace(/'/g, "\\'")}')"
            style="background:none;border:none;color:#0118A1;font-weight:600;cursor:pointer;padding:0;font-size:12px">
            ${country} intel brief →</button>` : ''}
        </div>`

      if (staffMarkers.current[loc.user_id]) {
        staffMarkers.current[loc.user_id].setLatLng(pos)
        staffMarkers.current[loc.user_id].getPopup()?.setContent(popupHtml)
      } else {
        const marker = L.marker(pos, { icon: makeIcon(BRAND_BLUE, inits) })
          .bindPopup(popupHtml)
          .addTo(mapRef.current)
        staffMarkers.current[loc.user_id] = marker
      }
    })
  }, [locations, profile, mapReady])

  // ── Risk alert markers (trip_alerts → map) ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    // Remove old alert markers
    alertMarkers.current.forEach(m => m.remove())
    alertMarkers.current = []

    // Group alerts by country — show one marker per country (worst severity)
    const byCountry = {}
    for (const alert of tripAlerts) {
      const country = alert.country
      const meta    = COUNTRY_META[country]
      if (!meta) continue
      if (!byCountry[country]) {
        byCountry[country] = { meta, alerts: [], severity: alert.severity }
      }
      byCountry[country].alerts.push(alert)
      const order = { Critical: 4, High: 3, Medium: 2, Low: 1 }
      if ((order[alert.severity] || 0) > (order[byCountry[country].severity] || 0)) {
        byCountry[country].severity = alert.severity
      }
    }

    for (const [country, { meta, alerts, severity }] of Object.entries(byCountry)) {
      const color  = severity === 'Critical' ? '#dc2626' : '#f97316'
      const radius = severity === 'Critical' ? 18 : 14

      const safeName  = country.replace(/'/g, "\\'")
      const alertList = alerts.slice(0, 3).map(a =>
        `<li style="margin:2px 0;color:#374151">• <b>${a.alert_type}:</b> ${(a.title || '').slice(0, 60)}</li>`
      ).join('')

      // Show distance from user if GPS is available
      const distLine = myPos
        ? (() => {
            const km = Math.round(haversineKm(myPos.latitude, myPos.longitude, meta.lat, meta.lon))
            return `<p style="font-size:10px;color:#6b7280;margin:0 0 6px">📍 ~${km.toLocaleString()} km from your position</p>`
          })()
        : ''

      const popupHtml = `
        <div style="font-family:sans-serif;font-size:12px;min-width:180px;max-width:220px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>
            <b style="font-size:13px;color:#111">${country}</b>
            <span style="margin-left:auto;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;
              background:${color}20;color:${color};border:1px solid ${color}50">${severity}</span>
          </div>
          ${distLine}
          <ul style="margin:0 0 6px;padding:0;list-style:none;font-size:11px">${alertList}</ul>
          ${alerts.length > 3 ? `<p style="font-size:10px;color:#9ca3af;margin:0 0 6px">+${alerts.length - 3} more alerts</p>` : ''}
          <button onclick="window.__livemapIntel('${safeName}')"
            style="width:100%;background:#0118A1;color:white;border:none;border-radius:4px;
            padding:5px 8px;font-size:11px;font-weight:600;cursor:pointer;text-align:center">
            View ${country} Intel →
          </button>
        </div>`

      const marker = L.circleMarker([meta.lat, meta.lon], {
        radius,
        color,
        fillColor: color,
        fillOpacity: 0.25,
        weight: 2,
        opacity: 0.8,
        className: 'risk-pulse',
      })
        .bindPopup(popupHtml, { maxWidth: 240 })
        .addTo(map)

      alertMarkers.current.push(marker)
    }
  }, [tripAlerts, myPos, mapReady])

  // ── Proximity warnings — how close is the user to active risk zones? ────────
  useEffect(() => {
    if (!myPos || tripAlerts.length === 0) {
      setProximityWarnings([])
      return
    }

    // Distance thresholds by severity (km)
    const THRESHOLD = { Critical: 500, High: 300, Medium: 200 }

    // Group by country, escalate to worst severity
    const byCountry = {}
    for (const alert of tripAlerts) {
      const country = alert.country
      if (!country) continue
      const meta = COUNTRY_META[country]
      if (!meta) continue
      if (!byCountry[country]) {
        byCountry[country] = { country, meta, severity: alert.severity, alerts: [] }
      }
      byCountry[country].alerts.push(alert)
      const order = { Critical: 4, High: 3, Medium: 2, Low: 1 }
      if ((order[alert.severity] || 0) > (order[byCountry[country].severity] || 0)) {
        byCountry[country].severity = alert.severity
      }
    }

    const warnings = []
    for (const { country, meta, severity, alerts } of Object.values(byCountry)) {
      const km = haversineKm(myPos.latitude, myPos.longitude, meta.lat, meta.lon)
      const threshold = THRESHOLD[severity] || 300
      if (km <= threshold) {
        warnings.push({ country, severity, distanceKm: Math.round(km), alerts })
      }
    }

    warnings.sort((a, b) => a.distanceKm - b.distanceKm)
    setProximityWarnings(warnings)
  }, [myPos, tripAlerts])

  // Register intel brief global handler
  useEffect(() => {
    window.__livemapIntel = (country) => setIntelCountry(country)
    return () => { delete window.__livemapIntel }
  }, [])

  // ── Location sharing ────────────────────────────────────────────────────────
  const pushLocation = useCallback(async (coords) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await supabase.from('staff_locations').insert({
      user_id:      session.user.id,
      full_name:    profile?.full_name || profile?.email || 'Unknown',
      latitude:     coords.latitude,
      longitude:    coords.longitude,
      accuracy:     coords.accuracy,
      trip_name:    activeTrip?.trip_name    || null,
      arrival_city: activeTrip?.arrival_city || null,
      is_sharing:   true,
      recorded_at:  new Date().toISOString(),
    })

    if (session.access_token) {
      fetch('/api/trip-alert-scan', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {})
    }

    loadData()
  }, [profile, activeTrip, loadData])

  const startSharing = () => {
    if (!navigator.geolocation) { setGpsErr('GPS not supported on this device'); return }
    setGpsErr(null)
    setSharing(true)

    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        setMyPos(pos.coords)
        if (updateRef.current) clearTimeout(updateRef.current)
        updateRef.current = setTimeout(() => pushLocation(pos.coords), 500)
      },
      err => { setGpsErr(err.message); setSharing(false) },
      { enableHighAccuracy: true, maximumAge: 30000 }
    )
  }

  const stopSharing = async () => {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current)
    watchRef.current = null
    setSharing(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('staff_locations')
        .update({ is_sharing: false })
        .eq('user_id', user.id)
    }
    loadData()
  }

  useEffect(() => () => {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current)
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout>
      {intelCountry && <IntelBrief country={intelCountry} onClose={() => setIntelCountry(null)} />}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: BRAND_BLUE }}>
          <Navigation size={20} color="white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live Location</h1>
          <p className="text-sm text-gray-500">Share your position and see your team on the map</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Sharing Location', value: locations.length,                                         color: 'text-[#0118A1]' },
          { label: 'Active Trips',     value: locations.filter(l => l.trip_name).length,                color: 'text-green-600' },
          { label: 'Risk Alerts',      value: tripAlerts.length,                                        color: tripAlerts.some(a => a.severity === 'Critical') ? 'text-red-600' : tripAlerts.length > 0 ? 'text-orange-500' : 'text-gray-500' },
          { label: 'Last Updated',     value: locations[0] ? timeAgo(locations[0].recorded_at) : '—',  color: 'text-gray-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-[8px] border border-gray-200 p-4 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Map ── */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-[12px] border border-gray-200 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
            style={{ height: 480 }}>
            <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>

        {/* ── Side panel ── */}
        <div className="space-y-4">

          {/* My location sharing toggle */}
          <div className="bg-white border border-gray-200 rounded-[12px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">My Location</p>

            {sharing ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Sharing live location
                </div>
                {myPos && (
                  <p className="text-xs text-gray-500">
                    {myPos.latitude.toFixed(5)}, {myPos.longitude.toFixed(5)}<br />
                    Accuracy ±{Math.round(myPos.accuracy || 0)}m
                  </p>
                )}
                {activeTrip && (
                  <p className="text-xs text-blue-600 flex items-center gap-1">
                    <MapPin size={9} />{activeTrip.trip_name} · {activeTrip.arrival_city}
                  </p>
                )}
                <button onClick={stopSharing}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-gray-200 rounded-[6px] text-sm text-gray-600 hover:bg-gray-50">
                  <EyeOff size={13} />Stop Sharing
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Your location is not being shared.</p>
                {gpsErr && <p className="text-xs text-red-500">{gpsErr}</p>}
                <button onClick={startSharing}
                  style={{ background: BRAND_GREEN, color: BRAND_BLUE }}
                  className="w-full flex items-center justify-center gap-2 font-bold py-2.5 rounded-[6px] text-sm hover:opacity-90">
                  <Navigation size={13} />Share My Location
                </button>
              </div>
            )}
          </div>

          {/* Proximity warnings — only when GPS is active and risks are nearby */}
          {proximityWarnings.length > 0 && (
            <div className="bg-white border-2 border-red-400 rounded-[12px] p-4 shadow-[0_2px_8px_rgba(220,38,38,0.15)]">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={13} className="text-red-600" />
                <p className="text-xs font-bold text-red-700 uppercase tracking-wider flex-1">Nearby Risk Zones</p>
                <span className="text-[10px] font-bold bg-red-100 text-red-700 rounded-full px-2 py-0.5">{proximityWarnings.length}</span>
              </div>
              <div className="space-y-2">
                {proximityWarnings.map((w, i) => (
                  <div key={i}
                    className={`p-2.5 rounded-[6px] border cursor-pointer hover:opacity-80 transition-opacity
                      ${w.severity === 'Critical' ? 'bg-red-50 border-red-300' : 'bg-orange-50 border-orange-300'}`}
                    onClick={() => setIntelCountry(w.country)}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase
                        ${w.severity === 'Critical' ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'}`}>
                        {w.severity}
                      </span>
                      <span className="text-[10px] font-semibold text-gray-700 flex-1">{w.country}</span>
                      <span className="text-[10px] font-bold text-gray-500">~{w.distanceKm.toLocaleString()} km</span>
                    </div>
                    <p className="text-[11px] text-gray-600 leading-snug">
                      {w.alerts[0]?.title?.slice(0, 65) || 'Active risk zone'}
                      {w.alerts.length > 1 ? ` +${w.alerts.length - 1} more` : ''}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-gray-400 mt-2 text-center">Based on your current GPS position · Click for full intel</p>
            </div>
          )}

          {/* Risk alerts panel */}
          {tripAlerts.length > 0 && (
            <div className="bg-white border border-red-200 rounded-[12px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={13} className="text-red-500" />
                <p className="text-xs font-bold text-red-600 uppercase tracking-wider flex-1">Live Risk Alerts</p>
                <span className="text-[10px] font-bold bg-red-100 text-red-600 rounded-full px-2 py-0.5">{tripAlerts.length}</span>
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {tripAlerts.slice(0, 8).map((a, i) => (
                  <div key={i}
                    className={`p-2.5 rounded-[6px] border cursor-pointer hover:opacity-80 transition-opacity
                      ${a.severity === 'Critical' ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}
                    onClick={() => a.country && setIntelCountry(a.country)}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase
                        ${a.severity === 'Critical' ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'}`}>
                        {a.severity}
                      </span>
                      <span className="text-[10px] font-semibold text-gray-600">{a.country}</span>
                    </div>
                    <p className="text-[11px] text-gray-700 font-medium leading-snug line-clamp-2">{a.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Staff list */}
          <div className="bg-white border border-gray-200 rounded-[12px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                {isAdmin ? 'All Staff Locations' : 'My Team'}
              </p>
              <button onClick={loadData} className="text-gray-400 hover:text-gray-600">
                <RefreshCw size={13} />
              </button>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-50 rounded animate-pulse" />)}
              </div>
            ) : locations.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-4">No staff are currently sharing location.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {locations.map(loc => {
                  const country = loc.arrival_city ? cityToCountry(loc.arrival_city) : null
                  const isMe    = loc.user_id === profile?.id
                  return (
                    <div key={loc.id}
                      className={`flex items-center gap-2.5 p-2.5 rounded-[8px] border ${isMe ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                        style={{ background: isMe ? BRAND_GREEN : BRAND_BLUE, color: isMe ? BRAND_BLUE : 'white' }}>
                        {(loc.full_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">{loc.full_name}{isMe && ' (you)'}</p>
                        <p className="text-[10px] text-gray-400">{loc.arrival_city || 'Unknown'} · {timeAgo(loc.recorded_at)}</p>
                      </div>
                      {country && (
                        <button onClick={() => setIntelCountry(country)}
                          className="text-[9px] text-[#0118A1] hover:underline font-medium shrink-0">
                          Intel
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
