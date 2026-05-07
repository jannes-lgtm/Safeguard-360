import { useEffect, useState } from 'react'

const W3W_RED = '#E11B1B'

export default function W3WAddress({ lat, lng, showMap = true, className = '' }) {
  const [words, setWords]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const latNum = Number(lat)
  const lngNum = Number(lng)

  useEffect(() => {
    if (!latNum || !lngNum) return
    const apiKey = import.meta.env.VITE_W3W_API_KEY
    if (!apiKey || apiKey === 'your_w3w_api_key_here') return

    setLoading(true)
    setError(null)

    fetch(`https://api.what3words.com/v3/convert-to-3wa?coordinates=${latNum},${lngNum}&key=${apiKey}`)
      .then(r => r.json())
      .then(data => {
        if (data?.words) {
          setWords(data.words)
        } else {
          setError(data?.error?.message || 'No result')
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [latNum, lngNum])

  if (!latNum || !lngNum) return null

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {/* W3W row */}
      <div className="flex items-center gap-2 flex-wrap">
        {loading && (
          <span className="text-[11px] text-gray-400 animate-pulse flex items-center gap-1">
            <W3WIcon /> resolving…
          </span>
        )}
        {!loading && words && (
          <a
            href={`https://what3words.com/${words}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-bold hover:opacity-75 transition-opacity"
            style={{ color: W3W_RED }}
          >
            <W3WIcon />
            ///{words}
          </a>
        )}
        {!loading && !words && !error && (
          <span className="text-[11px] text-gray-400 font-mono">
            {latNum.toFixed(5)}, {lngNum.toFixed(5)}
          </span>
        )}

        {/* Always show Google Maps link */}
        {showMap && (
          <a
            href={`https://www.google.com/maps?q=${latNum},${lngNum}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-[#0118A1] hover:underline"
          >
            Google Maps ↗
          </a>
        )}
      </div>

      {/* Coords always visible */}
      <span className="text-[10px] text-gray-300 font-mono">
        {latNum.toFixed(6)}, {lngNum.toFixed(6)}
      </span>
    </div>
  )
}

function W3WIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="8" fill="#E11B1B"/>
      <text x="50" y="72" textAnchor="middle" fill="white" fontSize="64" fontWeight="bold" fontFamily="Arial">///</text>
    </svg>
  )
}
