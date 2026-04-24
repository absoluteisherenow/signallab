import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

export const runtime = 'nodejs'

// Poll endpoint for an async publish_jobs row. Returns status, phase,
// result (if done), error (if failed). Client polls every ~3s while
// status is queued/working. RLS ensures the user can only read their own
// jobs (policy on the table) — we use the auth-scoped client.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const { data, error } = await supabase
    .from('publish_jobs')
    .select('id, status, phase, result, error, updated_at')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json(data)
}
