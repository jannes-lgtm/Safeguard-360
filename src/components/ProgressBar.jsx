export default function ProgressBar({ label, value, showLabel = true }) {
  const color =
    value >= 80 ? 'bg-green-500' :
    value >= 50 ? 'bg-amber-500' :
    'bg-gray-400'

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm text-gray-700 truncate pr-2">{label}</span>
          <span className="text-sm font-semibold text-gray-800 shrink-0">{value}%</span>
        </div>
      )}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}
