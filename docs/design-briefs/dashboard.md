# Dashboard — Redesign Brief for claude.ai/design

**Screen:** `/dashboard` (desktop at ≥1024px) + `/mobile` via `MobileShell` (responsive 375–768px)  
**Components:** `src/app/dashboard/page.tsx` (1,160 lines) + `src/components/mobile/MobileShell.tsx` (747 lines)  
**Current state:** After-login landing page. On gig day, renders full-screen "Tonight Mode" (boarding-pass aesthetic). On non-gig days, shows glance-able week summary + next gig hero + task list.  
**Goal:** North Star is **more bookings + more followers**. Show intelligence upfront (next gig countdown, invoices overdue, posts queued, gig logistics gaps). Auto-activate Tonight Mode on gig day with zero friction. Non-gig days should surface: what to prepare? (content calendar), who owes you? (invoices), what's coming? (release countdowns).

---

## Brand system (non-negotiable)

**BRT (Brutalist) theme — dark + red/gold:**
- Background: `#050505` · Panel: `#0e0e0e` · Panel highlight: `#161616` · Input bg: `#0a0a0a`
- Borders: dim `#1d1d1d` · default `#222` · bright `#2c2c2c`
- Accent: **gold `var(--gold)` (typically `#c9a96e` or `#d4a574`)** · red `#ff2a1a` (for critical alerts)
- Text: `#f2f2f2` / dim `#d8d8d8` / dimmer `#b0b0b0` / dimmest `#909090`
- Font: **Helvetica Neue for everything** (UI, display, mono — all one family)
- Hero display: weight 900, letter-spacing -0.05em, line-height 0.88, UPPERCASE
- Labels: weight 700, letter-spacing 0.18em–0.22em, uppercase, 9–11px, dimmer colour
- Accent color: gold (gig day), dimmer (off-day), red for critical financial alerts
- **No Unbounded, no DM Mono. No pastel status colors — gold, green, amber, red only.**

---

## Hard rules (compliance — every design must obey)

1. **Intelligence always visible** — next gig, pending invoices, posts queued, release countdowns, gig logistics gaps should be "at-a-glance" in first viewport.
2. **Tonight Mode auto-activates on gig day** — if `today` matches any gig date, render full-screen Tonight card (desktop + mobile). No manual switch.
3. **Blur all financial amounts** — fees, revenues render via `<BlurredAmount>` component (line 10). Never show raw £/$ in dashboard.
4. **Loading states are solid, not blank** — use `<SkeletonRows>` (line 6) or static placeholder cards. No flash of blank space.
5. **Skeleton → real data transition must be smooth** — no jarring swaps. Keep structure consistent during hydration.
6. **Show-intelligence rule** — "wow moments" (gig intelligence, task clarity, revenue health) or remove. No clutter.
7. **Approve before destructive action** — deleting tasks uses `window.confirm()` (line 1082). Chase notifications go via toast, not modal.
8. **Mobile Tonight Mode is a backstage pass** — full-screen card with timeline + set tracks + quick actions. No tabs, no back button initially.
9. **Primary CTAs are gold-colored** — "Start Debrief", "Add Task", "Send Advance Chase" should be visually distinct gold buttons.
10. **No overflow at any width** — dashboard scales 375px–2560px without breaking.

---

## Current layout — ASCII wireframe

### Desktop (≥1024px) — Non-Gig Day

```
┌────────────────────────────────────────────────────────────────────────┐
│ TOP BAR (16px padding)                                                 │
│ Signal Lab OS                     [♫ Track ID] [+ GIG] [+ POST] [+INV] │
│                                   [7-day week strip with today highlighted]
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ GREETING (hero display, huge)                                          │
│ Good morning.                                                          │
│ Friday, 18 April · tomorrow to The Hoxton · 0 invoices overdue · ...  │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ THE LABS (5-col grid, count cards)                                     │
│ [GIGS: 3 CONFIRMED] [CONTENT: 2 QUEUED] [SETS: 5] [TRACKS: 47] [REL: 1]
└────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────┬──────────────────────────────┐
│ LEFT: NEXT GIG HERO                      │ RIGHT: TASKS + ATTENTION     │
│ ────────────────────────────────────────  │ ────────────────────────────  │
│ NEXT GIG · 2 DAYS                        │ TO DO                        │
│ THE HOXTON                               │ ─ Review cue points           │
│ LONDON                                   │ ─ Email promoter rider        │
│                                          │ ─ Update rider specs          │
│ [+]Status: CONFIRMED                     │ [+ Add task]                 │
│ [+]Advance not sent                      │                              │
│ [+]Set time needed                       │ NEEDS ATTENTION              │
│                                          │ ─ 1 overdue invoice [GOLD]   │
│ NEXT POST · Instagram                   │ ─ Hoxton – advance pending   │
│ [caption preview, 2 lines max]           │ ─ Studio Session – missing   │
│ Thu 14 Apr at 18:00                      │   set time [GOLD]            │
│                                          │                              │
└──────────────────────────────────────────┴──────────────────────────────┘
```

