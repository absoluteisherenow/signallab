# Mobile Tab Bar + Mobile Shell — Redesign Brief for claude.ai/design

**Primary files:**
- `src/components/layout/Navigation.tsx` (lines ~400–470 contain mobile bottom bar)
- `src/components/mobile/MobileShell.tsx`
- `src/components/mobile/MobileUpload.tsx`, `MobileGigs.tsx`, `MobileTonight*.tsx`

**Goal:** Redesign the mobile shell + 5-tab bottom bar to embody the "backstage pass, not shrunken desktop" philosophy. Fix: Broadcast missing, Wallet Pass invisible, Mind tab underused, no gig-day adaptive state.

---

## Brand system (non-negotiable)

**BRT (Brutalist) theme — dark + red:**
- Background: `#050505` · Panel: `#0e0e0e` · Panel highlight: `#161616`
- Borders: dim `#1d1d1d` · default `#222` · bright `#2c2c2c`
- Accent: **red `#ff2a1a`** · red bright `#ff5040` · red deep `#a01510`
- Text: `#f2f2f2` / dim `#d8d8d8` / dimmer `#b0b0b0` / dimmest `#909090`
- Font: **Helvetica Neue everything**
- Hero display: weight 800, letter-spacing -0.035em, UPPERCASE
- Labels: weight 700, letter-spacing 0.22em, uppercase, 9px
- Body min: 14px, weight 500
- Scanlines + grain overlay site-wide

**Mobile adjustments:**
- Tap targets ≥44×44pt (iOS) / 48dp (Android) — non-negotiable
- Label text: 10–11px, uppercase, letter-spacing 0.18em (slightly larger than desktop 9px for readability)
- Icons: 20–24px line weight (currently 18–22px varies)
- Active state: `#ff2a1a` red (not gold — gold is dead)

---

## Hard rules

1. **No overflow at 320px width** — smallest iPhone SE portrait.
2. **Thumb-zone friendly** — primary nav in bottom third of screen.
3. **Tonight Mode auto-activates on gig day** — current behaviour incomplete (see dashboard brief P0).
4. **Wallet Pass discoverable in 1 tap on gig day** — currently 0 entries in mobile nav.
5. **Blur fees** — no raw £/$ anywhere.
6. **No em-dashes in outward-facing text.**
7. **No AI mentions in UI copy.**
8. **No fade-in** — full opacity frame 1.
9. **Screenshot-friendly** — mobile screens get shared as images; must render cleanly.

---

## What mobile is for (philosophy)

**Anthony's hard rule:** mobile is NOT a shrunken desktop. It is a purpose-built **"at the gig" experience**.
- Screenshot-friendly (shareable via iMessage/Signal)
- Logistics-first (set times, contacts, travel, advance)
- Strip everything non-urgent
- Boarding-pass feel

Desktop = control panel. Mobile = backstage pass.

---

## Current state — the 5 tabs

Reading `Navigation.tsx` (lines ~400–470):

| Tab | Icon | Route | Notes |
|-----|------|-------|-------|
| Home | — | `/dashboard` | Landing; on gig day could show Tonight Mode |
| Scan | ◎ | `/setlab` | Set Lab / Mix Scanner / Track ID |
| Promo | ↗ | `/releases?tab=promo` | Will become `/promo` post-migration |
| Tour | ◆ | `/gigs` | Gig list + detail |
| Mind | ✦ | `/meditate` | Niche meditation feature |

