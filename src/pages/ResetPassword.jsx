import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [done,      setDone]      = useState(false)
  const [validSession, setValidSession] = useState(false)

  useEffect(() => {
    // Supabase parses the token from the URL hash automatically
    // when the page loads — just check we have a session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setValidSession(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setValidSession(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.'); return
    }
    if (password !== confirm) {
      setError('Passwords do not match.'); return
    }

    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      setError(err.message || 'Failed to update password. The link may have expired.')
      setSaving(false)
      return
    }

    setDone(true)
    setTimeout(() => navigate('/dashboard'), 2500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#F0F2F8' }}>
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src="/logo-colour.png" alt="SafeGuard360" className="h-10 w-auto" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-50" style={{ background: `${BRAND_BLUE}08` }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: BRAND_BLUE }}>
                <Lock size={18} color="white" />
              </div>
              <div>
                <h1 className="font-bold text-gray-900">Set New Password</h1>
                <p className="text-xs text-gray-400 mt-0.5">Choose a strong password for your account</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {done ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 size={40} style={{ color: '#059669' }} />
                <p className="font-bold text-gray-900">Password updated!</p>
                <p className="text-sm text-gray-400">Redirecting you to the dashboard…</p>
              </div>
            ) : !validSession ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <AlertTriangle size={36} className="text-amber-400" />
                <p className="font-bold text-gray-900">Invalid or expired link</p>
                <p className="text-sm text-gray-400 mb-3">
                  This password reset link has expired or already been used.
                </p>
                <button onClick={() => navigate('/login')}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ background: BRAND_BLUE }}>
                  Back to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      required
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent bg-white"
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Confirm New Password
                  </label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat your new password"
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent bg-white"
                  />
                </div>

                {/* Strength hints */}
                {password.length > 0 && (
                  <ul className="text-xs space-y-1">
                    {[
                      { ok: password.length >= 8,          label: 'At least 8 characters' },
                      { ok: /[A-Z]/.test(password),        label: 'One uppercase letter' },
                      { ok: /[0-9]/.test(password),        label: 'One number' },
                      { ok: confirm === password && !!confirm, label: 'Passwords match' },
                    ].map(r => (
                      <li key={r.label} className="flex items-center gap-1.5"
                        style={{ color: r.ok ? '#059669' : '#94A3B8' }}>
                        <CheckCircle2 size={11} /> {r.label}
                      </li>
                    ))}
                  </ul>
                )}

                {error && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    <AlertTriangle size={14} className="shrink-0" /> {error}
                  </div>
                )}

                <button type="submit" disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                  style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
                  {saving
                    ? <><Loader2 size={15} className="animate-spin" /> Updating…</>
                    : <><CheckCircle2 size={15} /> Update Password</>}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
