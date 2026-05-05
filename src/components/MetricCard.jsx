export default function MetricCard({ label, value, valueColor = 'text-gray-900', icon: Icon, subtitle, accent }) {
  // accent: hex colour used for the icon bg tint and top border
  const tint = accent || '#0118A1'

  return (
    <div
      className="relative bg-white rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 overflow-hidden"
      style={{
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        border: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      {/* Subtle top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
        style={{ background: tint, opacity: 0.7 }}
      />

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{label}</span>
        {Icon && (
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: `${tint}12` }}
          >
            <Icon size={15} style={{ color: tint }} />
          </div>
        )}
      </div>

      <span className={`text-3xl font-bold tracking-tight ${valueColor}`}>{value}</span>

      {subtitle && <span className="text-xs text-gray-400 -mt-1">{subtitle}</span>}
    </div>
  )
}
