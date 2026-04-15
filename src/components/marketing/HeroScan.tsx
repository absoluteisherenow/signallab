'use client'

// ── HeroScan ────────────────────────────────────────────────────────────────
// Looping CSS animation of the Broadcast Lab scan verdict.
// BRT styling: Circoloco red accent, Helvetica 900 uppercase labels, DM Mono
// values. The "illustrative" tag stays visible at all times so we never imply
// the numbers are anyone's actual scores.
//
// Top box: crosshair + corner ticks + gridded scan surface with a red sweep
// line that actually travels top-to-bottom (uses `top: 0% → 100%` keyframes —
// the old `translateY(2200%)` only moved 22px because the parent was 1px tall).
//
// Cycle (timings inside @keyframes below):
//   0.00s  panel + 4 empty score rows visible, sweep line at top
//   0.30s  sweep line travels top to bottom
//   1.00s  REACH bar fills to 82, verdict text slides in
//   1.50s  AUTHENTICITY bar fills to 74, verdict text slides in
//   2.00s  CULTURE bar fills to 91, verdict text slides in
//   2.50s  VISUAL IDENTITY bar fills to 88, verdict text slides in
//   3.20s  footer row appears (CROP, POST, RANK)
//   4.00s  pause for read
//   6.00s  loop

import { BRT } from '@/lib/design/brt'

interface ScoreRow {
  label: string
  value: number
  verdict: string
  delayMs: number
}

const ROWS: ScoreRow[] = [
  { label: 'REACH',            value: 82, verdict: 'scroll-stop in three seconds',   delayMs: 1000 },
  { label: 'AUTHENTICITY',     value: 74, verdict: 'reads as your room, not theirs', delayMs: 1500 },
  { label: 'CULTURE',          value: 91, verdict: 'underground, not festival',      delayMs: 2000 },
  { label: 'VISUAL IDENTITY',  value: 88, verdict: 'on-palette for the catalogue',   delayMs: 2500 },
]

