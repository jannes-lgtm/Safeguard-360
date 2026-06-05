// Sentry must be initialized before any React code runs
import './lib/sentry.js'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'
import 'leaflet/dist/leaflet.css'

// Remove static preload screen
const pre = document.getElementById('__preload')
if (pre) pre.remove()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary context="App">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
