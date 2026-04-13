# Vespers Execution Plan
## NIGHT manoeuvres -- internal working document

**Show:** Vespers, London -- Friday 12 June 2026
**Capacity:** 250
**Tickets sold:** 26 (as of April 13)
**Targets:** Sell out (250) + 5K followers
**Total ad budget:** £675
**Campaign ID (existing test):** 120244327660910512

---

## TEST CAMPAIGN DATA (real, from Meta API)

| Metric | Value |
|--------|-------|
| Spend | £5.14 |
| Reach | 1,535 |
| Link clicks | 32 |
| Landing page views | 16 |
| CPC | £0.16 |
| CPM | £3.15 |
| Best demo | Males 35-44: £0.12 CPC, 3.4% CTR |

**Key insight:** Targeting and creative work. But sending cold traffic straight to RA is inefficient (50% LPV drop-off). Warm the audience first, then convert.

---

## INTEREST TARGETING STACK

All campaigns use the same interest stack (layered, not individual):

**Primary (confirmed targetable, high intent):**
- Resident Advisor
- Boiler Room
- Bicep

**Secondary (strong overlap, test and validate):**
- Four Tet
- Jamie xx
- Floating Points
- Disclosure

**Tertiary (broader reach, use for Campaign 1 pool building):**
- Cercle
- HÖR Berlin
- Mixmag
- Ben Böhmer
- Peggy Gou

**Audience layers:**
- Layer 1 (warm): IG engagers 30/60/90 day, video viewers 25%+, RA link clickers
- Layer 2 (lookalike): 1% lookalike of engagers (never above 1% for underground)
- Layer 3 (cold): Interest stack above, London 25km, 21-44
- **Always exclude:** existing followers from Campaigns 1 + 4. Mainstream EDM interests (Tomorrowland, Ultra, Martin Garrix).

**Interest stacking rule:** Stack 2-3 interests per ad set (e.g. "Resident Advisor" AND "Boiler Room") for higher intent. Don't target single interests alone -- too broad.

---

## AD MANAGEMENT PROTOCOL

- **Daily:** Check CPC, CTR, frequency, spend pacing across all campaigns
- **48-hour rule:** Kill any ad with CTR below 1% after 48 hours. Don't wait for it to improve.
- **7-10 day rotation:** Swap creative before fatigue sets in. Never run the same ad for more than 10 days.
- **Frequency cap:** Pause any ad set where frequency exceeds 3.0. Audience is seeing it too much.
- **Budget reallocation:** Shift spend in real-time toward best-performing creative and audiences. If one ad set has 3% CTR and another has 0.8%, kill the weak one and move budget same day.
- **Scale triggers:** CTR above 2% = increase daily budget by 20%. Engagement rate above 5% = expand to lookalike audiences.
- **Creative pipeline:** Always have next week's creative ready before killing current. Never pause with nothing to replace.
- **Weekly review:** Every Monday, review previous week's data. Adjust targeting, creative, and budget split.
- **Reporting:** Weekly snapshot of spend, CPC, CTR, tickets attributed, cost per ticket, follower growth.

---

## FOUR-CAMPAIGN AD STRUCTURE

### Campaign 1: ENGAGEMENT POOL BUILDER
Build a warm audience cheaply before asking anyone to buy.

| Field | Detail |
|-------|--------|
| Objective | Video views + post engagement |
| Budget | £175 |
| Window | Apr 14 - May 18 (5 weeks) |
| Pacing | £4-6/day |
| Targeting | London 25km, 21-44, interests: see targeting stack below. EXCLUDE existing followers. |
| Placements | IG Stories + Reels (9:16 creative, 70%+ of spend) |
| Creative | Studio performance clips (15s), Buchla session clips, best organic posts. Rotate every 7-10 days. |
| KPI targets | Cost per engagement < £0.05, video view rate > 15% |
| Kill trigger | CTR below 0.5% after 48hrs |
| Output | Retargeting pool of 5,000-15,000 warm people |

**Week 6 bomb:** When Athens/Caribou content drops, immediately load it as Campaign 1 creative. That content should massively expand the warm pool right before the final conversion push.

### Campaign 2: TICKET CONVERSION
Only retargets warm people. Never cold.

