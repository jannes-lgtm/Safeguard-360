/**
 * _cairoSOP.js — CAIRO Knowledge Base & SOP Retrieval
 *
 * Extracted from journey-agent.js to give the SOP/KB pipeline its own module.
 * Enables reuse by _intelCenter.js and any future CAIRO orchestration layer
 * without importing the entire journey-agent handler.
 *
 * Exports:
 *   DESTINATION_REGION_MAP  — country → region lookup used for tier scoring
 *   scoreDoc(doc, destination, region, queryTokens)  — relevance scorer
 *   compressDoc(scored)                              — content compression by tier
 *   buildKnowledgeContext(destination, message)      — full RAG retrieval pipeline
 *   formatKBSection(scored)                          — tier-grouped prompt section
 *
 * RAG Pipeline (Tier priority):
 *   Tier 1 = country-specific  (weight 40)
 *   Tier 2 = regional          (weight 30)
 *   Tier 3 = global SOP        (weight 20)
 *   Tier 4 = general doctrine  (weight 10)
 *
 * Retrieval order:
 *   1. Vector search via _intel.js (Voyage embeddings) — preferred path
 *   2. Keyword scoring via scoreDoc — legacy fallback
 */

import { createClient } from '@supabase/supabase-js'

// ── Supabase client (service role — read-only KB queries) ─────────────────────
let _sb = null
const getSB = () => _sb || (_sb = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
))

// ── Region map ────────────────────────────────────────────────────────────────

export const DESTINATION_REGION_MAP = {
  // Africa
  'South Africa': 'Southern Africa', 'Namibia': 'Southern Africa', 'Botswana': 'Southern Africa',
  'Zambia': 'Southern Africa', 'Zimbabwe': 'Southern Africa', 'Mozambique': 'Southern Africa',
  'Angola': 'Southern Africa', 'Malawi': 'Southern Africa', 'Tanzania': 'East Africa',
  'Kenya': 'East Africa', 'Uganda': 'East Africa', 'Ethiopia': 'East Africa',
  'Rwanda': 'East Africa', 'Burundi': 'East Africa', 'Somalia': 'Horn of Africa',
  'Eritrea': 'Horn of Africa', 'Djibouti': 'Horn of Africa',
  'Democratic Republic of Congo': 'Central Africa', 'Cameroon': 'Central Africa',
  'Gabon': 'Central Africa', 'Chad': 'Central Africa',
  'Nigeria': 'West Africa', 'Ghana': 'West Africa', 'Senegal': 'West Africa',
  'Mali': 'Sahel', 'Niger': 'Sahel', 'Burkina Faso': 'Sahel',
  'Egypt': 'North Africa', 'Libya': 'North Africa', 'Tunisia': 'North Africa',
  'Algeria': 'North Africa', 'Morocco': 'North Africa',
  'Madagascar': 'East Africa',
  // Middle East
  'Iraq': 'Middle East', 'Iran': 'Middle East', 'Syria': 'Middle East',
  'Lebanon': 'Middle East', 'Yemen': 'Middle East', 'UAE': 'Middle East',
  'Saudi Arabia': 'Middle East', 'Jordan': 'Middle East', 'Israel': 'Middle East',
  // Americas
  'Haiti': 'Caribbean', 'Mexico': 'Latin America', 'Colombia': 'Latin America',
  'Venezuela': 'Latin America', 'Brazil': 'Latin America', 'Guyana': 'Latin America',
  // Asia
  'Taiwan': 'East Asia', 'Russia': 'Europe',
}

// ── Scoring & compression ─────────────────────────────────────────────────────

/**
 * Score a KB document for relevance to the current destination/region/query.
 * Returns { doc, tier, score } where score = tierWeight + capped keywordScore.
 */
