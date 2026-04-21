import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { META_CONFIG, rotateCreativeOnAdset } from '@/lib/ads/meta-launch'

/**
 * POST /api/ads/apply-rule
 *
 * Applies a single rule verdict against Meta. Approve-before-send compliant —
 * caller must pass `approved_at` (ISO, within 5min). Looks up the verdict by id,
 * executes the action_type against Meta, then writes applied_at + result.
 *
 * Body: { verdict_id: string, approved_at: string }
 *
 * Action types supported:
 *   - scale_budget    — multiply adset daily_budget by payload.multiplier
 *                       (48h cooldown per campaign to avoid compounding scale)
 *   - pause_campaign  — set campaign status PAUSED on Meta
 *   - swap_creative   — rotate to next queued+approved creative from ad_creative_queue
 *   - propose_stage_2 — no-op here; Stage 2 proposals are launched via the
 *                       existing launch UI (pre-filled). Apply just marks the
 *                       verdict as applied_at so the notification clears.
 */
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const token = process.env.META_SYSTEM_USER_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'meta_token_not_configured' }, { status: 500 })
  }

  let body: { verdict_id?: string; approved_at?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const { verdict_id, approved_at } = body
  if (!verdict_id) return NextResponse.json({ error: 'missing_verdict_id' }, { status: 400 })
  if (!approved_at) {
    return NextResponse.json(
      { error: 'approval_required', hint: 'Pass approved_at after user confirms the action.' },
      { status: 403 }
    )
  }
  const age = Date.now() - Date.parse(approved_at)
  if (isNaN(age) || age < 0 || age > 5 * 60 * 1000) {
    return NextResponse.json({ error: 'approval_stale' }, { status: 403 })
  }

  const sb = gate.serviceClient
  const { data: verdict, error: vErr } = await sb
    .from('ads_rule_verdicts')
    .select('*')
    .eq('id', verdict_id)
    .eq('user_id', gate.user.id)
    .single()

  if (vErr || !verdict) return NextResponse.json({ error: 'verdict_not_found' }, { status: 404 })
  if (verdict.applied_at) {
    return NextResponse.json({ error: 'already_applied', applied_at: verdict.applied_at }, { status: 409 })
  }
  if (verdict.dismissed_at) {
    return NextResponse.json({ error: 'verdict_dismissed' }, { status: 409 })
  }
  if (!verdict.action_type) {
    return NextResponse.json({ error: 'no_action_for_rule' }, { status: 400 })
  }

  const payload = (verdict.action_payload ?? {}) as Record<string, unknown>
  let result: unknown

  try {
    if (verdict.action_type === 'pause_campaign') {
      result = await metaCampaignSetStatus(verdict.meta_campaign_id, 'PAUSED', token)
    } else if (verdict.action_type === 'scale_budget') {
      const multiplier = Number(payload.multiplier ?? 1)
      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        return NextResponse.json({ error: 'invalid_multiplier' }, { status: 400 })
      }
      // 48h cooldown per campaign — prevents compounding scale from adjacent
      // rule fires (Lever #3 guardrail). A £0.50 cost/follower day is encouraging
      // but not a licence to scale twice in one week.
      const { data: lastScale } = await sb
        .from('ads_rule_verdicts')
        .select('applied_at')
        .eq('campaign_id', verdict.campaign_id)
        .eq('action_type', 'scale_budget')
        .not('applied_at', 'is', null)
        .order('applied_at', { ascending: false })
        .limit(1)
      const lastAt = lastScale?.[0]?.applied_at
      if (lastAt) {
        const hoursSince = (Date.now() - new Date(lastAt).getTime()) / 3600_000
        if (hoursSince < 48) {
          return NextResponse.json(
            {
              error: 'scale_cooldown',
              hint: `Last scale was ${Math.floor(hoursSince)}h ago. Wait ${Math.ceil(48 - hoursSince)}h.`,
              last_scaled_at: lastAt,
            },
            { status: 429 }
          )
        }
      }
      result = await scaleAdsetBudgets(verdict.meta_campaign_id, multiplier, token)
    } else if (verdict.action_type === 'swap_creative') {
      result = await swapCreative(sb, verdict, token)
    } else if (verdict.action_type === 'propose_stage_2') {
      // Stage 2 is launched via the pre-filled launch UI — applying here just
      // marks the proposal acknowledged so the notification clears. The launch
      // itself goes through /api/ads/launch which has its own approval gate.
      result = { acknowledged: true, launch_via: '/grow/growth?propose=stage2' }
    } else {
      return NextResponse.json({ error: 'unsupported_action_type', type: verdict.action_type }, { status: 400 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'meta_action_failed', detail: msg }, { status: 502 })
  }

  await sb
    .from('ads_rule_verdicts')
    .update({
      applied_at: new Date().toISOString(),
      applied_by: gate.user.id,
      applied_result: result as Record<string, unknown>,
    })
    .eq('id', verdict_id)

  // Mirror DB campaign status when we paused
  if (verdict.action_type === 'pause_campaign') {
    await sb.from('campaigns').update({ status: 'paused' }).eq('id', verdict.campaign_id)
  }

  return NextResponse.json({ success: true, action: verdict.action_type, result })
}

/**
 * DELETE /api/ads/apply-rule?verdict_id=...
 * Dismisses a verdict without applying it.
 */
