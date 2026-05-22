import { useState, useEffect, useCallback } from 'react'
import { Radio, RefreshCw, MapPin, ChevronRight, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cityToCountry } from '../data/intelData'
import Layout from '../components/Layout'

const INTEL_REGION = {
  Nigeria: 'WEST AFRICA', Ghana: 'WEST AFRICA', Senegal: 'WEST AFRICA', Mali: 'WEST AFRICA',
  'Burkina Faso': 'WEST AFRICA', Niger: 'WEST AFRICA', Cameroon: 'WEST AFRICA',
  Kenya: 'EAST AFRICA', Ethiopia: 'EAST AFRICA', Somalia: 'EAST AFRICA',
  Tanzania: 'EAST AFRICA', Uganda: 'EAST AFRICA', Rwanda: 'EAST AFRICA',
  Sudan: 'EAST AFRICA', Chad: 'EAST AFRICA',
  'South Africa': 'SOUTHERN AFRICA', Zimbabwe: 'SOUTHERN AFRICA', Mozambique: 'SOUTHERN AFRICA',
  Libya: 'NORTH AFRICA', Egypt: 'NORTH AFRICA', Tunisia: 'NORTH AFRICA', Algeria: 'NORTH AFRICA',
  UAE: 'GULF', 'Saudi Arabia': 'GULF', Kuwait: 'GULF', Iraq: 'GULF',
  Lebanon: 'LEVANT', Yemen: 'LEVANT', Syria: 'LEVANT',
  Afghanistan: 'CENTRAL ASIA', Pakistan: 'CENTRAL ASIA', Myanmar: 'SOUTHEAST ASIA',
  'Democratic Republic of Congo': 'CENTRAL AFRICA', Iran: 'MIDDLE EAST',
}

const SEV = {
  5: { bg: 'rgba(168,53,53,0.15)',   color: '#FCA5A5', border: 'rgba(168,53,53,0.30)',   bar: '#EF4444', label: 'CRITICAL' },
  4: { bg: 'rgba(249,115,22,0.12)',  color: '#FDBA74', border: 'rgba(249,115,22,0.25)',  bar: '#F97316', label: 'HIGH' },
  3: { bg: 'rgba(234,179,8,0.12)',   color: '#FDE68A', border: 'rgba(234,179,8,0.25)',   bar: '#EAB308', label: 'MEDIUM' },
  2: { bg: 'rgba(170,204,0,0.08)',   color: '#AACC00', border: 'rgba(170,204,0,0.18)',   bar: '#AACC00', label: 'LOW' },
  1: { bg: 'rgba(148,163,184,0.08)', color: '#94A3B8', border: 'rgba(148,163,184,0.18)', bar: '#94A3B8', label: 'INFO' },
}

const EVENT_LABEL = {
  weather_disaster: 'WEATHER',
  armed_conflict:   'CONFLICT',
  civil_unrest:     'UNREST',
  terrorism:        'TERRORISM',
  aviation_disruption: 'AVIATION',
  border_closure:   'BORDER',
  kidnap_ransom:    'K&R',
  health_emergency: 'HEALTH',
  infrastructure:   'INFRASTRUCTURE',
  political:        'POLITICAL',
  economic:         'ECONOMIC',
  crime:            'CRIME',
  major_event:      'MAJOR EVENT',
}

