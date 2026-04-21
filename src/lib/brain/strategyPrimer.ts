// Strategy primer — condensed platform/algorithm/release-phase knowledge for
// underground electronic music artists, ported from the
// underground-music-social-media skill (~/.claude/skills/underground-music-social-media/SKILL.md).
//
// This replaces the 200-300 line bespoke strategy blocks scattered across
// chainCaptionGen, assistant, /agents/gig-content, /agents/weekly-content.
// The brain injects the relevant primer section per TaskType so every AI call
// sees the same strategy playbook instead of a hand-rolled copy.
//
// Keep sections short, actionable, model-friendly. Each block must be safe to
// paste into a system prompt without further processing.

import type { TaskType } from '../rules/types'
import type { OperatingContext } from '../operatingContext'

const CORE_PRINCIPLE = `Core principle: the artist should look like someone people discover, not someone selling themselves. Credibility is currency in underground music — every post either builds or erodes it.`

// --- Per-platform caption primers -------------------------------------------

const INSTAGRAM_PRIMER = `Platform: Instagram (2025-2026 algorithm).
- Ranking signals prioritise watch time (Reels), saves, shares (DMs), profile visits from Explore.
- Reels 15-60s — studio clips, live set snippets, gear/vinyl with movement. Grainy/raw > polished.
- Carousels 3-5 slides max — gig photos, tour diary, release art. Saves > likes.
- Stories daily, grid 3-4/week, Reels 1-2/week.
- Hashtags: 3-8 targeted only. Never #musicproducer #edm #followforfollow.
- Never: engagement bait ("tag a friend", "which track?"), corporate openers, "link in bio" as standalone CTA.
- 70% world-building (taste, process, vibe) / 30% direct promo.`

const TIKTOK_PRIMER = `Platform: TikTok (discovery engine, ignores follower count).
- Ranking: completion rate + rewatches + shares. Hook in first 0.5s — sound-first, visuals second.
- Optimal 15-30s. One clear idea per video.
- High performers: "making [genre] with [hardware]", before/after sound design, DAW screen recordings, crate digging, "what [city] sounds like at 3am".
- Never cross-post from IG with watermark — algorithm buries.
- Captions short, slightly cryptic. Don't over-explain.
- Post natively. Engage in comments within first 30min (algorithm window).`

const THREADS_PRIMER = `Platform: Threads.
- Text-first, conversational. One strong thought per post.
- Short sentences. Don't paste Instagram captions verbatim.
- Links get de-prioritised — lead with the idea, park the link at the end or in reply.`

// --- Task-specific primers --------------------------------------------------

const RELEASE_PRIMER_OVERVIEW = `Release campaign framework (4 phases):
1. Seeding (T-6 to T-3 weeks) — vague mood-setters, no release date yet. Studio hints, aesthetic posts.
2. Announcement (T-3 to T-1 week) — name + date + pre-save/bandcamp link. 2-3 posts.
3. Release week (T-7 days to +3 days) — daily presence. Platform-specific formats.
4. Long tail (+3 days to +6 weeks) — remix teases, DJ play clips, fan content, reviews.

Never: countdown graphics, "Pre-save now!!!", engagement bait, begging energy.`

const RELEASE_PHASE_SEEDING = `CURRENT PHASE: SEEDING (T-6 to T-3 weeks before release).
- Goal: build curiosity WITHOUT revealing anything concrete.
- Post 2-3/week: 15s studio clips, sound-design moments, mood images, crate posts.
- NO release title, NO date, NO label name, NO artwork yet.
- Captions: evocative phrases, breadcrumbs toward influences. Single words, no CTAs.`

const RELEASE_PHASE_ANNOUNCE = `CURRENT PHASE: ANNOUNCEMENT (T-3 to T-1 week).
- Goal: ONE clean reveal, then show different facets without re-announcing.
- Announce day: artwork + title + date + label. Clean format: "[title]. [label]. [date]."
- Then 2-3 posts over the week: making-of moment, 30s preview, different angle (live version / behind art).
- Pre-save link: Stories only, never in feed captions (unless label insists).`

const RELEASE_PHASE_RELEASE_WEEK = `CURRENT PHASE: RELEASE WEEK (release day -1 to +3).
- Goal: convert attention to streams/sales. This is your 30% promo window.
- Daily presence. Day -1 tease, release-day pin, day +1 atmosphere, day +2 behind-the-scenes carousel, day +3 reshare support.
- Release-day post gets pinned. Don't thank-post unless thanking something specific.
- Film any live set using the track — best possible content.`

const RELEASE_PHASE_LONG_TAIL = `CURRENT PHASE: LONG TAIL (+3 days to +6 weeks).
- Goal: keep the track alive without forcing it. Underground music doesn't peak in 48h.
- 1-2 posts/week integrated into normal posting. Live clips, new press reshares, alternative edits.
- DO reshare DJ support, playlist adds, blog features whenever they arrive.
- Don't force it. Let it breathe between posts.`

const GIG_PHASE_ANNOUNCE = `CURRENT PHASE: GIG ANNOUNCE (T-2 weeks).
- Lead with venue or co-bill, not the ticket CTA.
- One clean post: line-up / context / why this one matters.`

const GIG_PHASE_CONTEXT = `CURRENT PHASE: GIG CONTEXT (T-1 week).
- One contextual post: artwork, prep, history with venue/promoter.
- Stories only for hype. No countdowns.`

const GIG_PHASE_DAY_OF = `CURRENT PHASE: DAY-OF.
- Story presence only: soundcheck, crowd-eye-view, booth POV — not selfies.
- Keep grid restraint. No "Tonight!!!" posts.`