export function scoreDoc(doc, destination, region, queryTokens) {
  // Tier from doc_tier field: country=1, regional=2, global=3, doctrine=4
  const tierMap = { country: 1, regional: 2, global: 3, doctrine: 4 }
  let tier = tierMap[doc.doc_tier] ?? 3

  // Without a destination, country and regional docs are irrelevant — demote to global
  if (!destination) {
    if (tier === 1) tier = 3
    if (tier === 2) tier = 3
  } else {
    // Demote country docs that don't match current destination
    if (tier === 1 && !doc.countries?.includes(destination)) tier = 2
    // Demote regional docs that don't match current region
    if (tier === 2 && region && !doc.regions?.includes(region) && !doc.countries?.some(c => DESTINATION_REGION_MAP[c] === region)) tier = 3
  }

  const tierWeight = { 1: 40, 2: 30, 3: 20, 4: 10 }[tier]

  // Keyword match against tags and threat_categories
  const docTokens = [
    ...(doc.tags || []),
    ...(doc.threat_categories || []),
    ...(doc.countries || []),
    ...(doc.regions || []),
    doc.title || '',
  ].join(' ').toLowerCase()

  const keywordScore = queryTokens.reduce((acc, t) => acc + (docTokens.includes(t) ? 5 : 0), 0)

  return { doc, tier, score: tierWeight + Math.min(keywordScore, 20) }
}

/**
 * Compress a scored document for prompt injection.
 * Tiers 1-2 or strong keyword hits use full content; tiers 3-4 use summary.
 */
export function compressDoc(scored) {
  const { doc, tier, score } = scored
  const highKeywordHit = score - [0, 40, 30, 20, 10][tier] >= 10
  // Use full content for tier 1-2, or if strong keyword match
  const body = (tier <= 2 || highKeywordHit) ? doc.content : doc.summary
  return `### ${doc.title}\n${body}`
}

// ── RAG retrieval pipeline ────────────────────────────────────────────────────

/**
 * Retrieve and score KB documents for the given destination and message query.
 *
 * Primary path:  vector search via _intel.js (Voyage embeddings)
 * Fallback path: keyword scoring via scoreDoc against all retrieval-ready docs
 *
 * Returns an array of scored documents: { doc, tier, score }[]
 * Returns [] on any error — never throws.
 */
export async function buildKnowledgeContext(destination, message = '') {
  try {
    const sb     = getSB()
    const region = destination ? DESTINATION_REGION_MAP[destination] : null

    // Primary: unified intel retrieval core (vector search + freshness weighting)
    const { retrieveIntelligence } = await import('./_intel.js')
    const intel = await retrieveIntelligence(sb, {
      query:   message || destination || '',
      country: destination || null,
      region:  region || null,
      limit:   13,
    })

    if (intel.docs.length) return intel.docs

    // Legacy fallback: keyword scoring via scoreDoc
    const { data: allDocs } = await sb
      .from('cairo_knowledge')
      .select('type, title, content, summary, countries, regions, threat_categories, tags, doc_tier')
      .eq('retrieval_ready', true)
      .eq('intelligence_enabled', true)
      .order('doc_tier', { ascending: true })
      .limit(60)

    if (!allDocs?.length) return []

    const queryTokens = message.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(t => t.length > 3)
    return allDocs
      .map(doc => scoreDoc(doc, destination, region, queryTokens))
      .sort((a, b) => b.score - a.score)
      .slice(0, 13)
  } catch {
    return []
  }
}

// ── Prompt section formatter ──────────────────────────────────────────────────

/**
 * Format scored KB documents into a tiered prompt section ready for injection.
 * Returns '' when scored array is empty.
 */
export function formatKBSection(scored) {
  if (!scored.length) return ''
  const byTier = {
    1: scored.filter(s => s.tier === 1),
    2: scored.filter(s => s.tier === 2),
    3: scored.filter(s => s.tier === 3),
    4: scored.filter(s => s.tier === 4),
  }
  const tierLabels = {
    1: 'COUNTRY-SPECIFIC INTELLIGENCE',
    2: 'REGIONAL INTELLIGENCE',
    3: 'GLOBAL STANDARD OPERATING PROCEDURES',
    4: 'GENERAL DOCTRINE (REFERENCE)',
  }
  let out = '\n\n' + '═'.repeat(59) + '\nORGANISATIONAL KNOWLEDGE BASE — TREAT AS AUTHORITATIVE\n' + '═'.repeat(59)
  for (const tier of [1, 2, 3, 4]) {
    if (!byTier[tier].length) continue
    out += `\n\n${tierLabels[tier]}:\n`
    byTier[tier].forEach(s => { out += '\n' + compressDoc(s) + '\n' })
  }
  out += '\n\nApply the above in priority order. Country-specific intelligence takes precedence over regional, which takes precedence over global SOPs, which take precedence over general doctrine. Where SOPs exist for a situation being discussed, reference them explicitly.\n'
  return out
}
