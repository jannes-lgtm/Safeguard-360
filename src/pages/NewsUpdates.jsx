import { useEffect, useState, useRef } from 'react'
import {
  Newspaper, ExternalLink, RefreshCw, Clock,
  Search, Shield, Swords, HeartPulse, CloudRain
} from 'lucide-react'
import Layout from '../components/Layout'

// ── Category definitions ──────────────────────────────────────────────────────
const CATEGORIES = [
  {
    id:    'security',
    label: 'Security',
    icon:  Shield,
    color: 'text-purple-700',
    bg:    'bg-purple-50',
    border:'border-purple-200',
    badge: 'bg-purple-100 text-purple-700 border-purple-200',
    header:'bg-purple-600',
  },
  {
    id:    'conflict',
    label: 'Conflict & War',
    icon:  Swords,
    color: 'text-red-700',
    bg:    'bg-red-50',
    border:'border-red-200',
    badge: 'bg-red-100 text-red-700 border-red-200',
    header:'bg-red-600',
  },
  {
    id:    'health',
    label: 'Health',
    icon:  HeartPulse,
    color: 'text-rose-700',
    bg:    'bg-rose-50',
    border:'border-rose-200',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    header:'bg-rose-500',
  },
  {
    id:    'weather',
    label: 'Weather & Disasters',
    icon:  CloudRain,
    color: 'text-teal-700',
    bg:    'bg-teal-50',
    border:'border-teal-200',
    badge: 'bg-teal-100 text-teal-700 border-teal-200',
    header:'bg-teal-600',
  },
]

const REGIONS = ['All', 'Africa', 'Middle East', 'Global']

