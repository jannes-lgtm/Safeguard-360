// SG360 boot diagnostics — loaded before the main module bundle.
// Catches any error that kills the bundle before React can render.
// Remove after crash is identified.
(function () {
  var S = 'position:fixed;top:0;left:0;right:0;z-index:99999;'
        + 'background:#0a0c10;color:#aacc00;font:13px/1.6 monospace;'
        + 'padding:14px 16px;max-height:60vh;overflow-y:auto;'
        + 'border-bottom:2px solid #aacc00;'

  var box = document.createElement('div')
  box.id  = '__boot_diag'
  box.style.cssText = S + 'display:none;'
  document.body.appendChild(box)

  function show() { box.style.display = 'block' }

  function line(msg, color) {
    var d = document.createElement('div')
    d.style.color = color || '#aacc00'
    d.textContent = msg
    box.appendChild(d)
    show()
  }

  // Expose so main.jsx can also write to this overlay
  window.__bootDiag = { line: line }

  // ── Catch uncaught script errors (including module parse failures) ──────────
  window.onerror = function (msg, src, row, col, err) {
    line('✗ ERROR: ' + msg, '#ef7474')
    line('  at ' + src + ':' + row + ':' + col, '#ef7474')
    if (err && err.stack) {
      err.stack.split('\n').slice(0, 5).forEach(function (l) {
        line('  ' + l.trim(), '#ef7474')
      })
    }
    return false
  }

  // ── Catch unhandled promise rejections ─────────────────────────────────────
  window.addEventListener('unhandledrejection', function (e) {
    var msg = (e.reason && e.reason.message) ? e.reason.message : String(e.reason)
    line('✗ Unhandled rejection: ' + msg, '#ef7474')
    if (e.reason && e.reason.stack) {
      e.reason.stack.split('\n').slice(0, 4).forEach(function (l) {
        line('  ' + l.trim(), '#ef7474')
      })
    }
  })

  // ── Catch module script load failures (net error, CORS, CSP block) ─────────
  window.addEventListener('error', function (e) {
    if (e.target && (e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK')) {
      line('✗ Resource failed to load: ' + (e.target.src || e.target.href), '#ef7474')
    }
  }, true /* capture phase */)

  line('✓ boot.js loaded — watchers active', '#6e7480')
})()
