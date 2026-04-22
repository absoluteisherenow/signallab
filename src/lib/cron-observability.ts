import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Cron observability — logs every scheduled run to `cron_runs` so silent
 * misses become visible on the admin dashboard.
 *
 * Usage:
 *   export async function GET(req: NextRequest) {
 *     const unauth = requireCronAuth(req, 'sync-performance')
 *     if (unauth) return unauth
 *     return runWithLog('sync-performance', async () => {
 *       // ...cron body, returns the JSON payload
 *       return { synced, failed }
 *     })
 *   }
 */

let cached: SupabaseClient | null = null
function sb(): SupabaseClient {
  if (cached) return cached
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return cached
}

export async function logCronStart(name: string, meta?: Record<string, unknown>): Promise<string | null> {
  try {
    const { data, error } = await sb()
      .from('cron_runs')
      .insert({ name, status: 'running', meta: meta ?? null })
      .select('id')
      .single()
    if (error) return null
    return (data as { id: string }).id
  } catch {
    return null
  }
}

export async function logCronFinish(
  runId: string | null,
  status: 'success' | 'error' | 'skipped',
  startedMs: number,
  opts?: { error?: string; meta?: Record<string, unknown> }
): Promise<void> {
  if (!runId) return
  const durationMs = Date.now() - startedMs
  try {
    await sb()
      .from('cron_runs')
      .update({
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        status,
        error: opts?.error ?? null,
        meta: opts?.meta ?? null,
      })
      .eq('id', runId)
  } catch {
    // Logging must never throw upstream.
  }
}

/**
 * Wraps a cron body with start/finish logging. Returns whatever the body
 * returns. If the body throws, logs an error row and re-throws so the
 * existing error paths in each cron (notifications, 500 responses) still fire.
 */
export async function runWithLog<T>(
  name: string,
  body: () => Promise<T>,
  meta?: Record<string, unknown>
): Promise<T> {
  const started = Date.now()
  const runId = await logCronStart(name, meta)
  try {
    const result = await body()
    // Skip meta logging if body returned a Response (NextResponse etc) —
    // Response objects aren't JSON-serialisable and would bloat cron_runs.
    const isResponse = typeof result === 'object' && result !== null && typeof (result as { headers?: unknown }).headers === 'object' && typeof (result as { json?: unknown }).json === 'function'
    const resultMeta = !isResponse && typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : undefined
    await logCronFinish(runId, 'success', started, { meta: resultMeta })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logCronFinish(runId, 'error', started, { error: message })
    throw err
  }
}
