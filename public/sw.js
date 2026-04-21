// Bumping this name invalidates every user's cached HTML. MUST bump on every
// deploy that ships new /_next/static/chunks/* hashes — which is every deploy.
// Auto-bumping via build would be nicer; until then, bump by hand if you hit
// a stale-HTML blackout.
const CACHE_NAME = 'signallab-v5'
const APP_SHELL = ['/']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

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
    // a page that references chunks that no longer exist.
    event.respondWith(fetch(req).catch(() => caches.match(req)))
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
