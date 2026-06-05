import { DS, sev } from '../lib/ds'
import SeverityBadge from './SeverityBadge'

/**
 * Operational alert card — dark surfaces, muted left-border accent.
 * No white or light backgrounds.
 */
export default function AlertCard({ alert }) {
  const s = sev(alert.severity)
  const isResolved = alert.status === 'Resolved'

  return (
    <div
      style={{
        background:   DS.surface,
        border:       `1px solid ${DS.border}`,
        borderLeft:   `3px solid ${s.bar}`,
        borderRadius: 6,
        padding:      '12px 16px',
        opacity:      isResolved ? 0.55 : 1,
        transition:   'opacity 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Severity dot */}
        <div style={{
          width:        7,
          height:       7,
          borderRadius: '50%',
          background:   s.dot,
          marginTop:    5,
          flexShrink:   0,
        }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 600, color: DS.white, fontSize: 13 }}>
              {alert.title}
            </span>
            <SeverityBadge severity={alert.severity} />
            {isResolved && (
              <span style={{
                display:       'inline-flex',
                alignItems:    'center',
                padding:       '2px 8px',
                borderRadius:  3,
                fontSize:      9,
                fontWeight:    700,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                background:    DS.greenDim,
                color:         DS.green,
                border:        `1px solid ${DS.green}33`,
              }}>
                Resolved
              </span>
            )}
          </div>

          <div style={{ fontSize: 11, color: DS.textSub, marginBottom: 6 }}>
            {alert.country} &bull; {alert.date_issued}
          </div>

          <p style={{ fontSize: 13, color: DS.text, lineHeight: 1.55, margin: 0 }}>
            {alert.description}
          </p>
        </div>
      </div>
    </div>
  )
}
