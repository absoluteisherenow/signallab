import { NextRequest, NextResponse } from 'next/server'

// ── Types ────────────────────────────────────────────────────────────────────

interface StemMeasurements {
  filename: string             // e.g. "kick_stem.wav"
  duration_ms: number          // e.g. 4200
  sample_rate: number          // e.g. 44100
  channels: number             // 1 or 2
  peak_db: number              // e.g. -6.2
  rms_db: number               // e.g. -18.4
  dynamic_range_db: number     // peak - RMS, e.g. 12.2
  spectral_centroid_hz: number // e.g. 1850 (brightness indicator)
  low_energy_ratio: number     // 0-1, energy below 200Hz / total energy
  high_energy_ratio: number    // 0-1, energy above 4kHz / total energy
  transient_sharpness: number  // 0-1, how sharp/punchy the attacks are
  fundamental_hz: number       // dominant pitch, e.g. 58 for a kick
  crest_factor_db: number      // peak vs RMS, indicator of dynamics/compression
  spectral_flatness: number    // 0-1, 0=tonal, 1=noise-like
}

// Wrapper format — new API shape
interface AnalyseRequest {
  stem: StemMeasurements
  reference?: StemMeasurements  // optional — if provided, do delta/match analysis
  available_plugins?: string[]  // optional — if provided, recommend from user's installed library
}

// ── Prompt builders ──────────────────────────────────────────────────────────

