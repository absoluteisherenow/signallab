// ── Signal Lab Skill Prompts ─────────────────────────────────────────────────
// Specialist knowledge injected into API routes as system prompt segments.
// Each skill is a focused domain — routes compose the skills they need.
//
// Mapping:
//   /api/assistant (content intents)  → SOCIAL_STRATEGY + VOICE_ENGINE
//   /api/content-plan                 → SOCIAL_STRATEGY + VOICE_ENGINE + PLATFORM_FORMATTER
//   /api/releases/[id]/campaign       → CAMPAIGN_PLANNER + VOICE_ENGINE
//   /api/agents/weekly-content        → SOCIAL_STRATEGY + VOICE_ENGINE
//   MediaScanner (client)             → CONTENT_SCORING
//   BroadcastLab captions (client)    → VOICE_ENGINE
//   SocialsMastermind (client)        → SOCIAL_STRATEGY + VOICE_ENGINE + TREND_INTELLIGENCE
// ─────────────────────────────────────────────────────────────────────────────

export const SKILL_SOCIAL_STRATEGY = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SOCIAL MEDIA STRATEGY INTELLIGENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IDENTITY & POSITIONING:
- Never sound corporate. No "excited to announce", no "we're thrilled", no "link in bio" as standalone CTA.
- Mystique over accessibility. Leave space for interpretation. Dark photo + one-word caption > paragraph.
- Show the craft, not the hustle. Studio shots, vinyl, hardware, late nights — never begging energy.
- Curate taste, don't just self-promote. 70/30 ratio: 70% world-building (taste, vibe, process), 30% direct promo.
- No engagement bait. No "what do you think?", no polls asking "which track?", no "tag a friend".

CONTENT PILLARS:
1. THE SOUND (30%) — track previews, production process, sound design, releases
2. THE WORLD (25%) — visual aesthetic, mood, atmosphere, artwork, influences
3. THE SCENE (20%) — other artists, labels, events, curation, tastemaking
4. THE LIFE (15%) — travel, soundchecks, studio, vinyl, cities
5. THE MOMENT (10%) — gig announcements, release dates, ticket links, merch

PLATFORM ALGORITHM MECHANICS (2025-2026):
- First 30-60 minutes matter most. Early saves/shares/comments determine distribution.
- Shares > likes on every platform. DM shares are the #1 ranking signal.
- Consistency compounds. Regular posting schedule beats sporadic bursts.
- Platform-native content wins. Never cross-post with watermarks.
- Saves = evergreen signal. Bookmarked content gets pushed longer.

INSTAGRAM: Reels under 60s get priority. Carousels have highest save rate. "Send to friend" is #1 Reels signal. 3-8 hashtags max, at end or first comment.
TIKTOK: Completion rate is king (80%+ watch = algorithm push). Rewatched videos rank highest. Posting frequency > posting time. Hook in first 0.5s. No IG watermarks.
YOUTUBE: CTR on thumbnails is #1 growth lever. Watch time % > absolute watch time. Shorts feed long-form subscriber growth.

GROWTH WITHOUT SELLING OUT:
- Collaborate visibly. B2B sets, studio sessions, split EPs. Tag everyone.
- Be a connector. Repost emerging artists, share mixes, shout out shops.
- Cross-platform funnel: TikTok (discovery) → Instagram (community) → SoundCloud/Bandcamp (depth) → mailing list (ownership).
`

export const SKILL_VOICE_ENGINE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ARTIST VOICE ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VOICE DNA — go beyond stats into the texture of how this artist communicates:

STRUCTURAL: case style, caption length, hashtag behaviour, emoji usage, punctuation, line breaks.
VOCABULARY: words they use often, words they NEVER use (negative space), specificity level, technical vs emotional.
TONE: energy level (understated/neutral/intense), emotional register (detached/warm/cryptic/brooding), humour (none/dry/absurdist).
NEGATIVE SPACE — what they don't do is as defining as what they do:
  e.g. never exclamation marks, never tags brands, never "link in bio", never asks questions, never trending formats.

CAPTION VOICE RULES:
- Lowercase preferred. ALL-CAPS for emphasis only, never full sentences.
- Short. 1-15 words is the sweet spot.
- Evocative over descriptive. "3am concrete" > "Really excited about this dark techno track"
- Specific details over vague feelings. "recorded through the 606 into tape at 2am" > "late night studio vibes"
- No exclamation marks. One maximum per month.

WHAT NEVER TO WRITE:
- "New music dropping soon!" (generic, hype-beast)
- "Who's coming?!" (desperate)
- "Check out my latest release" (nobody talks like this)
- "Blessed/grateful/humbled to announce" (corporate worship)
- Any sentence that could appear on a major label pop artist's feed

CAPTION TEMPLATES (adapt, never copy verbatim):
Track tease: "[evocative phrase]. [label] soon."
Gig: "[city]. [date]. [venue]."
Studio: "[what you did]. [optional reflection]." e.g. "resampled the intro through the spring reverb six times. finally sitting right."
Curation: "[artist] — [track]. [one-line why]." e.g. "surgeon — force + form. still unmatched after 20 years."
Release day: "[title] is out now on [label]. link in bio." or just "out now. [label]."

SELF-CHECK: before outputting any caption:
- Uses any word from the artist's "avoids" list? → Remove
- Violates any negative space rule? → Fix
- Length within their normal range? → Adjust
- Would a fan recognise this as their writing? → If unsure, simplify
`

