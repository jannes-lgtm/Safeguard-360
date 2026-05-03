import { useEffect, useState, useRef } from 'react'
import {
  Newspaper, ExternalLink, Globe, MapPin, Search,
  AlertTriangle, BookOpen, Calendar, Shield,
  Wind, Thermometer, RefreshCw, ChevronRight, Clock
} from 'lucide-react'
import Layout from '../components/Layout'

// ── Country metadata: capital city + coordinates ──────────────────────────────
const COUNTRY_META = {
  'Angola':                       { capital: 'Luanda',       lat: -8.8383,  lon: 13.2344,  region: 'Africa' },
  'Botswana':                     { capital: 'Gaborone',     lat: -24.6282, lon: 25.9231,  region: 'Africa' },
  'Cameroon':                     { capital: 'Yaoundé',      lat: 3.8480,   lon: 11.5021,  region: 'Africa' },
  'Chad':                         { capital: "N'Djamena",    lat: 12.1348,  lon: 15.0557,  region: 'Africa' },
  'Democratic Republic of Congo': { capital: 'Kinshasa',     lat: -4.3217,  lon: 15.3222,  region: 'Africa' },
  'Egypt':                        { capital: 'Cairo',         lat: 30.0444,  lon: 31.2357,  region: 'Africa' },
  'Ethiopia':                     { capital: 'Addis Ababa',  lat: 9.0320,   lon: 38.7469,  region: 'Africa' },
  'Ghana':                        { capital: 'Accra',         lat: 5.6037,   lon: -0.1870,  region: 'Africa' },
  'Iraq':                         { capital: 'Baghdad',       lat: 33.3152,  lon: 44.3661,  region: 'Middle East' },
  'Jordan':                       { capital: 'Amman',         lat: 31.9539,  lon: 35.9106,  region: 'Middle East' },
  'Kenya':                        { capital: 'Nairobi',       lat: -1.2921,  lon: 36.8219,  region: 'Africa' },
  'Lebanon':                      { capital: 'Beirut',        lat: 33.8886,  lon: 35.4955,  region: 'Middle East' },
  'Libya':                        { capital: 'Tripoli',       lat: 32.9020,  lon: 13.1800,  region: 'Africa' },
  'Mali':                         { capital: 'Bamako',        lat: 12.3714,  lon: -8.0000,  region: 'Africa' },
  'Mauritania':                   { capital: 'Nouakchott',   lat: 18.0735,  lon: -15.9582, region: 'Africa' },
  'Morocco':                      { capital: 'Rabat',         lat: 33.9716,  lon: -6.8498,  region: 'Africa' },
  'Mozambique':                   { capital: 'Maputo',        lat: -25.9692, lon: 32.5732,  region: 'Africa' },
  'Namibia':                      { capital: 'Windhoek',      lat: -22.5609, lon: 17.0658,  region: 'Africa' },
  'Niger':                        { capital: 'Niamey',        lat: 13.5137,  lon: 2.1098,   region: 'Africa' },
  'Nigeria':                      { capital: 'Abuja',         lat: 9.0765,   lon: 7.3986,   region: 'Africa' },
  'Rwanda':                       { capital: 'Kigali',        lat: -1.9441,  lon: 30.0619,  region: 'Africa' },
  'Saudi Arabia':                 { capital: 'Riyadh',        lat: 24.7136,  lon: 46.6753,  region: 'Middle East' },
  'Senegal':                      { capital: 'Dakar',         lat: 14.7167,  lon: -17.4677, region: 'Africa' },
  'Sierra Leone':                 { capital: 'Freetown',      lat: 8.4897,   lon: -13.2344, region: 'Africa' },
  'Somalia':                      { capital: 'Mogadishu',     lat: 2.0469,   lon: 45.3182,  region: 'Africa' },
  'South Africa':                 { capital: 'Pretoria',      lat: -25.7461, lon: 28.1881,  region: 'Africa' },
  'South Sudan':                  { capital: 'Juba',          lat: 4.8594,   lon: 31.5713,  region: 'Africa' },
  'Sudan':                        { capital: 'Khartoum',      lat: 15.5007,  lon: 32.5599,  region: 'Africa' },
  'Syria':                        { capital: 'Damascus',      lat: 33.5102,  lon: 36.2913,  region: 'Middle East' },
  'Tanzania':                     { capital: 'Dodoma',        lat: -6.1722,  lon: 35.7395,  region: 'Africa' },
  'Tunisia':                      { capital: 'Tunis',         lat: 36.8190,  lon: 10.1658,  region: 'Africa' },
  'Uganda':                       { capital: 'Kampala',       lat: 0.3476,   lon: 32.5825,  region: 'Africa' },
  'Yemen':                        { capital: "Sana'a",        lat: 15.3694,  lon: 44.1910,  region: 'Middle East' },
  'Zambia':                       { capital: 'Lusaka',        lat: -15.4167, lon: 28.2833,  region: 'Africa' },
  'Zimbabwe':                     { capital: 'Harare',        lat: -17.8292, lon: 31.0522,  region: 'Africa' },
}