| Field | Detail |
|-------|--------|
| Objective | Traffic to RA ticket page |
| Budget | £300 |
| Window | May 1 - Jun 12 (6 weeks) |
| Pacing | £4/day weeks 1-4, £10-15/day final 2 weeks |
| Targeting | Custom: Campaign 1 video viewers (25%+) + IG engagers (60 days) + 1% lookalike of engagers. Never above 1% lookalike. |
| CTA | GET_TICKETS |
| Creative | Best-performing content from Campaign 1. Final week: "This Friday at Vespers" framing. |
| KPI targets | CPC < £0.25, LPV rate > 60% |
| Kill trigger | CPC above £0.50 for 3+ days |
| Scale trigger | CTR above 2%: increase daily budget by 20% |
| Output | 1,250-1,750 clicks, 38-84 tickets |

### Campaign 3: RETARGETING (the closer)
People who clicked but didn't buy. Highest intent.

| Field | Detail |
|-------|--------|
| Objective | Traffic to RA ticket page |
| Budget | £125 |
| Window | May 15 - Jun 12 (4 weeks) |
| Pacing | £3-5/day |
| Targeting | Custom: RA link clickers (non-converters) + people who engaged 3+ times with NM content |
| Creative | Different angle: social proof, venue atmosphere, "250 capacity". Stories placement (full screen). |
| Frequency cap | 3x/week max. Refresh creative when frequency hits 2.5. |
| KPI targets | CPC £0.25-0.40 acceptable (higher conversion rate: 8-15%) |
| Output | 250-600 clicks, 12-54 tickets |

### Campaign 4: FOLLOWER GROWTH (always-on boost)
Organic content does the work. Ads amplify winners only.

| Field | Detail |
|-------|--------|
| Objective | Engagement (optimised for profile visits) |
| Budget | £75 |
| Window | Apr 14 - Aug (£1-2/day) |
| Targeting | 1% lookalike of existing followers. UK-wide, 21-44. Exclude existing followers. |
| Creative | ONLY boost posts that outperformed 2x average organically. Kill any boosted post below 1% CTR after 48hrs. |
| KPI targets | Cost per follower < £0.30 |
| Output | 200-400 paid followers |

### Weekly Budget Pacing

| Week | Pool | Convert | Retarget | Follow | Total |
|------|------|---------|----------|--------|-------|
| Apr 14-20 | £30 | -- | -- | £10 | £40 |
| Apr 21-27 | £30 | -- | -- | £10 | £40 |
| Apr 28-May 4 | £35 | £25 | -- | £10 | £70 |
| May 5-11 | £35 | £25 | -- | £10 | £70 |
| May 12-18 | £35 | £30 | £20 | £10 | £95 |
| May 19-25 | £10 | £40 | £25 | £15 | £90 |
| May 26-Jun 1 | -- | £60 | £30 | £10 | £100 |
| Jun 2-8 | -- | £70 | £35 | -- | £105 |
| Jun 9-12 | -- | £50 | £15 | -- | £65 |

---

## WHATSAPP PERSONAL OUTREACH

### Strategy
Three waves. Each has a different energy. Never spam -- every message should feel like a personal invite, not a broadcast.

### Wave 1: Inner Circle (Apr 21-25)
**Who:** Close friends, regular gig-goers, people who'd come regardless
**Message energy:** Casual, personal. "We've got a headline at Vespers on June 12. Would be amazing to have you there." Include RA link.
**Goal:** Lock in 15-25 committed. These become social proof for Wave 2.
**Action:** Ask them to share the RA link on their stories / forward to friends who'd be into it.

### Wave 2: Extended Network (May 5-9)
**Who:** Industry contacts, music friends, people from the scene, DJs, producers, label people, venue staff
**Message energy:** Professional but warm. "Headline show at Vespers with Percolate, June 12. Intimate room, 250 cap. Here's the link if you're around."
**Goal:** 20-30 tickets. Some of these people bring +1s.
**Timing:** After All for You EP drops (April 17) so there's fresh context.

### Wave 3: Final Push (Jun 2-6)
**Who:** Anyone from Wave 1+2 who didn't respond + wider London contacts
**Message energy:** Low-key urgency. "Show's filling up, wanted to make sure you saw this before it sells through." Only if tickets are genuinely moving.
**Goal:** 10-20 tickets. Last chance energy without desperation.

