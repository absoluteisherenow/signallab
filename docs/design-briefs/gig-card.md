# Gig Card System — Redesign Brief for claude.ai/design

**Primary screens:**
- `/app/gigs/[id]/page.tsx` — desktop gig detail
- `src/components/gigs/GigDetail.tsx` — desktop component
- `src/components/mobile/MobileTonightF.tsx` — mobile Tonight Mode
- `/app/gig-pass/[id]/PageClient.tsx` — public wallet pass

**Screenshot references:** `./assets/` (to be added — gig detail + tonight + wallet pass)

**Goal:** Unify three related views (desktop detail / mobile Tonight Mode / wallet pass) into one coherent "backstage pass" system. Make set time the hero. Enforce fee rules (not on wallet pass). Fix narrow-width overflow. Replace em-dashes.

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

1. **No fee shown on wallet pass** — screenshot-shareable surface. Anthony explicit: don't show fee there even blurred. (Currently: `MobileTonightF.tsx:351–386` shows blurred fee; `PageClient.tsx` correctly omits it — unify to omit everywhere on shareable surfaces.)
2. **Blur fees everywhere else** via `<BlurredAmount>` — any raw £/$ is a bug. See `GigsList.tsx:144, 171` for correct pattern.
3. **Screenshot-friendly** — wallet pass shared via iMessage/Signal. No overflow at 320px. Contrast ≥4.5:1.
4. **No em-dashes in outward-facing text** — currently violates at `PageClient.tsx:326` ("Offline — cached").
5. **Previews stay in-app** — gig detail renders inline, never navigates away for edit.
6. **No AI mentions in UI.**
7. **Don't explain mechanism — show outcome.** Exception: RA, Resident Advisor, Beatport, Rekordbox.
8. **No fade-in on visuals.** Full opacity frame 1.
9. **No overflow.** Viewport-safe 320px–1440px.

---

## What the gig card is for

**The "backstage pass" philosophy:** Artists at venues need one pocket-sized reference in the 5 minutes before set. Not analytics, not scheduling, not config. Just:
- **Set time** — when you go on
- **Venue + location** — where
- **Key contacts** — promoter, liaison, driver (1-tap to call/WhatsApp)
- **Travel** — flights, hotel, driver notes
- **Advance status** — rider confirmed?

Mobile Tonight Mode = glanceable countdown hero. Wallet Pass = screenshot-shareable. Desktop GigDetail = edit/admin surface.

---

## Current layout — what renders today

### Desktop Gig Detail (`GigDetail.tsx`)
```
┌────────────────────────────────────────────────────────────┐
│ PAGE HEADER: "GIG DETAIL"                                  │
│                                                             │
│ [Venue] [Location] [Date] [Time]                           │
│ [Fee (blurred)] [Audience] [Status]                        │
│ [EDIT] [SEND ADVANCE] [DELETE]                             │
│                                                             │
│ PROMOTER                    ADVANCE STATUS                 │
│ [email field]               [Status badge]                 │
│ [phone field]               [Send advance]                 │
│                                                             │
│ TECH RIDER / HOSPITALITY (collapsible)                     │
│                                                             │
│ TRAVEL BOOKINGS (flights, hotel, train)                    │
│ ARTWORK (RA fetch / custom upload)                         │
│ GUEST LIST                                                 │
└────────────────────────────────────────────────────────────┘
```

### Mobile Tonight Mode (`MobileTonightF.tsx`)
```
┌──────────────────────────┐
│ NIGHT MANOEUVRES  LIVE ● │  ← top docket
│ [RED HEADER]             │
│ NIGHT MANOEUVRES ENTRY PASS
│                          │
│ ┌─ TONIGHT ─┐            │
│ │ VENUE NAME │ 34–46px    │
│ │ CITY / DATE│            │
│ │ SET ▶ COUNTDOWN         │
│ │ 23:00 → 00:00  00H45    │
│ └────────────────────────┘
│                          │
│ INBOUND                  │
│ 14:20 ────────── 16:40   │
│ LHR / LONDON   CDG / PARIS
│                          │
│ FEE            PAID      │  ← VIOLATES "no fee on shareable"
│ £[BLURRED]     ON THE NIGHT
│                          │
│ [RED BAR]                │
│ ON ARRIVAL               │
│ MSG [PROMOTER] →         │
└──────────────────────────┘
```

### Wallet Pass (`PageClient.tsx:75–547`)
```
┌────────────────────────────────┐
│ GIG PASS          ← Dashboard   │
│                                │
│ [VENUE NAME] (hero, clamp)     │  ← venue too dominant
│ Location                       │
│ Date (long format)             │
│                                │
│ YOUR SET                       │
│ [TIME — 48–72px]                │
│ Doors [DOORS_TIME]             │
│                                │
│ PROMOTER [card]                │
│ [Name]                         │
│ [Call] [Email]                 │
│                                │
│ ARTIST LIAISON [card]          │
│ DRIVER [card]                  │
│ HOTEL [card]                   │
│ FLIGHTS [cards]                │
│ VENUE [card]                   │
│                                │
│ [Advance status badge]         │
│ Last updated: 12:34            │
│ [Offline — cached]             │  ← em-dash violation
└────────────────────────────────┘
```

---

## Problems ranked

### P0 (blocking)

**1. Fee shown on Tonight Mode** — `MobileTonightF.tsx:351–386` shows blurred fee. Shareable surface. Remove entirely.

