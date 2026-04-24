/**
 * signal-lab-crons — a thin Cloudflare Worker that fires HTTP cron triggers
 * against the signal-lab-os app. Keeps OpenNext's build output untouched.
 *
 * Schedules are defined in wrangler.jsonc. This worker maps each cron
 * pattern to an endpoint path + HTTP method and invokes it with a shared
 * bearer token so the app can reject unauthenticated cron calls.
 */

interface Env {
  TARGET_URL: string
  CRON_SECRET?: string
  // Optional — when both are set, every cron run logs a row to `cron_runs`
  // so silent misses become visible on the admin dashboard. If unset, the
  // worker still fires triggers, just without observability.
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

async function logStart(env: Env, label: string): Promise<string | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/cron_runs`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ name: label, status: 'running' }),
    })
    if (!res.ok) return null
    const rows = await res.json() as Array<{ id: string }>
    return rows[0]?.id ?? null
  } catch {
    return null
  }
}

async function logFinish(
  env: Env,
  runId: string | null,
  startedMs: number,
  status: 'success' | 'error',
  meta: Record<string, unknown>,
  errorMsg: string | null,
): Promise<void> {
  if (!runId || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/cron_runs?id=eq.${runId}`, {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedMs,
        status,
        error: errorMsg,
        meta,
      }),
    })
  } catch {
    // Never let logging failure affect cron outcome.
  }
}

type CronJob = {
  path: string
  method: 'GET' | 'POST'
  label: string
}

// Map from cron pattern → list of jobs fired at that pattern. CF caps each
// Worker at 5 Cron Trigger *patterns* even on Paid plan, so the 05:00 UTC slot
// stacks three daily jobs (sync-performance + contact-gaps + ads-snapshot) —
// all benefit from running early so data is fresh before the workday starts.
// Patterns MUST match wrangler.jsonc exactly.
const JOBS: Record<string, CronJob[]> = {
  // Invoice scan fires every 5 min — each user is gated internally by
  // SCANNER_CADENCE_MIN (Creator 120, Artist 60, Pro 30, Road/mgmt 5),
  // so this trigger drives the Road tier and the internal gate throttles others.
  '*/5 * * * *': [
    { path: '/api/crons/publish-scheduled', method: 'GET',  label: 'publish-scheduled' },
    { path: '/api/gmail/invoice-requests',  method: 'POST', label: 'invoice-scan' },
  ],
  '*/30 * * * *': [
    { path: '/api/crons/check-comments',       method: 'GET',  label: 'check-comments' },
  ],
  '0 5 * * *': [
    { path: '/api/crons/sync-performance', method: 'GET', label: 'sync-performance' },
    { path: '/api/crons/contact-gaps',     method: 'GET', label: 'contact-gaps' },
    { path: '/api/crons/ads-snapshot',     method: 'GET', label: 'ads-snapshot' },
    { path: '/api/crons/morning-brief',    method: 'GET', label: 'morning-brief' },
  ],
  '0 11 * * *': [
    { path: '/api/crons/invoice-backfill', method: 'POST', label: 'invoice-backfill' },
    { path: '/api/crons/ads-evaluate',     method: 'GET',  label: 'ads-evaluate' },
    { path: '/api/crons/ads-reminders',    method: 'GET',  label: 'ads-reminders' },
  ],
  '0 18 * * *':    [{ path: '/api/crons/night-before',      method: 'GET',  label: 'night-before' }],
}