### WhatsApp Rules
- [ ] Never bulk broadcast -- individual messages or small groups only
- [ ] Personalise where possible ("saw you at X last week, this is the next one")
- [ ] Include RA link every time -- make it one tap to buy
- [ ] If someone commits, ask them to share their story / forward
- [ ] Track who you've messaged and responses (simple spreadsheet or Signal Lab note)

### Projected WhatsApp tickets: 30-60

---

## FILMING & CONTENT PRODUCTION SCHEDULE

### Week 1: April 14-20 (THIS WEEK)

**Film:**
- [ ] **NDR Record Picks** -- 5 vinyl pulls from Next Door Records' catalogue. Records NM loves / plans to play at Vespers. Overhead vinyl shots, close-ups of labels + artwork. Same visual language as Records That Shaped Them. Tag NDR when posted -- they're on the lineup, they reshare.
- [ ] **All for You EP content** -- EP drops April 17 on fabric Records. Film: studio playback moment, vinyl/artwork reveal, atmospheric clip of lead track on monitors.

**Post:**
- Mon 14: First grid post of the campaign. Strong opener.
- Thu 17: All for You EP announcement -- artwork + title + date + fabric. Pin to grid.
- Sat 19: All for You EP -- behind the track, production detail, or alternate clip
- Stories: ticket link, BTS from studio/listening sessions

**fabric Records:**
- [ ] Confirm All for You EP promo includes Vespers date (June 12) in fabric's channels -- socials, mailers, RA promo
- [ ] Same for Visions (May 14) -- confirm Vespers mention in promo copy

**Ads:**
- [ ] Launch Campaign 1 (Engagement Pool): £30/week, studio clips + best organic as creative
- [ ] Launch Campaign 4 (Follower Growth): £10/week, boost top organic post
- [ ] Pause or restructure existing test campaign (ID: 120244327660910512) -- absorb learnings into new structure

**Ingest:** NDR record pick photos/clips, All for You EP assets

---

### Week 2: April 21-27

**Film:**
- [ ] **Studio Performance shoot** -- the centrepiece. Full Hybrid Live rig: 4x CDJ-3000, V10, 2x 1210, OB-6, Ableton Move. Shot on Sony FX3, lit with Astera Titan Tubes + ADJ Focus Spot 2X moving heads + Zhiyun Molus G200 COB LED. One session produces 8-10 posts:
  - Full performance (3-5 min) for YouTube/long-form IG
  - 3x Reel clips (7-30s each) -- different moments, different energy
  - BTS carousel (setup, soundcheck, lighting)
  - Story series (real-time during filming)
  - Booth POV / close-up angles

**Post:**
- Mon 21: NDR Record Picks carousel -- 5 slides, tag NDR, tag Vespers
- Thu 24: All for You EP different angle
- Sat 26: Records That Shaped Them or Hybrid Live World
- Stories: ticket link, studio session BTS teasers

**WhatsApp:**
- [ ] **Wave 1: Inner Circle** -- personal invites to close friends / regulars. Lock in 15-25 committed.

**Ads:**
- Campaign 1 continues. Monitor: cost per engagement (target < £0.05)
- Campaign 4: if NDR Record Picks performs 2x+ average, boost it
- Review Campaign 1 creative. If studio clips outperform static posts, shift spend.

**Ingest:** Studio performance raw footage (all angles)

---

### Week 3: April 28 - May 4

**Film:**
- [ ] **Buchla 200e session** -- Dot's studio. Building a patch from init. Close-ups of 261e oscillator, 296e spectral processor. Hook: rare gear, satisfying sound design.
- [ ] **Machine vs Human session** -- Anthony on hardware + modular with arpeggiated loops, Dot plays piano live over it. Man and machine side by side.
- [ ] **Buchla carousel stills** -- individual module shots with stories/context

**Post:**
- Mon 28: Studio Performance -- first Reel. The strongest 15-30s moment. Minimal caption.
- Wed 30: Studio Performance -- BTS carousel. Setup, lighting, the rig from above.
- Fri 2: Studio Performance -- different Reel clip, different energy.
- Sat 3: Buchla teaser in Stories -- 15s clip, no context, just the sound
- Stories: ticket link, Buchla teasers

**Ads:**
- [ ] Launch Campaign 2 (Ticket Conversion): £25/week. Target Campaign 1 video viewers (25%+) + IG engagers (60 days).
- Load studio performance footage as Campaign 1 creative (should outperform static)
- A/B test: studio Reel vs Buchla clip vs organic carousel in Campaign 1
- Campaign 4: boost best studio performance Reel if it outperforms 2x

