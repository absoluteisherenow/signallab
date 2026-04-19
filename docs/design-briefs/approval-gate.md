# Approval Gate Modal — Redesign Brief for claude.ai/design

**Component:** `/src/lib/approval-gate.tsx` (unified gate for all outbound actions)
**Provider:** `<ApprovalGateProvider>` wraps the root; consumed via `useApprovalGate()` + `useGatedSend()`
**Consumers:** All outbound flows — Instagram/TikTok/Threads posts, email, invoices, DM blasts, SMS
**Current state screenshot:** N/A (modal renders on demand; see BroadcastLab.tsx line 2363–2455 for post variant reference)
**Goal:** Redesign the approval modal to universally handle post, email, invoice, and DM with full content preview, clear recipient info, schedule affordance, and high-contrast approve/cancel.

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

1. **Approve before send** — the NORTH STAR. Nothing outbound fires without a full rendered preview + explicit user confirmation. Gate cannot be skipped.
2. **Full rendered preview mandatory** — post (with media at near-native size), email (in iframe), invoice (HTML), DM/SMS (text). Not a summary or sketch.
3. **Previews stay in-app** — no navigation away. Modal is the entirety of the confirm flow.
4. **Clear "to whom" info** — recipient(s) must be prominent and distinct. Not buried in meta labels.
5. **Platform/channel indicator** — which platform? (Instagram, email, WhatsApp, etc.) Must be visible without scrolling.
6. **Schedule affordance** — not buried inside. Must be accessible (tab or toggle) without losing the main preview.
7. **No em-dashes in outward-facing text** — captions, public content. Internal UI tolerant.
8. **Cancel path always works** — Escape key, background click, Cancel button. Never trap the user.
9. **Blur fees in invoice preview** — if amounts are visible, mask them (e.g. `$···.··` or blur filter) to prevent accidental screen-shares.
10. **Confirm destructive elsewhere** — this modal is confirm-send, not confirm-delete. Delete/clear use `window.confirm()`.
11. **No fade-in on visuals** — full opacity frame 1.
12. **No overflow without scroll** — modal body must be scrollable if content exceeds height; header + footer always visible.

---

## Current state — what renders today

**GateModal component (src/lib/approval-gate.tsx, lines 102–354):**

```
┌─────────────────────────────────────────────────┐
│ HEADER (fixed)                                  │
│  [kindLabel]  [summary]  [×]                    │
│  [To: recipient · meta]                         │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ BODY (flex: 1, overflow hidden)                 │
│  [iframe] (email HTML)                          │
│  OR [media thumbnails 120×120] + [text]         │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ FOOTER (fixed)                                  │
│  "Nothing sends until you confirm"              │
│  [Cancel] [Confirm ← gold bg]                   │
└─────────────────────────────────────────────────┘
```

**Observations:**
- Modal is 900px wide (min(900px, 100%)), 90vh tall
- Header: kind label (small) + summary (15px) + recipient info (11px) + meta rows (grid)
- Body: flex: 1, overflow hidden — **overflow is NOT scrollable, causes P0 cutoff**
- Media previews hardcoded 120×120px (too small for detail)
- Text body uses monospace, pre-wrap (correct)
- Footer: static label + buttons (Cancel [border], Confirm [gold])
- No keyboard shortcuts (Enter = approve, Esc = cancel)
- No schedule tab/affordance (must be built by caller in separate modal, e.g., BroadcastLab)
- Sending state: button disabled + opacity 0.5, no spinner or progress

---

## Problems with current design (ranked)

### 1. **Modal body can overflow viewport without scrolling (P0 — data loss)**
The body div has `overflow: hidden` (line 238). If content exceeds height, it clips. No scroll. User cannot see full email body, invoice, or caption.
- Affects: long email bodies, multi-page invoices, captions with line breaks
- Risk: user approves partially-visible content by accident
- Fix: `overflowY: 'auto'` on body div

### 2. **Media previews too small (120×120px hardcoded, line 264)**
For a post with a 9:16 vertical video or a carousel, 120×120 is thumbnail-size. User cannot see detail, color, text overlay legibility, composition.
- Affects: Instagram Reels, TikTok vertical, carousel posts
- Expected: at least 240–280px tall for vertical content
- Fix: aspect-aware sizing + larger footprint

