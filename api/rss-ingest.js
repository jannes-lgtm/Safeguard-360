// RSS Feed Ingestion — parse any RSS/Atom feed and return structured articles
// Used by Intel Feeds panel to preview articles from security/terror/risk RSS sources
// No API key needed — all feeds listed below are free and public

const cache = {}
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

// ── Pre-configured Africa + Middle East risk/security RSS feeds ───────────────
export const PRECONFIGURED_FEEDS = [
  // ── Disease & Health ──────────────────────────────────────────────────────
  {
    id: 'who-outbreak',
    name: 'WHO Disease Outbreak News',
    category: 'health',
    geography: 'Global',
    url: 'https://www.who.int/feeds/entity/csr/don/en/rss.xml',
    description: 'World Health Organization official disease outbreak news — confirmed outbreaks, alerts and public health emergencies (PHEIC).',
  },
  {
    id: 'cdc-travel-health',
    name: 'CDC Travel Health Notices',
    category: 'health',
    geography: 'Global',
    url: 'https://tools.cdc.gov/api/v2/resources/media/403372.rss',
    description: 'US Centers for Disease Control travel health notices — Warning (Level 3), Alert (Level 2), Watch (Level 1) for infectious disease risks at destinations.',
  },
  {
    id: 'ecdc-threats',
    name: 'ECDC — Communicable Disease Threats',
    category: 'health',
    geography: 'Global (EU focus)',
    url: 'https://www.ecdc.europa.eu/en/rss-feed/ecdc-communicable-disease-threats-report',
    description: 'European Centre for Disease Prevention and Control weekly threats report — active outbreaks relevant to international travellers.',
  },
  {
    id: 'promed',
    name: 'ProMED Mail',
    category: 'health',
    geography: 'Global',
    url: 'https://promedmail.org/feed/',
    description: 'Expert-moderated global rapid reporting of infectious disease outbreaks and acute exposures. One of the world\'s largest disease surveillance systems.',
  },

  // ── Security / Africa ─────────────────────────────────────────────────────
  {
    id: 'iss-africa',
    name: 'ISS Africa — ISS Today',
    category: 'security',
    geography: 'Africa',
    url: 'https://issafrica.org/rss/iss-today',
    description: 'Institute for Security Studies daily analysis — conflict, terrorism, crime, governance across Africa.',
  },
  {
    id: 'crisis-group-africa',
    name: 'Crisis Group — Africa',
    category: 'security',
    geography: 'Africa',
    url: 'https://www.crisisgroup.org/rss/africa',
    description: 'International Crisis Group reports and briefings on African conflicts and peace processes.',
  },
  {
    id: 'jamestown-africa',
    name: 'Jamestown Foundation',
    category: 'security',
    geography: 'Africa + Middle East',
    url: 'https://jamestown.org/feed/',
    description: 'Terrorism Monitor and Militant Leadership Monitor — jihadist groups, Al-Shabaab, Boko Haram, ISWAP, AQ affiliates.',
  },
  {
    id: 'reliefweb-africa',
    name: 'ReliefWeb — Africa',
    category: 'security',
    geography: 'Africa',
    url: 'https://reliefweb.int/updates/rss.xml?primary_country=1&source=OCHA',
    description: 'UN OCHA humanitarian situation reports — displacement, conflict, disasters, disease outbreaks across Africa.',
  },
  {
    id: 'un-news-africa',
    name: 'UN News — Africa',
    category: 'security',
    geography: 'Africa',
    url: 'https://news.un.org/feed/subscribe/en/news/region/africa/feed/rss.xml',
    description: 'United Nations news from Africa — peacekeeping operations, political missions, humanitarian updates.',
  },
  {
    id: 'african-arguments',
    name: 'African Arguments',
    category: 'security',
    geography: 'Africa',
    url: 'https://africanarguments.org/feed/',
    description: 'Expert analysis on African politics, security and society — in-depth reporting on conflict zones, governance and elections across the continent.',
  },
  {
    id: 'osac',
    name: 'OSAC Security Reports',
    category: 'security',
    geography: 'Africa + Middle East',
    url: 'https://www.osac.gov/Content/Browse/Report/56/RSS',
    description: 'Overseas Security Advisory Council — US State Dept security reports for business travellers covering Africa and the Middle East.',
  },
  {
    id: 'bbc-africa',
    name: 'BBC News — Africa',
    category: 'security',
    geography: 'Africa',
    url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
    description: 'BBC Africa news feed — breaking news, security incidents, political developments.',
  },

  // ── Conflict ──────────────────────────────────────────────────────────────
  {
    id: 'acled-blog',
    name: 'ACLED Research Blog',
    category: 'conflict',
    geography: 'Africa + Middle East',
    url: 'https://acleddata.com/feed/',
    description: 'ACLED data-driven analysis of armed conflict trends, protest movements and political violence.',
  },
  {
    id: 'gdelt',
    name: 'GDELT — Africa Security Events',
    category: 'conflict',
    geography: 'Africa',
    url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=africa+security+conflict&mode=ArtList&maxrecords=10&format=atom',
    description: 'GDELT Project real-time monitoring of Africa security and conflict events from 100+ languages of global news.',
  },

  // ── Middle East ───────────────────────────────────────────────────────────
  {
    id: 'crisis-group-me',
    name: 'Crisis Group — Middle East & North Africa',
    category: 'security',
    geography: 'Middle East + North Africa',
    url: 'https://www.crisisgroup.org/rss/middle-east-north-africa',
    description: 'International Crisis Group briefings on MENA conflicts — Yemen, Libya, Sudan, Syria, Iraq, Gulf.',
  },
  {
    id: 'aljazeera',
    name: 'Al Jazeera — Middle East',
    category: 'security',
    geography: 'Middle East',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    description: 'Al Jazeera English — Middle East and Africa breaking news and analysis.',
  },
  {
    id: 'jamestown-me',
    name: 'Jamestown — Militant Leadership Monitor',
    category: 'security',
    geography: 'Middle East',
    url: 'https://jamestown.org/programs/mlm/feed/',
    description: 'Profiles and tracking of militant leaders across the Middle East — ISIS, AQ, Hezbollah, Houthis.',
  },
  {
    id: 'un-news-me',
    name: 'UN News — Middle East',
    category: 'security',
    geography: 'Middle East',
    url: 'https://news.un.org/feed/subscribe/en/news/region/middle-east/feed/rss.xml',
    description: 'United Nations news from the Middle East — Yemen, Syria, Gaza, Lebanon, Iraq updates.',
  },
  {
    id: 'reliefweb-me',
    name: 'ReliefWeb — Middle East',
    category: 'security',
    geography: 'Middle East',
    url: 'https://reliefweb.int/updates/rss.xml?primary_country=182',
    description: 'UN OCHA humanitarian situation reports for the Middle East region.',
  },
]

