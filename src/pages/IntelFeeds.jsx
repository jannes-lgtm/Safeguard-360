import { useEffect, useState } from 'react'
import { Radio, RefreshCw, ExternalLink, Key, Handshake, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import Layout from '../components/Layout'

const CATEGORY_COLORS = {
  'Load Shedding':         { bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-200' },
  'Armed Conflict':        { bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-200' },
  'Security Intelligence': { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
}

const STATUS_CONFIG = {
  live:        { label: 'Live',             dot: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
  error:       { label: 'Error',            dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200' },
  no_key:      { label: 'API Key Needed',   dot: 'bg-gray-400',   text: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-200' },
  partnership: { label: 'Pending Partnership', dot: 'bg-violet-400', text: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
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

function FeedCard({ feed }) {
  return (
    <div className="bg-white rounded-[10px] shadow-[0_1px_4px_rgba(0,0,0,0.08)] p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h3 className="text-base font-bold text-gray-900">{feed.name}</h3>
            <CategoryBadge category={feed.category} />
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">{feed.description}</p>
        </div>
        <StatusBadge status={feed.status} />
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="text-xs text-gray-400 block mb-0.5">Geography</span>
          <span className="text-gray-700 font-medium">{feed.geography}</span>
        </div>
        <div>
          <span className="text-xs text-gray-400 block mb-0.5">Update Frequency</span>
          <span className="text-gray-700 font-medium">{feed.updateFrequency}</span>
        </div>
        {feed.apiKeyEnv && (
          <div className="col-span-2">
            <span className="text-xs text-gray-400 block mb-0.5">Environment Variable</span>
            <span className="text-gray-600 font-mono text-xs">{feed.apiKeyEnv}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
        {feed.sourceUrl && (
          <a href={feed.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-[#0118A1] hover:underline font-medium">
            <ExternalLink size={13} />
            {feed.status === 'partnership' ? 'Visit website' : 'Get API key'}
          </a>
        )}
        {feed.status === 'no_key' && (
          <span className="ml-auto text-xs text-amber-600 font-medium flex items-center gap-1">
            <Key size={11} />
            Add to Vercel env vars
          </span>
        )}
        {feed.status === 'partnership' && (
          <span className="ml-auto text-xs text-violet-600 font-medium flex items-center gap-1">
            <Handshake size={11} />
            Partnership in progress
          </span>
        )}
        {feed.status === 'live' && (
          <span className="ml-auto text-xs text-green-600 font-medium flex items-center gap-1">
            <CheckCircle size={11} />
            Receiving data
          </span>
        )}
      </div>
    </div>
  )
}

export default function IntelFeeds() {
  const [feeds, setFeeds] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshed, setRefreshed] = useState(null)

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

  const liveCount = feeds.filter(f => f.status === 'live').length

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
            Intelligence data sources powering SafeGuard360 alerts and risk assessments
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-40">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Sources', value: feeds.length },
          { label: 'Live & Active', value: liveCount, color: 'text-green-600' },
          { label: 'Pending', value: feeds.length - liveCount, color: 'text-violet-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4 text-center">
            <div className={`text-3xl font-bold ${s.color || 'text-gray-900'}`}>{loading ? '–' : s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Feed cards */}
      {loading ? (
        <div className="text-sm text-gray-400 text-center py-16">Checking feed status…</div>
      ) : (
        <div className="flex flex-col gap-4">
          {feeds.map(feed => <FeedCard key={feed.id} feed={feed} />)}
        </div>
      )}

      {refreshed && (
        <div className="mt-6 flex items-center gap-1.5 text-xs text-gray-400">
          <Clock size={11} />
          Last checked: {new Date(refreshed).toLocaleTimeString()}
        </div>
      )}
    </Layout>
  )
}
