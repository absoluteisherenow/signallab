/**
 * NM content plan — editable data source for /nm-plan pages.
 *
 * Two worlds sit side by side:
 *   - `oldPlan`  → the existing 40 scheduled_posts snapshot from Supabase (Apr 8 → Jun 12 2026)
 *   - `newPlan`  → the revised week-of and runway concepts from the Apr 8 planning session
 *
 * Individual ideas live in `ideas` and each has its own shareable brief at /nm-plan/ideas/[slug].
 * Edit this file directly — the pages re-render on save.
 *
 * PRODUCTION NOTE (Apr 2026):
 *   Available cameras: Sony FX3, GoPro, iPhone, Sony Handycam HDR-CX115.
 *   Available lighting: Astera Titan Tubes, Zhiyun Molus G200, laser + moving heads.
 *   Camera setup varies per shoot — not every session uses all four.
 *   Apr 10 patch shoot: FX3 on C-frame shooting down, GoPro, iPhone, Handycam. Multi-angle, best picks in post.
 */

export type PlanItem = {
  date: string            // ISO-ish: "2026-04-08"
  time: string            // "17:00 BST"
  platform: string        // Instagram, TikTok, Stories
  format: string          // reel, carousel, post, stories
  title: string
  caption: string
  status: 'keep' | 'move' | 'cut' | 'new' | 'locked' | 'draft'
  ideaSlug?: string       // link to full brief if one exists
  note?: string
}

export type Idea = {
  slug: string
  title: string
  kicker: string          // one-line positioning
  format: string          // reel / carousel / single photo / stories
  length: string          // e.g. "30–45s", "5 slides"
  targetDate?: string     // "Wed 8 Apr 17:00 BST"
  brand5: {               // 5-score framework
    reach: number
    authenticity: number
    culture: number
    visualIdentity: number
    shareableCore: number
  }
  why: string[]           // bullet points — why this works
  shotList?: string[]     // for reels/video
  slides?: string[]       // for carousels
  caption: string
  textOverlay?: string
  tags: string[]          // accounts to tag
  musicBed?: string
  killCriteria?: string   // when to scrap
  riskNotes?: string
  origin: 'today' | 'calendar' | 'lane-idea'
}

/* ────────────────────────────────────────────────────────────
   OLD PLAN — snapshot of scheduled_posts (Apr 8 → Jun 12 2026)
   Pulled from Signal Lab Supabase 2026-04-08.
   ──────────────────────────────────────────────────────────── */
