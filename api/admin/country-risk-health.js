/**
 * GET /api/admin/country-risk-health
 *
 * Country Risk Cache Health — monitoring endpoint for the CAIRO intelligence pipeline.
 *
 * Returns:
 *   overview        — total live/stale/expired entries, coverage %
 *   tier_status     — per-tier coverage and oldest/newest entry
 *   country_status  — individual entry for each monitored country
 *   cron_health     — inferred cron run times from cache timestamps
 *   audit           — source_count / intelligence_count distribution
 *
 * Auth: admin or developer role only.
 */

import { getSupabaseAdmin } from '../_supabase.js'

// Countries by tier — mirrors country-risk-warmup.js
const TIER_A = [
  'Somalia','South Sudan','Sudan','Libya','Mali','Niger','Burkina Faso',
  'Central African Republic','Democratic Republic of Congo','Eritrea','Burundi',
  'Syria','Yemen','Iraq','Iran','Israel','West Bank',
  'Afghanistan','Myanmar','Haiti','Ukraine','Russia',
]
const TIER_B = [
  'Nigeria','Ethiopia','Chad','Mozambique','Cameroon','Togo','Benin',
  'Ivory Coast','Kenya','Tanzania','Egypt','Algeria','Tunisia',
  'Guinea-Bissau','Guinea','Gabon',
  'Lebanon','Pakistan','Jordan','Saudi Arabia','United Arab Emirates',
  'Guatemala','Ecuador','Venezuela','Colombia','Mexico',
  'Honduras','Nicaragua','Jamaica','India','Turkey',
]
const TIER_C = [
  'South Africa','Ghana','Uganda','Rwanda','Zimbabwe','Zambia','Angola',
  'Morocco','Sierra Leone','Liberia','Mauritania','Madagascar','Djibouti',
  'Equatorial Guinea','Republic of Congo','Eswatini','Lesotho','Comoros',
  'Malawi','Gambia','Senegal','Namibia','Botswana','Cape Verde',
  'Kuwait','Bahrain','Qatar','Oman',
  'China','Bangladesh','Nepal','Sri Lanka','Thailand','Vietnam',
  'Cambodia','Laos','Indonesia','Philippines','Malaysia',
  'Kazakhstan','Uzbekistan','Tajikistan',
  'Brazil','Peru','Bolivia','El Salvador','Paraguay','Cuba',
  'Dominican Republic','Trinidad and Tobago','Panama','Costa Rica',
  'Argentina','Chile',
  'Belarus','Serbia','Kosovo','Bosnia and Herzegovina','Moldova','Georgia',
  'Armenia','Azerbaijan','North Macedonia','Montenegro',
]
const TIER_D = [
  'France','Germany','Spain','Italy','Netherlands','Belgium','Switzerland',
  'Austria','Sweden','Norway','Denmark','Finland','Portugal','Ireland',
  'Poland','Czech Republic','Hungary','Romania','Bulgaria','Croatia',
  'Estonia','Latvia','Lithuania','Luxembourg','Malta','Cyprus','Greece',
  'Japan','South Korea','Singapore','Australia','New Zealand','Taiwan',
  'United States','Canada','Uruguay','Seychelles',
]

const ALL_COUNTRIES = [
  ...TIER_A.map(c => ({ country: c, tier: 'A' })),
  ...TIER_B.map(c => ({ country: c, tier: 'B' })),
  ...TIER_C.map(c => ({ country: c, tier: 'C' })),
  ...TIER_D.map(c => ({ country: c, tier: 'D' })),
]

// De-duplicate (higher tier wins)
const COUNTRIES_MAP = new Map()
for (const { country, tier } of ALL_COUNTRIES) {
  if (!COUNTRIES_MAP.has(country)) COUNTRIES_MAP.set(country, tier)
}

const STALE_WINDOW_MS = 6 * 60 * 60 * 1000   // 6 hours (must match country-risk-summary.js)
const VALID_SEVERITIES = new Set(['Critical', 'High', 'Medium', 'Low'])

function minutesAgo(isoTs) {
  if (!isoTs) return null
  return Math.round((Date.now() - new Date(isoTs).getTime()) / 60000)
}

