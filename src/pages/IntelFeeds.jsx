import { useEffect, useState } from 'react'
import { Radio, RefreshCw, ExternalLink, Key, Handshake, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import Layout from '../components/Layout'

const CATEGORY_COLORS = {
  'Load Shedding':        { bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-200' },
  'Armed Conflict':       { bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-200' },
  'Crime Statistics':     { bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-200' },
  'Security Intelligence':{ bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
  'Country Risk':         { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200' },
}

const STATUS_CONFIG = {
  live:        { label: 'Live',        icon: CheckCircle,    dot: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
  error:       { label: 'Error',       icon: AlertTriangle,  dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200' },
  no_key:      { label: 'API Key Needed', icon: Key,         dot: 'bg-gray-400',   text: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-200' },
  partnership: { label: 'Partnership', icon: Handshake,      dot: 'bg-violet-400', text: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
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
  const Icon = s.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.bg} ${s.text} ${s.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  )
}

function FeedCard({ feed }) {
  return (
    <div className="bg-white rounded-[10px] shadow-[0_1px_4px_rgba(0,0,0,0.08)] p-5 flex flex-col gap-3">
      {/* Header */}
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

      {/* Meta grid */}
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

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
        {feed.sourceUrl && (
          <a
            href={feed.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#0118A1] hover:underline font-medium"
          >
            <ExternalLink size={11} />
            {feed.status === 'partnership' ? 'Visit website' : 'Source'}
          </a>
        )}
        {feed.docsUrl && feed.docsUrl !== feed.sourceUrl && (
          <a
            href={feed.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
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

const CATEGORIES = ['All', 'Load Shedding', 'Armed Conflict', 'Crime Statistics', 'Security Intelligence', 'Country Risk']

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

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Radio size={20} className="text-[#1E2461]" />
            <h1 className="text-2xl font-bold text-gray-900">Intel Feeds</h1>
          </div>
          <p className="text-sm text-gray-500">
            All intelligence data sources powering SafeGuard360 alerts and risk assessments
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Sources', value: feeds.length },
          { label: 'Live & Active', value: liveCount, color: 'text-green-600' },
          { label: 'Configured', value: configuredCount },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4 text-center">
            <div className={`text-2xl font-bold ${s.color || 'text-gray-900'}`}>{loading ? '–' : s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Category filter tabs */}
      <div className="flex gap-2 flex-wrap mb-5">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
              ${filter === cat
                ? 'bg-[#0118A1] text-white border-[#0118A1]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Feed cards */}
      {loading ? (
        <div className="text-sm text-gray-400 text-center py-12">Checking feed status…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(feed => <FeedCard key={feed.id} feed={feed} />)}
        </div>
      )}

      {/* Last refreshed */}
      {refreshed && (
        <div className="mt-5 flex items-center gap-1.5 text-xs text-gray-400">
          <Clock size={11} />
          Last checked: {new Date(refreshed).toLocaleTimeString()}
        </div>
      )}
    </Layout>
  )
}