const GIG_PHASE_RECAP = `CURRENT PHASE: RECAP (day-after → +3 days).
- ONE considered recap: short caption, one strong image or 8-15s clip.
- Tag promoter/venue in first comment, never caption.
- No crowd-hyping language, no hype adjectives.`

const GIG_PRIMER = `Gig content framework:
- T-2 weeks: announce line-up / context. Lead with venue or co-bill, not the ticket CTA.
- T-1 week: one contextual post (art, prep, history with venue/promoter).
- Day-of: story presence (soundcheck, crowd-eye-view — not selfies). Keep grid restraint.
- Day-after: one considered recap — short caption, one strong image or 8-15s clip. Tag promoter/venue in first comment, never caption.
- Never: "Tonight!!!", "Grab your tickets", hype adjectives, crowd-hyping language.`

const ADS_PRIMER = `Ads creative framework (Meta/TikTok):
- Underground credibility > reach. Don't boost posts that look like ads.
- Best performers: organic-feeling 9:16, no watermarks, no captions overlay unless part of the aesthetic.
- Audio-first on TikTok/Reels ads. First frame must be the hook — not a title card.
- Retarget IG/TikTok engagers + lookalikes of fans, not cold interest-based "electronic music" (too broad).
- Creative rotation: refresh every 7-14 days. Fatigue is real.`

const ASSISTANT_PRIMER = `You are an operator's assistant for an underground electronic music artist — not a marketing consultant. Be direct, terse, grounded. Never hype. Never suggest "engagement strategies". When giving advice, cite specifics from the artist's data if present; otherwise say you don't know.`

const CAPTION_FORMATTING = `Caption formatting — global:
- No em-dashes. Use commas, periods, or line breaks.
- No exclamation marks.
- @mentions go in the first-comment or user_tags field, never in the caption body.
- Straight quotes only.
- Default to lowercase unless a proper noun demands capitalisation.`

// --- Phase detection --------------------------------------------------------

function daysBetween(a: string | Date, b: string | Date): number {
  const da = typeof a === 'string' ? new Date(a) : a
  const db = typeof b === 'string' ? new Date(b) : b
  return (da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24)
}

/** Returns which release-phase primer applies based on days until release_date. */
function pickReleasePhase(daysUntil: number): string {
  if (daysUntil > 21) return RELEASE_PHASE_SEEDING
  if (daysUntil > 3) return RELEASE_PHASE_ANNOUNCE
  if (daysUntil > -7) return RELEASE_PHASE_RELEASE_WEEK
  if (daysUntil > -42) return RELEASE_PHASE_LONG_TAIL
  return RELEASE_PRIMER_OVERVIEW // >6 weeks post — overview only
}

/** Returns which gig-phase primer applies based on days until gig date. */
function pickGigPhase(daysUntil: number): string {
  if (daysUntil > 7) return GIG_PHASE_ANNOUNCE
  if (daysUntil > 1) return GIG_PHASE_CONTEXT
  if (daysUntil >= -0.5) return GIG_PHASE_DAY_OF
  if (daysUntil > -4) return GIG_PHASE_RECAP
  return GIG_PRIMER // further out / further past — generic
}

// --- Task → primer composition ---------------------------------------------

function compose(task: TaskType, ctx?: OperatingContext): string[] {
  const sections: string[] = [CORE_PRINCIPLE]
  const today = new Date()

  switch (task) {
    case 'caption.instagram':
      sections.push(INSTAGRAM_PRIMER, CAPTION_FORMATTING)
      break
    case 'caption.tiktok':
      sections.push(TIKTOK_PRIMER, CAPTION_FORMATTING)
      break
    case 'caption.threads':
      sections.push(THREADS_PRIMER, CAPTION_FORMATTING)
      break
    case 'release.announce':
    case 'release.rollout': {
      const rel = ctx?.priority.release
      if (rel?.release_date) {
        const d = daysBetween(rel.release_date, today)
        sections.push(pickReleasePhase(d), INSTAGRAM_PRIMER, CAPTION_FORMATTING)
      } else {
        sections.push(RELEASE_PRIMER_OVERVIEW, INSTAGRAM_PRIMER, CAPTION_FORMATTING)
      }
      break
    }
    case 'gig.content':
    case 'gig.advance':
    case 'gig.recap': {
      const gig = ctx?.priority.gig
      if (gig?.date) {
        const d = daysBetween(gig.date, today)
        sections.push(pickGigPhase(d), INSTAGRAM_PRIMER, CAPTION_FORMATTING)
      } else {
        sections.push(GIG_PRIMER, INSTAGRAM_PRIMER, CAPTION_FORMATTING)
      }
      break
    }
    case 'ad.creative':
    case 'ad.launch':
      sections.push(ADS_PRIMER)
      break
    case 'assistant.chat':
      sections.push(ASSISTANT_PRIMER)
      break
    case 'brief.weekly':
      sections.push(INSTAGRAM_PRIMER, GIG_PRIMER, CAPTION_FORMATTING)
      break
    case 'trend.scan':
      return []
    default:
      return []
  }

  return sections
}

/**
 * Build the strategy primer block for a task. Returns an empty string when no
 * primer applies (invoice / gmail / data tasks) so the brain can skip the
 * section entirely. When `ctx` is supplied, release/gig primers auto-select
 * the phase-specific block (seeding / announce / release week / long tail
 * for releases; announce / context / day-of / recap for gigs).
 */
export function buildStrategyPrimer(task: TaskType, ctx?: OperatingContext): string {
  const sections = compose(task, ctx)
  if (!sections.length) return ''
  return `# Strategy primer\n${sections.join('\n\n')}`
}
