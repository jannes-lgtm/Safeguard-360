import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import L from 'leaflet'
import {
  Shield, Search, RefreshCw, ExternalLink, Wind, Thermometer,
  ChevronRight, AlertTriangle, MapPin, Brain, Zap, Clock,
  ChevronDown, ChevronUp, FileText, Layers, HeartPulse,
  Swords, CloudRain, Users, Lock, ArrowLeft
} from 'lucide-react'
import Layout from '../components/Layout'

// ── Country metadata (for weather widget coordinates + capital) ───────────────
const COUNTRY_META = {
  // ── Africa ──────────────────────────────────────────────────────────────────
  'Angola':                       { capital: 'Luanda',        lat: -8.8383,  lon:  13.2344  },
  'Botswana':                     { capital: 'Gaborone',      lat: -24.6282, lon:  25.9231  },
  'Burkina Faso':                 { capital: 'Ouagadougou',   lat: 12.3647,  lon:  -1.5354  },
  'Cameroon':                     { capital: 'Yaoundé',       lat: 3.8480,   lon:  11.5021  },
  'Central African Republic':     { capital: 'Bangui',        lat: 4.3947,   lon:  18.5582  },
  'Chad':                         { capital: "N'Djamena",     lat: 12.1348,  lon:  15.0557  },
  'Democratic Republic of Congo': { capital: 'Kinshasa',      lat: -4.3217,  lon:  15.3222  },
  'Egypt':                        { capital: 'Cairo',         lat: 30.0444,  lon:  31.2357  },
  'Ethiopia':                     { capital: 'Addis Ababa',   lat: 9.0320,   lon:  38.7469  },
  'Ghana':                        { capital: 'Accra',         lat: 5.6037,   lon:  -0.1870  },
  'Guinea':                       { capital: 'Conakry',       lat: 9.6412,   lon: -13.5784  },
  'Kenya':                        { capital: 'Nairobi',       lat: -1.2921,  lon:  36.8219  },
  'Libya':                        { capital: 'Tripoli',       lat: 32.9020,  lon:  13.1800  },
  'Malawi':                       { capital: 'Lilongwe',      lat: -13.9626, lon:  33.7741  },
  'Mali':                         { capital: 'Bamako',        lat: 12.3714,  lon:  -8.0000  },
  'Mauritania':                   { capital: 'Nouakchott',    lat: 18.0735,  lon: -15.9582  },
  'Morocco':                      { capital: 'Rabat',         lat: 33.9716,  lon:  -6.8498  },
  'Mozambique':                   { capital: 'Maputo',        lat: -25.9692, lon:  32.5732  },
  'Namibia':                      { capital: 'Windhoek',      lat: -22.5609, lon:  17.0658  },
  'Niger':                        { capital: 'Niamey',        lat: 13.5137,  lon:   2.1098  },
  'Nigeria':                      { capital: 'Abuja',         lat: 9.0765,   lon:   7.3986  },
  'Rwanda':                       { capital: 'Kigali',        lat: -1.9441,  lon:  30.0619  },
  'Senegal':                      { capital: 'Dakar',         lat: 14.7167,  lon: -17.4677  },
  'Sierra Leone':                 { capital: 'Freetown',      lat: 8.4897,   lon: -13.2344  },
  'Somalia':                      { capital: 'Mogadishu',     lat: 2.0469,   lon:  45.3182  },
  'South Africa':                 { capital: 'Pretoria',      lat: -25.7461, lon:  28.1881  },
  'South Sudan':                  { capital: 'Juba',          lat: 4.8594,   lon:  31.5713  },
  'Sudan':                        { capital: 'Khartoum',      lat: 15.5007,  lon:  32.5599  },
  'Tanzania':                     { capital: 'Dodoma',        lat: -6.1722,  lon:  35.7395  },
  'Tunisia':                      { capital: 'Tunis',         lat: 36.8190,  lon:  10.1658  },
  'Uganda':                       { capital: 'Kampala',       lat: 0.3476,   lon:  32.5825  },
  'Zambia':                       { capital: 'Lusaka',        lat: -15.4167, lon:  28.2833  },
  'Zimbabwe':                     { capital: 'Harare',        lat: -17.8292, lon:  31.0522  },
  // ── Middle East ─────────────────────────────────────────────────────────────
  'Iran':                         { capital: 'Tehran',        lat: 35.6892,  lon:  51.3890  },
  'Iraq':                         { capital: 'Baghdad',       lat: 33.3152,  lon:  44.3661  },
  'Jordan':                       { capital: 'Amman',         lat: 31.9539,  lon:  35.9106  },
  'Lebanon':                      { capital: 'Beirut',        lat: 33.8886,  lon:  35.4955  },
  'Saudi Arabia':                 { capital: 'Riyadh',        lat: 24.7136,  lon:  46.6753  },
  'Syria':                        { capital: 'Damascus',      lat: 33.5102,  lon:  36.2913  },
  'United Arab Emirates':         { capital: 'Abu Dhabi',     lat: 24.4539,  lon:  54.3773  },
  'Yemen':                        { capital: "Sana'a",        lat: 15.3694,  lon:  44.1910  },
  // ── Europe ──────────────────────────────────────────────────────────────────
  'France':                       { capital: 'Paris',         lat: 48.8566,  lon:   2.3522  },
  'Germany':                      { capital: 'Berlin',        lat: 52.5200,  lon:  13.4050  },
  'Russia':                       { capital: 'Moscow',        lat: 55.7558,  lon:  37.6173  },
  'Ukraine':                      { capital: 'Kyiv',          lat: 50.4501,  lon:  30.5234  },
  'United Kingdom':               { capital: 'London',        lat: 51.5074,  lon:  -0.1278  },
  // ── Asia ────────────────────────────────────────────────────────────────────
  'Afghanistan':                  { capital: 'Kabul',         lat: 34.5553,  lon:  69.2075  },
  'India':                        { capital: 'New Delhi',     lat: 28.6139,  lon:  77.2090  },
  'Indonesia':                    { capital: 'Jakarta',       lat: -6.2088,  lon: 106.8456  },
  'Japan':                        { capital: 'Tokyo',         lat: 35.6762,  lon: 139.6503  },
  'Myanmar':                      { capital: 'Naypyidaw',     lat: 19.7633,  lon:  96.0785  },
  'Pakistan':                     { capital: 'Islamabad',     lat: 33.6844,  lon:  73.0479  },
  'Philippines':                  { capital: 'Manila',        lat: 14.5995,  lon: 120.9842  },
  'Singapore':                    { capital: 'Singapore',     lat: 1.3521,   lon: 103.8198  },
  // ── Americas ────────────────────────────────────────────────────────────────
  'Brazil':                       { capital: 'Brasília',      lat: -15.7801, lon: -47.9292  },
  'Colombia':                     { capital: 'Bogotá',        lat: 4.7110,   lon: -74.0721  },
  'Haiti':                        { capital: 'Port-au-Prince',lat: 18.5944,  lon: -72.3074  },
  'Mexico':                       { capital: 'Mexico City',   lat: 19.4326,  lon: -99.1332  },
  'United States':                { capital: 'Washington DC', lat: 38.9072,  lon: -77.0369  },
  'Venezuela':                    { capital: 'Caracas',       lat: 10.4806,  lon: -66.9036  },
  // ── Oceania ─────────────────────────────────────────────────────────────────
  'Australia':                    { capital: 'Canberra',      lat: -35.2809, lon: 149.1300  },
}