const FILTERS = ['All', 'Your Routes', 'Critical', 'High', 'Weather', 'Conflict', 'Aviation']

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { 'Accept-Language': 'en' }, signal: AbortSignal.timeout(4000) }
    )
    const d = await res.json()
    return d?.address?.country || null
  } catch { return null }
}

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60), m = mins % 60
  return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`
}

export default function LiveIntelFeed() {
  const [items, setItems]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)
  const [filter, setFilter]             = useState('All')
  const [tripCountries, setTripCountries] = useState([])
  const [locationCountry, setLocationCountry] = useState(null)
  const [lastUpdated, setLastUpdated]   = useState(null)

  // Fetch user's upcoming trips
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('itineraries')
        .select('arrival_city, status')
        .eq('user_id', user.id)
        .neq('status', 'Completed')
        .then(({ data }) => {
          const countries = [...new Set(
            (data || []).map(t => cityToCountry(t.arrival_city) || t.arrival_city).filter(Boolean)
          )]
          setTripCountries(countries)
        })
    })
  }, [])

  // Request location once
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const c = await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
        if (c) setLocationCountry(c)
      },
      () => {}
    )
  }, [])

  const fetchIntel = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    const priorityCountries = [...new Set([...tripCountries, locationCountry].filter(Boolean))]
    const FIELDS = 'id, country, city, severity, movement_impact, raw_title, raw_summary, ingested_at, event_type'

    let priority = [], general = []

    if (priorityCountries.length > 0) {
      const { data } = await supabase
        .from('live_intelligence')
        .select(FIELDS)
        .eq('is_active', true)
        .in('country', priorityCountries)
        .order('severity', { ascending: false })
        .order('ingested_at', { ascending: false })
        .limit(10)
      priority = data || []
    }

    const seenIds = priority.map(r => r.id)
    const { data } = await supabase
      .from('live_intelligence')
      .select(FIELDS)
      .eq('is_active', true)
      .not('id', 'in', seenIds.length > 0 ? `(${seenIds.join(',')})` : '(00000000-0000-0000-0000-000000000000)')
      .order('severity', { ascending: false })
      .order('ingested_at', { ascending: false })
      .limit(40)
    general = data || []

    setItems([...priority, ...general])
    setLastUpdated(new Date())
    setLoading(false)
    setRefreshing(false)
  }, [tripCountries, locationCountry])

  useEffect(() => { fetchIntel() }, [fetchIntel])

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const t = setInterval(() => fetchIntel(true), 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [fetchIntel])

  const filtered = items.filter(item => {
    if (filter === 'All') return true
    if (filter === 'Your Routes') return tripCountries.includes(item.country) || item.country === locationCountry
    if (filter === 'Critical') return item.severity === 5
    if (filter === 'High') return item.severity >= 4
    if (filter === 'Weather') return item.event_type === 'weather_disaster'
    if (filter === 'Conflict') return ['armed_conflict', 'terrorism', 'civil_unrest'].includes(item.event_type)
    if (filter === 'Aviation') return item.event_type === 'aviation_disruption'
    return true
  })

  const utc = new Date().toUTCString().slice(17, 25)
  const contextLabel = tripCountries.length > 0
    ? `Prioritising ${tripCountries.slice(0, 3).join(', ')}${tripCountries.length > 3 ? ` +${tripCountries.length - 3} more` : ''}`
    : locationCountry ? `Localised to ${locationCountry}` : 'Global operational feed'

  return (
    <Layout>
      <div style={{ background: '#090A0C', minHeight: '100vh', padding: '32px 32px 48px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(170,204,0,0.10)', border: '1px solid rgba(170,204,0,0.20)' }}>
                <Radio size={15} style={{ color: '#AACC00' }} />
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#EAEEF5', letterSpacing: '-0.02em' }}>Live Intelligence Feed</h1>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 700, color: '#AACC00', letterSpacing: '0.12em', padding: '3px 8px', background: 'rgba(170,204,0,0.08)', border: '1px solid rgba(170,204,0,0.20)' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#AACC00', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                LIVE
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: '#6E7480' }}>{utc} UTC</span>
              <span style={{ fontSize: 9, color: '#3C4050' }}>·</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6E7480' }}>
                <MapPin size={10} style={{ color: '#AACC00' }} />{contextLabel}
              </span>
              {lastUpdated && (
                <>
                  <span style={{ fontSize: 9, color: '#3C4050' }}>·</span>
                  <span style={{ fontSize: 11, color: '#3C4050' }}>Updated {timeAgo(lastUpdated.toISOString())}</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={() => fetchIntel(true)}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.07)', background: '#11131A', color: refreshing ? '#3C4050' : '#EAEEF5', transition: 'all 0.15s' }}
          >
            <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Trip context banner */}
        {tripCountries.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'rgba(170,204,0,0.06)', border: '1px solid rgba(170,204,0,0.18)', marginBottom: 20 }}>
            <Zap size={12} style={{ color: '#AACC00', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#EAEEF5' }}>
              <span style={{ color: '#AACC00', fontWeight: 700 }}>YOUR ROUTES ACTIVE —</span>{' '}
              Intel for {tripCountries.join(', ')} is surfaced first based on your planned travel.
            </span>
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: '5px 13px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                background: filter === f ? '#AACC00' : 'rgba(255,255,255,0.06)',
                color: filter === f ? '#090A0C' : '#6E7480',
              }}>
              {f}
              {f === 'Your Routes' && tripCountries.length > 0 && (
                <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 700, color: filter === f ? '#090A0C' : '#AACC00' }}>{tripCountries.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Feed */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} style={{ height: 90, background: '#11131A', border: '1px solid rgba(255,255,255,0.07)' }} className="animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0', gap: 12 }}>
            <Radio size={32} style={{ color: '#3C4050' }} />
            <p style={{ fontSize: 14, color: '#6E7480', fontWeight: 600 }}>No items match this filter</p>
            <button onClick={() => setFilter('All')} style={{ fontSize: 12, color: '#AACC00', background: 'none', border: 'none', cursor: 'pointer' }}>Clear filter →</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {filtered.map(item => {
              const sev = SEV[item.severity] || SEV[2]
              const isPriority = tripCountries.includes(item.country) || item.country === locationCountry
              const region = INTEL_REGION[item.country] || item.country?.toUpperCase() || 'GLOBAL'
              const location = item.city ? `${item.city}, ${item.country}` : item.country
              const evLabel = EVENT_LABEL[item.event_type] || item.event_type?.replace(/_/g, ' ').toUpperCase()
              return (
                <div key={item.id} style={{
                  display: 'flex', gap: 0, alignItems: 'stretch',
                  background: isPriority ? sev.bg : '#11131A',
                  border: `1px solid ${isPriority ? sev.border : 'rgba(255,255,255,0.07)'}`,
                  transition: 'background 0.15s',
                }}>
                  {/* Severity bar */}
                  <div style={{ width: 3, flexShrink: 0, background: sev.bar }} />
                  <div style={{ flex: 1, padding: '14px 18px' }}>
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: sev.color, textTransform: 'uppercase' }}>{region}</span>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)' }}>·</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: sev.color, padding: '1px 6px', background: sev.bg, border: `1px solid ${sev.border}` }}>{sev.label}</span>
                        {evLabel && (
                          <span style={{ fontSize: 9, fontWeight: 600, color: '#6E7480', padding: '1px 6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>{evLabel}</span>
                        )}
                        {isPriority && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#AACC00', padding: '1px 6px', background: 'rgba(170,204,0,0.10)', border: '1px solid rgba(170,204,0,0.22)' }}>YOUR ROUTE</span>
                        )}
                      </div>
                      <span style={{ fontSize: 10, color: '#3C4050', fontFamily: 'monospace', flexShrink: 0 }}>{timeAgo(item.ingested_at)}</span>
                    </div>
                    {/* Title */}
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#EAEEF5', lineHeight: 1.4, marginBottom: 5 }}>{item.raw_title}</p>
                    {/* Body */}
                    {item.raw_summary && (
                      <p style={{ fontSize: 12, color: '#6E7480', lineHeight: 1.6, marginBottom: 6 }}>{item.raw_summary.slice(0, 220)}</p>
                    )}
                    {/* Footer */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MapPin size={9} style={{ color: '#3C4050' }} />
                      <span style={{ fontSize: 10, color: '#3C4050' }}>{location}</span>
                      {item.movement_impact && item.movement_impact !== 'none' && (
                        <>
                          <span style={{ fontSize: 9, color: '#3C4050' }}>·</span>
                          <span style={{ fontSize: 10, color: sev.color, fontWeight: 600, textTransform: 'uppercase' }}>
                            {item.movement_impact} movement impact
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    </Layout>
  )
}