async function runJob(env: Env, job: CronJob): Promise<{ ok: boolean; status: number; label: string }> {
  const url = `${env.TARGET_URL.replace(/\/$/, '')}${job.path}`
  const headers: Record<string, string> = {}
  if (env.CRON_SECRET) headers['Authorization'] = `Bearer ${env.CRON_SECRET}`

  const started = Date.now()
  const runId = await logStart(env, job.label)

  try {
    const res = await fetch(url, {
      method: job.method,
      headers,
      // Long-running crons can take a while — CF's scheduled handler allows up to 15 min CPU.
    })
    // Surface errors in tail logs for observability, but don't retry — next trigger will.
    if (!res.ok) {
      console.error(`[cron] ${job.label} → ${res.status} ${res.statusText}`)
    } else {
      console.log(`[cron] ${job.label} → ${res.status}`)
    }
    await logFinish(
      env,
      runId,
      started,
      res.ok ? 'success' : 'error',
      { http_status: res.status, path: job.path, method: job.method },
      res.ok ? null : res.statusText,
    )
    return { ok: res.ok, status: res.status, label: job.label }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cron] ${job.label} failed:`, message)
    await logFinish(env, runId, started, 'error', { path: job.path, method: job.method }, message)
    return { ok: false, status: 0, label: job.label }
  }
}

/**
 * Health monitor — detects cron-wide outages (e.g. secret mismatch between
 * this worker and the main app) and fires a `cron_error` notification so
 * silent failures surface within ~30 min instead of whenever Anthony notices.
 *
 * Lives inside the cron-worker itself (not as an authed API route) so it keeps
 * working even when the app-side auth is exactly what's broken. Reads and
 * writes Supabase directly with the service role key.
 *
 * Fires when: ≥5 runs in the last 30 min AND 100% are errors.
 * Dedupes by inserting at most one `cron_error / Crons failing` row per 2h.
 */
async function checkCronHealth(env: Env): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return
  const supaHeaders = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }

  try {
    const since30 = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const runsRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/cron_runs?started_at=gte.${since30}&select=status,name,error`,
      { headers: supaHeaders },
    )
    if (!runsRes.ok) return
    const runs = await runsRes.json() as Array<{ status: string; name: string; error: string | null }>
    if (runs.length < 5) return
    const errors = runs.filter(r => r.status === 'error')
    if (errors.length !== runs.length) return

    // Dedup — only one alert per 2h.
    const since2h = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const dupRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/notifications?type=eq.cron_error&title=eq.Crons%20failing&created_at=gte.${since2h}&select=id&limit=1`,
      { headers: supaHeaders },
    )
    if (dupRes.ok) {
      const dup = await dupRes.json() as Array<unknown>
      if (dup.length > 0) return
    }

    const sample = errors[0]?.error ?? 'unknown'
    const names = [...new Set(errors.map(e => e.name))].join(', ')
    await fetch(`${env.SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: supaHeaders,
      body: JSON.stringify({
        type: 'cron_error',
        title: 'Crons failing',
        message: `${errors.length}/${runs.length} cron runs in last 30m errored (${sample}). Jobs: ${names}`,
        read: false,
      }),
    })
    console.error(`[cron-health] alerted — ${errors.length}/${runs.length} failing (${sample})`)
  } catch (err) {
    console.error('[cron-health] check failed:', err instanceof Error ? err.message : String(err))
  }
}

export default {
  /**
   * scheduled() fires once per cron trigger. event.cron is the exact pattern
   * from wrangler.jsonc so we can route without ambiguity.
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const jobs = JOBS[event.cron]
    if (!jobs || !jobs.length) {
      console.error(`[cron] unknown pattern: "${event.cron}"`)
      return
    }
    // Fan out — each job runs independently so one failure doesn't cancel the others.
    // waitUntil keeps CF's full CPU budget available without blocking trigger return.
    // Health check piggy-backs on the */30 pattern so it runs twice per hour.
    const work = Promise.all(jobs.map(j => runJob(env, j))).then(async () => {
      if (event.cron === '*/30 * * * *') await checkCronHealth(env)
    })
    ctx.waitUntil(work)
  },

  /**
   * fetch() handler — lets you manually trigger any cron for debugging.
   *   GET /run/publish-scheduled  (requires Bearer CRON_SECRET if set)
   *   GET /health                 (returns job list)
   */
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        target: env.TARGET_URL,
        jobs: Object.entries(JOBS).flatMap(([cron, js]) => js.map(j => ({ cron, ...j }))),
      })
    }

    const match = url.pathname.match(/^\/run\/([a-z0-9-]+)$/)
    if (match) {
      const label = match[1]
      // Simple auth for manual triggers
      if (env.CRON_SECRET) {
        const auth = req.headers.get('Authorization')
        if (auth !== `Bearer ${env.CRON_SECRET}`) {
          return new Response('Unauthorized', { status: 401 })
        }
      }
      const job = Object.values(JOBS).flat().find(j => j.label === label)
      if (!job) return new Response(`Unknown job: ${label}`, { status: 404 })
      const result = await runJob(env, job)
      return Response.json(result)
    }

    return new Response('signal-lab-crons — see /health for job list', { status: 200 })
  },
}