export default function HeroScan() {
  return (
    <div
      className="relative w-full max-w-[400px] mx-auto"
      aria-hidden="true"
    >
      {/* Outer panel */}
      <div
        className="p-4 md:p-5 relative overflow-hidden"
        style={{ background: BRT.ticket, border: `1px solid ${BRT.divide}` }}
      >
        {/* ── Header row ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4 font-mono">
          <div className="text-[10px] tracking-[0.28em] uppercase" style={{ color: BRT.red }}>
            Broadcast Lab <span style={{ color: BRT.inkDim }}>//</span> Scan
          </div>
          <div className="flex items-center gap-2 text-[9px] tracking-[0.26em] uppercase" style={{ color: BRT.inkDim }}>
            <span
              className="block h-1.5 w-1.5 hero-scan-pulse"
              style={{ background: BRT.red }}
            />
            Live
          </div>
        </div>

        {/* ── Scan surface + sweep line ──────────────────────────────────── */}
        <div
          className="relative aspect-[4/3] overflow-hidden mb-4"
          style={{ background: BRT.bg, border: `1px solid ${BRT.divide}` }}
        >
          {/* Grid dot pattern — brutalist "scan surface" look */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(${BRT.divide} 1px, transparent 1px)`,
              backgroundSize: '18px 18px',
              opacity: 0.6,
            }}
          />

          {/* Faint red spotlight — hints at a subject without faking a photo */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 60%, rgba(255,42,26,0.14) 0%, rgba(5,5,5,0) 50%)',
            }}
          />

          {/* Corner ticks — brutalist viewfinder */}
          <CornerTick position="tl" />
          <CornerTick position="tr" />
          <CornerTick position="bl" />
          <CornerTick position="br" />

          {/* Centre crosshair */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hero-scan-crosshair"
            style={{ width: 28, height: 28 }}
          >
            <div
              className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2"
              style={{ width: 1, background: BRT.red }}
            />
            <div
              className="absolute top-1/2 left-0 right-0 -translate-y-1/2"
              style={{ height: 1, background: BRT.red }}
            />
          </div>

          {/* Sweep line — uses top% (not translateY) so it travels the full height */}
          <div
            className="absolute left-0 right-0 hero-scan-sweep"
            style={{ height: 2, background: `linear-gradient(90deg, transparent, ${BRT.red}, transparent)`, boxShadow: `0 0 12px ${BRT.red}` }}
          />

          {/* Classification text — animates in once the sweep has finished */}
          <div className="absolute bottom-4 left-4 hero-scan-label font-mono text-[9px] tracking-[0.3em] uppercase" style={{ color: BRT.red }}>
            ✓ Classified
          </div>

          {/* illustrative tag */}
          <div
            className="absolute bottom-2 right-2 font-mono text-[7px] tracking-[0.32em] uppercase"
            style={{ color: BRT.inkDim }}
          >
            Illustrative
          </div>
        </div>

        {/* ── Score rows ─────────────────────────────────────────────────── */}
        <div className="space-y-3">
          {ROWS.map((row, i) => (
            <ScoreLine key={row.label} row={row} index={i} />
          ))}
        </div>

        {/* ── Footer row ─────────────────────────────────────────────────── */}
        <div
          className="mt-5 hero-scan-footer flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] tracking-[0.22em] uppercase pt-4"
          style={{ borderTop: `1px solid ${BRT.divide}`, color: BRT.inkSoft }}
        >
          <span>Crop 4:5 for reels</span>
          <span style={{ color: BRT.inkDim }}>·</span>
          <span>Post Thurs 21:00</span>
          <span style={{ color: BRT.inkDim }}>·</span>
          <span style={{ color: BRT.red }}>Rank #1 of tonight</span>
        </div>
      </div>

      {/* All keyframes + animations live in one plain <style> tag. styled-jsx
          silently drops dynamic interpolations inside @keyframes bodies, which
          is why the row-specific bar/value/verdict animations use hardcoded
          percentages below. Four ROWS at delays 1000/1500/2000/2500ms in a 6s
          cycle → start 16.67/25/33.33/41.67%, fill-end +6, verdict-start +4. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes heroScanSweep {
          0%   { top: 0%;    opacity: 0; }
          4%   { opacity: 1; }
          30%  { top: 100%;  opacity: 1; }
          32%  { opacity: 0; }
          100% { top: 100%;  opacity: 0; }
        }
        @keyframes heroScanPulse {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }
        @keyframes heroScanCrosshair {
          0%, 30%   { opacity: 0.25; transform: translate(-50%, -50%) scale(0.9); }
          35%, 100% { opacity: 1;    transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes heroScanLabel {
          0%, 45%    { opacity: 0; transform: translateY(4px); }
          50%, 95%   { opacity: 1; transform: translateY(0); }
          100%       { opacity: 0; transform: translateY(4px); }
        }
        @keyframes heroScanFooter {
          0%, 53%   { opacity: 0; transform: translateY(4px); }
          60%, 95%  { opacity: 1; transform: translateY(0); }
          100%      { opacity: 0; transform: translateY(4px); }
        }

        /* Row 0 — REACH, starts 16.67%, fills by 22.67% */
        @keyframes heroScanBar0 {
          0%, 16.67%          { transform: scaleX(0); }
          22.67%, 100%        { transform: scaleX(1); }
        }
        @keyframes heroScanValue0 {
          0%, 16.67%          { opacity: 0; }
          22.67%, 100%        { opacity: 1; }
        }
        @keyframes heroScanVerdict0 {
          0%, 20.67%          { opacity: 0; transform: translateX(-4px); }
          24.67%, 100%        { opacity: 1; transform: translateX(0); }
        }
        /* Row 1 — AUTHENTICITY, starts 25%, fills by 31% */
        @keyframes heroScanBar1 {
          0%, 25%             { transform: scaleX(0); }
          31%, 100%           { transform: scaleX(1); }
        }
        @keyframes heroScanValue1 {
          0%, 25%             { opacity: 0; }
          31%, 100%           { opacity: 1; }
        }
        @keyframes heroScanVerdict1 {
          0%, 29%             { opacity: 0; transform: translateX(-4px); }
          33%, 100%           { opacity: 1; transform: translateX(0); }
        }
        /* Row 2 — CULTURE, starts 33.33%, fills by 39.33% */
        @keyframes heroScanBar2 {
          0%, 33.33%          { transform: scaleX(0); }
          39.33%, 100%        { transform: scaleX(1); }
        }
        @keyframes heroScanValue2 {
          0%, 33.33%          { opacity: 0; }
          39.33%, 100%        { opacity: 1; }
        }
        @keyframes heroScanVerdict2 {
          0%, 37.33%          { opacity: 0; transform: translateX(-4px); }
          41.33%, 100%        { opacity: 1; transform: translateX(0); }
        }
        /* Row 3 — VISUAL IDENTITY, starts 41.67%, fills by 47.67% */
        @keyframes heroScanBar3 {
          0%, 41.67%          { transform: scaleX(0); }
          47.67%, 100%        { transform: scaleX(1); }
        }
        @keyframes heroScanValue3 {
          0%, 41.67%          { opacity: 0; }
          47.67%, 100%        { opacity: 1; }
        }
        @keyframes heroScanVerdict3 {
          0%, 45.67%          { opacity: 0; transform: translateX(-4px); }
          49.67%, 100%        { opacity: 1; transform: translateX(0); }
        }

        .hero-scan-sweep  { top: 0%; animation: heroScanSweep 6s ease-in-out infinite; }
        .hero-scan-pulse  { animation: heroScanPulse 2s ease-in-out infinite; }
        .hero-scan-crosshair { animation: heroScanCrosshair 6s ease-in-out infinite; }
        .hero-scan-label  { opacity: 0; animation: heroScanLabel 6s ease-in-out infinite; }
        .hero-scan-footer { opacity: 0; animation: heroScanFooter 6s ease-in-out infinite; }

        .hero-scan-bar    { transform-origin: left center; transform: scaleX(0); }
        .hero-scan-value  { opacity: 0; }
        .hero-scan-verdict{ opacity: 0; }

        .hero-scan-row-0 .hero-scan-bar    { animation: heroScanBar0    6s ease-out infinite; }
        .hero-scan-row-0 .hero-scan-value  { animation: heroScanValue0  6s ease-out infinite; }
        .hero-scan-row-0 .hero-scan-verdict{ animation: heroScanVerdict0 6s ease-out infinite; }
        .hero-scan-row-1 .hero-scan-bar    { animation: heroScanBar1    6s ease-out infinite; }
        .hero-scan-row-1 .hero-scan-value  { animation: heroScanValue1  6s ease-out infinite; }
        .hero-scan-row-1 .hero-scan-verdict{ animation: heroScanVerdict1 6s ease-out infinite; }
        .hero-scan-row-2 .hero-scan-bar    { animation: heroScanBar2    6s ease-out infinite; }
        .hero-scan-row-2 .hero-scan-value  { animation: heroScanValue2  6s ease-out infinite; }
        .hero-scan-row-2 .hero-scan-verdict{ animation: heroScanVerdict2 6s ease-out infinite; }
        .hero-scan-row-3 .hero-scan-bar    { animation: heroScanBar3    6s ease-out infinite; }
        .hero-scan-row-3 .hero-scan-value  { animation: heroScanValue3  6s ease-out infinite; }
        .hero-scan-row-3 .hero-scan-verdict{ animation: heroScanVerdict3 6s ease-out infinite; }
      ` }} />
    </div>
  )
}

