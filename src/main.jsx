import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'
import 'leaflet/dist/leaflet.css'

// ── Startup diagnostics ───────────────────────────────────────────────────────
// Writes a visible overlay to the page so any boot failure shows on screen
// instead of a blank page. Remove this block once the crash is identified.

const _diag = (() => {
  const box = document.createElement('div')
  box.id = '__sg360_diag'
  box.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
    'background:#0a0c10', 'color:#aacc00', 'font:13px/1.6 monospace',
    'padding:16px', 'max-height:50vh', 'overflow-y:auto',
    'border-bottom:2px solid #aacc00', 'display:none',
  ].join(';')
  document.body.appendChild(box)

  let _shown = false
  const show = () => { if (!_shown) { box.style.display = 'block'; _shown = true } }

  return {
    step(msg) {
      const line = document.createElement('div')
      line.style.color = '#aacc00'
      line.textContent = `✓ ${msg}`
      box.appendChild(line)
    },
    error(msg) {
      show()
      const line = document.createElement('div')
      line.style.color = '#ef7474'
      line.textContent = `✗ ${msg}`
      box.appendChild(line)
    },
    env(key, val) {
      const line = document.createElement('div')
      line.style.color = '#6e7480'
      line.textContent = `  ${key}: ${val}`
      box.appendChild(line)
    },
    hide() { box.remove() },
  }
})()

// ── Global uncaught error handler ─────────────────────────────────────────────
window.onerror = (msg, src, line, col, err) => {
  _diag.error(`window.onerror: ${msg}`)
  _diag.error(`  at ${src}:${line}:${col}`)
  if (err?.stack) _diag.error(`  ${err.stack.split('\n').slice(0,3).join(' | ')}`)
}

window.addEventListener('unhandledrejection', (e) => {
  _diag.error(`Unhandled promise rejection: ${e.reason?.message || e.reason}`)
  if (e.reason?.stack) _diag.error(`  ${e.reason.stack.split('\n').slice(0,3).join(' | ')}`)
})

// ── Environment check ─────────────────────────────────────────────────────────
_diag.step('Bootstrap started')

const _supaUrl  = import.meta.env.VITE_SUPABASE_URL
const _supaKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

_diag.env('VITE_SUPABASE_URL',      _supaUrl  ? _supaUrl.slice(0,40) + '…'  : 'MISSING ⚠️')
_diag.env('VITE_SUPABASE_ANON_KEY', _supaKey  ? _supaKey.slice(0,12) + '…'  : 'MISSING ⚠️')

if (!_supaUrl || !_supaKey) {
  _diag.error('FATAL: Supabase env vars missing — app cannot start')
} else {
  _diag.step('Env vars present')
}

// ── React render ──────────────────────────────────────────────────────────────
try {
  _diag.step('Calling ReactDOM.createRoot')
  const root = ReactDOM.createRoot(document.getElementById('root'))
  _diag.step('Root created — rendering App tree')
  root.render(
    <React.StrictMode>
      <ErrorBoundary context="App">
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )
  _diag.step('render() called — React is running')
  // Hide diagnostics after successful render (slight delay so React can paint)
  setTimeout(() => _diag.hide(), 4000)
} catch (err) {
  _diag.error(`ReactDOM.createRoot / render threw: ${err.message}`)
  if (err.stack) _diag.error(err.stack.split('\n').slice(0, 4).join(' | '))
}

// ── Service worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      _diag.error(`SW registration failed: ${err.message}`)
    })
  })
}