function timeAgo(d) {
  if (!d) return null
  const s = Math.floor((Date.now() - new Date(d)) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  const dy = Math.floor(h / 24); if (dy < 7) return `${dy}d ago`
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ── Article card ──────────────────────────────────────────────────────────────
function ArticleCard({ article, catMeta }) {
  const ago = timeAgo(article.date)
  return (
    <div className="flex items-start gap-3 py-3.5 border-b border-gray-100 last:border-0 group">
      <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0`}
        style={{ background: '#AACC00' }} />
      <div className="flex-1 min-w-0">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-gray-900 hover:text-[#0118A1] hover:underline leading-snug block mb-1.5"
        >
          {article.title}
        </a>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${catMeta?.badge || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
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
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-300 hover:text-[#0118A1] transition-colors opacity-0 group-hover:opacity-100 shrink-0 mt-1"
      >
        <ExternalLink size={13} />
      </a>
    </div>
  )
}

// ── Category section ──────────────────────────────────────────────────────────
function CategorySection({ cat, articles, expanded, onToggle }) {
  const Icon = cat.icon
  const showing = expanded ? articles : articles.slice(0, 5)

  if (!articles.length) return null

  return (
    <div className={`bg-white rounded-[10px] border ${cat.border} shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden`}>
      {/* Section header */}
      <div className={`${cat.header} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2.5">
          <Icon size={15} className="text-white/90" />
          <span className="text-sm font-bold text-white">{cat.label}</span>
          <span className="text-[10px] font-bold text-white/70 bg-white/20 px-2 py-0.5 rounded-full">
            {articles.length} articles
          </span>
        </div>
      </div>

      {/* Articles */}
      <div className="px-4">
        {showing.map((a, i) => (
          <ArticleCard key={`${a.feedId}-${i}`} article={a} catMeta={cat} />
        ))}
      </div>

      {/* Show more / less */}
      {articles.length > 5 && (
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onToggle}
            className="text-xs font-medium text-[#0118A1] hover:underline"
          >
            {expanded ? `Show fewer` : `Show all ${articles.length} articles →`}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function NewsUpdates() {
  const [rssFeeds, setRssFeeds]         = useState([])
  const [articles, setArticles]         = useState([])
  const [loadedCount, setLoadedCount]   = useState(0)
  const [totalFeeds, setTotalFeeds]     = useState(0)
  const [regionFilter, setRegionFilter] = useState('All')
  const [search, setSearch]             = useState('')
  const [expanded, setExpanded]         = useState({})   // { security: true, ... }
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
      // Fetch more articles from health feeds so outbreak events aren't cut off
      const limit = feed.category === 'health' ? 20 : 10
      fetch(`/api/rss-ingest?id=${feed.id}&limit=${limit}`)
        .then(r => r.json())
        .then(d => {
          if (d.articles?.length) {
            const tagged = d.articles.map(a => ({
              ...a,
              feedId:        feed.id,
              feedName:      feed.name,
              feedCategory:  feed.category,
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

  // Apply region + search filters (category grouping is done per section below)
  const filtered = articles.filter(a => {
    const regionOk =
      regionFilter === 'All' ||
      (regionFilter === 'Africa'      && a.feedGeography?.includes('Africa')) ||
      (regionFilter === 'Middle East' && a.feedGeography?.includes('Middle East')) ||
      (regionFilter === 'Global'      && (!a.feedGeography || a.feedGeography === 'Global'))
    const searchOk =
      !search ||
      a.title?.toLowerCase().includes(search.toLowerCase()) ||
      a.summary?.toLowerCase().includes(search.toLowerCase()) ||
      a.feedName?.toLowerCase().includes(search.toLowerCase())
    return regionOk && searchOk
  })

  const toggleExpanded = (catId) =>
    setExpanded(prev => ({ ...prev, [catId]: !prev[catId] }))

  const totalFiltered = filtered.length

  return (
    <Layout>
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Newspaper size={20} className="text-[#0118A1]" />
          <h1 className="text-2xl font-bold text-gray-900">News Updates</h1>
        </div>
        <p className="text-sm text-gray-500">
          Live intelligence grouped by category — security, conflict, health and weather.
        </p>
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
            <div
              className="h-full bg-[#0118A1] rounded-full transition-all duration-300"
              style={{ width: totalFeeds ? `${(loadedCount / totalFeeds) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* Filters row */}
      <div className="bg-white border border-gray-200 rounded-[10px] p-3 mb-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] flex flex-wrap items-center gap-3">
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

        {/* Region pills */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">Region</span>
          {REGIONS.map(r => (
            <button
              key={r}
              onClick={() => setRegionFilter(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${regionFilter === r
                  ? 'bg-[#0118A1] text-white border-[#0118A1]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
            >
              {r}
            </button>
          ))}
        </div>

        {!isLoading && (
          <span className="text-xs text-gray-400 ml-auto shrink-0">
            {totalFiltered} articles
          </span>
        )}
      </div>

      {/* Category key */}
      <div className="flex gap-3 flex-wrap mb-5">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon
          const count = filtered.filter(a => a.feedCategory === cat.id).length
          return (
            <div
              key={cat.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-[8px] border ${cat.border} ${cat.bg}`}
            >
              <Icon size={13} className={cat.color} />
              <span className={`text-xs font-semibold ${cat.color}`}>{cat.label}</span>
              <span className={`text-[10px] font-bold ${cat.badge} px-1.5 py-0.5 rounded-full border`}>
                {count}
              </span>
            </div>
          )
        })}
      </div>

      {/* Grouped article feed */}
      {filtered.length === 0 && !isLoading ? (
        <div className="bg-white rounded-[10px] border border-gray-200 p-12 text-center">
          <Newspaper size={28} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400">No articles match the current filters.</p>
          <button
            onClick={() => { setRegionFilter('All'); setSearch('') }}
            className="mt-3 text-xs text-[#0118A1] hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : isLoading && filtered.length === 0 ? (
        <div className="bg-white rounded-[10px] border border-gray-200 py-12 text-center text-sm text-gray-400">
          <RefreshCw size={20} className="animate-spin mx-auto mb-3 text-gray-300" />
          Loading articles from all sources…
        </div>
      ) : (
        <div className="space-y-5">
          {CATEGORIES.map(cat => {
            const catArticles = filtered.filter(a => a.feedCategory === cat.id)
            return (
              <CategorySection
                key={cat.id}
                cat={cat}
                articles={catArticles}
                expanded={!!expanded[cat.id]}
                onToggle={() => toggleExpanded(cat.id)}
              />
            )
          })}
        </div>
      )}
    </Layout>
  )
}
