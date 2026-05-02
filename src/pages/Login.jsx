import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Shield, MapPin, AlertTriangle, PhoneCall } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetSent, setResetSent] = useState(false)

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
    if (!email) {
      setError('Please enter your email address first.')
      return
    }
    setError('')
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (resetError) {
      setError('Could not send reset email. Please check your email address.')
    } else {
      setResetSent(true)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left column — navy */}
      <div className="hidden md:flex w-1/2 bg-[#1E2461] flex-col justify-center px-12 py-16">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <img src="/logo.svg" alt="SafeGuard360" className="w-11 h-11" />
          <span className="text-white font-bold text-xl tracking-tight">SafeGuard360</span>
        </div>

        <h1 className="text-white text-4xl font-bold leading-tight mb-4">
          Protecting your people,<br />wherever they are.
        </h1>
        <p className="text-blue-300 text-lg mb-12 leading-relaxed">
          Duty of care and travel risk management for pan-African operations.
        </p>

        {/* Feature points */}
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <AlertTriangle size={16} className="text-white" />
            </div>
            <span className="text-white text-sm font-medium">Real-time risk alerts</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <Shield size={16} className="text-white" />
            </div>
            <span className="text-white text-sm font-medium">ISO 31000 compliance</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <PhoneCall size={16} className="text-white" />
            </div>
            <span className="text-white text-sm font-medium">24/7 emergency response</span>
          </div>
        </div>
      </div>

      {/* Right column — login form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex md:hidden items-center gap-2 mb-8">
            <img src="/logo.svg" alt="SafeGuard360" className="w-8 h-8" />
            <span className="font-bold text-lg text-[#1E2461]">SafeGuard360</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h2>
          <p className="text-gray-500 text-sm mb-8">Sign in to your SafeGuard360 portal</p>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                className="w-full border border-gray-300 rounded-[6px] px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E2461] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full border border-gray-300 rounded-[6px] px-3 py-2.5 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E2461] focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-[6px] px-3 py-2">
                {error}
              </p>
            )}

            {resetSent && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-[6px] px-3 py-2">
                Password reset email sent. Please check your inbox.
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#AACC00] hover:bg-[#99bb00] text-[#0118A1] font-semibold py-2.5 rounded-[6px] text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </>
              ) : 'Sign in'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={handleForgotPassword}
              className="text-sm text-[#2563EB] hover:underline"
            >
              Forgot your password?
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