### Desktop — Tonight Mode (Gig Day)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ← Back to dashboard                                                    │
│                                                                        │
│ ┌──────────────────────────────────────────────────────────────────┐  │
│ │ TONIGHT                                                          │  │
│ │                                                                  │  │
│ │ THE HOXTON LONDON                                              │  │
│ │ london                                                          │  │
│ │                                                                  │  │
│ │ 22:00 (hero, huge, GOLD)                                       │  │
│ │                                                                  │  │
│ │ ┌─ GIG DAY TIMELINE ────────────────────────────────────────┐   │  │
│ │ │ DOORS · 10pm             TRAVEL  TIMING  BACKLINE  NOTES  │   │  │
│ │ │ SET · 22:00–23:30        [detail rows]                   │   │  │
│ │ │ [timeline visual]                                         │   │  │
│ │ └───────────────────────────────────────────────────────────┘   │  │
│ │                                                                  │  │
│ │ YOUR SET — Chill Lab (5 tracks)                                │  │
│ │ 1. Artist – Title                                              │  │
│ │ 2. Artist – Title                                              │  │
│ │ 3. Artist – Title                                              │  │
│ │                                                                  │  │
│ │ [START DEBRIEF] [VIEW GIG DETAILS] [WALLET PASS] [GIG PASS]    │  │
│ └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Mobile (375–768px) — Non-Gig Day

```
┌────────────────────────────────┐
│ [Signal Lab Logo]   [Date] [🔔 │
├────────────────────────────────┤
│ [Track ID button — hero]        │
│ [Scan] [Playlist] [Upload]      │
├────────────────────────────────┤
│ NEXT UP (if no tonight gig)     │
│ The Hoxton · London             │
│ · Sat 20 Apr · 22:00            │
│ [Pass]                          │
│ [Alert: Missing set time]       │
├────────────────────────────────┤
│ GIGS (other upcoming)           │
│ [List of 4 upcoming gigs]        │
├────────────────────────────────┤
│ NOTIFICATIONS                   │
│ [Alert ticker — rotates]        │
├────────────────────────────────┤
│ RELEASES (upcoming)             │
│ [3 release cards with artwork]  │
├────────────────────────────────┤
│ RECENT SCANS                    │
│ [List of 3 recent scans]        │
└────────────────────────────────┘
```

### Mobile — Tonight Mode (Gig Day)

```
┌────────────────────────────────┐
│ [Signal Lab Logo] [Date] [🔔]   │
├────────────────────────────────┤
│                                │
│ ┌──────────────────────────────┐
│ │ TONIGHT                      │
│ │                              │
│ │ THE HOXTON                   │
│ │ london                       │
│ │                              │
│ │ 22:00 (huge, gold)           │
│ │                              │
│ │ [GIG DAY TIMELINE]           │
│ │ DOORS · 10pm · London        │
│ │ SET · 22:00–23:30            │
│ │ [expandable detail section]  │
│ │                              │
│ │ YOUR SET — Chill Lab        │
│ │ 1. Artist – Title            │
│ │ 2. Artist – Title            │
│ │ 3. Artist – Title            │
│ │                              │
│ │ [START DEBRIEF]              │
│ │ [VIEW DETAILS]  [PASS]       │
│ └──────────────────────────────┘
│                                │
├────────────────────────────────┤
│ (scroll down to other gigs +   │
│  releases + scans if user      │
│  swipes down)                  │
└────────────────────────────────┘
```

---

## Problems with current state (ranked by P0→P3)

### P0: Tonight Mode is hard-coded but invisible on non-gig days
**File:** `page.tsx:620–834` — Tonight Mode renders only if `tonightGig && !loading`. But the condition is checked **after mobile render** (line 836), so mobile users hitting `/dashboard` on a gig day see `<MobileShell />` instead of mobile Tonight Mode.

**Impact:** Mobile users can't easily see "it's showtime" on gig day. They land on Track ID hero instead of gig card.

**Root cause:** Mobile check (line 836: `if (mobile) return <MobileShell />`) happens before Tonight Mode logic (line 620). MobileShell also has Tonight Mode logic (line 528–530) but it's buried after Track ID and install prompt.

**Fix:** Move mobile Tonight Mode check **into** MobileShell, or render Tonight Mode for **both** desktop + mobile before the platform split.

---

### P1: WeekStrip renders null on first hydration
**File:** `page.tsx:89–143` — `useEffect` sets `mounted = true` (line 91), but return is `null` (line 92). On SSR, this is always empty. On client, it flashes `null` for a frame, then renders the 7-day calendar.

