import { useEffect, useState } from 'react'
import {
  Newspaper, ExternalLink, RefreshCw, Globe, MapPin,
  ChevronDown, ChevronUp, Search, Download, AlertTriangle,
  BookOpen, Rss, Calendar, Shield
} from 'lucide-react'
import Layout from '../components/Layout'

const BRAND_BLUE = '#0118A1'

// ── Country list for risk advisories ─────────────────────────────────────────
const COUNTRIES = [
  'Angola','Botswana','Cameroon','Chad','Democratic Republic of Congo',
  'Egypt','Ethiopia','Ghana','Iraq','Jordan','Kenya','Lebanon','Libya',
  'Mali','Mauritania','Morocco','Mozambique','Namibia','Niger','Nigeria',
  'Rwanda','Saudi Arabia','Senegal','Sierra Leone','Somalia','South Africa',
  'South Sudan','Sudan','Syria','Tanzania','Tunisia','Uganda','Yemen','Zambia','Zimbabwe',
]

// ── External report / resource links ─────────────────────────────────────────
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

// ── RSS sources ───────────────────────────────────────────────────────────────
const REGION_COLORS = {
  'Africa': 'bg-orange-100 text-orange-700 border-orange-200',
  'Africa + Middle East': 'bg-rose-100 text-rose-700 border-rose-200',
  'Middle East': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Middle East + North Africa': 'bg-yellow-100 text-yellow-700 border-yellow-200',
}

