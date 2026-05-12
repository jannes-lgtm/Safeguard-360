import { Link } from 'react-router-dom'

export default function MetricCard({ label, value, valueColor = 'text-gray-900', icon: Icon, subtitle, accent, to, onClick, dark = false }) {
  const tint = accent || '#0118A1'
  const interactive = to || onClick

  const inner = (
    <div
      className={`relative rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200 overflow-hidden ${interactive ? 'hover:-translate-y-0.5 hover:shadow-lg cursor-pointer' : ''}`}
      style={{
        background: dark ? '#111827' : '#FFFFFF',
        boxShadow: dark ? '0 2px 16px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        border: dark ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl" style={{ background: tint, opacity: dark ? 0.9 : 0.7 }} />

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: dark ? 'rgba(255,255,255,0.35)' : '#9CA3AF' }}>{label}</span>
        {Icon && (
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${tint}${dark ? '22' : '12'}` }}>
            <Icon size={15} style={{ color: tint }} />
          </div>
        )}
      </div>

      <span className={`text-3xl font-bold tracking-tight ${valueColor}`}>{value}</span>

      {subtitle && <span className="text-xs -mt-1" style={{ color: dark ? 'rgba(255,255,255,0.3)' : '#9CA3AF' }}>{subtitle}</span>}

      {interactive && (
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: dark ? 'rgba(255,255,255,0.2)' : '#D1D5DB' }}>View →</span>
      )}
    </div>
  )

  if (to) return <Link to={to}>{inner}</Link>
  if (onClick) return <button onClick={onClick} className="text-left w-full">{inner}</button>
  return inner
}