// ── CornerTick: brutalist viewfinder corner bracket ─────────────────────────
function CornerTick({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const size = 14
  const pos: Record<string, React.CSSProperties> = {
    tl: { top: 10, left: 10,    borderTop: `1px solid ${BRT.red}`, borderLeft:  `1px solid ${BRT.red}` },
    tr: { top: 10, right: 10,   borderTop: `1px solid ${BRT.red}`, borderRight: `1px solid ${BRT.red}` },
    bl: { bottom: 10, left: 10, borderBottom:`1px solid ${BRT.red}`, borderLeft:  `1px solid ${BRT.red}` },
    br: { bottom: 10, right: 10,borderBottom:`1px solid ${BRT.red}`, borderRight: `1px solid ${BRT.red}` },
  }
  return (
    <div
      className="absolute"
      style={{ width: size, height: size, ...pos[position] }}
    />
  )
}

// ── ScoreLine: animated row with label, bar, value, verdict ──────────────
// The `hero-scan-row-{index}` class hooks into keyframes defined in HeroScan's
// parent <style> block (see note there — styled-jsx drops dynamic values).
function ScoreLine({ row, index }: { row: ScoreRow; index: number }) {
  return (
    <div
      className={`hero-scan-row-${index} grid grid-cols-[100px_1fr_32px] items-center gap-2 md:gap-3 font-mono text-[10px] tracking-[0.2em] uppercase`}
      style={{ color: BRT.inkSoft }}
    >
      <div>{row.label}</div>
      <div className="relative h-[6px]" style={{ background: BRT.divide }}>
        <div
          className="absolute inset-y-0 left-0 hero-scan-bar"
          style={{ width: `${row.value}%`, background: BRT.red }}
        />
      </div>
      <div className="text-right font-bold hero-scan-value" style={{ color: BRT.red }}>
        {row.value}
      </div>
      <div
        className="col-start-2 col-span-2 text-[10px] hero-scan-verdict lowercase tracking-[0.08em]"
        style={{ color: BRT.inkSoft }}
      >
        {row.verdict}
      </div>
    </div>
  )
}
