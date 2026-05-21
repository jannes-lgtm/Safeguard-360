/**
 * api/_countryRiskContext.js
 *
 * Pulls structured country risk data into CAIRO's context assembly.
 * Uses the existing getCountryRisk() pipeline (FCDO + AI brief cached 1h).
 * Does NOT trigger a new AI synthesis — reads from cache when warm,
 * falls back to raw advisory data (FCDO level + GDACS) when cold.
 *
 * Called by _contextAssembly.js in the parallel fetch phase.
 */

import { getCountryRisk } from './country-risk.js'

const RISK_LEVEL_LABEL = {
  1: 'LOW RISK — Normal precautions',
  2: 'MEDIUM RISK — Some areas, heightened vigilance',
  3: 'HIGH RISK — Against all but essential travel',
  4: 'CRITICAL RISK — Against all travel',
}

const SEVERITY_LABEL = {
  low:      'Low',
  moderate: 'Moderate',
  high:     'High',
  critical: 'Critical',
  unknown:  'Unknown',
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function assembleCountryRiskContext(destination, transitPoints = []) {
  const countries = [destination, ...transitPoints].filter(Boolean)
  if (!countries.length) return { formatted: null, hasData: false }

  try {
    const results = await Promise.allSettled(
      countries.map(c => Promise.race([
        getCountryRisk(c),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]))
    )

    const enriched = results
      .map((r, i) => ({ country: countries[i], data: r.status === 'fulfilled' ? r.value : null }))
      .filter(r => r.data)

    if (!enriched.length) return { formatted: null, hasData: false }

    const lines = [
      '═══════════════════════════════════════════════════════════',
      'COUNTRY RISK INTELLIGENCE',
      '═══════════════════════════════════════════════════════════',
    ]

    for (const { country, data } of enriched) {
      const level    = data.level
      const severity = data.severity || 'unknown'
      const levelStr = level ? RISK_LEVEL_LABEL[level] : 'No advisory data available'
      const sevStr   = SEVERITY_LABEL[severity] || severity.toUpperCase()

      lines.push('')
      lines.push(`▶ ${country.toUpperCase()}`)
      lines.push(`  Advisory Level: ${level ? `${level}/4` : 'N/A'} — ${levelStr}`)
      lines.push(`  Severity: ${sevStr}`)

      // FCDO source
      const fcdo = data.sources?.find(s => s.name === 'UK FCDO')
      if (fcdo?.message) lines.push(`  FCDO: ${fcdo.message}`)

      // GDACS / natural hazards
      if (data.gdacs_count > 0) {
        lines.push(`  ⚠ Natural Hazards: ${data.gdacs_count} active UN GDACS event(s)`)
      }
      if (data.usgs_count > 0) {
        lines.push(`  ⚠ Seismic Activity: ${data.usgs_count} recent earthquake(s) detected`)
      }

      // Health alerts
      if (data.health_alerts > 0) {
        lines.push(`  ⚕ Health Alerts: ${data.health_alerts} active health advisory/outbreak notice(s)`)
        const topHealth = (data.health_items || []).slice(0, 2)
        for (const h of topHealth) {
          lines.push(`    • ${h.title}`)
        }
      }

      // AI brief (use if cached — most valuable context)
      if (data.ai_brief) {
        const brief = data.ai_brief

        if (brief.executive_summary) {
          lines.push(`  Executive Summary: ${brief.executive_summary}`)
        }

        if (brief.threat_categories?.length) {
          lines.push(`  Primary Threats: ${brief.threat_categories.slice(0, 5).join(', ')}`)
        }

        if (brief.movement_restrictions?.length) {
          lines.push(`  Movement Restrictions:`)
          for (const r of brief.movement_restrictions.slice(0, 3)) {
            lines.push(`    • ${r}`)
          }
        }

        if (brief.safe_areas?.length) {
          lines.push(`  Relatively Safer Areas: ${brief.safe_areas.slice(0, 3).join(', ')}`)
        }

        if (brief.high_risk_areas?.length) {
          lines.push(`  High-Risk Areas: ${brief.high_risk_areas.slice(0, 3).join(', ')}`)
        }

        if (brief.precautions?.length) {
          lines.push(`  Key Precautions:`)
          for (const p of brief.precautions.slice(0, 3)) {
            lines.push(`    • ${p}`)
          }
        }

        if (brief.analyst_note) {
          lines.push(`  Analyst Note: ${brief.analyst_note}`)
        }
      }
    }

    lines.push('')
    lines.push('Source: UK FCDO + UN GDACS + USGS + WHO/CDC health feeds + CAIRO AI synthesis.')
    lines.push('Country risk data cached up to 1 hour. Verify against live feeds for breaking changes.')
    lines.push('═══════════════════════════════════════════════════════════')

    return {
      formatted: lines.join('\n'),
      countries: enriched.map(e => ({
        country:       e.country,
        level:         e.data.level,
        severity:      e.data.severity,
        gdacs_count:   e.data.gdacs_count,
        usgs_count:    e.data.usgs_count,
        health_alerts: e.data.health_alerts,
        has_ai_brief:  !!e.data.ai_brief,
      })),
      hasData: true,
    }

  } catch (err) {
    console.warn('[countryRiskContext] error:', err.message)
    return { formatted: null, hasData: false }
  }
}
