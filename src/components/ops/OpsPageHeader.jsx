import { DS } from '../../lib/ds'

/**
 * Standardized operational page header.
 *
 * Props:
 *   icon     — Lucide icon component
 *   title    — page title (string)
 *   subtitle — subdued description line (string, optional)
 *   status   — status pill text (string, optional)
 *   statusOk — bool, controls green vs amber status color
 *   actions  — React node, rendered right-aligned
 */
export default function OpsPageHeader({
  icon: Icon,
  title,
  subtitle,
  status,
  statusOk = true,
  actions,
}) {
  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      gap:            16,
      marginBottom:   24,
      flexWrap:       'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {Icon && (
          <div style={{
            width:          36,
            height:         36,
            borderRadius:   6,
            background:     DS.greenDim,
            border:         `1px solid ${DS.green}22`,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            flexShrink:     0,
          }}>
            <Icon size={17} style={{ color: DS.green }} />
          </div>
        )}
        <div>
          <h1 style={{
            fontSize:      18,
            fontWeight:    700,
            color:         DS.white,
            letterSpacing: '-0.02em',
            margin:        0,
            lineHeight:    1.2,
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{
              fontSize:  12,
              color:     DS.textSub,
              margin:    '3px 0 0',
              lineHeight: 1.4,
            }}>
              {subtitle}
            </p>
          )}
        </div>
        {status && (
          <span style={{
            fontSize:      9,
            fontWeight:    700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding:       '3px 9px',
            borderRadius:  3,
            background:    statusOk ? DS.greenDim : DS.amberDim,
            color:         statusOk ? DS.green    : DS.amberText,
            border:        `1px solid ${statusOk ? DS.green + '33' : DS.amberAlt + '44'}`,
            whiteSpace:    'nowrap',
          }}>
            {status}
          </span>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  )
}
