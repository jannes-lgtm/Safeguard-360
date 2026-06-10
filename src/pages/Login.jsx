import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, AlertTriangle, Shield, PhoneCall } from 'lucide-react'
import { supabase } from '../lib/supabase'

const C = {
  bg:       '#090A0C',
  surface:  '#11131A',
  border:   'rgba(255,255,255,0.07)',
  borderHi: 'rgba(255,255,255,0.12)',
  accent:   '#AACC00',
  text:     '#EAEEF5',
  textSub:  '#6E7480',
  textMuted:'#3C4050',
  red:      '#A83535',
  redDim:   'rgba(168,53,53,0.12)',
  green:    '#4A7055',
  greenDim: 'rgba(74,112,85,0.12)',
}

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [resetSent, setResetSent]     = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message || 'Incorrect email or password. Please try again.')
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  const handleForgotPassword = async () => {
    if (!email) { setError('Please enter your email address first.'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/send-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      if (!res.ok) throw new Error('Failed')
      setResetSent(true)
    } catch {
      setError('Could not send reset email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'Inter, sans-serif', background: C.bg }}>

      {/* ── Left panel ─────────────────────────────────────────────── */}
      <div style={{
        display: 'none',
        width: '50%', flexDirection: 'column', justifyContent: 'center',
        padding: '64px 56px',
        background: '#0C0E12',
        borderRight: `1px solid ${C.border}`,
      }} className="md-left-panel">
        <style>{`.md-left-panel { display: none } @media (min-width: 768px) { .md-left-panel { display: flex !important } }`}</style>

        <Link to="/" style={{ display: 'inline-block', marginBottom: 48 }}>
          <img src="/logo-transparent.png" alt="SafeGuard360" style={{ height: 66, width: 'auto' }} />
        </Link>

        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: C.textMuted, textTransform: 'uppercase', marginBottom: 20 }}>
          Operational Movement Intelligence
        </div>

        <h1 style={{ fontSize: 36, fontWeight: 700, color: C.text, lineHeight: 1.15, marginBottom: 16, letterSpacing: '-0.02em' }}>
          Know where your people are.<br />
          <span style={{ color: C.accent }}>Keep them moving safely.</span>
        </h1>

        <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.75, marginBottom: 48, maxWidth: 380 }}>
          Travel risk management and live situational awareness for organizations operating in complex, high-risk environments.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { icon: AlertTriangle, text: 'Real-time risk alerts and movement advisories' },
            { icon: Shield,        text: 'ISO 31000 duty of care compliance' },
            { icon: PhoneCall,     text: '24/7 emergency response and escalation' },
          ].map(({ icon: Icon, text }, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: 'rgba(170,204,0,0.08)', border: '1px solid rgba(170,204,0,0.15)',
              }}>
                <Icon size={14} color={C.accent} />
              </div>
              <span style={{ fontSize: 13, color: C.textSub }}>{text}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 56, width: 40, height: 2, background: C.accent, opacity: 0.6 }} />
      </div>

      {/* ── Right panel — form ──────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', background: C.bg }}>
        <div style={{ width: '100%', maxWidth: 360 }}>

          {/* Mobile logo */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 36 }} className="mobile-logo">
            <style>{`.mobile-logo { display: flex } @media (min-width: 768px) { .mobile-logo { display: none } }`}</style>
            <img src="/logo-transparent.png" alt="SafeGuard360" style={{ height: 56, width: 'auto' }} />
          </div>

          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 6, letterSpacing: '-0.01em' }}>Welcome back</h2>
            <p style={{ fontSize: 13, color: C.textSub }}>Sign in to your Safeguard portal</p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.textMuted, marginBottom: 8 }}>
                Email address
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@company.com"
                style={{
                  width: '100%', background: C.surface, border: `1px solid ${C.border}`,
                  color: C.text, fontSize: 14, padding: '10px 14px', outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = C.borderHi}
                onBlur={e => e.target.style.borderColor = C.border}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.textMuted, marginBottom: 8 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="••••••••"
                  style={{
                    width: '100%', background: C.surface, border: `1px solid ${C.border}`,
                    color: C.text, fontSize: 14, padding: '10px 40px 10px 14px', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = C.borderHi}
                  onBlur={e => e.target.style.borderColor = C.border}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', padding: 0, display: 'flex' }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ fontSize: 12, color: C.red, background: C.redDim, border: `1px solid rgba(168,53,53,0.25)`, padding: '10px 14px' }}>
                {error}
              </div>
            )}

            {resetSent && (
              <div style={{ fontSize: 12, color: '#5E8C6A', background: C.greenDim, border: '1px solid rgba(74,112,85,0.25)', padding: '10px 14px' }}>
                Password reset email sent. Please check your inbox.
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', background: C.accent, border: 'none', color: '#090A0C',
              fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '13px', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {loading ? (
                <>
                  <div style={{ width: 14, height: 14, border: '2px solid #090A0C', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Signing in...
                </>
              ) : 'Sign in'}
            </button>
          </form>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button onClick={handleForgotPassword}
              style={{ background: 'none', border: 'none', fontSize: 12, color: C.textSub, cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.color = C.text}
              onMouseLeave={e => e.currentTarget.style.color = C.textSub}
            >Forgot your password?</button>
          </div>

          <div style={{ marginTop: 24, paddingTop: 24, borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: C.textSub }}>
              New to Safeguard?{' '}
              <Link to="/signup" style={{ color: C.accent, fontWeight: 600, textDecoration: 'none' }}>
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
