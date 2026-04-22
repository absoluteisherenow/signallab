// Soft-flag: does the generated output contradict any `watch_outs` string
// listed on an active narrative thread? Matches literal substrings (case
// insensitive) — keeps the check deterministic and the detail messages
// explainable ("watch-out 'pre-recorded stems' matched literally").
//
// We don't try to run semantic contradiction detection here (too expensive +
// false-positives). Watch-outs authored as "no pre-recorded stems" should be
// phrased as the thing to catch, not the thing to say. In the rare case the
// artist legitimately IS using pre-recorded stems that week, they override
// by editing the thread or archiving it — the check prompts them to look.

import type { OutputCheckFn } from '../types'

function normalise(s: string): string {
  return s.toLowerCase()
}

export const threadConsistency: OutputCheckFn = (output, ctx) => {
  // Threads live on ctx via the extended operating context. When not loaded
  // (e.g. task without applicable threads), the check is a no-op pass.
  const threads = (ctx as any).narrative_threads as
    | Array<{ slug: string; title: string; watch_outs: string[] }>
    | undefined
  if (!threads || !threads.length) return { passed: true }

  const lo = normalise(output)
  const hits: string[] = []
  for (const t of threads) {
    for (const w of t.watch_outs || []) {
      if (!w) continue
      if (lo.includes(normalise(w))) {
        hits.push(`${t.slug} watch-out "${w}"`)
      }
    }
  }
  return hits.length
    ? { passed: false, detail: `possible narrative contradiction: ${hits.join('; ')}` }
    : { passed: true }
}
