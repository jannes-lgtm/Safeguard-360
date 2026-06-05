import { DS, sev, risk } from '../../lib/ds'

/**
 * Operational status badge. Replaces all light-background status pills.
 *
 * variant: 'severity' | 'risk' | 'status' | 'tag' | 'accent' | 'steel' | 'amber' | 'red'
 */
export default function OpsBadge({ children, variant = 'tag', severity, size = 'sm' }) {
  const small = size === 'sm'
  const pad   = small ? '2px 7px' : '3px 10px'
  const fs    = small ? 9 : 10

  let style = {}

  if (variant === 'severity' && severity) {
    const s = sev(severity)
    style = { background: s.bg, color: s.text, border: `1px solid ${s.border}` }
  } else if (variant === 'risk' && severity) {
    const r = risk(severity)
    style = { background: r.bg, color: r.color, border: `1px solid ${r.border}` }
  } else if (variant === 'accent') {
    style = { background: DS.greenDim, color: DS.green, border: `1px solid ${DS.green}33` }
  } else if (variant === 'steel') {
    style = { background: DS.steelDim, color: DS.steelText, border: `1px solid ${DS.steel}33` }
  } else if (variant === 'amber') {
    style = { background: DS.amberDim, color: DS.amberText, border: `1px solid ${DS.amber}44` }
  } else if (variant === 'red') {
    style = { background: DS.redDim, color: DS.redText, border: `1px solid ${DS.red}44` }
  } else {
    // tag / default
    style = {
      background: 'rgba(255,255,255,0.04)',
      color:      DS.textMuted,
      border:     `1px solid ${DS.border}`,
    }
  }

  return (
    <span style={{
      display:       'inline-flex',
      alignItems:    'center',
      padding:       pad,
      borderRadius:  3,
      fontSize:      fs,
      fontWeight:    700,
      letterSpacing: '0.09em',
      textTransform: 'uppercase',
      whiteSpace:    'nowrap',
      ...style,
    }}>
      {children}
    </span>
  )
}