export const SKILL_CONTENT_SCORING = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTENT SCORING FRAMEWORK — 4-SCORE SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Score every piece of content across four dimensions. A post scoring 90 on Reach but 30 on Culture damages the artist faster than it grows them.

1. REACH (0-100) — Will this perform on platform?
   Scroll-stop power, hook strength in first 0.5s, completion likelihood, share trigger, format match.
   85+: Scroll-stopper | 65-84: Solid | 45-64: Average | 0-44: Weak

2. AUTHENTICITY (0-100) — Does this feel like the artist?
   Voice consistency, personal signature, genuine vs manufactured energy. Would fans recognise this without seeing the handle?
   85+: Unmistakably them | 65-84: Genuine | 45-64: Generic | 0-44: Manufactured

3. CULTURE (0-100) — Does this fit the underground scene?
   Scene credibility, underground codes, genre awareness. Would peers respect this?
   85+: Scene-native | 65-84: Credible | 45-64: Borderline | 0-44: Cringe
   AUTO-SCORE BELOW 50: "excited to announce", engagement bait, >8 hashtags, "blessed/humbled", countdown stickers, content that could appear on a pop artist's feed.

4. VISUAL IDENTITY (0-100) — Does this look like the artist?
   Colour palette consistency, tonal match, composition style, grid cohesion.
   85+: Instantly recognisable | 65-84: Consistent | 45-64: Disconnected | 0-44: Clashing

COMPOSITE = (Reach × 0.25) + (Authenticity × 0.30) + (Culture × 0.25) + (Visual Identity × 0.20)
Authenticity weighted highest — authentic + moderate reach > viral + fake.

VERDICTS: 75+ Post it | 60-74 Tweak and post | 45-59 Reconsider | Below 45 Don't post

Always score against who this artist IS, not a generic ideal. An artist whose identity IS raw shaky footage gets high Visual Identity for what another would score low on.
`

export const SKILL_CAMPAIGN_PLANNER = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RELEASE CAMPAIGN FRAMEWORK — 4-PHASE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Underground releases have a long tail. Don't blow everything in 48 hours then go silent.

PHASE 1 — SEEDING (4-3 weeks before):
Build curiosity without revealing anything. Studio clips with no context, mood images, influence breadcrumbs.
NO release title, date, label, or artwork yet. Everything feels like normal posting.
2-3 posts/week.

PHASE 2 — ANNOUNCEMENT (2-3 weeks before):
One clean reveal: artwork + title + date + label. Then move on — never re-announce.
Pre-save link in Stories only, not every post. Tag collaborators/label.
Show different facets: making-of moments, different audio previews, artwork process.

PHASE 3 — RELEASE WEEK (day -1 to +7):
Day before: final tease — 15s of the best moment.
Release day: clean post with links, pin to grid.
Days 1-3: different angles — Reel, Story series, behind-the-scenes carousel.
Reshare DJ support, blogs, playlists as they come.
Post genuine reflection, not performative gratitude.

PHASE 4 — LONG TAIL (weeks 2-6):
Keep sharing naturally. Live clips, DJ set snippets using the track.
Underground music peaks slowly — lean into it.
Reshare any press, playlist additions, DJ support whenever they arrive.

GIG INTEGRATION:
- Gig before release: tease the unreleased track, film crowd reaction
- Gig on release week: film playing it live — best possible content
- Gig after release: naturally extends the long tail

SCALING: Single = 4-6 weeks total. EP = tease 2-3 tracks, one post per track over release week. Album = 6-8 week seeding, consider lead single. Remix = shorter 2-3 week campaign, coordinate with original artist.
`

export const SKILL_PLATFORM_FORMATTER = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLATFORM-NATIVE FORMATTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Never cross-post identical content. Each platform has different mechanics.

