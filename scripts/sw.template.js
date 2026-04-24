// SOURCE OF TRUTH for the service worker. Do NOT edit public/sw.js directly —
// that file is generated at build time by scripts/generate-sw.mjs which
// replaces __SW_VERSION__ with the current git short SHA. That guarantees
// every deploy invalidates stale HTML/chunk caches automatically (no more
// hand-bumping CACHE_NAME and shipping blackouts when we forget).
//
// The generated public/sw.js is gitignored.
const CACHE_NAME = 'signallab-__SW_VERSION__'
const API_CACHE = 'signallab-api-__SW_VERSION__'
const APP_SHELL = ['/', '/offline.html']

// API routes that are safe to serve stale when offline. These are read-only
// reads that power the home/tour/broadcast surfaces. We NEVER cache writes
// or auth-sensitive endpoints — keep this allow-list tight.
const OFFLINE_SAFE_API = [
  '/api/gigs',
  '/api/notifications',
  '/api/tasks',
  '/api/guest-list',
  '/api/scheduled-posts',
  '/api/today',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

// Let the page tell us to activate immediately (layout.tsx posts this on
// `updatefound` so a fresh deploy takes over without the user reloading twice).
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

// Web Push — dataless notifications. The server POSTs to our push endpoint
// with no body (see src/lib/vapid.ts), we wake, fetch the queued payload
// from /api/notifications/next, and surface it. Fetching the content here
// (instead of packing it into the push body) avoids aes128gcm encryption
// that doesn't cleanly run in Workers.
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload = null
    // Some push services deliver real payloads (Chrome Android, etc). If we
    // ever switch to encrypted payloads we'll already parse them here.
    if (event.data) {
      try { payload = event.data.json() } catch { payload = { title: event.data.text() } }
    }
    if (!payload) {
      try {
        const res = await fetch('/api/notifications/next', { credentials: 'include' })
        if (res.ok) payload = await res.json()
      } catch {}
    }
    if (!payload || !payload.title) {
      // Fallback so the UA doesn't show a generic "This site was updated in
      // the background" notification (which it will if we don't show ANY).
      payload = { title: 'Signal Lab', body: 'New activity', href: '/' }
    }
    await self.registration.showNotification(payload.title, {
      body: payload.body || '',
      icon: payload.icon || '/icon-192.png',
      badge: payload.badge || '/icon-192.png',
      tag: payload.tag,
      data: { href: payload.href || '/' },
    })
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const href = (event.notification.data && event.notification.data.href) || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of all) {
      // If an existing tab for our origin is open, focus + navigate rather
      // than opening a duplicate.
      if ('focus' in client) {
        try { await client.navigate(href) } catch {}
        return client.focus()
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(href)
  })())
})

self.addEventListener('activate', event => {
  const keep = new Set([CACHE_NAME, API_CACHE])
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

function isOfflineSafeApi(url) {
  if (url.origin !== self.location.origin) return false
  return OFFLINE_SAFE_API.some(p => url.pathname === p || url.pathname.startsWith(p + '/'))
}

// Network-first for navigation + HTML + RSC responses. These reference
// versioned chunk filenames, so a cached copy from a previous deploy points
// at chunks that no longer exist — the whole site goes blank. Cache-first is
// fine for static assets (their own filename is content-hashed), but NEVER
// for HTML.
self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  const accept = req.headers.get('accept') || ''
  const isNavigation =
    req.mode === 'navigate' ||
    accept.includes('text/html') ||
    // Next.js RSC payload requests — also reference chunk hashes
    url.searchParams.has('_rsc') ||
    req.headers.has('RSC')

  if (isNavigation) {
    // Pure network. Never serve stale HTML/RSC from cache — doing so serves
    // a page that references chunks that no longer exist. On hard offline,
    // fall back to the branded offline page rather than the browser error.
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(req).then(hit => hit || caches.match('/offline.html'))
      )
    )
    return
  }

  // Offline-safe API reads: network-first, fall back to last-good JSON. This
  // is what makes /today usable on a train or at a venue with dead signal.
  // We only cache on successful responses so an error page doesn't poison
  // the cache.
  if (isOfflineSafeApi(url)) {
    event.respondWith(
      fetch(req)
        .then(response => {
          if (response && response.ok) {
            const clone = response.clone()
            caches.open(API_CACHE).then(cache => cache.put(req, clone)).catch(() => {})
          }
          return response
        })
        .catch(() => caches.match(req))
    )
    return
  }

  // Static assets: stale-while-revalidate is fine. Filenames are content-
  // hashed so cache keys are unique per build.
  event.respondWith(
    fetch(req)
      .then(response => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {})
        return response
      })
      .catch(() => caches.match(req))
  )
})
