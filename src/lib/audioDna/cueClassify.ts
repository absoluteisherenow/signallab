// ── Cue classification heuristics ────────────────────────────────────────────
// Shared between the Rekordbox XML import and the Essentia cue inference.
// Given a human-readable label + position in the track, decide which of
// intro / drop / breakdown / outro it is. Labels that don't fit any known
// pattern stay as `custom` — we never fabricate a semantic type.
// ─────────────────────────────────────────────────────────────────────────────

import type { HotCueType } from './types'

const PATTERNS: Array<{ type: HotCueType; rx: RegExp }> = [
  { type: 'intro', rx: /\b(intro|start|begin|in\s?cue|opening)\b/i },
  { type: 'drop', rx: /\b(drop|hook|main|peak|chorus|1st\s?drop|2nd\s?drop)\b/i },
  { type: 'breakdown', rx: /\b(break(?:down)?|bridge|build(?:up)?|quiet|minimal)\b/i },
  { type: 'outro', rx: /\b(outro|end|fade|out\s?cue|last)\b/i },
]

export function classifyCueLabel(
  rawLabel: string,
  positionRatio: number, // 0..1 — position within the track
): HotCueType {
  const label = rawLabel.trim()
  if (label) {
    for (const { type, rx } of PATTERNS) {
      if (rx.test(label)) return type
    }
  }

  // Unlabeled or unrecognised — fall back to positional heuristic with
  // conservative bands. Only the very start / end get auto-typed; the
  // middle stays `custom` so we don't mislabel a bridge as a drop.
  if (positionRatio <= 0.08) return 'intro'
  if (positionRatio >= 0.92) return 'outro'
  return 'custom'
}

// Rekordbox cue colour codes (RGB int tuple → hex). Useful for preserving
// the DJ's visual coding when importing.
export function rgbToHex(r?: string | null, g?: string | null, b?: string | null): string | undefined {
  if (!r && !g && !b) return undefined
  const ri = Number(r ?? 0)
  const gi = Number(g ?? 0)
  const bi = Number(b ?? 0)
  if (Number.isNaN(ri) || Number.isNaN(gi) || Number.isNaN(bi)) return undefined
  const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return `#${h(ri)}${h(gi)}${h(bi)}`
}