---

### Week 4: May 5-11

**Film:**
- [ ] **Sound design breakdown** -- OB-6 patch behind live sets, or track from All for You EP. Screen capture + overhead + close-up of hands.

**Post:**
- Mon 5: Buchla Session Reel -- "Building a patch on the Buchla 200e". Tag @buchlausa.
- Wed 7: Buchla carousel -- 4-5 slides walking through the modules.
- Fri 9: Machine vs Human Reel -- the scroll-stopper. Anthony on modular, Dot on piano.
- Sat 10: Studio Performance third cut or Records That Shaped Them
- Stories: Vespers countdown appears ("5 weeks"), ticket link

**WhatsApp:**
- [ ] **Wave 2: Extended Network** -- industry contacts, music friends, DJs, producers, label people. Professional but warm. 20-30 tickets target.

**Ads:**
- Campaign 1: still running, refresh creative with Buchla/Machine vs Human clips
- Campaign 2: review first week data. Check CPC (target < £0.25) and LPV rate (target > 60%)
- If Machine vs Human Reel pops organically: boost immediately via Campaign 4

---

### Week 5: May 12-18 -- PHASE 2 (Convert)

**Film:**
- [ ] **Visions ft Sarah Nimmo content** -- single drops May 14 on fabric Records. Listening session, atmospheric Reel.

**Post:**
- Wed 14: Visions announcement -- artwork + title + date + fabric + Sarah Nimmo tagged
- Thu 15: Visions Stories -- streaming links
- Sat 17: Sound design breakdown or Visions behind-the-track carousel
- Sun 18: Vespers-specific content -- venue, lineup, "what we're planning"
- Stories: Visions links + Vespers ticket link

**Ads:**
- [ ] Launch Campaign 3 (Retargeting): £20/week. Target RA clickers who didn't convert + 3x engagers.
- Campaign 1: final week. Load strongest creative, push to build last batch of warm audience before shutting down.
- Campaign 2: increase pacing to £30/week. Warm pool is now at peak size.
- Visions announcement: if Sarah Nimmo shares/tags, her audience enters the funnel

---

### Week 6: May 19-25 -- ATHENS CONTENT BOMB

**Film:**
- [ ] **Athens/Daphni/Caribou show** -- Film EVERYTHING. Crowd, booth POV, venue with Acropolis visible, NM on stage, audience reactions, atmosphere. Sony FX3 + DJI Osmo Pocket 3 for multiple angles.

**Post:**
- Pre-Athens: travel content, excitement, Stories
- Post-Athens: best crowd moment Reel or carousel
- Sat 24: "Back in London June 12" -- Vespers push off the Athens momentum
- Stories: Athens content + Vespers ticket link

**Ads:**
- [ ] **CRITICAL:** Load Athens/Caribou content into Campaign 2 creative IMMEDIATELY. This is the highest-value content of the campaign.
- If Athens Reel outperforms 2x average: throw £20-30 at it same day via Campaign 4
- Campaign 1 has ended. The warm pool from 5 weeks of engagement feeds Campaign 2+3 from here.
- Campaign 3: increase pacing to £25/week. Retarget with Athens content.

**This is the inflection point. Athens content + Caribou association + Acropolis visual = the biggest potential reach moment. Everything from here feeds the final push.**

---

### Week 7: May 26 - June 1

**Post:**
- Mon 26: Athens content -- best crowd reaction or venue atmosphere Reel
- Wed 28: Vespers lineup spotlight or collaborator-tagged content
- Fri 30: Studio Performance reshare or new cut. "This is what we're bringing to Vespers."
- Stories: ticket link, collaborator shares, Athens content

**Ads:**
- Campaign 2: £60/week. Heaviest conversion push begins.
- Campaign 3: £30/week. Fresh creative using Athens footage.
- Check ticket velocity. Adjust messaging:
  - Below 150 sold: increase spend, test urgency ("Under 100 left")
  - Above 150 sold: FOMO/social proof messaging

---

### Week 8: June 2-8 -- FINAL PUSH

**Post:**
- Mon 2: "10 days" content
- Wed 4: Best-performing content reshared or new edit
- Fri 6: Lineup feature or "what to expect" carousel
- Stories: countdown, ticket link, venue teasers

