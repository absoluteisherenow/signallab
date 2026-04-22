// Confidence + abstention. The brain self-rates every generation: "how sure
// are you this is good / tied to reality?" Below 0.6 the UI treats the output
// as a draft and surfaces a clarify card instead of auto-emitting — prevents
// the brain from shipping low-confidence content into outbound (ads, release
// announce, invoices) that the never-fabricate rule cares most about.
//
// Protocol: the generation task-instruction is appended with
// `CONFIDENCE_INSTRUCTION_SUFFIX` which asks the model to end every response
// with a `<signal>{"confidence": 0.X, "missing_context": [...]}</signal>`
// block. `parseConfidenceSignal` strips it from the user-visible text and
// returns the structured values.
//
// Never throws. Missing/unparseable signal → `confidence: null`, which the
// callers should treat as "unknown, surface as advisory only".

export interface ConfidenceSignal {
  text: string
  confidence: number | null
  missing_context: string[]
}

export const CONFIDENCE_INSTRUCTION_SUFFIX = `

After your response, append a final line (and only a final line) of this exact shape:

<signal>{"confidence": 0.85, "missing_context": ["specific thing 1", "specific thing 2"]}</signal>

Rules for the signal block:
- confidence: 0.0-1.0 — your honest self-rating of how confident you are this output is accurate, on-brand, and grounded in the context provided. Lower it aggressively if you invented specifics, guessed at names/numbers, or leaned on clichés.
- missing_context: list anything you needed but didn't have — specific dates, quotes, recent performance data, artist preferences. Empty array if genuinely nothing missing.
- The signal is for the system — the user never sees it. Do not reference it in your user-facing text.
- Output only one signal block, as the final element of your reply.`

const SIGNAL_RE = /<signal>([\s\S]*?)<\/signal>/i

/**
 * Parse a confidence signal from a brain-wrapped generation. Strips the
 * `<signal>...</signal>` tag from the user-visible text. Tolerant of
 * malformed JSON — falls back to `confidence: null` rather than throwing so
 * the primary generation still ships.
 */
export function parseConfidenceSignal(raw: string): ConfidenceSignal {
  const match = SIGNAL_RE.exec(raw)
  if (!match) {
    return { text: raw.trim(), confidence: null, missing_context: [] }
  }
  const cleaned = raw.replace(SIGNAL_RE, '').trim()
  const jsonStr = match[1].trim()
  try {
    const obj = JSON.parse(jsonStr)
    const confidence =
      typeof obj.confidence === 'number' && obj.confidence >= 0 && obj.confidence <= 1
        ? obj.confidence
        : null
    const missing = Array.isArray(obj.missing_context)
      ? obj.missing_context.filter((x: any): x is string => typeof x === 'string').slice(0, 10)
      : []
    return { text: cleaned, confidence, missing_context: missing }
  } catch {
    return { text: cleaned, confidence: null, missing_context: [] }
  }
}

/** Threshold below which UI should treat output as draft, not final. */
export const CONFIDENCE_ABSTAIN_THRESHOLD = 0.6