// ── Risk map data: all countries with base risk levels + region ───────────────
const RISK_MAP = {
  // Critical
  'Somalia':                       { lat: 2.0469,   lon: 45.3182,  risk: 'Critical', region: 'Africa'       },
  'South Sudan':                   { lat: 4.8594,   lon: 31.5713,  risk: 'Critical', region: 'Africa'       },
  'Sudan':                         { lat: 15.5007,  lon: 32.5599,  risk: 'Critical', region: 'Africa'       },
  'Libya':                         { lat: 32.9020,  lon: 13.1800,  risk: 'Critical', region: 'Africa'       },
  'Syria':                         { lat: 33.5102,  lon: 36.2913,  risk: 'Critical', region: 'Middle East'  },
  'Yemen':                         { lat: 15.3694,  lon: 44.1910,  risk: 'Critical', region: 'Middle East'  },
  'Iraq':                          { lat: 33.3152,  lon: 44.3661,  risk: 'Critical', region: 'Middle East'  },
  'Afghanistan':                   { lat: 34.5553,  lon: 69.2075,  risk: 'Critical', region: 'Asia'         },
  'Democratic Republic of Congo':  { lat: -4.3217,  lon: 15.3222,  risk: 'Critical', region: 'Africa'       },
  // High
  'Nigeria':                       { lat: 9.0765,   lon: 7.3986,   risk: 'High',     region: 'Africa'       },
  'Mali':                          { lat: 12.3714,  lon: -8.0000,  risk: 'High',     region: 'Africa'       },
  'Niger':                         { lat: 13.5137,  lon: 2.1098,   risk: 'High',     region: 'Africa'       },
  'Chad':                          { lat: 12.1348,  lon: 15.0557,  risk: 'High',     region: 'Africa'       },
  'Ethiopia':                      { lat: 9.0320,   lon: 38.7469,  risk: 'High',     region: 'Africa'       },
  'Mozambique':                    { lat: -25.9692, lon: 32.5732,  risk: 'High',     region: 'Africa'       },
  'Lebanon':                       { lat: 33.8886,  lon: 35.4955,  risk: 'High',     region: 'Middle East'  },
  'Pakistan':                      { lat: 33.6844,  lon: 73.0479,  risk: 'High',     region: 'Asia'         },
  'Myanmar':                       { lat: 19.7633,  lon: 96.0785,  risk: 'High',     region: 'Asia'         },
  'Haiti':                         { lat: 18.5944,  lon: -72.3074, risk: 'High',     region: 'Americas'     },
  'Ukraine':                       { lat: 50.4501,  lon: 30.5234,  risk: 'High',     region: 'Europe'       },
  'Burkina Faso':                  { lat: 12.3647,  lon: -1.5354,  risk: 'High',     region: 'Africa'       },
  'Central African Republic':      { lat: 4.3947,   lon: 18.5582,  risk: 'High',     region: 'Africa'       },
  // Medium
  'Kenya':                         { lat: -1.2921,  lon: 36.8219,  risk: 'Medium',   region: 'Africa'       },
  'Uganda':                        { lat: 0.3476,   lon: 32.5825,  risk: 'Medium',   region: 'Africa'       },
  'Tanzania':                      { lat: -6.1722,  lon: 35.7395,  risk: 'Medium',   region: 'Africa'       },
  'Zimbabwe':                      { lat: -17.8292, lon: 31.0522,  risk: 'Medium',   region: 'Africa'       },
  'Zambia':                        { lat: -15.4167, lon: 28.2833,  risk: 'Medium',   region: 'Africa'       },
  'Cameroon':                      { lat: 3.8480,   lon: 11.5021,  risk: 'Medium',   region: 'Africa'       },
  'Egypt':                         { lat: 30.0444,  lon: 31.2357,  risk: 'Medium',   region: 'Africa'       },
  'Jordan':                        { lat: 31.9539,  lon: 35.9106,  risk: 'Medium',   region: 'Middle East'  },
  'Tunisia':                       { lat: 36.8190,  lon: 10.1658,  risk: 'Medium',   region: 'Africa'       },
  'Angola':                        { lat: -8.8383,  lon: 13.2344,  risk: 'Medium',   region: 'Africa'       },
  'Sierra Leone':                  { lat: 8.4897,   lon: -13.2344, risk: 'Medium',   region: 'Africa'       },
  'Mauritania':                    { lat: 18.0735,  lon: -15.9582, risk: 'Medium',   region: 'Africa'       },
  'Guinea':                        { lat: 9.6412,   lon: -13.5784, risk: 'Medium',   region: 'Africa'       },
  'Venezuela':                     { lat: 10.4806,  lon: -66.9036, risk: 'Medium',   region: 'Americas'     },
  'Colombia':                      { lat: 4.7110,   lon: -74.0721, risk: 'Medium',   region: 'Americas'     },
  'Iran':                          { lat: 35.6892,  lon: 51.3890,  risk: 'Medium',   region: 'Middle East'  },
  'Russia':                        { lat: 55.7558,  lon: 37.6173,  risk: 'Medium',   region: 'Europe'       },
  'Saudi Arabia':                  { lat: 24.7136,  lon: 46.6753,  risk: 'Medium',   region: 'Middle East'  },
  'Indonesia':                     { lat: -6.2088,  lon: 106.8456, risk: 'Medium',   region: 'Asia'         },
  'Philippines':                   { lat: 14.5995,  lon: 120.9842, risk: 'Medium',   region: 'Asia'         },
  'India':                         { lat: 28.6139,  lon: 77.2090,  risk: 'Medium',   region: 'Asia'         },
  'Brazil':                        { lat: -15.7801, lon: -47.9292, risk: 'Medium',   region: 'Americas'     },
  'Mexico':                        { lat: 19.4326,  lon: -99.1332, risk: 'Medium',   region: 'Americas'     },
  // Low
  'South Africa':                  { lat: -25.7461, lon: 28.1881,  risk: 'Low',      region: 'Africa'       },
  'Ghana':                         { lat: 5.6037,   lon: -0.1870,  risk: 'Low',      region: 'Africa'       },
  'Rwanda':                        { lat: -1.9441,  lon: 30.0619,  risk: 'Low',      region: 'Africa'       },
  'Senegal':                       { lat: 14.7167,  lon: -17.4677, risk: 'Low',      region: 'Africa'       },
  'Morocco':                       { lat: 33.9716,  lon: -6.8498,  risk: 'Low',      region: 'Africa'       },
  'Botswana':                      { lat: -24.6282, lon: 25.9231,  risk: 'Low',      region: 'Africa'       },
  'Namibia':                       { lat: -22.5609, lon: 17.0658,  risk: 'Low',      region: 'Africa'       },
  'Malawi':                        { lat: -13.9626, lon: 33.7741,  risk: 'Low',      region: 'Africa'       },
  'United Kingdom':                { lat: 51.5074,  lon: -0.1278,  risk: 'Low',      region: 'Europe'       },
  'France':                        { lat: 48.8566,  lon: 2.3522,   risk: 'Low',      region: 'Europe'       },
  'Germany':                       { lat: 52.5200,  lon: 13.4050,  risk: 'Low',      region: 'Europe'       },
  'Greece':                        { lat: 37.9838,  lon: 23.7275,  risk: 'Low',      region: 'Europe'       },
  'Italy':                         { lat: 41.9028,  lon: 12.4964,  risk: 'Low',      region: 'Europe'       },
  'Netherlands':                   { lat: 52.3676,  lon: 4.9041,   risk: 'Low',      region: 'Europe'       },
  'Poland':                        { lat: 52.2297,  lon: 21.0122,  risk: 'Low',      region: 'Europe'       },
  'Portugal':                      { lat: 38.7223,  lon: -9.1393,  risk: 'Low',      region: 'Europe'       },
  'Romania':                       { lat: 44.4268,  lon: 26.1025,  risk: 'Medium',   region: 'Europe'       },
  'Serbia':                        { lat: 44.8176,  lon: 20.4633,  risk: 'Medium',   region: 'Europe'       },
  'Spain':                         { lat: 40.4168,  lon: -3.7038,  risk: 'Low',      region: 'Europe'       },
  'Sweden':                        { lat: 59.3293,  lon: 18.0686,  risk: 'Low',      region: 'Europe'       },
  'Switzerland':                   { lat: 46.9481,  lon: 7.4474,   risk: 'Low',      region: 'Europe'       },
  'Turkey':                        { lat: 39.9334,  lon: 32.8597,  risk: 'Medium',   region: 'Europe'       },
  'United States':                 { lat: 38.9072,  lon: -77.0369, risk: 'Low',      region: 'Americas'     },
  'Australia':                     { lat: -35.2809, lon: 149.1300, risk: 'Low',      region: 'Oceania'      },
  'Singapore':                     { lat: 1.3521,   lon: 103.8198, risk: 'Low',      region: 'Asia'         },
  'Japan':                         { lat: 35.6762,  lon: 139.6503, risk: 'Low',      region: 'Asia'         },
  'United Arab Emirates':          { lat: 24.4539,  lon: 54.3773,  risk: 'Low',      region: 'Middle East'  },
}

