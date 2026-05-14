import { Component } from 'react'
import { log } from '../lib/logger'

/**
 * SafeGuard360 — Global Error Boundary
 *
 * Catches React render errors that would otherwise produce a blank white screen.
 * Wraps the entire app in App.jsx — also used around high-risk sections.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 *
 *   // With custom context label:
 *   <ErrorBoundary context="LiveMap">
 *     <LiveMap />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    log.error('UI', 'render_crash', {
      context:    this.props.context || 'App',
      message:    error?.message,
      stack:      error?.stack?.split('\n').slice(0, 5).join(' | '),
      component:  info?.componentStack?.split('\n').slice(0, 3).join(' | '),
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    // Full-screen fallback — never a white screen
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-[12px] shadow-sm border border-gray-200 max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-500 mb-6">
            An unexpected error occurred. This has been logged. Please refresh the page to continue.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="bg-[#0118A1] text-white text-sm font-semibold px-5 py-2.5 rounded-[6px] hover:bg-[#010e7a] transition-colors"
            >
              Reload page
            </button>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/dashboard' }}
              className="border border-gray-300 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-[6px] hover:bg-gray-50 transition-colors"
            >
              Go to dashboard
            </button>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <details className="mt-6 text-left">
              <summary className="text-xs text-gray-400 cursor-pointer">Error details (dev only)</summary>
              <pre className="mt-2 text-xs text-red-600 bg-red-50 p-3 rounded overflow-auto max-h-40">
                {this.state.error.message}
                {'\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    )
  }
}
