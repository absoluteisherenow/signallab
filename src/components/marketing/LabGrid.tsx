// ── LabGrid ─────────────────────────────────────────────────────────────────
// Five-card grid for the labs inventory. BRT ticket cards with hairline gutters.
// Red accent only. Honest copy — every lab is live in production today.
//
// Labs match /brt: Tour, Broadcast, Set, SONIX, Drop. No Audience, no Deep Dive
// as a sixth tile — Deep Dive lives inside Broadcast Lab as a feature, not a
// standalone lab.

import { BRT } from '@/lib/design/brt'

const DISPLAY = '"Helvetica Neue", Helvetica, Arial, sans-serif'

interface Lab {
  name: string
  tagline: string         // short verb phrase
  definition: string      // one-sentence honest definition
  bullets: string[]       // 3 short bullets
}

const LABS: Lab[] = [
  {
    name: 'Tour Lab',
    tagline: 'Run the business.',
    definition: 'Gigs, contracts, invoices, advancing. The business side, handled.',
    bullets: ['Automatic booking intake', 'Invoice + advancing drafts', 'Travel logistics'],
  },
  {
    name: 'Broadcast Lab',
    tagline: 'Own the narrative.',
    definition: 'Content intelligence, captions tuned to your voice, scheduling, trend detection.',
    bullets: ['Four-axis scan verdict', 'Voice-matched captions', 'Calendar + scheduling'],
  },
  {
    name: 'Set Lab',
    tagline: 'Prepare the set.',
    definition: 'Track library, crate digging, Rekordbox sync, set building.',
    bullets: ['Crate Dig via Discogs', 'Rekordbox sync', 'Set builder + waveform'],
  },
  {
    name: 'SONIX Lab',
    tagline: 'Production analysis.',
    definition: 'Mix chain analysis, production workflow, frequency and structure data, VST plugin.',
    bullets: ['FFT + spectral analysis', 'Reference track intel', 'Max for Live plugin'],
  },
  {
    name: 'Drop Lab',
    tagline: 'Ship the music.',
    definition: 'Release campaigns drafted from your own feed data. Captions, phasing, shoot list, promo, DM replies.',
    bullets: ['Campaign + shoot list', 'Built from your feed', 'Promo + DM replies'],
  },
]

export default function LabGrid() {
  return (
    <div
      className="grid gap-px sm:grid-cols-2 lg:grid-cols-6"
      style={{ background: BRT.divide, border: `1px solid ${BRT.divide}` }}
    >
      {LABS.map((lab, i) => (
        <div
          key={lab.name}
          className={`p-5 md:p-6 flex flex-col gap-3 relative min-h-[220px] ${
            i < 3 ? 'lg:col-span-2' : 'lg:col-span-3'
          }`}
          style={{ background: BRT.ticket }}
        >
          {/* Index + tagline row */}
          <div className="flex items-center justify-between font-mono">
            <span
              className="text-[11px] tracking-[0.32em] uppercase"
              style={{ color: BRT.red }}
            >
              0{i + 1} / {LABS.length}
            </span>
            <span
              className="text-[10px] tracking-[0.28em] uppercase"
              style={{ color: BRT.inkDim }}
            >
              {lab.tagline}
            </span>
          </div>

          {/* Lab name — Helvetica 900 */}
          <div
            className="font-black uppercase tracking-[-0.04em] leading-[0.9]"
            style={{
              fontFamily: DISPLAY,
              fontSize: 'clamp(28px, 2.8vw, 42px)',
              color: BRT.ink,
            }}
          >
            {lab.name}
          </div>

          {/* Definition */}
          <div
            className="font-mono text-[12px] md:text-[13px] leading-[1.6]"
            style={{ color: BRT.inkSoft }}
          >
            {lab.definition}
          </div>

          {/* Bullets */}
          <ul
            className="font-mono space-y-1.5 text-[10px] tracking-[0.1em] uppercase mt-auto pt-3"
            style={{ borderTop: `1px solid ${BRT.divide}`, color: BRT.inkSoft }}
          >
            {lab.bullets.map(b => (
              <li key={b} className="flex gap-3 items-center">
                <span className="shrink-0" style={{ color: BRT.red }}>■</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
