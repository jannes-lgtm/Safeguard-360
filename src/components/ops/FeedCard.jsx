import { DS, sev } from '../../lib/ds'
import SeverityBadge from '../SeverityBadge'

/**
 * Live feed card — compact, designed for dense feed lists.
 * Used in LiveRiskFeed, NewsUpdates, IntelFeeds.
 *
 * Props:
 *   title    — string
 *   body     — string (optional, truncated)
 *   severity — string
 *   tags     — string[] (optional)
 *   meta     — string (e.g. 'Reuters · 14m ago')
 *   onClick  — fn
 *   unread   — bool
 */
export default function FeedCard({
  title,
  body,
  severity,
  tags = [],
  meta,
  onClick,
  unread = false,
}) {
  const s = sev(severity)

  return (
    <div
      onClick={onClick}
      style={{
        background:   unread ? DS.surfaceHi : DS.surface,
        border:       `1px solid ${unread ? DS.borderHi : DS.border}`,
        borderLeft:   `2px solid ${severity ? s.bar : DS.border}`,
        borderRadius: 5,
        padding:      '10px 14px',
        cursor:       onClick ? 'pointer' : 'default',
        transition:   'border-color 0.12s, background 0.12s',
      }}
      onMouseEnter={onClick ? e => {
        e.currentTarget.style.background    = DS.surfaceHi
        e.currentTarget.style.borderColor   = DS.borderHi
        e.currentTarget.style.borderLeftColor = severity ? s.bar : DS.borderHi
      } : undefined}
      onMouseLeave={onClick ? e => {
        e.currentTarget.style.background    = unread ? DS.surfaceHi : DS.surface
        e.currentTarget.style.borderColor   = unread ? DS.borderHi : DS.border
        e.currentTarget.style.borderLeftColor = severity ? s.bar : DS.border
      } : undefined}
    >
      {/* Title row */}
      <div style={{
        display:        'flex',
        alignItems:     'flex-start',
        justifyContent: 'space-between',
        gap:            10,
        marginBottom:   body ? 5 : 6,
      }}>
        <span style={{
          fontSize:   12,
          fontWeight: 600,
          color:      DS.white,
          lineHeight: 1.4,
          flex:       1,
        }}>
          {unread && (
            <span style={{
              display:      'inline-block',
              width:         6,
              height:        6,
              borderRadius: '50%',
              background:    DS.green,
              marginRight:   7,
              verticalAlign: 'middle',
              marginTop:    -1,
            }} />
          )}
          {title}
        </span>
        {severity && <SeverityBadge severity={severity} />}
      </div>

      {/* Body */}
      {body && (
        <p style={{
          fontSize:    12,
          color:       DS.textSub,
          lineHeight:  1.5,
          margin:      '0 0 7px',
          display:     '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow:    'hidden',
        }}>
          {body}
        </p>
      )}

      {/* Footer */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        8,
        flexWrap:   'wrap',
      }}>
        {tags.map(tag => (
          <span key={tag} style={{
            fontSize:      9,
            fontWeight:    700,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            padding:       '1px 6px',
            borderRadius:  3,
            background:    `rgba(255,255,255,0.04)`,
            color:         DS.textMuted,
            border:        `1px solid ${DS.border}`,
          }}>
            {tag}
          </span>
        ))}
        {meta && (
          <span style={{
            marginLeft: 'auto',
            fontSize:   10,
            color:      DS.textMuted,
            whiteSpace: 'nowrap',
          }}>
            {meta}
          </span>
        )}
      </div>
    </div>
  )
}
