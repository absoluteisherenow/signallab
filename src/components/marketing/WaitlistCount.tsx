// ── WaitlistCount ───────────────────────────────────────────────────────────
// Server component. Honest social proof. If the real count is under 50, we
// suppress the number and show a personal-onboarding line instead. We never
// fabricate the number.
// BRT styling: red dot, DM Mono uppercase.

import { BRT } from '@/lib/design/brt'

const SUPPRESS_BELOW = 50

async function fetchCount(): Promise<number | null> {
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || ''
    const url  = base ? `${base}/api/waitlist/count` : '/api/waitlist/count'
    const res  = await fetch(url, { next: { revalidate: 60 } })
    if (!res.ok) return null
    const json = await res.json()
    return typeof json.count === 'number' ? json.count : null
  } catch {
    return null
  }
}

export default async function WaitlistCount() {
  const count = await fetchCount()

  // Suppress if missing or below threshold — never invent a number.
  if (count === null || count < SUPPRESS_BELOW) {
    return (
      <div
        className="flex items-center gap-2 font-mono text-[10px] tracking-[0.28em] uppercase"
        style={{ color: BRT.inkDim }}
      >
        <span
          className="block h-1.5 w-1.5"
          style={{ background: BRT.red }}
        />
        Private beta <span style={{ color: BRT.inkDim }}>·</span> small groups <span style={{ color: BRT.inkDim }}>·</span> no spam
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-2 font-mono text-[10px] tracking-[0.28em] uppercase"
      style={{ color: BRT.inkDim }}
    >
      <span
        className="block h-1.5 w-1.5"
        style={{ background: BRT.red }}
      />
      <span style={{ color: BRT.ink }}>{count.toLocaleString('en-GB')} artists on the list</span>
      <span style={{ color: BRT.inkDim }}>·</span>
      Private beta
    </div>
  )
}
