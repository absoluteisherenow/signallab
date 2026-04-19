# Mobile App — Redesign Brief for claude.ai/design

**Primary files:**
- `src/components/mobile/MobileShell.tsx` — app shell, tab host
- `src/components/mobile/MobileTonightF.tsx` — Tonight Mode (gig-day hero screen)
- `src/components/mobile/MobileGigs.tsx` — gig list
- `src/components/mobile/MobileScan.tsx` — Mix Scanner / Track ID
- `src/components/mobile/MobileUpload.tsx` — photo upload for gigs
- `src/app/gig-pass/[id]/PageClient.tsx` — public wallet pass

**Related briefs:**
- `mobile-tab-bar.md` — the 5-tab bottom bar (sub-brief — lives inside this shell)
- `gig-card.md` — the backstage pass system (mobile surfaces include Tonight Mode + Wallet Pass)

**Goal:** Design the complete mobile app as a purpose-built "at the gig" tool. NOT a shrunken desktop. Streamlined to the 5–7 features that earn their place on a phone screen in the 60 minutes before a set. Screenshot-friendly. Thumb-zone-first. Boarding-pass feel.

---

## Brand system (non-negotiable)

**BRT (Brutalist) theme — dark + red:**
- Background: `#050505` · Panel: `#0e0e0e` · Panel highlight: `#161616` · Input bg: `#0a0a0a`
- Borders: dim `#1d1d1d` · default `#222` · bright `#2c2c2c`
- Accent: **red `#ff2a1a`** · red bright `#ff5040` · red deep `#a01510`
- Text: `#f2f2f2` / dim `#d8d8d8` / dimmer `#b0b0b0` / dimmest `#909090`
- Font: **Helvetica Neue for everything** (UI, display, mono — all one family)
- Hero display: weight 800, letter-spacing -0.035em, line-height 0.9, UPPERCASE
- Labels: weight 700, letter-spacing 0.18em (mobile-adjusted from desktop 0.22em for readability), uppercase, 10–11px
- Body min: 14px, weight 500
- Aesthetic: brutalist · Circoloco red · subtle scanlines + grain overlay
- **No gold, no DM Mono, no Unbounded. No pastel status colours — red or neutral grey only.**

**Mobile tap targets:** ≥44×44pt (iOS) / 48dp (Android). Non-negotiable.

---

## Philosophy: mobile ≠ desktop

**Desktop = control panel.** Edit campaigns, parse contracts, send DM blasts, tune ads, manage invoices, dig into analytics. Dense, information-rich, many-click flows.

**Mobile = backstage pass.** Logistics-first. Screenshot-shareable. "I'm at the airport / in the cab / backstage and need the 3 numbers that matter."

If a feature doesn't pass the **"would I use this in the 5 minutes before I go on"** test, it doesn't belong on mobile.

---

## Hard rules

1. **No overflow at 320px** — smallest iPhone SE portrait.
2. **Thumb-zone friendly** — primary nav + core actions in bottom third.
3. **Tonight Mode auto-activates on gig day** — home tab defaults to tonight's gig card if one exists within the next 24h.
4. **Wallet Pass 1-tap on gig day** — dedicated slot appears in the tab bar when a gig is active.
5. **Blur fees everywhere** via `<BlurredAmount>`. Fees NEVER shown on screenshot-shareable surfaces (Wallet Pass, Tonight Mode).
6. **No em-dashes in outward-facing text** — hard rule, global.
7. **No AI mentions anywhere in copy.**
8. **No fade-in on visuals** — full opacity frame 1. Hook immediately.
9. **Screenshot-friendly** — assume every screen could be shared via iMessage/Signal. Design for that.
10. **Approve before send** — the gated outbound modal shows on mobile too, full preview, one-hand reachable approve button.

---

## Feature allowlist — what EARNS a place on mobile

Core 5 (persistent tab bar):

| Tab | Purpose | Screen component |
|-----|---------|------------------|
| **Home** | Today snapshot · auto-shifts to Tonight Mode on gig day | `MobileShell` → `MobileTonightF` contextual |
| **Scan** | Mix Scanner / Track ID · 1-tap identify a track from clipboard or file | `MobileScan` |
| **Post** | Quick broadcast post (text + photo/video, single platform) | **NEW** — `MobilePost` |
| **Tour** | Gig list · today / upcoming · tap-in to gig detail | `MobileGigs` |
| **Pass** | Wallet Pass (gig-day only) · replaces 5th slot when active | `MobileShell` → Wallet route |

Contextual / overlay:

- **Tonight Mode** — takes over Home tab on gig day (set countdown, contacts, travel)
- **Gig Detail** — tap a gig → full backstage card (set time hero, promoter contacts, travel, advance status)
- **Wallet Pass** — screenshot-shareable public pass (own route `/gig-pass/[id]`, no fees)
- **Photo upload** — from Gig Detail → `MobileUpload` (hands photographer a per-gig upload URL)
- **Approval Gate** — unified send-confirm modal, appears over any outbound action

---

## Feature denylist — what STAYS on desktop

