/**
 * GlobalErrorCatcher — listens for the two browser-level "something slipped
 * through" events and routes them through the classifier so they surface as
 * toasts instead of dying in the console.
 *
 *   unhandledrejection : an async function threw and nobody awaited it
 *                        (or a .catch handler was missing)
 *   error              : a synchronous exception bubbled all the way up
 *
 * Mounted once at the root (layout.tsx). Purely additive — doesn't suppress
 * browser defaults (so React error boundaries / dev overlays still work).
 *
 * Heuristics:
 *   - Dedupe is handled by the toast layer (same message within 3s collapses)
 *   - We preventDefault only in prod, so dev still gets red console errors
 *   - Known-harmless errors (ResizeObserver loop, aborted fetch) are ignored
 */

'use client'

import { useEffect } from 'react'
import { toast } from '@/lib/toast'
import { classifyError } from '@/lib/error-classifier'

// Known-harmless noise that should never surface as a toast.
const IGNORED_PATTERNS = [
  /ResizeObserver loop/i,          // benign Chrome warning
  /Non-Error promise rejection captured/i,
  /Script error\.?$/i,              // cross-origin script errors with no detail
  /AbortError/i,                    // user/code-initiated aborts
  /The user aborted a request/i,
]

function isIgnored(message: string): boolean {
  return IGNORED_PATTERNS.some(p => p.test(message))
}

// Chunk-load failures = browser holding a stale HTML that points at JS
// chunk hashes which no longer exist on the server after a deploy. Without
// this handler the user sees "nothing happens" on every interaction because
// every route-level import silently 404s. Strategy: reload the page ONCE to
// fetch the fresh HTML + chunk map. Guard with sessionStorage so we never
// reload twice in a row (infinite-loop protection).
const RELOAD_FLAG = 'sl_chunk_reload_once'
function isChunkError(message: string): boolean {
  return /ChunkLoadError|Loading chunk .* failed|Loading CSS chunk .* failed|Failed to fetch dynamically imported module/i.test(message)
}
function maybeReloadForStaleBundle(message: string): boolean {
  if (!isChunkError(message)) return false
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return false
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
  } catch {}
  window.location.reload()
  return true
}

export function GlobalErrorCatcher() {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message =
        reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : ''
      if (isIgnored(message)) return
      if (maybeReloadForStaleBundle(message)) return

      const cls = classifyError({ error: reason })
      if (cls.category === 'silent') return

      // Auto-fix candidates get the modal. Everything else gets a toast.
      if (cls.category === 'autofix' && cls.fix) {
        window.dispatchEvent(
          new CustomEvent('signallab:autofix-request', {
            detail: { fix: cls.fix, classification: cls },
          }),
        )
      } else {
        toast.error(cls.message, { title: 'Something broke', duration: 6000 })
      }
    }

    const onError = (event: ErrorEvent) => {
      if (isIgnored(event.message)) return
      if (maybeReloadForStaleBundle(event.message)) return
      const cls = classifyError({ error: event.error ?? event.message })
      if (cls.category === 'silent') return
      // Only surface; don't preventDefault — React dev overlay + prod error
      // pages still need to render.
      toast.error(cls.message, { title: 'Unexpected error', duration: 6000 })
    }

    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('error', onError)
    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('error', onError)
    }
  }, [])

  return null
}