**Impact:** Week calendar disappears during load. User sees blank space where they expect to see gig dots.

**Root cause:** Conditional hydration bug — `!mounted` should render a skeleton, not `null`.

**Fix:** Render `<SkeletonRows count={7} />` or a static 7-day placeholder grid instead of `null`.

---

### P2: Financial amounts in subtitles are NOT blurred
**File:** `page.tsx:928–929` — Subtitle shows:
```
{!loading && nextGig && ` · ${daysUntil(nextGig.date) === 0 ? 'tonight' : `${daysUntil(nextGig.date)}d`} to ${nextGig.venue || nextGig.title}`}
```
This is fine. But if we add revenue data later, it will render as raw numbers. **No BlurredAmount used in any subtitle or grid card.**

**Impact:** Secret fees/revenue could leak in public dashboards or screenshots.

**Root cause:** Dashboard design doesn't layer financial data yet. But broadcast lesson: fees must always blur.

**Fix:** Use `<BlurredAmount currency={gig.currency} amount={gig.fee} />` if fee display is added to any card.

---

### P3: "No Shows Booked" CTA is de-emphasized
**File:** `page.tsx:1035–1043` — If `nextGig` is null, renders:
```
No Shows
Booked

Add a gig →
```
Text is dimmer color. Should be gold or red to stand out as primary action.

**Impact:** Users might miss the "Add a gig" CTA on an empty dashboard.

**Root cause:** CTA styling is inline `color: 'var(--text-dimmer)'` instead of gold button style.

---

## Redesign hypotheses (A–H)

### A. Intelligence ticker at top (always-on summary strip)

Above the greeting, add a single-line ticker showing:
```
┌────────────────────────────────────────────────────────┐
│ 3 gigs in 14d · 2 posts queued · 1 invoice overdue (–3d)
│ — 2 releases in 8d
└────────────────────────────────────────────────────────┘
```
This is the "show-intelligence" rule: **every element answers a question the artist has.**
- "What's next?" → next gig in ticker
- "Am I posting?" → posts queued
- "What's owed?" → overdue invoices (red)
- "What's dropping?" → release countdown

---

### B. Tonight Mode on mobile: swap Track ID hero for gig card on gig day

Currently, gig day mobile shows:
1. Install prompt (if needed)
2. Tonight card (via MobileTonightF)
3. Track ID hero
4. Other gigs

**Redesign:** If `tonightGig` exists, render:
1. Tonight card (full width, boarding pass)
2. Track ID button (secondary, smaller)
3. Other gigs

**Rationale:** Show the "wow moment" first. Track ID is a nice-to-have, not the headline.

---

### C. Non-gig day desktop: swap task list for "what to do" guide

Right-side panel currently shows:
- TO DO (manual tasks)
- NEEDS ATTENTION (gig alerts + overdue invoices)

**Problem:** On non-gig days, the right panel is sparse. Artist scrolls past the most important real estate.

**Redesign:** Replace "TO DO" with contextual content suggestions:
```
PREPARE FOR NEXT GIG
─ Record soundcheck video
─ List your 5 favorite tracks this week
─ Plan set flow

Or if no upcoming gigs:
CONTENT CALENDAR (next 7 days)
─ Monday: BTS from studio session
─ Wed: Upcoming gig announcement
```

Fetches from `/api/brief` (which already exists, line 333–345) and surfaces AI-generated suggestions.

---

### D. Gig logistics early warning system

**File:** `MobileShell.tsx:403–414` — already has `missingLogistics()` function. Desktop doesn't use it.

**Redesign:** Add a "WARNINGS" band to the next gig hero:
```
┌─────────────────────┐
│ NEXT GIG · 2 DAYS   │
│ THE HOXTON          │
│ LONDON              │
│                     │
│ [⚠] Missing:        │
│ · Set time          │
│ · Promoter rider    │
│ [Fix now →]         │
└─────────────────────┘
```
Show only if `daysOut <= 7` and issues exist. Use amber or gold border, not red (not critical yet).

---

### E. Unify week strip + briefing items into one "at-a-glance" panel

Currently:
- Week strip is 7 columns of day/gig/post dots (line 875–905)
- Briefing items are right sidebar links (line 1122–1141)

**Redesign:** Merge into a single scrollable "this week" card:
```
┌─────────────────────────────────────────────────────┐
│ THIS WEEK                                           │
│ Mon 15  ─ Tue 16  ✓ post scheduled                 │
│ Wed 17  ─ Thu 18 ◦ gig (2d)                         │
│ Fri 19  ─ Sat 20 ◦ gig (3d)                         │
│ Sun 21  ─                                           │
│                                                     │
│ [pending: invoice due 20 Apr] [Chase →]             │
│ [ready: 2 posts queued] [View schedule →]           │
└─────────────────────────────────────────────────────┘
```