These do not get a mobile surface. They exist on desktop only. If attempted on mobile, show a redirect card: *"This lives on desktop. Open signal lab on your laptop to continue."*

- **Finances / Invoices / Contracts** — create, edit, parse
- **Ads Manager** (Meta, Google, LinkedIn, TikTok) — all audit + build flows
- **Campaigns analytics** — release stats, blast performance
- **Contact list management** — bulk add, CSV import, segmentation
- **Set Lab full** — Rekordbox import, Mix Scanner batch mode, deep dive reports
- **SONIX Lab** — music production tools
- **Content Calendar** — multi-week plan view, drag-to-reschedule
- **Media Library** — bulk asset management, tagging
- **Settings — admin** — API keys, integrations, team management

A lightweight mobile Settings screen is allowed for: profile, sign out, notification toggles. Everything else routes to desktop.

---

## Screen inventory (the full mobile app)

### 1. Home (non-gig day)
```
┌────────────────────────┐
│ SIGNAL LAB             │  ← minimal top bar (logo + menu)
├────────────────────────┤
│ TODAY                  │  ← 9px letterspaced label
│ Thu 18 Apr             │
│                        │
│ ┌──── NEXT UP ────┐   │  ← card: next gig OR next release
│ │ Fabric · London  │   │
│ │ Fri 25 Apr · 3d  │   │
│ │ [View gig →]     │   │
│ └──────────────────┘   │
│                        │
│ ┌──── QUICK ────────┐ │  ← 2-column grid
│ │ [+ Post]  [Scan]  │  │
│ │ [+ Gig]   [Track] │  │
│ └────────────────────┘ │
│                        │
│ LATEST                 │
│ · Post reached 3.2k    │
│ · Gig confirmed        │
│ · Track ID'd 2h ago    │
└────────────────────────┘
[Home][Scan][Post][Tour][+]
```

### 2. Home (gig day — Tonight Mode)
```
┌────────────────────────┐
│ NIGHT manoeuvres  LIVE●│
├────────────────────────┤
│                        │
│ TONIGHT                │
│ VENUE NAME       (34px)│
│ City / Thu 18 Apr      │
│                        │
│ YOUR SET               │
│ 23:00         (72px red)│
│ → 00:00  (45 min)      │
│ 04H 12M until set      │
│                        │
│ INBOUND                │
│ 14:20 ──────── 16:40   │
│ LHR → CDG              │
│                        │
│ ON ARRIVAL             │
│ [Message promoter →]   │
│                        │
│ [Open Wallet Pass →]   │
└────────────────────────┘
[Home][Scan][Post][Tour][PASS]  ← Pass tab appears, red glow
```
(Full detail in `gig-card.md`.)

### 3. Scan (Mix Scanner / Track ID)
```
┌────────────────────────┐
│ SCAN                   │
├────────────────────────┤
│ [mic icon, 120px]      │  ← big tap zone
│ TAP TO LISTEN          │
│                        │
│ OR                     │
│ [Paste clipboard]      │
│ [Upload audio]         │
│                        │
│ RECENT                 │
│ · "All for You" · Spotify
│ · "Losing Signal" · BP │
└────────────────────────┘
[Home][Scan][Post][Tour][+]
```

### 4. Post (quick broadcast)
```
┌────────────────────────┐
│ NEW POST      [Cancel] │
├────────────────────────┤
│ [📷 Add media]         │  ← camera/library
│                        │
│ [textarea]             │
│ Caption…               │
│                        │
│ CHANNEL                │
│ ○ Instagram Feed       │
│ ● Instagram Reels      │
│ ○ TikTok               │
│ ○ Threads              │
│                        │
│ WHEN                   │
│ ● Now                  │
│ ○ Schedule             │
│                        │
│ [Review & approve →]   │  ← opens Approval Gate
└────────────────────────┘
```
**Mobile post is ONE platform at a time** — cross-post happens on desktop. Keep it simple.

### 5. Tour (gig list)
```
┌────────────────────────┐
│ TOUR                   │
├────────────────────────┤
│ TONIGHT                │  ← sticky if gig today
│ · Fabric London · 23:00│
│                        │
│ UPCOMING               │
│ FRI 25 · Fabric        │
│ SAT 26 · Printworks    │
│ …                      │
│                        │
│ PAST (collapsed)       │
└────────────────────────┘
[Home][Scan][Post][Tour][+]
```
Tap a gig → Gig Detail.

### 6. Gig Detail (backstage pass — mobile)
Covered fully in `gig-card.md`. Key: set time hero, contact action row (call / SMS / WhatsApp), travel accordion, advance badge.

### 7. Wallet Pass (public, screenshot-shareable)
Covered in `gig-card.md`. Key: NO fees shown, set time hero, QR, shareable URL.

### 8. Settings (minimal)
```
┌────────────────────────┐
│ SETTINGS               │
├────────────────────────┤
│ PROFILE                │
│ Anthony McGinley       │
│ NIGHT manoeuvres       │
│                        │
│ NOTIFICATIONS          │
│ · Gig reminders  [on]  │
│ · Approvals      [on]  │
│                        │
│ ADVANCED               │
│ Open on desktop →      │
│ Sign out               │
└────────────────────────┘
```