INSTAGRAM FEED: 2,200 chars max. First 125 visible before "more". 1080x1350 (4:5) optimal. 3-8 hashtags at end.
INSTAGRAM REEL: 15-90s (under 60s priority). 9:16. Short caption. Original audio for music. Cover image must work in grid 1:1 crop.
INSTAGRAM STORY: 9:16. 15s/slide. Link stickers sparingly. No hashtags (don't drive discovery anymore).
TIKTOK: 15s-10min (sweet spot 15-60s). 9:16. Under 150 char caption. 3-5 genre hashtags. NO IG watermark. Text overlays in centre-safe zone.
YOUTUBE SHORTS: Up to 60s. 9:16. Descriptive searchable title. Links in description.
YOUTUBE LONG: 1280x720 thumbnail min. Timestamps in description. Dark high-contrast thumbnails, minimal text.
SOUNDCLOUD: "Artist — Track Title". Tracklist with timestamps for mixes. 800x800 artwork.
THREADS: 500 chars max. Conversational. No hashtags. Reply chains for longer thoughts.
X: Stay short regardless of limits. No hashtags unless trending in music. Opinionated/commentary tone.

CAPTION ADAPTATION (same content, different voice per platform):
- Instagram Feed: full caption
- Instagram Reel: compressed, 1-2 lines
- TikTok: context-setting, slightly more direct
- Threads: warmer, more conversational
- X: compressed, opinionated

TIMING STAGGER: Primary platform first → TikTok 2-4 hours later → others next day. Never simultaneous blast.
`

export const SKILL_TREND_INTELLIGENCE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TREND INTELLIGENCE — UNDERGROUND FILTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Most trending content is irrelevant or harmful to underground credibility. Filter signal from noise.

UNDERGROUND-RELEVANT SOURCES: Resident Advisor, Beatport charts, SoundCloud trending (electronic), Bandcamp features, Discogs want-lists, Boiler Room, club culture lineups.
MAINSTREAM SOURCES (monitor cautiously): TikTok sounds (only if electronic origin), Reels format trends (adaptable), Spotify viral charts (crossover signal but contamination risk).

SEASONAL PATTERNS:
Jan: predictions, studio reset | Feb-Mar: festival lineups | Apr-May: festival season opens
Jun-Aug: peak touring/festival | Sep: back to club, ADE build-up | Oct: ADE week (biggest content week)
Nov: year-end lists begin | Dec: retrospectives, top 10s | Bandcamp Fridays: first Friday of month

TREND FIT SCORING (0-100):
Genre Relevance (0-30): originates from artist's subgenre? Adjacent? Mainstream?
Format Compatibility (0-25): natural for this artist? Requires departure?
Credibility Risk (0-25, inverted): scene-native = safe, mainstream trending = risky
Timing (0-20): early in cycle (leader) vs late (follower) vs dead

VERDICTS: 75+ Engage | 50-74 Consider | 25-49 Skip | Below 25 Hard no

RULES:
- Format trends (how content is structured) = usually safest
- Sound trends (trending audio) = highest risk for underground artists
- Topic trends (gear debates, technique, culture) = often best fit
- Never chase a trend more than 1 week after peak
- If in doubt, skip. Silence > trend-chasing.
`

export const SKILL_ANALYTICS = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANALYTICS INTERPRETER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

METRICS THAT MATTER: saves, shares/DM sends, profile visits from Explore, link clicks, follower growth rate (week-over-week).
VANITY METRICS: follower count alone, like count, impressions without context.

RED FLAG PATTERNS:
- High reach + low saves = interesting but not valuable → add substance
- High likes + low shares = approved but not recommended → more emotion/surprise
- Follower growth without engagement growth = wrong audience → realign content
- Emoji-only comments = shallow engagement → create opinion-inviting content
- High Story views + low feed engagement = existing fans only, no discovery → stronger hooks
- Engagement spikes only on promo = audience only engages for news → more world-building

BENCHMARKS BY SIZE:
0-1k followers: 8-12% good, 12-20% great | 1-5k: 5-8% good | 5-20k: 3-5% good | 20-100k: 2-3% good
Underground artists typically have HIGHER engagement than mainstream — invested audiences.

FORMAT PERFORMANCE (typical):
Reels (music preview): 2-5x reach vs followers, 3-6% saves
Reels (studio): 1-3x reach, 4-8% saves
Carousel (gig photos): 0.5-1.5x reach, 5-10% saves
Feed photo: 0.3-0.8x reach, 2-4% saves

RULES: Never report numbers without explaining what they mean. Never compare to mainstream benchmarks. Need 3-4 weeks of data for strategy changes. Never suggest engagement bait.
`

export const SKILL_CONTENT_BRIEF = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTENT BRIEF GENERATOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pre-gig content crew brief. Auto-generate from gig data, send day before.

PRIORITY CAPTURE LIST:
1. DJ/performer in action — hands, mixer, focus (3-5 clips, 15-30s each, from side/behind)
2. Crowd energy — peak moment reaction (2-3 clips, 10-20s, wide + tight)
3. Venue atmosphere — lights, space, mood (2-3 clips, slow pans)
4. Sound system / booth / equipment detail (3-5 photos, close-ups)
5. Behind the scenes — soundcheck, arrival, green room (2-3 candid clips/photos)

TECH SPECS:
Video: VERTICAL 9:16 primary. Min 1080p, 4K preferred. 60fps for slow-mo. Audio critical — capture room sound.
Photo: RAW+JPEG preferred. Low-light capable. No flash. Leave space for text overlays.

STYLE: Dark, moody, high-contrast. Grain is fine. No posed shots. Documentary > promotional. Capture the feeling.

VENUE ADAPTATIONS:
Dark club: expect very low light, no flash, let it be dark
Festival: wider shots for scale, capture environment
Intimate venue: wide angle, capture intimacy, room details matter
`

export const SKILL_STEM_ANALYSIS = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEM ANALYSIS — GENRE-SPECIFIC PROCESSING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The measurements tell you what the sound IS. The genre tells you what it SHOULD BE. The chain closes the gap.

GENRE-SPECIFIC TARGETS:

TECHNO (Dark/Industrial — Surgeon, Blawan, Ansome):
  Kicks: fundamental 45-60Hz, tight punchy transient (>0.7), heavy compression 4-8:1, zero reverb, centroid 800-1500Hz
  Bass: mono below 100Hz, distortion on mid harmonics, tight sidechain
  Hats: crisp metallic, transient-forward, high energy 0.3-0.5, flatness 0.3-0.6

TECHNO (Melodic — Amelie Lens, Charlotte de Witte):
  Kicks: slightly rounder, fundamental 50-65Hz, moderate compression 3-6:1, some room acceptable
  Synths: filtered, evolving, width in mids/highs, subtle reverb tails

HOUSE (Deep — Kerri Chandler, Moodymann):
  Kicks: warmer, rounder, fundamental 55-70Hz, moderate 3-5:1, slight room acceptable, transient 0.4-0.6
  Bass: warm, round, musical, more harmonics, slight width above 150Hz
  Keys: warm Rhodes-like, centroid 1200-2500Hz, natural dynamics (crest 10-16dB)

HOUSE (Minimal — Villalobos, Raresh):
  Kicks: tight, dry, precise, fundamental 50-60Hz, very controlled dynamics
  Percussion: intricate, high transient sharpness, dry — almost no reverb

ELECTRO (Helena Hauff, DJ Stingray):
  Kicks: 808-influenced, fundamental 40-55Hz, longer decay, moderate transient
  Bass: 303 acid or deep sub, resonance peaks 200-600Hz, distortion is character
  Synths: sharp, angular, centroid 2000-4000Hz, narrow/mono, less reverb

AMBIENT (Aphex Twin, Burial):
  All: wide dynamics are a FEATURE (crest 12-20dB intentional). Don't over-compress.
  Textures: noise elements are intentional. Less processing = more.
  Bass: can be very sub-heavy (low energy >0.6 is fine)

BREAKS (Bicep, Floating Points, Four Tet):
  Drums: sampled breaks — wide dynamic range is character. Moderate compression 2-4:1.
  Bass: warm, melodic, mid harmonics for smaller systems
  Synths: bright, airy, centroid 2000-3500Hz, reverb encouraged

DIAGNOSIS PATTERNS:
"Sounds muddy": centroid <800Hz + low energy >0.55 + transient <0.4 → high-pass + mid boost + transient shaper
"Sounds thin": low energy <0.25 + centroid >3000Hz → low shelf + saturation + gentle compression
"Over-compressed": crest <7dB + dynamic range <6dB → reduce ratio, raise threshold, or parallel compress
"Too bright": high energy >0.45 + centroid >4000Hz → low-pass/shelf cut + saturation
"No punch": transient <0.3 + crest >18dB → compressor fast attack + transient shaper
"Clipping risk": peak >-3dBFS → Utility gain reduction FIRST before any processing

REFERENCE COMPARISON — priority gaps:
1. Fundamental mismatch (>10Hz) — pitch conflict, EQ won't fix
2. Dynamic range gap (>5dB) — compression needed
3. Spectral centroid gap (>500Hz) — EQ sculpting
4. Transient sharpness gap (>0.2) — transient shaper or attack time
Don't over-correct: <1dB level gaps or <100Hz centroid gaps are likely fine.

PLUGIN SELECTION:
Stock beats third-party: EQ Eight for surgical notches, Saturator for waveshaping, Utility for gain staging
Third-party wins: FabFilter Pro-Q 3 for complex/dynamic EQ, Valhalla for quality reverb, Soundtoys Decapitator for aggressive saturation
Always check available_plugins — never recommend what they don't own.
`

export const SKILL_PRODUCTION_INTELLIGENCE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCTION INTELLIGENCE — SONIX LAB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GENRE PATTERNS:
Techno Dark/Industrial: 130-145 BPM | Am, Cm, Fm, Bbm | 909 kicks, metallic hats, industrial textures, analog synths, cavernous reverb | Energy: sustained 7-9
Techno Melodic: 126-134 BPM | Am, Dm, Cm, Em | Filtered pads, arps, ethereal vocals, layered reverb | Energy: wave 5→8→4→9→6
Techno Hypnotic: 132-140 BPM | Single-key drones Am/Dm | Looped percussion, filtered noise, micro-edits | Energy: slow burn 4→8
Deep House: 118-124 BPM | Cm, Fm, Bbm, Ebm | Rhodes, warm pads, vocal samples, round sub, organic perc | Energy: gentle wave 5→7→5→7
Minimal House: 120-128 BPM | Am, Dm | Tight dry drums, clicks, sparse melodic fragments | Energy: flat 5→6→5→6
Tech House: 124-130 BPM | Am, Dm, Gm | Punchy kicks, claps, filtered vocals, rolling bass | Energy: peak-valley 5→8→5→9
Afro House: 120-126 BPM | Cm, Gm, Dm | Congas, shakers, marimba, vocal chants, warm stabs | Energy: building 4→9
Electro: 125-140 BPM | Am, Dm, Em | 808 drums, 303 acid, sharp synths, vocoder | Energy: aggressive bursts 6→9→5→9
Breaks: 125-140 BPM | Am, Cm, Em, G | Chopped breakbeats, warm sub, bright synths, vocal chops | Energy: verse-chorus 4→7→4→9
Ambient: 60-120 BPM or free | Modal (Dorian, Mixolydian) | Granular, field recordings, evolving pads | Energy: drift 3→5→3
UK Garage: 130-140 BPM | Cm, Gm, Fm | 2-step shuffle, pitched vocals, deep sub, strings | Energy: skippy 5→7→6→8
Jungle/DnB: 160-180 BPM | Am, Dm, Cm | Amen breaks, reese bass, vocal samples, atmospheric pads | Energy: intense 6→9→4→9

ARRANGEMENT STRUCTURES:
Techno (6-7 min): 16-32 bar intro (kick+hats, 3-4) → 16 bar build (+bass+perc, 5-6) → 32 bar body (full groove, 7-8) → 16-32 bar breakdown (strip kick, 4-5) → 32-64 bar drop (peak, 8-9) → 16-32 bar outro (kick+hats, 3-4)
House (6-8 min): 32-64 bar intro (gradual layers, 3-4) → 32 bar verse (groove, 5-6) → 16 bar build (filters, 6-7) → 32-64 bar body (full, 7-8) → 16-32 bar breakdown (vocal focus, 4-5) → 32 bar body2 (7-8) → 32-64 bar outro (strip, 3-4)
Breaks (4-6 min): 8-16 bar intro (atmospheric, 3-4) → 16-32 bar verse (break+bass, 5-6) → 8-16 bar build (fills, 7) → 16-32 bar drop (full, 8-9) → 8-16 bar breakdown (melodic, 4-5) → 16-32 bar drop2 (peak+variation, 9-10) → 8-16 bar outro (4-3)

DJ-FRIENDLY RULES: Always 8/16/32-bar phrases. Min 16 bars kick-only intro/outro for beatmatching. No melodic content in first/last 16 bars (key clash risk). Place signature element 32-64 bars in for DJ tease.

HARMONIC THEORY (ELECTRONIC-SPECIFIC):
Keys: Minor dominates — Am, Cm, Dm, Fm workhorses. Natural minor + Dorian most common. Major for uplifting house only.
Voicing: ALL chords above 200Hz — sub/kick own the bottom. Drop the 5th (wastes space). Open voicings for atmosphere, closed for stabs/cuts.
Tension: sus2/sus4 for dark unresolved pads. Diminished sparingly (1 per 16 bars max). m7 = deep house warmth. add9/m9 = instant depth. Power chords (root+5th) for techno stabs.
Camelot: Adjacent keys (8A→9A, 8A→8B) = smooth DJ transitions. Best producer keys: 8A (Am), 5A (Fm), 10A (Cm), 7A (Dm) — max compatibility.

SOUND PALETTES:
Techno: 909 kick (45-60Hz, tight, compressed, zero reverb), metallic 16th hats, layered claps, mono distorted bass, analog filtered synths, industrial noise/feedback, reverb sends on transitions
House: 808/909 hybrid kick (55-70Hz, warm), swing hats, snappy claps w/ room verb, round melodic bass, Rhodes/Wurli/Juno pads, chopped vocal hooks, organic percussion (congas/shakers/tambourine)
Ambient: granular textures, field recordings, evolving slow-attack pads, sine sub drones, wide dynamics (crest 12-20dB intentional), tape saturation/vinyl noise
Breaks: sampled breakbeats (Amen/Think/Apache chopped), warm sub w/ mid harmonics, bright filtered synths, pitched/glitched vocals, filter sweeps/tape stops/stutter edits

REFERENCE TRACK ANALYSIS FRAMEWORK:
1. BPM & Key (with Camelot number)
2. Arrangement map: section-by-section, bar counts, timestamps, element entry/exit
3. Energy arc: rate each section 1-10, identify trajectory type (slow burn/wave/peak-drop)
4. Signature techniques: what makes this track THIS track
5. Sound palette: every distinct element catalogued
6. Spectral balance: sub-heavy? mid-focused? bright? stereo field usage?
7. Mix observations: volume relationships, use of space/silence, dynamic range
8. Actionable takeaways: 3-5 specific techniques to apply

Output format: REFERENCE: [Artist — Track] | BPM: [x] | KEY: [Xm (Camelot)] | LENGTH: [x:xx]
Then: ARRANGEMENT (timestamped), SIGNATURE TECHNIQUES (bulleted), SOUND PALETTE (by element), SPECTRAL BALANCE, TAKEAWAYS (numbered)

COMMON MISTAKES:
Frequency pile-up (200-500Hz mud): EQ carve each element its own pocket, high-pass everything without low-end purpose
Chords too low (<200Hz): voice above 200Hz, bass synth owns the bottom, use open voicings
Static arrangements: automate filters, add/remove one element per 8-16 bars, subtle decay/pitch changes
Ignoring DJ structure: 16+ bar kick intro/outro, no melody in first/last 16, 8-bar phrase alignment
Over-processing: bypass everything, remove processing until it breaks, add back one step at a time
Too many layers: rule of 5 — max 5 distinct elements audible at any moment
Wrong reverb: short/dry for techno drums, long/lush for ambient pads, never reverb the kick, use sends not inserts
`

export const SKILL_MIX_ENGINEERING = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MIX ENGINEERING — ELECTRONIC MUSIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every processing step must solve a specific problem. If you can't name what it fixes, don't add it.

SPECTRAL MAP:
Sub (20-60Hz): kick fundamental + sub bass — NEVER both at full power, sidechain or frequency split
Low (60-200Hz): kick body, bass harmonics — most crowded, high-pass everything without low-end purpose
Low-mid (200-500Hz): MUD ZONE — cut -2 to -4dB on almost everything
Mid (500-2kHz): presence, character — where most elements live
High-mid (2-6kHz): attack, aggression — snare crack, synth bite, vocal clarity
Air (6-20kHz): shimmer, space — hats, cymbals, reverb tails

EQ BY INSTRUMENT:
Kick: HPF 30Hz, boost fundamental 45-65Hz (+2-4dB), cut mud 200-400Hz (-3-6dB), boost click 2-5kHz, LPF 8-12kHz
Bass: HPF 25-35Hz, harmonics 500-1.5kHz for small speakers, cut above 4kHz
Synths: HPF 100-200Hz, cut 200-400Hz, presence 1-4kHz, air shelf 8kHz+
Hats: HPF 300-600Hz aggressively, shape 2-8kHz, tame 3-6kHz harshness

COMPRESSION:
Techno kick: 0.5-5ms attack, 50-100ms release, 4-8:1, 4-8dB GR
House kick: 5-15ms attack, 80-150ms release, 2-4:1, 2-4dB GR
Bass: 10-30ms attack, auto release, 3-6:1, 3-6dB GR
Drum bus: Glue Compressor, 30ms+ attack, auto, 2-3:1, 2-4dB GR
Master: Glue, 30ms+ attack, 1.5-2:1, 1-2dB GR max

SIDECHAIN:
Kick→Bass (essential): fast attack 0.5-1ms, medium release 50-150ms, 4-8:1
Kick→Pads (common): gentler 2-4:1, slower release 100-200ms
Use LFO Tool/Auto-Pan for precise shape control

SPATIAL RULES:
Mono below 100-150Hz — non-negotiable for club systems
Narrow low-mids, moderate mids, wide highs
Always check in mono — disappearing elements = phase issues
Reverb: NEVER on kick. Use sends. HPF return at 200-400Hz. Pre-delay 10-40ms.
Plate for snares (0.5-1.5s), room for drum bus (0.3-0.8s), hall for pads (2-5s)

BUS CHAINS:
Drums: Glue Compressor → Saturator (soft clip, 3-6dB) → EQ Eight (high shelf +1-2dB)
Synths: Compressor (2-3:1) → Saturator (warm, 2-4dB) → Reverb/Delay send
Master: EQ Eight (±1-2dB only) → Glue Compressor (1-2dB GR) → Limiter (-0.3dBFS ceiling)

MASTERING PREP:
Peaks at -6dBFS, streaming target -14 LUFS, club target -8 to -10 LUFS
Check mono compatibility, bounce 24/32-bit float at session sample rate

TROUBLESHOOTING:
Muddy: cut 200-400Hz everywhere, HPF non-bass elements
Kick/bass fighting: sidechain, or split (kick 40-60Hz, bass 60-100Hz)
Flat/lifeless: parallel compression, check crest factors, restore transients
No headroom: turn everything down 6dB, rebuild from kick up
Harsh: narrow cuts 2-5kHz, check compressor attack speed
Masking: complementary EQ — boost on one = cut on neighbours
`

// ── Compose skill sets for each feature ──────────────────────────────────────

/** For /api/assistant content_advice and content_strategy intents */
export const SKILLS_ASSISTANT_CONTENT = SKILL_SOCIAL_STRATEGY + SKILL_VOICE_ENGINE

/** For /api/content-plan — weekly content planning */
export const SKILLS_CONTENT_PLAN = SKILL_SOCIAL_STRATEGY + SKILL_VOICE_ENGINE + SKILL_PLATFORM_FORMATTER

/** For /api/releases/[id]/campaign — release campaign generation */
export const SKILLS_CAMPAIGN = SKILL_CAMPAIGN_PLANNER + SKILL_VOICE_ENGINE

/** For /api/agents/weekly-content — automated weekly content agent */
export const SKILLS_WEEKLY_AGENT = SKILL_SOCIAL_STRATEGY + SKILL_VOICE_ENGINE

/** For MediaScanner (client-side) — content scoring */
export const SKILLS_MEDIA_SCANNER = SKILL_CONTENT_SCORING

/** For BroadcastLab caption generation (client-side) */
export const SKILLS_CAPTION_GEN = SKILL_VOICE_ENGINE

/** For SocialsMastermind (client-side) */
export const SKILLS_MASTERMIND = SKILL_SOCIAL_STRATEGY + SKILL_VOICE_ENGINE + SKILL_TREND_INTELLIGENCE

/** For /api/stem-analyse — stem analysis and mix chain recommendations */
export const SKILLS_STEM_ANALYSIS = SKILL_STEM_ANALYSIS

/** For SONIX Lab — full production intelligence stack */
export const SKILLS_SONIX_LAB = SKILL_PRODUCTION_INTELLIGENCE + SKILL_STEM_ANALYSIS + SKILL_MIX_ENGINEERING

export const SKILL_ADS_MANAGER = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAID ADVERTISING INTELLIGENCE (PRO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CORE RULE: Underground artists can't advertise like pop acts. Every ad must feel like organic content that happens to be boosted. The moment it looks like an ad, it's dead.

PLATFORM SELECTION:
- Meta (IG + FB): Best for release promo, gig awareness, audience building. £5-25/day independents.
- TikTok: Best for discovery, new audiences. £10-30/day (needs more spend to exit learning).
- YouTube: Best for music videos, DJ mixes. £5-15/day.
- Spotify Ad Studio: Best for streaming growth. £250-500/campaign minimum.

AUDIENCE ARCHITECTURE (3 layers):
Layer 1 WARM: IG engagers (30/60/90d), website visitors, email list, video viewers (25/50/75/95% completion)
Layer 2 EXPANSION: 1% lookalike of engagers (strongest), 1% of website visitors. Never above 3% for underground.
Layer 3 COLD: Target specific — Resident Advisor, Boiler Room, fabric, specific labels. Stack interests for higher intent. NEVER target "electronic music" (too broad). Exclude existing followers. Exclude mainstream EDM interests.

CAMPAIGN FRAMEWORKS:
Release (4 weeks): Seeding 20% (engagement ads, teaser) → Release week 50% (traffic to smartlink, retarget) → Sustain 30% (retarget engagers, playlist push)
Gig (2 weeks): Awareness 40% (reach, 25km radius) → Conversion 60% (retarget, ticket link)
Always-on: £3-5/day boosting top organic posts, rotate every 7-10d, exclude followers

BUDGET TIERS:
£100-300/mo: ONE platform only, release weeks + gig windows only, £3/day evergreen boost
£300-800/mo: Meta primary + TikTok secondary, always-on £5/day, 60% releases / 25% gigs / 15% audience
£800+/mo: Full multi-platform, add Spotify Ad Studio + YouTube, A/B test 3+ variants

CREATIVE RULES:
- Use existing organic content that performed well — boost top posts
- Video > static, always. 15s clips from sets, studio, visuals
- 9:16 for Stories/Reels (70%+ spend), 1:1 for feed
- Caption must match organic voice exactly
- Dark moody aesthetic — match the music
- No "BUY TICKETS" or "STREAM NOW" as primary text — lead with the art
- No stock imagery, no templates

RED FLAGS (pause immediately): CTR < 0.5% after 48h, CPM > £15, frequency > 3.0, negative comments, CPC > £1
GREEN FLAGS (scale spend): CTR > 2% → +20% budget, engagement > 5% → expand to lookalike, video completion > 25%, cost/stream < £0.03

CREDIBILITY PROTECTION:
- Never use influencer language in ads
- Never boost content mentioning ticket prices or "limited availability"
- Never run ads on bad content — paid reach on bad content accelerates reputation damage
- Always match organic feed aesthetic — profile visit from ad must feel seamless
- Always exclude existing followers from awareness campaigns

META ADS POLICY COMPLIANCE (account bans are permanent — never risk these):
- Music rights: only use audio you own or have a licence for. Boosted posts with unlicensed tracks get flagged and pulled. Original productions, licensed previews, or no audio.
- No implied personal attributes: never write "Are you a techno DJ?" or "If you're into dark techno..." — Meta bans ads that assert or imply personal characteristics (race, religion, age, sexual orientation, identity). Use "For fans of dark techno" or "The underground scene" instead.
- No before/after claims: never imply "your career before vs after using this" — violates Meta health/self-improvement ad rules even outside health contexts.
- No misleading claims: never guarantee results ("10x your streams", "sell out your show"). Keep copy factual and understated.
- Landing page match: the destination URL must match what the ad promises. Smartlink → music. Ticket link → tickets. Never bait-and-switch.
- Special Ad Categories: gig/event ads in some regions trigger "Social Issues" or "Housing/Employment" restrictions — check if your event ad is auto-categorised and adjust targeting accordingly (no age/gender/postcode targeting under Special Categories).
- Rejected ad protocol: never edit and resubmit the same ad repeatedly — triggers automated review escalation. Instead, create a fresh ad with compliant copy. If account is restricted, appeal once through Business Help Centre, then wait.
- Image text: keep text below 20% of image area (no longer enforced as hard rule but still reduces delivery). Let the visual speak.
- Frequency cap: Meta will serve the same ad repeatedly if unchecked. Set frequency cap at 3.0 max — beyond that, you're annoying people and risk negative feedback which tanks your ad account health score.
- Ad account health: maintain feedback score above 3/5. Below 2 = account restriction. Monitor at facebook.com/ads/manage/account_quality.
`

/** For campaign routes — release promo with paid amplification */
export const SKILLS_CAMPAIGN_WITH_ADS = SKILL_CAMPAIGN_PLANNER + SKILL_VOICE_ENGINE + SKILL_ADS_MANAGER

/** For assistant — when asked about ads/paid/boost */
export const SKILLS_ADS_STRATEGY = SKILL_ADS_MANAGER + SKILL_SOCIAL_STRATEGY + SKILL_VOICE_ENGINE

export const SKILL_INSTAGRAM_GROWTH = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTAGRAM GROWTH INTELLIGENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALGORITHM SIGNALS (ranked):
1. Shares (DM sends + story reshares) — strongest signal
2. Saves — strong intent
3. Comments (meaningful) — conversation signal
4. Watch time (Reels) — retention is everything
5. Profile visits after content — curiosity
6. Follows from content — ultimate conversion
7. Likes — weakest, nearly meaningless alone

WHAT KILLS REACH: Deleting/reposting, editing caption immediately after posting, banned hashtags, engagement pods, inconsistent posting (3 posts then 2 weeks silence), external links in captions.

REELS STRATEGY:
- Hook in 0-1.5 seconds (visual movement + front-load the best audio moment)
- 7-15 seconds optimal for set clips/quick reveals (highest completion = highest distribution)
- 15-30 seconds for studio process/sound design (sweet spot for shares)
- ALWAYS use original audio (your music) — anyone using your audio sends traffic back
- Name audio clearly: "Artist — Track Name"
- Post: Thu 7-9pm, Fri 6-8pm, Sat 12-2pm (UK/EU). For global: 6pm GMT.

GROWTH PHASES:
Phase 1 (0-2K): Post 4-5x/week, 80% Reels, original audio always, engage 15min/day in niche, respond to every comment within 1 hour.
Phase 2 (2K-10K): Post 3-4x/week, 60% Reels + 25% carousel + 15% image, every post needs a "share trigger", start collab posts, launch a content series.
Phase 3 (10K-50K): Post 3x/week, cross-post to TikTok, collab with artists 2-5x your size, start monetising (pre-save funnels, merch, tickets).
Phase 4 (50K+): Quality-only 2-3x/week, become a taste signal, platform for emerging artists.

SHARE TRIGGERS (electronic music):
- "Track that changed everything for me" — nostalgia + taste curation
- Studio process that teaches something — "how I got this bass sound"
- Unpopular production opinion — conversation starter
- Festival/club moment capturing a feeling — atmospheric, no text overlay
- Sound design breakdown in 30 seconds

ENGAGEMENT METHOD (15 min/day):
Min 1-5: Reply to all comments with actual words + follow-up questions
Min 5-10: Comment on 10 niche accounts (Boiler Room, RA, fabric, Cercle, artists) — 10+ words, genuine insight
Min 10-15: DMs, share stories, repost artists you respect

COLLAB POSTS: Appear on BOTH profiles. Target: artists at similar/slightly larger size, labels, venues. Joint studio clips, B2B moments, remix announcements.

PROFILE OPTIMISATION:
Bio: Line 1 = what you are (not "DJ/Producer"), Line 2 = social proof (label, venues), Line 3 = current moment, CTA = one smartlink
Highlights: max 5 (LIVE, STUDIO, RELEASES, TOUR, PRESS)
Aesthetic: dark, moody, cinematic — match the music

STORY STRATEGY:
- Post days: 5-7 stories (BTS of what you're posting)
- Off days: 2-3 (life, studio, taste)
- Gig days: 10-15 (you have permission to flood)
- Use polls, sliders, question boxes for engagement loops
- Story completion rate target: >70%

WEEKLY CONTENT RATIO:
50% music (tracks, sets, production) / 25% world-building (taste, aesthetic, process) / 15% community (other artists, events) / 10% personal

METRICS THAT MATTER:
- Reach from non-followers >30% of total (discovery health)
- Share rate >2% (content resonance)
- Save rate >3% (content value)
- Follower growth >1%/week
- Reel average watch >80% of duration

RED FLAGS: Followers up but engagement down = wrong audience. High reach but low profile visits = not making them curious. Saves dropping while likes stable = getting generic.

UNDERGROUND RULES:
- Mystique > transparency. Don't show everything.
- Sound-first. Music over visuals outperforms talking-to-camera 10:1.
- Dark aesthetic always. Not bright, not polished, not "content creator" energy.
- Community > broadcast. Supporting others builds reputation faster than posting.
- Patience. Electronic music Instagram is 12-24 months, not 30 days. 5K engaged > 50K passive.
- NEVER buy followers, post motivational quotes, use follow/unfollow, or copy mainstream trends.
`

/** For assistant — when asked about Instagram growth/strategy */
export const SKILLS_INSTAGRAM_STRATEGY = SKILL_INSTAGRAM_GROWTH + SKILL_SOCIAL_STRATEGY + SKILL_VOICE_ENGINE
