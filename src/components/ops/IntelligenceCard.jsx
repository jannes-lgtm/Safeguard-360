import { DS, sev, risk } from '../../lib/ds'
import SeverityBadge from '../SeverityBadge'

/**
 * Intelligence / threat feed card.
 * Used for country risk items, CAIRO intel, live feed entries.
 *
 * Props:
 *   title       — string
 *   summary     — string
 *   severity    — 'Critical' | 'High' | 'Medium' | 'Low' | 'Info'
 *   country     — string
 *   region      — string (optional)
 *   type        — string (e.g. 'Security', 'Weather')
 *   source      — string (optional attribution)
 *   age         — string (e.g. '2h ago')
 *   confidence  — number 0–1 (optional)
 *   onClick     — fn
 *   verified    — bool
 */
export default function IntelligenceCard({
  title,
  summary,
  severity,
  country,
  region,
  type,
  source,
  age,
  confidence,
  onClick,
  verified,
}) {
  const s = sev(severity)

  return (
    <div
      onClick={onClick}
      style={{
        background:   DS.surface,
        border:       `1px solid ${DS.border}`,
        borderLeft:   `3px solid ${s.bar}`,
        borderRadius: 6,
        padding:      '12px 16px',
        cursor:       onClick ? 'pointer' : 'default',
        transition:   'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={onClick ? e => {
        e.currentTarget.style.borderColor = DS.borderHi
        e.currentTarget.style.background  = DS.surfaceHi
      } : undefined}
      onMouseLeave={onClick ? e => {
        e.currentTarget.style.borderColor = DS.border
        e.currentTarget.style.borderLeftColor = s.bar
        e.currentTarget.style.background  = DS.surface
      } : undefined}
    >
      {/* Top row */}
      <div style={{
        display:        'flex',
        alignItems:     'flex-start',
        justifyContent: 'space-between',
        gap:            12,
        marginBottom:   8,
      }}>
        <span style={{
          fontSize:    13,
          fontWeight:  600,
          color:       DS.white,
          lineHeight:  1.35,
          flex:        1,
        }}>
          {title}
        </span>
        {severity && <SeverityBadge severity={severity} />}
      </div>

      {/* Summary */}
      {summary && (
        <p style={{
          fontSize:    12,
          color:       DS.text,
          lineHeight:  1.55,
          margin:      '0 0 10px',
        }}>
          {summary}
        </p>
      )}

      {/* Meta row */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        flexWrap:   'wrap',
        gap:        10,
      }}>
        {country && (
          <span style={{ fontSize: 11, color: DS.textSub }}>
            {[country, region].filter(Boolean).join(' · ')}
          </span>
        )}
        {type && (
          <span style={{
            fontSize:      9,
            fontWeight:    700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            padding:       '2px 7px',
            borderRadius:  3,
            background:    DS.steelDim,
            color:         DS.steelText,
            border:        `1px solid ${DS.steel}33`,
          }}>
            {type}
          </span>
        )}
        {verified && (
          <span style={{
            fontSize:      9,
            fontWeight:    700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            padding:       '2px 7px',
            borderRadius:  3,
            background:    DS.greenDim,
            color:         DS.green,
            border:        `1px solid ${DS.green}33`,
          }}>
            Verified
          </span>
        )}
        {confidence !== undefined && (
          <span style={{ fontSize: 11, color: DS.textMuted }}>
            {Math.round(confidence * 100)}% confidence
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: DS.textMuted }}>
          {[source, age].filter(Boolean).join(' · ')}
        </span>
      </div>
    </div>
  )
}
