import { useEffect, useState } from 'react'
import {
  Radio, RefreshCw, ExternalLink, Key, Handshake,
  AlertTriangle, CheckCircle, Clock, MessageSquare, Globe
} from 'lucide-react'
import Layout from '../components/Layout'

const CATEGORY_COLORS = {
  'Community Intelligence': { bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-200' },
  'Load Shedding':          { bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-200' },
  'Armed Conflict':         { bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-200' },
  'Crime Statistics':       { bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-200' },
  'Security Intelligence':  { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
  'Country Risk':           { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200' },
}

const STATUS_CONFIG = {
  live:        { label: 'Live',            dot: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200',  icon: CheckCircle },
  error:       { label: 'Error',           dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-200',    icon: AlertTriangle },
  no_key:      { label: 'API Key Needed',  dot: 'bg-gray-400',   text: 'text-gray-600',   bg: 'bg-gray-50',    border: 'border-gray-200',   icon: Key },
  partnership: { label: 'Partnership',     dot: 'bg-violet-400', text: 'text-violet-700', bg: 'bg-violet-50',  border: 'border-violet-200', icon: Handshake },
}

function CategoryBadge({ category }) {
  const c = CATEGORY_COLORS[category] || { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${c.bg} ${c.text} ${c.border}`}>
      {category}
    </span>
  )
}

function StatusBadge({ status }) {
  const s = STATUS_CONFIG[status] || STATUS_CONFIG.error
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.bg} ${s.text} ${s.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  )
}

function WhatsAppIncidents({ stats }) {
  if (!stats?.recent?.length) return null
  return (
    <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Recent Reports</p>
      {stats.recent.map((r, i) => (
        <div key={i} className="flex gap-2 text-xs">
          <MessageSquare size={12} className="text-green-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-gray-700 leading-relaxed truncate">{r.message}</p>
            <p className="text-gray-400 text-[10px] mt-0.5">
              {r.from} · {new Date(r.time).toLocaleString()} ·{' '}
              <span className={r.status === 'Pending Review' ? 'text-amber-600' : 'text-green-600'}>
                {r.status}
              </span>
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function CountryLookup() {
  const [country, setCountry] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const lookup = async () => {
    if (!country.trim()) return
    setLoading(true)
    try {
      const r = await fetch(`/api/police-intel?country=${encodeURIComponent(country.trim())}`)
      setResult(await r.json())
    } catch {
      setResult(null)
    }
    setLoading(false)
  }

  const riskColor = { Critical: 'text-red-600', High: 'text-orange-600', Medium: 'text-yellow-600', Low: 'text-green-600' }

  return (
    <div className="bg-white rounded-[10px] shadow-[0_1px_4px_rgba(0,0,0,0.08)] p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Globe size={15} className="text-[#1E2461]" />
        <h3 className="text-sm font-bold text-gray-900">Country Crime Intel Lookup</h3>
      </div>
      <div className="flex gap-2 mb-4">
        <input
          value={country}
          onChange={e => setCountry(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && lookup()}
          placeholder="e.g. Kenya, Nigeria, South Africa…"
          className="flex-1 border border-gray-200 rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
        />
        <button
          onClick={lookup}
          disabled={loading}
          className="bg-[#AACC00] hover:bg-[#99bb00] text-[#0118A1] font-semibold px-4 py-2 rounded-[6px] text-sm transition-colors disabled:opacity-60"
        >
          {loading ? '…' : 'Look up'}
        </button>
      </div>

      {result && (
        result.found === false ? (
          <div className="text-sm text-gray-500 bg-gray-50 rounded-[6px] px-4 py-3">
            No local police registry for <strong>{result.country}</strong>. ACLED armed conflict data is available for most African nations.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h4 className="font-semibold text-gray-900 text-sm">{result.country}</h4>
              <span className="text-xs text-gray-500">{result.agency}</span>
              {result.acledCoverage && (
                <span className="text-[10px] bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-semibold">ACLED covered</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-gray-400">Update frequency</span><div className="font-medium text-gray-700 mt-0.5">{result.updateFrequency}</div></div>
              <div><span className="text-gray-400">Latest data</span><div className="font-medium text-gray-700 mt-0.5">{result.latestPeriod}</div></div>
            </div>
            {result.highRiskAreas?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">High Risk Areas</p>
                <div className="space-y-1.5">
                  {result.highRiskAreas.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className={`font-bold shrink-0 ${riskColor[a.risk] || 'text-gray-600'}`}>{a.risk}</span>
                      <span className="text-gray-700">{a.area} — {a.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.sourceUrl && (
              <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#0118A1] hover:underline font-medium">
                <ExternalLink size={11} />
                Official source
              </a>
            )}
          </div>
        )
      )}
    </div>
  )
}

function FeedCard({ feed }) {
  return (
    <div className="bg-white rounded-[10px] shadow-[0_1px_4px_rgba(0,0,0,0.08)] p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-sm font-bold text-gray-900">{feed.name}</h3>
            <CategoryBadge category={feed.category} />
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{feed.description}</p>
        </div>
        <StatusBadge status={feed.status} />
      </div>

      {/* Stats row for WhatsApp */}
      {feed.id === 'whatsapp' && feed.stats && (
        <div className="flex gap-4 text-xs">
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900">{feed.stats.total}</div>
            <div className="text-gray-400">Total reports</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-amber-600">{feed.stats.pending}</div>
            <div className="text-gray-400">Pending review</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <span className="text-gray-400 block">Geography</span>
          <span className="text-gray-700 font-medium">{feed.geography}</span>
        </div>
        <div>
          <span className="text-gray-400 block">Update Frequency</span>
          <span className="text-gray-700 font-medium">{feed.updateFrequency}</span>
        </div>
        <div>
          <span className="text-gray-400 block">Endpoint</span>
          <span className="text-gray-600 font-mono text-[10px]">{feed.endpoint}</span>
        </div>
        {feed.apiKeyEnv && (
          <div>
            <span className="text-gray-400 block">Env Var</span>
            <span className="text-gray-600 font-mono text-[10px]">{feed.apiKeyEnv}</span>
          </div>
        )}
      </div>

      {/* WhatsApp recent incidents */}
      {feed.id === 'whatsapp' && feed.stats && (
        <WhatsAppIncidents stats={feed.stats} />
      )}

      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
        {feed.sourceUrl && (
          <a href={feed.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#0118A1] hover:underline font-medium">
            <ExternalLink size={11} />
            {feed.status === 'partnership' ? 'Visit website' : 'Source'}
          </a>
        )}
        {feed.docsUrl && feed.docsUrl !== feed.sourceUrl && (
          <a href={feed.docsUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            <ExternalLink size={11} />
            Docs / Feed
          </a>
        )}
        {feed.status === 'no_key' && (
          <span className="ml-auto text-[10px] text-amber-600 font-medium flex items-center gap-1">
            <Key size={10} />
            Add {feed.apiKeyEnv} to Vercel
          </span>
        )}
        {feed.status === 'partnership' && (
          <span className="ml-auto text-[10px] text-violet-600 font-medium flex items-center gap-1">
            <Handshake size={10} />
            Pending partnership
          </span>
        )}
      </div>
    </div>
  )
}

const CATEGORIES = ['All', 'Community Intelligence', 'Load Shedding', 'Armed Conflict', 'Crime Statistics', 'Security Intelligence', 'Country Risk']

export default function IntelFeeds() {
  const [feeds, setFeeds] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshed, setRefreshed] = useState(null)
  const [filter, setFilter] = useState('All')

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/intel-feeds')
      const d = await r.json()
      setFeeds(d.feeds || [])
      setRefreshed(d.timestamp)
    } catch {
      setFeeds([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = filter === 'All' ? feeds : feeds.filter(f => f.category === filter)
  const liveCount = feeds.filter(f => f.status === 'live').length
  const configuredCount = feeds.filter(f => f.configured).length
  const pendingCount = feeds.filter(f => f.status === 'partnership').length

  return (
    <Layout>
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Radio size={20} className="text-[#1E2461]" />
            <h1 className="text-2xl font-bold text-gray-900">Intel Feeds</h1>
          </div>
          <p className="text-sm text-gray-500">
            All intelligence sources powering SafeGuard360 alerts and risk assessments
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-40">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Sources', value: feeds.length },
          { label: 'Live & Active', value: liveCount, color: 'text-green-600' },
          { label: 'Configured', value: configuredCount },
          { label: 'Partnerships Pending', value: pendingCount, color: 'text-violet-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4 text-center">
            <div className={`text-2xl font-bold ${s.color || 'text-gray-900'}`}>{loading ? '–' : s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Country crime lookup */}
      <CountryLookup />

      {/* Category filter tabs */}
      <div className="flex gap-2 flex-wrap mb-5">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
              ${filter === cat
                ? 'bg-[#0118A1] text-white border-[#0118A1]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 text-center py-12">Checking feed status…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(feed => <FeedCard key={feed.id} feed={feed} />)}
        </div>
      )}

      {refreshed && (
        <div className="mt-5 flex items-center gap-1.5 text-xs text-gray-400">
          <Clock size={11} />
          Last checked: {new Date(refreshed).toLocaleTimeString()}
        </div>
      )}
    </Layout>
  )
}