---

### F. Tonight Mode mobile: make set tracks auto-scroll or collapsible

Currently (`MobileShell.tsx:733–752`), your set is always expanded. On small screens, this pushes Quick Actions below the fold.

**Redesign:**
```
YOUR SET — Chill Lab
[→] (chevron to expand/collapse)

[when collapsed, just shows title + count]
YOUR SET — Chill Lab (5 tracks)

[when expanded, shows full list, smooth height transition]
```

---

### G. Desktop next-gig card: add gig pass QR code or NFC badge below actions

**File:** `page.tsx:760–827` — renders 4 action buttons. Add a 5th:
```
[START DEBRIEF] [VIEW GIG DETAILS]
[WALLET PASS] [GIG PASS] [QR CODE]
```
QR links to `/api/gigs/${id}/wallet` and displays inline as a small 100×100px code.

---

### H. Tonight Mode: add "Go live" / "Post warmup" quick action on gig day

When it's 30min before set time, show:
```
SET IN 30 MINUTES

[🔴 GO LIVE] [⬆ POST WARMUP]
```
Links to `/broadcast` with gig context pre-filled (e.g. "Live at The Hoxton").

---

## What MUST stay

- **BRT aesthetic** — dark, gold accent, Helvetica Neue UPPERCASE display, scanlines
- **Tonight Mode card** — boarding-pass style, hero time display, GigDayTimeline, set tracks. This is the product's crown jewel.
- **Auto-activate on gig day** — if `today` matches any gig date, show Tonight Mode full-screen (desktop + mobile). No toggle.
- **Task list** — simple checklist with localStorage persistence (line 1065–1119). Keep it lightweight.
- **Week strip** — 7-day calendar with gig dots. Visual at-a-glance horizon.
- **Intelligence briefing** — gigs + posts + invoices summary. These are the "wow" differentiators.
- **Track ID button** — hero action on mobile. One-tap gig prep + discovery. Keep.
- **Blurred amounts** — all financial data must use `<BlurredAmount>`. This is a compliance rule.

---

## What we're solving

1. **Tonight Mode visibility on mobile** — currently hidden until user scrolls past Track ID. Should be the hero.
2. **WeekStrip null flash** — skeleton or static placeholder, not blank space.
3. **Intelligence-first layout** — summary ticker or merged briefing panel at top, not buried in right sidebar.
4. **Gig logistics early warning** — `missingLogistics()` only used on mobile. Desktop should surface gaps.
5. **Non-gig day engagement** — right panel is sparse. Add contextual "prepare for next gig" suggestions.
6. **Mobile real estate** — Track ID shouldn't dominate on gig day. Gig card is the hero.

---

## Screenshot reference

Current state visible at:
- Desktop non-gig day: full dashboard with greeting, week strip, labs grid, next gig hero (left) + tasks (right)
- Desktop gig day: full-screen Tonight card with timeline + set tracks + actions
- Mobile non-gig day: install prompt + Track ID hero + next gig card + other gigs + releases
- Mobile gig day: should show Tonight card prominently, but currently Track ID is hero

---

## Deliverable from claude.ai/design

Give me **2 layout variants** (desktop + mobile, both gig-day and non-gig-day states):

1. **Minimal change** — fix WeekStrip null flash, add logistics warnings to next gig hero, move Track ID below Tonight card on mobile, swap desktop task list with "prepare for next gig" contextual guide. Low refactor cost.

2. **Radical** — intelligence ticker at top, merge week strip + briefing into one scrollable card, full-screen Tonight card on mobile (with set tracks collapsible), desktop next gig hero includes small gig pass QR, "Go live" CTA when within 30min of set time. Medium refactor, high impact.

For each variant, show:
- Desktop 1440px non-gig day (greeting + week + labs + next gig hero + advice panel)
- Desktop 1440px gig day (Tonight card)
- Mobile 375px non-gig day (Track ID + next gig + upcoming gigs)
- Mobile 375px gig day (Tonight card, Track ID secondary)

Keep it BRT — I can't adopt anything that strays from Helvetica + gold + #050505.

---

## P0s flagged for claude.ai/design

1. **WeekStrip null flash** (page.tsx:92) — loading state shows blank space instead of skeleton grid
2. **Tonight Mode hidden on mobile** (page.tsx:836 before line 620) — mobile check happens before Tonight Mode logic; users miss gig day hero
3. **Track ID dominates mobile on gig day** (MobileShell.tsx:533–570) — should be secondary when `tonightGig` exists
4. **Logistics warnings not shown on desktop** (page.tsx:1019–1032) — `missingLogistics()` logic only on mobile; desktop hero doesn't surface gig gaps