const COUNTRIES = Object.keys(COUNTRY_META).sort()

// ── WMO weather codes ─────────────────────────────────────────────────────────
const WMO = {
  0: '☀️ Clear sky', 1: '🌤 Mainly clear', 2: '⛅ Partly cloudy', 3: '☁️ Overcast',
  45: '🌫 Fog', 48: '🌫 Icy fog',
  51: '🌦 Light drizzle', 53: '🌦 Drizzle', 55: '🌧 Heavy drizzle',
  61: '🌧 Light rain', 63: '🌧 Rain', 65: '🌧 Heavy rain',
  71: '🌨 Light snow', 73: '❄️ Snow', 75: '❄️ Heavy snow',
  80: '🌦 Light showers', 81: '🌧 Showers', 82: '⛈ Heavy showers',
  95: '⛈ Thunderstorm', 96: '⛈ Thunderstorm + hail', 99: '⛈ Heavy thunderstorm',
}
const wmo = (code) => WMO[code] ?? '🌡 Unknown'

// ── Risk severity config ──────────────────────────────────────────────────────
const RISK = {
  Critical: { bg: 'bg-red-600',    light: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-800',    dot: 'bg-red-500',    bar: 100 },
  High:     { bg: 'bg-orange-500', light: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-800', dot: 'bg-orange-500', bar: 75  },
  Medium:   { bg: 'bg-yellow-500', light: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800', dot: 'bg-yellow-400', bar: 50  },
  Low:      { bg: 'bg-green-500',  light: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-800',  dot: 'bg-green-500',  bar: 25  },
  Unknown:  { bg: 'bg-gray-400',   light: 'bg-gray-50',   border: 'border-gray-300',   text: 'text-gray-600',   dot: 'bg-gray-400',   bar: 10  },
}
const getRisk = (s) => RISK[s] || RISK.Unknown

// ── Resource links ────────────────────────────────────────────────────────────
const RESOURCES = [
  {
    category: 'Travel Advisories',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
    icon: Globe,
    items: [
      { name: 'US State Department — Travel Advisories', url: 'https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html/', desc: 'Country-by-country risk ratings and advisories for every nation' },
      { name: 'UK FCDO — Foreign Travel Advice', url: 'https://www.gov.uk/foreign-travel-advice', desc: 'Detailed region-level advisories from the UK Foreign Office' },
      { name: 'Australian DFAT — Smart Traveller', url: 'https://www.smartraveller.gov.au', desc: 'Australian government travel advisories and safety information' },
      { name: 'Canada Travel Advisories', url: 'https://travel.gc.ca/travelling/advisories', desc: 'Global risk ratings and advisories from Global Affairs Canada' },
    ],
  },
  {
    category: 'Security Intelligence',
    color: 'bg-red-50 border-red-200 text-red-800',
    icon: Shield,
    items: [
      { name: 'ACLED Dashboard — Africa', url: 'https://acleddata.com/dashboard/', desc: 'Interactive conflict event map for Africa — updated weekly' },
      { name: 'ISS Africa — Situation Reports', url: 'https://issafrica.org/iss-today', desc: 'Institute for Security Studies daily African security analysis' },
      { name: 'Crisis Group — Africa Reports', url: 'https://www.crisisgroup.org/africa', desc: 'In-depth conflict analysis and early warning from Crisis Group' },
      { name: 'OSAC — Africa Security Reports', url: 'https://www.osac.gov/Content/Browse/Report?subContentTypes=Country%20Security%20Report', desc: 'Overseas Security Advisory Council country security reports' },
    ],
  },
  {
    category: 'Humanitarian & Health',
    color: 'bg-amber-50 border-amber-200 text-amber-800',
    icon: AlertTriangle,
    items: [
      { name: 'UN OCHA — ReliefWeb', url: 'https://reliefweb.int/updates?advanced-search=%28PC246%29_%28PC171%29_%28PC188%29', desc: 'Humanitarian situation reports, flash updates and maps for Africa' },
      { name: 'WHO — Disease Outbreak News', url: 'https://www.who.int/csr/don/en/', desc: 'Real-time disease outbreak alerts from the World Health Organisation' },
      { name: 'UNHCR — Operational Data', url: 'https://data.unhcr.org/en/situations', desc: 'Refugee and displacement situation reports and statistics' },
      { name: 'WFP — Food Security', url: 'https://www.wfp.org/publications/global-report-food-crises', desc: 'Global food crisis reports and country-level food security data' },
    ],
  },
  {
    category: 'Business & Economic Risk',
    color: 'bg-purple-50 border-purple-200 text-purple-800',
    icon: BookOpen,
    items: [
      { name: 'Control Risks — RiskMap', url: 'https://riskmap.controlrisks.com', desc: 'Annual country risk ratings for political, security and operational risk' },
      { name: 'Transparency International — CPI', url: 'https://www.transparency.org/en/cpi', desc: 'Corruption Perceptions Index — annual country-level corruption scores' },
      { name: 'World Bank — Doing Business', url: 'https://www.doingbusiness.org', desc: 'Country regulatory environment and ease of doing business rankings' },
      { name: 'Fragile States Index', url: 'https://fragilestatesindex.org', desc: 'Annual ranking of countries by fragility and conflict vulnerability' },
    ],
  },
]

// ── Category badge colours ────────────────────────────────────────────────────
const CAT_COLORS = {
  security: 'bg-purple-100 text-purple-700 border-purple-200',
  conflict: 'bg-red-100 text-red-700 border-red-200',
  health:   'bg-rose-100 text-rose-700 border-rose-200',
  weather:  'bg-teal-100 text-teal-700 border-teal-200',
}
const catColor = (c) => CAT_COLORS[c] || 'bg-gray-100 text-gray-600 border-gray-200'

// ── Relative time ─────────────────────────────────────────────────────────────
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

// ── Article card ──────────────────────────────────────────────────────────────
function ArticleCard({ article }) {
  const ago = timeAgo(article.date)

  return (
    <div className="flex items-start gap-3 py-3.5 border-b border-gray-100 last:border-0 group">
      <div className="w-1.5 h-1.5 rounded-full bg-[#AACC00] mt-2 shrink-0" />
      <div className="flex-1 min-w-0">
        <a href={article.url} target="_blank" rel="noopener noreferrer"
          className="text-sm font-semibold text-gray-900 hover:text-[#0118A1] hover:underline leading-snug block mb-1.5">
          {article.title}
        </a>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${catColor(article.feedCategory)}`}>
            {article.feedName}
          </span>
          {ago && (
            <span className="text-[11px] text-gray-400 flex items-center gap-1">
              <Clock size={9} />{ago}
            </span>
          )}
        </div>
        {article.summary && (
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed line-clamp-2">{article.summary}</p>
        )}
      </div>
      <a href={article.url} target="_blank" rel="noopener noreferrer"
        className="text-gray-300 hover:text-[#0118A1] transition-colors opacity-0 group-hover:opacity-100 shrink-0 mt-1">
        <ExternalLink size={13} />
      </a>
    </div>
  )
}

// ── Resource section ──────────────────────────────────────────────────────────
function ResourceSection({ section }) {
  const Icon = section.icon
  return (
    <div className="bg-white rounded-[8px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${section.color}`}>
        <Icon size={13} />
        <span className="text-xs font-bold uppercase tracking-widest">{section.category}</span>
      </div>
      <div className="divide-y divide-gray-100">
        {section.items.map((item, i) => (
          <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
            className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 group-hover:text-[#0118A1] transition-colors">{item.name}</div>
              <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.desc}</div>
            </div>
            <ExternalLink size={13} className="text-gray-300 group-hover:text-[#0118A1] transition-colors shrink-0 mt-0.5" />
          </a>
        ))}
      </div>
    </div>
  )
}

// ── Country profile panel ─────────────────────────────────────────────────────
function CountryProfile({ country, meta, allArticles }) {
  const [risk, setRisk]       = useState(null)
  const [weather, setWeather] = useState(null)
  const [loading, setLoading] = useState(true)

  // Incidents: articles mentioning this country from last 30 days
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const incidents = allArticles.filter(a => {
    const text = (a.title + ' ' + (a.summary || '')).toLowerCase()
    const inRange = !a.date || new Date(a.date).getTime() > cutoff
    return inRange && text.includes(country.toLowerCase())
  }).slice(0, 8)

  useEffect(() => {
    setRisk(null)
    setWeather(null)
    setLoading(true)

    const fetchRisk = fetch(`/api/country-risk?country=${encodeURIComponent(country)}`)
      .then(r => r.json())
      .catch(() => null)

    const fetchWeather = fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${meta.lat}&longitude=${meta.lon}` +
      `&current=temperature_2m,weathercode,wind_speed_10m,relative_humidity_2m` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode&forecast_days=4&timezone=auto`
    ).then(r => r.json()).catch(() => null)

    Promise.all([fetchRisk, fetchWeather]).then(([r, w]) => {
      setRisk(r)
      setWeather(w)
      setLoading(false)
    })
  }, [country])

  const severity = risk?.severity || 'Unknown'
  const rc = getRisk(severity)

  const days = ['Today', 'Tomorrow']
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const dayLabel = (i) => i < 2 ? days[i] : dow[new Date(weather?.daily?.time?.[i]).getDay()]

  return (
    <div className="space-y-4">
      {/* Country header */}
      <div className="bg-white rounded-[8px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{country}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Capital: {meta.capital} · {meta.region}</p>
          </div>
          {/* Risk badge */}
          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-bold ${rc.light} ${rc.border} ${rc.text}`}>
            <span className={`w-2 h-2 rounded-full ${rc.dot}`} />
            {severity} Risk
          </span>
        </div>

        {/* Risk bar */}
        <div className="mt-3">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${rc.bg}`} style={{ width: `${rc.bar}%` }} />
          </div>
        </div>
      </div>

      {/* Risk sources */}
      {loading ? (
        <div className="bg-white rounded-[8px] border border-gray-200 p-6 text-center">
          <RefreshCw size={16} className="animate-spin text-gray-400 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Loading risk data &amp; weather…</p>
        </div>
      ) : (
        <>
          {/* Advisory sources */}
          {risk?.sources?.length > 0 && (
            <div className="bg-white rounded-[8px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Official Advisories</span>
              </div>
              <div className="divide-y divide-gray-100">
                {risk.sources.map((src, i) => (
                  <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800 group-hover:text-[#0118A1]">{src.name}</span>
                        {src.level && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getRisk(['Low','Low','Medium','High','Critical'][src.level] || 'Unknown').light} ${getRisk(['Low','Low','Medium','High','Critical'][src.level] || 'Unknown').border} ${getRisk(['Low','Low','Medium','High','Critical'][src.level] || 'Unknown').text}`}>
                            Level {src.level}
                          </span>
                        )}
                      </div>
                      {src.message && <p className="text-xs text-gray-500 mt-0.5">{src.message}</p>}
                    </div>
                    <ExternalLink size={12} className="text-gray-300 group-hover:text-[#0118A1] shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Weather */}
          {weather?.current && (
            <div className="bg-white rounded-[8px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Weather — {meta.capital}</span>
              </div>
              <div className="px-4 py-4">
                {/* Current */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="text-4xl font-bold text-gray-900">
                    {Math.round(weather.current.temperature_2m)}°C
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{wmo(weather.current.weathercode)}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Wind size={11} />{Math.round(weather.current.wind_speed_10m)} km/h</span>
                      <span className="flex items-center gap-1"><Thermometer size={11} />{weather.current.relative_humidity_2m}% humidity</span>
                    </div>
                  </div>
                </div>
                {/* 4-day forecast */}
                {weather.daily?.time && (
                  <div className="grid grid-cols-4 gap-2">
                    {weather.daily.time.slice(0, 4).map((_, i) => (
                      <div key={i} className="text-center bg-gray-50 rounded-[6px] px-2 py-2.5">
                        <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">{dayLabel(i)}</div>
                        <div className="text-xs mb-1">{wmo(weather.daily.weathercode[i])?.split(' ')[0]}</div>
                        <div className="text-xs font-semibold text-gray-800">{Math.round(weather.daily.temperature_2m_max[i])}°</div>
                        <div className="text-[10px] text-gray-400">{Math.round(weather.daily.temperature_2m_min[i])}°</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Recent incidents */}
      <div className="bg-white rounded-[8px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            Recent Intelligence — Last 30 Days
          </span>
          <span className="text-[11px] text-gray-400">{incidents.length} article{incidents.length !== 1 ? 's' : ''} found</span>
        </div>
        {incidents.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">
            No recent articles mentioning {country} in loaded feeds.
            {allArticles.length === 0 && ' Articles are still loading — try again shortly.'}
          </p>
        ) : (
          <div className="px-4 divide-y divide-gray-100">
            {incidents.map((a, i) => (
              <div key={i} className="flex items-start gap-3 py-3 group">
                <div className="w-1.5 h-1.5 rounded-full bg-[#AACC00] mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <a href={a.url} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-900 hover:text-[#0118A1] hover:underline leading-snug block">
                    {a.title}
                  </a>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${catColor(a.feedCategory)}`}>
                      {a.feedName}
                    </span>
                    {a.date && (
                      <span className="text-[11px] text-gray-400 flex items-center gap-1">
                        <Calendar size={9} />
                        {new Date(a.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
                <a href={a.url} target="_blank" rel="noopener noreferrer"
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-[#0118A1] transition-all shrink-0 mt-1">
                  <ExternalLink size={12} />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Country advisory (search + select) ───────────────────────────────────────
function CountryAdvisory({ allArticles }) {
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState(null)

  const filtered = COUNTRIES.filter(c => c.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex gap-6 items-start">
      {/* Left: country selector */}
      <div className="w-64 shrink-0">
        <div className="bg-white rounded-[8px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Select Country</h3>
          <div className="relative mb-3">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 focus:border-[#0118A1]"
            />
          </div>
          <div className="space-y-0.5 max-h-[calc(100vh-280px)] overflow-y-auto">
            {filtered.map(c => (
              <button key={c} onClick={() => setSelected(c)}
                className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-[6px] text-sm transition-colors
                  ${selected === c
                    ? 'bg-[#0118A1] text-white font-semibold'
                    : 'text-gray-700 hover:bg-gray-50'}`}>
                <span>{c}</span>
                {selected === c && <ChevronRight size={14} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: country profile */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <CountryProfile
            key={selected}
            country={selected}
            meta={COUNTRY_META[selected]}
            allArticles={allArticles}
          />
        ) : (
          <div className="bg-white rounded-[8px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-12 text-center">
            <MapPin size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">Select a country to see its risk profile</p>
            <p className="text-xs text-gray-400 mt-1">Risk rating, current weather and recent intelligence</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Briefings() {
  const [rssFeeds, setRssFeeds]     = useState([])
  const [articles, setArticles]     = useState([])
  const [loadedCount, setLoadedCount] = useState(0)
  const [totalFeeds, setTotalFeeds]  = useState(0)
  const [catFilter, setCatFilter]    = useState('all')
  const [regionFilter, setRegionFilter] = useState('All')
  const [activeTab, setActiveTab]    = useState('news')
  const loadedRef = useRef(new Set())

  // Step 1: fetch feed list
  useEffect(() => {
    fetch('/api/rss-ingest')
      .then(r => r.json())
      .then(d => {
        const feeds = d.feeds || []
        setRssFeeds(feeds)
        setTotalFeeds(feeds.length)
      })
      .catch(() => {})
  }, [])

  // Step 2: fetch articles from every feed in parallel when list arrives
  useEffect(() => {
    if (!rssFeeds.length) return
    loadedRef.current = new Set()
    setArticles([])
    setLoadedCount(0)

    rssFeeds.forEach(feed => {
      fetch(`/api/rss-ingest?id=${feed.id}&limit=6`)
        .then(r => r.json())
        .then(d => {
          if (d.articles?.length) {
            const tagged = d.articles.map(a => ({
              ...a,
              feedId: feed.id,
              feedName: feed.name,
              feedCategory: feed.category,
              feedGeography: feed.geography,
            }))
            setArticles(prev =>
              [...prev, ...tagged].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
            )
          }
          loadedRef.current.add(feed.id)
          setLoadedCount(loadedRef.current.size)
        })
        .catch(() => {
          loadedRef.current.add(feed.id)
          setLoadedCount(loadedRef.current.size)
        })
    })
  }, [rssFeeds])

  const isLoading = loadedCount < totalFeeds

  // Apply filters
  const filteredArticles = articles.filter(a => {
    const catOk = catFilter === 'all' || a.feedCategory === catFilter
    const regionOk = regionFilter === 'All' ||
      (regionFilter === 'Africa' && a.feedGeography?.includes('Africa')) ||
      (regionFilter === 'Middle East' && a.feedGeography?.includes('Middle East')) ||
      (regionFilter === 'Health' && a.feedCategory === 'health')
    return catOk && regionOk
  })

  const CATS = [
    { id: 'all',      label: 'All' },
    { id: 'security', label: 'Security' },
    { id: 'conflict', label: 'Conflict' },
    { id: 'health',   label: 'Health' },
    { id: 'weather',  label: 'Weather' },
  ]

  const tabs = [
    { id: 'news',       label: 'Intel News',         icon: Newspaper },
    { id: 'advisories', label: 'Country Profiles',   icon: MapPin },
    { id: 'resources',  label: 'Reports & Resources', icon: BookOpen },
  ]

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Newspaper size={20} className="text-[#0118A1]" />
          <h1 className="text-2xl font-bold text-gray-900">Briefings</h1>
        </div>
        <p className="text-sm text-gray-500">Live intelligence, country risk profiles and security reports</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-[8px] p-1 w-fit">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-sm font-medium transition-colors
                ${activeTab === tab.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Intel News ── */}
      {activeTab === 'news' && (
        <div>
          {/* Loading bar */}
          {isLoading && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span className="flex items-center gap-1.5">
                  <RefreshCw size={11} className="animate-spin text-[#0118A1]" />
                  Loading feeds… {loadedCount} / {totalFeeds} sources
                </span>
                <span>{articles.length} articles so far</span>
              </div>
              <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0118A1] rounded-full transition-all duration-300"
                  style={{ width: totalFeeds ? `${(loadedCount / totalFeeds) * 100}%` : '0%' }}
                />
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <div className="flex gap-1">
              {CATS.map(c => (
                <button key={c.id} onClick={() => setCatFilter(c.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                    ${catFilter === c.id
                      ? 'bg-[#0118A1] text-white border-[#0118A1]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {['All', 'Africa', 'Middle East'].map(r => (
                <button key={r} onClick={() => setRegionFilter(r)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                    ${regionFilter === r
                      ? 'bg-[#AACC00] text-[#0118A1] border-[#AACC00] font-bold'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                  {r}
                </button>
              ))}
            </div>
            {!isLoading && (
              <span className="text-xs text-gray-400 ml-auto">
                {filteredArticles.length} articles · {loadedCount} sources
              </span>
            )}
          </div>

          {/* Article feed */}
          {filteredArticles.length === 0 && !isLoading ? (
            <div className="bg-white rounded-[8px] border border-gray-200 p-12 text-center text-sm text-gray-400">
              No articles match the selected filters.
            </div>
          ) : (
            <div className="bg-white rounded-[8px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] divide-y divide-gray-100 px-4">
              {filteredArticles.length === 0 && isLoading ? (
                <div className="py-12 text-center text-sm text-gray-400">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-3 text-gray-300" />
                  Loading articles from all sources…
                </div>
              ) : (
                filteredArticles.map((a, i) => <ArticleCard key={`${a.feedId}-${i}`} article={a} />)
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Country Profiles ── */}
      {activeTab === 'advisories' && (
        <CountryAdvisory allArticles={articles} />
      )}

      {/* ── Reports & Resources ── */}
      {activeTab === 'resources' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {RESOURCES.map(section => (
            <ResourceSection key={section.category} section={section} />
          ))}
        </div>
      )}
    </Layout>
  )
}