export const oldPlan: PlanItem[] = [
  { date: '2026-04-08', time: '19:00', platform: 'Instagram', format: 'reel', title: 'All For You — Fabric Records drop', caption: 'all for you. fabric records. april 17', status: 'move', note: 'Superseded by the Hybrid Live rebuild reel. Move slot to Sat Apr 11 candid.' },
  { date: '2026-04-09', time: '19:00', platform: 'Instagram', format: 'reel', title: 'Soho House tomorrow night', caption: 'soho house, greek street. tomorrow night.', status: 'keep' },
  { date: '2026-04-13', time: '18:00', platform: 'Instagram', format: 'carousel', title: 'Late Night Selections Vol.1', caption: 'late night selections vol.1 — five tracks that sit alongside all for you.', status: 'keep' },
  { date: '2026-04-13', time: '19:00', platform: 'TikTok', format: 'reel', title: 'Studio w/ @mysie', caption: 'in the studio with @mysie. something new taking shape', status: 'keep' },
  { date: '2026-04-14', time: '19:00', platform: 'Instagram', format: 'reel', title: 'Greek Street 300 people', caption: 'greek street, friday. 300 people hearing these for the first time.', status: 'keep' },
  { date: '2026-04-16', time: '19:00', platform: 'Instagram', format: 'reel', title: 'Final pre-release teaser', caption: 'tomorrow.', status: 'keep' },
  { date: '2026-04-17', time: '08:00', platform: 'Instagram', format: 'carousel', title: 'All For You is out', caption: 'all for you is out. fabric records. link in bio.', status: 'keep' },
  { date: '2026-04-17', time: '11:00', platform: 'Instagram', format: 'carousel', title: '@absoluteishere personal — EP', caption: 'Anthony solo post on EP release', status: 'keep' },
  { date: '2026-04-17', time: '14:00', platform: 'Instagram', format: 'carousel', title: '@dotmajor personal — EP', caption: 'Dot solo post on EP release', status: 'keep' },
  { date: '2026-04-18', time: '11:00', platform: 'Instagram', format: 'carousel', title: 'Record Store Day picks', caption: 'record store day picks. five records that sit alongside all for you.', status: 'keep' },
  { date: '2026-04-21', time: '19:00', platform: 'Instagram', format: 'reel', title: 'World-building mood', caption: 'Atmospheric mood content. No EP mention.', status: 'keep' },
  { date: '2026-04-23', time: '18:00', platform: 'Instagram', format: 'carousel', title: 'Behind All For You', caption: 'Studio photos, process, the people who made it happen.', status: 'keep' },
  { date: '2026-04-28', time: '19:00', platform: 'Instagram', format: 'reel', title: 'NM visual world', caption: 'Night city, mood, atmosphere. No promo.', status: 'keep' },
  { date: '2026-04-30', time: '18:00', platform: 'Instagram', format: 'carousel', title: 'Late Night Selections Vol.2', caption: 'five tracks we have been living in this month.', status: 'keep' },
  { date: '2026-05-05', time: '19:00', platform: 'Instagram', format: 'reel', title: 'The Life or The Scene', caption: 'Behind the scenes, studio, supporting another artist.', status: 'keep' },
  { date: '2026-05-07', time: '19:00', platform: 'Instagram', format: 'reel', title: 'Visions soft tease', caption: 'may', status: 'keep' },
  { date: '2026-05-12', time: '19:00', platform: 'Instagram', format: 'reel', title: 'Visions teaser ft Sarah Nimmo', caption: '30s vocal moment. Original audio label was wrong — needs fixing.', status: 'keep', note: 'Fix audio label: NIGHT manoeuvres ft Sarah Nimmo not a remix.' },
  { date: '2026-05-14', time: '08:00', platform: 'Instagram', format: 'reel', title: 'Visions release day', caption: 'visions. ft @sarahnimmo. out now. fabric records.', status: 'keep' },
  { date: '2026-05-14', time: '11:00', platform: 'Instagram', format: 'post', title: '@absoluteishere personal — Visions', caption: "Anthony solo post on working with Sarah Nimmo", status: 'keep' },
  { date: '2026-05-14', time: '14:00', platform: 'Instagram', format: 'post', title: '@dotmajor personal — Visions', caption: "Dot solo post on Visions production", status: 'keep' },
  { date: '2026-05-14', time: '17:00', platform: 'Instagram', format: 'post', title: 'Athens tonight — Caribou support', caption: 'athens tonight. supporting caribou at avissinias square.', status: 'keep' },
  { date: '2026-05-15', time: '12:00', platform: 'Instagram', format: 'carousel', title: '@absoluteishere Athens candid', caption: 'Melbourne-park-pattern — candid duo carousel.', status: 'keep' },
  { date: '2026-05-15', time: '17:00', platform: 'Instagram', format: 'carousel', title: '@dotmajor Athens candid', caption: 'Different photos to Anthony.', status: 'keep' },
  { date: '2026-05-16', time: '11:00', platform: 'Instagram', format: 'reel', title: 'Athens/Caribou post-show reel', caption: 'Crowd energy, booth moment, city at night.', status: 'keep' },
  { date: '2026-05-19', time: '18:00', platform: 'Instagram', format: 'carousel', title: 'Last week recap', caption: 'visions out on fabric. caribou in athens. 800 people in a square under the sky.', status: 'keep' },
  { date: '2026-05-21', time: '19:00', platform: 'Instagram', format: 'reel', title: 'Athens/Caribou reel B', caption: 'Second cut from Athens footage.', status: 'cut', note: 'Duplicate of May 16 reel. Merge or cut — one Athens reel is enough.' },
  { date: '2026-05-24', time: '18:00', platform: 'Instagram', format: 'reel', title: 'Vespers mood reel', caption: 'Dusk footage, transitional light, NM music underneath.', status: 'keep' },
  { date: '2026-05-26', time: '18:00', platform: 'Instagram', format: 'carousel', title: 'Late Night Selections Vol.3', caption: 'five tracks for may.', status: 'keep' },
  { date: '2026-05-28', time: '19:00', platform: 'Instagram', format: 'reel', title: 'Collab w/ @justlilmusic', caption: 'Vespers lineup feature — collab post.', status: 'keep' },
  { date: '2026-05-31', time: '18:00', platform: 'Instagram', format: 'reel', title: 'Collab w/ @mialily', caption: 'Vespers lineup feature — collab post.', status: 'keep' },
  { date: '2026-06-02', time: '18:00', platform: 'Instagram', format: 'carousel', title: 'Vespers lineup carousel', caption: 'Atmospheric photos of each artist, not a generic flyer.', status: 'keep' },
  { date: '2026-06-04', time: '19:00', platform: 'Instagram', format: 'reel', title: 'Vespers — one week', caption: 'one week. Vespers visual world with NM music underneath.', status: 'keep' },
  { date: '2026-06-04', time: '20:00', platform: 'Instagram', format: 'post', title: '@absoluteishere — one week', caption: 'Personal energy, what this show means.', status: 'keep' },
  { date: '2026-06-04', time: '21:00', platform: 'Instagram', format: 'post', title: '@dotmajor — one week', caption: 'His take, the rehearsals, the anticipation.', status: 'keep' },
  { date: '2026-06-07', time: '18:00', platform: 'Instagram', format: 'reel', title: 'Something beautiful', caption: 'Remind people why they follow you. No Vespers mention.', status: 'keep' },
  { date: '2026-06-09', time: '18:00', platform: 'Instagram', format: 'carousel', title: 'The night — lineup', caption: 'Who is playing, the space, the sound. Ticket link in caption.', status: 'keep' },
  { date: '2026-06-11', time: '19:00', platform: 'Instagram', format: 'reel', title: 'Visions remix', caption: 'a different take.', status: 'keep', note: 'Audio label: Visions (Remix) — confirm remixer credit.' },
  { date: '2026-06-12', time: '14:00', platform: 'Instagram', format: 'post', title: '@absoluteishere — Vespers day', caption: 'Getting ready, soundcheck, the venue.', status: 'keep' },
  { date: '2026-06-12', time: '15:00', platform: 'Instagram', format: 'post', title: '@dotmajor — Vespers day', caption: 'His angle — the gear, the setup.', status: 'keep' },
  { date: '2026-06-12', time: '17:00', platform: 'Instagram', format: 'reel', title: 'Vespers — tonight', caption: 'tonight. vespers. @peraborgs @justlilmusic @mialily @ndrdjs', status: 'keep' },
]

/* ────────────────────────────────────────────────────────────
   NEW PLAN — locked concepts from Apr 8 planning session +
   10 additional lane ideas in NM's world. Week-of first,
   then the longer runway the team can slot in.
   ──────────────────────────────────────────────────────────── */