**WhatsApp:**
- [ ] **Wave 3: Final Push** -- anyone from Wave 1+2 who didn't respond + wider London contacts. "Show's filling up" only if genuinely true.

**Ads:**
- Campaign 2: £70/week. Maximum daily spend.
- Campaign 3: £35/week. Maximum frequency. Refresh creative if frequency > 2.5.
- If budget allows: 24-48hr burst targeting London nightlife interests broadly

---

### Show Week: June 9-12

**Post:**
- Mon 9: "This Friday" -- clean, confident, final
- Tue 10: Stories -- prep, what's going in the bag
- Wed 11: "Tomorrow" teaser
- Thu 12 (show day): Stories throughout -- setup, soundcheck, doors, crowd, performance

**Ads:**
- Campaign 2: final £50. Last push.
- Campaign 3: final £15. Kill by Thursday night.
- Show-day: boost story content for local reach (Friday organic dip offset)

---

### Post-Show: June 13+

**Post:**
- Fri 13: Best moment from the night -- Reel or grid post
- Sat 14: Tracklist / Track IDs carousel from the Vespers set
- Week after: BTS carousel, crowd moments
- Ongoing: reshare blog features, playlist adds, DJ support

**Ads:**
- Campaign 4 (Follower Growth) continues at £1-2/day through August
- Creative: best Vespers footage + studio performance clips
- This is the long-tail follower builder

---

## PROJECTIONS

### Ticket Sales

| Source | Conservative | Optimistic |
|--------|-------------|-----------|
| Current tickets | 26 | 26 |
| WhatsApp personal outreach | 80 | 150 |
| Campaign 2 (warm conversion) | 38 | 84 |
| Campaign 3 (retargeting) | 12 | 54 |
| fabric Records cross-promo | 10 | 30 |
| Organic / word-of-mouth | 15 | 40 |
| Percolate's own promo | 20 | 50 |
| **Total** | **201** | **434** |

**Note:** WhatsApp projection based on NM selling out NDR 2 (~150-200 capacity) on personal messages alone. This is proven, not speculative.

### Follower Growth

| Source | Conservative | Optimistic |
|--------|-------------|-----------|
| Starting followers | 1,326 | 1,326 |
| Paid (Campaign 4) | 200 | 400 |
| Organic content growth | 800 | 2,500 |
| Athens/Caribou spike | 200 | 1,000 |
| fabric Records audience | 100 | 400 |
| **Total** | **2,626** | **5,626** |

### Sellout scenario:
Conservative now hits 80% capacity. Optimistic oversells. **Sellout is the realistic outcome.**

Requires:
- WhatsApp waves executing on schedule (proven channel)
- Content plan executing (filming done by week 4)
- Athens/Caribou content landing
- fabric Records including Vespers dates in single promo
- Percolate doing their part (mailers, RA featuring, social)

### Conservative scenario (201 tickets, ~80% capacity):
- Strong enough to prove NM's pull to Percolate
- Keeps the festival pipeline open
- Shows a professional, data-driven operation they'll want to work with again
- Combined with Percolate's own promo effort, sellout is within reach even at conservative end

---

## NDR RECORD PICKS -- EXECUTION BRIEF

**Concept:** 5 records from Next Door Records that NM loves and plans to play at Vespers.

**Why this works:**
- Cross-promotes a lineup act (NDR reshares = borrowed reach)
- Positions NM as a selector (scene credibility)
- Builds specific Vespers anticipation
- Carousel format = highest engagement format (63% of views)
- Save-magnet content

**What to film:**
- Each record pulled from shelf, overhead shot on deck or flat surface
- Close-up of label + artwork
- Optional: 5-10s audio clip of each record (for Reel version)
- Same visual language as Records That Shaped Them

**Carousel structure (6 slides):**
1. Cover: "5 Next Door Records picks for Vespers"
2-6. One record per slide: artwork + title + one sentence on why

**Caption:** Minimal. "Records we're bringing to Vespers on June 12. All from @[NDR handle]'s world."
**First comment:** tag NDR + relevant hashtags
**Post timing:** Week 2 (April 21)

---

## CONTENT INVENTORY

### Filming sessions (priority order):
- [ ] NDR record picks (film: week 1)
- [ ] Studio Performance -- full Hybrid Live shoot (film: week 2)
- [ ] Buchla 200e session (film: week 3)
- [ ] Machine vs Human -- Anthony modular, Dot piano (film: week 3)
- [ ] Sound design breakdown (film: week 4)
- [ ] Athens/Caribou show (film: week 6)
- [ ] Vespers show night (film: show day)

