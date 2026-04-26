// ── /pricing ─────────────────────────────────────────────────────────────────
// Public pricing page. Renders the canonical PricingGrid but with live
// Stripe Checkout CTAs (CheckoutButton) instead of the waitlist anchor.
// When STRIPE_* env vars are missing the API returns 503 and the button
// falls back to a "join waitlist" message.

import { BRT } from '@/lib/design/brt'
import PricingGridLive from '@/components/marketing/PricingGridLive'

const DISPLAY = '"Helvetica Neue", Helvetica, Arial, sans-serif'

export const metadata = {
  title: 'Pricing · Signal Lab OS',
  description: 'Three tiers — Creator, Artist, Pro. Plus Management for multi-artist teams.',
}

export default function PricingPage() {
  return (
    <main style={{ background: BRT.bg, color: BRT.ink, minHeight: '100vh' }}>
      <div className="max-w-[1240px] mx-auto px-6 md:px-10 py-16 md:py-24">
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
          One OS. Three tiers.
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
