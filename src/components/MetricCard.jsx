import { Link } from 'react-router-dom'
import { DS } from '../lib/ds'

/**
 * Operational metric card.
 * Always dark. Restrained accent usage.
 */
export default function MetricCard({
  label,
  value,
  valueColor,
  icon: Icon,
  subtitle,
  accent,
  to,
  onClick,
}) {
  const accentColor = accent || DS.green
  const interactive = to || onClick

  const inner = (
    <div
      style={{
        position:   'relative',
        background: DS.surface,
        border:     `1px solid ${DS.border}`,
        borderRadius: 6,
        padding:    '16px 18px',
        display:    'flex',
        flexDirection: 'column',
        gap:        10,
        overflow:   'hidden',
        transition: 'border-color 0.15s, background 0.15s',
        cursor:     interactive ? 'pointer' : 'default',
      }}
      onMouseEnter={e => {
        if (interactive) {
          e.currentTarget.style.borderColor = DS.borderHi
          e.currentTarget.style.background  = DS.surfaceHi
        }
      }}
      onMouseLeave={e => {
        if (interactive) {
          e.currentTarget.style.borderColor = DS.border
          e.currentTarget.style.background  = DS.surface
        }
      }}
    >
      {/* Accent top bar */}
      <div style={{
        position:     'absolute',
        top: 0, left: 0, right: 0,
        height:       2,
        borderRadius: '6px 6px 0 0',
        background:   accentColor,
        opacity:      0.7,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize:      10,
          fontWeight:    700,
          letterSpacing: '0.13em',
          textTransform: 'uppercase',
          color:         DS.textMuted,
        }}>
          {label}
        </span>
        {Icon && (
          <div style={{
            width:        30,
            height:       30,
            borderRadius: 4,
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            background:   `${accentColor}18`,
          }}>
            <Icon size={14} style={{ color: accentColor }} />
          </div>
        )}
      </div>

      <span style={{
        fontSize:    28,
        fontWeight:  700,
        letterSpacing: '-0.02em',
        color:       valueColor || DS.white,
        lineHeight:  1,
      }}>
        {value}
      </span>

      {subtitle && (
        <span style={{
          fontSize:  11,
          color:     DS.textSub,
          marginTop: -4,
        }}>
          {subtitle}
        </span>
      )}

      {interactive && (
        <span style={{
          fontSize:      9,
          fontWeight:    700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color:         DS.textMuted,
          marginTop:     2,
        }}>
          View →
        </span>
      )}
    </div>
  )

  if (to)      return <Link to={to} style={{ textDecoration: 'none' }}>{inner}</Link>
  if (onClick) return <button onClick={onClick} style={{ textAlign: 'left', width: '100%', background: 'none', border: 'none', padding: 0 }}>{inner}</button>
  return inner
}
