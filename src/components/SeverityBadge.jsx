import { sev } from '../lib/ds'

/**
 * Operational severity badge — dark background, muted tones.
 * No white or light backgrounds.
 */
export default function SeverityBadge({ severity, size = 'sm' }) {
  const s = sev(severity)
  const small = size === 'sm'

  return (
    <span
      style={{
        display:       'inline-flex',
        alignItems:    'center',
        gap:           5,
        padding:       small ? '2px 8px' : '3px 10px',
        borderRadius:  3,
        fontSize:      small ? 9 : 10,
        fontWeight:    700,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        background:    s.bg,
        color:         s.text,
        border:        `1px solid ${s.border}`,
        whiteSpace:    'nowrap',
      }}
    >
      <span style={{
        width: 5, height: 5,
        borderRadius: '50%',
        background: s.dot,
        flexShrink: 0,
      }} />
      {severity}
    </span>
  )
}
