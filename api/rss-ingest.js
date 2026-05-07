// RSS Feed Ingestion — parse any RSS/Atom feed and return structured articles
// Used by Intel Feeds panel to preview articles from security/terror/risk RSS sources
// No API key needed — all feeds listed below are free and public

const cache = {}
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes — shorter TTL so outbreak news surfaces faster

// ── Pre-configured Africa + Middle East risk/security RSS feeds ───────────────
export const PRECONFIGURED_FEEDS = [
  // ── Disease & Health ──────────────────────────────────────────────────────
  {
    id: 'who-outbreak',
    name: 'WHO News',
    category: 'health',
    geography: 'Global',
    url: 'https://www.who.int/rss-feeds/news-english.xml',
    description: 'World Health Organization official news — disease outbreaks, health emergencies, public health emergency of international concern (PHEIC) declarations.',
  },
  {
    id: 'reliefweb-who',
    name: 'ReliefWeb / WHO Health Emergencies',
    category: 'health',
    geography: 'Global',
    url: 'https://reliefweb.int/updates/rss.xml?source=WHO',
    description: 'WHO situation reports via ReliefWeb — epidemic and outbreak situation reports from the World Health Organization covering all regions.',
  },
  {
    id: 'outbreak-news-today',
    name: 'Outbreak News Today',
    category: 'health',
    geography: 'Global',
    url: 'https://outbreaknewstoday.com/feed/',
    description: 'Dedicated outbreak tracking news service — covers individual disease events in near real time including hantavirus, dengue, cholera, Ebola, mpox and respiratory illness clusters.',
  },
  {
    id: 'cidrap',
    name: 'CIDRAP News',
    category: 'health',
    geography: 'Global',
    url: 'https://www.cidrap.umn.edu/rss.xml',
    description: 'University of Minnesota Center for Infectious Disease Research and Policy — expert analysis of emerging infectious disease events, pandemic preparedness and outbreak epidemiology.',
  },
  {
    id: 'paho-alerts',
    name: 'PAHO — Pan American Health Organization',
    category: 'health',
    geography: 'Americas',
    url: 'https://www.paho.org/en/rss.xml',
    description: 'Pan American Health Organization news — primary source for hantavirus, dengue, cholera and other disease outbreaks across Latin America and the Caribbean.',
  },
  {
    id: 'africa-cdc',
    name: 'Africa CDC — Outbreak Briefs',
    category: 'health',
    geography: 'Africa',
    url: 'https://africacdc.org/feed/',
    description: 'Africa Centres for Disease Control and Prevention official outbreak briefs and public health alerts for the African continent.',
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
    id: 'reliefweb-health',
    name: 'ReliefWeb — Health Emergencies',
    category: 'health',
    geography: 'Global',
    url: 'https://reliefweb.int/updates/rss.xml?theme=3&source=WHO',
    description: 'UN OCHA ReliefWeb health emergency situation reports from WHO — epidemics, outbreaks and humanitarian health crises worldwide.',
  },
  {
    id: 'ecdc-threats',
    name: 'ECDC — Communicable Disease Threats',
    category: 'health',
    geography: 'Global (EU focus)',
    url: 'https://www.ecdc.europa.eu/en/rss-feed/ecdc-communicable-disease-threats-report',
    description: 'European Centre for Disease Prevention and Control weekly threats report — active outbreaks relevant to international travellers including hantavirus, mpox and respiratory illness.',
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
    category: 'conflict',
    geography: 'Africa',
    url: 'https://news.un.org/feed/subscribe/en/news/region/africa/feed/rss.xml',
    description: 'United Nations news from Africa — Sudan war, DRC conflict, Mali/Sahel peacekeeping operations and political missions.',
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

  // ── Weather & Natural Disasters ───────────────────────────────────────────
  {
    id: 'reliefweb-disasters',
    name: 'ReliefWeb — Disasters',
    category: 'weather',
    geography: 'Global',
    url: 'https://reliefweb.int/disasters/rss.xml',
    description: 'UN OCHA ReliefWeb official disaster declarations — floods, cyclones, earthquakes, droughts across all regions.',
  },
  {
    id: 'gdelt-weather',
    name: 'GDELT — Weather & Natural Hazards',
    category: 'weather',
    geography: 'Global',
    url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=flood+OR+cyclone+OR+earthquake+OR+drought+OR+wildfire+africa+OR+%22middle+east%22&mode=ArtList&maxrecords=10&format=atom',
    description: 'GDELT real-time weather and natural hazard events — floods, cyclones, earthquakes and droughts in monitored regions.',
  },
  {
    id: 'noaa-alerts',
    name: 'NOAA — International Weather Alerts',
    category: 'weather',
    geography: 'Global',
    url: 'https://www.nhc.noaa.gov/nhc_at1.xml',
    description: 'NOAA National Hurricane Center — Atlantic tropical storm and cyclone advisories affecting Africa and the Middle East coastal areas.',
  },
  {
    id: 'emsc-quakes',
    name: 'EMSC — Significant Earthquakes',
    category: 'weather',
    geography: 'Global',
    url: 'https://www.seismicportal.eu/fdsnws/event/1/query?format=xml&limit=10&minmagnitude=5&orderby=time',
    description: 'European-Mediterranean Seismological Centre — significant earthquakes magnitude 5.0+ globally in real time.',
  },

  // ── Conflict & War ────────────────────────────────────────────────────────
  {
    id: 'bbc-world',
    name: 'BBC News — World',
    category: 'conflict',
    geography: 'Global',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    description: 'BBC World News — breaking coverage of all active conflict zones including Ukraine, Iran, Gaza, Mali and Sudan.',
  },
  {
    id: 'france24-world',
    name: 'France 24 — International',
    category: 'conflict',
    geography: 'Global',
    url: 'https://www.france24.com/en/rss',
    description: 'France 24 English international news — strong coverage of Sahel conflicts (Mali, Burkina Faso, Niger), Ukraine and the Middle East.',
  },
  {
    id: 'kyiv-independent',
    name: 'Kyiv Independent',
    category: 'conflict',
    geography: 'Europe',
    url: 'https://kyivindependent.com/feed/',
    description: 'Kyiv Independent — primary English-language source for the Russia-Ukraine war, frontline updates and military analysis.',
  },
  {
    id: 'middle-east-eye',
    name: 'Middle East Eye',
    category: 'conflict',
    geography: 'Middle East',
    url: 'https://www.middleeasteye.net/rss',
    description: 'Middle East Eye — in-depth reporting on the Iran conflict, Gaza war, Lebanon, Yemen and wider MENA conflict zones.',
  },
  {
    id: 'iran-international',
    name: 'Iran International',
    category: 'conflict',
    geography: 'Middle East',
    url: 'https://www.iranintl.com/en/rss',
    description: 'Iran International — dedicated coverage of Iran conflict, IRGC activity, proxy wars and regional escalation.',
  },
  {
    id: 'war-on-the-rocks',
    name: 'War on the Rocks',
    category: 'conflict',
    geography: 'Global',
    url: 'https://warontherocks.com/feed/',
    description: 'War on the Rocks — expert strategic and military analysis of active conflicts, defence policy and geopolitical flashpoints.',
  },
  {
    id: 'defense-post',
    name: 'The Defense Post',
    category: 'conflict',
    geography: 'Global',
    url: 'https://thedefensepost.com/feed/',
    description: 'The Defense Post — global defence and conflict news covering active war zones, military operations and arms developments.',
  },
  {
    id: 'acled-blog',
    name: 'ACLED Research Blog',
    category: 'conflict',
    geography: 'Global',
    url: 'https://acleddata.com/feed/',
    description: 'ACLED data-driven analysis of armed conflict trends, protest movements and political violence worldwide.',
  },
  {
    id: 'rferl',
    name: 'Radio Free Europe / Radio Liberty',
    category: 'conflict',
    geography: 'Europe + Middle East',
    url: 'https://www.rferl.org/api/epiqq',
    description: 'RFERL — authoritative coverage of the Ukraine-Russia war, Central Asian conflicts and Iran, with on-the-ground reporting.',
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
    category: 'conflict',
    geography: 'Middle East',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    description: 'Al Jazeera English — breaking conflict coverage across the Middle East, Gaza, Yemen, Iran and Africa.',
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
    category: 'conflict',
    geography: 'Middle East',
    url: 'https://news.un.org/feed/subscribe/en/news/region/middle-east/feed/rss.xml',
    description: 'United Nations news from the Middle East — Yemen, Syria, Gaza, Lebanon, Iraq ceasefire and conflict updates.',
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

async function _handler(req, res) {
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

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default handler
