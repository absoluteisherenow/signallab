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
    ctx.waitUntil(Promise.all(jobs.map(j => runJob(env, j))).then(() => undefined))
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
