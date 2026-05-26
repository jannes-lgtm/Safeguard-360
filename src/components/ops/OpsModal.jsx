import { useEffect } from 'react'
import { X } from 'lucide-react'
import { DS } from '../../lib/ds'

/**
 * Operational modal — dark overlay, contained surface.
 *
 * Props:
 *   open    — bool
 *   onClose — fn
 *   title   — string
 *   width   — px (default 520)
 *   children
 */
export default function OpsModal({ open, onClose, title, width = 520, children }) {
  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      style={{
        position:        'fixed',
        inset:           0,
        zIndex:          1000,
        background:      'rgba(9,10,12,0.80)',
        backdropFilter:  'blur(4px)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        padding:         16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div style={{
        width:     '100%',
        maxWidth:  width,
        maxHeight: 'calc(100vh - 40px)',
        background: DS.surface,
        border:    `1px solid ${DS.borderHi}`,
        borderRadius: 8,
        overflow:  'hidden',
        display:   'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '14px 20px',
          borderBottom:   `1px solid ${DS.border}`,
          flexShrink:     0,
        }}>
          <h2 style={{
            margin:        0,
            fontSize:      14,
            fontWeight:    700,
            color:         DS.white,
            letterSpacing: '-0.01em',
          }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              color:      DS.textMuted,
              padding:    4,
              display:    'flex',
              borderRadius: 4,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = DS.textSub }}
            onMouseLeave={e => { e.currentTarget.style.color = DS.textMuted }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding:    '20px',
          overflowY:  'auto',
          flex:       1,
          scrollbarWidth: 'thin',
          scrollbarColor: `${DS.border} transparent`,
        }}>
          {children}
        </div>
      </div>
    </div>
  )
}
