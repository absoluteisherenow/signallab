/**
 * fetcher — opt-in fetch wrapper that classifies failures and surfaces them
 * through the toast system.
 *
 * Purely additive: existing `fetch(...)` + `alert(...)` code keeps working.
 * Only flows that import `fetcher` get the new behaviour.
 *
 * Usage:
 *   const result = await fetcher<{ ok: true }>('/api/social/instagram/post', {
 *     method: 'POST',
 *     body: JSON.stringify(payload),
 *     errorContext: 'post-publish',
 *   })
 *
 * Behaviour on failure:
 *   - classifier decides category
 *   - 'silent'  → logs, throws silently (caller gets the error, no toast)
 *   - 'autofix' → dispatches a CustomEvent for AutoFixPrompt + throws
 *   - 'retry'   → error toast with Retry action, throws
 *   - 'default' → error toast, throws
 *
 * Always throws on failure — callers can still try/catch as normal.
 */

import { toast } from './toast'
import { classifyError, type AutoFixId, type Classification } from './error-classifier'

export type FetcherOptions = RequestInit & {
  /** Short tag so the classifier can pick the right auto-fix path. */
  errorContext?: string
  /** If provided, a Retry button appears on retryable toasts. */
  onRetry?: () => void | Promise<void>
  /** Suppress the toast entirely (caller will show its own UI). */
  silent?: boolean
  /** Expect JSON in response body (default true). */
  json?: boolean
}

export class FetcherError extends Error {
  classification: Classification
  status?: number
  constructor(classification: Classification) {
    super(classification.message)
    this.name = 'FetcherError'
    this.classification = classification
    this.status = classification.status
  }
}

/** Event name the AutoFixPrompt listens for. */
export const AUTOFIX_EVENT = 'signallab:autofix-request'

export type AutoFixRequestDetail = {
  fix: AutoFixId
  classification: Classification
  retry?: () => void | Promise<void>
}

export async function fetcher<T = any>(url: string, opts: FetcherOptions = {}): Promise<T> {
  const { errorContext, onRetry, silent, json = true, ...init } = opts

  let res: Response
  try {
    res = await fetch(url, init)
  } catch (networkErr) {
    const cls = classifyError({ error: networkErr, context: errorContext })
    handleFailure(cls, { silent, onRetry })
    throw new FetcherError(cls)
  }

  if (!res.ok) {
    let body: any = null
    try {
      body = json ? await res.json() : await res.text()
    } catch {
      /* swallow parse errors — we still have status */
    }
    const cls = classifyError({
      status: res.status,
      body,
      context: errorContext,
      error: new Error(`HTTP ${res.status} ${res.statusText}`),
    })
    handleFailure(cls, { silent, onRetry })
    throw new FetcherError(cls)
  }

  if (!json) return undefined as T
  try {
    return (await res.json()) as T
  } catch (parseErr) {
    const cls = classifyError({ error: parseErr, context: errorContext })
    handleFailure(cls, { silent, onRetry })
    throw new FetcherError(cls)
  }
}

function handleFailure(
  cls: Classification,
  { silent, onRetry }: { silent?: boolean; onRetry?: () => void | Promise<void> },
) {
  if (silent) {
    console.warn('[fetcher] silent error:', cls)
    return
  }

  if (cls.category === 'silent') {
    console.debug('[fetcher] suppressed:', cls.message)
    return
  }

  if (cls.category === 'autofix' && cls.fix) {
    // Fire event — AutoFixPrompt (mounted at layout) handles it. Also show a
    // toast so the user knows something's happening even if they dismissed
    // the prompt before.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<AutoFixRequestDetail>(AUTOFIX_EVENT, {
          detail: { fix: cls.fix, classification: cls, retry: onRetry },
        }),
      )
    }
    toast.warn(cls.message, {
      title: 'Needs attention',
      duration: 8000,
    })
    return
  }

  if (cls.category === 'retry') {
    toast.error(cls.message, {
      title: 'Try again',
      duration: 7000,
      action: onRetry ? { label: 'Retry', onClick: () => onRetry() } : undefined,
    })
    return
  }

  // default
  toast.error(cls.message, {
    title: 'Error',
    duration: 6000,
    action: onRetry ? { label: 'Retry', onClick: () => onRetry() } : undefined,
  })
}
