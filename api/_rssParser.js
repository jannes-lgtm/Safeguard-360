/**
 * Shared RSS/Atom XML parser.
 * Replaces three near-identical local implementations in:
 *   rss-ingest.js (parseRss), _claudeSynth.js (parseHealthRss), country-risk.js (parseRssItems)
 *
 * Supports both RSS <item> and Atom <entry>, with CDATA and href-attribute fallbacks.
 */

/**
 * Parse a raw RSS or Atom XML string into an array of article objects.
 * @param {string} xml - Raw XML from a feed URL
 * @param {string} [source] - Optional label added to each article as `source`
 * @returns {{ title: string, link: string, description: string, pubDate: string, source?: string }[]}
 */
export function parseRssXml(xml, source) {
  const items = []
  const re = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g
  let m
  while ((m = re.exec(xml)) !== null) {
    const block = m[1]
    const get = (tag) => {
      const x = block.match(
        new RegExp(
          `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`,
          'i'
        )
      )
      return x ? (x[1] || x[2] || '').trim() : ''
    }

    let link = get('link')
    if (!link) {
      const attr = block.match(/<link[^>]+href=["']([^"']+)["']/)
      if (attr) link = attr[1]
    }

    const title = get('title')
    if (!title) continue

    const article = {
      title,
      link,
      description: get('description') || get('summary') || '',
      pubDate:     get('pubDate') || get('published') || get('updated') || '',
    }
    if (source) article.source = source
    items.push(article)
  }
  return items
}
