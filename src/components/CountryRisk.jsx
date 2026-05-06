import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, ExternalLink, RefreshCw, Globe, Bell, HeartPulse, ChevronRight } from 'lucide-react'

const SEVERITY_CONFIG = {
  'Critical': { color: 'text-red-700 bg-red-100 border-red-200',       label: 'Do Not Travel'       },
  'High':     { color: 'text-amber-700 bg-amber-100 border-amber-200', label: 'Reconsider Travel'   },
  'Medium':   { color: 'text-yellow-700 bg-yellow-100 border-yellow-200', label: 'Exercise Caution' },
  'Low':      { color: 'text-green-700 bg-green-100 border-green-200', label: 'Normal Precautions'  },
  'Unknown':  { color: 'text-gray-600 bg-gray-100 border-gray-200',    label: 'No advisory data'    },
}

function getRecipients(profile) {
  const emails = []
  if (profile?.email)                       emails.push(profile.email)
  if (profile?.emergency_contact_1_email)   emails.push(profile.emergency_contact_1_email)
  if (profile?.emergency_contact_2_email)   emails.push(profile.emergency_contact_2_email)
  return emails
}

export default function CountryRisk({ country, tripName, profile }) {
  const navigate  = useNavigate()
  const [risk,     setRisk]     = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
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
      // Use the server-side country-risk API — it includes health outbreaks,
      // GDACS disasters, USGS seismic, FCDO advisory and AI synthesis
      const r = await fetch(`/api/country-risk?country=${encodeURIComponent(country)}`)
      if (!r.ok) throw new Error(`Risk check failed (${r.status})`)
      const result = await r.json()
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

  const config       = SEVERITY_CONFIG[risk.severity] ?? SEVERITY_CONFIG['Unknown']
  const healthAlerts = (risk.sources || []).filter(s => s.category === 'health')
  const advisories   = (risk.sources || []).filter(s => !s.category)
  const latestNews   = risk.latest_health_news || []

  return (
    <div className="mt-2 space-y-2">

      {/* ── Severity badge + advisory links ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${config.color}`}>
          <Shield size={10} />
          {risk.severity} — {config.label}
        </span>

        {advisories.map(s => (
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

        <button onClick={check} disabled={loading} title="Refresh risk data"
          className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Travel health advisories — destination-specific only ── */}
      {healthAlerts.length > 0 && (
        <div className="border border-rose-200 bg-rose-50 rounded-[6px] px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <HeartPulse size={11} className="text-rose-600 shrink-0" />
            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">
              Travel Health Advisory — {country}
            </span>
          </div>
          <div className="space-y-1">
            {healthAlerts.slice(0, 2).map((s, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-rose-400 text-[10px] shrink-0 mt-0.5">●</span>
                <p className="text-xs text-rose-800 leading-snug line-clamp-2">
                  <span className="font-semibold">[{s.name}]</span> {s.message}
                </p>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="shrink-0 mt-0.5">
                    <ExternalLink size={9} className="text-rose-400 hover:text-rose-700" />
                  </a>
                )}
              </div>
            ))}
            {healthAlerts.length > 2 && (
              <p className="text-[10px] text-rose-500 pl-3">+{healthAlerts.length - 2} more alerts</p>
            )}
          </div>
        </div>
      )}

      {/* ── Latest global health news ── */}
      {latestNews.length > 0 && (
        <div className="border border-gray-100 bg-gray-50 rounded-[6px] px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Latest Health News</span>
          </div>
          <div className="space-y-1">
            {latestNews.map((item, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-gray-300 text-[10px] shrink-0 mt-0.5">●</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600 leading-snug line-clamp-2">
                    <span className="font-semibold text-gray-500">[{item.source}]</span> {item.title}
                  </p>
                </div>
                {item.link && (
                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="shrink-0 mt-0.5">
                    <ExternalLink size={9} className="text-gray-300 hover:text-gray-500" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Link to full report ── */}
      <button
        onClick={() => navigate(`/country-risk?country=${encodeURIComponent(country)}`)}
        className="inline-flex items-center gap-1 text-xs text-[#0118A1] hover:underline font-medium">
        View full risk report <ChevronRight size={10} />
      </button>
    </div>
  )
}
