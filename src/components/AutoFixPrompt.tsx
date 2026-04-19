/**
 * AutoFixPrompt — renders a small modal when the fetcher dispatches an
 * autofix event. Each fix id has a handler that attempts the repair and
 * then invokes the caller's original retry callback.
 *
 * Mounted once at the app root (see layout.tsx).
 *
 * Adding a new fix:
 *   1. Extend AutoFixId in error-classifier.ts
 *   2. Add a classification branch
 *   3. Add a handler entry below with { label, run: async () => ... }
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import {
  AUTOFIX_EVENT,
  type AutoFixRequestDetail,
} from '@/lib/fetcher'
import type { AutoFixId } from '@/lib/error-classifier'

type FixHandler = {
  label: string
  run: () => Promise<{ ok: boolean; message?: string }>
}

const HANDLERS: Record<AutoFixId, FixHandler> = {
  ig_token_expired: {
    label: 'Reconnect Instagram',
    run: async () => {
      // Send user to the existing IG reconnect flow; it's full-page, so we
      // just navigate. If there's a dedicated endpoint later, swap this.
      if (typeof window !== 'undefined') {
        window.location.href = '/settings/integrations?reconnect=instagram'
      }
      return { ok: true, message: 'Opening Instagram reconnect…' }
    },
  },
  stuck_publishing: {
    label: 'Clear stuck state',
    run: async () => {
      try {
        const res = await fetch('/api/social/instagram/clear-stuck', { method: 'POST' })
        if (!res.ok) return { ok: false, message: `Could not clear (${res.status})` }
        return { ok: true, message: 'Cleared — retrying' }
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : 'Network error' }
      }
    },
  },
  r2_transient: {
    label: 'Retry upload',
    run: async () => ({ ok: true, message: 'Retrying…' }),
  },
  supabase_cache_refresh: {
    label: 'Refresh and retry',
    run: async () => {
      // Soft refresh avoids a full page reload for most cases.
      if (typeof window !== 'undefined') {
        window.location.reload()
      }
      return { ok: true, message: 'Refreshing…' }
    },
  },
}

export function AutoFixPrompt() {
  const [active, setActive] = useState<AutoFixRequestDetail | null>(null)
  const [busy, setBusy] = useState(false)

  const close = useCallback(() => {
    if (busy) return
    setActive(null)
  }, [busy])

  useEffect(() => {
    const onFix = (e: Event) => {
      const detail = (e as CustomEvent<AutoFixRequestDetail>).detail
      if (!detail || !detail.fix) return
      setActive(detail)
    }
    window.addEventListener(AUTOFIX_EVENT, onFix as EventListener)
    return () => window.removeEventListener(AUTOFIX_EVENT, onFix as EventListener)
  }, [])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, close])

  if (!active) return null

  const handler = HANDLERS[active.fix]
  if (!handler) return null

  const runFix = async () => {
    setBusy(true)
    try {
      const result = await handler.run()
      if (result.ok) {
        toast.success(result.message ?? 'Fixed')
        const retry = active.retry
        setActive(null)
        if (retry) {
          try {
            await retry()
          } catch {
            /* caller's own error handling picks this up */
          }
        }
      } else {
        toast.error(result.message ?? 'Could not auto-fix')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="autofix-title"
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 10001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border-bright)',
          padding: 24,
          maxWidth: 440,
          width: '100%',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text)',
        }}
      >
        <div
          id="autofix-title"
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--gold)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 8,
          }}
        >
          Needs attention
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          {active.classification.message}
        </div>
        {active.classification.detail && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.5 }}>
            {active.classification.detail}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            onClick={close}
            disabled={busy}
            style={{
              background: 'transparent',
              color: 'var(--text-dim)',
              border: '1px solid var(--border)',
              padding: '8px 14px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Not now
          </button>
          <button
            onClick={runFix}
            disabled={busy}
            style={{
              background: 'var(--gold)',
              color: '#050505',
              border: '1px solid var(--gold)',
              padding: '8px 14px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Working…' : handler.label}
          </button>
        </div>
      </div>
    </div>
  )
}
