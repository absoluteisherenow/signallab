// ── Rekordbox cue extraction ─────────────────────────────────────────────────
// Rekordbox XML stores cues as POSITION_MARK children of each TRACK:
//
//   <POSITION_MARK Name="Intro"  Type="0" Start="0.000"   Num="0"
//                  Red="40" Green="226" Blue="20" />
//   <POSITION_MARK Name="Drop"   Type="0" Start="32.000"  Num="1" />
//   <POSITION_MARK Name=""       Type="4" Start="0.000"
//                  End="32.000"  Num="0" />
//
// Type 0 = hot/memory cue (single position). Type 4 = loop (has End).
// We import only Type 0 for now — loops go in a separate future slot.
// ─────────────────────────────────────────────────────────────────────────────

import type { HotCue } from './types'
import { classifyCueLabel, rgbToHex } from './cueClassify'

// DOMParser / Element are not universal (worker vs browser). Accept any
// minimally-Element-like input so this same function runs in either env.
export interface MinimalElement {
  getAttribute(name: string): string | null
  querySelectorAll(selectors: string): ArrayLike<MinimalElement>
}

export function extractCuesFromTrack(
  track: MinimalElement,
  trackDurationSec: number,
): HotCue[] {
  const marks = track.querySelectorAll('POSITION_MARK')
  const cues: HotCue[] = []

  for (let i = 0; i < marks.length; i++) {
    const m = marks[i] as MinimalElement
    const typeAttr = m.getAttribute('Type') ?? ''
    if (typeAttr !== '0') continue // skip loops for now

    const startStr = m.getAttribute('Start')
    if (!startStr) continue
    const startSec = Number(startStr)
    if (!Number.isFinite(startSec) || startSec < 0) continue

    const position_ms = Math.round(startSec * 1000)
    const rawLabel = (m.getAttribute('Name') ?? '').trim()
    const positionRatio = trackDurationSec > 0 ? startSec / trackDurationSec : 0
    const type = classifyCueLabel(rawLabel, positionRatio)

    const numAttr = m.getAttribute('Num') ?? ''
    const slotLabel = numAttr && numAttr !== '-1' ? `Cue ${Number(numAttr) + 1}` : 'Cue'
    const label = rawLabel || slotLabel

    cues.push({
      position_ms,
      label,
      type,
      source: 'rekordbox',
      confidence: 1,
      color: rgbToHex(m.getAttribute('Red'), m.getAttribute('Green'), m.getAttribute('Blue')),
    })
  }

  // De-duplicate cues within 250ms of each other at the same position_ms
  // (Rekordbox sometimes writes both a memory cue and a hot cue at the
  // same point — we want one entry).
  cues.sort((a, b) => a.position_ms - b.position_ms)
  const deduped: HotCue[] = []
  for (const c of cues) {
    const last = deduped[deduped.length - 1]
    if (last && Math.abs(last.position_ms - c.position_ms) < 250 && last.type === c.type) continue
    deduped.push(c)
  }
  return deduped
}
