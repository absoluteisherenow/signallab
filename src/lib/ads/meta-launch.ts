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
// NM's Facebook Page ID. Discovered by inspecting the known-good Vespers
// creative from April 2026 which used `page_id: 672061975991340`. This Page
// is shared to ad account act_831371654092961 but lives outside the token's
// own Business Manager (which only owns the A B S O L U T E page), so it
// doesn't surface via /me/accounts — the ID has to be hard-coded or pulled
// from a prior creative.
const NM_FB_PAGE_ID = '672061975991340'
// @absolute (token owner) — hard-blocked from ever being used as the ad
// creative's instagram_user_id. Signal Lab is NM-only on the publish side.
const BLOCKED_IG_IDS = new Set(['17841400093363542'])
const IG_ACTOR_ID = process.env.META_IG_ACTOR_ID || NM_IG_ID
const FB_PAGE_ID = process.env.META_FB_PAGE_ID || NM_FB_PAGE_ID

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
    // EU Digital Services Act (DSA) — mandatory since 2024 for ads reaching
    // EU/EEA users, enforced by Meta globally. Without these fields, the
    // /adsets endpoint rejects with code=100 subcode=3858081 "No advertiser
    // indicated". `dsa_beneficiary` = who the ad promotes; `dsa_payor` =
    // who's paying. Both are NIGHT manoeuvres for NM campaigns. Override
    // via env if Signal Lab ever hosts other artists.
    dsa_beneficiary: process.env.META_DSA_BENEFICIARY || 'NIGHT manoeuvres',
    dsa_payor: process.env.META_DSA_PAYOR || 'NIGHT manoeuvres',
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

  // Modern v25 uses `instagram_user_id` at the TOP level of the creative
  // (the legacy `instagram_actor_id` was deprecated in v22 and removed
  // Sept 9 2025 — Meta now rejects it outright with code=100 "must be a
  // valid Instagram account id").
  //
  // Two mutually-exclusive promoted-object paths:
  //   1. Boost existing IG post → `source_instagram_media_id` alone IS the
  //      promoted object. Adding `object_story_spec` alongside triggers
  //      code=100 subcode=1487929 "Ambiguous promoted object fields —
  //      you must specify only one".
  //   2. New creative (image + caption + link) → `object_story_spec` with
  //      `page_id` + `link_data` describes what to promote; no source id.
  let creative: Record<string, unknown>
  if (input.creative.type === 'existing_ig_post') {
    creative = {
      name: `${input.name} — creative`,
      source_instagram_media_id: input.creative.ig_post_id,
      instagram_user_id: IG_ACTOR_ID,
    }
  } else {
    creative = {
      name: `${input.name} — creative`,
      object_story_spec: {
        page_id: FB_PAGE_ID,
        link_data: {
          image_url: input.creative.image_url,
          link: input.creative.destination_url,
          message: input.creative.caption,
          call_to_action: input.creative.cta
            ? { type: input.creative.cta, value: { link: input.creative.destination_url } }
            : undefined,
        },
      },
      instagram_user_id: IG_ACTOR_ID,
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
    // Advantage Audience flag — Meta's auto-expand feature. Required on every
    // new adset since 2024; without it the /adsets endpoint rejects with
    // code=100 subcode=1870227 "Advantage audience flag required". We disable
    // it (value 0) because Signal Lab picks tight, researched interest
    // targets on purpose — letting Meta silently widen the audience defeats
    // the hypothesis-vs-actual read we rely on for Reports. Flip to 1 only
    // when explicitly launching an Advantage+ experiment.
    targeting_automation: { advantage_audience: 0 },
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

// ─── IG video boost resolution ──────────────────────────────────────────────
//
// Meta rejects `source_instagram_media_id` for IG *video* posts with code=100
// subcode=1815279 "Instagram video must be uploaded to Facebook". The ad API
// specifically requires the business-level IG↔FB crosspost handshake; the
// consumer-facing "Share to Facebook" toggle on individual posts produces a
// FB copy but doesn't create the link the ad API is looking for.
//
// Strategy — two-tier, cheapest first:
//
//   1. PRIMARY — find the existing FB Page post that corresponds to the IG
//      video (via `/{page_id}/videos` scanned within a time window around the
//      IG post's timestamp). If found, reference it directly via
//      `object_story_id: "{page_id}_{fb_post_id}"` — no upload, no transcoding
//      wait, no duplicate on the Page. This handles the most common case:
//      the user already shared the post to FB via IG's native toggle or has
//      IG→FB crossposting enabled on the Page.
//
//   2. FALLBACK — if no crossposted FB post exists in the window, mirror the
//      video directly onto the ad account via `/act_xxx/advideos`, poll until
//      Meta finishes transcoding, and build the creative via
//      `object_story_spec.video_data.video_id`. This handles videos that
//      never made it to the Page at all.
//
// For IMAGE / CAROUSEL_ALBUM: `source_instagram_media_id` works as-is — only
// videos trigger subcode 1815279.

type IgMediaMeta = {
  id?: string
  media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | string
  media_url?: string
  thumbnail_url?: string
  caption?: string
  permalink?: string
  timestamp?: string
}

async function fetchIgMediaMeta(igMediaId: string, token: string): Promise<IgMediaMeta> {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${igMediaId}?fields=id,media_type,media_url,thumbnail_url,caption,permalink,timestamp&access_token=${encodeURIComponent(
    token
  )}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`IG media fetch failed (${res.status}) for ${igMediaId}: ${body.slice(0, 300)}`)
  }
  return (await res.json()) as IgMediaMeta
}

