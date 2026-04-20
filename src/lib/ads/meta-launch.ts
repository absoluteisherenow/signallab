/**
 * Meta Marketing API helpers for campaign launch.
 *
 * Scope: MVP supports boosting an existing Instagram post (the most common
 * NM use case, per the follower growth plan — Stage 1 always-on boosts the
 * best organic video from the past 7 days). New creative upload is Phase 2.
 *
 * v25.0 Graph API. All monetary values passed to Meta in pence (int), returned
 * from Signal Lab in GBP (number). Convert at the API boundary, not deeper.
 */

const META_API_VERSION = 'v25.0'
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || 'act_831371654092961'
// @nightmanoeuvres IG actor ID — verified live via Graph API:
//   { id: 17841465370771800, username: 'nightmanoeuvres', name: 'NIGHT manoeuvres' }
const NM_IG_ID = '17841465370771800'
// @absolute (token owner) — hard-blocked from ever being used as the ad
// creative's instagram_actor_id. Signal Lab is NM-only on the publish side.
const BLOCKED_IG_IDS = new Set(['17841400093363542'])
const IG_ACTOR_ID = process.env.META_IG_ACTOR_ID || NM_IG_ID

if (BLOCKED_IG_IDS.has(IG_ACTOR_ID)) {
  // Fail at module load — if a deploy ever sets META_IG_ACTOR_ID to @absolute
  // the whole ads surface refuses to function instead of silently posting to
  // the wrong account. Explicit is better than surprise.
  throw new Error(
    `META_IG_ACTOR_ID resolves to a blocked account (${IG_ACTOR_ID}). ` +
      `Signal Lab publishes ads under @nightmanoeuvres only. ` +
      `Unset the env var or set it to ${NM_IG_ID}.`
  )
}

export type MetaObjective =
  | 'OUTCOME_ENGAGEMENT'
  | 'OUTCOME_AWARENESS'
  | 'OUTCOME_TRAFFIC'
  | 'OUTCOME_LEADS'
  | 'OUTCOME_SALES'
  | 'OUTCOME_APP_PROMOTION'

export type LaunchIntent =
  | 'boost'
  | 'cold'
  | 'retarget'
  | 'growth_stage_1'
  | 'growth_stage_2'
  | 'release_burst'
  | 'ticket_sales'
  | 'other'

export type Targeting = {
  geo_locations: { countries: string[] }
  age_min: number
  age_max: number
  genders?: number[] // 1 = male, 2 = female
  interests?: Array<{ id: string; name: string }>
  custom_audiences?: Array<{ id: string; name?: string }>
  excluded_custom_audiences?: Array<{ id: string; name?: string }>
  publisher_platforms?: string[]
  instagram_positions?: string[]
  facebook_positions?: string[]
}

export type CreativeSpec =
  | { type: 'existing_ig_post'; ig_post_id: string }
  | {
      type: 'new_image'
      image_url: string
      caption: string
      cta?: string
      destination_url?: string
    }

export type LaunchInput = {
  name: string
  objective: MetaObjective
  intent: LaunchIntent

  daily_budget_gbp?: number
  lifetime_budget_gbp?: number
  duration_days?: number

  targeting: Targeting
  creative: CreativeSpec

  // Optional linkage
  phase_label?: string
  post_id?: string
  gig_id?: string
  hypothesis?: string
  target_metric?: string
  target_value?: number
  notes?: string
}

export type LaunchPreview = {
  summary: {
    name: string
    objective: MetaObjective
    intent: LaunchIntent
    budget_line: string // "£5/day for 7 days = £35 max" (for human review)
    audience_line: string // "UK, 22-38, interests: RA/fabric/Boiler Room, excl: existing followers"
    creative_line: string // "Boosting IG post 18023..."
    estimated_spend_gbp: number
  }
  meta_payloads: {
    campaign: Record<string, unknown>
    adset: Record<string, unknown>
    creative: Record<string, unknown>
    ad: Record<string, unknown>
  }
  warnings: string[]
}

export type LaunchResult = {
  campaign_id: string // Meta campaign ID
  adset_id: string
  creative_id: string
  ad_id: string
  status: 'ACTIVE' // Goes live immediately. The in-app preview IS the
  // eye-check — once the user hits Confirm, routing them back to Meta to
  // click Activate is pointless friction (and broke the "1 type + 1 click"
  // happy path rule). Policy flipped Apr 19 2026. If we ever need a safety
  // net again, add a setting — don't re-introduce the PAUSED default.
}

