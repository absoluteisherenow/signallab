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

  const hasAudio = !!(filename && duration_seconds)
  const durationMin = hasAudio ? Math.round(duration_seconds / 60) : 0
  const transitionCount = (transition_points || []).length

  // Format transition data for Claude
  const transitionSummary = (transition_points || []).slice(0, 20).map((t, i) => {
    const mm = Math.floor(t.time_seconds / 60).toString().padStart(2, '0')
    const ss = Math.floor(t.time_seconds % 60).toString().padStart(2, '0')
    const quality = t.energy_dip > 0.4 ? 'hard cut / large dip' : t.energy_dip > 0.2 ? 'noticeable dip' : 'smooth blend'
    return `  T${i + 1}: ${mm}:${ss} — energy ${(t.energy_before * 100).toFixed(0)}% → ${(t.energy_after * 100).toFixed(0)}% (${quality})`
  }).join('\n')

  const hasTracklist = !!(tracklist && tracklist.trim().length > 10)

  if (!hasAudio && !hasTracklist) {
    return NextResponse.json({ error: 'Provide either an audio file or a tracklist' }, { status: 400 })
  }

  const userPrompt = `
You are analysing a DJ mix.${hasAudio ? ' You have been given raw audio signal measurements from a Web Audio API analysis.' : ' No audio was provided — analysing from tracklist only.'}
${hasAudio ? `
CRITICAL — UNDERSTAND WHAT THESE NUMBERS MEAN:
- "Energy %" = normalised RMS amplitude (loudness), NOT musical tension or crowd energy
- A professionally mastered mix will naturally show flat RMS (35-50% throughout) — this is CORRECT gain staging, NOT a problem
- "Detected transitions" = local amplitude dips — these are probable track change points but NOT confirmed
- BPM estimate = autocorrelation guess from a 60-second sample — treat as approximate only
- DO NOT invent analysis that cannot be derived from these measurements

FILE: ${filename}
DURATION: ${durationMin} minutes
ESTIMATED BPM: ${bpm_estimate ? `~${bpm_estimate} BPM (approximate)` : 'Could not determine'}
RMS AMPLITUDE — average: ${((avg_energy || 0) * 100).toFixed(0)}%, peak: ${((peak_energy || 0) * 100).toFixed(0)}%
PROBABLE TRACK CHANGES DETECTED: ${transitionCount} points where amplitude dips significantly` : ''}
${context ? `CONTEXT PROVIDED BY DJ: ${context}` : ''}
${hasAudio ? `
AMPLITUDE DIP DATA (probable transitions — based on loudness only, not confirmed track changes):
${transitionSummary || 'No significant dips detected — mix may be very consistent or analysis inconclusive'}` : ''}

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
    ? `<array of objects from tracklist — ONLY include tracks with issues or notable moments, skip tracks that are fine. Format: {"position": number, "title": string, "artist": string, "mix_quality": "smooth"|"rough"|"unknown", "issue": string or null, "fix": string or null}. Keep issue/fix under 15 words each.>`
    : '[]'
  },
  "strengths": <array of 3 short strengths — one sentence each max>,
  "improvements": ${hasTracklist
    ? '<array of 3 specific improvements — one sentence each max>'
    : '<array of 2 improvements — one sentence each>'
  },
  "key_moments": <array of 2-3 notable moments — keep each under 20 words>,
  "overall_verdict": <2-3 sentences max — concise final assessment>
}

CRITICAL: Keep your TOTAL response under 3000 tokens. Be concise. For tracks array, ONLY list tracks that have issues or are standouts — do NOT list every track if they're fine.
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
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
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
    let cleaned = raw.replace(/```json|```/g, '').trim()

    // Robust JSON repair for truncated responses
    function repairJSON(str: string): Record<string, unknown> {
      // Try as-is first
      try { return JSON.parse(str) } catch {}

      // Walk backwards to find a safe truncation point
      // Remove any trailing incomplete value (string, number, etc)
      let s = str

      // If we're inside a string, close it
      let inString = false
      let escaped = false
      for (let i = 0; i < s.length; i++) {
        if (escaped) { escaped = false; continue }
        if (s[i] === '\\') { escaped = true; continue }
        if (s[i] === '"') inString = !inString
      }
      if (inString) {
        // Truncate back to last complete string or value
        const lastQuote = s.lastIndexOf('"')
        if (lastQuote > 0) {
          // Check if this quote opens or closes — find the matching context
          s = s.substring(0, lastQuote) + '"'
        }
      }

      // Remove trailing comma or colon with incomplete value
      s = s.replace(/,\s*$/, '')
      s = s.replace(/:\s*$/, ': null')
      // Remove trailing key without value
      s = s.replace(/,\s*"[^"]*"\s*$/, '')

      // Count unclosed brackets and braces (outside strings)
      let brackets = 0, braces = 0
      inString = false; escaped = false
      for (let i = 0; i < s.length; i++) {
        if (escaped) { escaped = false; continue }
        if (s[i] === '\\') { escaped = true; continue }
        if (s[i] === '"') { inString = !inString; continue }
        if (inString) continue
        if (s[i] === '[') brackets++
        else if (s[i] === ']') brackets--
        else if (s[i] === '{') braces++
        else if (s[i] === '}') braces--
      }

      // Close them
      for (let i = 0; i < brackets; i++) s += ']'
      for (let i = 0; i < braces; i++) s += '}'

      try { return JSON.parse(s) } catch {}

      // Last resort: regex extraction
      const scoreMatch = str.match(/"overall_score"\s*:\s*([\d.]+)/)
      const gradeMatch = str.match(/"grade"\s*:\s*"([^"]+)"/)
      const headlineMatch = str.match(/"headline"\s*:\s*"([^"]+)"/)
      const summaryMatch = str.match(/"summary"\s*:\s*"([^"]+)"/)
      const structureMatch = str.match(/"structure_analysis"\s*:\s*"([^"]+)"/)
      const techMatch = str.match(/"technical_assessment"\s*:\s*"([^"]+)"/)
      const energyMatch = str.match(/"energy_arc"\s*:\s*"([^"]+)"/)
      const verdictMatch = str.match(/"overall_verdict"\s*:\s*"([^"]+)"/)
      return {
        overall_score: scoreMatch ? parseFloat(scoreMatch[1]) : 5.0,
        grade: gradeMatch ? gradeMatch[1] : 'N/A',
        headline: headlineMatch ? headlineMatch[1] : 'Analysis completed',
        summary: summaryMatch ? summaryMatch[1] : 'Analysis was partially truncated but key scores were extracted.',
        structure_analysis: structureMatch ? structureMatch[1] : undefined,
        technical_assessment: techMatch ? techMatch[1] : undefined,
        energy_arc: energyMatch ? energyMatch[1] : undefined,
        overall_verdict: verdictMatch ? verdictMatch[1] : undefined,
        strengths: [],
        improvements: [],
        tracks: [],
        _truncated: true,
      }
    }

    const result = repairJSON(cleaned)
    return NextResponse.json({ result })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