/**
 * Scans the NM Page's recent videos for one corresponding to the IG post
 * being boosted. Returns the full FB post ID (`{page_id}_{post_id}`) if found,
 * or `null` if no match.
 *
 * Two modes:
 *   - anchorMs provided (IG timestamp available) → require ±30 min match
 *     for high-confidence pairing
 *   - anchorMs null (IG metadata unavailable — System User tokens often lack
 *     `instagram_basic` scope, so /{ig_media_id} GETs fail) → pick the MOST
 *     RECENT Page video within the last 72h. Safe for Stage 1 growth boosts
 *     which always target the latest best-performing post.
 *
 * If neither mode matches, returns null and callers fall through to the
 * /advideos upload path or fail with a clear message.
 */
async function findCrosspostedFbPost(
  anchorMs: number | null,
  token: string
): Promise<string | null> {
  const nowMs = Date.now()
  let sinceSec: number
  let untilSec: number
  if (anchorMs !== null && Number.isFinite(anchorMs)) {
    sinceSec = Math.floor((anchorMs - 60 * 60_000) / 1000) // 1h before IG post
    untilSec = Math.floor((anchorMs + 6 * 60 * 60_000) / 1000) // 6h after
  } else {
    // Fallback: pick the most recent video in the last 72h
    sinceSec = Math.floor((nowMs - 72 * 60 * 60_000) / 1000)
    untilSec = Math.floor(nowMs / 1000)
  }
  const url = `https://graph.facebook.com/${META_API_VERSION}/${FB_PAGE_ID}/videos?fields=id,post_id,created_time,description&since=${sinceSec}&until=${untilSec}&limit=50&access_token=${encodeURIComponent(
    token
  )}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) {
    // Missing page_read_engagement / pages_show_list scope is the usual cause.
    // Don't throw — let the caller fall through.
    const body = await res.text().catch(() => '')
    console.warn('[fb_video_scan_skipped]', res.status, body.slice(0, 200))
    return null
  }
  const json = (await res.json()) as {
    data?: Array<{ id: string; post_id?: string; created_time?: string; description?: string }>
  }
  const vids = (json.data || []).filter(v => v.post_id && v.created_time)
  if (!vids.length) return null

  let picked: { postId: string; createdMs: number } | null = null
  if (anchorMs !== null && Number.isFinite(anchorMs)) {
    // Tight match — closest created_time to the IG anchor, ≤30 min delta
    let best: { postId: string; delta: number } | null = null
    for (const v of vids) {
      const t = new Date(v.created_time!).getTime()
      const delta = Math.abs(t - anchorMs)
      if (!best || delta < best.delta) best = { postId: v.post_id!, delta }
    }
    if (best && best.delta <= 30 * 60_000) {
      picked = { postId: best.postId, createdMs: anchorMs }
    }
  } else {
    // Loose match — most recent Page video in the last 72h
    let mostRecent: { postId: string; t: number } | null = null
    for (const v of vids) {
      const t = new Date(v.created_time!).getTime()
      if (!mostRecent || t > mostRecent.t) mostRecent = { postId: v.post_id!, t }
    }
    if (mostRecent) picked = { postId: mostRecent.postId, createdMs: mostRecent.t }
  }
  if (!picked) return null
  // /{page}/videos returns `post_id` already in `{page_id}_{post_id}` form.
  // Defensive prefix in case Meta ever changes it.
  return picked.postId.includes('_') ? picked.postId : `${FB_PAGE_ID}_${picked.postId}`
}

async function mirrorIgVideoToFacebook(
  mediaUrl: string,
  name: string,
  token: string
): Promise<string> {
  // 1. Upload by file_url — Meta fetches the CDN-signed IG URL server-side
  const uploadUrl = `https://graph.facebook.com/${META_API_VERSION}/${AD_ACCOUNT_ID}/advideos`
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_url: mediaUrl,
      name: name.slice(0, 100),
      access_token: token,
    }),
    signal: AbortSignal.timeout(30000),
  })
  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => '')
    throw new Error(`FB advideos upload failed (${uploadRes.status}): ${body.slice(0, 400)}`)
  }
  const uploadJson = (await uploadRes.json()) as { id?: string }
  const fbVideoId = uploadJson.id
  if (!fbVideoId) throw new Error('FB advideos upload returned no video ID')

  // 2. Poll until Meta finishes transcoding. Usually 10–30s, hard timeout at 90s
  //    (longer would break the launch UX — tell the user to retry instead).
  const start = Date.now()
  const timeoutMs = 90_000
  const pollIntervalMs = 3000
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, pollIntervalMs))
    const statusUrl = `https://graph.facebook.com/${META_API_VERSION}/${fbVideoId}?fields=status&access_token=${encodeURIComponent(
      token
    )}`
    const statusRes = await fetch(statusUrl, { signal: AbortSignal.timeout(10000) })
    if (!statusRes.ok) continue // transient, keep polling
    const j = (await statusRes.json()) as {
      status?: { video_status?: string; processing_phase?: { status?: string } }
    }
    const vs = j.status?.video_status
    if (vs === 'ready') return fbVideoId
    if (vs === 'error') {
      throw new Error(`FB video ${fbVideoId} transcode failed (status=error) — try another post`)
    }
    // otherwise 'processing' / 'encoding' — keep polling
  }
  throw new Error(
    `FB video ${fbVideoId} still transcoding after ${timeoutMs / 1000}s — wait a minute and relaunch`
  )
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
  //
  // For IG-post boosts, resolve the actual creative payload at launch time:
  //   - IMAGE/CAROUSEL → keep `source_instagram_media_id` (preview payload)
  //   - VIDEO (or unknown type) → try the crossposted FB post on the NM Page
  //     via object_story_id; fall back to /advideos upload if the mirror
  //     metadata is available.
  //
  // IG metadata fetch is best-effort: the System User token used for ads
  // typically lacks `instagram_basic` scope, so /{ig_media_id} GETs return
  // "missing permissions". We wrap in try/catch and fall through to a
  // timestamp-less /videos scan that picks the most recent Page video in
  // the last 72h. Safe for Stage 1 growth boosts (always target latest).
  let creativePayload: Record<string, unknown> = preview.meta_payloads.creative
  if (input.creative.type === 'existing_ig_post') {
    let ig: IgMediaMeta | null = null
    try {
      ig = await fetchIgMediaMeta(input.creative.ig_post_id, token)
    } catch (err) {
      console.warn('[ig_media_fetch_skipped]', String(err).slice(0, 300))
    }

    // If we couldn't read the IG post, we don't know if it's video or image.
    // Default to "try video resolution" — if it's actually a photo/carousel
    // the crosspost scan still works (FB stores them too in some cases) and
    // we fall back to source_instagram_media_id only if we're confident it's
    // not a video. Safer to try the crosspost path first.
    const isVideoOrUnknown = !ig || ig.media_type === 'VIDEO'

    if (isVideoOrUnknown) {
      const anchorMs = ig?.timestamp ? new Date(ig.timestamp).getTime() : null
      const fbObjectStoryId = await findCrosspostedFbPost(anchorMs, token)

      if (fbObjectStoryId) {
        // Tier 1: boost the existing FB crosspost via object_story_id
        creativePayload = {
          name: `${input.name} — creative`,
          object_story_id: fbObjectStoryId,
          instagram_user_id: IG_ACTOR_ID,
        }
      } else if (ig?.media_type === 'VIDEO' && ig.media_url) {
        // Tier 2: mirror video to FB ad account, reference by video_id.
        // Only reachable when we have confirmed-video metadata AND a
        // media_url — if IG fetch failed we can't mirror.
        const fbVideoId = await mirrorIgVideoToFacebook(
          ig.media_url,
          `${input.name} — video`,
          token
        )
        creativePayload = {
          name: `${input.name} — creative`,
          object_story_spec: {
            page_id: FB_PAGE_ID,
            video_data: {
              video_id: fbVideoId,
              image_url: ig.thumbnail_url,
              message: ig.caption || input.name,
            },
          },
          instagram_user_id: IG_ACTOR_ID,
        }
      } else if (!ig) {
        // IG fetch failed AND no crosspost found. Fall back to the original
        // source_instagram_media_id payload from buildPreview — will work
        // if the post is actually a photo/carousel, will fail with 1815279
        // if it's a video. Better than silently picking the wrong FB post.
        console.warn(
          '[ads_launch] IG metadata unavailable and no recent FB crosspost found — ' +
            'falling back to source_instagram_media_id. Video posts will likely fail.'
        )
      } else {
        // ig.media_type === 'VIDEO' but no media_url — IG post may have been
        // deleted or is still uploading. Fail clearly so the user knows.
        throw new Error(
          `IG post ${input.creative.ig_post_id} is a video but has no accessible ` +
            `media_url, and no matching FB crosspost was found on the NM Page. ` +
            `Share the post to Facebook manually, then retry.`
        )
      }
    }
    // IMAGE / CAROUSEL_ALBUM with confirmed metadata — leave the original
    // `source_instagram_media_id` path alone.
  }

  const creativeRes = await metaPOST(
    `/${AD_ACCOUNT_ID}/adcreatives`,
    token,
    creativePayload
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
