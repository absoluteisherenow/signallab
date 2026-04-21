import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

/**
 * Creative queue for auto-rotate. When a fatigue rule fires on an active
 * campaign, /api/ads/apply-rule pulls the next queued row for the matching
 * intent and rotates it onto the live adset.
 */

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const intent = new URL(req.url).searchParams.get('intent')
  let q = gate.serviceClient
    .from('ad_creative_queue')
    .select('id, intent, ig_post_id, ig_permalink, ig_caption_excerpt, position, status, used_at, used_for_campaign_id, created_at')
    .eq('user_id', gate.user.id)
    .order('status', { ascending: true })
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  if (intent) q = q.eq('intent', intent)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ queue: data ?? [] })
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  let body: {
    intent?: string
    ig_post_id?: string
    ig_permalink?: string
    ig_caption_excerpt?: string
    position?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const { intent, ig_post_id, ig_permalink, ig_caption_excerpt, position } = body
  if (!intent || !['growth_stage_1', 'growth_stage_2'].includes(intent)) {
    return NextResponse.json({ error: 'invalid_intent' }, { status: 400 })
  }
  if (!ig_post_id) return NextResponse.json({ error: 'missing_ig_post_id' }, { status: 400 })

  const { data, error } = await gate.serviceClient
    .from('ad_creative_queue')
    .insert({
      user_id: gate.user.id,
      intent,
      ig_post_id,
      ig_permalink: ig_permalink ?? null,
      ig_caption_excerpt: ig_caption_excerpt?.slice(0, 200) ?? null,
      position: position ?? 100,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, row: data })
}

/**
 * PATCH /api/ads/creative-queue
 * Body: { id, action: 'approve' | 'unapprove' | 'archive' | 'restore' }
 *
 * Approval flips `approved_at` — only approved rows are eligible for the
 * swap_creative action. Archive sets status='archived' so the row stays in
 * history but stops being eligible for rotation.
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  let body: { id?: string; action?: 'approve' | 'unapprove' | 'archive' | 'restore' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const { id, action } = body
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

  const patch: Record<string, string | null> = {}
  if (action === 'approve') {
    patch.approved_at = new Date().toISOString()
    patch.approved_by = gate.user.id
  } else if (action === 'unapprove') {
    patch.approved_at = null
    patch.approved_by = null
  } else if (action === 'archive') {
    patch.status = 'archived'
  } else if (action === 'restore') {
    patch.status = 'queued'
  } else {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 })
  }

  const { data, error } = await gate.serviceClient
    .from('ad_creative_queue')
    .update(patch)
    .eq('id', id)
    .eq('user_id', gate.user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, row: data })
}

export async function DELETE(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

  const { error } = await gate.serviceClient
    .from('ad_creative_queue')
    .delete()
    .eq('id', id)
    .eq('user_id', gate.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
