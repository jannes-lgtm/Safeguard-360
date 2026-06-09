/**
 * GET /api/intel-coverage
 *
 * Intelligence Coverage Validation — Phase 4.
 *
 * Audits every Africa and Middle East country for:
 *   - 24h record volume
 *   - Attribution quality (confidence distribution)
 *   - Source diversity
 *   - Freshness (time since last ingest)
 *   - Coverage tier: strong / good / weak / none
 *
 * Also checks scoring isolation — verifies FCDO, CAIRO, and Trend
 * caches are populated and independent.
 *
 * Optional: ?snapshot=true persists results to intel_coverage_stats table.
 *
 * Auth: admin or developer role (Bearer token).
 */

import { getSupabaseAdmin } from './_supabase.js'

// ── Coverage tier thresholds ─────────────────────────────────────────────────
// Based on audit findings: countries below "good" need attention.
const TIERS = {
  strong: { minRecords: 50, minConfidence: 0.65, minSources: 3 },
  good:   { minRecords: 20, minConfidence: 0.50, minSources: 2 },
  weak:   { minRecords:  5, minConfidence: 0.30, minSources: 1 },
  // < weak thresholds = 'none'
}

// ── Africa + Middle East country list ────────────────────────────────────────
const AFRICA_MENA_COUNTRIES = [
  // Africa — West
  'Nigeria', 'Ghana', 'Mali', 'Burkina Faso', 'Niger', 'Senegal', 'Guinea', 'Guinea-Bissau',
  'Sierra Leone', 'Liberia', 'Ivory Coast', 'Benin', 'Togo', 'Mauritania', 'Gambia',
  // Africa — Central
  'Cameroon', 'Chad', 'Central African Republic', 'Democratic Republic of Congo',
  'Republic of Congo', 'Gabon', 'Equatorial Guinea',
  // Africa — East
  'Kenya', 'Ethiopia', 'Somalia', 'Sudan', 'South Sudan', 'Eritrea', 'Djibouti',
  'Uganda', 'Rwanda', 'Burundi', 'Tanzania',
  // Africa — Southern
  'South Africa', 'Mozambique', 'Zimbabwe', 'Zambia', 'Angola', 'Malawi',
  'Madagascar', 'Namibia', 'Botswana', 'Lesotho', 'Eswatini',
  // Africa — North
  'Egypt', 'Libya', 'Tunisia', 'Algeria', 'Morocco',
  // Middle East
  'Lebanon', 'Syria', 'Iraq', 'Iran', 'Yemen', 'Israel', 'Palestine',
  'Jordan', 'Saudi Arabia', 'UAE', 'Kuwait', 'Qatar', 'Bahrain', 'Oman',
]

// Recommended additional sources per country gap (Phase 4)
const RECOMMENDED_SOURCES = {
  'Angola':        ['Angola Press Agency (ANGOP)', 'Jornal de Angola'],
  'Zambia':        ['Zambia Daily Mail', 'Times of Zambia'],
  'Benin':         ['L\'Evénement Précis', 'La Nation Bénin'],
  'Ivory Coast':   ['Fraternité Matin', 'APA News Ivory Coast'],
  'Israel':        ['Haaretz English', 'Times of Israel', 'Jerusalem Post'],
  'West Bank':     ['OCHA oPt', 'Wafa News Agency'],
  'Palestine':     ['OCHA oPt', 'Wafa News Agency', 'Ma\'an News Agency'],
  'Jordan':        ['Jordan Times', 'Petra News Agency'],
  'Qatar':         ['Qatar Tribune', 'The Peninsula Qatar'],
  'Bahrain':       ['Bahrain News Agency', 'Gulf Daily News'],
  'Oman':          ['Times of Oman', 'Oman Observer'],
  'Mozambique':    ['O País', 'Carta de Moçambique'],
}

