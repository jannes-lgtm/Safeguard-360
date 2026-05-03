import { useEffect, useState } from 'react'
import { Zap, ZapOff } from 'lucide-react'

const STAGE_COLORS = {
  0: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', dot: 'bg-green-500' },
  1: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', dot: 'bg-yellow-400' },
  2: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  3: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', dot: 'bg-orange-500' },
  4: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', dot: 'bg-red-500' },
}

function getColors(stage) {
  if (stage >= 4) return STAGE_COLORS[4]
  return STAGE_COLORS[stage] ?? STAGE_COLORS[0]
}

export default function LoadSheddingBanner({ className = '' }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/loadshedding')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return null
  if (!data) return null

  const stage = data.stage ?? 0
  const c = getColors(stage)
  const Icon = stage === 0 ? Zap : ZapOff

  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-[8px] border ${c.bg} ${c.border} ${className}`}>
      <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${c.dot} mt-1.5`} />
      <div className="flex-1 min-w-0">
        <div className={`flex items-center gap-2 font-semibold text-sm ${c.text}`}>
          <Icon size={14} />
          Eskom Load Shedding — {data.message}
        </div>
        {data.nextOutage && (
          <p className={`text-xs mt-0.5 ${c.text} opacity-80`}>
            Next outage: {data.nextOutage.window} on {data.nextOutage.date}
          </p>
        )}
        {stage === 0 && (
          <p className={`text-xs mt-0.5 ${c.text} opacity-70`}>South Africa power supply stable</p>
        )}
      </div>
      <a
        href="https://loadshedding.eskom.co.za"
        target="_blank"
        rel="noopener noreferrer"
        className={`text-xs font-medium ${c.text} opacity-70 hover:opacity-100 shrink-0 mt-0.5`}
      >
        Eskom →
      </a>
    </div>
  )
}
