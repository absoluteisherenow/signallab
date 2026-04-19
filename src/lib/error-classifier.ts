/**
 * error-classifier — maps raw errors (thrown Errors, fetch Response failures,
 * Supabase errors, etc.) to user-visible outcomes.
 *
 * Categories:
 *   - autofix    : known cause we can offer to repair (IG token expired,
 *                  stuck publishing state, stale cache). Triggers the
 *                  auto-fix prompt modal.
 *   - retry      : transient (network blip, R2 5xx, 429). Show toast with
 *                  a Retry action.
 *   - silent     : user already saw the outcome (e.g. aborted upload,
 *                  user cancelled). Log only, no toast.
 *   - default    : show as error toast.
 *
 * This file is pure — it doesn't render anything. The fetcher layer decides
 * what to do with the classification.
 */

export type ErrorCategory = 'autofix' | 'retry' | 'silent' | 'default'

export type AutoFixId =
  | 'ig_token_expired'
  | 'stuck_publishing'
  | 'r2_transient'
  | 'supabase_cache_refresh'

export type Classification = {
  category: ErrorCategory
  /** Short, user-facing message. No stack traces, no jargon. */
  message: string
  /** Optional second line for extra context. */
  detail?: string
  /** Auto-fix handler id if category === 'autofix'. */
  fix?: AutoFixId
  /** Original status code if known. */
  status?: number
  /** Preserved for telemetry. */
  raw?: unknown
}

type Input = {
  error?: unknown
  status?: number
  /** Parsed JSON body from a failed fetch, if available. */
  body?: any
  /** Caller-supplied hint so the classifier can prefer a specific fix path. */
  context?: string
}

/**
 * Classify an error into something the UI can present. Pure function.
 */
export function classifyError(input: Input): Classification {
  const { error, status, body, context } = input
  const rawMessage = extractMessage(error, body)
  const lower = rawMessage.toLowerCase()

  // User-cancelled / aborted — never toast.
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { category: 'silent', message: 'Cancelled', raw: error }
  }
  if (lower.includes('user cancelled') || lower.includes('user canceled')) {
    return { category: 'silent', message: rawMessage, raw: error }
  }

  // Instagram token expired / invalid — classic auto-fix.
  if (
    lower.includes('access token') ||
    lower.includes('oauthexception') ||
    lower.includes('session has expired') ||
    lower.includes('invalid oauth') ||
    (body?.error?.code === 190)
  ) {
    return {
      category: 'autofix',
      fix: 'ig_token_expired',
      message: 'Instagram token expired',
      detail: 'Reconnect Instagram to resume posting.',
      status,
      raw: error ?? body,
    }
  }

  // Post stuck in "publishing" state.
  if (context === 'post-publish' && (lower.includes('already publishing') || lower.includes('stuck'))) {
    return {
      category: 'autofix',
      fix: 'stuck_publishing',
      message: 'A previous post is stuck mid-publish',
      detail: 'Clear the stuck state and try again?',
      status,
      raw: error ?? body,
    }
  }

  // Supabase "JWT expired" / stale PostgREST schema.
  if (lower.includes('jwt expired') || lower.includes('schema cache')) {
    return {
      category: 'autofix',
      fix: 'supabase_cache_refresh',
      message: 'Connection out of date',
      detail: 'Refresh the connection and retry?',
      status,
      raw: error ?? body,
    }
  }

  // R2 / upload transient failure.
  if (
    (status && status >= 500 && status < 600) ||
    status === 429 ||
    lower.includes('r2') && (lower.includes('timeout') || lower.includes('temporarily'))
  ) {
    return {
      category: 'retry',
      message: status === 429 ? 'Rate limited — retrying will usually work' : 'Temporary server error',
      detail: context ? `During: ${context}` : undefined,
      status,
      raw: error ?? body,
    }
  }

  // Network / offline.
  if (error instanceof TypeError && lower.includes('fetch')) {
    return {
      category: 'retry',
      message: 'Network error',
      detail: 'Check your connection and retry.',
      raw: error,
    }
  }

  // Auth failures that aren't IG.
  if (status === 401 || status === 403) {
    return {
      category: 'default',
      message: status === 401 ? 'Not signed in' : 'Permission denied',
      detail: rawMessage && rawMessage !== 'Unknown error' ? rawMessage : undefined,
      status,
      raw: error ?? body,
    }
  }

  return {
    category: 'default',
    message: rawMessage,
    status,
    raw: error ?? body,
  }
}

function extractMessage(error: unknown, body: any): string {
  // Prefer structured error from API body.
  if (body && typeof body === 'object') {
    if (typeof body.error === 'string' && body.error.trim()) return body.error
    if (body.error?.message) return String(body.error.message)
    if (typeof body.message === 'string' && body.message.trim()) return body.message
  }
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return 'Unknown error'
}