export const newPlan: PlanItem[] = [
  { date: '2026-04-08', time: '17:30', platform: 'Instagram', format: 'carousel', title: '25 degrees + Hybrid Live rebuild — sunny candid + studio', caption: "25 degrees and sunny in London. We're inside rebuilding the Hybrid Live show. Upgrading the OB, trying out the Erica Synths Hex drum machine. Soho House on Friday. Athens with Caribou in May. Vespers with Percolate in June. Big months ahead. 🫂 Links in bio.", status: 'locked', ideaSlug: 'apr8-sunny-carousel', note: 'Mix of fresh bright candid shots + DSCF0655/0654 from Dropbox archive. Post 17:00-18:00 BST.' },
  { date: '2026-04-09', time: '19:00', platform: 'Instagram', format: 'reel', title: 'Soho House tomorrow night', caption: 'soho house, greek street. tomorrow night.', status: 'keep', note: 'Existing scheduled reel. Low effort, on-brand.' },
  { date: '2026-04-10', time: 'stories only', platform: 'Stories', format: 'stories', title: 'Soho House gig day', caption: 'Stories throughout the day + at the gig. No grid post. Capture footage for post-show reflection.', status: 'locked' },
  { date: '2026-04-11', time: '18:00', platform: 'Instagram', format: 'post', title: 'Candid duo moment from the studio week', caption: "Day three at Dot's. 🫂 (caption follows the photo, written on the day)", status: 'locked', ideaSlug: 'candid-duo-saturday', note: 'Replaces the moved Apr 8 19:00 slot.' },
  { date: '2026-04-12', time: '—', platform: '—', format: '—', title: 'Rest day', caption: 'Nothing scheduled. Recovery after the gig.', status: 'locked' },

  // Runway — lane ideas that can slot into the calendar
  { date: 'flexible', time: 'any', platform: 'Instagram', format: 'reel', title: 'The patch walkthrough — OB-6 in 40s', caption: 'see idea brief', status: 'new', ideaSlug: 'ob6-patch-walkthrough' },
  { date: 'flexible', time: 'any', platform: 'Instagram', format: 'carousel', title: 'The vinyl dig — Caribou / Daphni / Four Tet', caption: 'see idea brief', status: 'new', ideaSlug: 'vinyl-dig-carousel' },
  { date: 'flexible', time: 'any', platform: 'Instagram', format: 'reel', title: 'Water + sand texture loop', caption: 'see idea brief', status: 'new', ideaSlug: 'water-sand-texture-loop' },
  { date: 'flexible', time: 'any', platform: 'Instagram', format: 'carousel', title: 'What we listened to this week', caption: 'see idea brief', status: 'new', ideaSlug: 'what-we-listened-to' },
  { date: 'flexible', time: 'any', platform: 'Instagram', format: 'carousel', title: 'Late night DM dump (with permission)', caption: 'see idea brief', status: 'new', ideaSlug: 'late-night-dms' },
  { date: 'flexible', time: 'day-of-show', platform: 'Instagram', format: 'reel', title: 'The venue walk-in POV', caption: 'see idea brief', status: 'new', ideaSlug: 'venue-walk-in' },
  { date: 'flexible', time: 'late', platform: 'Instagram', format: 'post', title: '4am session end card', caption: 'see idea brief', status: 'new', ideaSlug: '4am-end-card' },
  { date: 'flexible', time: 'any', platform: 'Instagram', format: 'carousel', title: 'Hybrid Live rig reveal carousel', caption: 'see idea brief', status: 'new', ideaSlug: 'rig-reveal-carousel' },
  { date: 'flexible', time: 'any', platform: 'Instagram', format: 'reel', title: 'Records we wish we made', caption: 'see idea brief', status: 'new', ideaSlug: 'records-we-wish' },
  { date: 'flexible', time: 'any', platform: 'Instagram', format: 'reel', title: 'First-listen voice memo', caption: 'see idea brief', status: 'new', ideaSlug: 'first-listen-voice-memo' },
  { date: 'flexible', time: 'any', platform: 'Instagram', format: 'reel', title: 'The cable tidy meditation', caption: 'see idea brief', status: 'new', ideaSlug: 'cable-tidy-meditation' },
]

/* ────────────────────────────────────────────────────────────
   IDEAS — full shareable briefs. One per concept.
   ──────────────────────────────────────────────────────────── */