// ─── Pure preview builder — NO side effects ─────────────────────────────────
export function buildPreview(input: LaunchInput): LaunchPreview {
  const warnings: string[] = []

  // Budget sanity
  if (!input.daily_budget_gbp && !input.lifetime_budget_gbp) {
    warnings.push('No budget specified — Meta will reject.')
  }
  if (input.daily_budget_gbp && input.daily_budget_gbp < 1) {
    warnings.push(`Daily budget £${input.daily_budget_gbp} is below Meta's £1/day minimum.`)
  }
  if (input.targeting.age_min < 18) {
    warnings.push('Age min below 18 — Meta will reject for most objectives.')
  }

  // Estimated spend line (shown as plain text, wrapped in BlurredAmount at render time)
  let estSpend = 0
  let budgetLine = ''
  if (input.daily_budget_gbp && input.duration_days) {
    estSpend = input.daily_budget_gbp * input.duration_days
    budgetLine = `£${input.daily_budget_gbp}/day × ${input.duration_days}d = £${estSpend} max`
  } else if (input.daily_budget_gbp) {
    budgetLine = `£${input.daily_budget_gbp}/day (no end date set)`
    estSpend = input.daily_budget_gbp * 30 // assume 30d for rough estimate
  } else if (input.lifetime_budget_gbp) {
    estSpend = input.lifetime_budget_gbp
    budgetLine = `£${input.lifetime_budget_gbp} lifetime`
  }

  // Audience summary
  const t = input.targeting
  const audienceLine = [
    t.geo_locations.countries.join('/'),
    `${t.age_min}-${t.age_max}`,
    t.interests?.length ? `interests: ${t.interests.map(i => i.name).join(', ')}` : null,
    t.excluded_custom_audiences?.length
      ? `excl: ${t.excluded_custom_audiences.map(a => a.name || a.id).join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // Creative summary
  let creativeLine = ''
  if (input.creative.type === 'existing_ig_post') {
    creativeLine = `Boosting IG post ${input.creative.ig_post_id}`
  } else {
    creativeLine = `New image ad: "${input.creative.caption?.slice(0, 60)}${(input.creative.caption?.length ?? 0) > 60 ? '…' : ''}"`
  }

  // Build Meta payloads (what WILL be sent). Campaign + adset + ad all go
  // out as ACTIVE — the preview step is the approval gate, and anything
  // past Confirm should start spending immediately. See LaunchResult comment
  // above for the full rationale behind ditching the PAUSED default.
  const campaign: Record<string, unknown> = {
    name: input.name,
    objective: input.objective,
    status: 'ACTIVE',
    special_ad_categories: [], // required field, empty for music/artist ads
    buying_type: 'AUCTION',
    // Meta v25 requires explicit true/false when NOT using Campaign Budget
    // Optimisation (CBO). We put budget at the adset level, so set false.
    // Without this, the /campaigns endpoint rejects with code=100 subcode=4834011.
    is_adset_budget_sharing_enabled: false,
  }

  const adset: Record<string, unknown> = {
    name: `${input.name} — default adset`,
    status: 'ACTIVE',
    billing_event: 'IMPRESSIONS',
    optimization_goal: optimizationGoalFor(input.objective, input.intent),
    // Automatic bidding (no bid cap, no ROAS target). Meta v25 otherwise
    // rejects with code=100 subcode=2490487 "Bid amount or bid constraints
    // required" because it defaults to a strategy that requires a bid_amount.
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: buildMetaTargeting(input.targeting),
    start_time: new Date().toISOString(),
  }
  if (input.daily_budget_gbp) {
    adset.daily_budget = Math.round(input.daily_budget_gbp * 100) // pence
  }
  if (input.lifetime_budget_gbp) {
    adset.lifetime_budget = Math.round(input.lifetime_budget_gbp * 100)
  }
  if (input.duration_days) {
    const end = new Date(Date.now() + input.duration_days * 24 * 3600_000)
    adset.end_time = end.toISOString()
  }

  let creative: Record<string, unknown>
  if (input.creative.type === 'existing_ig_post') {
    creative = {
      name: `${input.name} — creative`,
      object_story_id: `${IG_ACTOR_ID}_${input.creative.ig_post_id}`,
      instagram_actor_id: IG_ACTOR_ID,
    }
  } else {
    creative = {
      name: `${input.name} — creative`,
      object_story_spec: {
        instagram_actor_id: IG_ACTOR_ID,
        link_data: {
          image_url: input.creative.image_url,
          link: input.creative.destination_url,
          message: input.creative.caption,
          call_to_action: input.creative.cta
            ? { type: input.creative.cta, value: { link: input.creative.destination_url } }
            : undefined,
        },
      },
    }
  }

  const ad: Record<string, unknown> = {
    name: `${input.name} — ad`,
    status: 'ACTIVE',
    // adset_id + creative_id injected at launch time (after adset/creative created)
  }

  return {
    summary: {
      name: input.name,
      objective: input.objective,
      intent: input.intent,
      budget_line: budgetLine,
      audience_line: audienceLine,
      creative_line: creativeLine,
      estimated_spend_gbp: estSpend,
    },
    meta_payloads: { campaign, adset, creative, ad },
    warnings,
  }
}

function optimizationGoalFor(obj: MetaObjective, intent: LaunchIntent): string {
  if (obj === 'OUTCOME_ENGAGEMENT') return 'POST_ENGAGEMENT'
  if (obj === 'OUTCOME_AWARENESS') {
    // Stage 1 of follower funnel = video views optimisation per the plan
    return intent === 'growth_stage_1' ? 'THRUPLAY' : 'REACH'
  }
  if (obj === 'OUTCOME_TRAFFIC') return 'LINK_CLICKS'
  if (obj === 'OUTCOME_LEADS') return 'LEAD_GENERATION'
  return 'POST_ENGAGEMENT'
}

function buildMetaTargeting(t: Targeting): Record<string, unknown> {
  const out: Record<string, unknown> = {
    geo_locations: t.geo_locations,
    age_min: t.age_min,
    age_max: t.age_max,
  }
  if (t.genders?.length) out.genders = t.genders
  if (t.interests?.length) {
    out.flexible_spec = [{ interests: t.interests }]
  }
  if (t.custom_audiences?.length) {
    out.custom_audiences = t.custom_audiences.map(a => ({ id: a.id }))
  }
  if (t.excluded_custom_audiences?.length) {
    out.excluded_custom_audiences = t.excluded_custom_audiences.map(a => ({ id: a.id }))
  }
  if (t.publisher_platforms?.length) out.publisher_platforms = t.publisher_platforms
  if (t.instagram_positions?.length) out.instagram_positions = t.instagram_positions
  if (t.facebook_positions?.length) out.facebook_positions = t.facebook_positions
  return out
}

// ─── Actual Meta API calls — side effects ───────────────────────────────────
async function metaPOST(
  path: string,
  token: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const url = `https://graph.facebook.com/${META_API_VERSION}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      error?: {
        message?: string
        type?: string
        code?: number | string
        error_subcode?: number | string
        error_user_title?: string
        error_user_msg?: string
        fbtrace_id?: string
        error_data?: { blame_field_specs?: string[][] }
      }
    }
    const e = err?.error || {}
    const parts: string[] = []
    if (e.message) parts.push(e.message)
    if (e.error_user_title) parts.push(`[${e.error_user_title}]`)
    if (e.error_user_msg) parts.push(e.error_user_msg)
    if (e.error_subcode) parts.push(`subcode=${e.error_subcode}`)
    if (e.code) parts.push(`code=${e.code}`)
    const blame = e.error_data?.blame_field_specs
    if (blame && blame.length) {
      parts.push(`fields=${blame.map(f => (Array.isArray(f) ? f.join('.') : f)).join(',')}`)
    }
    if (e.fbtrace_id) parts.push(`trace=${e.fbtrace_id}`)
    const msg = parts.length ? parts.join(' | ') : `Meta ${res.status}`
    // Also log the full body + request to the Worker so `wrangler tail` can see
    // exactly what Meta rejected. Redact token.
    const redactedBody = { ...body, access_token: '[REDACTED]' }
    console.error('[meta_api_error]', { path, status: res.status, error: err, request: redactedBody })
    throw new Error(`Meta API ${path}: ${msg}`)
  }
  return res.json()
}

