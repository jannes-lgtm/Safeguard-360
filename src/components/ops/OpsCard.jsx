import { DS } from '../../lib/ds'

/**
 * Base operational surface card.
 * Use this as the foundation for all cards in the platform.
 *
 * Props:
 *   accent  — top-border color (hex). Omit for no accent bar.
 *   padded  — adds standard content padding (default true)
 *   elevated — uses surfaceHi background
 *   interactive — adds hover state
 */
export default function OpsCard({
  children,
  accent,
  padded = true,
  elevated = false,
  interactive = false,
  onClick,
  style: extraStyle,
  className,
}) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        position:     'relative',
        background:   elevated ? DS.surfaceHi : DS.surface,
        border:       `1px solid ${DS.border}`,
        borderRadius: 6,
        padding:      padded ? '16px 20px' : 0,
        overflow:     'hidden',
        cursor:       interactive || onClick ? 'pointer' : 'default',
        transition:   'border-color 0.15s, background 0.15s',
        ...extraStyle,
      }}
      onMouseEnter={interactive || onClick ? e => {
        e.currentTarget.style.borderColor = DS.borderHi
        e.currentTarget.style.background  = DS.surfaceHi
      } : undefined}
      onMouseLeave={interactive || onClick ? e => {
        e.currentTarget.style.borderColor = DS.border
        e.currentTarget.style.background   = elevated ? DS.surfaceHi : DS.surface
      } : undefined}
    >
      {accent && (
        <div style={{
          position:   'absolute',
          top: 0, left: 0, right: 0,
          height:     2,
          background: accent,
          opacity:    0.75,
        }} />
      )}
      {children}
    </div>
  )
}