### 3. **Recipient info not prominent (buried in 11px label row, line 197)**
"To: @handle · subject · platform" is compact but easy to miss. User could send to wrong contact.
- For invoice/email: "To: someone@example.com" is critical but rendered as one text node
- For post: "@channel" is the recipient, but it's mixed with platform/subject in a dense line
- Fix: "TO" as a separate, prominent chip/card above the preview

### 4. **Platform/channel indicator weak (mixed into meta row)**
Current: `{config.platform ? <> · {config.platform}</> : null}`
For a user with 10+ platforms, this 1-line indicator could be confusing. Especially risky for email (which one? work or personal?) and cross-platform DM blasts.
- Fix: heroic platform label, possibly with icon (Instagram logo, email icon, etc.)

### 5. **Schedule affordance absent (P1 — high-use flow)**
The unified gate has no schedule option. Callers (BroadcastLab, finances/page) build separate schedule modals outside the gate.
- Current flow: approve modal → dismiss → new schedule modal → approve again = friction
- Expected: Schedule as a tab/toggle inside the gate, "NOW" vs "SCHEDULE AT 14:00"
- Fix: add `schedule?: { date: string; time: string }` to GateConfig + tab UI

### 6. **No keyboard shortcuts (P1 — power-user friction)**
- Enter / Return should confirm (and only if not sending)
- Escape should cancel
- Currently: only mouse / screen readers have access
- Fix: add keydown listeners to modal

### 7. **No clear "what's about to happen" summary sentence**
Current header shows kind label + summary + recipient. But there's no single line that answers: "I'm about to send [WHAT] to [WHO] [WHEN]?"
- For a post: "About to publish Reel to Instagram, now"
- For email: "About to send invoice to jane@acme.com"
- For DM: "About to message 47 contacts on WhatsApp"
- Fix: one-line hero summary at the top

### 8. **Recipient field can show "NO RECIPIENT" error label in red**
Line 201: `<span style={{ color: 'var(--gold)' }}>NO RECIPIENT</span>`
This is defensive coding but flawed: the Confirm button is disabled if `!hasRecipient` (line 332), so the user never **reaches** the gate with no recipient. But if they do (backend race?), showing a red error is jarring. Better: prevent this state upstream.
- Fix: trust the caller; remove defensive check, or move it to a pre-gate validation

### 9. **No sending spinner or progress indication**
While `sending` is true, button shows "Sending…" but no spinner. On slow networks, user might think it hung.
- Fix: add subtle spinner icon beside "Sending…"

### 10. **Confirm button stays gold regardless of hasRecipient**
Line 334: `background: hasRecipient ? 'var(--gold)' : 'var(--border)'`
If no recipient, button dims. But in practice, this shouldn't happen (see #8). Cleaner to either: (a) trust caller, or (b) make recipient validation visible before the gate opens.

---

## Redesign hypotheses (for claude.ai/design to explore)

### A. Clear 3-part layout: TO · WHAT · WHEN

```
┌────────────────────────────────────────────────────────────────┐
│ [CLOSE ×]                                                      │
│                                                                │
│ TO:  [🔵 Instagram] @art_collective · 47 followers            │
│                                                                │
│ ════════════════════════════════════════════════════════════ │
│                                                                │
│ PREVIEW (60%+ of modal height)                                │
│ [full-height image / email body / invoice]                    │
│ [scrollable if needed]                                        │
│                                                                │
│ Caption: "Low rise trends rn. Here's why..."                  │
│ (monospace, full width, readable)                             │
│                                                                │
│ ════════════════════════════════════════════════════════════ │
│                                                                │
│ WHEN:  [NOW] [SCHEDULE ▾]                                     │
│ (toggle or dropdown — if SCHEDULE: date + time pickers)      │
│                                                                │
│ ════════════════════════════════════════════════════════════ │
│                                                                │
│ [← EDIT]           [CANCEL] [APPROVE →] ← full red, high     │
│                                          contrast             │
└────────────────────────────────────────────────────────────────┘
```

