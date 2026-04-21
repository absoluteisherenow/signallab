import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

/**
 * GET /api/ads/verdicts
 *
 * Returns open (verdict=action, not applied, not dismissed) rule verdicts for
 * the current user, joined to campaign name. Powers the AdsAutomationInbox
 * panel on the Growth dashboard.
 *
 * Query:
 *   ?include=all      → include applied + dismissed (default: only open)
 */
export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const includeAll = new URL(req.url).searchParams.get('include') === 'all'

  let q = gate.serviceClient
    .from('ads_rule_verdicts')
    .select(
      'id, campaign_id, meta_campaign_id, rule_id, verdict, current_value, threshold, recommendation, action_type, action_payload, evaluated_for_date, applied_at, dismissed_at, campaigns!inner(name, intent, status)'
    )
    .eq('user_id', gate.user.id)
    .order('evaluated_for_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (!includeAll) {
    q = q.eq('verdict', 'action').is('applied_at', null).is('dismissed_at', null)
  }

  const { data, error } = await q.limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ verdicts: data ?? [] })
}
