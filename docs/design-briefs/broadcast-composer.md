# Broadcast Composer — Redesign Brief for claude.ai/design

**Screen:** `/broadcast` (desktop only — mobile renders `<MobileUpload />`)
**Component:** `src/components/broadcast/BroadcastLab.tsx` (2,481 lines) + `UnifiedComposer.tsx` (987 lines)
**Current state screenshot:** `./assets/broadcast-full-1440.png`
**Goal:** Consolidate content hierarchy. Elevate the hot path (media → generate → approve → post). Surface intelligence (trends, capture list, performance) as always-on rather than buried.

---

## Brand system (non-negotiable)

**BRT (Brutalist) theme — dark + red:**
- Background: `#050505` · Panel: `#0e0e0e` · Panel highlight: `#161616` · Input bg: `#0a0a0a`
- Borders: dim `#1d1d1d` · default `#222` · bright `#2c2c2c`
- Accent: **red `#ff2a1a`** · red bright `#ff5040` · red deep `#a01510`
- Text: `#f2f2f2` / dim `#d8d8d8` / dimmer `#b0b0b0` / dimmest `#909090`
- Font: **Helvetica Neue for everything** (UI, display, mono — all one family)
- Hero display: weight 800, letter-spacing -0.035em, line-height 0.9, UPPERCASE
- Labels: weight 700, letter-spacing 0.22em, uppercase, 9px, dimmer colour
- Body min: 14px, weight 500
- Aesthetic: brutalist · Circoloco red · subtle scanlines + grain overlay site-wide
- **No gold, no DM Mono, no Unbounded. No pastel status colours — everything is red or neutral grey.**

---

## Hard rules (compliance — every design must obey)

1. **Min-friction** — happy path should be 1 type + 1 click. Currently 4–5 clicks to post.
2. **Approve before send** — nothing outbound fires without a full rendered preview + explicit go. Preserve the approval modal.
3. **Confirm destructive actions** — every delete/clear/remove uses `window.confirm()`.
4. **No em-dashes in outward-facing text** — captions, public pages. Internal UI tolerant.
5. **Previews stay in-app** — media/caption preview renders in modal or inline. Never navigate away.
6. **No AI mentions in UI** — don't narrate mechanism ("AI-powered captions"). Narrate outcome ("voice-aligned captions").
7. **Don't explain mechanism — show outcome.** Exception: brand names the user knows (Beatport, RA, Rekordbox, Instagram).
8. **No fade-in on visuals.** Full opacity frame 1.
9. **No overflow.** Viewport-safe at every width (but this screen is desktop-only, so ≥1024px).

---

## Current layout — what renders today, in order

```
┌──────────────────────────────────────────────────────────────────────┐
│  Sidebar (200px)                                                     │
│  [Signal Lab OS]                                                     │
│  ├─ Today                                                            │
│  ├─ Broadcast Lab  ●← current                                       │
│  ├─ Tour Lab                                                         │
│  ├─ Set Lab                                                          │
│  ├─ Sonix Lab                                                        │
│  └─ Drop Lab  (will rename to "Promo" — see /promo migration)       │
└──────────────────────────────────────────────────────────────────────┘

Main area:

[ARTIST VOICE]                                      [+ SIGNAL SCAN]
large hero display headline                         top-right CTA

[ARTIST VOICE] [BROADCAST LAB]  ← tab switcher

┌──────────────────────────────────────────────────────────────────────┐
│ SLIM COMPOSER BAR (sticky)                                           │
│ [context textarea]            [media ▼] [ATTACH MEDIA]  [Cmd+Enter]  │
│ [post] [carousel] [story] [reel]   [Instagram] [TikTok] [Threads]    │
│                                                          [GENERATE]  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ YOUR PROFILE (artist voice)                                          │
│ [VOICE NOT TRAINED]                                                  │
│ Capture 50 recent posts to profile. Free, 5 mins, IG-style.         │
│ [SYNC INSTAGRAM]  [SCAN MANUALLY]                                    │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ REFERENCE ARTISTS (if any)                                           │
│ [2–4 column grid of artist cards, hover = remove ×]                 │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ [▸] TREND ENGINE (collapsible, defaults closed)                      │
│ Low rise engagement    Late-night carousel    Auto-generated         │
│ chart insights                     captions for each                 │
│                                                                      │
│ (only visible if user expands)                                       │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ [▸] CAPTURE LIST (collapsible, defaults closed)                      │
│ Live set performance · Studio close · Crowd reactions                │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ SIGNAL PANEL (performance stats — rendered LAST)                     │
│ Engagement trend · Best day · Top post                               │
└──────────────────────────────────────────────────────────────────────┘

After GENERATE:
┌─────────┬─────────┬─────────┐
│ SAFE    │ LOOSE   │ RAW     │  ← 3-col hardcoded grid (no responsive)
│ caption │ caption │ caption │
│ [copy]  │ [copy]  │ [copy]  │
│ [sched] │ [sched] │ [sched] │
└─────────┴─────────┴─────────┘

Then optional: Reels overlay · Repurpose (3 formats) · Ad plan

Post flow:
[Preview + Approve] → modal → [Post / Schedule / Draft]
```