export async function DELETE(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const verdict_id = new URL(req.url).searchParams.get('verdict_id')
  if (!verdict_id) return NextResponse.json({ error: 'missing_verdict_id' }, { status: 400 })

  const { error } = await gate.serviceClient
    .from('ads_rule_verdicts')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', verdict_id)
    .eq('user_id', gate.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

async function metaCampaignSetStatus(campaignId: string, status: 'ACTIVE' | 'PAUSED', token: string) {
  const url = `https://graph.facebook.com/${META_CONFIG.API_VERSION}/${campaignId}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, access_token: token }),
    signal: AbortSignal.timeout(10000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: { message?: string } })?.error?.message || `Meta ${res.status}`)
  }
  return data
}

async function scaleAdsetBudgets(campaignId: string, multiplier: number, token: string) {
  // Fetch all adsets under this campaign
  const listUrl = `https://graph.facebook.com/${META_CONFIG.API_VERSION}/${campaignId}/adsets?fields=id,daily_budget,lifetime_budget&access_token=${encodeURIComponent(token)}`
  const listRes = await fetch(listUrl, { signal: AbortSignal.timeout(10000) })
  const listData = await listRes.json().catch(() => ({}))
  if (!listRes.ok) {
    throw new Error((listData as { error?: { message?: string } })?.error?.message || `Meta ${listRes.status}`)
  }

  const adsets = ((listData as { data?: Array<{ id: string; daily_budget?: string; lifetime_budget?: string }> }).data) ?? []
  const updates: Array<{ adset_id: string; before: number; after: number }> = []

  for (const a of adsets) {
    const currentDaily = a.daily_budget ? parseInt(a.daily_budget, 10) : null
    if (!currentDaily) continue // skip lifetime-budget adsets — not currently used
    const next = Math.round(currentDaily * multiplier)
    const upUrl = `https://graph.facebook.com/${META_CONFIG.API_VERSION}/${a.id}`
    const upRes = await fetch(upUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daily_budget: next, access_token: token }),
      signal: AbortSignal.timeout(10000),
    })
    const upData = await upRes.json().catch(() => ({}))
    if (!upRes.ok) {
      throw new Error(`adset ${a.id}: ${(upData as { error?: { message?: string } })?.error?.message || upRes.status}`)
    }
    updates.push({ adset_id: a.id, before: currentDaily, after: next })
  }

  return { multiplier, updates }
}

/**
 * Swap the current creative on a campaign's active adset for the next queued,
 * user-approved creative in ad_creative_queue matching the campaign's intent.
 *
 * Budget is preserved (same daily_budget on the adset) to avoid resetting the
 * learning phase — per Q1 decision.
 */
type VerdictRow = {
  id: string
  user_id: string
  campaign_id: string
  meta_campaign_id: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function swapCreative(sb: any, verdict: VerdictRow, token: string) {
  // 1. Resolve campaign intent + name (needed to pick the right queue lane)
  const { data: campaign, error: cErr } = await sb
    .from('campaigns')
    .select('id, name, intent')
    .eq('id', verdict.campaign_id)
    .single()
  if (cErr || !campaign) throw new Error('campaign_not_found')
  const intent = (campaign as { intent: string | null }).intent
  if (!intent || !['growth_stage_1', 'growth_stage_2'].includes(intent)) {
    throw new Error(`swap_creative not supported for intent=${intent}`)
  }

  // 2. Pull next queued + approved creative (lowest position first)
  const { data: queueRows, error: qErr } = await sb
    .from('ad_creative_queue')
    .select('id, ig_post_id, ig_permalink, position, approved_at')
    .eq('user_id', verdict.user_id)
    .eq('intent', intent)
    .eq('status', 'queued')
    .not('approved_at', 'is', null)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
  if (qErr) throw new Error(`queue_lookup_failed: ${qErr.message}`)
  const next = queueRows?.[0] as
    | { id: string; ig_post_id: string; ig_permalink: string | null; position: number; approved_at: string }
    | undefined
  if (!next) {
    throw new Error(
      'creative_queue_empty: no approved creatives queued for this campaign. Add + approve one, or dismiss the verdict.'
    )
  }

  // 3. Find the first ACTIVE adset on the Meta campaign
  const adsetListUrl = `https://graph.facebook.com/${META_CONFIG.API_VERSION}/${verdict.meta_campaign_id}/adsets?fields=id,status,name&access_token=${encodeURIComponent(token)}`
  const adsetListRes = await fetch(adsetListUrl, { signal: AbortSignal.timeout(10000) })
  const adsetListData = (await adsetListRes.json().catch(() => ({}))) as {
    data?: Array<{ id: string; status: string; name: string }>
    error?: { message?: string }
  }
  if (!adsetListRes.ok) {
    throw new Error(adsetListData.error?.message || `Meta ${adsetListRes.status}`)
  }
  const activeAdset = (adsetListData.data ?? []).find(a => a.status === 'ACTIVE')
  if (!activeAdset) throw new Error('no_active_adset_on_campaign')

  // 4. Swap — new creative + ad on the same adset, pause the old ad.
  //    Keeps daily_budget untouched (Q1 — avoid learning-phase reset).
  const rotateRes = await rotateCreativeOnAdset(
    activeAdset.id,
    next.ig_post_id,
    `${(campaign as { name: string }).name} — rotate ${new Date().toISOString().slice(0, 10)}`,
    token
  )

  // 5. Mark queue row used, link to campaign + new adset
  await sb
    .from('ad_creative_queue')
    .update({
      status: 'used',
      used_at: new Date().toISOString(),
      used_for_campaign_id: verdict.campaign_id,
      used_for_adset_id: activeAdset.id,
    })
    .eq('id', next.id)

  return {
    rotated_to: {
      queue_row_id: next.id,
      ig_post_id: next.ig_post_id,
      ig_permalink: next.ig_permalink,
    },
    adset_id: activeAdset.id,
    new_creative_id: rotateRes.creative_id,
    new_ad_id: rotateRes.ad_id,
    paused_ad_ids: rotateRes.paused_ad_ids,
  }
}
