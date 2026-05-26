import { BANNER } from '../../lib/ds'

export default function OpsBanner({ variant = 'info', icon, children, style = {} }) {
  const b = BANNER[variant] || BANNER.info
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 14px',
      background: b.bg,
      border: `1px solid ${b.border}`,
      borderRadius: 6,
      fontSize: 12, fontWeight: 600, color: b.text,
      ...style,
    }}>
      {icon && <span style={{ color: b.icon, flexShrink: 0 }}>{icon}</span>}
      <span>{children}</span>
    </div>
  )
}