/**
 * Launches campaign/adset/creative/ad on Meta, all ACTIVE — the Signal Lab
 * preview step (summary + budget + audience + creative) IS the approval
 * gate. Once the user hits Confirm, the ad goes live. We do not send users
 * to Meta for a second activate click — that was duplicate friction and
 * broke the "1 type + 1 click" happy path rule.
 *
 * `feedback_approve_before_send.md` is still honoured: nothing fires
 * without the rendered preview + explicit go. The go just means "go", not
 * "go halfway".
 */
export async function launchToMeta(input: LaunchInput, token: string): Promise<LaunchResult> {
  const preview = buildPreview(input)

  // 1. Campaign
  const campaignRes = await metaPOST(
    `/${AD_ACCOUNT_ID}/campaigns`,
    token,
    preview.meta_payloads.campaign
  )
  const campaign_id = campaignRes.id as string
  if (!campaign_id) throw new Error('Meta returned no campaign ID')

  // 2. Adset (link to campaign)
  const adsetPayload = { ...preview.meta_payloads.adset, campaign_id }
  const adsetRes = await metaPOST(`/${AD_ACCOUNT_ID}/adsets`, token, adsetPayload)
  const adset_id = adsetRes.id as string
  if (!adset_id) throw new Error('Meta returned no adset ID')

  // 3. Creative
  const creativeRes = await metaPOST(
    `/${AD_ACCOUNT_ID}/adcreatives`,
    token,
    preview.meta_payloads.creative
  )
  const creative_id = creativeRes.id as string
  if (!creative_id) throw new Error('Meta returned no creative ID')

  // 4. Ad (link adset + creative)
  const adPayload = {
    ...preview.meta_payloads.ad,
    adset_id,
    creative: { creative_id },
  }
  const adRes = await metaPOST(`/${AD_ACCOUNT_ID}/ads`, token, adPayload)
  const ad_id = adRes.id as string
  if (!ad_id) throw new Error('Meta returned no ad ID')

  return {
    campaign_id,
    adset_id,
    creative_id,
    ad_id,
    status: 'ACTIVE',
  }
}

export const META_CONFIG = { AD_ACCOUNT_ID, IG_ACTOR_ID, API_VERSION: META_API_VERSION }
