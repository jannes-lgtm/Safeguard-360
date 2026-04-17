export default function MetricCard({ label, value, valueColor = 'text-gray-900', icon: Icon, subtitle }) {
  return (
    <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
        {Icon && <Icon size={18} className="text-gray-400" />}
      </div>
      <span className={`text-3xl font-bold ${valueColor}`}>{value}</span>
      {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
    </div>
  )
}
