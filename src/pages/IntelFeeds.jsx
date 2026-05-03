import { useEffect, useState } from 'react'
import {
  Radio, RefreshCw, ExternalLink, Key, Handshake,
  Clock, Plus, X, Plane, Ship, Rss,
  Zap, Globe, Shield, MessageSquare, Crosshair, MapPin, CloudLightning,
  Check, AlertCircle, Activity, ChevronDown, ChevronUp, Lightbulb, Star
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

// ── Categories ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'flight',       label: 'Flight Intelligence',  icon: Plane,          bg: 'bg-sky-100',    text: 'text-sky-800',    border: 'border-sky-200' },
  { id: 'vessel',       label: 'Vessel Tracking',       icon: Ship,           bg: 'bg-cyan-100',   text: 'text-cyan-800',   border: 'border-cyan-200' },
  { id: 'conflict',     label: 'Armed Conflict',        icon: Crosshair,      bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-200' },
  { id: 'loadshedding', label: 'Load Shedding',         icon: Zap,            bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-200' },
  { id: 'country-risk', label: 'Country Risk',          icon: Globe,          bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200' },
  { id: 'security',     label: 'Security Intelligence', icon: Shield,         bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
  { id: 'health',       label: 'Disease & Health',      icon: Activity,       bg: 'bg-rose-100',   text: 'text-rose-800',   border: 'border-rose-200' },
  { id: 'community',    label: 'Community Reports',     icon: MessageSquare,  bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-200' },
  { id: 'weather',      label: 'Weather & Disasters',   icon: CloudLightning, bg: 'bg-teal-100',   text: 'text-teal-800',   border: 'border-teal-200' },
]
const getCat = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[5]

// ── Built-in feeds ───────────────────────────────────────────────────────────
const BUILTIN_FEEDS = [
  // International — Flight
  { id: 'flightaware', name: 'FlightAware AeroAPI', category: 'flight', feedType: 'REST API', scope: 'international', countries: [],
    description: 'Live flight status, delays and cancellations for all tracked flights.', geography: 'Global', updateFrequency: 'Real-time',
    status: 'active', sourceUrl: 'https://flightaware.com/aeroapi/', builtin: true },

  // International — Vessel
  { id: 'aisstream', name: 'AISStream', category: 'vessel', feedType: 'REST API', scope: 'international', countries: [],
    description: 'Real-time maritime vessel tracking — Gulf of Aden, Red Sea, Strait of Hormuz, Gulf of Guinea, Mozambique Channel, Suez Canal.',
    geography: 'Africa coastal + Middle East waters', updateFrequency: 'Real-time (15 min cache)',
    status: 'pending_key', envVar: 'AISSTREAM_API_KEY', sourceUrl: 'https://aisstream.io', builtin: true },

  // International — Conflict
  { id: 'acled', name: 'ACLED', category: 'conflict', feedType: 'REST API', scope: 'international', countries: [],
    description: 'Armed Conflict Location & Event Data — GPS-tagged security incidents and violence across Africa.', geography: 'Africa-wide', updateFrequency: 'Daily',
    status: 'pending_key', envVar: 'ACLED_API_KEY + ACLED_EMAIL', sourceUrl: 'https://acleddata.com/register/', builtin: true },
  { id: 'ucdp', name: 'UCDP', category: 'conflict', feedType: 'REST API', scope: 'international', countries: [],
    description: 'Uppsala Conflict Data Program — geo-referenced armed conflict events with casualty data. Independent academic methodology, complements ACLED.',
    geography: 'Africa + Middle East', updateFrequency: 'Ongoing (1 hr cache)',
    status: 'active', sourceUrl: 'https://ucdpapi.pcr.uu.se', builtin: true },

  // International — Country Risk
  { id: 'state-dept', name: 'US State Dept', category: 'country-risk', feedType: 'REST API', scope: 'international', countries: [],
    description: 'US State Department travel advisories — 4-level risk ratings for every country globally.', geography: 'Global', updateFrequency: 'As issued (1 hr cache)',
    status: 'active', sourceUrl: 'https://travel.state.gov', builtin: true },
  { id: 'fcdo', name: 'UK FCDO', category: 'country-risk', feedType: 'REST API', scope: 'international', countries: [],
    description: 'UK Foreign Commonwealth & Development Office travel advisories — detailed region-level risk ratings.', geography: 'Global', updateFrequency: 'As issued (1 hr cache)',
    status: 'active', sourceUrl: 'https://www.gov.uk/foreign-travel-advice', builtin: true },

  // International — Security Intelligence
  { id: 'ocha-hapi', name: 'UN OCHA HAPI', category: 'security', feedType: 'REST API', scope: 'international', countries: [],
    description: 'UN Humanitarian API — conflict events, refugees and displacement, food security crises across Africa and Middle East.',
    geography: 'Africa + Middle East', updateFrequency: 'Daily (1 hr cache)',
    status: 'pending_key', envVar: 'OCHA_HAPI_API_KEY', sourceUrl: 'https://hapi.humdata.org', builtin: true },

  // International — Disease & Health
  { id: 'who-outbreak', name: 'WHO Disease Outbreak News', category: 'health', feedType: 'RSS Feed', scope: 'international', countries: [],
    description: 'World Health Organization official disease outbreak news — confirmed outbreaks, alerts, and public health emergencies of international concern (PHEIC).',
    geography: 'Global', updateFrequency: 'As issued',
    status: 'active', sourceUrl: 'https://www.who.int/emergencies/disease-outbreak-news', builtin: true },
  { id: 'cdc-travel-health', name: 'CDC Travel Health Notices', category: 'health', feedType: 'RSS Feed', scope: 'international', countries: [],
    description: 'US Centers for Disease Control travel health notices — Warning (Level 3), Alert (Level 2), Watch (Level 1) for infectious disease risks at destinations.',
    geography: 'Global', updateFrequency: 'As issued',
    status: 'active', sourceUrl: 'https://wwwnc.cdc.gov/travel/notices', builtin: true },
  { id: 'ecdc-threats', name: 'ECDC Communicable Disease Threats', category: 'health', feedType: 'RSS Feed', scope: 'international', countries: [],
    description: 'European Centre for Disease Prevention and Control weekly communicable disease threats report — active outbreaks relevant to travellers.',
    geography: 'Global (EU focus)', updateFrequency: 'Weekly',
    status: 'active', sourceUrl: 'https://www.ecdc.europa.eu/en/threats-and-outbreaks/reports-and-data', builtin: true },
  { id: 'promed', name: 'ProMED Mail', category: 'health', feedType: 'RSS Feed', scope: 'international', countries: [],
    description: 'Expert-moderated global rapid reporting of infectious disease outbreaks and acute exposures. One of the world\'s largest disease surveillance systems.',
    geography: 'Global', updateFrequency: 'Multiple daily',
    status: 'active', sourceUrl: 'https://promedmail.org', builtin: true },

  // International — Community
  { id: 'whatsapp', name: 'WhatsApp Community', category: 'community', feedType: 'Webhook', scope: 'international', countries: [],
    description: 'Ground-truth incident reports submitted by field contacts and travellers via WhatsApp.', geography: 'All regions', updateFrequency: 'Real-time',
    status: 'active', builtin: true },

  // International — Weather & Disasters
  { id: 'gdacs', name: 'GDACS', category: 'weather', feedType: 'REST API', scope: 'international', countries: [],
    description: 'UN Global Disaster Alert & Coordination System — cyclones, floods, earthquakes, volcanoes, droughts and wildfires. Free, no API key required.',
    geography: 'Global (Africa-wide coverage)', updateFrequency: 'Real-time',
    status: 'active', sourceUrl: 'https://www.gdacs.org', builtin: true },
  { id: 'usgs', name: 'USGS Earthquakes', category: 'weather', feedType: 'REST API', scope: 'international', countries: [],
    description: 'US Geological Survey real-time earthquake feed — magnitude 4.5+ events globally including East Africa Rift, Cape region and Indian Ocean.',
    geography: 'Global', updateFrequency: 'Real-time',
    status: 'active', sourceUrl: 'https://earthquake.usgs.gov/fdsnws/event/1/', builtin: true },
  { id: 'openweathermap', name: 'OpenWeatherMap', category: 'weather', feedType: 'REST API', scope: 'international', countries: [],
    description: 'Severe weather alerts, storm warnings and current conditions for any location. Government-issued alerts pushed in real time.',
    geography: 'Global', updateFrequency: 'Real-time (30 min cache)',
    status: 'pending_key', envVar: 'OPENWEATHERMAP_API_KEY', sourceUrl: 'https://openweathermap.org/api/one-call-3', builtin: true },
  { id: 'eonet', name: 'NASA EONET', category: 'weather', feedType: 'REST API', scope: 'international', countries: [],
    description: 'NASA Earth Observatory Natural Event Tracker — wildfires, severe storms, volcanoes, floods, drought and dust events across Africa.',
    geography: 'Africa + Middle East', updateFrequency: 'Real-time (30 min cache)',
    status: 'active', sourceUrl: 'https://eonet.gsfc.nasa.gov', builtin: true },
  { id: 'open-meteo', name: 'Open-Meteo', category: 'weather', feedType: 'REST API', scope: 'international', countries: [],
    description: 'Free open-source weather API — current conditions and 3-day forecasts for 18 monitored African and Middle East cities. No API key required.',
    geography: 'Africa + Middle East (18 cities)', updateFrequency: 'Hourly (30 min cache)',
    status: 'active', sourceUrl: 'https://open-meteo.com', builtin: true },

  // International — Security Intelligence (additional)
  { id: 'osac', name: 'OSAC', category: 'security', feedType: 'RSS Feed', scope: 'international', countries: [],
    description: 'Overseas Security Advisory Council — detailed US State Dept security reports for business travellers. Comprehensive Africa and Middle East coverage.',
    geography: 'Africa + Middle East', updateFrequency: 'As issued',
    status: 'pending', sourceUrl: 'https://www.osac.gov', builtin: true },
  { id: 'control-risks', name: 'Control Risks', category: 'security', feedType: 'Partnership', scope: 'international', countries: [],
    description: 'World-leading political risk and security intelligence — real-time alerts, 180+ country profiles, analyst reports and 24/7 crisis response.',
    geography: 'Global', updateFrequency: 'Real-time',
    status: 'partnership', sourceUrl: 'https://www.controlrisks.com', builtin: true },
  { id: 'crisis24', name: 'Crisis24 (Garda World)', category: 'security', feedType: 'Partnership', scope: 'international', countries: [],
    description: 'AI-powered global risk intelligence — real-time threat feeds, analyst assessments and traveller tracking for enterprise clients.',
    geography: 'Global', updateFrequency: 'Real-time',
    status: 'partnership', sourceUrl: 'https://crisis24.garda.com', builtin: true },
  { id: 'dataminr', name: 'Dataminr', category: 'security', feedType: 'Partnership', scope: 'international', countries: [],
    description: 'AI real-time event detection from 500,000+ public sources — first alerts 20–30 minutes ahead of traditional news. Critical for fast-moving crises.',
    geography: 'Global', updateFrequency: 'Real-time',
    status: 'partnership', sourceUrl: 'https://www.dataminr.com', builtin: true },
  { id: 'stratfor', name: 'Stratfor (RANE)', category: 'security', feedType: 'Partnership', scope: 'international', countries: [],
    description: 'Geopolitical intelligence and forecasting — country outlooks, threat assessments and strategic analysis trusted by government and corporate security teams.',
    geography: 'Global', updateFrequency: 'Daily / as issued',
    status: 'partnership', sourceUrl: 'https://worldview.stratfor.com', builtin: true },
  { id: 'african-arguments', name: 'African Arguments', category: 'security', feedType: 'RSS Feed', scope: 'international', countries: [],
    description: 'Expert analysis on African politics, security and society — in-depth reporting on conflict zones, governance and elections across the continent.',
    geography: 'Africa', updateFrequency: 'Multiple weekly',
    status: 'pending', sourceUrl: 'https://africanarguments.org/feed/', builtin: true },

  // International — Conflict (additional)
  { id: 'gdelt', name: 'GDELT Project', category: 'conflict', feedType: 'REST API', scope: 'international', countries: [],
    description: 'Monitors world news in 100+ languages with 15-minute update cycles — massive open dataset of global events for Africa conflict monitoring.',
    geography: 'Global', updateFrequency: 'Every 15 minutes',
    status: 'pending', sourceUrl: 'https://www.gdeltproject.org', builtin: true },

  // International — Weather (additional)
  { id: 'nasa-firms', name: 'NASA FIRMS', category: 'weather', feedType: 'REST API', scope: 'international', countries: [],
    description: 'Fire Information for Resource Management System — near real-time active fire detection. Critical for Africa dry-season wildfire and bushfire monitoring.',
    geography: 'Africa + Global', updateFrequency: 'Real-time',
    status: 'pending_key', envVar: 'NASA_FIRMS_API_KEY', sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/api/', builtin: true },

  // International — Disease & Health (additional)
  { id: 'healthmap', name: 'HealthMap', category: 'health', feedType: 'REST API', scope: 'international', countries: [],
    description: 'Automated disease surveillance from social media, news and official sources — real-time intelligence on emerging infectious disease threats for travellers.',
    geography: 'Global', updateFrequency: 'Near real-time',
    status: 'pending_key', envVar: 'HEALTHMAP_API_KEY', sourceUrl: 'https://healthmap.org/en/', builtin: true },
  { id: 'healix', name: 'Healix', category: 'health', feedType: 'Partnership', scope: 'international', countries: [],
    description: 'Medical and security travel risk management — real-time health travel alerts, country medical risk profiles and 24/7 medical assistance.',
    geography: 'Global', updateFrequency: 'Real-time',
    status: 'partnership', sourceUrl: 'https://www.healix.com', builtin: true },
  { id: 'intl-sos', name: 'International SOS', category: 'health', feedType: 'Partnership', scope: 'international', countries: [],
    description: 'Medical and security travel risk management — alerts, country health briefings, 24/7 assistance and evacuation coordination.',
    geography: 'Global', updateFrequency: 'Real-time',
    status: 'partnership', sourceUrl: 'https://www.internationalsos.com', builtin: true },

  // Local — South Africa
  { id: 'eskomsepush', name: 'EskomSePush', category: 'loadshedding', feedType: 'REST API', scope: 'local', countries: ['South Africa'],
    description: 'Live Eskom load shedding stage and area schedules across South Africa.', geography: 'South Africa', updateFrequency: 'Real-time (15 min cache)',
    status: 'pending_key', envVar: 'ESKOMSEPUSH_API_KEY', sourceUrl: 'https://eskomsepush.gumroad.com/l/api', builtin: true },
  { id: 'riley-risk', name: 'Riley Risk', category: 'security', feedType: 'Partnership', scope: 'local', countries: ['South Africa'],
    description: 'South Africa-based travel security intelligence — local ground truth for SA and sub-Saharan Africa.', geography: 'South Africa', updateFrequency: 'Partnership required',
    status: 'partnership', sourceUrl: 'https://www.rileyrisk.com', builtin: true },
  { id: 'saps', name: 'SAPS Crime Stats', category: 'security', feedType: 'Manual / Upload', scope: 'local', countries: ['South Africa'],
    description: 'South African Police Service quarterly crime statistics by station and province.', geography: 'South Africa', updateFrequency: 'Quarterly',
    status: 'active', sourceUrl: 'https://www.saps.gov.za/services/crimestats.php', builtin: true },

  // Local — Mozambique
  { id: 'prm-moz', name: 'PRM Mozambique', category: 'security', feedType: 'Manual / Upload', scope: 'local', countries: ['Mozambique'],
    description: 'Polícia da República de Moçambique — limited public crime data. ACLED is primary source for Mozambique.', geography: 'Mozambique', updateFrequency: 'Irregular',
    status: 'pending', sourceUrl: 'https://www.mint.gov.mz', builtin: true },

  // Local — Kenya
  { id: 'nps-kenya', name: 'Kenya National Police Service', category: 'security', feedType: 'Manual / Upload', scope: 'local', countries: ['Kenya'],
    description: 'National Police Service Kenya — annual crime statistics and security advisories.', geography: 'Kenya', updateFrequency: 'Annual',
    status: 'pending', sourceUrl: 'https://www.npscommunication.go.ke', builtin: true },

  // Local — Nigeria
  { id: 'npf-nigeria', name: 'Nigeria Police Force', category: 'security', feedType: 'Manual / Upload', scope: 'local', countries: ['Nigeria'],
    description: 'Nigeria Police Force — limited public data. ACLED is primary source for Nigeria.', geography: 'Nigeria', updateFrequency: 'Irregular',
    status: 'pending', sourceUrl: 'https://www.npf.gov.ng', builtin: true },
]

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  active:      { label: 'Live',                dot: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
  pending_key: { label: 'API Key Needed',      dot: 'bg-amber-400',  text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  partnership: { label: 'Pending Partnership', dot: 'bg-violet-400', text: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
  pending:     { label: 'Pending Setup',       dot: 'bg-gray-400',   text: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-200' },
  error:       { label: 'Error',               dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200' },
}

// ── Audit: feeds needing activation ──────────────────────────────────────────
const ACTIVATION_GUIDE = {
  acled: {
    cost: 'Free — academic/non-commercial registration',
    steps: [
      'Register at acleddata.com/register (approval within 48 hrs)',
      'Copy your API key and registered email from your ACLED dashboard',
      'Add ACLED_API_KEY and ACLED_EMAIL to Vercel → Settings → Environment Variables',
      'Redeploy to activate',
    ],
    url: 'https://acleddata.com/register/',
  },
  aisstream: {
    cost: 'Free tier — 1,000 vessels / 5 zones',
    steps: [
      'Register at aisstream.io',
      'Create an API key in your dashboard',
      'Add AISSTREAM_API_KEY to Vercel Environment Variables',
      'Redeploy to activate',
    ],
    url: 'https://aisstream.io',
  },
  eskomsepush: {
    cost: '$14 / month (Professional plan)',
    steps: [
      'Purchase Professional plan at eskomsepush.gumroad.com/l/api',
      'API key delivered by email after payment',
      'Add ESKOMSEPUSH_API_KEY to Vercel Environment Variables',
      'Redeploy to activate',
    ],
    url: 'https://eskomsepush.gumroad.com/l/api',
  },
  'ocha-hapi': {
    cost: 'Free',
    steps: [
      'Register at hapi.humdata.org and request an API key',
      'Add OCHA_HAPI_API_KEY to Vercel Environment Variables',
      'Redeploy to activate',
    ],
    url: 'https://hapi.humdata.org',
  },
  openweathermap: {
    cost: 'Free tier — 1,000 API calls/day',
    steps: [
      'Register at openweathermap.org/api',
      'Subscribe to One Call API 3.0 (free tier available)',
      'Copy your API key from the dashboard',
      'Add OPENWEATHERMAP_API_KEY to Vercel Environment Variables',
      'Redeploy to activate',
    ],
    url: 'https://openweathermap.org/api/one-call-3',
  },
  'nasa-firms': {
    cost: 'Free — NASA account required',
    steps: [
      'Register at firms.modaps.eosdis.nasa.gov/api/ with your email',
      'Receive your MAP_KEY by email (usually instant)',
      'Add NASA_FIRMS_API_KEY to Vercel Environment Variables',
      'Redeploy to activate',
    ],
    url: 'https://firms.modaps.eosdis.nasa.gov/api/',
  },
  healthmap: {
    cost: 'Free — HealthMap API access request',
    steps: [
      'Request API access at healthmap.org/en/ (contact their team)',
      'Receive your API key by email',
      'Add HEALTHMAP_API_KEY to Vercel Environment Variables',
      'Redeploy to activate',
    ],
    url: 'https://healthmap.org/en/',
  },
}

// All suggested feeds have been promoted to BUILTIN_FEEDS above
const SUGGESTED_FEEDS = []

// ── Status icon ───────────────────────────────────────────────────────────────
function StatusIcon({ status }) {
  if (status === 'active') {
    return <Check size={15} className="text-green-500" strokeWidth={2.5} />
  }
  if (status === 'error') {
    return <X size={15} className="text-red-500" strokeWidth={2.5} />
  }
  return <Plus size={15} className="text-amber-400" strokeWidth={2.5} />
}

function CategoryPill({ categoryId }) {
  const c = getCat(categoryId)
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${c.bg} ${c.text} ${c.border}`}>
      <Icon size={10} />{c.label}
    </span>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────
function StatusLegend() {
  return (
    <div className="flex items-center gap-5 text-xs text-gray-500 mb-3">
      <span className="font-medium text-gray-600">Status:</span>
      <span className="flex items-center gap-1.5"><Check size={12} className="text-green-500" strokeWidth={2.5} /> Live</span>
      <span className="flex items-center gap-1.5"><Plus size={12} className="text-amber-400" strokeWidth={2.5} /> Needs activation</span>
      <span className="flex items-center gap-1.5"><X size={12} className="text-red-500" strokeWidth={2.5} /> Error</span>
    </div>
  )
}

// ── Feed Table Row ────────────────────────────────────────────────────────────
function FeedRow({ feed, onDelete }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-[#0118A1]/[0.03] transition-colors group">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{feed.name}</span>
          {!feed.builtin && (
            <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded font-medium">Custom</span>
          )}
        </div>
        {feed.envVar && (
          <span className="text-[10px] font-mono text-gray-400">{feed.envVar}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <CategoryPill categoryId={feed.category} />
      </td>
      <td className="px-4 py-3 max-w-xs">
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{feed.description || '—'}</p>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-xs text-gray-700">{feed.geography || '—'}</span>
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex justify-center">
          <StatusIcon status={feed.status} />
        </div>
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          {feed.sourceUrl && (
            <a href={feed.sourceUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-[#0118A1] hover:underline font-medium flex items-center gap-1">
              <ExternalLink size={11} />
              {feed.status === 'pending_key' ? 'Get key' : feed.status === 'partnership' ? 'Website' : 'Source'}
            </a>
          )}
          {!feed.builtin && (
            <button onClick={() => onDelete(feed.id)} className="text-gray-300 hover:text-red-400 transition-colors">
              <X size={13} />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Feed Table ────────────────────────────────────────────────────────────────
function FeedTable({ feeds, onDelete, emptyMsg }) {
  if (!feeds.length) {
    return <div className="text-xs text-gray-400 italic py-8 text-center">{emptyMsg}</div>
  }

  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    feeds: feeds.filter(f => f.category === cat.id),
  })).filter(g => g.feeds.length > 0)

  return (
    <div className="bg-white rounded-[8px] border border-gray-200 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-200 bg-gray-50/80">
            <th className="px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Feed</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Category</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">What it provides</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Geography</th>
            <th className="px-4 py-2.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {grouped.map(group => {
            const GIcon = group.icon
            return (
              <>
                <tr key={`cat-${group.id}`}>
                  <td colSpan={6} className={`px-4 py-2 ${group.bg} border-y ${group.border}`}>
                    <div className="flex items-center gap-2">
                      <GIcon size={12} className={group.text} />
                      <span className={`text-[11px] font-bold uppercase tracking-widest ${group.text}`}>{group.label}</span>
                      <span className={`text-[10px] font-semibold ${group.text} opacity-60`}>{group.feeds.length}</span>
                    </div>
                  </td>
                </tr>
                {group.feeds.map(feed => (
                  <FeedRow key={feed.id} feed={feed} onDelete={onDelete} />
                ))}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Audit Panel ───────────────────────────────────────────────────────────────
function ActivationCard({ feed, guide }) {
  const [open, setOpen] = useState(false)
  if (!guide) return null
  return (
    <div className="bg-white border border-amber-200 rounded-[8px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border-b border-amber-200 cursor-pointer"
        onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <Plus size={14} className="text-amber-500" strokeWidth={2.5} />
          <div>
            <span className="text-sm font-semibold text-gray-900">{feed.name}</span>
            <span className="text-xs text-gray-500 ml-2">{feed.description?.split('—')[0]?.trim()}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-amber-700 bg-amber-100 border border-amber-200 rounded px-2 py-0.5 font-medium">{guide.cost}</span>
          {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </div>
      {open && (
        <div className="px-4 py-4">
          <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Activation steps</p>
          <ol className="space-y-1.5 mb-4">
            {guide.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 font-bold flex items-center justify-center text-[10px] mt-0.5">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <a href={guide.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 bg-[#AACC00] hover:bg-[#99bb00] text-[#0118A1] font-semibold px-4 py-2 rounded-[6px] text-xs transition-colors">
            <ExternalLink size={12} />
            {guide.cost.startsWith('$') || guide.cost.toLowerCase().includes('month') ? 'Purchase & get key' : 'Register for free key'}
          </a>
        </div>
      )}
    </div>
  )
}

function SuggestedCard({ suggestion }) {
  const c = getCat(suggestion.category)
  const Icon = c.icon
  return (
    <div className="bg-white border border-gray-200 rounded-[8px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{suggestion.name}</span>
          {suggestion.tier === 'paid' && (
            <span className="inline-flex items-center gap-0.5 text-[10px] bg-violet-50 text-violet-700 border border-violet-200 rounded px-1.5 py-0.5 font-semibold">
              <Star size={8} /> Premium
            </span>
          )}
          {suggestion.tier === 'free' && (
            <span className="text-[10px] bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 font-semibold">Free</span>
          )}
        </div>
        <a href={suggestion.url} target="_blank" rel="noopener noreferrer"
          className="shrink-0 text-[#0118A1] hover:text-[#0118A1]/70 transition-colors">
          <ExternalLink size={13} />
        </a>
      </div>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border mb-2 ${c.bg} ${c.text} ${c.border}`}>
        <Icon size={9} />{c.label}
      </span>
      <p className="text-xs text-gray-500 leading-relaxed mt-1">{suggestion.description}</p>
      <p className="text-[10px] text-gray-400 mt-2 font-medium">{suggestion.region} · {suggestion.cost}</p>
    </div>
  )
}

function AuditPanel({ allFeeds }) {
  const activeFeeds = allFeeds.filter(f => f.status === 'active')
  const pendingFeeds = allFeeds.filter(f => ['pending_key', 'pending', 'partnership'].includes(f.status))
  const pendingKeyFeeds = allFeeds.filter(f => f.status === 'pending_key')

  const freesuggestions = SUGGESTED_FEEDS.filter(s => s.tier === 'free')
  const paidSuggestions = SUGGESTED_FEEDS.filter(s => s.tier === 'paid')

  return (
    <div className="space-y-8">

      {/* ── Section A: Active ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <h2 className="text-base font-bold text-gray-900">Active & Live</h2>
          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{activeFeeds.length} feeds</span>
        </div>
        <div className="bg-white border border-green-200 rounded-[8px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          {activeFeeds.map((feed, i) => {
            const c = getCat(feed.category)
            const Icon = c.icon
            return (
              <div key={feed.id}
                className={`flex items-center gap-3 px-4 py-3 ${i < activeFeeds.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <Check size={14} className="text-green-500 shrink-0" strokeWidth={2.5} />
                <span className="text-sm font-semibold text-gray-900 min-w-[160px]">{feed.name}</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border shrink-0 ${c.bg} ${c.text} ${c.border}`}>
                  <Icon size={9} />{c.label}
                </span>
                <span className="text-xs text-gray-500 flex-1 truncate">{feed.geography}</span>
                <span className="text-[10px] text-gray-400">{feed.updateFrequency}</span>
                {feed.sourceUrl && (
                  <a href={feed.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="text-gray-300 hover:text-[#0118A1] transition-colors shrink-0">
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Section B: Needs Activation ── */}
      {pendingKeyFeeds.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <h2 className="text-base font-bold text-gray-900">Needs Activation</h2>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{pendingKeyFeeds.length} feeds</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">These feeds are built in — they just need API keys or subscriptions. Click a feed to see the activation steps.</p>
          <div className="space-y-3">
            {pendingKeyFeeds.map(feed => (
              <ActivationCard key={feed.id} feed={feed} guide={ACTIVATION_GUIDE[feed.id]} />
            ))}
          </div>
        </div>
      )}

      {/* ── Section C: Suggested — only shown if any remain ── */}
      {SUGGESTED_FEEDS.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb size={16} className="text-[#0118A1]" />
            <h2 className="text-base font-bold text-gray-900">Suggested Additions</h2>
          </div>
          <p className="text-xs text-gray-500 mb-5">Additional feeds recommended for a comprehensive duty-of-care programme.</p>

          {freesuggestions.length > 0 && (
            <>
              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Free / Self-Register</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
                {freesuggestions.map(s => <SuggestedCard key={s.name} suggestion={s} />)}
              </div>
            </>
          )}

          {paidSuggestions.length > 0 && (
            <>
              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Premium / Enterprise</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {paidSuggestions.map(s => <SuggestedCard key={s.name} suggestion={s} />)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add Feed Modal ────────────────────────────────────────────────────────────
const FEED_TYPES = ['REST API', 'RSS Feed', 'Webhook', 'Partnership', 'Manual / Upload']
const SCOPE_OPTIONS = [
  { value: 'international', label: 'International — visible to all offices' },
  { value: 'local',         label: 'Local — specific country / region' },
]
const STATUS_OPTIONS = [
  { value: 'active',      label: 'Active' },
  { value: 'pending_key', label: 'API Key Needed' },
  { value: 'partnership', label: 'Pending Partnership' },
  { value: 'pending',     label: 'Pending Setup' },
]

function AddFeedModal({ onClose, onSaved, defaultScope = 'international', defaultCountry = '' }) {
  const [form, setForm] = useState({
    name: '', category: 'security', feedType: 'REST API', scope: defaultScope,
    countries: defaultCountry, url: '', description: '', geography: defaultCountry,
    updateFrequency: '', status: 'pending', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const f = (key) => ({ value: form[key], onChange: e => setForm(p => ({ ...p, [key]: e.target.value })) })

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Feed name is required'); return }
    if (form.scope === 'local' && !form.countries.trim()) { setError('Please specify at least one country for a local feed'); return }
    setSaving(true)
    const countriesArr = form.scope === 'local'
      ? form.countries.split(',').map(c => c.trim()).filter(Boolean)
      : []
    const { error: err } = await supabase.from('intel_feed_sources').insert({
      name: form.name.trim(),
      category: form.category,
      feed_type: form.feedType,
      scope: form.scope,
      countries: countriesArr,
      url: form.url.trim() || null,
      description: form.description.trim() || null,
      geography: form.geography.trim() || null,
      update_frequency: form.updateFrequency.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  const inputClass = "w-full border border-gray-200 rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B] text-gray-900"
  const labelClass = "block text-xs font-medium text-gray-600 mb-1"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-[12px] shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Add Intel Feed</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelClass}>Feed Name *</label>
            <input className={inputClass} placeholder="e.g. OSAC Security Reports" {...f('name')} />
          </div>

          <div>
            <label className={labelClass}>Scope</label>
            <div className="grid grid-cols-2 gap-2">
              {SCOPE_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm(p => ({ ...p, scope: opt.value }))}
                  className={`px-3 py-2.5 rounded-[6px] text-xs font-medium border text-left transition-colors
                    ${form.scope === opt.value
                      ? 'bg-[#0118A1] text-white border-[#0118A1]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                  {opt.value === 'international' ? '🌍' : '📍'} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {form.scope === 'local' && (
            <div>
              <label className={labelClass}>Country / Countries *</label>
              <input className={inputClass} placeholder="e.g. Mozambique  (comma-separate multiple)" {...f('countries')} />
              <p className="text-[10px] text-gray-400 mt-1">This feed will appear in the Local section for each specified country.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Category</label>
              <select className={inputClass} {...f('category')}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Feed Type</label>
              <select className={inputClass} {...f('feedType')}>
                {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>URL / Endpoint</label>
            <input className={inputClass} placeholder="https://api.example.com/feed" {...f('url')} />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea className={inputClass} rows={2} placeholder="What does this feed provide?" {...f('description')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Geography</label>
              <input className={inputClass} placeholder="e.g. South Africa" {...f('geography')} />
            </div>
            <div>
              <label className={labelClass}>Update Frequency</label>
              <input className={inputClass} placeholder="e.g. Daily" {...f('updateFrequency')} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Status</label>
            <select className={inputClass} {...f('status')}>
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea className={inputClass} rows={2} placeholder="Partnership contact, pricing, API key location…" {...f('notes')} />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="bg-[#AACC00] hover:bg-[#99bb00] text-[#0118A1] font-semibold px-5 py-2 rounded-[6px] text-sm transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : 'Add Feed'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function IntelFeeds() {
  const [customFeeds, setCustomFeeds] = useState([])
  const [liveStatuses, setLiveStatuses] = useState({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalDefaults, setModalDefaults] = useState({})
  const [activeTab, setActiveTab] = useState('international')
  const [localCountry, setLocalCountry] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  const loadCustom = async () => {
    setLoading(true)
    const [{ data }, statusRes] = await Promise.all([
      supabase.from('intel_feed_sources').select('*').order('created_at', { ascending: false }),
      fetch('/api/feed-status').then(r => r.json()).catch(() => ({})),
    ])
    setLiveStatuses(statusRes || {})
    setCustomFeeds((data || []).map(d => ({
      id: d.id, name: d.name, category: d.category, feedType: d.feed_type,
      scope: d.scope || 'international', countries: d.countries || [],
      url: d.url, sourceUrl: d.url, description: d.description,
      geography: d.geography, updateFrequency: d.update_frequency,
      status: d.status, notes: d.notes, builtin: false,
    })))
    setLastRefresh(new Date())
    setLoading(false)
  }

  useEffect(() => { loadCustom() }, [])

  const handleDelete = async (id) => {
    await supabase.from('intel_feed_sources').delete().eq('id', id)
    loadCustom()
  }

  const openModal = (defaults = {}) => { setModalDefaults(defaults); setShowModal(true) }

  const allFeeds = [...BUILTIN_FEEDS.map(f => ({
    ...f,
    status: liveStatuses[f.id] ?? f.status,
  })), ...customFeeds]
  const intlFeeds = allFeeds.filter(f => f.scope === 'international')
  const localFeeds = allFeeds.filter(f => f.scope === 'local')

  const localCountries = [...new Set(localFeeds.flatMap(f => f.countries || []))].sort()
  const selectedCountry = localCountry || localCountries[0] || null
  const countryFeeds = selectedCountry ? localFeeds.filter(f => (f.countries || []).includes(selectedCountry)) : []

  const liveCount = allFeeds.filter(f => f.status === 'active').length
  const pendingCount = allFeeds.filter(f => f.status === 'pending_key').length

  const TABS = [
    { id: 'international', label: 'International', icon: Globe,       count: intlFeeds.length },
    { id: 'local',         label: 'Local',         icon: MapPin,      count: localFeeds.length },
    { id: 'audit',         label: 'Feed Audit',    icon: AlertCircle, count: null },
  ]

  return (
    <Layout>
      {showModal && (
        <AddFeedModal
          onClose={() => setShowModal(false)}
          onSaved={loadCustom}
          defaultScope={modalDefaults.scope || 'international'}
          defaultCountry={modalDefaults.country || ''}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Radio size={20} className="text-[#1E2461]" />
            <h1 className="text-2xl font-bold text-gray-900">Intel Feeds</h1>
          </div>
          <p className="text-sm text-gray-500">All intelligence sources — manage, categorise and add new data channels</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadCustom} disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-40 px-3 py-2">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => openModal({ scope: activeTab === 'local' ? 'local' : 'international', country: selectedCountry || '' })}
            className="flex items-center gap-2 bg-[#AACC00] hover:bg-[#99bb00] text-[#0118A1] font-semibold px-4 py-2 rounded-[6px] text-sm transition-colors">
            <Plus size={15} />
            Add Feed
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Feeds', value: allFeeds.length },
          { label: 'Live & Active', value: liveCount, color: 'text-green-600' },
          { label: 'Needs Activation', value: pendingCount, color: 'text-amber-600' },
          { label: 'Custom Added', value: customFeeds.length, color: 'text-[#0118A1]' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4 text-center">
            <div className={`text-3xl font-bold ${s.color || 'text-gray-900'}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-[8px] p-1 w-fit">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-sm font-medium transition-colors
                ${activeTab === tab.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon size={14} />
              {tab.label}
              {tab.count !== null && (
                <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5">{tab.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 text-center py-16">Loading feeds…</div>
      ) : activeTab === 'international' ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <StatusLegend />
            <button onClick={() => openModal({ scope: 'international' })}
              className="text-xs text-[#0118A1] hover:underline flex items-center gap-1 shrink-0">
              <Plus size={11} /> Add international feed
            </button>
          </div>
          <FeedTable feeds={intlFeeds} onDelete={handleDelete} emptyMsg="No international feeds configured." />
        </div>

      ) : activeTab === 'local' ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <StatusLegend />
            <button onClick={() => openModal({ scope: 'local', country: selectedCountry || '' })}
              className="text-xs text-[#0118A1] hover:underline flex items-center gap-1 shrink-0">
              <Plus size={11} /> Add local feed
            </button>
          </div>

          {localCountries.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MapPin size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium text-gray-500 mb-1">No local feeds yet</p>
              <p className="text-xs mb-4">Add country-specific feeds for each office location</p>
              <button onClick={() => openModal({ scope: 'local' })}
                className="inline-flex items-center gap-2 bg-[#AACC00] text-[#0118A1] font-semibold px-4 py-2 rounded-[6px] text-sm">
                <Plus size={14} /> Add local feed
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2 flex-wrap mb-6">
                {localCountries.map(country => (
                  <button key={country}
                    onClick={() => setLocalCountry(country)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                      ${selectedCountry === country
                        ? 'bg-[#0118A1] text-white border-[#0118A1]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                    <MapPin size={10} />
                    {country}
                    <span className={`text-[10px] rounded-full px-1 ${selectedCountry === country ? 'bg-white/20' : 'bg-gray-100'}`}>
                      {localFeeds.filter(f => (f.countries || []).includes(country)).length}
                    </span>
                  </button>
                ))}
                <button onClick={() => openModal({ scope: 'local' })}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors">
                  <Plus size={10} /> Add country
                </button>
              </div>

              {selectedCountry && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin size={14} className="text-[#1E2461]" />
                    <h3 className="text-sm font-bold text-gray-800">{selectedCountry}</h3>
                    <span className="text-xs text-gray-400">{countryFeeds.length} feed{countryFeeds.length !== 1 ? 's' : ''}</span>
                  </div>
                  <FeedTable feeds={countryFeeds} onDelete={handleDelete} emptyMsg={`No local feeds for ${selectedCountry} yet.`} />
                </div>
              )}
            </>
          )}
        </div>

      ) : (
        /* ── Audit tab ── */
        <AuditPanel allFeeds={allFeeds} />
      )}

      {lastRefresh && (
        <div className="mt-8 flex items-center gap-1.5 text-xs text-gray-400">
          <Clock size={11} />
          Last refreshed: {lastRefresh.toLocaleTimeString()}
        </div>
      )}
    </Layout>
  )
}
