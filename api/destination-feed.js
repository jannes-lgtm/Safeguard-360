/**
 * /api/destination-feed
 * Real-time news headlines for a specific destination.
 * Sources:
 *   1. Google News RSS  — destination-specific search (no key required)
 *   2. fetchArticlesForCountry — existing security/conflict/health intel feeds
 *
 * GET ?city=Dubai&country=United+Arab+Emirates
 * Returns: { articles: [{title, url, source, pubDate, category}], fetchedAt }
 * Cache: 15 min per city
 */

import { fetchArticlesForCountry } from './_claudeSynth.js'
import { adapt } from './_adapter.js'

const CACHE     = {}
const CACHE_TTL = 15 * 60 * 1000

// ── Google News RSS ───────────────────────────────────────────────────────────
function buildGNewsUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=US&ceid=US:en`
}

function parseGNewsRss(xml) {
  const items = []
  const re = /<item>([\s\S]*?)<\/item>/g
  let m
  while ((m = re.exec(xml)) !== null) {
    const b = m[1]
    const getTag = tag => {
      const x = b.match(new RegExp(
        `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`
      ))
      return x ? (x[1] || x[2] || '').trim() : ''
    }
    const title = getTag('title')
    if (!title) continue
    const link    = getTag('link')
    const pubDate = getTag('pubDate')
    // <source url="https://...">Publisher Name</source>
    const srcM  = b.match(/<source[^>]*>([^<]+)<\/source>/)
    const source = srcM ? srcM[1].trim() : 'News'
    // Strip "- Publisher" suffix Google appends to titles
    const cleanTitle = title.replace(new RegExp(`\\s*[-–]\\s*${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '').trim()
    items.push({
      title:    cleanTitle || title,
      url:      link,
      source,
      pubDate:  pubDate ? new Date(pubDate).toISOString() : null,
      category: 'news',
    })
  }
  return items
}

async function fetchGNews(query) {
  try {
    const r = await fetch(buildGNewsUrl(query), {
      headers: { 'User-Agent': 'SafeGuard360/1.0 travel risk intelligence platform' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return []
    return parseGNewsRss(await r.text())
  } catch {
    return []
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
async function _handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { city, country } = req.query
  if (!city && !country) return res.status(400).json({ error: 'city or country required' })

  const primaryTerm   = city || country
  const secondaryTerm = country || city
  const cacheKey      = primaryTerm.toLowerCase()

  const cached = CACHE[cacheKey]
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data)

  // Three parallel source fetches
  const [gnewsGeneral, gnewsSecurity, riskArticles] = await Promise.all([
    // General destination news: travel, tourism, business, infrastructure
    fetchGNews(`"${primaryTerm}" travel OR tourism OR business OR weather`),
    // Safety-specific: security, crime, risk, protest, unrest
    fetchGNews(`"${primaryTerm}" OR "${secondaryTerm}" security OR crime OR protest OR incident`),
    // Existing security/health/conflict RSS feeds
    fetchArticlesForCountry(secondaryTerm, primaryTerm !== secondaryTerm ? primaryTerm : null)
      .catch(() => []),
  ])

  // Normalise all sources to a common shape
  const all = [
    ...gnewsGeneral.map(a  => ({ ...a, category: 'news' })),
    ...gnewsSecurity.map(a => ({ ...a, category: 'security' })),
    ...riskArticles.map(a  => ({
      title:    a.title,
      url:      a.link,
      source:   a.feedName || 'Intel Feed',
      pubDate:  a.pubDate ? new Date(a.pubDate).toISOString() : null,
      category: a.feedCategory || 'security',
    })),
  ]

  // Deduplicate by title prefix, sort newest first
  const seen = new Set()
  const articles = all
    .filter(a => a.title && a.url)
    .filter(a => {
      const key = a.title.slice(0, 70).toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
    .slice(0, 25)

  const result = { articles, fetchedAt: new Date().toISOString() }
  CACHE[cacheKey] = { data: result, ts: Date.now() }
  return res.json(result)
}

export const handler = adapt(_handler)
export default handler
