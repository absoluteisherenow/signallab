// ── FlowDiagram ─────────────────────────────────────────────────────────────
// Horizontal on desktop, vertical on mobile. Five nodes connected by lines.
// BRT ticket cards with red step numbers and red arrows.
// Tells the "every lab feeds the next" story without scroll-jacking.

import { BRT } from '@/lib/design/brt'

const DISPLAY = '"Helvetica Neue", Helvetica, Arial, sans-serif'

const NODES = [
  'Gig confirmed',
  'Crew brief drafted',
  'Clip scanned',
  'Post scheduled',
  'Debrief feeds the next',
]

export default function FlowDiagram() {
  return (
    <div>
      {/* Desktop: horizontal flow with numbered steps */}
      <div
        className="hidden md:grid grid-cols-5 gap-px"
        style={{ background: BRT.divide, border: `1px solid ${BRT.divide}` }}
      >
        {NODES.map((label, i) => (
          <div
            key={label}
            className="p-7 lg:p-9 flex flex-col gap-5 min-h-[220px] relative"
            style={{ background: BRT.ticket }}
          >
            {/* Step number row */}
            <div className="flex items-center justify-between font-mono">
              <div
                className="text-[11px] tracking-[0.32em] uppercase"
                style={{ color: BRT.red }}
              >
                Step 0{i + 1}
              </div>
              {i < NODES.length - 1 && (
                <span
                  className="text-[18px] absolute right-[-10px] top-1/2 -translate-y-1/2 z-10 px-1"
                  style={{ background: BRT.ticket, color: BRT.red }}
                >
                  →
                </span>
              )}
            </div>

            {/* Label — Helvetica 900 uppercase */}
            <div
              className="font-black uppercase tracking-[-0.03em] leading-[1.05] mt-auto"
              style={{
                fontFamily: DISPLAY,
                fontSize: 'clamp(18px, 1.6vw, 24px)',
                color: BRT.ink,
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile: vertical */}
      <div
        className="md:hidden flex flex-col gap-px"
        style={{ background: BRT.divide, border: `1px solid ${BRT.divide}` }}
      >
        {NODES.map((label, i) => (
          <div
            key={label}
            className="p-6 flex items-center gap-5"
            style={{ background: BRT.ticket }}
          >
            <div
              className="font-black shrink-0 w-[56px]"
              style={{
                fontFamily: DISPLAY,
                fontSize: 28,
                color: BRT.red,
              }}
            >
              0{i + 1}
            </div>
            <div
              className="font-black uppercase tracking-[-0.02em] leading-[1.15] flex-1"
              style={{
                fontFamily: DISPLAY,
                fontSize: 18,
                color: BRT.ink,
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      <p
        className="mt-10 text-center font-mono text-[13px] md:text-[14px] leading-[1.7] max-w-[520px] mx-auto"
        style={{ color: BRT.inkSoft }}
      >
        Every lab feeds the next. That is the product.
      </p>
    </div>
  )
}
