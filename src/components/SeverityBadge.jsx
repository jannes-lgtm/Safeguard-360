export default function SeverityBadge({ severity }) {
  const styles = {
    Critical: { bg: '#FEF2F2', color: '#B91C1C', dot: '#EF4444', border: '#FECACA' },
    High:     { bg: '#FFF7ED', color: '#C2410C', dot: '#F97316', border: '#FED7AA' },
    Medium:   { bg: '#FEFCE8', color: '#A16207', dot: '#EAB308', border: '#FEF08A' },
    Low:      { bg: '#F0FDF4', color: '#15803D', dot: '#22C55E', border: '#BBF7D0' },
  }

  const s = styles[severity] || styles.Low

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
      {severity}
    </span>
  )
}