**Rationale:**
- **TO** is a prominent chip/card at the top, not a label. Uses platform icon + handle/email + context (follower count, recipient count, etc.)
- **WHAT** (preview) dominates the vertical real estate. Media/email/invoice at near-native size. Scrollable if needed.
- **WHEN** is a simple toggle (NOW vs SCHEDULE), not hidden inside an options drawer.
- **Approve button** is full-width, red (`#ff2a1a`), high contrast. Right-aligned but dominates.

### B. Hero the content preview at 60%+ of modal height

Current: preview is `flex: 1` (competes with header/footer for space). Proposed: reserve 70% of modal for preview.

Example at 800px tall modal:
- Header: 120px
- Preview: 560px (scrollable)
- Footer: 120px

This gives Reels videos, carousel grids, and email bodies enough vertical breathing room.

### C. Media previews as actual-size thumbnails, not 120×120

For a carousel (3 images), show them in a row at 200×200px (or aspect-aware). For a Reel, show 280px tall (9:16). For a single static post, full width up to 400px.

Guidance: `media` array can have varied aspect ratios; preserve each one, don't force square.

### D. Recipient as chips with platform icons

Instead of:
```
To: someone@example.com · email
```

Show:
```
TO:  [📧 jane@acme.com]   [→ Due: 2026-04-25]
```

Or for DM blast:
```
TO:  [📱 WhatsApp] 47 contacts   [→ Reach: ~120 people]
```

Chips are visually distinct, use platform emoji/icon, and can show secondary meta (due date, reach, etc.) as a label.

### E. Approve button: right side, red, full bleed, high contrast

```
[← EDIT]                                    [CANCEL] [APPROVE →]
```

- APPROVE is `background: #ff2a1a`, `color: #050505`, weight 700, uppercase
- CANCEL is `border: 1px solid #222`, `color: #d8d8d8`, no fill
- APPROVE is at least 44px tall (touch-safe)
- Both are sticky at bottom (footer always visible)

### F. Schedule as a tab at top, not toggle

Instead of a toggle that appears inline, Schedule is a tab:

```
┌────────────────────────────────┐
│ [NOW]  [SCHEDULE]              │
├────────────────────────────────┤
│ NOW tab:  "Going live now"     │
│ SCHEDULE tab: [date] [time]    │
│             [suggested slot]   │
└────────────────────────────────┘
```

- Tabs at the very top, below the TO chip
- Default to NOW (instant send is common)
- But Schedule is equally prominent (not a hidden option)
- If SCHEDULE selected, show a blue banner "Scheduled for Thu 6pm" + "Review in Calendar"

### G. One-line hero summary before the preview

Before the preview content, a single sentence:

```
About to publish Reel to Instagram · 9:16 · 15 seconds
About to send invoice to jane@acme.com · Due Apr 25 · $1,200
About to message 47 contacts on WhatsApp · Opens wa.me
```

This answers the 3 questions: **what + to whom + context** in one glance.

### H. Keyboard shortcuts + accessibility

- **Enter / Return:** confirm (if not sending, not disabled)
- **Escape:** cancel
- **Tab:** cycle through buttons
- **Screen reader:** modal announces kind ("Review post before publish") + recipient + summary

---

## What MUST stay

- **Gate cannot be skipped** — `ApprovalGateProvider` always renders; caller must `await gate(config)` before send
- **Full rendered preview mandatory** — never a skeleton, link, or summary. Post shows actual image/video. Email shows HTML iframe. Invoice shows blurred amounts.
- **Cancel path always works** — Escape, background click, Cancel button. No dead ends.
- **Works across 4 content types** — post (Instagram/TikTok/Threads), email, invoice, DM/SMS
- **BRT aesthetic** — Helvetica, dark, red accent, scanlines
- **`sendingState` and disable logic** — button disables while sending, "Sending…" label shows
- **Recipient validation** — though ideally moved upstream

---

## What we're solving

