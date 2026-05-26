import { useState } from 'react'
import { DS } from '../../lib/ds'

export default function OpsInput({ as = 'input', label, style = {}, ...props }) {
  const [focused, setFocused] = useState(false)
  const Tag = as
  return (
    <div>
      {label && (
        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: DS.textSub, marginBottom: 6 }}>
          {label}
        </label>
      )}
      <Tag
        style={{
          background: DS.surface,
          border: `1px solid ${focused ? 'rgba(170,204,0,0.35)' : 'rgba(255,255,255,0.09)'}`,
          color: DS.text,
          borderRadius: 6,
          fontSize: 13,
          outline: 'none',
          padding: '10px 14px',
          width: '100%',
          ...style,
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
    </div>
  )
}
