import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

/**
 * GET /api/ads/history
 *
 * Returns campaign + snapshot history for the Results page.
 *
 * Query params:
 *   campaign_id      — single campaign detail (includes full snapshot series)
 *   phase_label      — all campaigns in a phase (summary stats only)
 *   (no params)      — all campaigns for the user (list view)
 */
export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const url = new URL(req.url)
  const campaignId = url.searchParams.get('campaign_id')
  const phaseLabel = url.searchParams.get('phase_label')

  try {
    // ─── Single campaign detail ─────────────────────────────────────────────
    if (campaignId) {
      const { data: campaign, error: cErr } = await gate.serviceClient
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .eq('user_id', gate.user.id)
        .single()

      if (cErr || !campaign) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 })
      }

      const { data: snapshots, error: sErr } = await gate.serviceClient
        .from('campaign_metrics_snapshots')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('captured_for_date', { ascending: true })

      if (sErr) {
        return NextResponse.json({ error: 'snapshots_fetch_failed', detail: sErr.message }, { status: 500 })
      }

      return NextResponse.json({ campaign, snapshots: snapshots ?? [] })
    }

    // ─── Phase view ─────────────────────────────────────────────────────────
    if (phaseLabel) {
      const { data: campaigns, error } = await gate.serviceClient
        .from('campaigns')
        .select('id, name, status, intent, launched_at, ended_at, target_metric, target_value')
        .eq('user_id', gate.user.id)
        .eq('phase_label', phaseLabel)
        .order('launched_at', { ascending: false })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ phase: phaseLabel, campaigns: campaigns ?? [] })
    }

    // ─── List all ───────────────────────────────────────────────────────────
    const { data: campaigns, error } = await gate.serviceClient
      .from('campaigns')
      .select(
        'id, name, phase_label, intent, status, objective, launched_at, ended_at, target_metric, target_value, post_id, gig_id'
      )
      .eq('user_id', gate.user.id)
      .order('launched_at', { ascending: false, nullsFirst: false })
      .limit(100)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ campaigns: campaigns ?? [] })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'history_failed' },
      { status: 500 }
    )
  }
}
