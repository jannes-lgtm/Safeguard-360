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
  EyeOff, Users, Clock, AlertCircle, CheckCircle
} from 'lucide-react'
import Layout from '../components/Layout'
import IntelBrief from '../components/IntelBrief'
import { supabase } from '../lib/supabase'
import { cityToCountry } from '../data/intelData'

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

  const containerRef  = useRef(null)   // DOM div
  const mapRef        = useRef(null)   // L.Map instance
  const myMarkerRef   = useRef(null)   // my position marker
  const staffMarkers  = useRef({})     // { user_id: L.Marker }
  const watchRef      = useRef(null)
  const updateRef     = useRef(null)

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
      mapRef.current  = null
      myMarkerRef.current = null
      staffMarkers.current = {}
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
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: 'Sharing Location', value: locations.length,                                  color: 'text-[#0118A1]' },
          { label: 'Active Trips',     value: locations.filter(l => l.trip_name).length,         color: 'text-green-600' },
          { label: 'Last Updated',     value: locations[0] ? timeAgo(locations[0].recorded_at) : '—', color: 'text-gray-600' },
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
