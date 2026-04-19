# Visual Reference Pack — Signal Lab design briefs

Curated references for the 3 components still missing mockups. Feed alongside the brief into claude.ai/design.

- [Approval Gate](#approval-gate) — unified send-confirm modal
- [Gig Card](#gig-card) — backstage pass system (desktop + mobile + wallet)
- [Mobile Tab Bar](#mobile-tab-bar) — adaptive bottom nav

All references annotated with **what element it contributes** so you can cherry-pick per design decision.

---

## Approval Gate

### 1. Send-confirm modals in the wild
- **Superhuman Send Later (Dribbble)** — https://dribbble.com/shots/15366770-Superhuman-Send-Later
  Teresa Man's native Send Later sheet. **Contributes:** schedule UX — inline time picker with preset chips ("tomorrow morning", "Monday 9am") stacked vertically. Copy for the WHEN row.
- **Superhuman Send Later v2** — https://new.superhuman.com/send-later-with-peace-of-mind-134800
  Peace-of-mind pattern. **Contributes:** guardrail microcopy placement under the approve button.
- **Gmail Undo Send (pattern writeup)** — https://bethaitman.com/posts/ui-writing/confirmation/
  **Contributes:** inverse reference — reminder that Anthony explicitly rejected post-send undo. Gate must be pre-send.
- **iMessage Send With Effect sheet** — https://support.apple.com/en-us/104970
  **Contributes:** preview sizing — the message bubble renders at true size inside the sheet, not a thumbnail. Mirror for IG post previews.
- **Linear Peek preview** — https://linear.app/docs/peek
  Glass-effect modal that lightens vs background. **Contributes:** panel elevation — for `#0e0e0e` on `#050505`, consider +3% luminance lift, not a drop shadow.
- **Linear design refresh** — https://linear.app/now/behind-the-latest-design-refresh
  Recede vs focus. **Contributes:** hierarchy — TO/WHEN rows recede (grey labels), WHAT preview dominates.

### 2. Brutalist / dark-red UI systems
- **CircoLoco Records** — https://circolocorecords.com/
  **Contributes:** base palette confirmation — this is the exact `#050505` feel. Master reference.
- **Balenciaga.com** — https://www.balenciaga.com/
  **Contributes:** label treatment — all-caps micro-labels with tight letter-spacing. Maps directly to 0.22em rule.
- **The Brvtalist** — https://thebrvtalist.com
  **Contributes:** scanline / grain texture — how to add subtle noise without killing legibility.
- **Awwwards Brutalism collection** — https://www.awwwards.com/awwwards/collections/brutalism/
  **Contributes:** flat red CTAs with no border-radius.
- **Yeezy Display (Ty Finck)** — https://yeezydisplay.com/
  **Contributes:** approve button typography — weight + tracking for "APPROVE" / "SEND NOW".
- **BrutalistWebsites.com** — https://brutalistwebsites.com/
  **Contributes:** directory, filter for dark + red accent.

### 3. Rendered content preview modals
- **Buffer composer preview** — https://buffer.com/publish
  **Contributes:** WHAT panel layout — split pane (controls left, rendered post right), validation chips.
- **Buffer customize-per-network** — https://support.buffer.com/article/642-scheduling-posts
  **Contributes:** multi-channel pattern if Gate ever previews IG + email side-by-side.
- **Stripe invoice preview** — https://docs.stripe.com/invoicing/preview
  **Contributes:** invoice preview — full PDF render in a scrollable frame, not a summary table.
- **Stripe hosted invoice page** — https://docs.stripe.com/invoicing/hosted-invoice-page
  **Contributes:** what the invoice preview should actually contain.
- **Mailchimp preview & test** — https://mailchimp.com/help/preview-and-test-your-email-campaign/
  **Contributes:** device toggle — useful for IG-post previews (feed vs profile grid).
- **Notion hover page preview** — https://x.com/NotionHQ/status/1798043862172348899
  **Contributes:** mini-preview for recipient TO row (show contact card on hover).

### 4. Approve-before-destroy patterns with schedule
- **X/Twitter schedule tweet composer** — https://business.x.com/en/advertising/tweet-composer
  **Contributes:** WHEN UX — inline overlay rather than separate step, preserves the preview.
- **Typefully schedule guide** — https://typefully.com/blog/schedule-tweets
  **Contributes:** confirmation receipt — "scheduled for Mon 6pm BST" chip above approve.
- **Superhuman scheduled folder** — https://help.superhuman.com/hc/en-us/articles/45237127271699-Guides
  **Contributes:** post-approval state — where does the Gate go after approve+schedule.
- **Outfy guide on Twitter scheduler** — https://www.outfy.com/blog/how-to-schedule-tweets-on-twitter/
  **Contributes:** date/time picker sizing inside a modal.
- **UX Psychology — destructive action modals** — https://uxpsychology.substack.com/p/how-to-design-better-destructive
  **Contributes:** red-button placement — action verb on the button ("Send now" not "OK"), cancel as link.
- **PatternFly modal guidelines** — https://www.patternfly.org/components/modal/design-guidelines/
  **Contributes:** accessibility baseline — ARIA roles, focus trap rules.

---

## Gig Card

### 1. Physical tour/backstage laminates
- **Boiler Room AAA** — https://boilerroom.tv/recording/aaa/
  **Contributes:** uppercase block-type + red accent lockup for hero label ("TONIGHT / AAA").
- **Arnett tour laminates** — https://www.arnettcredentials.com/product/custom-tour-laminates/
  Gallery of real tour laminates (pantone blocks, die-cut shapes, bold type). **Contributes:** panel hierarchy — big artist/date block up top, small dense info rows below. Direct template for desktop.
- **Holopasses backstage 4C** — https://holopasses.com/en/collections/backstagepasslaminateholo
  Holographic laminates with giant set-time zones. **Contributes:** scanline/foil overlay treatment on `#0e0e0e`.
- **Dekmantel Flickr tag** — https://www.flickr.com/photos/tags/dekmantel/
  **Contributes:** how a laminate reads at arm's length — validates the 64–80px time hero.
- **Access Event Solutions laminates** — https://www.accesseventsolutions.com/laminates/
  **Contributes:** zone-based layout (photo / TIME / venue / role) → maps cleanly to travel accordion + contact row.

### 2. Digital boarding passes + wallet cards
- **Apple PassKit spec** — https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html
  **Contributes:** canonical screenshot-safe layout (header strip, primary field = TIME, aux fields, barcode footer).
- **Ticketmaster Apple Wallet guide** — https://business.ticketmaster.com/apple-wallet-passes-design-best-practices-and-fan-engagement-guide-2/
  **Contributes:** how to treat the Wallet Pass shareable (full-bleed BG, semantic tags, no fees).
- **let's dev new Wallet layout (2024)** — https://letsdev.de/en/blog/new-event-ticket-layout-apple-wallet
  Teardown of the enhanced layout. **Contributes:** venue guide + live-activity patterns = direct model for Tonight Mode countdown.
- **Dribbble Apple Wallet tag** — https://dribbble.com/tags/apple-wallet
  **Contributes:** broad library for time-as-hero hierarchy and high-contrast mono layouts.
- **Mobbin DICE flow** — https://mobbin.com/explore/flows/2e514fe9-f1cd-40c0-a627-a45ccfb14303
  Full DICE buy-flow incl. ticket-live screen. **Contributes:** the "screenshot moment" — what a shareable ticket looks like on-device.
- **Angel Guillen DICE UX case study** — https://angelguillen.net/dice-ux-ui/
  **Contributes:** QR + time + address stacking order.

### 3. Countdown / set time hero designs
- **Stagetimer** — https://stagetimer.io/
  Remote stage-timer used in live production. **Contributes:** exact type-scale reference for 64–80px HH:MM hero.
- **Game UI Database — Clock & Timer** — https://www.gameuidatabase.com/index.php?scrn=137
  **Contributes:** dense library of monospaced, letter-spaced countdown treatments.
- **Dribbble countdown-timer** — https://dribbble.com/tags/countdown-timer
  **Contributes:** Tonight Mode glanceable hero pattern.
- **Collect UI countdown** — https://collectui.com/challenges/countdown-timer
  96 juried designs. **Contributes:** label/value pairing (UPPERCASE 0.22em label, numeric hero).
- **NTS Radio live** — https://www.nts.live/radio
  Live grid with "Live now / Next on" cards. **Contributes:** terse metadata under a big state label.
- **NTS Now Playing example** — https://github.com/tiktuk/NTS-Now-Playing-Example
  **Contributes:** data model for live countdown → set state transition.

### 4. Brutalist ticket / event pages
- **Boiler Room upcoming** — https://boilerroom.tv/upcoming/
  **Contributes:** direct aesthetic match for `#050505` BG + Helvetica UPPER.
- **CircoLoco NY Halloween on RA** — https://ra.co/events/2238293
  **Contributes:** event-detail anatomy (date hero, lineup block, venue with map) = skeleton for desktop admin view.
- **HÖR Berlin on RA** — https://ra.co/clubs/177928
  **Contributes:** minimal venue card + upcoming-sets list = travel accordion precedent.
- **RA Guide redesign case study** — https://medium.com/@emirceren/ra-guide-redesign-balancing-brutalist-aesthetics-with-usability-e6ae2c817969
  **Contributes:** mapping principles — how to keep harsh BRT type readable in a working admin tool.
- **The Brvtalist** — https://thebrvtalist.com
  **Contributes:** tonal/colour match for accent red `#ff2a1a` on `#050505`.
- **CircoLoco promoter page on RA** — https://ra.co/promoters/113
  **Contributes:** list-row rhythm → model for card stacking in desktop detail.

---

## Mobile Tab Bar

### 1. Adaptive / context-aware tab bars
- **iOS 26.1 Apple Music MiniPlayer** — https://9to5mac.com/2025/11/04/ios-26-1-gave-apple-music-convenient-new-trick/
  MiniPlayer strip sits directly above tab bar, collapses into tab row when scrolled. **Contributes:** gig-day hero strip pattern above the 5 tabs.
- **Recreating Apple Music Now Playing transition** — https://www.kodeco.com/221-recreating-the-apple-music-now-playing-transition
  **Contributes:** tap-to-expand Wallet Pass interaction.
- **Spotify redesigned mini player** — https://www.androidpolice.com/2021/07/28/spotify-is-getting-a-redesigned-mini-player-ui-with-a-more-modern-look/
  Floating rounded mini-player above nav tabs. **Contributes:** elevated gig-day strip treatment.
- **Uber Base — bottom navigation** — https://base.uber.com/6d2425e9f/p/1413a0-bottom-navigation
  Official Uber tab-bar spec with state variants. **Contributes:** adaptive slot token system, active/inactive semantics.
- **Architecting Uber's Driver App in RIBs** — https://www.uber.com/blog/driver-app-ribs-architecture/
  On-Task vs Off-Task state swap. **Contributes:** normal-day vs gig-day state architecture.
- **Strava Live Activities on iOS** — https://support.strava.com/hc/en-us/articles/39508401687693-Strava-Live-Activities-on-iOS
  During-record screen replaces tabs with activity controls. **Contributes:** takeover pattern for "show day" mode.
- **Airbnb 2025 Summer Release (Trips tab)** — https://news.airbnb.com/airbnb-2025-summer-release/
  Trips tab mutates into live itinerary during a stay. **Contributes:** context-aware 5th slot transformation.

### 2. Central raised "+" button patterns
- **Why Instagram's nav bar differs new vs old users** — https://medium.com/design-bootcamp/why-instagrams-navigation-bar-looks-different-for-new-and-old-users-45c53138b4a9
  **Contributes:** adaptive 5th slot rationale.
- **Instagram redesign — Reels centred** — https://techcrunch.com/2020/11/12/instagram-redesign-puts-reels-and-shop-tabs-on-the-home-screen/
  **Contributes:** visual weight for glowing Pass slot.
- **Dribbble floating button menu tab bar** — https://dribbble.com/search/floating-button-menu-tab-bar
  200+ raised-centre FAB patterns. **Contributes:** elevation + notch cutout references.
- **Dribbble Navigation Bars collection (Gulzaib Aslam)** — https://dribbble.com/gulzaibaslam/collections/4310496-Navigation-Bars-for-Apps
  **Contributes:** composition studies.
- **Robinhood UI Secrets** — https://itexus.com/robinhood-ui-secrets-how-to-design-a-sky-rocket-trading-app/
  **Contributes:** restraint model when action replaces a tab.
- **Robinhood UX Flow (Page Flows)** — https://pageflows.com/ios/products/robinhood/
  **Contributes:** action-button-in-tab-row compositions.

### 3. Brutalist / dark mobile nav systems
- **NTS Radio on App Store** — https://apps.apple.com/us/app/nts-radio/id1204567739
  **Contributes:** label casing + scanline vibe parallel.
- **Dribbble NTS tag** — https://dribbble.com/tags/nts
  **Contributes:** uppercase label / 10-11px spacing studies.
- **Redesigning Resident Advisor App — UX case study** — https://medium.com/@elen2698/redesigning-resident-advisor-app-a-ux-case-study-f8408a272934
  **Contributes:** club-listings tab-bar precedent.
- **Dribbble Resident Advisor tag** — https://dribbble.com/tags/resident-advisor
  **Contributes:** nightlife vertical aesthetic.
- **Mobbin — Dark Mode screens** — https://mobbin.com/explore/mobile/screens/dark-mode
  **Contributes:** `#050505` / `#0e0e0e` panel-on-panel contrast references.
- **Dribbble Brutalist App** — https://dribbble.com/search/brutalist-app
  **Contributes:** border/label treatment for active red tab.

### 4. Boarding-pass / transit mobile UIs
- **Apple HIG — Wallet** — https://developer.apple.com/design/human-interface-guidelines/wallet
  Canonical pass layout. **Contributes:** Wallet Pass full-sheet structure.
- **Apple HIG — Designing Passes** — https://developer-mdn.apple.com/design/human-interface-guidelines/technologies/wallet/designing-passes
  **Contributes:** QR hero + field hierarchy for gig-day Pass.
- **Figma — Apple Wallet Templates** — https://www.figma.com/community/file/1116649452413390881/apple-wallet-templates
  **Contributes:** editable Figma source for Pass layout.
- **Citymapper iOS Lock Screen Navigation** — https://citymapper.com/news/2553/citymapper-introduces-ios-lock-screen-navigation
  GO-mode hero strip with live ETA. **Contributes:** countdown strip treatment for "doors in 2h 14m."
- **Citymapper App screens (UI Sources)** — https://uisources.com/app/citymapper
  **Contributes:** transit hero-strip compositions.
- **Google Maps redesigned bottom bar** — https://9to5google.com/2024/03/27/google-maps-bottom-bar/
  Simplified 3-tab bar with contextual hero card above during nav. **Contributes:** turn-instruction hero strip above tabs.

---

## How to use this

1. Open the brief for the component you're working on (`approval-gate.md` / `gig-card.md` / `mobile-tab-bar.md`)
2. Skim this doc's matching section, click 3–5 refs that hit closest to the brief's problems
3. Paste into claude.ai/design chat: *"Here's the brief, here are 5 reference URLs that capture the aesthetic I want — generate 3 variants"*
4. For BRT aesthetic anchoring, always include **CircoLoco Records** + **The Brvtalist** + **Boiler Room upcoming** regardless of component — they lock the base `#050505` + Helvetica + red `#ff2a1a` register.

Total: 72 refs across 3 components.
