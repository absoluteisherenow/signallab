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
const IG_ACTOR_ID = process.env.META_IG_ACTOR_ID || '17841400093363542' // @nightmanoeuvres

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
  status: 'PAUSED' // always launch paused — user activates from dashboard after one more eye check
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

  // Build Meta payloads (what WILL be sent)
  const campaign: Record<string, unknown> = {
    name: input.name,
    objective: input.objective,
    status: 'PAUSED', // always launch paused
    special_ad_categories: [], // required field, empty for music/artist ads
    buying_type: 'AUCTION',
  }

  const adset: Record<string, unknown> = {
    name: `${input.name} — default adset`,
    status: 'PAUSED',
    billing_event: 'IMPRESSIONS',
    optimization_goal: optimizationGoalFor(input.objective, input.intent),
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
    status: 'PAUSED',
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
    const err = await res.json().catch(() => ({}))
    const msg = (err as { error?: { message?: string } })?.error?.message || `Meta ${res.status}`
    throw new Error(`Meta API ${path}: ${msg}`)
  }
  return res.json()
}

/**
 * Launches campaign/adset/creative/ad on Meta. All resources created PAUSED
 * so user does one final activate step in the dashboard. This matches the
 * `feedback_approve_before_send.md` spirit even post-approval — nothing is
 * accidentally spending by the time Meta accepts the payload.
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
    status: 'PAUSED',
  }
}

export const META_CONFIG = { AD_ACCOUNT_ID, IG_ACTOR_ID, API_VERSION: META_API_VERSION }
