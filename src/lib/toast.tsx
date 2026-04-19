/**
 * toast — tiny notification system for Signal Lab OS.
 *
 * Opt-in, purely additive. Existing alert() / window.confirm callers keep
 * working. Only flows that explicitly import `toast` / `useToast` are
 * affected.
 *
 * Aesthetic matches BRT theme: mono font, --gold for info/success,
 * muted red for errors. Stacked top-right, auto-dismiss 5s, max 5 visible.
 *
 * Usage:
 *   import { toast } from '@/lib/toast'
 *   toast.success('Scheduled for 18:00')
 *   toast.error('Upload failed', { action: { label: 'Retry', onClick: retry } })
 *
 * The <ToastProvider /> must be mounted once at the app root; see layout.tsx.
 */

'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export type ToastKind = 'info' | 'success' | 'error' | 'warn'

export type ToastAction = {
  label: string
  onClick: () => void | Promise<void>
}

export type ToastInput = {
  kind?: ToastKind
  title?: string
  message: string
  /** ms before auto-dismiss. 0 = sticky. Default 5000. */
  duration?: number
  action?: ToastAction
}

type ToastRecord = ToastInput & {
  id: number
  kind: ToastKind
  duration: number
  /** Monotonic timestamp used for dedupe. */
  ts: number
  /** Count bump when the same (kind+message) arrives within DEDUPE_WINDOW_MS. */
  count: number
}

/**
 * Dedupe window — if the same (kind, message) lands within this many ms of
 * an existing toast, we bump its count + reset its timer instead of stacking
 * a duplicate. Avoids the "flaky endpoint retry" 3-stack-of-identical-toasts
 * problem.
 */
const DEDUPE_WINDOW_MS = 3000

type ToastCtx = {
  push: (t: ToastInput) => number
  dismiss: (id: number) => void
}

const Ctx = createContext<ToastCtx | null>(null)

const MAX_VISIBLE = 5

let externalPush: ((t: ToastInput) => number) | null = null
let externalDismiss: ((id: number) => void) | null = null

/**
 * Imperative API — works anywhere (outside React, inside callbacks, etc.)
 * Safely no-ops if ToastProvider hasn't mounted yet (SSR, early calls).
 */
export const toast = {
  info: (message: string, opts?: Omit<ToastInput, 'message' | 'kind'>) =>
    externalPush?.({ ...opts, message, kind: 'info' }) ?? -1,
  success: (message: string, opts?: Omit<ToastInput, 'message' | 'kind'>) =>
    externalPush?.({ ...opts, message, kind: 'success' }) ?? -1,
  error: (message: string, opts?: Omit<ToastInput, 'message' | 'kind'>) =>
    externalPush?.({ ...opts, message, kind: 'error' }) ?? -1,
  warn: (message: string, opts?: Omit<ToastInput, 'message' | 'kind'>) =>
    externalPush?.({ ...opts, message, kind: 'warn' }) ?? -1,
  dismiss: (id: number) => externalDismiss?.(id),
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

/**
 * ToastProvider — the only piece that actually renders. Kept in this file
 * (rather than its own component) so the whole system is one import.
 *
 * Mount once in app/layout.tsx:
 *   <ToastProvider>{children}</ToastProvider>
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((t: ToastInput) => {
    const kind = t.kind ?? 'info'
    const duration = t.duration ?? 5000
    const now = Date.now()
    let returnedId = 0

    setToasts(prev => {
      // Dedupe: if the same kind+message was pushed in the last
      // DEDUPE_WINDOW_MS, bump its count and refresh its expiry instead of
      // stacking a duplicate. Only applies to non-sticky toasts — sticky
      // ones (duration 0) are used for state (offline banner) and shouldn't
      // be collapsed.
      if (duration > 0) {
        const existing = prev.find(
          p => p.kind === kind && p.message === t.message && now - p.ts < DEDUPE_WINDOW_MS,
        )
        if (existing) {
          returnedId = existing.id
          // Reset expiry timer.
          setTimeout(() => dismiss(existing.id), duration)
          return prev.map(p =>
            p.id === existing.id ? { ...p, count: p.count + 1, ts: now } : p,
          )
        }
      }

      const id = ++idRef.current
      returnedId = id
      const record: ToastRecord = {
        kind,
        duration,
        title: t.title,
        message: t.message,
        action: t.action,
        id,
        ts: now,
        count: 1,
      }
      const next = [...prev, record]
      // Cap visible stack — drop oldest if exceeded.
      if (next.length > MAX_VISIBLE) next.splice(0, next.length - MAX_VISIBLE)
      if (record.duration > 0) {
        setTimeout(() => dismiss(id), record.duration)
      }
      return next
    })

    return returnedId
  }, [dismiss])

  // Wire imperative API once mounted.
  useEffect(() => {
    externalPush = push
    externalDismiss = dismiss
    return () => {
      externalPush = null
      externalDismiss = null
    }
  }, [push, dismiss])

  return (
    <Ctx.Provider value={{ push, dismiss }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </Ctx.Provider>
  )
}

function ToastStack({ toasts, onDismiss }: { toasts: ToastRecord[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null
  return (
    <div
      role="region"
      aria-label="Notifications"
      // polite: announce when idle, don't interrupt screen reader flow.
      // Errors are still polite because we don't want to talk over active work.
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
        maxWidth: 'calc(100vw - 32px)',
        width: 360,
      }}
    >
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: number) => void }) {
  const palette = paletteFor(toast.kind)
  const [busy, setBusy] = useState(false)

  const handleAction = async () => {
    if (!toast.action || busy) return
    setBusy(true)
    try {
      await toast.action.onClick()
    } finally {
      setBusy(false)
      onDismiss(toast.id)
    }
  }

  return (
    <div
      style={{
        pointerEvents: 'auto',
        background: 'var(--panel)',
        border: `1px solid ${palette.border}`,
        borderLeft: `3px solid ${palette.accent}`,
        padding: '10px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        color: 'var(--text)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        animation: 'sl-toast-in 160ms ease-out',
      }}
    >
      <style>{`@keyframes sl-toast-in { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }`}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {toast.title && (
            <div style={{ fontWeight: 700, color: palette.accent, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{toast.title}</span>
              {toast.count > 1 && (
                <span
                  aria-label={`${toast.count} occurrences`}
                  style={{
                    background: palette.accent,
                    color: '#050505',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 2,
                    letterSpacing: 0,
                  }}
                >
                  ×{toast.count}
                </span>
              )}
            </div>
          )}
          <div style={{ color: 'var(--text-dim)', wordBreak: 'break-word' }}>{toast.message}</div>
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-dimmest)',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
            marginLeft: 4,
          }}
        >
          ×
        </button>
      </div>
      {toast.action && (
        <button
          onClick={handleAction}
          disabled={busy}
          style={{
            alignSelf: 'flex-start',
            background: 'transparent',
            color: palette.accent,
            border: `1px solid ${palette.accent}`,
            padding: '4px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? '…' : toast.action.label}
        </button>
      )}
    </div>
  )
}

function paletteFor(kind: ToastKind): { accent: string; border: string } {
  switch (kind) {
    case 'success':
      return { accent: 'var(--gold)', border: 'var(--border-bright)' }
    case 'error':
      return { accent: '#ff4a3a', border: 'var(--border-bright)' }
    case 'warn':
      return { accent: 'var(--gold-bright)', border: 'var(--border-bright)' }
    case 'info':
    default:
      return { accent: 'var(--text-dim)', border: 'var(--border)' }
  }
}