**2. Em-dash in outward text** — `PageClient.tsx:326` reads "Offline — cached". Replace with "Offline · cached" or "Offline (cached)".

**3. No Tonight Mode auto-default on gig day** — mobile should jump to today's gig when one exists, not require tapping Home.

### P1 (friction)

**4. Contact info fragile at 320px** — Wallet pass contact cards stack name + [Call] + [Email] vertically, ~120px each. Multiple overflow.

**5. Travel info buried below fold** — flights, hotel rendered *after* contacts. At 320px, travel is 3–4 scrolls down.

**6. Set time not the hero on wallet pass** — venue ~42px, set time ~72px but below. Set time should be 64–80px hero at top. "When do I play?" is the #1 question at gig time.

**7. Advance status badge small + late** — footer position, ~20px. Should surface after set time.

### P2 (mobile ergonomics)

**8. No 1-tap WhatsApp** — `MobileTonightF` promoter button is SMS-only (`sms:` href, line 147). Need WhatsApp, Telegram options.

**9. Date format inconsistency** — desktop ISO, mobile dot-separated, wallet long format. Unify.

**10. Airline IATA extraction fragile** — `MobileTonightF.tsx:50–55` regex on free-text. Store IATA separately.

### P3 (polish)

**11. Offline banner z-index bleed** — fixed position, z-100, overlays header.

**12. Set length midnight wraparound edge cases** — if end-time null, countdown disappears.

---

## Redesign hypotheses

### A. Hero hierarchy: set time first on wallet pass

```
┌────────────────────────────────┐
│ GIG PASS          ← Dashboard   │
│                                │
│ YOUR SET                       │
│ 23:00            ← 64–80px, red│
│ → 00:00 (45 min) ← 18px, dim   │
│                                │
│ VENUE NAME       (28–32px)     │
│ London / Thu 18 Apr            │
│ [Advance badge]                │
│                                │
│ PROMOTER [card] [Call] [SMS]   │
└────────────────────────────────┘
```

### B. Contacts as action pills

```
PROMOTER: Sarah Smith
[Call 07700] [SMS] [WhatsApp]

LIAISON: Tom Green
[Call 07700]

DRIVER: Jim Brown · "Running 10 late"
[Call 07700]
```

### C. Travel as accordion

```
[▸] INBOUND · AA123 · LHR 14:20 → CDG 16:40
[▸] HOTEL · Ibis Paris Châtelet
```
Expand on tap for full detail. 1-line summary saves scroll.

### D. Unify desktop + mobile + wallet card structure

All 3 views share the same card anatomy (label / data / action), scale responsively. Single component library. Less duplication.

### E. Countdown always-visible on mobile when within 24h

If `set_end_time` missing, still show countdown to `set_start`. Hide duration only.

### F. Screenshot-safe wallet pass at 320px

Test at 320px. Button groups flex-wrap. Never horizontal scroll.

### G. Offline state as metadata, not banner

```
│ ─── footer ───                       │
│ Last updated: 12:34 · Offline       │
```
Subtle. Informational, not error.

### H. Remove "NIGHT MANOEUVRES ENTRY PASS" red header from Tonight Mode

It's decorative. Occupies ~60px. The venue name itself can be the hero. Free the real estate.

---

## What MUST stay

- BRT aesthetic (dark, red, Helvetica 800 display, scanlines, grain)
- Set time + venue + location core data
- Contact buttons (tel:, mailto:, + WhatsApp/Telegram expansion)
- Advance status badge (confirm/pending/not-sent)
- Travel bookings data model (flights, hotel, driver)
- Wallet Pass as public shareable URL `/gig-pass/[id]`
- Offline-first cache (localStorage fallback)
- `<BlurredAmount>` wrapper everywhere fees display (desktop only)

---

## What we're solving

- **Fee safety:** remove fee from wallet pass + Tonight Mode (both screenshot-shareable)
- **Em-dashes:** replace all outward em-dashes
- **Hierarchy:** set time hero on wallet pass
- **Mobile contact UX:** 3-action row (call / SMS / WhatsApp)
- **Travel depth:** accordion by default
- **Consistency:** one card component across all 3 views
- **Countdown robustness:** always show if set_time exists
- **Screenshot safety:** 320px-safe, no overflow

---

## Deliverable from claude.ai/design

**3 variants across the 3 views:**

1. **Minimal** — keep bones, swap hero (set time top), fix em-dashes, remove fee from Tonight Mode. Low refactor.
2. **Moderate** — unify card structure, accordion for travel, inline contact buttons, countdown always-visible. Medium refactor.
3. **Radical** — wallet pass as full-screen modal (not separate page), sync visually with Tonight ticket stub, desktop split-pane (gig info left, advance + travel right). High refactor, maximum cohesion.

For each variant, show:
- **Wallet Pass** at 320px + 480px
- **Mobile Tonight** at 375px
- **Desktop Detail** at 1024px + 1440px

Assets to include:
- Set time as hero (64–80px)
- Contact buttons with SMS + WhatsApp
- Travel accordion (closed + open)
- Offline badge in footer (not banner)
- Advance badge after set time

Keep it BRT — Helvetica Neue, #ff2a1a red, #050505 black, no em-dashes, no gold. All fees via `<BlurredAmount>` (desktop only, never on shareable surfaces).