function buildSystemPrompt(availablePlugins?: string[]): string {
  const hasPlugins = Array.isArray(availablePlugins) && availablePlugins.length > 0

  const pluginSection = hasPlugins
    ? `USER'S INSTALLED PLUGIN LIBRARY — recommend from these when they offer a clear advantage:
${availablePlugins.join('\n')}

ABLETON STOCK PLUGINS (always available regardless — use as fallback or when stock is the right tool):
- EQ Eight (surgical EQ, shelving, notches, boosts)
- Compressor (single-band dynamic control, transient shaping)
- Glue Compressor (bus-style glue, gentle ratio coloured compression)
- Multiband Dynamics (frequency-selective compression or expansion)
- Saturator (harmonic saturation, waveshaping, soft-clip)
- Limiter (brick-wall limiting, final ceiling control)
- Reverb (space, but use sparingly on drums/percussion)
- Echo (rhythmic delays, feedback)
- Utility (gain staging, mono-sum, width control)
- Overdrive (light distortion, presence)
- Dynamic Tube (tube saturation, warmth, harmonic richness)
- Corpus (resonant body/pitch coloration)

Prefer third-party plugins from the user's library when they offer a clear advantage (e.g. FabFilter Pro-Q 3 over EQ Eight for surgical work, Valhalla over Reverb for quality, etc). Always specify the exact plugin name.`
    : `ABLETON STOCK PLUGINS YOU MAY RECOMMEND (no third-party plugins):
- EQ Eight (surgical EQ, shelving, notches, boosts)
- Compressor (single-band dynamic control, transient shaping)
- Glue Compressor (bus-style glue, gentle ratio coloured compression)
- Multiband Dynamics (frequency-selective compression or expansion)
- Saturator (harmonic saturation, waveshaping, soft-clip)
- Limiter (brick-wall limiting, final ceiling control)
- Reverb (space, but use sparingly on drums/percussion)
- Echo (rhythmic delays, feedback)
- Utility (gain staging, mono-sum, width control)
- Overdrive (light distortion, presence)
- Dynamic Tube (tube saturation, warmth, harmonic richness)
- Corpus (resonant body/pitch coloration)`

  return `You are a professional mixing engineer specialising in dark electronic music and techno. You work with the artist Night Manoeuvres, whose sound is characterised by punchy, heavy kicks, tight and controlled compression, minimal reverb on drums, deep sub bass, dark mid-range textures, and an overall powerful, club-ready aesthetic.

Your role is to analyse acoustic measurements extracted from an audio stem and return a complete mix chain recommendation. You understand measurement data deeply and translate it into actionable, specific mix decisions.

${pluginSection}

MEASUREMENT INTERPRETATION GUIDE — use this to make expert decisions:

Spectral Centroid Hz (brightness):
  < 500 Hz   → very dark, muddy, lacks presence
  500–1200   → warm and full, may need air
  1200–2500  → balanced tonal centre
  2500–5000  → bright, present, possibly harsh
  > 5000 Hz  → very bright, potentially thin or sibilant

Low Energy Ratio (energy below 200Hz / total):
  > 0.6  → sub-dominant, risk of muddiness or low-end masking
  0.4–0.6 → healthy sub presence
  < 0.3  → sub-thin, may need fundamental reinforcement

High Energy Ratio (energy above 4kHz / total):
  > 0.4  → very bright/airy, possibly harsh
  0.2–0.4 → good presence and clarity
  < 0.1  → dull, lacks attack definition and air

Transient Sharpness (0–1):
  > 0.7  → very sharp/punchy attack — protect from over-compression
  0.4–0.7 → good transient definition
  < 0.3  → slow attack, sounds soft or blunted — may need transient shaping or faster attack on compressor

Crest Factor dB (peak-to-RMS ratio):
  > 18 dB → very dynamic, likely under-compressed or sparse
  10–18   → good dynamic headroom
  < 8 dB  → likely over-compressed or clipped — reduce compression ratio or raise threshold

Fundamental Hz (dominant pitch):
  40–60 Hz   → sub-kick or 808 range — watch sub/low-mid interactions
  50–80 Hz   → classic kick drum range
  80–150 Hz  → low-mid bass, punchy bass transient zone
  150–400 Hz → mid bass, warmth zone — often where mud lives
  > 800 Hz   → melodic or percussive high element

Dynamic Range dB (peak minus RMS):
  > 15 dB → wide dynamics, probably uncompressed source
  8–15    → natural, controlled
  < 6 dB  → heavily compressed or limited at source

Spectral Flatness (0–1):
  < 0.2  → very tonal, strong pitched content
  0.2–0.5 → mixed tonal and noise (most drums/percussion)
  > 0.6  → noise-like or broadband (cymbals, white noise, room)

Peak dB:
  > -3 dB  → risk of clipping — gain stage down before processing
  -6 to -3 → hot, leave headroom carefully
  < -18 dB → very quiet, consider gain staging up

RMS dB:
  > -12 dB → very loud/compressed
  -18 to -12 → hot mix level
  -24 to -18 → ideal processing level
  < -30 dB → quiet, may need gain before processing

Night Manoeuvres aesthetic guidelines for each instrument type:
- KICKS: Must be punchy with clear transient click, controlled sub (not boomy), tight compression (4–8:1), minimal or no reverb
- BASS/808: Deep sub foundation, mid-range presence, mono below 100Hz
- SYNTHS: Dark character, saturation welcome, width in mid-highs
- HATS/PERCUSSION: Crisp, transient-forward, careful high-frequency management
- PADS/TEXTURES: Width, warmth, can use reverb and subtle modulation
- VOCALS: Clarity, presence, controlled dynamics, de-essing if bright

CHAIN ORDERING — always recommend in signal-flow order:
1. Utility (gain staging / mono if needed) — first if required
2. EQ Eight (corrective first, then creative)
3. Compressor or Glue Compressor (dynamics shaping)
4. Saturator / Dynamic Tube / Overdrive (harmonic coloring, after compression)
5. Multiband Dynamics (if frequency-selective dynamics needed)
6. EQ Eight again (final sculpting if needed)
7. Reverb / Echo (space and time — last in chain usually)
8. Limiter (final ceiling if needed)

RESPONSE FORMAT:
You MUST return ONLY valid JSON — no markdown fences, no explanation text, no preamble. Start your response with { and end with }. The JSON must exactly match the schema provided by the user.`
}

