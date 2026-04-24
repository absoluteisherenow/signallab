import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── Shared API auth gate ─────────────────────────────────────────────────────
// Use at the top of any API route that hits paid services (Anthropic, HikerAPI,
// AudD, ACRCloud, OpenAI, etc.) or reads/writes user data.
//
// Usage:
//   const gate = await requireUser(req)
//   if (gate instanceof NextResponse) return gate
//   const { user, supabase, serviceClient } = gate
//
// Returns either { user, supabase, serviceClient } or a 401 NextResponse you must return.
//
// supabase:      auth-scoped client (RLS-aware, respects row-level policies)
// serviceClient: service-role client (bypasses RLS — use ONLY for cross-table
//                operations like notifications, cron cleanup, etc.)
//                ALWAYS filter by user_id manually when using serviceClient.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AuthedRequest = {
  user: { id: string; email?: string | null }
  supabase: ReturnType<typeof createServerClient>
  serviceClient: SupabaseClient<any, 'public', any>
}

export async function requireUser(
  req: NextRequest,
  opts: { corsHeaders?: Record<string, string> } = {}
): Promise<AuthedRequest | NextResponse> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        // Route handlers can't mutate request cookies, and we're not passing
        // a NextResponse through to set them on. Provide no-ops to silence the
        // "configured without set and remove cookie methods" warning. If a
        // token is expired, getUser() returns an error → caller returns 401
        // → the browser's supabase-js client refreshes and retries.
        set() {},
        remove() {},
      },
    }
  )

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: opts.corsHeaders }
    )
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  return { user: { id: user.id, email: user.email }, supabase, serviceClient }
}
