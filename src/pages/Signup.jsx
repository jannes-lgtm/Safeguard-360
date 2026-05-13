import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Eye, EyeOff, Building2, UserPlus, CheckCircle2, User } from 'lucide-react'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const inputClass = 'w-full border border-gray-300 rounded-[6px] px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent'
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5'

export default function Signup() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('token')

  // tab: 'org' | 'solo' | 'invite'
  const [tab, setTab] = useState(inviteToken ? 'invite' : 'org')

  // shared
  const [fullName,  setFullName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [showPass,  setShowPass]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [done,      setDone]      = useState(false)

  // new-org tab
  const [companyName, setCompanyName] = useState('')
  const [country,     setCountry]     = useState('')

  // invite tab
  const [inviteData, setInviteData] = useState(null)   // { org_id, org_name, email, role }
  const [inviteError, setInviteError] = useState('')

  // Fetch invite details on load
  useEffect(() => {
    if (!inviteToken) return
    fetch(`/api/accept-invite?token=${encodeURIComponent(inviteToken)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setInviteError(data.error); return }
        setInviteData(data)
        setEmail(data.email || '')
      })
      .catch(() => setInviteError('Could not load invite details. Please check the link.'))
  }, [inviteToken])

  // ── New organisation signup ───────────────────────────────────────────────
  const handleOrgSignup = async (e) => {
    e.preventDefault()
    setError('')
    if (!companyName.trim()) { setError('Please enter your company name.'); return }
    setLoading(true)

    try {
      const res = await fetch('/api/org-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          full_name:    fullName.trim(),
          company_name: companyName.trim(),
          country:      country.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong.')

      setDone(true)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Solo / individual signup ──────────────────────────────────────────────
  const handleSoloSignup = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName.trim(), role: 'solo' },
        },
      })
      if (authErr) throw new Error(authErr.message)

      fetch('/api/notify-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName.trim(), email, role: 'solo' }),
      }).catch(() => {})

      setDone(true)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Invite acceptance signup ──────────────────────────────────────────────
  const handleInviteSignup = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const signupEmail = inviteData?.email || email
    if (!signupEmail) { setError('Please enter your email address.'); setLoading(false); return }

    try {
      // 1. Sign up — trigger will set org_id + role from metadata
      const { error: authErr } = await supabase.auth.signUp({
        email:    signupEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role:      inviteData?.role || 'traveller',
            org_id:    inviteData?.org_id || null,
          },
        },
      })

      if (authErr) throw new Error(authErr.message)

      // 2. Mark invite as accepted + notify admin (fire-and-forget)
      fetch('/api/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inviteToken }),
      }).catch(() => {})

      fetch('/api/notify-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName.trim(), email: inviteData.email, role: inviteData.role || 'traveller' }),
      }).catch(() => {})

      setDone(true)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: `${BRAND_GREEN}30` }}>
            <CheckCircle2 size={28} style={{ color: BRAND_BLUE }} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Check your email</h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            We sent a confirmation link to <strong>{email || inviteData?.email}</strong>.
            Click it to activate your account and sign in.
          </p>
          <Link to="/login"
            className="inline-block w-full py-2.5 rounded-[6px] text-sm font-semibold text-center"
            style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
            Go to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      {/* Left column */}
      <div className="hidden md:flex w-1/2 flex-col justify-center px-12 py-16" style={{ background: BRAND_BLUE }}>
        <div className="mb-10">
          <img src="/logo-transparent.png" alt="Safeguard 360" className="h-20 w-auto" />
        </div>
        <h1 className="text-white text-4xl font-bold leading-tight mb-4">
          Protecting your people,<br />wherever they are.
        </h1>
        <p className="text-blue-200 text-lg mb-10 leading-relaxed">
          Duty of care and travel risk management for pan-African operations.
        </p>
        <div className="space-y-4">
          {[
            'Real-time risk alerts for every destination',
            'ISO 31000 compliance tracking',
            'SOS & emergency response tools',
            'AI-powered country risk briefs',
          ].map(f => (
            <div key={f} className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: BRAND_GREEN }} />
              <span className="text-white/80 text-sm">{f}</span>
            </div>
          ))}
        </div>
        <div className="mt-16 w-12 h-0.5 rounded-full" style={{ background: BRAND_GREEN }} />
      </div>

      {/* Right column */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white overflow-y-auto">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex md:hidden mb-8">
            <img src="/logo-transparent.png" alt="Safeguard 360" className="h-8 w-auto"
              style={{ filter: 'brightness(0) saturate(100%) invert(7%) sepia(96%) saturate(5187%) hue-rotate(231deg) brightness(89%) contrast(115%)' }} />
          </div>

          {/* Tab switcher — only show if no invite token */}
          {!inviteToken && (
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-7">
              <button onClick={() => setTab('org')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  tab === 'org' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}>
                <Building2 size={13} /> Organisation
              </button>
              <button onClick={() => setTab('solo')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  tab === 'solo' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}>
                <User size={13} /> Individual
              </button>
              <button onClick={() => setTab('invite')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  tab === 'invite' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}>
                <UserPlus size={13} /> Invite
              </button>
            </div>
          )}

          {/* ── Solo tab ── */}
          {tab === 'solo' && (
            <form onSubmit={handleSoloSignup} className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Individual sign up</h2>
              <p className="text-gray-500 text-sm -mt-3 mb-2">For solo travellers not linked to an organisation.</p>

              <div>
                <label className={labelClass}>Full name</label>
                <input className={inputClass} placeholder="Jane Smith" value={fullName}
                  onChange={e => setFullName(e.target.value)} required />
              </div>

              <div>
                <label className={labelClass}>Email address</label>
                <input className={inputClass} type="email" placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} required />
              </div>

              <div>
                <label className={labelClass}>Password</label>
                <div className="relative">
                  <input className={inputClass} type={showPass ? 'text' : 'password'}
                    placeholder="Min. 8 characters" value={password}
                    onChange={e => setPassword(e.target.value)} required minLength={8} />
                  <button type="button" onClick={() => setShowPass(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-[6px] px-3 py-2">{error}</p>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-[6px] text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
                {loading
                  ? <><div className="w-4 h-4 border-2 border-[#0118A1] border-t-transparent rounded-full animate-spin" /> Creating account…</>
                  : 'Create Account'}
              </button>

              <p className="text-xs text-gray-400 text-center">
                By signing up you agree to our{' '}
                <Link to="/terms" className="text-[#0118A1] hover:underline">Terms & Conditions</Link>.
              </p>
            </form>
          )}

          {/* ── Invite tab ── */}
          {tab === 'invite' && (
            <>
              {inviteError ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                  <p className="text-sm text-red-700 font-medium">{inviteError}</p>
                  <p className="text-xs text-red-500 mt-1">Ask your admin to resend the invite link.</p>
                </div>
              ) : inviteToken && !inviteData ? (
                <div className="flex items-center gap-2 text-gray-400 mb-6 text-sm">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                  Loading invite…
                </div>
              ) : inviteData ? (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5">
                  <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider mb-0.5">Invited by</p>
                  <p className="text-sm font-bold text-gray-900">{inviteData.org_name}</p>
                  <p className="text-xs text-gray-500 capitalize">Role: {inviteData.role === 'org_admin' ? 'Company Administrator' : 'Traveller'}</p>
                </div>
              ) : null}

              {!inviteError && (
                <form onSubmit={handleInviteSignup} className="flex flex-col gap-4">
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">Accept your invite</h2>
                  <p className="text-gray-500 text-sm -mt-3 mb-2">Create your account to get started.</p>

                  <div>
                    <label className={labelClass}>Full name</label>
                    <input className={inputClass} placeholder="Jane Smith" value={fullName}
                      onChange={e => setFullName(e.target.value)} required />
                  </div>

                  <div>
                    <label className={labelClass}>Email address</label>
                    {inviteData?.email ? (
                      <input className={`${inputClass} bg-gray-50 cursor-not-allowed`}
                        type="email" value={inviteData.email}
                        readOnly disabled />
                    ) : (
                      <input className={inputClass}
                        type="email" placeholder="you@company.com"
                        value={email} onChange={e => setEmail(e.target.value)} required />
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Password</label>
                    <div className="relative">
                      <input className={inputClass} type={showPass ? 'text' : 'password'}
                        placeholder="Min. 8 characters" value={password}
                        onChange={e => setPassword(e.target.value)} required minLength={8} />
                      <button type="button" onClick={() => setShowPass(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-[6px] px-3 py-2">{error}</p>
                  )}

                  <button type="submit" disabled={loading}
                    className="w-full py-2.5 rounded-[6px] text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
                    {loading
                      ? <><div className="w-4 h-4 border-2 border-[#0118A1] border-t-transparent rounded-full animate-spin" /> Creating account…</>
                      : 'Accept Invite & Sign Up'}
                  </button>
                </form>
              )}
            </>
          )}

          {/* ── New org tab ── */}
          {tab === 'org' && (
            <form onSubmit={handleOrgSignup} className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Create your organisation</h2>
              <p className="text-gray-500 text-sm -mt-3 mb-2">Set up Safeguard 360 for your company.</p>

              <div>
                <label className={labelClass}>Full name</label>
                <input className={inputClass} placeholder="Jane Smith" value={fullName}
                  onChange={e => setFullName(e.target.value)} required />
              </div>

              <div>
                <label className={labelClass}>Work email</label>
                <input className={inputClass} type="email" placeholder="you@company.com"
                  value={email} onChange={e => setEmail(e.target.value)} required />
              </div>

              <div>
                <label className={labelClass}>Password</label>
                <div className="relative">
                  <input className={inputClass} type={showPass ? 'text' : 'password'}
                    placeholder="Min. 8 characters" value={password}
                    onChange={e => setPassword(e.target.value)} required minLength={8} />
                  <button type="button" onClick={() => setShowPass(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Company Details</p>
                <div className="flex flex-col gap-3">
                  <div>
                    <label className={labelClass}>Company name</label>
                    <input className={inputClass} placeholder="Acme Corporation" value={companyName}
                      onChange={e => setCompanyName(e.target.value)} required />
                  </div>
                  <div>
                    <label className={labelClass}>Country <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input className={inputClass} placeholder="e.g. South Africa" value={country}
                      onChange={e => setCountry(e.target.value)} />
                  </div>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-[6px] px-3 py-2">{error}</p>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-[6px] text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
                {loading
                  ? <><div className="w-4 h-4 border-2 border-[#0118A1] border-t-transparent rounded-full animate-spin" /> Creating account…</>
                  : 'Create Organisation & Sign Up'}
              </button>

              <p className="text-xs text-gray-400 text-center">
                By signing up you agree to our{' '}
                <Link to="/terms" className="text-[#0118A1] hover:underline">Terms & Conditions</Link>.
              </p>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold hover:underline" style={{ color: BRAND_BLUE }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