function buildUserPrompt(m: StemMeasurements): string {
  // Pre-compute human-readable interpretations to help Claude reason
  const brightnessLabel =
    m.spectral_centroid_hz < 500  ? 'very dark/muddy' :
    m.spectral_centroid_hz < 1200 ? 'warm and full' :
    m.spectral_centroid_hz < 2500 ? 'balanced' :
    m.spectral_centroid_hz < 5000 ? 'bright/present' : 'very bright/thin'

  const subLabel =
    m.low_energy_ratio > 0.6 ? 'sub-dominant (risk of mud)' :
    m.low_energy_ratio > 0.4 ? 'healthy sub presence' : 'sub-thin'

  const airLabel =
    m.high_energy_ratio > 0.4 ? 'very bright/airy' :
    m.high_energy_ratio > 0.2 ? 'good presence' : 'dull/lacks air'

  const transientLabel =
    m.transient_sharpness > 0.7 ? 'very punchy/sharp' :
    m.transient_sharpness > 0.4 ? 'decent punch' : 'slow/blunted attack'

  const compressionLabel =
    m.crest_factor_db < 8  ? 'likely over-compressed' :
    m.crest_factor_db < 10 ? 'somewhat compressed' :
    m.crest_factor_db < 18 ? 'natural dynamics' : 'very dynamic/uncompressed'

  const gainLabel =
    m.peak_db > -3  ? 'HOT — needs gain reduction before processing' :
    m.peak_db > -6  ? 'fairly hot' :
    m.peak_db > -18 ? 'good headroom' : 'quiet — consider gain staging up'

  return `Analyse this stem and return a mix chain recommendation as JSON.

STEM FILE: ${m.filename}

ACOUSTIC MEASUREMENTS:
  Duration:              ${m.duration_ms}ms
  Sample Rate:           ${m.sample_rate}Hz
  Channels:              ${m.channels === 1 ? 'Mono' : 'Stereo'}
  Peak Level:            ${m.peak_db.toFixed(1)}dBFS  → ${gainLabel}
  RMS Level:             ${m.rms_db.toFixed(1)}dBFS
  Dynamic Range:         ${m.dynamic_range_db.toFixed(1)}dB (peak − RMS)
  Spectral Centroid:     ${m.spectral_centroid_hz.toFixed(0)}Hz  → ${brightnessLabel}
  Low Energy Ratio:      ${(m.low_energy_ratio * 100).toFixed(1)}% of energy below 200Hz  → ${subLabel}
  High Energy Ratio:     ${(m.high_energy_ratio * 100).toFixed(1)}% of energy above 4kHz  → ${airLabel}
  Transient Sharpness:   ${m.transient_sharpness.toFixed(3)}  → ${transientLabel}
  Fundamental:           ${m.fundamental_hz.toFixed(0)}Hz
  Crest Factor:          ${m.crest_factor_db.toFixed(1)}dB  → ${compressionLabel}
  Spectral Flatness:     ${m.spectral_flatness.toFixed(3)}  (0=tonal, 1=noise-like)

Based on ALL measurements, return ONLY this JSON structure (no markdown, no extra text):

{
  "type": "<instrument type, e.g. kick, bass, synth, hat, pad, vocal, percussion>",
  "subtype": "<specific descriptor, e.g. punchy techno kick, sub 808, dark pad>",
  "detected_issues": ["<issue 1>", "<issue 2>", "<up to 4 specific issues found in the measurements>"],
  "character": "<One sentence describing the sound character based on the measurements>",
  "chain": [
    {
      "plugin": "<Ableton stock plugin name>",
      "role": "<What this plugin is doing in the chain>",
      "hint": "<Specific parameter values e.g. −4dB @ 280Hz · 4:1 ratio · 2ms attack>",
      "params": {
        "description": "<Human-readable summary of key settings for UI display>"
      }
    }
  ]
}

Include 2–5 plugins in the chain. Only include plugins that genuinely improve this specific stem based on the measurements. Order them correctly in signal flow. Be specific with parameter values in the hint field.`
}

// ── Delta helpers ─────────────────────────────────────────────────────────────

function signedDelta(value: number, ref: number, unit: string): string {
  const diff = value - ref
  const sign = diff >= 0 ? '+' : ''
  return `${sign}${diff.toFixed(1)}${unit}`
}

function signedDeltaPercent(value: number, ref: number): string {
  const diff = (value - ref) * 100
  const sign = diff >= 0 ? '+' : ''
  return `${sign}${diff.toFixed(1)}%`
}

function brightnessInterpretation(hz: number): string {
  return hz < 500  ? 'very dark/muddy' :
         hz < 1200 ? 'warm and full' :
         hz < 2500 ? 'balanced' :
         hz < 5000 ? 'bright/present' : 'very bright/thin'
}