### 9. Redirect card (for desktop-only features)
When a user deep-links to a desktop-only route on mobile (e.g., `/business/finances`):
```
┌────────────────────────┐
│ [icon]                 │
│ This lives on desktop. │
│                        │
│ Open Signal Lab on your│
│ laptop to continue.    │
│                        │
│ [Copy link]            │
│ [← Back]               │
└────────────────────────┘
```

### 10. Approval Gate (mobile variant)
Full-screen modal. One-hand reachable APPROVE button (bottom, red, 56px tall). Preview fills top 70%. Cancel link in top-right or as gesture (swipe down).

---

## Navigation model

- **Bottom tab bar** — 5 tabs, adaptive 5th slot (see `mobile-tab-bar.md`)
- **No hamburger menu** — if it's not in the tab bar or a Home quick action, it's not on mobile
- **Deep links** — tapping a notification / Wallet Pass link / gig URL lands on the right screen inside the shell (not a new browser tab)
- **Back** — native swipe-back on iOS, hardware back on Android

---

## Key flows

### Flow A: "I'm landing at Heathrow for tonight's gig"
1. Open app → Home defaults to Tonight Mode (gig is today)
2. See: set time (23:00), countdown (6h 42m), inbound flight (14:20), venue address
3. Tap "Message promoter" → WhatsApp opens
4. Done. No navigation needed.

### Flow B: "I want to post a quick story about soundcheck"
1. Home → tap [+ Post] or Post tab
2. Add media from camera → caption → IG Reels
3. [Review & approve] → Approval Gate shows full preview
4. Approve → posted. Back to Home.

### Flow C: "Track ID from a mix I just heard"
1. Scan tab → mic button → ID track
2. Result shows in-line, auto-saved (per `feedback_auto_add_discovery`)
3. Tap → Spotify preview in-app (per `feedback_previews_in_app`)

### Flow D: "Photographer needs upload link for tonight"
1. Tour tab → tonight's gig → Gig Detail
2. [Generate upload link] → copy to clipboard
3. Share with photographer via WhatsApp
4. Uploads flow into media scans automatically

### Flow E: "User taps a Finances notification on phone"
1. Notification deep-link → `/business/finances`
2. Mobile shell detects desktop-only route → Redirect Card
3. [Copy link] → email to self to open on laptop

---

## What MUST stay

- BRT aesthetic (dark, red, Helvetica 800 display, scanlines, grain)
- 5-tab count (6 breaks 320px)
- Bottom-positioned tabs (thumb-zone)
- Auto-activate Tonight Mode on gig day
- Blur fees via `<BlurredAmount>` · zero fees on Wallet Pass / Tonight Mode
- Approval Gate for all outbound actions
- Screenshot-friendly (no overflow, no fades, no soft pastels)
- Native swipe-back / hardware back

---

## What we're solving

- **Desktop creep** — right now mobile tries to do too much. Lock the feature allowlist.
- **Missing Broadcast on mobile** — primary-fn gap, add Post tab
- **Missing Wallet Pass on mobile** — add contextual 5th slot
- **No gig-day adaptive state** — auto-swap Home → Tonight Mode
- **Mind tab underused** — remove or route to Home quick action
- **No redirect pattern for desktop-only features** — add card

---

## Deliverable from claude.ai/design

**Full mobile app at 390px width (iPhone 14/15 Pro). Also show 320px (iPhone SE) proof for tab bar + Home.**

For each of the 10 screens above, render one mockup:

1. Home (non-gig day)
2. Home (gig day — Tonight Mode)
3. Scan
4. Post composer
5. Tour (gig list)
6. Gig Detail (mobile backstage)
7. Wallet Pass (shareable)
8. Settings (minimal)
9. Desktop-only redirect card
10. Approval Gate (mobile variant)

Additional: **tab bar adaptive states**
- Normal day: `[Home] [Scan] [Post] [Tour] [+]`
- Gig day: `[Home] [Scan] [Post] [Tour] [PASS]` (Pass glowing red)

BRT palette throughout. Helvetica Neue only. No em-dashes in any mockup copy. No AI mentions. No gold. Active accents = red `#ff2a1a`. Screenshot-friendly at every breakpoint.

---

## Compliance checklist

- [ ] All 10 screens at 390px
- [ ] Tab bar proof at 320px (no overflow)
- [ ] Fees blurred on every screen that shows money
- [ ] Zero fees visible on Wallet Pass or Tonight Mode
- [ ] No em-dashes anywhere
- [ ] No AI / "AI-powered" copy
- [ ] No gold tokens
- [ ] Helvetica Neue only (no secondary fonts)
- [ ] Tap targets ≥44×44pt
- [ ] Approval Gate modal shown for one outbound action
- [ ] Redirect card for one desktop-only feature
- [ ] Tonight Mode = gig-day Home variant (not separate route)
- [ ] Wallet Pass = public URL, no personal data exposed