const COUNTRIES = Object.keys(COUNTRY_META).sort()

const REGIONS = ['All', 'Africa', 'Middle East', 'Europe', 'Asia', 'Americas', 'Oceania']

// ── Severity config ───────────────────────────────────────────────────────────
const SEV = {
  Critical: { bg: 'bg-red-600',    light: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    dot: 'bg-red-500',    bar: 100, advice: 'Do Not Travel'      },
  High:     { bg: 'bg-orange-500', light: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500', bar: 75,  advice: 'Reconsider Travel'   },
  Medium:   { bg: 'bg-yellow-500', light: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-500', bar: 50,  advice: 'Exercise Caution'    },
  Low:      { bg: 'bg-green-500',  light: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  dot: 'bg-green-500',  bar: 25,  advice: 'Normal Precautions'  },
  Unknown:  { bg: 'bg-gray-400',   light: 'bg-gray-50',   border: 'border-gray-200',   text: 'text-gray-500',   dot: 'bg-gray-400',   bar: 10,  advice: 'No advisory data'    },
}
const sev = (s) => SEV[s] || SEV.Unknown

// Risk map style (circle markers)
const RISK_STYLE = {
  Critical: { color: '#dc2626', fillColor: '#dc2626', radius: 18 },
  High:     { color: '#ea580c', fillColor: '#ea580c', radius: 14 },
  Medium:   { color: '#ca8a04', fillColor: '#eab308', radius: 11 },
  Low:      { color: '#16a34a', fillColor: '#22c55e', radius: 8  },
}
const rs = (r) => RISK_STYLE[r] || RISK_STYLE.Low

// WMO weather codes
const WMO = {
  0:'☀️ Clear',1:'🌤 Mainly clear',2:'⛅ Partly cloudy',3:'☁️ Overcast',
  45:'🌫 Fog',48:'🌫 Icy fog',51:'🌦 Light drizzle',53:'🌦 Drizzle',55:'🌧 Heavy drizzle',
  61:'🌧 Light rain',63:'🌧 Rain',65:'🌧 Heavy rain',71:'🌨 Light snow',73:'❄️ Snow',
  75:'❄️ Heavy snow',80:'🌦 Showers',81:'🌧 Showers',82:'⛈ Heavy showers',
  95:'⛈ Thunderstorm',96:'⛈ Thunderstorm+hail',99:'⛈ Heavy thunderstorm',
}
const wmo = (c) => WMO[c] ?? '🌡 —'
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const dayLabel = (i, times) => {
  if (i === 0) return 'Today'
  if (i === 1) return 'Tomorrow'
  return DOW[new Date(times[i]).getDay()]
}

function timeAgo(d) {
  if (!d) return null
  const s = Math.floor((Date.now() - new Date(d)) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s/60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m/60); if (h < 24) return `${h}h ago`
  const dy = Math.floor(h/24); return `${dy}d ago`
}

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({ title, icon: Icon, accent = 'text-gray-500', count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-[10px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
      <button className="w-full flex items-center gap-2.5 px-4 py-3 bg-gray-50 border-b border-gray-200 text-left hover:bg-gray-100 transition-colors"
        onClick={() => setOpen(o => !o)}>
        <Icon size={14} className={accent} />
        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider flex-1">{title}</span>
        {count !== undefined && (
          <span className="text-[10px] font-semibold text-gray-400 mr-1">{count}</span>
        )}
        {open ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  )
}

// ── Risk category config for individual risk items ────────────────────────────
const RISK_CAT = {
  conflict:  { icon: Swords,        color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200'    },
  security:  { icon: Lock,          color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  health:    { icon: HeartPulse,    color: 'text-rose-600',   bg: 'bg-rose-50',   border: 'border-rose-200'   },
  weather:   { icon: CloudRain,     color: 'text-sky-600',    bg: 'bg-sky-50',    border: 'border-sky-200'    },
  crime:     { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  political: { icon: Users,         color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
}
const riskCat = (cat) => RISK_CAT[cat] || RISK_CAT.security

// ── AI Brief section ──────────────────────────────────────────────────────────
function AiBrief({ brief, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-[10px] border border-[#0118A1]/20 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 bg-[#0118A1]/5 border-b border-[#0118A1]/10">
          <Brain size={14} className="text-[#0118A1]" />
          <span className="text-xs font-bold text-[#0118A1] uppercase tracking-wider">AI Risk Assessment</span>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-[#0118A1]/60">
            <RefreshCw size={9} className="animate-spin" /> Analysing all intelligence sources…
          </span>
        </div>
        <div className="p-4 space-y-2">
          {[...Array(4)].map((_,i) => (
            <div key={i} className={`h-3 bg-gray-100 rounded animate-pulse ${i === 3 ? 'w-2/3' : 'w-full'}`} />
          ))}
        </div>
      </div>
    )
  }

  if (!brief) {
    return (
      <div className="bg-white rounded-[10px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 text-center">
        <Brain size={20} className="mx-auto mb-2 text-gray-300" />
        <p className="text-xs text-gray-400">AI brief unavailable — Anthropic API key not configured.</p>
      </div>
    )
  }

  const threatLevel = brief.overall_severity || brief.threat_level || 'Unknown'
  const threatSev   = sev(threatLevel)

  return (
    <div className="bg-white rounded-[10px] border border-[#0118A1]/20 shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 bg-[#0118A1]/5 border-b border-[#0118A1]/10">
        <Brain size={14} className="text-[#0118A1]" />
        <span className="text-xs font-bold text-[#0118A1] uppercase tracking-wider">AI Risk Assessment</span>
        <span className={`ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full border ${threatSev.light} ${threatSev.border} ${threatSev.text}`}>
          {threatLevel}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-[#AACC00] font-semibold">
          <Zap size={9} /> Claude AI
        </span>
      </div>
      <div className="p-4 space-y-4">
        {brief.summary && (
          <p className="text-sm text-gray-700 leading-relaxed">{brief.summary}</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {brief.key_risks?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle size={10} /> Key Risks
              </p>
              <ul className="space-y-1.5">
                {brief.key_risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0 mt-1.5" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {brief.recommendations?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Shield size={10} /> Recommendations
              </p>
              <ul className="space-y-1.5">
                {brief.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 mt-1.5" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {brief.risks?.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Layers size={10} /> Detailed Risk Breakdown ({brief.risks.length})
            </p>
            <div className="space-y-2">
              {brief.risks.map((risk, i) => {
                const cat     = riskCat(risk.category)
                const CatIcon = cat.icon
                const rSev    = sev(risk.severity)
                return (
                  <div key={i} className={`rounded-[8px] border p-3 ${cat.bg} ${cat.border}`}>
                    <div className="flex items-start gap-2.5">
                      <CatIcon size={13} className={`${cat.color} shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-xs font-bold text-gray-800">{risk.title}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${rSev.light} ${rSev.border} ${rSev.text}`}>
                            {risk.severity}
                          </span>
                          <span className={`text-[9px] font-semibold uppercase tracking-wider ${cat.color}`}>
                            {risk.category}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 leading-snug mb-1">{risk.description}</p>
                        {risk.recommendation && (
                          <p className="text-[11px] text-gray-500 italic flex items-start gap-1">
                            <Shield size={9} className="shrink-0 mt-0.5 text-gray-400" />
                            {risk.recommendation}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Full country report ───────────────────────────────────────────────────────
function CountryReport({ country }) {
  const meta = COUNTRY_META[country]
  const [risk, setRisk]       = useState(null)
  const [weather, setWeather] = useState(null)
  const [articles, setArticles] = useState([])
  const [loading, setLoading]   = useState(true)
  const [aiLoading, setAiLoading] = useState(true)
  const generated = new Date().toLocaleString('en-GB', {
    day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit'
  })

  useEffect(() => {
    if (!meta) return
    setRisk(null); setWeather(null); setArticles([])
    setLoading(true); setAiLoading(true)

    Promise.all([
      fetch(`/api/country-risk?country=${encodeURIComponent(country)}`).then(r => r.json()).catch(() => null),
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${meta.lat}&longitude=${meta.lon}` +
        `&current=temperature_2m,weathercode,wind_speed_10m,relative_humidity_2m` +
        `&daily=temperature_2m_max,temperature_2m_min,weathercode&forecast_days=4&timezone=auto`
      ).then(r => r.json()).catch(() => null),
    ]).then(([r, w]) => {
      setRisk(r); setWeather(w)
      setLoading(false); setAiLoading(false)
    })

    fetch('/api/rss-ingest')
      .then(r => r.json())
      .then(({ feeds = [] }) => {
        const terms = [country.toLowerCase()]
        if (meta.capital) terms.push(meta.capital.toLowerCase())
        const fetches = feeds.slice(0, 8).map(f =>
          fetch(`/api/rss-ingest?id=${f.id}&limit=5`)
            .then(r => r.json())
            .then(d => (d.articles || []).map(a => ({ ...a, feedName: f.name, feedCategory: f.category })))
            .catch(() => [])
        )
        Promise.all(fetches).then(results => {
          const all = results.flat().filter(a => {
            const text = (a.title + ' ' + (a.summary || '')).toLowerCase()
            return terms.some(t => text.includes(t))
          }).sort((a,b) => new Date(b.date||0) - new Date(a.date||0)).slice(0, 12)
          setArticles(all)
        })
      }).catch(() => {})
  }, [country])

  if (!meta) return (
    <div className="bg-white rounded-[10px] border border-gray-200 p-12 text-center">
      <p className="text-sm text-gray-400">Country not found in database.</p>
    </div>
  )

  const severity = risk?.severity || 'Unknown'
  const sc       = sev(severity)
  const aiBrief  = risk?.ai_brief
    ? (() => { try { return typeof risk.ai_brief === 'string' ? JSON.parse(risk.ai_brief) : risk.ai_brief } catch { return null } })()
    : null

  return (
    <div className="space-y-4">
      {/* Report header */}
      <div className="bg-white rounded-[10px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{country}</h2>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
              <MapPin size={11} />{meta.capital}
              <span className="mx-1">·</span>
              <FileText size={11} /> Report generated {generated}
            </p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-[8px] border shrink-0 ${sc.light} ${sc.border}`}>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sc.dot}`} />
            <div className="text-right">
              <div className={`text-sm font-bold ${sc.text}`}>{severity} Risk</div>
              <div className={`text-[10px] ${sc.text} opacity-80`}>{sc.advice}</div>
            </div>
          </div>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${sc.bg}`} style={{ width: `${sc.bar}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>Low</span><span>Medium</span><span>High</span><span>Critical</span>
        </div>
      </div>

      {/* AI Assessment */}
      <AiBrief brief={aiBrief} loading={aiLoading && loading} />

      {/* Health Alerts */}
      {!loading && (() => {
        const healthSrcs = (risk?.sources || []).filter(s => s.category === 'health')
        if (!healthSrcs.length) return null
        return (
          <Section title="Health & Disease Alerts" icon={HeartPulse} accent="text-rose-600" count={healthSrcs.length}>
            <div className="mb-3 bg-rose-50 border border-rose-200 rounded-[8px] px-3 py-2.5">
              <p className="text-xs text-rose-700 font-medium">
                Live outbreak intelligence from WHO, ProMED, PAHO, CIDRAP and Outbreak News Today.
                Always verify with official travel health advisories before departure.
              </p>
            </div>
            <div className="space-y-2">
              {healthSrcs.map((src, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-[8px] border border-rose-100 bg-rose-50/40">
                  <HeartPulse size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wide block mb-0.5">{src.name}</span>
                    <p className="text-sm text-gray-800 leading-snug">{src.message}</p>
                  </div>
                  {src.url && (
                    <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-rose-300 hover:text-rose-600 shrink-0 mt-0.5">
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )
      })()}

      {/* Official Advisories */}
      {!loading && risk?.sources?.filter(s => !s.category).length > 0 && (
        <Section title="Official Advisories" icon={Shield} accent="text-[#0118A1]"
          count={risk.sources.filter(s => !s.category).length}>
          <div className="space-y-2">
            {risk.sources.filter(s => !s.category).map((src, i) => (
              <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-[8px] border border-gray-100 hover:border-[#0118A1]/30 hover:bg-blue-50/30 transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800 group-hover:text-[#0118A1]">{src.name}</span>
                    {src.level && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border
                        ${src.level >= 4 ? 'bg-red-50 border-red-200 text-red-700' :
                          src.level >= 3 ? 'bg-orange-50 border-orange-200 text-orange-700' :
                          src.level >= 2 ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                          'bg-green-50 border-green-200 text-green-700'}`}>
                        Level {src.level}
                      </span>
                    )}
                  </div>
                  {src.message && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{src.message}</p>}
                </div>
                <ExternalLink size={13} className="text-gray-300 group-hover:text-[#0118A1] shrink-0" />
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* Active Disasters */}
      {!loading && risk?.gdacs_count > 0 && (
        <Section title="Active Disaster Events" icon={AlertTriangle} accent="text-red-500" count={risk.gdacs_count}>
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-[6px] px-3 py-2">
            {risk.gdacs_count} active disaster event{risk.gdacs_count !== 1 ? 's' : ''} recorded by GDACS.{' '}
            <a href="https://gdacs.org" target="_blank" rel="noopener noreferrer" className="underline font-medium">View on GDACS →</a>
          </p>
        </Section>
      )}

      {/* Seismic */}
      {!loading && risk?.usgs_count > 0 && (
        <Section title="Seismic Activity" icon={AlertTriangle} accent="text-orange-500" count={risk.usgs_count}>
          <p className="text-sm text-orange-700 bg-orange-50 border border-orange-100 rounded-[6px] px-3 py-2">
            {risk.usgs_count} M5+ earthquake{risk.usgs_count !== 1 ? 's' : ''} in the past 7 days.{' '}
            <a href="https://earthquake.usgs.gov/earthquakes/map" target="_blank" rel="noopener noreferrer" className="underline font-medium">View on USGS →</a>
          </p>
        </Section>
      )}

      {/* Weather */}
      {weather?.current && (
        <Section title={`Weather — ${meta.capital}`} icon={Thermometer} accent="text-sky-500">
          <div className="flex items-center gap-4 mb-4">
            <div className="text-4xl font-bold text-gray-900">{Math.round(weather.current.temperature_2m)}°C</div>
            <div>
              <p className="text-sm font-medium text-gray-700">{wmo(weather.current.weathercode)}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Wind size={10} />{Math.round(weather.current.wind_speed_10m)} km/h</span>
                <span className="flex items-center gap-1"><Thermometer size={10} />{weather.current.relative_humidity_2m}% humidity</span>
              </div>
            </div>
          </div>
          {weather.daily?.time && (
            <div className="grid grid-cols-4 gap-2">
              {weather.daily.time.slice(0,4).map((_,i) => (
                <div key={i} className="text-center bg-gray-50 rounded-[6px] px-2 py-2.5">
                  <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">{dayLabel(i, weather.daily.time)}</div>
                  <div className="text-sm mb-1">{wmo(weather.daily.weathercode[i]).split(' ')[0]}</div>
                  <div className="text-xs font-semibold text-gray-800">{Math.round(weather.daily.temperature_2m_max[i])}°</div>
                  <div className="text-[10px] text-gray-400">{Math.round(weather.daily.temperature_2m_min[i])}°</div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Intel Headlines */}
      <Section title="Intelligence Headlines" icon={FileText} accent="text-purple-500" count={articles.length} defaultOpen={articles.length > 0}>
        {articles.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">No recent articles found mentioning {country}.</p>
        ) : (
          <div className="space-y-0 divide-y divide-gray-100">
            {articles.map((a, i) => (
              <div key={i} className="flex items-start gap-3 py-3 group">
                <div className="w-1.5 h-1.5 rounded-full bg-[#AACC00] mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <a href={a.url} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-900 hover:text-[#0118A1] hover:underline leading-snug block mb-1">
                    {a.title}
                  </a>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-gray-50 border-gray-200 text-gray-500">
                      {a.feedName}
                    </span>
                    {a.date && (
                      <span className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Clock size={9} />{timeAgo(a.date)}
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
      </Section>

      {loading && (
        <div className="bg-white rounded-[10px] border border-gray-200 p-6 text-center">
          <RefreshCw size={16} className="animate-spin text-[#0118A1] mx-auto mb-2" />
          <p className="text-xs text-gray-400">Fetching intelligence from all sources…</p>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CountryRiskReport() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search,        setSearch]        = useState('')
  const [regionFilter,  setRegionFilter]  = useState('All')
  const [mapReady,      setMapReady]      = useState(false)

  const containerRef       = useRef(null)
  const mapRef             = useRef(null)
  const markersRef         = useRef([])
  const selectCountryRef   = useRef(null)  // always-current ref for map popup callbacks

  const selectedParam = searchParams.get('country') || ''
  const [selected, setSelected] = useState(
    Object.keys(COUNTRY_META).includes(selectedParam) ? selectedParam : null
  )

  // Sync URL → state
  useEffect(() => {
    if (selectedParam && Object.keys(COUNTRY_META).includes(selectedParam)) {
      setSelected(selectedParam)
    } else if (!selectedParam) {
      setSelected(null)
    }
  }, [selectedParam])

  const selectCountry = (c) => {
    setSelected(c)
    setSearchParams({ country: c })
  }

  const backToMap = () => {
    setSelected(null)
    setSearchParams({})
  }

  // Keep the ref current on every render so map popup buttons always call the latest version
  selectCountryRef.current = selectCountry

  // Register map popup button handler once — uses ref to avoid stale closure
  useEffect(() => {
    window.__riskReportGoto = (country) => selectCountryRef.current?.(country)
    return () => { delete window.__riskReportGoto }
  }, [])

  // Initialise Leaflet map only when the map section is visible (selected === null).
  // Initialising on a display:none container produces a 0×0 map and can crash the effect.
  // When a country report is open, tear the map down cleanly so it re-inits fresh on return.
  useEffect(() => {
    if (selected) {
      // Report is open — tear down the map if it exists
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        markersRef.current = []
        setMapReady(false)
      }
      return
    }

    // Map section is visible — initialise if not already done
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [5, 20], zoom: 3,
      zoomControl: true, scrollWheelZoom: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com">CARTO</a>',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map)

    mapRef.current = map
    setMapReady(true)

    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = []
      setMapReady(false)
    }
  }, [selected])

  // Add / refresh risk markers whenever region filter or map readiness changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    const filtered = Object.entries(RISK_MAP).filter(([, c]) =>
      regionFilter === 'All' || c.region === regionFilter
    )

    filtered.forEach(([name, c]) => {
      const s        = rs(c.risk)
      const safeName = name.replace(/'/g, "\\'")
      const riskColor = c.risk === 'Medium' ? '#1f2937' : '#fff'

      const marker = L.circleMarker([c.lat, c.lon], {
        radius: s.radius, color: s.color,
        fillColor: s.fillColor, fillOpacity: 0.65, weight: 1.5,
      })

      marker.bindPopup(`
        <div style="font-family:sans-serif;padding:4px 0;min-width:170px">
          <div style="font-weight:700;font-size:14px;margin-bottom:6px">${name}</div>
          <div style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;
            background:${s.fillColor};color:${riskColor};margin-bottom:8px">
            ${c.risk} Risk
          </div>
          <div style="font-size:11px;color:#6b7280;margin-bottom:10px">${c.region}</div>
          <button onclick="window.__riskReportGoto('${safeName}')"
            style="display:block;width:100%;background:#0118A1;color:#fff;border:none;
              border-radius:6px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer">
            View Full Report →
          </button>
        </div>`)

      marker.addTo(map)
      markersRef.current.push(marker)
    })
  }, [mapReady, regionFilter])

  // Fly to selected country on map when it changes
  useEffect(() => {
    if (!mapRef.current || !selected) return
    const c = RISK_MAP[selected]
    if (c) mapRef.current.flyTo([c.lat, c.lon], 5, { duration: 1.2 })
  }, [selected])

  const filtered = COUNTRIES.filter(c => c.toLowerCase().includes(search.toLowerCase()))

  // Risk counts for the summary strip
  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 }
  Object.values(RISK_MAP).forEach(c => { if (counts[c.risk] !== undefined) counts[c.risk]++ })

  return (
    <Layout>
      {/* Page header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={20} className="text-[#0118A1]" />
          <h1 className="text-2xl font-bold text-gray-900">Country Risk Reports</h1>
        </div>
        <p className="text-sm text-gray-500">
          Select a country on the map or from the list for a full AI-powered assessment — live conflict,
          health outbreak, weather and security intelligence from 25+ sources.
        </p>
      </div>

      {/* Risk count strip — always visible */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {['Critical', 'High', 'Medium', 'Low'].map(level => {
          const s = SEV[level]
          return (
            <div key={level} className={`border rounded-[8px] p-3 flex items-center gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]
              ${selected ? 'bg-white border-gray-200' : `${s.light} ${s.border}`}`}>
              <div className={`w-3 h-3 rounded-full shrink-0 ${s.dot}`} />
              <div>
                <div className="text-lg font-bold text-gray-900 leading-none">{counts[level]}</div>
                <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">{level}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-5 items-start">

        {/* ── Left sidebar — always visible ── */}
        <div className="w-52 shrink-0 sticky top-6 space-y-3">
          <div className="bg-white rounded-[10px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search country…"
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-[6px] text-xs focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 focus:border-[#0118A1]"
                />
              </div>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
              {filtered.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No results</p>
              )}
              {filtered.map(c => {
                const riskLevel = RISK_MAP[c]?.risk
                const rStyle    = riskLevel ? RISK_STYLE[riskLevel] : null
                return (
                  <button key={c} onClick={() => selectCountry(c)}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2.5 border-b border-gray-50 text-sm transition-colors
                      ${selected === c
                        ? 'bg-[#0118A1] text-white font-semibold'
                        : 'text-gray-700 hover:bg-gray-50'}`}>
                    {rStyle && (
                      <div className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: selected === c ? 'white' : rStyle.fillColor }} />
                    )}
                    <span className="text-xs flex-1 truncate">{c}</span>
                    {selected === c && <ChevronRight size={13} />}
                  </button>
                )
              })}
            </div>
          </div>

          {selected && (
            <button onClick={backToMap}
              className="w-full flex items-center gap-2 justify-center px-3 py-2.5 bg-white border border-gray-200 rounded-[8px] text-xs text-gray-600 font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <ArrowLeft size={12} className="text-[#0118A1]" />
              Back to Risk Map
            </button>
          )}
        </div>

        {/* ── Right content area ── */}
        <div className="flex-1 min-w-0">

          {/* Map view — always mounted, hidden when report is open */}
          <div style={{ display: selected ? 'none' : 'block' }}>
            {/* Region filter */}
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {REGIONS.map(r => (
                <button key={r} onClick={() => setRegionFilter(r)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                    ${regionFilter === r
                      ? 'bg-[#0118A1] text-white border-[#0118A1]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                  {r}
                </button>
              ))}
            </div>

            {/* Map container */}
            <div className="rounded-[10px] overflow-hidden border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
              style={{ height: 500 }}>
              <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
            </div>

            {/* Legend */}
            <div className="mt-3 flex items-center gap-5 bg-white border border-gray-200 rounded-[8px] px-4 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">Risk Level</span>
              {['Critical', 'High', 'Medium', 'Low'].map(level => {
                const s = RISK_STYLE[level]
                return (
                  <div key={level} className="flex items-center gap-1.5">
                    <div className="rounded-full shrink-0"
                      style={{ width: s.radius * 1.2, height: s.radius * 1.2, background: s.fillColor, opacity: 0.85 }} />
                    <span className="text-xs text-gray-600">{level}</span>
                  </div>
                )
              })}
              <span className="ml-auto text-[10px] text-gray-400">
                {Object.entries(RISK_MAP).filter(([, c]) => regionFilter === 'All' || c.region === regionFilter).length} countries · click any circle for report
              </span>
            </div>
          </div>

          {/* Report view */}
          {selected && <CountryReport key={selected} country={selected} />}

        </div>
      </div>
    </Layout>
  )
}
