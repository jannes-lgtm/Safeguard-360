import { useEffect, useState } from 'react'
import {
  X, AlertCircle, Globe, Shield, Newspaper,
  Briefcase, ExternalLink, RefreshCw, MapPin,
  Thermometer, Wind, Droplets, CheckCircle
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { COUNTRY_META, SEVERITY_STYLE, INTEL_FEEDS, matchesCountry } from '../data/intelData'

const BRAND_BLUE  = '#0118A1'

// ── WMO weather codes ─────────────────────────────────────────────────────────
const WMO = {
  0: '☀️ Clear', 1: '🌤 Mainly clear', 2: '⛅ Partly cloudy', 3: '☁️ Overcast',
  45: '🌫 Foggy', 48: '🌫 Icy fog', 51: '🌦 Light drizzle', 53: '🌦 Drizzle',
  55: '🌧 Heavy drizzle', 61: '🌧 Light rain', 63: '🌧 Rain', 65: '🌧 Heavy rain',
  71: '🌨 Light snow', 73: '🌨 Snow', 75: '❄️ Heavy snow', 80: '🌦 Showers',
  81: '🌧 Heavy showers', 82: '⛈ Violent showers', 95: '⛈ Thunderstorm', 99: '⛈ Hail storm',
}

function timeAgo(dateStr) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  if (isNaN(diff)) return null
  const s = Math.floor(diff / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)   return `${d}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function SectionHeader({ label }) {
  return (
    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">{label}</p>
  )
}

// ── Risk overview (from /api/country-risk) ────────────────────────────────────
function RiskOverview({ country }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/country-risk?country=${encodeURIComponent(country)}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [country])

  if (loading) return (
    <div className="bg-gray-50 rounded-[8px] border border-gray-200 p-4 animate-pulse h-20"/>
  )
  if (!data) return null

  const sev = data.severity || 'Medium'
  const style = SEVERITY_STYLE[sev] || SEVERITY_STYLE.Medium

  return (
    <div className={`rounded-[8px] border p-4 ${style.bg} ${style.border}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${style.dot}`}/>
          <span className={`text-sm font-bold ${style.text}`}>{sev} Risk</span>
        </div>
        <Shield size={14} className={style.text}/>
      </div>
      {data.sources && data.sources.length > 0 && (
        <div className="space-y-1">
          {data.sources.map((s, i) => (
            <p key={i} className={`text-xs ${style.text} opacity-90`}>
              <span className="font-semibold">{s.source}:</span> {s.level}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Weather mini-card ─────────────────────────────────────────────────────────
function WeatherCard({ country }) {
  const [wx, setWx]           = useState(null)
  const [loading, setLoading] = useState(true)
  const meta = COUNTRY_META[country]

  useEffect(() => {
    if (!meta) { setLoading(false); return }
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${meta.lat}&longitude=${meta.lon}&current=temperature_2m,weathercode,wind_speed_10m,relative_humidity_2m&timezone=auto`)
      .then(r => r.json())
      .then(d => { setWx(d.current); setLoading(false) })
      .catch(() => setLoading(false))
  }, [country])

  if (loading) return <div className="h-10 bg-gray-50 rounded animate-pulse"/>
  if (!wx) return null

  return (
    <div className="flex items-center gap-4 bg-gray-50 rounded-[8px] border border-gray-200 px-4 py-2.5 text-sm text-gray-700">
      <span className="text-base">{WMO[wx.weathercode]?.split(' ')[0] || '🌡'}</span>
      <span className="flex items-center gap-1"><Thermometer size={12} className="text-gray-400"/>{wx.temperature_2m}°C</span>
      <span className="flex items-center gap-1"><Wind size={12} className="text-gray-400"/>{wx.wind_speed_10m} km/h</span>
      <span className="flex items-center gap-1"><Droplets size={12} className="text-gray-400"/>{wx.relative_humidity_2m}%</span>
    </div>
  )
}

