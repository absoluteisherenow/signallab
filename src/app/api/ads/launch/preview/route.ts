import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { buildPreview, LaunchInput } from '@/lib/ads/meta-launch'

/**
 * POST /api/ads/launch/preview
 *
 * Pure preview — NEVER mutates Meta or the DB. Returns what WILL be sent on
 * launch so the user can approve the exact payload (per feedback_approve_before_send.md).
 *
 * The separate endpoint keeps the preview path permission-free of any write
 * capability — impossible for a bug in preview logic to accidentally launch.
 *
 * Body: LaunchInput (see src/lib/ads/meta-launch.ts)
 */
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  let input: LaunchInput
  try {
    input = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // Basic validation
  if (!input.name || !input.objective || !input.intent) {
    return NextResponse.json(
      { error: 'missing_required_fields', required: ['name', 'objective', 'intent'] },
      { status: 400 }
    )
  }
  if (!input.creative?.type) {
    return NextResponse.json({ error: 'missing_creative' }, { status: 400 })
  }
  if (!input.targeting?.geo_locations?.countries?.length) {
    return NextResponse.json({ error: 'missing_targeting_geo' }, { status: 400 })
  }

  try {
    const preview = buildPreview(input)
    return NextResponse.json({ preview })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'preview_failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