---

## Problems with current hierarchy (ranked)

### 1. Media attach is buried
`<ATTACH MEDIA>` button is ~32px tall, positioned to the right of the context textarea. Media is the #1 lever (it unlocks vision analysis, auto-suggests format, drives caption quality) — yet it's smaller and later than the text input.

### 2. Three scattered pickers where one would do
- Media type select (dropdown, line 1461)
- Format pills: post/carousel/story/reel (line 1483)
- Platform pills: Instagram/TikTok/Threads (line 1500)

Three separate controls, all interdependent. Platform changes char limits. Format changes aspect ratio requirements. Media type changes format options. Should be one unified picker showing live character limit.

### 3. Voice training is a blocking modal
First time the user clicks Generate without voice trained: modal pops up forcing choice (sync IG / paste captions / generate anyway). Breaks flow.

### 4. Caption variants are a 3-col grid
Hardcoded `grid-cols-3` (line 1814). Works at desktop. Would collapse to ~80px/card on narrow widths. Also: 3 variants side-by-side means smaller text per card than if one were featured.

### 5. Schedule is hidden inside the approval modal
Instant post is the default path. To schedule: click Preview → inside modal toggle Schedule mode → date/time appears. 90% of posts should be scheduled for optimal time windows. Schedule should be a first-class mode, not a sub-toggle.

