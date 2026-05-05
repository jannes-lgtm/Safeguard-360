const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

export default function ProgressBar({ label, value, showLabel = true }) {
  // Colour based on completion
  const barColor =
    value >= 80 ? BRAND_GREEN :
    value >= 50 ? BRAND_BLUE  :
    '#94A3B8'   // slate for low

  const textColor =
    value >= 80 ? '#3F6212' :
    value >= 50 ? BRAND_BLUE :
    '#64748B'

  return (
    <div className="w-full group">
      {showLabel && (
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-medium text-gray-700 truncate pr-3 leading-snug">{label}</span>
          <span className="text-xs font-bold shrink-0 tabular-nums" style={{ color: textColor }}>
            {value}%
          </span>
        </div>
      )}
      {/* Track */}
      <div className="w-full h-1.5 rounded-full" style={{ background: '#EEF0F6' }}>
        {/* Fill */}
        <div
          className="h-1.5 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${value}%`, background: barColor }}
        />
      </div>
    </div>
  )
}
