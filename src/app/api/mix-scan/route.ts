import { NextRequest, NextResponse } from 'next/server'

// ── POST /api/mix-scan ─────────────────────────────────────────────────────
// Accepts JSON body with tracklist + optional context
// Calls Claude for expert DJ mix analysis, returns structured result + rating
// RULE: Never fabricate. Only analyse what's actually provided.

interface MixScanRequest {
  tracklist?: string   // free-text tracklist
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

  const { tracklist, context } = body
  const hasTracklist = !!(tracklist && tracklist.trim().length > 10)

  if (!hasTracklist) {
    return NextResponse.json({ error: 'Provide a tracklist to analyse' }, { status: 400 })
  }

  // Count tracks for context
  const trackLines = tracklist!.trim().split('\n').filter(l => l.trim().length > 3)
  const trackCount = trackLines.length

  const userPrompt = `
You are analysing a DJ set based on a tracklist provided by the DJ.

ABSOLUTE RULE — NEVER FABRICATE:
- You can ONLY comment on what is present in the tracklist
- You have NO audio data — do not mention amplitude, RMS, energy levels, waveforms, or transition smoothness
- Do not invent BPM values, key signatures, or transition quality unless the tracklist explicitly includes them
- If you don't know something, say "not available from tracklist alone" — NEVER guess
- If the tracklist has very few tracks or limited info, reflect that honestly in the score and analysis
- A short or incomplete tracklist should result in a lower confidence analysis, not a fabricated one

WHAT YOU CAN ANALYSE FROM A TRACKLIST:
- Track selection and curation quality
- Genre coherence and flow
- Artist diversity vs repetition
- Set narrative (opener → build → peak → close) based on known tracks
- Whether track choices suit the stated context
- Known key relationships IF you genuinely know the keys of these specific tracks (otherwise skip)
- Known BPM ranges IF you genuinely know the tempos (otherwise skip)

WHAT YOU CANNOT ANALYSE WITHOUT AUDIO (DO NOT MENTION THESE):
- Transition quality or smoothness
- EQ technique or blending
- Amplitude, RMS, energy measurements
- Beat-matching precision
- Gain staging
- "Amplitude dip points" or "energy troughs"

${context ? `CONTEXT PROVIDED BY DJ: ${context}` : ''}

TRACKLIST (${trackCount} tracks):
${tracklist}

Return JSON:
{
  "overall_score": <number 1-10, one decimal — based ONLY on tracklist curation, flow, and track selection. Be honest about confidence level.>,
  "grade": <"A+"|"A"|"A-"|"B+"|"B"|"B-"|"C+"|"C"|"D"|"F">,
  "headline": <one honest sentence summarising the set based on what you can see>,
  "summary": <2-3 sentences — be explicit that this is a tracklist-only analysis>,
  "structure_analysis": <analyse the set arc based on tracklist — opening, build, peak, close — based on your knowledge of these tracks. If you don't know the tracks well enough, say so.>,
  "technical_assessment": <ONLY include info you genuinely know about these tracks — known BPM ranges, key relationships. If you can't determine this, say "Technical assessment requires audio data or tracklist with BPM/key information.">,
  "transition_quality": "not assessed — tracklist only",
  "transition_notes": "Transition quality cannot be assessed from a tracklist alone.",
  "energy_arc": <describe the likely energy arc based on your knowledge of these tracks. If you don't know them, acknowledge this.>,
  "tracks": <array of objects — ONLY include tracks with notable observations. Format: {"position": number, "title": string, "artist": string, "observation": string or null}. Keep observations under 15 words. Do NOT fabricate mix quality assessments.>,
  "strengths": <array of 2-3 short strengths — ONLY things you can actually determine from the tracklist>,
  "improvements": <array of 2-3 specific improvements — ONLY things you can actually determine from the tracklist>,
  "key_moments": <array of 2-3 notable track choices — keep each under 20 words>,
  "overall_verdict": <2-3 sentences max — concise final assessment, honest about what you could and couldn't assess>
}

CRITICAL: Keep your TOTAL response under 3000 tokens. Be concise. Only state facts you know.
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
        system: `You are an expert DJ, electronic music producer, and booker with 20+ years of experience. You analyse DJ set tracklists with precision and honesty.

CORE RULE: NEVER fabricate or guess. Only state what you genuinely know or can determine from the provided data. If you cannot assess something, say so clearly rather than making something up. Credibility is everything — one fabricated detail destroys trust.

Return ONLY valid JSON, no markdown, no code fences.`,
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
      try { return JSON.parse(str) } catch {}

      let s = str
      let inString = false
      let escaped = false
      for (let i = 0; i < s.length; i++) {
        if (escaped) { escaped = false; continue }
        if (s[i] === '\\') { escaped = true; continue }
        if (s[i] === '"') inString = !inString
      }
      if (inString) {
        const lastQuote = s.lastIndexOf('"')
        if (lastQuote > 0) s = s.substring(0, lastQuote) + '"'
      }

      s = s.replace(/,\s*$/, '')
      s = s.replace(/:\s*$/, ': null')
      s = s.replace(/,\s*"[^"]*"\s*$/, '')

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

      for (let i = 0; i < brackets; i++) s += ']'
      for (let i = 0; i < braces; i++) s += '}'

      try { return JSON.parse(s) } catch {}

      const scoreMatch = str.match(/"overall_score"\s*:\s*([\d.]+)/)
      const gradeMatch = str.match(/"grade"\s*:\s*"([^"]+)"/)
      const headlineMatch = str.match(/"headline"\s*:\s*"([^"]+)"/)
      const summaryMatch = str.match(/"summary"\s*:\s*"([^"]+)"/)
      return {
        overall_score: scoreMatch ? parseFloat(scoreMatch[1]) : 5.0,
        grade: gradeMatch ? gradeMatch[1] : 'N/A',
        headline: headlineMatch ? headlineMatch[1] : 'Analysis completed',
        summary: summaryMatch ? summaryMatch[1] : 'Analysis was partially truncated.',
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