### 6. Trends + Capture + Signal buried below the fold
Trends (what's hot in lane) and Capture List (what to film at next gig) are **collapsed by default**. Signal Panel (own performance stats) renders last — *below* composition tools. This is backwards. Intelligence should feed composition, not hide behind it.

### 7. Reference artists take massive real estate
2–4 column grid of artist cards with profile pics + findings. This is context, not a primary action. Currently occupies ~240px vertical above the fold.

### 8. Artist voice headline is enormous and not actionable
"ARTIST VOICE" hero display fills the top ~80px. Looks good, but it's just a label. Burns hero real estate that could go to the composer.

---

## Redesign hypotheses (for claude.ai/design to explore)

### A. Invert the hierarchy: composer first, intelligence alongside

Current: hero → profile → artists → (composer below fold after scroll)
Proposed: composer top → intelligence panel side-by-side → outputs below

```
┌───────────────────────────────────────────────┬────────────────────┐
│ COMPOSER (left, 66%)                          │ INTELLIGENCE (34%) │
│                                               │                    │
│  [attach media — LARGE DROP ZONE]             │ Top trending now   │
│  or  [drag files here]                        │ ─ Low rise (hot)   │
│                                               │ ─ Late carousel    │
│  [context textarea + voice input icon]        │                    │
│                                               │ Capture next gig   │
│  [Format & Platform unified picker]           │ ─ Live set perf    │
│  Instagram · Reel · 2200 chars · 9:16         │ ─ Studio close     │
│                                               │                    │
│                              [⚡ GENERATE]    │ Your signal        │
│                                               │ ─ Best day: Thu 6p │
│                                               │ ─ Saves up 12%    │
└───────────────────────────────────────────────┴────────────────────┘

Below the composer (after generate):
┌───────────────────────────────────────────────────────────────────┐
│ CAPTION — voice-aligned                                           │
│                                                                   │
│ [full-width preview of selected variant]                          │
│                                                                   │
│ Variant: [SAFE] [LOOSE] [RAW]   ← toggle, not grid                │
│                                                                   │
│ Score: 8.2 Authenticity · 6 Culture · 9 Visual                   │
│                                                                   │
│              [Reels overlay]  [Repurpose →]  [⚡ PREVIEW + POST]  │
└───────────────────────────────────────────────────────────────────┘
```

### B. Media dropzone as the hero interaction

The first time the user lands on `/broadcast`, a large dashed-border dropzone dominates the composer panel. Drag a file in → everything downstream (format, platform char limit, aspect suggestions) snaps into place. If no media, context-only mode.

### C. Variant as toggle, not grid

Instead of showing Safe + Loose + Raw side-by-side (3 tiny cards), show one selected variant at full width with a tab switcher. More room for caption to breathe. Scales to any width.

### D. Schedule = first-class tab in the preview modal

Preview modal becomes a 2-tab flow:
```
[NOW]      [SCHEDULE]    ← tabs at top
Post immediately    Pick date + time
```
Default to SCHEDULE (90% use case). Show recommended time based on Signal Panel data ("Thu 6pm is your best window for Reels").

### E. Voice training as inline state, not blocking modal

If voice not trained, composer still works — but the Generate button shows a state:
```
[⚡ GENERATE from lane defaults]   [TRAIN VOICE FIRST →]
```
Let the user choose in flow without being gated.

### F. Unified Format & Platform picker

One control card:
```
┌───────────────────────────────────────┐
│ Instagram · Reel · 9:16 · 2200 chars │
│ [change ▾]                            │
└───────────────────────────────────────┘
```
Click to expand a combined picker. Preserves the platform → format → char-limit dependency chain.

### G. Reference artists as a sidebar drawer

Currently: 240px grid above fold. Proposed: a sidebar button "3 references" that slides out a drawer. Keeps them accessible without dominating space.

### H. Intelligence strip always-visible at top

Instead of the giant "ARTIST VOICE" display headline, use that 80px for a one-line intelligence ticker:
```
Best window: Thu 6pm · Reach up 18% · Capture tonight: soundcheck + crowd
```

---

## What MUST stay

- **BRT aesthetic** — dark, red accent, Helvetica 800 uppercase display, scanlines, grain
- **Approval gate** — the Preview + Approve modal is a hard rule. Cannot skip.
- **Variant system** — Safe / Loose / Raw is a core voice feature.
- **Trend + Capture + Signal intelligence** — these are the "wow" differentiators. They should be *more* prominent, not removed.
- **Repurpose outputs** — Reel script + carousel + static from one caption. Keep.
- **`+ SIGNAL SCAN`** — top-right CTA for adding reference artists. Can reposition but don't remove.
- **Schedule/Draft/Post trio** — all three modes stay.

---

## What we're solving

- Reduce scroll depth by ~40% (currently: full-page scroll to see Signal Panel)
- Hot path: **media → caption → post** should be 3 clicks max, not 5
- Intelligence (trends, capture, signal) goes from "buried" to "visible at all times"
- Variant selection scales to any width
- Schedule is the happy path default, not a hidden toggle

---

## Screenshot reference

See `./assets/broadcast-full-1440.png` for current state at 1440×900 (BRT aesthetic visible, empty-state for most sections since voice isn't trained in this test account).

Note the empty state actually reveals the structural skeleton well:
- Massive "ARTIST VOICE" hero burns ~15% of viewport
- Sticky composer bar is correct but pickers scatter
- "Voice not trained" card is a full panel — could be inline hint
- Trend/Capture tables collapsed but still 40px tall each — lots of empty labels

---

## Deliverable from claude.ai/design

Give me **3 layout variants**:

1. **Minimal change** — same bones, reorganize. Move composer up, unify pickers, variant-as-toggle. Low refactor cost.
2. **Split pane** — composer left / intelligence right. Medium refactor.
3. **Radical** — media-as-hero dropzone, inline variant preview, schedule-first approval. High refactor but might be the right long-term shape.

For each variant, show:
- Desktop 1440px width (full Broadcast page)
- Post-generate state (caption + variant toggle + intelligence)
- Preview + Approve modal redesigned

Keep it BRT — I can't adopt anything that strays from Helvetica + #ff2a1a + #050505.