1. **Data loss from overflow** — make body scrollable
2. **Tiny media previews** — scale to 240–400px depending on content type
3. **Recipient obscurity** — heroic chip / card at the top
4. **Schedule friction** — tab inside the modal, not a separate flow
5. **No keyboard shortcuts** — Enter = approve, Esc = cancel
6. **One-glance summary** — single line: "About to [action] [recipient] [context]"
7. **Platform clarity** — icon + label, not text only
8. **Modal height efficiency** — 70% for preview, 30% for chrome

---

## Screenshot reference

**Current state modals (see in production):**
- **Post (Instagram Reel):** BroadcastLab.tsx line 2363–2455 (local implementation, not using unified gate)
- **Email (invoice):** finances/page.tsx line 292–316 (uses unified gate + iframe preview)
- **DM (WhatsApp):** releases/page.tsx line 415–430 (uses unified gate, text-only)

None of the current modals are "perfect" — they each solve their own gate flow, but the unified gate is more minimal and generic (by design). Redesign should unify all four without losing content fidelity.

---

## Deliverable from claude.ai/design

Give me **3 layout variants**, each showing all **4 content types** (Instagram post, email, invoice, DM):

### Variant 1: **Compact (minimal change)**
- Same proportions, fix scrolling + media size
- Recipient as a small card (not chip)
- Schedule as toggle, not tab
- Keep footer buttons as-is

### Variant 2: **Balanced (recommended)**
- 3-part layout (TO · WHAT · WHEN)
- Hero content preview (70% height)
- Recipient as prominent chip
- Schedule as tab
- Approve button full-red, right-aligned

### Variant 3: **Radical (future)**
- Full-width modal (90vw, not 900px)
- Recipient as a top banner (fixed)
- Content preview as a centred card with shadow
- WHEN at bottom with smart scheduling hints ("Best slot: Thu 6pm")
- Approve + Cancel as sticky footer

For each variant, show:
- **1440px desktop width** (full viewport)
- **All 4 content types** — one instance each:
  - Instagram Reel (9:16 video, caption, platform chip)
  - Email invoice (HTML iframe, recipient @domain, amount blurred)
  - DM WhatsApp (text-only, recipient count, platform icon)
  - SMS (short text, 160 char limit, to: +1234567890)
- **Sending state** — button in "Sending…" state, slightly grayed
- **Schedule tab variant** (if applicable) — show SCHEDULE tab selected, date/time pickers visible

**Style must stay BRT:** no deviation from the brand system. I can't adopt anything that strays from Helvetica + #ff2a1a + #050505.

---

## Notes for designers

- **Media aspect ratios:** Instagram (square or 9:16), TikTok (9:16), Threads (square or 1.91:1), carousel (auto-grid)
- **Email preview:** renders in `<iframe sandbox="">` with white background (#fff). Must be scrollable if tall.
- **Invoice preview:** HTML, white background. Show line items but blur `<span>` amounts with `filter: blur(4px)` or similar.
- **DM text:** monospace, pre-wrap, 240–400px wide. Simple. No emoji parsing (keep as literal chars).
- **Recipient context:** follower count (post), email domain (invoice), contact count (DM), phone format (SMS)
- **Keyboard:**
  - Test Enter = approve, Esc = cancel at all screen sizes
  - Test Tab cycle: TO chip → preview → WHEN buttons → CANCEL → APPROVE
  - Ensure focus states are visible (border or outline)

---

## Compliance checklist

- [ ] No overflow without scroll
- [ ] Media previews ≥200px tall
- [ ] Recipient visible in top 80px
- [ ] Platform/channel icon or label in top 100px
- [ ] WHEN (now/schedule) accessible without scrolling main preview
- [ ] Cancel button always reachable
- [ ] Escape key works
- [ ] Approve button is 44px+ tall, red, high contrast
- [ ] Sending state shows "Sending…", button disabled, no interactions
- [ ] BRT aesthetic (Helvetica, #050505, #ff2a1a, no gold in buttons)
- [ ] Handles all 4 content types equally (no "post-only" assumptions)
- [ ] HTML email renders in iframe; no JS, no network reqs
- [ ] Invoice amounts are blurred (mockup only; backend blurs real data)