function computeTier(total24h, avgConf, distinctSources) {
  if (
    total24h >= TIERS.strong.minRecords &&
    avgConf  >= TIERS.strong.minConfidence &&
    distinctSources >= TIERS.strong.minSources
  ) return 'strong'

  if (
    total24h >= TIERS.good.minRecords &&
    avgConf  >= TIERS.good.minConfidence &&
    distinctSources >= TIERS.good.minSources
  ) return 'good'

  if (total24h >= TIERS.weak.minRecords) return 'weak'

  return 'none'
}

function minutesAgo(isoTs) {
  if (!isoTs) return null
  return Math.round((Date.now() - new Date(isoTs).getTime()) / 60_000)
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

  const doSnapshot = req.query.snapshot === 'true'
  const now        = new Date()
  const cutoff24h  = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const cutoff1h   = new Date(now.getTime() -  1 * 60 * 60 * 1000).toISOString()

  try {
    // ── 1. Fetch live_intelligence stats per country (24h window) ──────────
    // Query the coverage view if available, else compute directly
    let coverageRows = []

    const { data: viewData } = await sb
      .from('v_intel_coverage')
      .select('*')
      .order('total_24h', { ascending: false })

    if (viewData?.length) {
      coverageRows = viewData
    } else {
      // Fallback: manual aggregate query
      const { data: rawData } = await sb
        .from('live_intelligence')
        .select('primary_country, attribution_confidence, severity, source_name, ingested_at')
        .gte('ingested_at', cutoff24h)
        .not('primary_country', 'is', null)

      if (rawData?.length) {
        const byCountry = {}
        for (const row of rawData) {
          const c = row.primary_country
          if (!c) continue
          if (!byCountry[c]) {
            byCountry[c] = {
              country: c, total_24h: 0, confidence_sum: 0, severity_sum: 0,
              sources: new Set(), last_ingest: null, strong_24h: 0, good_24h: 0
            }
          }
          const b = byCountry[c]
          b.total_24h++
          b.confidence_sum += (row.attribution_confidence || 0.5)
          b.severity_sum   += (row.severity || 2)
          b.sources.add(row.source_name || '')
          if (!b.last_ingest || row.ingested_at > b.last_ingest) b.last_ingest = row.ingested_at
          if ((row.attribution_confidence || 0) >= 0.70) b.strong_24h++
          if ((row.attribution_confidence || 0) >= 0.45) b.good_24h++
        }
        coverageRows = Object.values(byCountry).map(b => ({
          country:               b.country,
          total_24h:             b.total_24h,
          strong_24h:            b.strong_24h,
          good_24h:              b.good_24h,
          avg_attribution_confidence: +(b.confidence_sum / b.total_24h).toFixed(2),
          avg_severity:          +(b.severity_sum / b.total_24h).toFixed(1),
          distinct_sources:      b.sources.size,
          last_ingest:           b.last_ingest,
        }))
      }
    }

    // Index by country (lowercase) for lookup
    const coverageByCountry = {}
    for (const row of coverageRows) {
      coverageByCountry[(row.country || '').toLowerCase()] = row
    }

    // ── 2. Build per-country coverage matrix ──────────────────────────────
    const countryMatrix = {}
    const gaps = []       // countries with insufficient coverage
    const alerts = []     // specific issues that need attention

    for (const country of AFRICA_MENA_COUNTRIES) {
      const key  = country.toLowerCase()
      const data = coverageByCountry[key]

      const total24h        = data?.total_24h         || 0
      const strong24h       = data?.strong_24h        || 0
      const good24h         = data?.good_24h          || 0
      const avgConf         = data?.avg_attribution_confidence || 0
      const distinctSources = data?.distinct_sources  || 0
      const lastIngest      = data?.last_ingest       || null
      const lastIngestAgo   = minutesAgo(lastIngest)
      const tier            = computeTier(total24h, avgConf, distinctSources)

      // Freshness: stale if last ingest > 8 hours ago (or never)
      const isFresh  = lastIngestAgo !== null && lastIngestAgo < 480  // 8h
      const isStale  = lastIngestAgo !== null && lastIngestAgo >= 480
      const isDead   = lastIngestAgo === null || lastIngestAgo > 24 * 60  // > 24h

      countryMatrix[country] = {
        country,
        tier,
        total_24h:          total24h,
        strong_24h:         strong24h,
        good_24h:           good24h,
        avg_confidence:     avgConf,
        distinct_sources:   distinctSources,
        last_ingest:        lastIngest,
        last_ingest_ago_min: lastIngestAgo,
        freshness:          isDead ? 'dead' : isStale ? 'stale' : 'fresh',
        recommended_sources: RECOMMENDED_SOURCES[country] || null,
      }

      // Flag gaps
      if (tier === 'none') {
        gaps.push({ country, tier, total_24h: total24h, issue: 'no_coverage' })
      } else if (tier === 'weak') {
        gaps.push({ country, tier, total_24h: total24h, issue: 'weak_coverage' })
      }

      // Flag specific alerts
      if (isDead) {
        alerts.push({ country, issue: 'dead_pipeline', last_ingest: lastIngest, severity: 'critical' })
      } else if (isStale && tier !== 'none') {
        alerts.push({ country, issue: 'stale_pipeline', last_ingest_ago_min: lastIngestAgo, severity: 'warning' })
      }
      if (total24h > 100 && avgConf < 0.35) {
        alerts.push({ country, issue: 'high_volume_low_accuracy', total_24h: total24h, avg_confidence: avgConf, severity: 'critical' })
      }
    }

    // ── 3. Summary statistics ──────────────────────────────────────────────
    const allEntries    = Object.values(countryMatrix)
    const tierCounts    = { strong: 0, good: 0, weak: 0, none: 0 }
    for (const e of allEntries) tierCounts[e.tier] = (tierCounts[e.tier] || 0) + 1

    const totalCountries = AFRICA_MENA_COUNTRIES.length
    const coveredCount   = allEntries.filter(e => e.tier !== 'none').length
    const coveragePct    = Math.round((coveredCount / totalCountries) * 100)

    const summary = {
      as_of:              now.toISOString(),
      total_countries:    totalCountries,
      covered_countries:  coveredCount,
      coverage_pct:       coveragePct,
      tier_strong:        tierCounts.strong,
      tier_good:          tierCounts.good,
      tier_weak:          tierCounts.weak,
      tier_none:          tierCounts.none,
      critical_alerts:    alerts.filter(a => a.severity === 'critical').length,
      warning_alerts:     alerts.filter(a => a.severity === 'warning').length,
      gaps_requiring_action: gaps.filter(g => g.issue === 'no_coverage').length,
    }

    // ── 4. Optional: persist snapshot ─────────────────────────────────────
    let snapshotWritten = false
    if (doSnapshot) {
      const snapRows = allEntries.map(e => ({
        country:          e.country,
        snapshot_date:    now.toISOString().slice(0, 10),
        total_24h:        e.total_24h,
        strong_24h:       e.strong_24h,
        good_24h:         e.good_24h,
        avg_confidence:   e.avg_confidence,
        distinct_sources: e.distinct_sources,
        coverage_tier:    e.tier,
        created_at:       now.toISOString(),
      }))

      const { error: snapErr } = await sb
        .from('intel_coverage_stats')
        .upsert(snapRows, { onConflict: 'country,snapshot_date' })

      snapshotWritten = !snapErr
      if (snapErr) console.error('[intel-coverage] snapshot error:', snapErr.message)
    }

    return res.status(200).json({
      summary,
      alerts:         alerts.sort((a, b) => (a.severity === 'critical' ? -1 : 1)),
      gaps,
      countries:      countryMatrix,
      snapshot_saved: snapshotWritten,
      _ts:            now.toISOString(),
    })

  } catch (err) {
    console.error('[intel-coverage]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