// ── Country risk advisory lookup ──────────────────────────────────────────────
const RISK_LEVELS = {
  1: { label: 'Exercise Normal Precautions', color: 'bg-green-100 text-green-800 border-green-300' },
  2: { label: 'Exercise Increased Caution', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  3: { label: 'Reconsider Travel', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  4: { label: 'Do Not Travel', color: 'bg-red-100 text-red-800 border-red-300' },
}

// ── Article row ───────────────────────────────────────────────────────────────
function ArticleRow({ article, sourceName }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0 group">
      <div className="w-1.5 h-1.5 rounded-full bg-[#AACC00] mt-1.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <a href={article.url} target="_blank" rel="noopener noreferrer"
          className="text-sm font-medium text-gray-900 hover:text-[#0118A1] hover:underline leading-snug block">
          {article.title}
        </a>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[11px] text-gray-400">{sourceName}</span>
          {article.date && (
            <span className="text-[11px] text-gray-400 flex items-center gap-1">
              <Calendar size={10} />
              {new Date(article.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
        {article.summary && (
          <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">{article.summary}</p>
        )}
      </div>
      <a href={article.url} target="_blank" rel="noopener noreferrer"
        className="text-gray-300 hover:text-[#0118A1] transition-colors opacity-0 group-hover:opacity-100 shrink-0 mt-0.5">
        <ExternalLink size={13} />
      </a>
    </div>
  )
}

// ── RSS source row (expandable) ───────────────────────────────────────────────
function RssSourceRow({ feed }) {
  const [expanded, setExpanded] = useState(false)
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const toggle = async () => {
    if (!expanded && articles.length === 0) {
      setLoading(true)
      try {
        const r = await fetch(`/api/rss-ingest?id=${feed.id}&limit=5`)
        const d = await r.json()
        setArticles(d.articles || [])
        if (!d.articles) setError('Could not load articles')
      } catch {
        setError('Feed unavailable')
      }
      setLoading(false)
    }
    setExpanded(e => !e)
  }

  const regionClass = REGION_COLORS[feed.geography] || 'bg-gray-100 text-gray-600 border-gray-200'

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group text-left">
        <Rss size={13} className="text-orange-400 shrink-0" />
        <span className="flex-1 text-sm font-medium text-gray-800">{feed.name}</span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${regionClass} hidden sm:inline`}>
          {feed.geography}
        </span>
        <span className="text-[11px] text-gray-400 hidden md:inline">{feed.description?.slice(0, 60)}…</span>
        {expanded ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-1 bg-gray-50/50">
          {loading ? (
            <p className="text-xs text-gray-400 py-2">Loading articles…</p>
          ) : error ? (
            <p className="text-xs text-red-400 py-2">{error}</p>
          ) : articles.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No articles found.</p>
          ) : (
            <div>
              {articles.map((a, i) => <ArticleRow key={i} article={a} sourceName={feed.name} />)}
              <a href={feed.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#0118A1] hover:underline mt-2 font-medium">
                <ExternalLink size={11} /> View full feed
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Resource card ─────────────────────────────────────────────────────────────
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

// ── Country risk lookup ───────────────────────────────────────────────────────
function CountryAdvisory() {
  const [country, setCountry] = useState('')
  const [search, setSearch] = useState('')

  const filtered = COUNTRIES.filter(c => c.toLowerCase().includes(search.toLowerCase()))

  const stateDeptUrl = country
    ? `https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/${country.toLowerCase().replace(/ /g, '-')}.html`
    : null
  const fcdoUrl = country
    ? `https://www.gov.uk/foreign-travel-advice/${country.toLowerCase().replace(/ /g, '-')}`
    : null

  return (
    <div className="bg-white rounded-[8px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-1">Country Risk Advisory Lookup</h3>
      <p className="text-xs text-gray-500 mb-4">Select a country to jump straight to the latest government travel advisories.</p>

      <div className="relative mb-3">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search country…"
          className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 focus:border-[#0118A1]"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto mb-4">
        {filtered.map(c => (
          <button key={c} onClick={() => setCountry(c)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
              ${country === c
                ? 'bg-[#0118A1] text-white border-[#0118A1]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-[#0118A1] hover:text-[#0118A1]'}`}>
            {c}
          </button>
        ))}
      </div>

      {country && (
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <p className="text-xs font-semibold text-gray-700 mb-3">Official advisories for <span className="text-[#0118A1]">{country}</span>:</p>
          <a href={stateDeptUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] border border-gray-200 hover:border-[#0118A1] hover:bg-blue-50/30 transition-colors group">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Flag_of_the_United_States.svg/20px-Flag_of_the_United_States.svg.png" alt="US" className="w-5 h-3 object-cover rounded-sm" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-gray-800 group-hover:text-[#0118A1]">US State Department Advisory</div>
              <div className="text-[11px] text-gray-400">travel.state.gov</div>
            </div>
            <ExternalLink size={12} className="text-gray-400 group-hover:text-[#0118A1]" />
          </a>
          <a href={fcdoUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] border border-gray-200 hover:border-[#0118A1] hover:bg-blue-50/30 transition-colors group">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Flag_of_the_United_Kingdom.svg/20px-Flag_of_the_United_Kingdom.svg.png" alt="UK" className="w-5 h-3 object-cover rounded-sm" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-gray-800 group-hover:text-[#0118A1]">UK FCDO Travel Advice</div>
              <div className="text-[11px] text-gray-400">gov.uk/foreign-travel-advice</div>
            </div>
            <ExternalLink size={12} className="text-gray-400 group-hover:text-[#0118A1]" />
          </a>
          <a href={`https://www.smartraveller.gov.au/destinations/africa/${country.toLowerCase().replace(/ /g, '-')}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] border border-gray-200 hover:border-[#0118A1] hover:bg-blue-50/30 transition-colors group">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Flag_of_Australia_%28converted%29.svg/20px-Flag_of_Australia_%28converted%29.svg.png" alt="AU" className="w-5 h-3 object-cover rounded-sm" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-gray-800 group-hover:text-[#0118A1]">Australian DFAT Advisory</div>
              <div className="text-[11px] text-gray-400">smartraveller.gov.au</div>
            </div>
            <ExternalLink size={12} className="text-gray-400 group-hover:text-[#0118A1]" />
          </a>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Briefings() {
  const [rssFeeds, setRssFeeds] = useState([])
  const [rssLoading, setRssLoading] = useState(true)
  const [regionFilter, setRegionFilter] = useState('All')
  const [activeTab, setActiveTab] = useState('news')

  useEffect(() => {
    fetch('/api/rss-ingest')
      .then(r => r.json())
      .then(d => { setRssFeeds(d.feeds || []); setRssLoading(false) })
      .catch(() => setRssLoading(false))
  }, [])

  const filteredFeeds = regionFilter === 'All'
    ? rssFeeds
    : rssFeeds.filter(f => f.geography?.includes(regionFilter === 'Middle East' ? 'Middle East' : 'Africa'))

  const tabs = [
    { id: 'news',      label: 'Intel News',         icon: Newspaper },
    { id: 'advisories', label: 'Country Advisories', icon: MapPin },
    { id: 'resources', label: 'Reports & Resources', icon: BookOpen },
  ]

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Newspaper size={20} className="text-[#0118A1]" />
          <h1 className="text-2xl font-bold text-gray-900">Briefings</h1>
        </div>
        <p className="text-sm text-gray-500">Latest intelligence, country risk assessments and security reports</p>
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

      {/* ── Intel News tab ── */}
      {activeTab === 'news' && (
        <div>
          {/* Region filter */}
          <div className="flex items-center gap-2 mb-4">
            {['All', 'Africa', 'Middle East'].map(r => (
              <button key={r} onClick={() => setRegionFilter(r)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                  ${regionFilter === r
                    ? 'bg-[#0118A1] text-white border-[#0118A1]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                {r}
              </button>
            ))}
            <span className="text-xs text-gray-400 ml-2">{filteredFeeds.length} sources — click a source to see latest articles</span>
          </div>

          {rssLoading ? (
            <div className="bg-white rounded-[8px] border border-gray-200 p-8 text-center text-sm text-gray-400">
              Loading intelligence sources…
            </div>
          ) : (
            <div className="bg-white rounded-[8px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[auto_1fr_auto] items-center px-4 py-2 bg-gray-50 border-b-2 border-gray-200">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Source</span>
                <span />
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider hidden md:block">Coverage</span>
              </div>
              {filteredFeeds.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-8">No sources for this region.</div>
              ) : (
                filteredFeeds.map(feed => <RssSourceRow key={feed.id} feed={feed} />)
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Country Advisories tab ── */}
      {activeTab === 'advisories' && (
        <div className="max-w-2xl">
          <CountryAdvisory />
        </div>
      )}

      {/* ── Reports & Resources tab ── */}
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
