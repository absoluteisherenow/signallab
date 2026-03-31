/**
 * aiCache — shared client-side cache for expensive AI responses.
 *
 * Wraps localStorage with TTL, versioned keys, and a single write/read
 * interface. Prevents re-calling Claude on every navigation — keeps the
 * product feeling instant while keeping API costs down.
 *
 * Usage:
 *   import { aiCache } from '@/lib/aiCache'
 *
 *   // Write
 *   aiCache.set('signallab', { trends: [...], captions: {...} })
 *
 *   // Read (returns {} if missing or expired)
 *   const cache = aiCache.get('signallab')
 *
 *   // Invalidate one namespace (e.g. after user changes data)
 *   aiCache.invalidate('signallab')
 *
 *   // Patch (merge into existing cache)
 *   aiCache.patch('signallab', { trends: [...] })
 */

// TTLs per namespace (ms)
const TTL: Record<string, number> = {
  signallab: 12 * 60 * 60 * 1000,   // 12 hours — trends + captions
  sonix:      6 * 60 * 60 * 1000,   //  6 hours — reference intel
  setlab:    24 * 60 * 60 * 1000,   // 24 hours — track intelligence
}

const DEFAULT_TTL = 8 * 60 * 60 * 1000  // 8 hours fallback

// Cache schema version — bump if structure changes to force-invalidate all
const CACHE_VERSION = 2

function storageKey(ns: string): string {
  return `aicache_v${CACHE_VERSION}_${ns}`
}

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

export const aiCache = {
  /** Read cached data for a namespace. Returns {} if missing, expired, or wrong version. */
  get(ns: string): Record<string, unknown> {
    if (!isBrowser()) return {}
    try {
      const raw = localStorage.getItem(storageKey(ns))
      if (!raw) return {}
      const parsed = JSON.parse(raw) as Record<string, unknown> & { _ts?: number }
      const ttl = TTL[ns] ?? DEFAULT_TTL
      if (!parsed._ts || Date.now() - (parsed._ts as number) > ttl) {
        localStorage.removeItem(storageKey(ns))
        return {}
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _ts, ...rest } = parsed
      return rest
    } catch {
      return {}
    }
  },

  /** Write (replace) the cache for a namespace. Stamps current time as _ts. */
  set(ns: string, data: Record<string, unknown>): void {
    if (!isBrowser()) return
    try {
      localStorage.setItem(storageKey(ns), JSON.stringify({ ...data, _ts: Date.now() }))
    } catch {
      // Quota exceeded or private mode — silently skip
    }
  },

  /** Merge new fields into the existing cache (preserves unrelated keys). */
  patch(ns: string, patch: Record<string, unknown>): void {
    if (!isBrowser()) return
    try {
      const existing = this.get(ns)
      this.set(ns, { ...existing, ...patch })
    } catch {}
  },

  /** Remove the cache entry for a namespace entirely. */
  invalidate(ns: string): void {
    if (!isBrowser()) return
    try {
      localStorage.removeItem(storageKey(ns))
    } catch {}
  },

  /** Check whether a specific key exists and is non-empty in the cache. */
  has(ns: string, key: string): boolean {
    const cache = this.get(ns)
    const val = cache[key]
    if (val === null || val === undefined) return false
    if (Array.isArray(val)) return val.length > 0
    if (typeof val === 'object') return Object.keys(val as object).length > 0
    return Boolean(val)
  },
}