function minutesUntil(isoTs) {
  if (!isoTs) return null
  return Math.round((new Date(isoTs).getTime() - Date.now()) / 60000)
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Unauthorised — Bearer token required' })

  const sb = getSupabaseAdmin()
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await sb
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!['admin', 'developer'].includes(profile?.role))
    return res.status(403).json({ error: 'Admin or developer role required' })

  // ── Fetch all country-risk api_cache entries ──────────────────────────────
  const now      = new Date()
  const staleFrom = new Date(now.getTime() - STALE_WINDOW_MS).toISOString()

  const { data: cacheRows, error: cacheErr } = await sb
    .from('api_cache')
    .select('key, value, created_at, expires_at')
    .ilike('key', 'country-risk:ai:%')
    .gt('expires_at', staleFrom)   // live + recently stale only

  if (cacheErr) {
    console.error('[country-risk-health] db error:', cacheErr.message)
    return res.status(500).json({ error: cacheErr.message })
  }

  // ── Index rows by country key ─────────────────────────────────────────────
  const byKey = new Map()
  for (const row of cacheRows || []) {
    const key = row.key.replace('country-risk:ai:', '').trim()
    const isLive  = new Date(row.expires_at) > now
    const isStale = !isLive
    byKey.set(key, { ...row, isLive, isStale })
  }

  // ── Per-country status ────────────────────────────────────────────────────
  const country_status = {}
  const tier_buckets   = { A: [], B: [], C: [], D: [] }

  for (const [country, tier] of COUNTRIES_MAP) {
    const key  = country.toLowerCase()
    const row  = byKey.get(key)
    const v    = row?.value

    const entry = {
      tier,
      status:             row ? (row.isLive ? 'live' : 'stale') : 'missing',
      severity:           VALID_SEVERITIES.has(v?.overall_severity) ? v.overall_severity : null,
      cached_at:          row?.created_at     || null,
      expires_at:         row?.expires_at     || null,
      cached_ago_min:     minutesAgo(row?.created_at),
      expires_in_min:     row?.isLive ? minutesUntil(row.expires_at) : null,
      stale_by_min:       row?.isStale ? -minutesUntil(row.expires_at) : null,
      last_generated_at:  v?.last_generated_at  || null,
      last_refreshed_at:  v?.last_refreshed_at  || null,
      source_count:       v?.source_count        ?? null,
      intelligence_count: v?.intelligence_count  ?? null,
    }

    country_status[country] = entry
    tier_buckets[tier].push(entry)
  }

  // ── Tier summary ──────────────────────────────────────────────────────────
  const tier_status = {}
  for (const [tier, entries] of Object.entries(tier_buckets)) {
    const live    = entries.filter(e => e.status === 'live')
    const stale   = entries.filter(e => e.status === 'stale')
    const missing = entries.filter(e => e.status === 'missing')

    const cachedTimes = entries
      .filter(e => e.cached_at)
      .map(e => new Date(e.cached_at).getTime())
      .sort((a, b) => b - a)   // newest first

    tier_status[tier] = {
      total:         entries.length,
      live:          live.length,
      stale:         stale.length,
      missing:       missing.length,
      coverage_pct:  Math.round(((live.length + stale.length) / entries.length) * 100),
      live_pct:      Math.round((live.length / entries.length) * 100),
      newest_cache:  cachedTimes.length ? new Date(cachedTimes[0]).toISOString()  : null,
      oldest_cache:  cachedTimes.length ? new Date(cachedTimes[cachedTimes.length - 1]).toISOString() : null,
      missing_countries: missing.map(e =>
        Object.entries(country_status).find(([, v]) => v === e)?.[0]
      ).filter(Boolean),
    }
  }

  // ── Overall overview ──────────────────────────────────────────────────────
  const all  = Object.values(country_status)
  const totalMonitored = COUNTRIES_MAP.size
  const totalLive      = all.filter(e => e.status === 'live').length
  const totalStale     = all.filter(e => e.status === 'stale').length
  const totalMissing   = all.filter(e => e.status === 'missing').length

  // Infer last warmup run from newest cache timestamps
  const fastTierNewest  = [
    ...(tier_buckets.A), ...(tier_buckets.B)
  ].filter(e => e.cached_at).map(e => e.cached_at).sort().reverse()[0] || null

  const slowTierNewest  = [
    ...(tier_buckets.C), ...(tier_buckets.D)
  ].filter(e => e.cached_at).map(e => e.cached_at).sort().reverse()[0] || null

  // ── Audit distribution ─────────────────────────────────────────────────────
  const sourceCounts       = all.map(e => e.source_count).filter(v => v != null)
  const intelligenceCounts = all.map(e => e.intelligence_count).filter(v => v != null)

  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null

  const overview = {
    as_of:             now.toISOString(),
    total_monitored:   totalMonitored,
    live:              totalLive,
    stale:             totalStale,
    missing:           totalMissing,
    coverage_pct:      Math.round(((totalLive + totalStale) / totalMonitored) * 100),
    live_pct:          Math.round((totalLive / totalMonitored) * 100),
    cache_ttl_hours:   3,
    fast_warmup_schedule: '*/30 * * * *',
    slow_warmup_schedule: '0 */2 * * *',
  }

  const cron_health = {
    fast_tier_last_inferred: fastTierNewest,
    fast_tier_last_inferred_ago_min: minutesAgo(fastTierNewest),
    slow_tier_last_inferred: slowTierNewest,
    slow_tier_last_inferred_ago_min: minutesAgo(slowTierNewest),
    note: 'Last inferred from newest cache timestamp per tier — not a direct cron log',
  }

  const audit = {
    entries_with_audit_fields: sourceCounts.length,
    entries_without_audit_fields: totalLive + totalStale - sourceCounts.length,
    avg_source_count:       avg(sourceCounts),
    avg_intelligence_count: avg(intelligenceCounts),
    min_source_count:       sourceCounts.length ? Math.min(...sourceCounts)       : null,
    max_source_count:       sourceCounts.length ? Math.max(...sourceCounts)       : null,
    min_intelligence_count: intelligenceCounts.length ? Math.min(...intelligenceCounts) : null,
    max_intelligence_count: intelligenceCounts.length ? Math.max(...intelligenceCounts) : null,
    note: 'Audit fields present on entries generated after cache architecture update. ' +
          'Older entries show null values — will populate as warmup regenerates each country.',
  }

  return res.status(200).json({
    overview,
    tier_status,
    cron_health,
    audit,
    country_status,
  })
}