async function fetchRss(url, ms = 8000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SafeGuard360/1.0 (travel risk platform)' },
    })
    clearTimeout(timeout)
    if (!r.ok) return null
    return await r.text()
  } catch {
    clearTimeout(timeout)
    return null
  }
}

function parseRss(xml) {
  const items = []
  // Handle both RSS <item> and Atom <entry> formats
  const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const get = (tag) => {
      const m = block.match(
        new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i')
      )
      return m ? (m[1] || m[2] || '').trim() : ''
    }
    // Atom uses <link href="..."/> or <link>url</link>
    let link = get('link')
    if (!link) {
      const linkAttr = block.match(/<link[^>]+href=["']([^"']+)["']/)
      if (linkAttr) link = linkAttr[1]
    }
    const title = get('title')
    if (!title) continue
    items.push({
      title,
      link,
      description: get('description') || get('summary') || '',
      pubDate: get('pubDate') || get('published') || get('updated') || '',
    })
  }
  return items
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { url, id, limit = 5 } = req.query

  // Return list of all pre-configured feeds
  if (!url && !id) {
    return res.json({ feeds: PRECONFIGURED_FEEDS })
  }

  // Resolve URL from id or use provided URL
  let feedUrl = url
  let feedMeta = null
  if (id) {
    feedMeta = PRECONFIGURED_FEEDS.find(f => f.id === id)
    if (!feedMeta) return res.status(404).json({ error: `Feed '${id}' not found` })
    feedUrl = feedMeta.url
  }

  if (!feedUrl) return res.status(400).json({ error: 'url or id required' })

  // Return cached if fresh
  if (cache[feedUrl] && Date.now() - cache[feedUrl].time < CACHE_TTL) {
    return res.json({ ...cache[feedUrl].data, cached: true })
  }

  const xml = await fetchRss(feedUrl)
  if (!xml) return res.status(502).json({ error: `Could not fetch RSS feed: ${feedUrl}` })

  const items = parseRss(xml)
  const articles = items.slice(0, parseInt(limit)).map(item => ({
    title: item.title,
    url: item.link,
    summary: item.description.replace(/<[^>]*>/g, '').slice(0, 200).trim(),
    date: item.pubDate ? new Date(item.pubDate).toISOString() : null,
  })).filter(a => a.title)

  const result = {
    feed: feedMeta || { url: feedUrl },
    total: items.length,
    articles,
    fetchedAt: new Date().toISOString(),
  }

  cache[feedUrl] = { data: result, time: Date.now() }
  res.json(result)
}
