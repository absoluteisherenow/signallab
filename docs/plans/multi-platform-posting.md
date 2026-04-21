# Multi-Platform Posting: TikTok + YouTube Shorts

**Goal:** Post the same Reel/Short to IG + TikTok + YouTube Shorts simultaneously from one Signal Lab draft, preserving the existing approve-before-send flow.

---

## 1. Current state (what we extend, not replace)

- `scheduled_posts` table already has a `platform` column — today only `"instagram"` is written.
- Existing pipeline: draft → preview modal → `preview_approved_at` → `/api/crons/publish-scheduled` picks up due rows → calls IG Graph API → sets `published_post_id` / `platform_post_id`.
- OAuth pattern already proven via `/api/social/instagram/{auth,callback,deauth}`.

**Design rule:** one `scheduled_posts` row per platform, grouped by existing `post_group_id`. The cron fans out by platform. Nothing about IG's flow changes.

---

## 2. API access paths

### YouTube Shorts — **YouTube Data API v3** (straightforward)
- **Auth:** Google OAuth 2.0 (`youtube.upload` scope).
- **Endpoint:** `videos.insert` (resumable upload), part=`snippet,status`.
- **Shorts trigger:** vertical 9:16 ≤ 60s + `#Shorts` in title or description.
- **Quota cost:** 1,600 units per upload; daily quota = 10,000 → ~6 uploads/day default. Plenty.
- **Gotcha:** first upload per channel requires manual channel verification (phone).

### TikTok — **Content Posting API** (gated)
Two sub-options:

**a) Direct Post** (fully automated, what we want)
- Requires app approval: privacy policy URL, live domain, demo video of flow.
- Endpoint: `/v2/post/publish/video/init/` → upload chunks → `/publish/status/fetch/`.
- Timeline: ~1–4 weeks for approval.

**b) Share Kit / "Upload" mode** (user finishes in TT app)
- Works immediately, no approval.
- We push the MP4 + caption to the TT app; Anthony taps "Post".
- Fallback while Direct Post is in review.

**Plan:** submit Direct Post application **day 1**; ship Share Kit in the meantime so the feature is live.

---

## 3. Schema changes

Additive only. Migration `20260421_multi_platform_posting.sql`:

```sql
-- platform expands beyond 'instagram'
ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS platform_metadata JSONB DEFAULT '{}'::jsonb;
  -- stores { yt_video_id, yt_privacy, tt_publish_id, tt_share_mode, title, tags[] }

CREATE INDEX IF NOT EXISTS scheduled_posts_group_idx
  ON scheduled_posts(post_group_id);

-- OAuth tokens for new platforms (reuse existing connected_social_accounts table)
-- provider ∈ ('instagram','tiktok','youtube')
-- access_token / refresh_token / expires_at already exist.
```

No destructive changes; IG rows keep working.

---

## 4. File additions / changes

### New API routes
- `src/app/api/social/tiktok/auth/route.ts` — start OAuth
- `src/app/api/social/tiktok/callback/route.ts` — exchange code, store token
- `src/app/api/social/tiktok/post/route.ts` — publish one row (Direct or Share)
- `src/app/api/social/youtube/auth/route.ts`
- `src/app/api/social/youtube/callback/route.ts`
- `src/app/api/social/youtube/post/route.ts` — resumable upload + `videos.insert`

### New libs
- `src/lib/tiktok.ts` — upload chunks, poll status, token refresh
- `src/lib/youtube.ts` — resumable upload helper, token refresh

### Changed
- `src/app/api/crons/publish-scheduled/route.ts` — switch on `row.platform`, dispatch to correct publisher. IG path untouched.
- Compose/preview UI — add **platform checkboxes** (IG / TT / YT), per-platform caption override field (TT/YT need shorter titles, no @tags). One click "Approve all" creates N rows sharing `post_group_id`.
- Preview modal — render all three previews side-by-side; approval stamps `preview_approved_at` on every row in the group.

---

## 5. Caption / metadata fan-out rules

| Field | IG | TikTok | YouTube Shorts |
|---|---|---|---|
| Primary text | caption (2200ch) | caption (2200ch, no em-dash) | description (5000ch) |
| Title | — | — | ≤100ch, auto from first caption line |
| Hashtags | first-comment (existing rule) | end of caption | end of description + `#Shorts` |
| @mentions | first-comment (existing rule) | in caption OK | description OK |
| Media | existing | same MP4 | same MP4 |

Caption transformer lives in `src/lib/multiPlatformCaption.ts`; NM voice engine rules (no em-dash, NIGHT manoeuvres casing, etc.) apply pre-transform.

---

## 6. Render pipeline

Single 9:16 MP4 feeds all three — **no re-render needed** since Reels/TT/Shorts share specs (1080×1920, ≤60s for Shorts, ≤90s IG, ≤10min TT). Constrain to **≤60s** when any row in the group targets YT Shorts.

---

## 7. Ship order

1. **Migration** (platform_metadata column, index) — 10 min.
2. **YouTube path end-to-end** (easier API, faster win) — auth, callback, lib, route, cron dispatch.
3. **TikTok Direct Post application submitted** (privacy policy + demo video).
4. **TikTok Share Kit path** (works today, fallback).
5. **Compose UI** — platform checkboxes + per-platform caption override + multi-preview modal.
6. **Cron dispatcher switch** — route by `row.platform`.
7. **Swap TT path from Share Kit → Direct Post** once approval lands.

Each step is independently shippable; IG continues working untouched.

---

## 8. Risks / open questions

- **TT Direct Post approval** — not guaranteed; Share Kit is the hard fallback. OK.
- **YT quota** — 6 uploads/day cap. If we ever scale past that, request quota bump (free).
- **Token refresh** — all three providers have different refresh semantics; centralise in `refreshProviderToken(provider, account)` helper.
- **Preview fidelity** — TT/YT previews are harder to mock than IG. Use platform-native aspect ratio + caption + thumbnail crop; don't try to pixel-match each app's chrome.
- **Approve-before-send guardrail** — dispatcher must assert `preview_approved_at IS NOT NULL` per row, not per group, so a partial approval can't accidentally fan out.
