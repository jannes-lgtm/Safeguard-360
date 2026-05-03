// SAPS — South African Police Service Crime Statistics
// SAPS publishes quarterly crime stats as Excel/PDF — no public API
// We expose the official data source link + crime category metadata
// For live per-station data, a future upgrade will cache parsed Excel files in Supabase

const CRIME_CATEGORIES = [
  { category: 'Contact Crimes', crimes: ['Murder', 'Sexual Offences', 'Assault GBH', 'Common Assault', 'Aggravated Robbery', 'Common Robbery', 'Carjacking', 'Truck Hijacking'] },
  { category: 'Property Crimes', crimes: ['Residential Burglary', 'Business Burglary', 'Theft of Motor Vehicle', 'Theft out of Motor Vehicle', 'Stock Theft'] },
  { category: 'Community Reported Crime', crimes: ['Malicious Damage to Property', 'Arson', 'Illegal Possession of Firearms'] },
  { category: 'Drug-Related Crime', crimes: ['Drug-related Crime'] },
]

// Latest known SAPS reporting period — update when new stats drop (quarterly)
const LATEST_PERIOD = 'April 2023 – March 2024'
const LATEST_RELEASE = '2024-08-23'

// High-risk SA cities / regions from SAPS data (sourced from published reports)
const HIGH_RISK_AREAS = [
  { area: 'Cape Flats, Western Cape', risk: 'Critical', note: 'Highest murder rate nationally — gang violence' },
  { area: 'Johannesburg CBD', risk: 'High', note: 'High robbery and assault rates' },
  { area: 'Durban Central, KwaZulu-Natal', risk: 'High', note: 'Elevated violent crime' },
  { area: 'Pretoria CBD', risk: 'Medium', note: 'Business burglary and vehicle crime' },
  { area: 'Pietermaritzburg, KwaZulu-Natal', risk: 'High', note: 'High murder and robbery' },
  { area: 'East London, Eastern Cape', risk: 'High', note: 'Elevated contact crime rates' },
  { area: 'Sandton / Rosebank', risk: 'Medium', note: 'Smash-and-grab, vehicle theft' },
  { area: 'Stellenbosch / Winelands', risk: 'Low', note: 'Lower crime relative to urban centres' },
]

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { area } = req.query

  // Filter by area if requested
  let areaResults = HIGH_RISK_AREAS
  if (area) {
    const q = area.toLowerCase()
    areaResults = HIGH_RISK_AREAS.filter(a =>
      a.area.toLowerCase().includes(q)
    )
  }

  res.json({
    configured: true,
    source: 'SAPS Crime Statistics',
    sourceUrl: 'https://www.saps.gov.za/services/crimestats.php',
    latestPeriod: LATEST_PERIOD,
    latestRelease: LATEST_RELEASE,
    categories: CRIME_CATEGORIES,
    highRiskAreas: areaResults,
    note: 'SAPS publishes quarterly. Per-station live data requires Excel file processing — upgrade available on request.',
  })
}
