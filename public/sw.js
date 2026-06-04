// SafeGuard360 Service Worker — cache disabled, self-unregistering
// Clears all caches and unregisters itself so stale SW doesn't serve
// old assets. Re-enable caching once blank-page issue is resolved.

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((c) => c.navigate(c.url)))
  )
})