export const ideas: Idea[] = [
  {
    slug: 'apr8-sunny-carousel',
    title: "Apr 8 LOCKED — 25 degrees sunny candid + Hybrid Live studio carousel",
    kicker: "25 degrees and sunny in London today — rare content unlock. Mix fresh bright outside candids with warm studio shots from the Dropbox archive. Sun hook stops the scroll, studio shots deliver the Vespers signal.",
    format: 'carousel',
    length: '3–4 slides',
    targetDate: 'Wed 8 Apr 2026, 17:00–18:00 BST',
    brand5: { reach: 5, authenticity: 5, culture: 4, visualIdentity: 5, shareableCore: 5 },
    why: [
      "25°C sunny London in April is rare. Sun posts get emotional engagement regardless of subject. That first slide stops every Londoner's scroll.",
      "Caption's opening line ('25 degrees and sunny in London. We're inside rebuilding...') creates narrative tension — everyone knows the feeling of working while the weather is perfect. Emotional hook > gear flex.",
      "Contrast between sunny outside + warm studio delivers visual arc: bright candid → moody craft → payoff (the three shows). Carousel retention improves when each slide resolves a question the previous one raised.",
      "Carousels are NM's proven winning format (62.8% of top posts vs 27.1% for single photos).",
      "Mgmt and Percolate still see today's action with the same Vespers/Athens/Soho signal in the caption. Nothing lost, engagement ceiling raised.",
      "No three-account collab needed today (that's the Melbourne park pattern for a future post) — this runs as a single NM post and still lands.",
    ],
    slides: [
      "Slide 1: Bright outside candid. Duo shot preferred (once Dot arrives at 4pm) OR solo / environmental shot if earlier. Phone camera fine. Natural light, no filter. Aim for warmth and authenticity, not polish.",
      "Slide 2: DSCF0655 (STILLS ADE) — golden keyboard under tungsten backlight. The hero gear shot. Provides the craft payoff.",
      "Slide 3: Either a second candid duo angle from outside OR DSCF0654 (wider keyboard shot).",
      "Slide 4 (optional): Another gear detail from the archive, or skip and make it a 3-slide post.",
    ],
    shotList: [
      "BEFORE 4PM: Anthony can solo-shoot a quick sunny candid — view from window with coffee, walking down the street, hand catching sun, anything environmental that reads 'London, 25 degrees'. Phone is enough.",
      "AFTER 4PM: When Dot arrives, step outside for 5 minutes. 3-4 natural phone shots of the two of you in the sun. Don't pose. Conversation, walking, laughing, sitting.",
      "Pick the best 1-2 candid shots by 5pm.",
      "Build the carousel in Instagram draft: candid → DSCF0655 → candid or DSCF0654.",
      "Post window: 17:00–18:00 BST. Don't wait past 18:30 or the sunny-day energy dies.",
    ],
    caption: "25 degrees and sunny in London. We're inside rebuilding the Hybrid Live show. Upgrading the OB, trying out the Erica Synths Hex drum machine. Soho House on Friday. Athens with Caribou in May. Vespers with Percolate in June. Big months ahead. 🫂 Links in bio.",
    tags: ['@dotmajor', '@fabric_london', '@percolate', '@vespersclub', '@sohohouse', '@edenxathens', '@caribaborealisdj'],
    riskNotes: "Candid shots must be warm and natural — not staged, not posed. If Dot's arrival slips past 4:30 or the candid shoot doesn't feel right, fall back to DSCF0655 solo + DSCF0654 as a 2-slide carousel and post the same caption. The sun hook still works in the caption even without an outside shot.",
    killCriteria: "If no candid is posted by 18:30, post DSCF0655 as a single image with the same caption. Do not let this slip past 19:00.",
    origin: 'today',
  },
  {
    slug: 'hybrid-live-rebuild',
    title: 'Hybrid Live rebuild — three shows ahead',
    kicker: 'One unified post that frames Soho, Athens and Vespers as a run NM is preparing for. Not a third Vespers ask.',
    format: 'reel',
    length: '30–45s',
    targetDate: 'Wed 8 Apr 2026, 17:00–18:30 BST',
    brand5: { reach: 4, authenticity: 5, culture: 5, visualIdentity: 5, shareableCore: 4 },
    why: [
      "Two Vespers posts went up this week already. A third direct Vespers ask reads as fatigue.",
      "Naming Soho House, Athens with Caribou and Vespers with Percolate in one breath positions NM as an artist with momentum, not an artist begging for one show.",
      "Percolate see Vespers mentioned alongside Caribou and Soho House — elevation by association.",
      "The studio rebuild frame is honest. NM are genuinely at Dot's all week rebuilding the Hybrid Live rig.",
    ],
    shotList: [
      "Close up on a hand at the Oberheim OB-6 mid-adjustment. Warm tungsten. Shallow depth.",
      "Wider of Dot or both in silhouette against the monitor glow.",
      "Detail shot: the Ableton Move or the mixer level meters.",
      "Brief glimpse of the Vespers flyer or RA listing on a laptop on the desk.",
      "Movement beat: fader, knob turn, pad hit, cable plug.",
      "Close on a static wide of the rig.",
    ],
    caption: "Three days at Dot's rebuilding the Hybrid Live show, upgrading the OB and trying out the Erica Synths Hex drum machine. Soho House on Friday might be first outing. Athens with Caribou in May. Vespers with Percolate in June. Big months ahead. 🫂 Links in bio.",
    textOverlay: "Rebuilding the Hybrid Live. Soho Fri. Athens May. Vespers June.",
    tags: ['@vespersclub', '@peraborgs', '@justlilmusic', '@mialily', '@ndrdjs', '@sohohouse', '@edenxathens', '@caribaborealisdj', '@dotmajor'],
    musicBed: "Original audio from what you are actually playing (a fragment, not a full track).",
    origin: 'today',
  },
  {
    slug: 'candid-duo-saturday',
    title: 'Candid duo moment — Saturday',
    kicker: 'Single photo or short reel from the studio week. Not promo. Not gear. A real human moment.',
    format: 'single photo or 10–15s reel',
    length: '1 image or <15s',
    targetDate: 'Sat 11 Apr 2026, 18:00 BST',
    brand5: { reach: 5, authenticity: 5, culture: 3, visualIdentity: 4, shareableCore: 5 },
    why: [
      "NM's Melbourne park candid carousel got 9.3K views against 2.2K for studio content. 4 to 5x lift from candid personal content.",
      "Saturday is a no-promo day per audience behaviour. Candid is the correct format.",
      "The week's posting rhythm becomes: Reel (Wed craft) → Reel (Thu tease) → nothing (Fri gig) → Photo (Sat candid). Clean format rotation.",
      "Replaces the previously scheduled 'all for you. fabric records. april 17.' reel which would have been the third gear-and-studio reel in a week.",
    ],
    shotList: [
      "Photo option: both of you mid-session, laughing, eating, in the kitchen.",
      "Reel option: 10–15s of one moment from the three days at Dot's.",
      "Carousel option: 3–4 candid photos across the week.",
    ],
    caption: "Day three at Dot's. 🫂",
    tags: ['@dotmajor'],
    origin: 'today',
  },
  {
    slug: 'ob6-patch-walkthrough',
    title: 'OB-6 patch walkthrough',
    kicker: 'Forty seconds dialling a sound from scratch on the OB-6. Craft, not flex.',
    format: 'reel',
    length: '40s',
    brand5: { reach: 3, authenticity: 5, culture: 4, visualIdentity: 5, shareableCore: 4 },
    why: [
      "Floating Points' entire brand is built on this format. Synth heads save and share.",
      "Builds the Hybrid Live visual signature (OB-6 under warm lamp) without naming the shows.",
      "Works on every platform. Silent-scroll readable with text overlay, sound-on rewarded.",
      "Zero dependency on a gig or release. Can shoot in 15 minutes.",
    ],
    shotList: [
      "Static close-up on the OB-6 front panel, warm tungsten from the side.",
      "Start with a dry init patch, one oscillator.",
      "Move through filter, envelope, LFO in real time. Voice-free.",
      "End on the finished patch playing a short phrase.",
    ],
    caption: "forty seconds to a sound we'd use. OB-6, init patch, one osc, work outwards. 🫂",
    textOverlay: "init → filter → env → lfo → done",
    tags: ['@oberheimofficial', '@dotmajor'],
    musicBed: "The patch itself, recorded live.",
    origin: 'lane-idea',
  },
  {
    slug: 'dmno-first-patch',
    title: 'First patch — Udo DMNO',
    kicker: 'New synth, straight out the box. Forty seconds from init to a sound we\'d use.',
    format: 'reel',
    length: '40s',
    brand5: { reach: 4, authenticity: 5, culture: 5, visualIdentity: 5, shareableCore: 4 },
    why: [
      "New gear arrival is a natural hook — the scroll-stop is 'what is that synth?' without any unboxing cringe.",
      "Udo is underground-credible. Scene artists know it, casual followers don't — curiosity gap drives shares.",
      "Same format as the OB-6 walkthrough but with a fresh-out-the-box angle. Builds the 'first patch' series.",
      "Zero dependency on a gig or release. Can shoot in 15 minutes. Repeatable format for every new piece of gear.",
    ],
    shotList: [
      "Open on the DMNO on the desk, powered off, warm tungsten from the side. 1-2 seconds max — this is the hook.",
      "Power on. Init patch. Hands on the panel.",
      "Build a sound in real time — filter, envelopes, modulation. No voice, no explanation. Just hands and sound.",
      "End on the finished patch playing a short phrase. Hold for 2-3 seconds.",
    ],
    caption: "udo dmno. first patch, straight out the box. 🫂",
    textOverlay: "new synth. first patch. init → done",
    tags: ['@udoaudio', '@dotmajor'],
    musicBed: "The patch itself, recorded live.",
    riskNotes: "If the first patch doesn't sound good enough in 40 seconds, don't force it. Reshoot or shelve. The sound has to be genuinely usable — not a demo patch, not a preset-sounding pad. If it takes more than 2-3 takes, park it and come back fresh.",
    killCriteria: "If after 3 takes no patch sounds like something you'd actually drop into a session, kill it. Don't publish a mediocre sound just because the synth is new.",
    origin: 'lane-idea',
  },
  {
    slug: 'piano-synth-duo',
    title: 'Grand piano + synth — the two of us',
    kicker: 'Dot on grand piano, you on synth, side by side. No talking, no edit. Just playing.',
    format: 'reel',
    length: '30-60s',
    brand5: { reach: 5, authenticity: 5, culture: 5, visualIdentity: 5, shareableCore: 5 },
    why: [
      "Two instruments, two people, one take. This is the purest expression of what NIGHT manoeuvres actually is.",
      "Grand piano + synth in the same frame is visually arresting. Acoustic meets electronic — the tension is the hook.",
      "Duo content massively outperforms solo content for NM. The relationship is the brand.",
      "Zero production needed. One wide shot, natural sound, real moment. Raw and human always wins.",
      "Shareable core is off the charts. People screenshot and DM this kind of moment.",
    ],
    shotList: [
      "One wide static shot. Grand piano on one side, synth rig on the other. Both visible, both playing.",
      "Warm natural light or tungsten. No overhead fluorescents.",
      "Start mid-phrase — don't show the setup, drop the viewer straight into the music.",
      "Hold the shot. No cuts, no zooms, no pans. Let the playing do the work.",
      "End naturally. Stop when it feels done, not when a timer runs out.",
    ],
    caption: "piano and synth. no click, no plan, just playing. 🫂",
    textOverlay: "grand piano + synth. one take.",
    tags: ['@dotmajor'],
    musicBed: "The live performance itself.",
    riskNotes: "This only works if the playing is genuinely good and the moment is real. If it feels rehearsed or forced, it'll read as content not music. Don't stage it — wait for it to happen naturally during a session and capture it.",
    killCriteria: "If the audio quality is poor (room echo, clipping, phone mic) or the performance doesn't have a moment worth watching twice, don't post. This format demands quality.",
    origin: 'lane-idea',
  },
  {
    slug: 'buchla-generative-loop',
    title: 'Buchla 200e — generative patch, no humans',
    kicker: 'The Buchla patched and left running. No hands, no faces. Just the machine breathing.',
    format: 'reel',
    length: '30-45s loop',
    brand5: { reach: 4, authenticity: 5, culture: 5, visualIdentity: 5, shareableCore: 5 },
    why: [
      "A Buchla 200e running itself is rare content. Most people will never see one in person, let alone hear one generatively patched.",
      "No humans in frame makes it abstract and atmospheric. Fits the NIGHT vision lane perfectly.",
      "Synth community saves and shares Buchla content obsessively. High save rate potential.",
      "Loopable format — Instagram rewards watch time, and a generative patch that evolves keeps people watching.",
      "Zero effort to reshoot. Patch it, press record, walk away.",
    ],
    shotList: [
      "Static close-up on the Buchla panel. Warm tungsten from the side, shallow depth of field if possible.",
      "Patch cables visible, LEDs blinking. The system is alive.",
      "No hands enter frame. No faces. The machine is the performer.",
      "Let it run for 2-3 minutes, pick the best 30-45 second window where the patch evolves interestingly.",
      "Cut should feel like a loop — the end should feel like it could be the beginning.",
    ],
    caption: "buchla 200e. patched it, left it running. 🫂",
    textOverlay: "generative. no hands. just the machine.",
    tags: ['@buchlaofficial', '@dotmajor'],
    musicBed: "The generative patch itself. No added processing.",
    riskNotes: "The patch has to be genuinely interesting — not just random bleeps. It needs a sense of movement, evolution, musicality. If it sounds like a demo or a test, it's not ready.",
    killCriteria: "If after 10 minutes of recording there's no 30-second window that feels musical and alive, shelve it. Come back with a different patch.",
    origin: 'lane-idea',
  },
  {
    slug: 'modular-vs-piano',
    title: 'Modular vs grand piano',
    kicker: 'Dot patching the Eurorack while a piano phrase loops underneath. Two worlds, one room.',
    format: 'reel',
    length: '40-60s',
    brand5: { reach: 5, authenticity: 5, culture: 5, visualIdentity: 5, shareableCore: 5 },
    why: [
      "Grand piano + modular synth in the same frame is visually and sonically stunning. Two completely different instruments creating one thing.",
      "Shows the London Grammar / NIGHT manoeuvres crossover without ever naming it. People who know, know.",
      "This is the kind of content that gets quote-tweeted and shared in music production communities.",
      "The contrast between acoustic warmth and electronic texture is the entire NM sonic identity in one shot.",
      "Variation on the piano + synth duo brief but with modular — feels more experimental, more NIGHT vision.",
    ],
    shotList: [
      "Wide shot: grand piano on one side, Eurorack megarack on the other. Both visible.",
      "Dot plays a piano phrase. It loops or sustains.",
      "Hands move to the modular. Patching, tweaking, building a texture around the piano.",
      "Camera holds. One shot, no cuts. The two sounds merge.",
      "End when the two instruments feel like one piece of music.",
    ],
    caption: "piano phrase into the modular. seeing where it goes. 🫂",
    textOverlay: "grand piano + eurorack. one room.",
    tags: ['@dotmajor', '@aborealisdj'],
    musicBed: "The live performance itself.",
    riskNotes: "Same as piano + synth duo — must be a real moment, not staged. The modular patch needs to complement the piano, not fight it. If it sounds like two separate things, it's not working.",
    killCriteria: "If the two instruments don't gel within a few minutes of trying, stop. Don't force a moment that isn't there.",
    origin: 'lane-idea',
  },
  {
    slug: 'drum-machine-shootout',
    title: 'Drum machine shootout — same beat, three machines',
    kicker: 'One beat. Perkons, Analog Rytm, DFAM. Which one hits hardest?',
    format: 'reel',
    length: '30-45s',
    brand5: { reach: 5, authenticity: 4, culture: 5, visualIdentity: 4, shareableCore: 4 },
    why: [
      "Comparison content is algorithm gold. People watch to the end to pick a favourite, comment their choice, share to argue.",
      "Three machines most producers know by name but have never heard side by side. Genuine utility.",
      "Positions NM as people who actually use this gear, not just own it. Craft credibility.",
      "Repeatable series — can do pads, basses, textures. Each one is a new reel.",
      "High comment rate potential. 'Which one?' in the caption is an engagement trigger that's authentic, not bait.",
    ],
    shotList: [
      "Split into three sections or quick cuts between machines. Same angle, same framing for each.",
      "Close-up on each drum machine, hands programming or triggering the same pattern.",
      "Text overlay labels each machine clearly.",
      "Let each run for 8-12 seconds. Enough to hear the character.",
      "End on a freeze frame or 'which one?' text.",
    ],
    caption: "same beat. three machines. which one? 🫂",
    textOverlay: "perkons vs analog rytm vs DFAM",
    tags: ['@aborealisdj', '@elektron', '@maborealisdj', '@dotmajor'],
    musicBed: "The three drum patterns, recorded clean.",
    riskNotes: "The beat must be identical across all three — same kick pattern, same tempo. If the programming is different, the comparison is meaningless. Keep it simple: a straight four-to-the-floor kick or a basic UKG pattern works best.",
    killCriteria: "If the three machines sound too similar to tell apart in a phone speaker, the comparison doesn't work. Pick machines with more contrast.",
    origin: 'lane-idea',
  },
  {
    slug: 'handycam-sessions',
    title: 'Handycam edit — the lo-fi cut',
    kicker: 'Same session, but the entire edit uses only the Handycam angle. DV texture, raw audio, no polish.',
    format: 'reel',
    length: '15-30s',
    brand5: { reach: 4, authenticity: 5, culture: 4, visualIdentity: 5, shareableCore: 4 },
    why: [
      "The lo-fi camcorder aesthetic is trending hard across music content. DV texture reads as authentic and nostalgic.",
      "Every multi-cam session produces a Handycam angle for free. This is bonus content from footage you're already shooting.",
      "Creates a distinct visual lane that's immediately recognisable. The FX3 edit is the polished version, the Handycam edit is the raw one. Two posts from one session.",
      "Imperfection is the point. Autofocus hunting, blown highlights, tape grain. All of it is the aesthetic.",
      "Works as a NIGHT vision series — the lo-fi lens on everything NM does.",
    ],
    shotList: [
      "Pull only the Handycam angle from a multi-cam session. No FX3, no GoPro, no iPhone footage.",
      "Don't stabilise, don't colour grade, don't crop. The raw Handycam output is the look.",
      "Use the Handycam's built-in mic for audio where possible — the lo-fi sound matches the lo-fi image.",
      "Keep clips short. 15-30 seconds max. Fragments, not films.",
      "Works for studio, gigs, soundcheck, travel, venue walk-ins. The camera IS the format.",
    ],
    caption: "handycam. 🫂",
    textOverlay: "sony handycam.",
    tags: ['@dotmajor'],
    musicBed: "Whatever's playing in the room. Natural audio from the Handycam mic adds to the texture.",
    riskNotes: "The lo-fi look only works if the content itself is interesting. A blurry shot of nothing is still nothing. The subject has to carry it — the camera just adds vibe.",
    killCriteria: "If the footage is genuinely unwatchable (too dark, too shaky, no subject) don't post. Lo-fi is not the same as bad.",
    origin: 'lane-idea',
  },
  {
    slug: 'jupiter8-first-patch',
    title: 'First patch — Roland Jupiter-8',
    kicker: 'Forty seconds on a Jupiter-8. Init patch to something you\'d actually use.',
    format: 'reel',
    length: '40s',
    brand5: { reach: 5, authenticity: 5, culture: 5, visualIdentity: 5, shareableCore: 5 },
    why: [
      "A Jupiter-8 is holy grail gear. Most producers will never touch one. Watching someone build a patch on it is rare, valuable content.",
      "Extends the 'first patch' series with arguably the most iconic synth ever made. This is the headline episode.",
      "The Jupiter-8 panel is visually stunning — those orange sliders under warm light. Instant save.",
      "Synth communities, gear forums, and YouTube channels will reshare this. High viral ceiling for the niche.",
    ],
    shotList: [
      "Static close-up on the Jupiter-8 front panel. Warm tungsten light.",
      "Start from an init or simple state. One oscillator.",
      "Build the sound: filter, envelope, chorus, LFO. Hands only, no voice.",
      "End on a chord or phrase that showcases the Jupiter character — that lush, wide, chorus-drenched pad sound.",
    ],
    caption: "jupiter-8. init patch, forty seconds. 🫂",
    textOverlay: "roland jupiter-8. init → done",
    tags: ['@rolandglobal', '@dotmajor'],
    musicBed: "The patch itself, recorded live.",
    killCriteria: "Same as all first patch briefs — if the sound isn't genuinely good in 40 seconds, don't post. The Jupiter-8 sets expectations sky high.",
    origin: 'lane-idea',
  },
  {
    slug: 'memorymoog-first-patch',
    title: 'First patch — Memorymoog',
    kicker: 'Forty seconds on a Memorymoog. The wildest, fattest synth in the room.',
    format: 'reel',
    length: '40s',
    brand5: { reach: 5, authenticity: 5, culture: 5, visualIdentity: 5, shareableCore: 4 },
    why: [
      "A working Memorymoog is unicorn-level gear. Even synth heads rarely see one in action.",
      "The raw, unstable, massive sound is unlike anything else. It sells itself sonically.",
      "Another 'first patch' episode — the series builds. Each synth attracts a slightly different audience but they all cross-pollinate.",
      "The Memorymoog's wood and metal aesthetic under warm studio light is visually arresting.",
    ],
    shotList: [
      "Static close-up on the Memorymoog panel. Wood cheeks, metal panel, warm light.",
      "Init patch or simple starting point.",
      "Build something fat — layer oscillators, open the filter, let it breathe.",
      "End on a sound that shows why this synth is legendary. Unison, detuned, alive.",
    ],
    caption: "memorymoog. forty seconds. 🫂",
    textOverlay: "memorymoog. init → done",
    tags: ['@maborealisdj', '@dotmajor'],
    musicBed: "The patch itself, recorded live.",
    killCriteria: "If the Memorymoog is being temperamental (they often are), don't fight it. Shelve and try another day.",
    origin: 'lane-idea',
  },
  {
    slug: 'vinyl-dig-carousel',
    title: 'The vinyl dig — Caribou / Daphni / Four Tet',
    kicker: 'Five records pulled off Dot\'s shelf. Taste proof, not promo.',
    format: 'carousel',
    length: '5 slides',
    brand5: { reach: 3, authenticity: 5, culture: 5, visualIdentity: 4, shareableCore: 3 },
    why: [
      "Naming Caribou and Daphni in a records post, days before the Athens support announcement lands harder, reads as genuine taste.",
      "Vinyl-close-up imagery is exactly in the NM grain / warm-light visual lane.",
      "Carousels outperform single posts across the lane (4 of 5 peer artists).",
      "No promo ask. Pure world-building.",
    ],
    slides: [
      "Slide 1: one record centred on the deck, needle down, warm light.",
      "Slide 2: second record, different angle, label readable.",
      "Slides 3–4: two more. Mix of artists.",
      "Slide 5: the stack together, shelf context.",
    ],
    caption: "five on the table this week. 🫂",
    tags: ['@caribaborealisdj', '@daphni', '@fourtet', '@dotmajor'],
    origin: 'lane-idea',
  },
  {
    slug: 'water-sand-texture-loop',
    title: 'Water + sand texture loop',
    kicker: 'Slow-mo coastal footage under an unreleased pad sketch. Abstract, world-building, shareable.',
    format: 'reel',
    length: '15–20s loop',
    brand5: { reach: 4, authenticity: 4, culture: 3, visualIdentity: 5, shareableCore: 5 },
    why: [
      "Textural, atmospheric content is highly saveable and highly reshareable to Stories.",
      "Builds mythology around the unreleased music without spoiling it.",
      "Fits the Vespers dusk / transitional-light mood calendar already contains.",
      "Anthony flagged this as an idea the team had kicked around — now it has a home.",
    ],
    shotList: [
      "Slow-mo (120fps) water pulling back across wet sand. Close crop.",
      "Footprint filling with water.",
      "Sun on the horizon if timing allows, otherwise grey sky is fine — grain is the point.",
      "One long static shot is enough. Loop seamlessly.",
    ],
    caption: "something we've been making. 🫂",
    tags: ['@dotmajor'],
    musicBed: "Unreleased pad / texture sketch, 15s fragment only.",
    riskNotes: "Filming logistics: needs a coast trip or someone with existing footage. Low priority if it's going to block other posts — can sit in the bank until a natural trip happens.",
    origin: 'lane-idea',
  },
  {
    slug: 'what-we-listened-to',
    title: 'What we listened to this week',
    kicker: 'Five other-artist tracks, one line each. Taste curation that isn\'t about NM.',
    format: 'carousel',
    length: '5–6 slides',
    brand5: { reach: 3, authenticity: 5, culture: 5, visualIdentity: 4, shareableCore: 4 },
    why: [
      "Existing 'late night selections' slots in the calendar lean on NM-adjacent tracks. This format goes further — lets the feed breathe.",
      "Tagging the artists whose records you post gets reshares from their audiences. Lane evidence: RFF, Four Tet.",
      "Builds trust: 'they listen to good stuff, they make good stuff'.",
    ],
    slides: [
      "Slide 1: artwork of record 1 + one-line take.",
      "Slide 2: artwork of record 2 + one-line take.",
      "Slides 3–5: same pattern.",
      "Slide 6: 'what are we missing?' — invites comments.",
    ],
    caption: "five on rotation this week. what have we missed? 🫂",
    tags: ['artists featured'],
    origin: 'lane-idea',
  },
  {
    slug: 'late-night-dms',
    title: 'Late-night DM dump (with permission)',
    kicker: 'Screenshots of the best messages after a set. Human, vulnerable, lands hard.',
    format: 'carousel',
    length: '3–5 slides',
    brand5: { reach: 4, authenticity: 5, culture: 3, visualIdentity: 3, shareableCore: 5 },
    why: [
      "People-seeing-themselves content is one of the strongest share triggers in the lane.",
      "Positions NM as a duo who reads every message — that reputation becomes the marketing.",
      "Fits the 'we read them all' tone from the milestone-carousel examples in the brand guidelines.",
    ],
    slides: [
      "Slide 1: one dark photo from the gig (booth silhouette, crowd haze).",
      "Slides 2–4: 3 screenshot DMs, names redacted, permission asked.",
      "Slide 5: one-line thank-you.",
    ],
    caption: "these came in after greek street. thank you. we read them all. 🫂",
    tags: [],
    riskNotes: "Must ask each sender for permission before posting. Never include names unless they explicitly say yes.",
    origin: 'lane-idea',
  },
  {
    slug: 'venue-walk-in',
    title: 'The venue walk-in POV',
    kicker: 'Fifteen seconds from the street into the club, day-of-show. No commentary.',
    format: 'reel',
    length: '15s',
    brand5: { reach: 4, authenticity: 5, culture: 4, visualIdentity: 5, shareableCore: 4 },
    why: [
      "Perfect day-of-show anticipation format. Overmono and Bicep both use this.",
      "Takes 2 minutes to film. Zero post-production.",
      "Works as both feed and Stories content.",
      "Triggers 'I'm going' comments, which is the exact engagement we want pre-show.",
    ],
    shotList: [
      "Phone in hand, walking. Start on the street outside.",
      "Through the door, down the stairs or corridor, into the room.",
      "End on the booth or the empty dancefloor before doors.",
      "No cuts. One take.",
    ],
    caption: "tonight.",
    tags: ['venue account'],
    musicBed: "Whatever's coming through the PA during soundcheck, or one NM track fragment.",
    origin: 'lane-idea',
  },
  {
    slug: '4am-end-card',
    title: '4am session end card',
    kicker: 'One wide photo of the studio at 4am, lamp on, gear lit. One sentence caption.',
    format: 'single photo',
    length: '1 image',
    brand5: { reach: 3, authenticity: 5, culture: 3, visualIdentity: 5, shareableCore: 3 },
    why: [
      "Textbook NM signature visual: dim, warm, gear visible, human presence implied.",
      "Short-burst caption format — sits in the second half of the short/long rhythm.",
      "Works as filler between bigger posts without feeling like filler.",
    ],
    caption: "one more pass. 🫂",
    tags: ['@dotmajor'],
    origin: 'lane-idea',
  },
  {
    slug: 'rig-reveal-carousel',
    title: 'Hybrid Live rig reveal carousel',
    kicker: 'Six slides, one gear item per slide. Builds the Hybrid Live signature as a named thing.',
    format: 'carousel',
    length: '6 slides',
    brand5: { reach: 4, authenticity: 5, culture: 4, visualIdentity: 5, shareableCore: 4 },
    why: [
      "Turns Hybrid Live from a phrase in captions into a visual brand.",
      "Each slide tags a gear manufacturer — free reshare from their accounts is common.",
      "Works as the pinned 'what is Hybrid Live' reference post for the profile.",
    ],
    slides: [
      "Slide 1: wide of the full rig, warm key light. 'Hybrid Live' text overlay.",
      "Slide 2: OB-6 close up. 'Oberheim OB-6'.",
      "Slide 3: Ableton Move close up. 'Ableton Move'.",
      "Slide 4: CDJ-3000s in a row. '4x Pioneer CDJ-3000'.",
      "Slide 5: Technics 1210 with needles, lit from the side. 'Technics 1210'.",
      "Slide 6: back to the wide. Caption hook.",
    ],
    caption: "this is what we are bringing. Hybrid Live. 🫂",
    tags: ['@oberheim', '@ableton', '@pioneerdjglobal', '@technics', '@dotmajor'],
    origin: 'lane-idea',
  },
  {
    slug: 'records-we-wish',
    title: 'Records we wish we made',
    kicker: 'Three tracks from your heroes, short voice note each. Credibility without the flex.',
    format: 'reel (carousel of voice notes)',
    length: '45–60s',
    brand5: { reach: 3, authenticity: 5, culture: 5, visualIdentity: 4, shareableCore: 4 },
    why: [
      "Shows lineage without being a name-drop. Fans share this because it's about taste.",
      "Works as a recurring format — 'records we wish we made, vol. 2' etc.",
      "Opens the door to collab / remix asks down the line.",
    ],
    shotList: [
      "Three vinyl sleeves on a table, one at a time.",
      "Voice over each: 10–15s on why.",
      "End on the three together.",
    ],
    caption: "three we wish we'd made. 🫂",
    tags: ['artists featured'],
    musicBed: "15s fragment of each record.",
    origin: 'lane-idea',
  },
  {
    slug: 'first-listen-voice-memo',
    title: 'First-listen voice memo',
    kicker: '20-second voice memo playing a new sketch. One photo of the speaker. Feels stolen from a group chat.',
    format: 'single photo + audio (reel)',
    length: '20s',
    brand5: { reach: 3, authenticity: 5, culture: 4, visualIdentity: 4, shareableCore: 4 },
    why: [
      "RFF pattern. Feels like you're eavesdropping.",
      "Zero production overhead. Record it on a phone leaning against the speaker.",
      "Creates a record of the sketch existing — useful for release comms later.",
    ],
    caption: "rough one from last night. might be something. 🫂",
    tags: ['@dotmajor'],
    musicBed: "The sketch itself, 20s fragment.",
    origin: 'lane-idea',
  },
  {
    slug: 'cable-tidy-meditation',
    title: 'The cable tidy meditation',
    kicker: 'Sixty seconds tidying the patch bay. Unhurried. Hands, cables, warm light.',
    format: 'reel',
    length: '60s',
    brand5: { reach: 3, authenticity: 4, culture: 3, visualIdentity: 5, shareableCore: 3 },
    why: [
      "Slow-content works counter-intuitively well in a fast feed. Bicep have done this.",
      "Pure visual brand — hands, warmth, craft. Silent-scroll readable.",
      "Zero narrative overhead. Film once, cut to 60s.",
    ],
    shotList: [
      "Close on hands coiling cables.",
      "Wide of the patch bay.",
      "Close on a cable being plugged in clean.",
      "Pull back to the rig finished and lit.",
    ],
    caption: "some nights are like this. 🫂",
    tags: ['@dotmajor'],
    musicBed: "Ambient fragment, no drums.",
    origin: 'lane-idea',
  },
]

/* ────────────────────────────────────────────────────────────
   WEEK META — for the week-at-a-glance panel on the index
   ──────────────────────────────────────────────────────────── */
export const weekMeta = {
  window: 'Wed 8 Apr → Sun 12 Apr 2026',
  decisionsLocked: [
    'Wed 8 Apr reel — Hybrid Live rebuild concept, caption finalised',
    'Sat 11 Apr slot — candid duo moment from the studio week',
    '£50 Meta ad Step 1 — pushing tonight',
  ],
  northStar: 'SELL OUT VESPERS + gain new real fans along the way',
  threeShows: [
    { label: 'Soho House, Greek Street', date: 'Fri 10 Apr 2026', context: 'Hybrid Live first outing (possibly)' },
    { label: 'Athens w/ Caribou — Avissinias Square', date: 'Thu 14 May 2026', context: 'Edenxathens, Eden/Caribou lineup' },
    { label: 'Vespers w/ Percolate — London', date: 'Fri 12 Jun 2026', context: 'First NM/Percolate show. Audition for the whole pipeline.' },
  ],
}
