import { useState, useEffect } from 'react'
import { Shield, Lock } from 'lucide-react'

const SESSION_KEY = 'sg360_access'
const PASSWORD    = import.meta.env.VITE_APP_PASSWORD

export default function PasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(false)
  const [input,    setInput]    = useState('')
  const [error,    setError]    = useState(false)
  const [shake,    setShake]    = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === '1') setUnlocked(true)
  }, [])

  // If no password configured, skip the gate entirely
  if (!PASSWORD) return children

  if (unlocked) return children

  function attempt() {
    if (input === PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, '1')
      setUnlocked(true)
    } else {
      setError(true)
      setShake(true)
      setInput('')
      setTimeout(() => setShake(false), 600)
    }
  }

  return (
    <div
      style={{
        position:        'fixed',
        inset:           0,
        background:      '#080A0F',
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        justifyContent:  'center',
        fontFamily:      'system-ui, sans-serif',
        zIndex:          9999,
      }}
    >
      {/* Background grid */}
      <div style={{
        position:   'absolute',
        inset:      0,
        backgroundImage: 'linear-gradient(rgba(170,204,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(170,204,0,0.03) 1px, transparent 1px)',
        backgroundSize:  '48px 48px',
        pointerEvents:   'none',
      }} />

      <div
        style={{
          position:     'relative',
          width:        '100%',
          maxWidth:     360,
          padding:      '0 24px',
          animation:    shake ? 'sg-shake 0.5s ease' : 'none',
        }}
      >
        {/* Logo area */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width:          56,
            height:         56,
            borderRadius:   '50%',
            background:     'rgba(170,204,0,0.08)',
            border:         '1px solid rgba(170,204,0,0.2)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            margin:         '0 auto 16px',
          }}>
            <Shield size={24} color="#AACC00" />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#EAEEF5', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            SafeGuard 360
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Restricted Access
          </div>
        </div>

        {/* Card */}
        <div style={{
          background:    'rgba(255,255,255,0.03)',
          border:        '1px solid rgba(255,255,255,0.08)',
          borderRadius:  16,
          padding:       28,
          backdropFilter:'blur(20px)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Access Code
          </div>

          <div style={{ position: 'relative' }}>
            <Lock size={13} style={{
              position: 'absolute', left: 12, top: '50%',
              transform: 'translateY(-50%)', color: error ? '#ef4444' : 'rgba(255,255,255,0.25)',
            }} />
            <input
              type="password"
              value={input}
              onChange={e => { setInput(e.target.value); setError(false) }}
              onKeyDown={e => e.key === 'Enter' && attempt()}
              autoFocus
              placeholder="Enter access code"
              style={{
                width:        '100%',
                padding:      '12px 12px 12px 36px',
                background:   error ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.05)',
                border:       `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 10,
                color:        '#EAEEF5',
                fontSize:     14,
                outline:      'none',
                boxSizing:    'border-box',
                transition:   'border-color 0.15s',
              }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 11, color: '#ef4444', marginTop: 8 }}>
              Incorrect access code. Try again.
            </div>
          )}

          <button
            onClick={attempt}
            style={{
              width:        '100%',
              marginTop:    16,
              padding:      '12px',
              background:   '#AACC00',
              border:       'none',
              borderRadius: 10,
              color:        '#0A1628',
              fontSize:     13,
              fontWeight:   700,
              cursor:       'pointer',
              letterSpacing:'0.06em',
              textTransform:'uppercase',
              transition:   'opacity 0.15s',
            }}
            onMouseEnter={e => e.target.style.opacity = '0.85'}
            onMouseLeave={e => e.target.style.opacity = '1'}
          >
            Authenticate
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 10, color: 'rgba(255,255,255,0.12)', letterSpacing: '0.08em' }}>
          SAFEGUARD 360 · OPERATIONAL PLATFORM · CONFIDENTIAL
        </div>
      </div>

      <style>{`
        @keyframes sg-shake {
          0%,100% { transform: translateX(0) }
          20%      { transform: translateX(-8px) }
          40%      { transform: translateX(8px) }
          60%      { transform: translateX(-6px) }
          80%      { transform: translateX(6px) }
        }
      `}</style>
    </div>
  )
}
