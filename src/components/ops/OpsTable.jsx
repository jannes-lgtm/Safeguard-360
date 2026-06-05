import { DS } from '../../lib/ds'

/**
 * Operational table — dark surfaces, subtle separators, restrained hover.
 *
 * Usage:
 *   <OpsTable
 *     columns={[{ key: 'name', label: 'Name', width: 200 }, ...]}
 *     rows={data}
 *     onRowClick={row => ...}
 *     emptyText="No records found"
 *     loading={false}
 *   />
 */
export default function OpsTable({
  columns = [],
  rows = [],
  onRowClick,
  emptyText = 'No data',
  loading = false,
  stickyHeader = false,
}) {
  return (
    <div style={{
      background:   DS.surface,
      border:       `1px solid ${DS.border}`,
      borderRadius: 6,
      overflow:     'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width:           '100%',
          borderCollapse: 'collapse',
          fontSize:        12,
        }}>
          <thead>
            <tr style={{
              background:  DS.bgAlt,
              position:    stickyHeader ? 'sticky' : 'static',
              top:         0,
              zIndex:      stickyHeader ? 1 : 'auto',
            }}>
              {columns.map(col => (
                <th
                  key={col.key}
                  style={{
                    padding:       '9px 14px',
                    textAlign:     col.align || 'left',
                    fontSize:      10,
                    fontWeight:    700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color:         DS.textMuted,
                    borderBottom:  `1px solid ${DS.border}`,
                    whiteSpace:    'nowrap',
                    width:         col.width || 'auto',
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} style={{
                  padding:   '28px 16px',
                  textAlign: 'center',
                  color:     DS.textMuted,
                  fontSize:  12,
                }}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{
                  padding:   '28px 16px',
                  textAlign: 'center',
                  color:     DS.textMuted,
                  fontSize:  12,
                }}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.id || i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{
                    borderBottom:  `1px solid ${DS.divider}`,
                    cursor:        onRowClick ? 'pointer' : 'default',
                    transition:    'background 0.1s',
                  }}
                  onMouseEnter={onRowClick ? e => {
                    e.currentTarget.style.background = DS.surfaceHi
                  } : undefined}
                  onMouseLeave={onRowClick ? e => {
                    e.currentTarget.style.background = 'transparent'
                  } : undefined}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      style={{
                        padding:    '10px 14px',
                        color:      col.muted ? DS.textSub : DS.text,
                        textAlign:  col.align || 'left',
                        fontSize:   col.small ? 11 : 12,
                        whiteSpace: col.nowrap ? 'nowrap' : 'normal',
                      }}
                    >
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