### Releases feeding the campaign:
- [ ] All for You EP -- fabric Records, April 17
- [ ] Visions ft Sarah Nimmo -- fabric Records, May 14

### Repurposing map:

| Source | Posts |
|--------|-------|
| Studio Performance (1 shoot) | Full cut, 3x Reels, BTS carousel, story series, booth POV = **8** |
| Buchla session (1 shoot) | Hook Reel, module carousel, sound design Reel, stories = **5** |
| Machine vs Human (1 shoot) | Main Reel, BTS, story series = **3** |
| NDR Record Picks (1 shoot) | Carousel, Reel with audio, 5x story shares = **7** |
| Athens/Caribou (1 show) | Crowd Reel, booth POV, venue atmosphere, tracklist = **5** |
| Each fabric release | Announcement, stories, behind-the-track, DJ clip = **5 each** |

**Total from 6 filming sessions + 2 releases: ~43 posts across 8 weeks**

---

## DECISION CHECKPOINTS

| Date | Check | Action if behind |
|------|-------|-----------------|
| Apr 18 | All for You EP posted? Campaign 1 live? | If not: everything else is delayed. Priority 1. |
| Apr 25 | Studio performance filmed? WhatsApp Wave 1 sent? | Reschedule shoot for Apr 28 latest. Send Wave 1 immediately. |
| May 4 | 60+ tickets? Campaign 1 pool > 3,000? | If not: increase Campaign 1 spend, accelerate Campaign 2 launch. |
| May 11 | 90+ tickets? WhatsApp Wave 2 sent? | If not: send Wave 2 now, increase Campaign 2 pacing. |
| May 18 | 120+ tickets? Retargeting live? | If not: launch Campaign 3 early, consider budget increase. |
| May 25 | Athens filmed? Content ready? | If not: use best existing content for final push. Lose the wildcard. |
| Jun 1 | 175+ tickets? | If yes: shift to FOMO. If not: max out remaining budget, Wave 3 WhatsApp. |
| Jun 9 | Final count check | Last call content + WhatsApp if needed. |

---

## AD CREATIVE BRIEFS

### Creative A: Studio Performance (Campaign 1 + 2)
- **Hook (0-3s):** OB-6 being switched on, first note rings out over 4 CDJs
- **Body (3-15s):** Full Hybrid Live in motion. Multiple angles. Energy builds.
- **CTA:** None in the video. Caption: "Vespers. June 12. Link in bio."
- **Format:** 9:16 (Stories/Reels)
- **Duration:** 15 seconds
- **Text overlay:** None or minimal ("Vespers / June 12" small in corner)

### Creative B: Buchla/Modular (Campaign 1)
- **Hook (0-3s):** Hands patching cables, first sound emerges
- **Body (3-15s):** Patch building, sound evolving, satisfying payoff
- **CTA:** None. Let the content do the work.
- **Format:** 9:16
- **Duration:** 15 seconds
- **Placement:** Stories + Reels

### Creative C: Athens/Caribou (Campaign 2 -- week 6+)
- **Hook (0-3s):** Crowd shot with Acropolis visible, or NM behind the decks
- **Body (3-15s):** Live energy, crowd reaction, the room
- **CTA:** Caption: "Back in London. Vespers. June 12."
- **Format:** 9:16
- **Duration:** 10-15 seconds
- **Note:** This replaces all other Campaign 2 creative when it drops

### Creative D: Retargeting (Campaign 3)
- **Hook:** Different from Campaign 2. Social proof angle.
- **Body:** Quick cuts of content moments + "250 capacity" text
- **CTA:** GET_TICKETS
- **Format:** 9:16 (Stories only -- full screen, direct)
- **Duration:** 10 seconds
- **Caption:** "Vespers. 250 capacity. June 12."

### Creative Rules (all campaigns)
- All creative uses NM's organic content -- never stock, never templated
- Dark/moody aesthetic matching the organic feed
- If someone lands on the profile from an ad, it should feel seamless
- No "BUY TICKETS" energy -- lead with the art
- Exclude existing followers from Campaigns 1 + 4 (waste of money + weird)
- Kill any ad below 1% CTR after 48 hours