**Missing from bottom nav:**
- **Broadcast** (the #2 feature by usage) — inaccessible via persistent nav on mobile
- **Wallet Pass** — only discoverable via gig card link, never as nav entry
- No "create" / quick-action central button

---

## Current state — mobile shell structure

```
┌────────────────────────┐
│ [top bar?]             │  ← unclear if present
├────────────────────────┤
│                        │
│ Main content           │
│ (MobileShell routes)   │
│                        │
│                        │
│                        │
│                        │
│                        │
├────────────────────────┤
│ [Home][Scan][Promo][Tour][Mind]
└────────────────────────┘
```

---

## Problems ranked

### P0 (functional)

**1. Broadcast Lab absent from mobile nav** — the #2 feature has zero persistent entry. Users posting from phone have to type `/broadcast` in the URL bar. Hard rule: mobile nav should expose primary workflows.

**2. Wallet Pass invisible unless on home tab + gig exists** — boarding pass is the killer mobile feature. On gig day, it should be 1 tap from anywhere.

**3. No adaptive gig-day state** — the tab bar looks identical on gig day vs non-gig day. On a show day, Wallet should glow, Tonight should be the home default.

### P1 (priority)

**4. "Mind" (meditate) might not earn its slot** — niche feature in a slot contested by Broadcast. Options: fold Mind into a "more" menu, or swap for Broadcast.

**5. No central "create" action** — to post, send blast, or add gig, users navigate deep into sub-screens. A `+` centre button (radial or sheet menu) would surface creation flows.

**6. Route change pending** — `/releases?tab=promo` → `/promo` after Phase 3 of migration. Nav link target must update.

### P2 (polish)

**7. Active state colour drift** — some MobileShell code may still reference gold (`#c89b3c`). All active accents should be `#ff2a1a` red per current BRT design system.

**8. Icon weight inconsistency** — current mix of Unicode symbols (18–22px). Should standardise to 20px line icons.

**9. No long-press secondary actions** — tabs could offer a long-press menu (e.g., hold Tour → "New gig" / "Today's gig" / "All gigs").

---

## Redesign hypotheses

### A. Swap "Mind" for "Post" (or "Broadcast")

Conservative. 5 persistent tabs, keep the count. Broadcast gets its home.

```
[Home] [Scan] [Post] [Tour] [Wallet*]
```
(*Wallet only visible if `tonightGig` exists; otherwise Mind or fallback)

### B. Adaptive 5th slot

4 persistent tabs + 1 context-aware slot:

```
Non-gig day:
[Home] [Scan] [Post] [Tour] [+]      ← + opens create menu

Gig day:
[Home] [Scan] [Post] [Tour] [PASS]   ← glowing red wallet tab
```

### C. Central "+" action button (radial/sheet)

4 nav tabs + 1 raised central action button:

```
[Home] [Scan] [+ ACTION] [Tour] [Wallet?]
```
Tap + opens sheet: "New post / New gig / New blast / Track ID". Thumb-zone-friendly; matches pattern from Instagram, TikTok.

### D. Two-row tab bar on gig day

Gig day collapses a second row above the standard bar:

```
┌────────────────────────┐
│ [TONIGHT · 00H45]      │  ← gig-day only strip (red bg)
├────────────────────────┤
│ [Home][Scan][Post][Tour][Pass]
└────────────────────────┘
```
On non-gig day, hidden entirely.

### E. Tab bar with glowing active state (gig mode)

When `tonightGig` active, the Wallet tab pulses slowly in red. Low-intensity animation. Draws eye without being loud.

### F. Icon + label, not icon-only

Keep current pattern (icon above label). Increase label size to 10–11px for readability. Active tab label gets `font-weight 700`.

### G. Long-press secondary actions per tab

- Hold Home → Today's summary sheet
- Hold Scan → Last scan result
- Hold Post → Draft list
- Hold Tour → Today's gig / Next gig
- Hold Wallet → Full gig pass

Matches power-user pattern without cluttering UI.

### H. Route update: "Promo" points to `/promo`

Once Phase 3 of the `/promo` migration lands, update tab target. No UI change, just href.

---

## What MUST stay

- **5-tab count** — 6 tabs breaks the layout on 320px
- **Bottom position** — thumb-zone essential
- **BRT aesthetic** — red accent, Helvetica 700 labels, dark background
- **Icons 20px** (standardised)
- **Tap target ≥44×44pt**
- **Route-aware active state** (highlighting current section)

---

## What we're solving

- Give **Broadcast** a mobile home
- Make **Wallet Pass** 1-tap on gig day
- Replace **Mind** (or relocate to secondary)
- Add **gig-day adaptive state** (wallet glow, tonight mode default)
- Introduce a **central "create" action** pattern (or alternative)
- Unify **active colour** to red (no gold drift)
- Prepare for **`/promo` route** (Phase 3 nav update)

---

## Deliverable from claude.ai/design

**3 tab bar variants + adaptive states:**

1. **Variant A (Conservative)** — Swap Mind → Post. Keep 5 tabs. Add Wallet as contextual 6th only on gig day (replacing one tab).
2. **Variant B (Adaptive slot)** — 4 persistent + 1 context-aware slot. `+` normal day, Wallet on gig day.
3. **Variant C (Radial)** — Central `+` raised button opens sheet. 4 nav tabs around it.

For each variant, show:
- **Non-gig day** — home screen with tab bar
- **Gig day** — home screen showing Tonight Mode + tab bar (Wallet glowing or adaptive)
- **Tour tab** — gig list
- **Wallet Pass tab** — when active on gig day

All at **390px width** (iPhone 14/15 Pro). Additional: **320px width** (iPhone SE) variant of the tab bar alone to prove no overflow.

**BRT colour palette:**
- Background: `#050505`
- Panel: `#0e0e0e`
- Border dim: `#1d1d1d`
- Text: `#f2f2f2`
- Dimmer: `#b0b0b0`
- Active tab: `#ff2a1a` (red — no gold)
- Icons: 20px line weight

Keep it BRT — Helvetica Neue labels, uppercase, 10–11px, letter-spacing 0.18em. No em-dashes. No AI copy. All fees blurred if shown anywhere. Screenshot-friendly at every breakpoint.
