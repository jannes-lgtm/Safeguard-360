import { useEffect, useState, useRef } from 'react'
import {
  X, AlertCircle, Globe, Shield, Newspaper,
  Briefcase, ExternalLink, RefreshCw, MapPin,
  Thermometer, Wind, Droplets, CheckCircle,
  Brain, Send, ChevronDown, ChevronUp, Zap,
  AlertTriangle, TrendingUp, ListChecks
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { COUNTRY_META, SEVERITY_STYLE, INTEL_FEEDS, matchesCountry } from '../data/intelData'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

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

function SectionHeader({ label, icon: Icon }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {Icon && <Icon size={12} className="text-gray-400"/>}
      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">{label}</p>
    </div>
  )
}

const THREAT_STYLE = {
  Critical: { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    dot: 'bg-red-500'    },
  High:     { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' },
  Medium:   { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-400'  },
  Low:      { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  dot: 'bg-green-500'  },
}

// ── AI Security Brief ─────────────────────────────────────────────────────────
function AiBriefSection({ brief, loading }) {
  const [expanded, setExpanded] = useState(true)

  if (loading) {
    return (
      <div className="rounded-[8px] border border-[#0118A1]/20 bg-[#0118A1]/5 p-4 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <Brain size={13} className="text-[#0118A1]"/>
          <span className="text-xs font-bold text-[#0118A1]">Generating AI brief...</span>
          <RefreshCw size={10} className="text-[#0118A1]/60 animate-spin ml-auto"/>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-[#0118A1]/10 rounded w-full"/>
          <div className="h-3 bg-[#0118A1]/10 rounded w-4/5"/>
          <div className="h-3 bg-[#0118A1]/10 rounded w-3/5"/>
        </div>
      </div>
    )
  }

  if (!brief) {
    return (
      <div className="rounded-[8px] border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center gap-2">
          <Brain size={13} className="text-gray-400"/>
          <span className="text-xs text-gray-500">AI brief unavailable — add ANTHROPIC_API_KEY to enable</span>
        </div>
      </div>
    )
  }

  const st = THREAT_STYLE[brief.threat_level] || THREAT_STYLE.Medium

  return (
    <div className={`rounded-[8px] border ${st.border} ${st.bg}`}>
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <Brain size={13} className={st.text}/>
          <span className={`text-xs font-bold ${st.text}`}>AI Security Assessment</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.bg} border ${st.border} ${st.text}`}>
            {brief.threat_level}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-gray-400 hidden sm:block">Claude AI</span>
          {expanded ? <ChevronUp size={12} className="text-gray-400"/> : <ChevronDown size={12} className="text-gray-400"/>}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-black/5 pt-3">
          {/* Summary */}
          <p className={`text-xs leading-relaxed ${st.text}`}>{brief.summary}</p>

          {/* Key risks */}
          {brief.key_risks?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle size={10} className={`${st.text} opacity-70`}/>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${st.text} opacity-70`}>Key Risks</span>
              </div>
              <ul className="space-y-1">
                {brief.key_risks.map((r, i) => (
                  <li key={i} className={`flex items-start gap-1.5 text-xs ${st.text}`}>
                    <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'currentColor', opacity: 0.6 }}/>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {brief.recommendations?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <ListChecks size={10} className={`${st.text} opacity-70`}/>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${st.text} opacity-70`}>Recommendations</span>
              </div>
              <ul className="space-y-1">
                {brief.recommendations.map((r, i) => (
                  <li key={i} className={`flex items-start gap-1.5 text-xs ${st.text}`}>
                    <CheckCircle size={9} className="mt-0.5 shrink-0 opacity-70"/>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Risk overview (FCDO advisory) ─────────────────────────────────────────────
function RiskOverview({ data, loading }) {
  if (loading) return <div className="bg-gray-50 rounded-[8px] border border-gray-200 p-4 animate-pulse h-20"/>
  if (!data) return null

  const sev   = data.severity
  const style = sev ? (SEVERITY_STYLE[sev] || SEVERITY_STYLE.Medium) : null

  if (!sev) {
    const fcdoSrc = data.sources?.find(s => s.name === 'UK FCDO')
    const usSrc   = data.sources?.find(s => s.name === 'US State Dept')
    return (
      <div className="rounded-[8px] border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield size={14} className="text-gray-400"/>
          <span className="text-sm font-semibold text-gray-600">Advisory data not available</span>
        </div>
        <p className="text-xs text-gray-500 mb-2">Check official sources directly:</p>
        <div className="flex flex-col gap-1">
          {fcdoSrc?.url && (
            <a href={fcdoSrc.url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-[#0118A1] hover:underline font-medium">→ UK FCDO travel advice</a>
          )}
          {usSrc?.url && (
            <a href={usSrc.url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-[#0118A1] hover:underline font-medium">→ US State Dept advisory</a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-[8px] border p-4 ${style.bg} ${style.border}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${style.dot}`}/>
          <span className={`text-sm font-bold ${style.text}`}>{sev} Risk</span>
        </div>
        <Shield size={14} className={style.text}/>
      </div>
      {data.sources?.filter(s => s.level != null).map((s, i) => (
        <p key={i} className={`text-xs ${style.text} opacity-90`}>
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">{s.name}:</a>{' '}
          {s.message || `Level ${s.level}`}
        </p>
      ))}
      {/* Live feed counts */}
      {(data.gdacs_count > 0 || data.usgs_count > 0) && (
        <div className={`mt-2 pt-2 border-t border-current/10 flex gap-3`}>
          {data.gdacs_count > 0 && (
            <span className={`text-[10px] ${style.text} opacity-70`}>
              {data.gdacs_count} disaster event{data.gdacs_count !== 1 ? 's' : ''} (GDACS)
            </span>
          )}
          {data.usgs_count > 0 && (
            <span className={`text-[10px] ${style.text} opacity-70`}>
              {data.usgs_count} earthquake{data.usgs_count !== 1 ? 's' : ''} M5+ (USGS)
            </span>
          )}
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
      <span className="text-xs text-gray-400 ml-auto">{WMO[wx.weathercode]?.split(' ').slice(1).join(' ')}</span>
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
      <SectionHeader label={`Active Alerts${alerts.length ? ` (${alerts.length})` : ''}`} icon={AlertCircle}/>
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
        <SectionHeader label="Intelligence Feed" icon={Newspaper}/>
        {loaded < total && (
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <RefreshCw size={9} className="animate-spin"/>{loaded}/{total} feeds
          </div>
        )}
      </div>
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
                <p className="text-xs font-medium text-gray-800 leading-snug group-hover:text-[#0118A1] line-clamp-2 flex-1">{a.title}</p>
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

// ── AI Chat assistant ─────────────────────────────────────────────────────────
function AiChatSection({ country, travelerName, tripName }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: `I'm your AI security analyst for ${country}. Ask me anything — threat levels, safe areas, emergency contacts, evacuation routes, or current events.`,
    },
  ])
  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const bottomRef               = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const msg = input.trim()
    if (!msg || sending) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: msg }])
    setSending(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          message: msg,
          context: { country, travelerName, tripName, mode: 'country' },
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: data.reply || data.error || 'No response received.',
      }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Failed to reach AI. Please try again.' }])
    }
    setSending(false)
  }

  return (
    <div>
      <SectionHeader label="Ask AI Analyst" icon={Brain}/>
      <div className="border border-gray-200 rounded-[8px] overflow-hidden">
        {/* Message history */}
        <div className="bg-gray-50 p-3 space-y-2.5 max-h-64 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-[8px] px-3 py-2 text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'text-white rounded-br-[2px]'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-[2px]'
              }`} style={m.role === 'user' ? { backgroundColor: BRAND_BLUE } : {}}>
                {m.text}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-[8px] rounded-bl-[2px] px-3 py-2">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}/>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}/>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}/>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 bg-white border-t border-gray-200 px-3 py-2">
          <input
            className="flex-1 text-xs text-gray-800 placeholder-gray-400 outline-none bg-transparent"
            placeholder={`Ask about ${country}...`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            disabled={sending}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="p-1.5 rounded-[5px] transition-colors disabled:opacity-40"
            style={{ backgroundColor: BRAND_BLUE }}
          >
            <Send size={11} color="white"/>
          </button>
        </div>
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5 text-right">Powered by Claude AI · Not a substitute for official advisories</p>
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
      <SectionHeader label="Service Providers" icon={Briefcase}/>
      <p className="text-xs text-gray-400 italic">No vetted providers on file for {country}.</p>
    </div>
  )

  return (
    <div>
      <SectionHeader label={`Vetted Providers (${providers.length})`} icon={Briefcase}/>
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
export default function IntelBrief({ country, travelerName, returnDate, tripName, onClose }) {
  const [riskData, setRiskData]   = useState(null)
  const [riskLoading, setRiskLoading] = useState(true)
  const [refreshTs, setRefreshTs] = useState(0)

  useEffect(() => {
    if (!country) return
    setRiskLoading(true)
    setRiskData(null)
    fetch(`/api/country-risk?country=${encodeURIComponent(country)}`)
      .then(r => r.json())
      .then(d => { setRiskData(d); setRiskLoading(false) })
      .catch(() => setRiskLoading(false))
  }, [country, refreshTs])

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
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Globe size={16} className="text-[#0118A1] shrink-0"/>
                <h2 className="text-lg font-bold text-gray-900 truncate">{country}</h2>
                {/* AI indicator */}
                <div className="flex items-center gap-1 bg-[#0118A1]/10 border border-[#0118A1]/20 rounded-full px-2 py-0.5">
                  <Zap size={8} className="text-[#0118A1]"/>
                  <span className="text-[9px] font-bold text-[#0118A1]">AI</span>
                </div>
              </div>
              {travelerName && (
                <p className="text-xs text-gray-500">
                  Brief for <span className="font-semibold">{travelerName}</span>
                  {returnDate && ` · Returns ${fmtDate(returnDate)}`}
                </p>
              )}
              {!travelerName && (
                <p className="text-xs text-gray-500">Live intelligence brief · AI-synthesised</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setRefreshTs(Date.now())}
                className="text-gray-400 hover:text-[#0118A1] p-1 transition-colors"
                title="Refresh intel"
              >
                <RefreshCw size={14}/>
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18}/>
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 p-5 space-y-6">

          {/* 1. AI Security Brief — top priority */}
          <div>
            <SectionHeader label="AI Security Assessment" icon={Brain}/>
            <AiBriefSection brief={riskData?.ai_brief} loading={riskLoading}/>
          </div>

          {/* 2. FCDO Risk overview */}
          <div>
            <SectionHeader label="Official Advisory" icon={Shield}/>
            <RiskOverview data={riskData} loading={riskLoading}/>
          </div>

          {/* 3. Weather */}
          <div>
            <SectionHeader label="Current Conditions" icon={Thermometer}/>
            <WeatherCard country={country}/>
          </div>

          {/* 4. Active alerts */}
          <AlertsSection country={country}/>

          {/* 5. Live intel feed */}
          <IntelFeedSection country={country}/>

          {/* 6. AI Chat assistant */}
          <AiChatSection country={country} travelerName={travelerName} tripName={tripName}/>

          {/* 7. Service providers */}
          <ProvidersSection country={country}/>

        </div>
      </div>
    </div>
  )
}
