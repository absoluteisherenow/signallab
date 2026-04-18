import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { buildPreview, launchToMeta, LaunchInput } from '@/lib/ads/meta-launch'

/**
 * POST /api/ads/launch
 *
 * Actually launches the campaign. Enforces the preview→approve→launch rule:
 *   1. Body MUST include `approved_at` ISO timestamp
 *   2. `approved_at` must be within the last 5 minutes (prevents stale replay)
 *   3. Body MUST include `preview_hash` matching a hash of the input
 *      (prevents bait-and-switch: approving preview A then launching B)
 *   4. Meta resources are created PAUSED so the user does one final activate
 *      click in the dashboard — extra safety per approve-before-send rule.
 *
 * Body: LaunchInput & { approved_at: string, preview_hash: string }
 */
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const token = process.env.META_SYSTEM_USER_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'meta_token_not_configured' }, { status: 500 })
  }

  type LaunchBody = LaunchInput & { approved_at?: string; preview_hash?: string }
  let body: LaunchBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const { approved_at, preview_hash, ...input } = body

  // ─── Approval gate ────────────────────────────────────────────────────────
  if (!approved_at) {
    return NextResponse.json(
      { error: 'approval_required', hint: 'Call /api/ads/launch/preview first, then confirm with approved_at.' },
      { status: 403 }
    )
  }
  const approvedTs = Date.parse(approved_at)
  if (isNaN(approvedTs)) {
    return NextResponse.json({ error: 'invalid_approved_at' }, { status: 400 })
  }
  const age = Date.now() - approvedTs
  if (age < 0 || age > 5 * 60 * 1000) {
    return NextResponse.json(
      { error: 'approval_stale', hint: 'Approval older than 5 minutes — re-preview and re-approve.' },
      { status: 403 }
    )
  }

  // Hash check — stable serialization of LaunchInput
  const expectedHash = await hashInput(input as LaunchInput)
  if (!preview_hash || preview_hash !== expectedHash) {
    return NextResponse.json(
      { error: 'preview_hash_mismatch', hint: 'Input changed since preview — re-preview and re-approve.' },
      { status: 403 }
    )
  }

  // ─── Validate input ───────────────────────────────────────────────────────
  if (!input.name || !input.objective || !input.intent || !input.creative?.type) {
    return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 })
  }

  // ─── Dry-run preview one more time (safety redundancy) ────────────────────
  let preview
  try {
    preview = buildPreview(input as LaunchInput)
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'preview_build_failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    )
  }
  if (preview.warnings.length > 0) {
    // Warnings should have been surfaced in the preview UI. If we're here with
    // blocking warnings, reject rather than fire.
    const blocking = preview.warnings.filter(w => w.includes('reject') || w.includes('below'))
    if (blocking.length > 0) {
      return NextResponse.json({ error: 'blocking_warnings', warnings: blocking }, { status: 400 })
    }
  }

  // ─── Insert planned row FIRST (audit trail even if Meta call fails) ──────
  const { data: plannedRow, error: insertErr } = await gate.serviceClient
    .from('campaigns')
    .insert({
      user_id: gate.user.id,
      name: input.name,
      objective: input.objective,
      phase_label: input.phase_label ?? null,
      intent: input.intent,
      post_id: input.post_id ?? null,
      gig_id: input.gig_id ?? null,
      hypothesis: input.hypothesis ?? null,
      target_metric: input.target_metric ?? null,
      target_value: input.target_value ?? null,
      notes: input.notes ?? null,
      status: 'planned',
      created_by: 'planner',
      approved_at,
      approved_by: gate.user.id,
    })
    .select()
    .single()

  if (insertErr || !plannedRow) {
    return NextResponse.json(
      { error: 'db_insert_failed', detail: insertErr?.message },
      { status: 500 }
    )
  }

  // ─── Launch to Meta ───────────────────────────────────────────────────────
  let metaResult
  try {
    metaResult = await launchToMeta(input as LaunchInput, token)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'meta_launch_failed'
    // Mark DB row as failed so audit trail shows what happened
    await gate.serviceClient
      .from('campaigns')
      .update({ status: 'failed', notes: `${plannedRow.notes ?? ''}\n[launch error] ${msg}`.trim() })
      .eq('id', plannedRow.id)
    return NextResponse.json({ error: 'meta_launch_failed', detail: msg, campaign_db_id: plannedRow.id }, { status: 502 })
  }

  // ─── Update DB row with Meta IDs + mark active (but Meta status still PAUSED) ──
  const { data: finalRow, error: updateErr } = await gate.serviceClient
    .from('campaigns')
    .update({
      meta_campaign_id: metaResult.campaign_id,
      status: 'paused', // matches Meta state — user activates via existing POST /api/ads endpoint
      launched_at: new Date().toISOString(),
    })
    .eq('id', plannedRow.id)
    .select()
    .single()

  if (updateErr) {
    // Meta is the source of truth at this point — log but don't fail the request
    console.error('[ads/launch] DB update after Meta create failed', {
      campaign_db_id: plannedRow.id,
      meta_campaign_id: metaResult.campaign_id,
      error: updateErr.message,
    })
  }

  return NextResponse.json({
    success: true,
    campaign: finalRow ?? plannedRow,
    meta: metaResult,
    note: 'Meta resources are PAUSED. Activate from the dashboard to go live.',
  })
}

/**
 * Stable hash over input. Sort keys so JSON.stringify is deterministic.
 */
async function hashInput(input: LaunchInput): Promise<string> {
  const canonical = JSON.stringify(input, Object.keys(input).sort())
  const buf = new TextEncoder().encode(canonical)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
