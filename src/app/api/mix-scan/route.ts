import { NextRequest, NextResponse } from 'next/server'

// ── POST /api/mix-scan ─────────────────────────────────────────────────────
// Accepts JSON body with mix analysis data + optional tracklist
// Calls Claude for expert DJ mix analysis, returns structured result + rating

interface TransitionPoint {
  time_seconds: number
  energy_before: number
  energy_after: number
  energy_dip: number
}

interface MixScanRequest {
  filename: string
  duration_seconds: number
  avg_energy: number
  peak_energy: number
  transition_points: TransitionPoint[]
  bpm_estimate: number | null
  tracklist?: string   // free-text tracklist the user optionally typed in
  context?: string     // e.g. "techno set, 2 hours, club warm-up"
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  let body: MixScanRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    filename,
    duration_seconds,
    avg_energy,
    peak_energy,
    transition_points,
    bpm_estimate,
    tracklist,
    context,
  } = body

  const durationMin = Math.round(duration_seconds / 60)
  const transitionCount = transition_points.length

  // Format transition data for Claude
  const transitionSummary = transition_points.slice(0, 20).map((t, i) => {
    const mm = Math.floor(t.time_seconds / 60).toString().padStart(2, '0')
    const ss = Math.floor(t.time_seconds % 60).toString().padStart(2, '0')
    const quality = t.energy_dip > 0.4 ? 'hard cut / large dip' : t.energy_dip > 0.2 ? 'noticeable dip' : 'smooth blend'
    return `  T${i + 1}: ${mm}:${ss} — energy ${(t.energy_before * 100).toFixed(0)}% → ${(t.energy_after * 100).toFixed(0)}% (${quality})`
  }).join('\n')

  const hasTracklist = !!(tracklist && tracklist.trim().length > 10)

  const userPrompt = `
You are analysing a DJ mix. You have been given raw audio signal measurements from a Web Audio API analysis.

CRITICAL — UNDERSTAND WHAT THESE NUMBERS MEAN:
- "Energy %" = normalised RMS amplitude (loudness), NOT musical tension or crowd energy
- A professionally mastered mix will naturally show flat RMS (35-50% throughout) — this is CORRECT gain staging, NOT a problem
- "Detected transitions" = local amplitude dips — these are probable track change points but NOT confirmed
- BPM estimate = autocorrelation guess from a 60-second sample — treat as approximate only
- You CANNOT determine: key, harmonic mixing, track selection quality, or crowd impact from this data alone
- DO NOT invent analysis that cannot be derived from these measurements

FILE: ${filename}
DURATION: ${durationMin} minutes
ESTIMATED BPM: ${bpm_estimate ? `~${bpm_estimate} BPM (approximate)` : 'Could not determine'}
RMS AMPLITUDE — average: ${(avg_energy * 100).toFixed(0)}%, peak: ${(peak_energy * 100).toFixed(0)}%
PROBABLE TRACK CHANGES DETECTED: ${transitionCount} points where amplitude dips significantly
${context ? `CONTEXT PROVIDED BY DJ: ${context}` : ''}

AMPLITUDE DIP DATA (probable transitions — based on loudness only, not confirmed track changes):
${transitionSummary || 'No significant dips detected — mix may be very consistent or analysis inconclusive'}

${hasTracklist
  ? `TRACKLIST (provided by DJ — use this as the PRIMARY basis for your analysis):\n${tracklist}`
  : 'NO TRACKLIST PROVIDED — your analysis will be LIMITED to what amplitude data can actually tell us. Do not speculate about tracks, keys, or curation.'
}

Return JSON:
{
  "overall_score": ${hasTracklist
    ? '<number 1-10, one decimal — based on tracklist curation, flow, key mixing, set narrative>'
    : '<number 1-10, one decimal — score ONLY what the audio data confirms. Be conservative. Without a tracklist you cannot assess curation, key mixing, or artistry — reflect this in the score>'
  },
  "grade": <"A+"|"A"|"A-"|"B+"|"B"|"B-"|"C+"|"C"|"D"|"F">,
  "headline": <one honest sentence — if no tracklist, acknowledge the analysis is amplitude-only>,
  "summary": <2-3 sentences — be explicit about what was and wasn't measured>,
  "data_quality": <"full" if tracklist provided, "amplitude-only" if not — include a sentence about what this means for the analysis>,
  "structure_analysis": ${hasTracklist
    ? '<analyse the set arc based on tracklist — opening, build, peak, close — is the narrative logical?>'
    : '<describe only what amplitude data shows — length, consistency, notable dips. Do NOT invent narrative structure you cannot see>'
  },
  "technical_assessment": ${hasTracklist
    ? '<assess BPM journey, key transitions, gain staging based on tracklist + amplitude data>'
    : '<amplitude-only: note BPM estimate, gain consistency, transition smoothness from dip data only>'
  },
  "transition_quality": <"excellent"|"good"|"average"|"rough"|"inconsistent"|"unknown — no tracklist">,
  "transition_notes": <what the dip data actually shows — be honest about limitations if no tracklist>,
  "energy_arc": <describe the amplitude curve honestly — flat RMS in a well-mastered mix is NORMAL, not a flaw>,
  "tracks": ${hasTracklist
    ? `<array of objects from the tracklist: {"position": number, "title": string, "artist": string, "estimated_time": string, "mix_quality": "smooth"|"rough"|"unknown", "issue": string or null, "fix": string or null}>`
    : '[]'
  },
  "strengths": <array of 3-4 strengths — only claim strengths you can actually see in the data>,
  "improvements": ${hasTracklist
    ? '<array of 4-5 specific improvements based on the tracklist analysis>'
    : '<array of 2-3 improvements — limited to what amplitude data suggests. Recommend adding tracklist for deeper feedback>'
  },
  "key_moments": <array of 2-3 notable moments with timestamps — only from real dip data, not invented>,
  "overall_verdict": <honest final paragraph — if no tracklist, be upfront that a full assessment needs the tracklist. Don't score harshly for things you cannot measure.>
}

IMPORTANT: Flat RMS amplitude is NOT evidence of bad mixing. Do not penalise a mix for consistent loudness — that's professional mastering. Only flag amplitude issues if there are genuine clipping events or jarring 40%+ drops.
`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: 'You are an expert DJ, electronic music producer, and booker with 20+ years of experience. You analyse DJ mixes with precision and honesty. Return ONLY valid JSON, no markdown, no code fences.',
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      const msg = data?.error?.message || `Claude error ${response.status}`
      return NextResponse.json({ error: msg }, { status: response.status })
    }

    const raw = data.content?.[0]?.text || '{}'
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return NextResponse.json({ result })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
