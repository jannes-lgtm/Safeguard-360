import { useEffect, useState, useRef } from 'react'
import { Newspaper, ExternalLink, RefreshCw, Clock, Search } from 'lucide-react'
import Layout from '../components/Layout'

// ── Category badge colours ────────────────────────────────────────────────────
const CAT_COLORS = {
  security: 'bg-purple-100 text-purple-700 border-purple-200',
  conflict: 'bg-red-100 text-red-700 border-red-200',
  health:   'bg-rose-100 text-rose-700 border-rose-200',
  weather:  'bg-teal-100 text-teal-700 border-teal-200',
}
const catColor = (c) => CAT_COLORS[c] || 'bg-gray-100 text-gray-600 border-gray-200'

function timeAgo(d) {
  if (!d) return null
  const s = Math.floor((Date.now() - new Date(d)) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s/60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m/60); if (h < 24) return `${h}h ago`
  const dy = Math.floor(h/24); if (dy < 7) return `${dy}d ago`
  return new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short' })
}

// ── Article card ──────────────────────────────────────────────────────────────
function ArticleCard({ article }) {
  const ago = timeAgo(article.date)
  return (
    <div className="flex items-start gap-3 py-4 border-b border-gray-100 last:border-0 group">
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
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              <Clock size={9} />{ago}
            </span>
          )}
          {article.feedGeography && (
            <span className="text-[10px] text-gray-400">{article.feedGeography}</span>
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

// ── Main ──────────────────────────────────────────────────────────────────────
export default function NewsUpdates() {
  const [rssFeeds, setRssFeeds]         = useState([])
  const [articles, setArticles]         = useState([])
  const [loadedCount, setLoadedCount]   = useState(0)
  const [totalFeeds, setTotalFeeds]     = useState(0)
  const [catFilter, setCatFilter]       = useState('all')
  const [regionFilter, setRegionFilter] = useState('All')
  const [search, setSearch]             = useState('')
  const loadedRef = useRef(new Set())

  // Fetch feed list
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

  // Fetch articles in parallel from every feed
  useEffect(() => {
    if (!rssFeeds.length) return
    loadedRef.current = new Set()
    setArticles([])
    setLoadedCount(0)

    rssFeeds.forEach(feed => {
      fetch(`/api/rss-ingest?id=${feed.id}&limit=8`)
        .then(r => r.json())
        .then(d => {
          if (d.articles?.length) {
            const tagged = d.articles.map(a => ({
              ...a,
              feedId:       feed.id,
              feedName:     feed.name,
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
  const filtered = articles.filter(a => {
    const catOk    = catFilter === 'all' || a.feedCategory === catFilter
    const regionOk = regionFilter === 'All' ||
      (regionFilter === 'Africa'       && a.feedGeography?.includes('Africa')) ||
      (regionFilter === 'Middle East'  && a.feedGeography?.includes('Middle East')) ||
      (regionFilter === 'Global'       && (!a.feedGeography || a.feedGeography === 'Global'))
    const searchOk = !search ||
      a.title?.toLowerCase().includes(search.toLowerCase()) ||
      a.summary?.toLowerCase().includes(search.toLowerCase()) ||
      a.feedName?.toLowerCase().includes(search.toLowerCase())
    return catOk && regionOk && searchOk
  })

  const CATS = [
    { id: 'all',      label: 'All' },
    { id: 'security', label: 'Security' },
    { id: 'conflict', label: 'Conflict' },
    { id: 'health',   label: 'Health' },
    { id: 'weather',  label: 'Weather' },
  ]

  return (
    <Layout>
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Newspaper size={20} className="text-[#0118A1]" />
          <h1 className="text-2xl font-bold text-gray-900">News Updates</h1>
        </div>
        <p className="text-sm text-gray-500">Live intelligence from security, conflict, health and weather sources.</p>
      </div>

      {/* Loading bar */}
      {isLoading && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span className="flex items-center gap-1.5">
              <RefreshCw size={11} className="animate-spin text-[#0118A1]" />
              Loading feeds… {loadedCount} / {totalFeeds} sources
            </span>
            <span>{articles.length} articles loaded</span>
          </div>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#0118A1] rounded-full transition-all duration-300"
              style={{ width: totalFeeds ? `${(loadedCount / totalFeeds) * 100}%` : '0%' }} />
          </div>
        </div>
      )}

      {/* Filters row */}
      <div className="bg-white border border-gray-200 rounded-[10px] p-3 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search headlines…"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-[6px] text-xs focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 focus:border-[#0118A1]"
          />
        </div>

        {/* Category pills */}
        <div className="flex gap-1 flex-wrap">
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

        {/* Region pills */}
        <div className="flex gap-1 flex-wrap">
          {['All', 'Africa', 'Middle East', 'Global'].map(r => (
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
          <span className="text-xs text-gray-400 ml-auto shrink-0">
            {filtered.length} of {articles.length} articles
          </span>
        )}
      </div>

      {/* Article feed */}
      {filtered.length === 0 && !isLoading ? (
        <div className="bg-white rounded-[10px] border border-gray-200 p-12 text-center">
          <Newspaper size={28} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400">No articles match the current filters.</p>
          <button onClick={() => { setCatFilter('all'); setRegionFilter('All'); setSearch('') }}
            className="mt-3 text-xs text-[#0118A1] hover:underline">Clear filters</button>
        </div>
      ) : (
        <div className="bg-white rounded-[10px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] px-4">
          {filtered.length === 0 && isLoading ? (
            <div className="py-12 text-center text-sm text-gray-400">
              <RefreshCw size={20} className="animate-spin mx-auto mb-3 text-gray-300" />
              Loading articles from all sources…
            </div>
          ) : (
            filtered.map((a, i) => <ArticleCard key={`${a.feedId}-${i}`} article={a} />)
          )}
        </div>
      )}
    </Layout>
  )
}