// ── Active alerts section ─────────────────────────────────────────────────────
function AlertsSection({ country }) {
  const [alerts, setAlerts]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('alerts').select('*')
      .eq('status', 'Active')
      .ilike('country', `%${country}%`)
      .order('date_issued', { ascending: false })
      .limit(5)
      .then(({ data }) => { setAlerts(data || []); setLoading(false) })
  }, [country])

  const severityDot = { Critical: 'bg-red-500', High: 'bg-orange-500', Medium: 'bg-yellow-400', Low: 'bg-green-400' }

  return (
    <div>
      <SectionHeader label={`Active Alerts${alerts.length ? ` (${alerts.length})` : ''}`}/>
      {loading ? (
        <div className="space-y-2">
          {[1,2].map(i => <div key={i} className="h-10 bg-gray-50 rounded animate-pulse"/>)}
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 border border-green-200 rounded-[8px] px-3 py-2">
          <CheckCircle size={13}/> No active alerts for {country}
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map(a => {
            const sev = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.Medium
            return (
              <div key={a.id} className={`flex items-start gap-2.5 rounded-[8px] border px-3 py-2.5 ${sev.bg} ${sev.border}`}>
                <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${severityDot[a.severity] || 'bg-gray-400'}`}/>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${sev.text}`}>{a.title}</p>
                  {a.location && <p className={`text-[11px] ${sev.text} opacity-75 flex items-center gap-1 mt-0.5`}><MapPin size={9}/>{a.location}</p>}
                </div>
                <span className={`text-[10px] font-bold shrink-0 ${sev.text}`}>{a.severity}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Intel feed section (live RSS articles) ────────────────────────────────────
function IntelFeedSection({ country }) {
  const [articles, setArticles] = useState([])
  const [loaded, setLoaded]     = useState(0)
  const total = INTEL_FEEDS.length

  useEffect(() => {
    setArticles([])
    setLoaded(0)
    INTEL_FEEDS.forEach(feed => {
      fetch(`/api/rss-ingest?id=${feed.id}&limit=20`)
        .then(r => r.json())
        .then(d => {
          const matched = (d.articles || []).filter(a =>
            matchesCountry(`${a.title || ''} ${a.description || ''}`, country)
          ).map(a => ({ ...a, feedName: feed.name }))
          setArticles(prev =>
            [...prev, ...matched]
              .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
              .slice(0, 10)
          )
          setLoaded(p => p + 1)
        })
        .catch(() => setLoaded(p => p + 1))
    })
  }, [country])

  const pct = Math.round((loaded / total) * 100)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <SectionHeader label="Intelligence Feed"/>
        {loaded < total && (
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <RefreshCw size={9} className="animate-spin"/>{loaded}/{total} feeds
          </div>
        )}
      </div>

      {/* Progress bar while loading */}
      {loaded < total && (
        <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-3">
          <div className="h-full bg-[#0118A1]/30 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}/>
        </div>
      )}

      {articles.length === 0 && loaded === total ? (
        <p className="text-xs text-gray-400 italic py-3 text-center">No recent intel articles found for {country}.</p>
      ) : (
        <div className="space-y-2">
          {articles.map((a, i) => (
            <a key={i} href={a.link || '#'} target="_blank" rel="noopener noreferrer"
              className="block bg-white border border-gray-200 rounded-[8px] px-3 py-2.5 hover:border-[#0118A1]/30 hover:shadow-sm transition-all group">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-800 leading-snug group-hover:text-[#0118A1] line-clamp-2 flex-1">
                  {a.title}
                </p>
                <ExternalLink size={10} className="text-gray-300 group-hover:text-[#0118A1] shrink-0 mt-0.5"/>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{a.feedName}</span>
                {a.date && <span className="text-[10px] text-gray-400">{timeAgo(a.date)}</span>}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Service providers section ─────────────────────────────────────────────────
function ProvidersSection({ country }) {
  const [providers, setProviders] = useState([])
  const [loading, setLoading]     = useState(true)

  const CAT_EMOJI = {
    transport: '🚗', vehicle: '🚙', protection: '🛡️', medical: '🏥',
    evacuation: '🚁', accommodation: '🏨', aviation: '✈️', legal: '⚖️',
    translation: '🌐', other: '📋',
  }

  useEffect(() => {
    supabase.from('service_providers').select('id,name,category,status,city')
      .eq('country', country)
      .eq('status', 'vetted')
      .order('category').order('name')
      .limit(8)
      .then(({ data }) => { setProviders(data || []); setLoading(false) })
  }, [country])

  if (loading) return <div className="h-14 bg-gray-50 rounded animate-pulse"/>
  if (providers.length === 0) return (
    <div>
      <SectionHeader label="Service Providers"/>
      <p className="text-xs text-gray-400 italic">No vetted providers on file for {country}.</p>
    </div>
  )

  return (
    <div>
      <SectionHeader label={`Vetted Providers in ${country} (${providers.length})`}/>
      <div className="space-y-1.5">
        {providers.map(p => (
          <div key={p.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-[8px] px-3 py-2">
            <span className="text-sm">{CAT_EMOJI[p.category] || '📋'}</span>
            <span className="text-xs font-medium text-gray-800 flex-1">{p.name}</span>
            {p.city && <span className="text-[10px] text-gray-400">{p.city}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main IntelBrief drawer ────────────────────────────────────────────────────
export default function IntelBrief({ country, travelerName, returnDate, onClose }) {
  if (!country) return null

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" style={{ background: 'rgba(0,0,0,0.35)' }}
      onClick={onClose}>
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Globe size={16} className="text-[#0118A1]"/>
                <h2 className="text-lg font-bold text-gray-900">{country}</h2>
              </div>
              {travelerName && (
                <p className="text-xs text-gray-500">
                  Intel brief for <span className="font-semibold">{travelerName}</span>
                  {returnDate && ` · Returns ${fmtDate(returnDate)}`}
                </p>
              )}
              {!travelerName && (
                <p className="text-xs text-gray-500">Live country intelligence brief</p>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 mt-0.5 shrink-0">
              <X size={18}/>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 p-5 space-y-6">

          {/* Risk overview */}
          <div>
            <SectionHeader label="Risk Assessment"/>
            <RiskOverview country={country}/>
          </div>

          {/* Weather */}
          <div>
            <SectionHeader label="Current Conditions"/>
            <WeatherCard country={country}/>
          </div>

          {/* Active alerts */}
          <AlertsSection country={country}/>

          {/* Live intel feed */}
          <IntelFeedSection country={country}/>

          {/* Service providers */}
          <ProvidersSection country={country}/>

        </div>
      </div>
    </div>
  )
}
