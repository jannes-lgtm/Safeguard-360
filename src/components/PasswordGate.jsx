/**
 * PasswordGate.jsx
 *
 * Platform access gate — validated server-side via /api/gate-auth.
 * The password is NEVER in the client bundle.
 * A signed httpOnly cookie is issued on success, valid for 7 days.
 */

import { useState, useEffect } from 'react'
import { Shield, Lock, Loader } from 'lucide-react'

export default function PasswordGate({ children }) {
  const [status, setStatus] = useState('checking')  // checking | locked | unlocked
  const [input,  setInput]  = useState('')
  const [error,  setError]  = useState(false)
  const [shake,  setShake]  = useState(false)
  const [loading, setLoading] = useState(false)

  // On mount: verify existing cookie server-side
  useEffect(() => {
    fetch('/api/gate-check', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setStatus(d.ok ? 'unlocked' : 'locked'))
      .catch(() => setStatus('locked'))
  }, [])

  if (status === 'checking') {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#080A0F',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Loader size={20} color="#AACC00" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (status === 'unlocked') return children

  async function attempt() {
    if (!input.trim()) return
    setLoading(true)
    setError(false)

    try {
      const res = await fetch('/api/gate-auth', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ password: input }),
      })
      const data = await res.json()

      if (data.ok) {
        setStatus('unlocked')
      } else {
        setError(true)
        setShake(true)
        setInput('')
        setTimeout(() => setShake(false), 600)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#080A0F',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif', zIndex: 9999,
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(170,204,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(170,204,0,0.03) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div style={{
        position: 'relative', width: '100%', maxWidth: 360, padding: '0 24px',
        animation: shake ? 'sg-shake 0.5s ease' : 'none',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(170,204,0,0.08)', border: '1px solid rgba(170,204,0,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
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
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: 28, backdropFilter: 'blur(20px)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Access Code
          </div>

          <div style={{ position: 'relative' }}>
            <Lock size={13} style={{
              position: 'absolute', left: 12, top: '50%',
              transform: 'translateY(-50%)',
              color: error ? '#ef4444' : 'rgba(255,255,255,0.25)',
            }} />
            <input
              type="password"
              value={input}
              onChange={e => { setInput(e.target.value); setError(false) }}
              onKeyDown={e => e.key === 'Enter' && !loading && attempt()}
              autoFocus
              disabled={loading}
              placeholder="Enter access code"
              style={{
                width: '100%', padding: '12px 12px 12px 36px',
                background: error ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 10, color: '#EAEEF5', fontSize: 14, outline: 'none',
                boxSizing: 'border-box', transition: 'border-color 0.15s',
                opacity: loading ? 0.5 : 1,
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
            disabled={loading || !input.trim()}
            style={{
              width: '100%', marginTop: 16, padding: '12px',
              background: loading || !input.trim() ? 'rgba(170,204,0,0.4)' : '#AACC00',
              border: 'none', borderRadius: 10, color: '#0A1628',
              fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loading
              ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Verifying...</>
              : 'Authenticate'
            }
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
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
