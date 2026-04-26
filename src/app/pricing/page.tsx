// ── /pricing ─────────────────────────────────────────────────────────────────
// Public pricing page. 4-tier grid (Creator/Artist/Pro/Road) with live Stripe
// Checkout CTAs. When STRIPE_* env vars are missing the API returns 503 and
// the button falls back to a "join waitlist" message.

'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { BRT } from '@/lib/design/brt'
import PricingGridLive from '@/components/marketing/PricingGridLive'

const DISPLAY = '"Helvetica Neue", Helvetica, Arial, sans-serif'

function WelcomeBanner() {
  const params = useSearchParams()
  const welcome = params.get('welcome')
  const cancelled = params.get('status') === 'cancelled'
  if (!welcome && !cancelled) return null
  return (
    <div
      className="mb-10 p-6 md:p-7"
      style={{ background: BRT.ticket, border: `1px solid ${BRT.red}` }}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.32em] mb-2" style={{ color: BRT.red }}>
        {welcome ? 'Welcome' : 'Checkout cancelled'}
      </div>
      <div
        className="font-black uppercase tracking-[-0.02em] leading-[1.1]"
        style={{ fontFamily: DISPLAY, fontSize: 'clamp(20px, 2.4vw, 28px)', color: BRT.ink }}
      >
        {welcome
          ? 'Pick a tier to unlock the labs.'
          : 'No worries. Pick a tier whenever you are ready.'}
      </div>
      <p className="mt-3 font-mono text-[12.5px] leading-[1.7]" style={{ color: BRT.inkSoft }}>
        Every tier includes all Labs. The difference is volume — gigs, scans, deep dives, artist scans.
        Start where you are now and upgrade as your year picks up.
      </p>
    </div>
  )
}

export default function PricingPage() {
  return (
    <main style={{ background: BRT.bg, color: BRT.ink, minHeight: '100vh' }}>
      <div className="max-w-[1240px] mx-auto px-6 md:px-10 py-16 md:py-24">
        <Suspense fallback={null}>
          <WelcomeBanner />
        </Suspense>

        <div
          className="font-mono text-[11px] uppercase tracking-[0.32em]"
          style={{ color: BRT.red }}
        >
          Pricing
        </div>
        <h1
          className="mt-4 font-black uppercase leading-[0.95] tracking-[-0.03em]"
          style={{ fontFamily: DISPLAY, fontSize: 'clamp(44px, 6vw, 84px)' }}
        >
          One OS. Four tiers.
          <br />Cancel any time.
        </h1>
        <p
          className="mt-6 max-w-[640px] font-mono text-[14px] leading-[1.7]"
          style={{ color: BRT.inkSoft }}
        >
          Pay monthly. Real limits below — not a teaser. Upgrade or downgrade from
          your billing portal whenever your touring rhythm changes.
        </p>

        <div className="mt-14">
          <PricingGridLive />
        </div>

        <div className="mt-14 font-mono text-[12px]" style={{ color: BRT.inkDim }}>
          Questions about the right tier? <a href="/help" style={{ color: BRT.ink, textDecoration: 'underline' }}>Get in touch</a>.
        </div>
      </div>
    </main>
  )
}
