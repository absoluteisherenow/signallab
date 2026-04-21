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

const RELEASE_PRIMER = `Release campaign framework (4 phases):
1. Seeding (T-6 to T-3 weeks) — vague mood-setters, no release date yet. Studio hints, aesthetic posts.
2. Announcement (T-3 to T-1 week) — name + date + pre-save/bandcamp link. 2-3 posts.
3. Release week (T-7 days to +3 days) — daily presence. Platform-specific formats.
4. Long tail (+3 days to +6 weeks) — remix teases, DJ play clips, fan content, reviews.

Never: countdown graphics, "Pre-save now!!!", engagement bait, begging energy.`

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

// --- Task → primer composition ---------------------------------------------

function compose(task: TaskType): string[] {
  const sections: string[] = [CORE_PRINCIPLE]

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
    case 'release.rollout':
      sections.push(RELEASE_PRIMER, INSTAGRAM_PRIMER, CAPTION_FORMATTING)
      break
    case 'gig.content':
    case 'gig.advance':
    case 'gig.recap':
      sections.push(GIG_PRIMER, INSTAGRAM_PRIMER, CAPTION_FORMATTING)
      break
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
      // Pure data task — no strategy block.
      return []
    default:
      // gmail.scan, invoice.*, assistant-internal etc — skip primer.
      return []
  }

  return sections
}

/**
 * Build the strategy primer block for a task. Returns an empty string when no
 * primer applies (invoice / gmail / data tasks) so the brain can skip the
 * section entirely.
 */
export function buildStrategyPrimer(task: TaskType): string {
  const sections = compose(task)
  if (!sections.length) return ''
  return `# Strategy primer\n${sections.join('\n\n')}`
}
