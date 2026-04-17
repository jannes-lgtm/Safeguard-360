import SeverityBadge from './SeverityBadge'

const severityDot = {
  Critical: 'bg-red-500',
  High: 'bg-amber-500',
  Medium: 'bg-yellow-400',
  Low: 'bg-gray-400',
}

const severityBorder = {
  Critical: 'border-l-red-500',
  High: 'border-l-orange-500',
  Medium: 'border-l-yellow-400',
  Low: 'border-l-gray-300',
}

export default function AlertCard({ alert }) {
  const isCritical = alert.severity === 'Critical'
  const isResolved = alert.status === 'Resolved'

  return (
    <div
      className={`
        bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)]
        border-l-4 ${severityBorder[alert.severity] || 'border-l-gray-300'}
        p-4 transition-opacity
        ${isCritical ? 'bg-[#FEF2F2]' : ''}
        ${isResolved ? 'opacity-60' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${severityDot[alert.severity] || 'bg-gray-400'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-semibold text-gray-900 text-sm">{alert.title}</span>
              <SeverityBadge severity={alert.severity} />
              {isResolved && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                  Resolved
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 mb-1">
              {alert.country} &bull; {alert.date_issued}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{alert.description}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
