import { DS } from '../../lib/ds'

/**
 * Operational button system.
 *
 * variant: 'primary' | 'secondary' | 'danger' | 'ghost'
 * size:    'sm' | 'md' | 'lg'
 */
export default function OpsButton({
  children,
  variant = 'secondary',
  size = 'md',
  onClick,
  disabled,
  type = 'button',
  icon: Icon,
  fullWidth,
  style: extraStyle,
  ...props
}) {
  const pad = size === 'sm' ? '5px 12px' : size === 'lg' ? '10px 24px' : '7px 16px'
  const fs  = size === 'sm' ? 11 : size === 'lg' ? 13 : 12

  const base = {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
    padding:        pad,
    borderRadius:   4,
    fontSize:       fs,
    fontWeight:     700,
    letterSpacing:  '0.06em',
    textTransform:  'uppercase',
    cursor:         disabled ? 'not-allowed' : 'pointer',
    transition:     'all 0.15s',
    whiteSpace:     'nowrap',
    width:          fullWidth ? '100%' : undefined,
    opacity:        disabled ? 0.45 : 1,
    border:         'none',
    outline:        'none',
    ...extraStyle,
  }

  const variants = {
    primary: {
      background: DS.green,
      color:      DS.bg,
    },
    secondary: {
      background: 'transparent',
      color:      DS.textSub,
      border:     `1px solid ${DS.border}`,
    },
    danger: {
      background: DS.redDim,
      color:      DS.redText,
      border:     `1px solid rgba(138,46,46,0.35)`,
    },
    ghost: {
      background: 'transparent',
      color:      DS.textMuted,
      border:     'none',
    },
  }

  const hoverMap = {
    primary:   { background: '#BBDD00', color: DS.bg },
    secondary: { background: DS.surfaceHi, borderColor: DS.borderHi, color: DS.text },
    danger:    { background: 'rgba(138,46,46,0.22)', color: '#F08080' },
    ghost:     { color: DS.textSub },
  }

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{ ...base, ...variants[variant] }}
      onMouseEnter={e => {
        if (!disabled) Object.assign(e.currentTarget.style, hoverMap[variant])
      }}
      onMouseLeave={e => {
        if (!disabled) Object.assign(e.currentTarget.style, variants[variant])
      }}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 12 : 14} />}
      {children}
    </button>
  )
}