function buildReferenceUserPrompt(stem: StemMeasurements, reference: StemMeasurements): string {
  // Pre-compute delta descriptions for all key measurements
  const peakDelta       = signedDelta(stem.peak_db, reference.peak_db, 'dB')
  const rmsDelta        = signedDelta(stem.rms_db, reference.rms_db, 'dB')
  const dynRangeDelta   = signedDelta(stem.dynamic_range_db, reference.dynamic_range_db, 'dB')
  const centroidDelta   = signedDelta(stem.spectral_centroid_hz, reference.spectral_centroid_hz, 'Hz')
  const lowEnergyDelta  = signedDeltaPercent(stem.low_energy_ratio, reference.low_energy_ratio)
  const highEnergyDelta = signedDeltaPercent(stem.high_energy_ratio, reference.high_energy_ratio)
  const transientDelta  = (() => {
    const diff = stem.transient_sharpness - reference.transient_sharpness
    const sign = diff >= 0 ? '+' : ''
    return `${sign}${diff.toFixed(3)}`
  })()
  const fundamentalDelta = signedDelta(stem.fundamental_hz, reference.fundamental_hz, 'Hz')
  const crestDelta       = signedDelta(stem.crest_factor_db, reference.crest_factor_db, 'dB')

  // Qualitative brightness gap
  const stemBrightness = brightnessInterpretation(stem.spectral_centroid_hz)
  const refBrightness  = brightnessInterpretation(reference.spectral_centroid_hz)
  const centroidAbs    = stem.spectral_centroid_hz - reference.spectral_centroid_hz
  const brighterOrDarker = centroidAbs > 0 ? 'darker' : 'brighter'
  const centroidGapLabel = `YOUR is ${brighterOrDarker} than REF (${Math.abs(centroidAbs).toFixed(0)}Hz gap)`

  return `Analyse this stem against a reference and return a match-target mix chain recommendation as JSON.

YOUR STEM: ${stem.filename}
REFERENCE: ${reference.filename}

═══════════════════════════════════════════════════════════════════
MEASUREMENTS — SIDE BY SIDE WITH DELTAS
═══════════════════════════════════════════════════════════════════

                         YOUR              REF               DELTA
  Duration:              ${stem.duration_ms}ms             ${reference.duration_ms}ms
  Sample Rate:           ${stem.sample_rate}Hz             ${reference.sample_rate}Hz
  Channels:              ${stem.channels === 1 ? 'Mono  ' : 'Stereo'}            ${reference.channels === 1 ? 'Mono' : 'Stereo'}

  Peak Level:            ${stem.peak_db.toFixed(1)}dBFS           ${reference.peak_db.toFixed(1)}dBFS           ${peakDelta}
  RMS Level:             ${stem.rms_db.toFixed(1)}dBFS           ${reference.rms_db.toFixed(1)}dBFS           ${rmsDelta}
  Dynamic Range:         ${stem.dynamic_range_db.toFixed(1)}dB              ${reference.dynamic_range_db.toFixed(1)}dB              ${dynRangeDelta}

  Spectral Centroid:     ${stem.spectral_centroid_hz.toFixed(0)}Hz             ${reference.spectral_centroid_hz.toFixed(0)}Hz             ${centroidDelta}
                         (${stemBrightness}) vs (${refBrightness})
                         → ${centroidGapLabel}

  Low Energy Ratio:      ${(stem.low_energy_ratio * 100).toFixed(1)}%              ${(reference.low_energy_ratio * 100).toFixed(1)}%              ${lowEnergyDelta}
  (energy <200Hz)

  High Energy Ratio:     ${(stem.high_energy_ratio * 100).toFixed(1)}%              ${(reference.high_energy_ratio * 100).toFixed(1)}%              ${highEnergyDelta}
  (energy >4kHz)

  Transient Sharpness:   ${stem.transient_sharpness.toFixed(3)}            ${reference.transient_sharpness.toFixed(3)}            ${transientDelta}
  Fundamental:           ${stem.fundamental_hz.toFixed(0)}Hz             ${reference.fundamental_hz.toFixed(0)}Hz             ${fundamentalDelta}
  Crest Factor:          ${stem.crest_factor_db.toFixed(1)}dB              ${reference.crest_factor_db.toFixed(1)}dB              ${crestDelta}
  Spectral Flatness:     ${stem.spectral_flatness.toFixed(3)}            ${reference.spectral_flatness.toFixed(3)}

═══════════════════════════════════════════════════════════════════
TASK
═══════════════════════════════════════════════════════════════════

Using the delta data above, identify exactly what is different between YOUR stem and the REFERENCE. Then recommend a SPECIFIC processing chain using Ableton stock plugins only, with precise parameter values, that would close the gap and make YOUR stem match the character, dynamics and tonality of the REFERENCE.

Return ONLY this JSON structure (no markdown, no extra text):

{
  "type": "<instrument type, e.g. kick, bass, synth, hat, pad, vocal, percussion>",
  "subtype": "<specific descriptor, e.g. punchy techno kick, sub 808, dark pad>",
  "reference_name": "${reference.filename}",
  "detected_issues": ["<gap 1 vs reference>", "<gap 2 vs reference>", "<up to 4 specific gaps found from the deltas>"],
  "character": "<One sentence describing the gap — what needs to change to match the reference>",
  "chain": [
    {
      "plugin": "<Ableton stock plugin name>",
      "role": "<What this plugin is doing to close the gap>",
      "hint": "<Specific parameter values e.g. −4dB @ 280Hz · 4:1 ratio · 2ms attack>",
      "params": {
        "description": "<Human-readable summary of key settings for UI display>"
      }
    }
  ],
  "match_summary": "<One sentence: what the chain achieves toward matching the reference>"
}

Include 2–5 plugins in the chain. Focus exclusively on closing the gaps identified in the deltas. Order correctly in signal flow. Be specific with parameter values.`
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 500, headers: corsHeaders }
    )
  }

  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: corsHeaders }
    )
  }

  // ── Mode detection ─────────────────────────────────────────────────────────
  // New wrapper format: body has a `stem` key → { stem: StemMeasurements, reference?: StemMeasurements }
  // Legacy flat format: body has `filename` key directly → StemMeasurements (solo analysis)

  let stemMeasurements: StemMeasurements
  let referenceMeasurements: StemMeasurements | undefined

  let availablePlugins: string[] | undefined

  if (body !== null && typeof body === 'object' && 'stem' in body) {
    // New wrapper format
    const wrapped = body as AnalyseRequest
    stemMeasurements = wrapped.stem
    referenceMeasurements = wrapped.reference
    availablePlugins = wrapped.available_plugins
  } else if (body !== null && typeof body === 'object' && 'filename' in body) {
    // Legacy flat format — solo analysis, existing behaviour
    stemMeasurements = body as StemMeasurements
    referenceMeasurements = undefined
  } else {
    return NextResponse.json(
      { error: 'Request body must contain either a "stem" key (wrapper format) or "filename" key (legacy flat format)' },
      { status: 400, headers: corsHeaders }
    )
  }

  // Validate required fields on stem
  const required: (keyof StemMeasurements)[] = [
    'filename', 'duration_ms', 'sample_rate', 'channels',
    'peak_db', 'rms_db', 'dynamic_range_db', 'spectral_centroid_hz',
    'low_energy_ratio', 'high_energy_ratio', 'transient_sharpness',
    'fundamental_hz', 'crest_factor_db', 'spectral_flatness',
  ]

  const missingStem = required.filter(k => stemMeasurements[k] === undefined || stemMeasurements[k] === null)
  if (missingStem.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields in stem: ${missingStem.join(', ')}` },
      { status: 400, headers: corsHeaders }
    )
  }

  // If reference provided, validate it too
  if (referenceMeasurements !== undefined) {
    const missingRef = required.filter(k => referenceMeasurements![k] === undefined || referenceMeasurements![k] === null)
    if (missingRef.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields in reference: ${missingRef.join(', ')}` },
        { status: 400, headers: corsHeaders }
      )
    }
  }

  // ── Build prompts & token budget based on mode ─────────────────────────────
  const systemPrompt = buildSystemPrompt(availablePlugins)
  const isReferenceMode = referenceMeasurements !== undefined
  const userPrompt = isReferenceMode
    ? buildReferenceUserPrompt(stemMeasurements, referenceMeasurements!)
    : buildUserPrompt(stemMeasurements)
  const maxTokens = isReferenceMode ? 1000 : 800

  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    const data = await anthropicResponse.json()

    if (!anthropicResponse.ok) {
      const msg = data?.error?.message || `Anthropic API error ${anthropicResponse.status}`
      return NextResponse.json(
        { error: msg },
        { status: anthropicResponse.status, headers: corsHeaders }
      )
    }

    // Extract text content from Claude's response
    const rawText: string = data?.content?.[0]?.text ?? ''

    if (!rawText) {
      return NextResponse.json(
        { error: 'Empty response from Claude' },
        { status: 502, headers: corsHeaders }
      )
    }

    // Parse JSON — Claude is instructed to return only JSON but strip any
    // accidental markdown fences defensively
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let recommendation: unknown
    try {
      recommendation = JSON.parse(jsonText)
    } catch {
      // Return raw text alongside parse error so the client can debug
      return NextResponse.json(
        { error: 'Claude returned non-JSON response', raw: rawText },
        { status: 502, headers: corsHeaders }
      )
    }

    return NextResponse.json(recommendation, { headers: corsHeaders })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders }
    )
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
