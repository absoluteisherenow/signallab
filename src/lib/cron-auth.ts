import { NextRequest, NextResponse } from 'next/server'

/**
 * Shared Bearer-token guard for all /api/crons/* routes.
 *
 * Usage:
 *   export async function GET(req: NextRequest) {
 *     const unauth = requireCronAuth(req)
 *     if (unauth) return unauth
 *     ...
 *   }
 *
 * Behaviour:
 *   - If CRON_SECRET is set (prod): requires `Authorization: Bearer <secret>`.
 *     Missing or wrong token → 401.
 *   - If CRON_SECRET is unset (local dev): allows the request with a warning.
 *
 * The shared secret is set on both the main Worker and the signal-lab-crons
 * Worker so Cloudflare's scheduled trigger can authenticate.
 */
export function requireCronAuth(req: NextRequest, label = 'cron'): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization') || ''

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    return null
  }

  console.warn(`[${label}] CRON_SECRET not set — allowing request (dev only)`)
  return null
}
