// ── MomentCard ──────────────────────────────────────────────────────────────
// BRT ticket-style card for the "five hero moments" section. Helvetica 900
// uppercase moment line, Helvetica Neue labels, red accent only. Carries a LIVE/BETA
// tag — never let an unbuilt feature wear LIVE.

import { BRT } from '@/lib/design/brt'

const DISPLAY = '"Helvetica Neue", Helvetica, Arial, sans-serif'

interface MomentCardProps {
  moment: string             // headline copy, kept short
  labs: string[]             // 1 or 2 lab names, e.g. ['BROADCAST LAB']
  status: 'LIVE' | 'BETA'    // honest production state
  detail?: string            // optional sub-line under the moment
  className?: string         // optional — for col-span in asymmetric grids
}

export default function MomentCard({ moment, labs, status, detail, className = '' }: MomentCardProps) {
  const isLive = status === 'LIVE'
  return (
    <div
      className={`p-6 md:p-8 flex flex-col gap-5 h-full min-h-[220px] relative ${className}`}
      style={{ background: BRT.ticket }}
    >
      {/* Top row: lab tags + status pill */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 font-mono">
          {labs.map(lab => (
            <span
              key={lab}
              className="text-[10px] tracking-[0.28em] uppercase"
              style={{ color: BRT.red }}
            >
              {lab}
            </span>
          ))}
        </div>
        <span
          className="font-mono text-[9px] tracking-[0.32em] px-2.5 py-1 uppercase"
          style={{
            color: isLive ? BRT.ink : BRT.inkDim,
            border: `1px solid ${isLive ? BRT.ink : BRT.inkDim}`,
          }}
        >
          {status}
        </span>
      </div>

      {/* Headline — Helvetica 900 uppercase */}
      <p
        className="font-black uppercase flex-1 leading-[0.95] tracking-[-0.035em]"
        style={{
          fontFamily: DISPLAY,
          fontSize: 'clamp(20px, 1.9vw, 26px)',
          color: BRT.ink,
        }}
      >
        {moment}
      </p>

      {/* Optional detail line */}
      {detail && (
        <p
          className="font-mono text-[11px] md:text-[12px] leading-[1.6] mt-auto"
          style={{ color: BRT.inkSoft }}
        >
          {detail}
        </p>
      )}
    </div>
  )
}
