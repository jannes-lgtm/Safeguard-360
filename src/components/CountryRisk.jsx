import { useState } from 'react'
import { Shield, ExternalLink, RefreshCw, Globe, Bell } from 'lucide-react'

const SEVERITY_CONFIG = {
  'Critical': { color: 'text-red-700 bg-red-100 border-red-200', label: 'Do Not Travel' },
  'High':     { color: 'text-amber-700 bg-amber-100 border-amber-200', label: 'Reconsider Travel' },
  'Medium':   { color: 'text-yellow-700 bg-yellow-100 border-yellow-200', label: 'Exercise Caution' },
  'Low':      { color: 'text-green-700 bg-green-100 border-green-200', label: 'Normal Precautions' },
  'Unknown':  { color: 'text-gray-600 bg-gray-100 border-gray-200', label: 'No advisory data' },
}

function toSeverity(level) {
  if (!level) return 'Unknown'
  if (level >= 4) return 'Critical'
  if (level >= 3) return 'High'
  if (level >= 2) return 'Medium'
  return 'Low'
}

// Fetch UK FCDO advisory directly (CORS-enabled public API)
async function fetchFcdo(country) {
  const slug = country.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z-]/g, '')
  try {
    const r = await fetch(`https://www.gov.uk/api/content/foreign-travel-advice/${slug}`, {
      headers: { Accept: 'application/json' }
    })
    if (!r.ok) return null
    const data = await r.json()
    const part = data.details?.parts?.find(p => p.slug === 'warnings-and-insurance')
    if (!part?.body) return null
    const t = part.body.toLowerCase()
    let level = 1
    if (t.includes('advises against all travel')) level = 4
    else if (t.includes('advises against all but essential travel')) level = 3
    else if (t.includes('advises against some travel') || t.includes('some parts of')) level = 2
    const labels = ['', 'Normal precautions', 'Exercise caution', 'All but essential travel', 'Do not travel']
    return { level, message: labels[level], url: `https://www.gov.uk/foreign-travel-advice/${slug}` }
  } catch { return null }
}

// Fetch US State Dept advisory
async function fetchStateAdvisory(country) {
  try {
    const r = await fetch(
      'https://travel.state.gov/content/dam/traveladvisories/Feeds/TravelAdvisoryJSON.json'
    )
    if (!r.ok) return null
    const data = await r.json()
    const entry = data.graph?.find(c =>
      (c.name || c.countryName || '').toLowerCase() === country.toLowerCase()
    )
    if (!entry) return null
    const level = entry.advisoryLevel ?? entry.level ?? null
    return {
      level,
      message: entry.advisoryText ?? entry.message ?? null,
      url: entry.url ?? 'https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html',
    }
  } catch { return null }
}

async function getCountryRisk(country) {
  const [fcdo, us] = await Promise.allSettled([fetchFcdo(country), fetchStateAdvisory(country)])
  const fcdoData = fcdo.status === 'fulfilled' ? fcdo.value : null
  const usData = us.status === 'fulfilled' ? us.value : null

  const combinedLevel = Math.max(fcdoData?.level ?? 0, usData?.level ?? 0) || null
  const dfatSlug = country.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z-]/g, '')

  return {
    country,
    severity: toSeverity(combinedLevel),
    sources: [
      usData?.level != null ? { name: 'US State Dept', url: usData.url, message: usData.message } : null,
      fcdoData ? { name: 'UK FCDO', url: fcdoData.url, message: fcdoData.message } : null,
      { name: 'AU DFAT', url: `https://www.smartraveller.gov.au/destinations/${dfatSlug}` },
    ].filter(Boolean),
  }
}

function getRecipients(profile) {
  const emails = []
  if (profile?.email) emails.push(profile.email)
  if (profile?.emergency_contact_1_email) emails.push(profile.emergency_contact_1_email)
  if (profile?.emergency_contact_2_email) emails.push(profile.emergency_contact_2_email)
  return emails
}

export default function CountryRisk({ country, tripName, profile }) {
  const [risk, setRisk] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notified, setNotified] = useState(false)

  const sendNotification = async (riskData) => {
    const recipients = getRecipients(profile)
    if (!recipients.length) return
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'country_risk',
          recipients,
          data: { ...riskData, tripName, travelerName: profile?.full_name || profile?.email || 'Traveler' },
        }),
      })
      setNotified(true)
    } catch {}
  }

  const check = async () => {
    setLoading(true)
    setError(null)
    setNotified(false)
    try {
      const result = await getCountryRisk(country)
      setRisk(result)
      if (['Critical', 'High'].includes(result.severity)) {
        await sendNotification(result)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (error) return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-xs text-red-600">{error}</span>
      <button onClick={check} className="text-xs text-[#1B3A6B] hover:underline">Retry</button>
    </div>
  )

  if (!risk) return (
    <button onClick={check} disabled={loading}
      className="mt-1 inline-flex items-center gap-1.5 text-xs text-[#1B3A6B] font-medium hover:underline disabled:opacity-60">
      {loading
        ? <div className="w-3 h-3 border border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
        : <Globe size={11} />}
      {loading ? `Checking ${country} risk…` : `Check ${country} risk`}
    </button>
  )

  const config = SEVERITY_CONFIG[risk.severity] ?? SEVERITY_CONFIG['Unknown']

  return (
    <div className="mt-1 flex items-center gap-2 flex-wrap">
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${config.color}`}>
        <Shield size={10} />
        {risk.severity} — {config.label}
      </span>
      {risk.sources?.map(s => (
        <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-[#1B3A6B] transition-colors">
          {s.name} <ExternalLink size={9} />
        </a>
      ))}
      {notified && (
        <span className="inline-flex items-center gap-1 text-xs text-green-600">
          <Bell size={10} /> Contacts notified
        </span>
      )}
      <button onClick={check} disabled={loading} title="Refresh"
        className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
        <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  )
}
