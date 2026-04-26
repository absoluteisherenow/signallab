'use client'
// Live 4-tier pricing — Creator / Artist / Pro / Road. Gig cap is the headline
// value lever; cost-per-gig at cap is the anchor. All labs are included on
// every tier — differentiation is purely volume (gigs, scans, deep dives,
// artist scans). Creator's gig cap is intentionally LIFETIME (1 gig) so
// artists can run one real show through the system before subscribing
// month-to-month. No AI mentions per house rule.

import { BRT } from '@/lib/design/brt'
import CheckoutButton from './CheckoutButton'

const DISPLAY = '"Helvetica Neue", Helvetica, Arial, sans-serif'

interface Tier {
  id: 'creator' | 'artist' | 'pro' | 'road'
  name: string
  price: string
  perGig: string          // £/gig at cap — the anchor
  gigs: string            // headline cap line
  whoFor: string
  wowAnchor: string
  features: string[]
  limits: { label: string; value: string }[]
  featured?: boolean
}

const TIERS: Tier[] = [
  {
    id: 'creator',
    name: 'Creator',
    price: '£29',
    perGig: '1 gig to try the whole system',
    gigs: '1 gig (lifetime)',
    whoFor: 'New artists. Releasing music. One real show coming up.',
    wowAnchor: 'Run one real gig end-to-end. See if the system earns its keep.',
    features: [
      'All Labs included',
      'Tour Lab: advancing, invoices, day-of run sheet',
      'Set Lab: full library + Crate Dig',
      'SONIX Lab: Compose + Arrange',
      'Broadcast: scanner + captions',
      'Drop: single release flow',
    ],
    limits: [
      { label: 'Gigs',        value: '1 lifetime' },
      { label: 'Scans',       value: '20 / mo' },
      { label: 'Deep Dive',   value: '1 / 90 days' },
      { label: 'Artist Scan', value: '5 / mo' },
    ],
  },
  {
    id: 'artist',
    name: 'Artist',
    price: '£59',
    perGig: '£29.50 / gig at cap',
    gigs: '2 gigs / month',
    whoFor: 'Touring occasionally. Real content rhythm.',
    wowAnchor: 'A whole gig advanced, invoiced, posted about — for the cost of one beer.',
    featured: true,
    features: [
      'All Labs included',
      'Everything in Creator',
      'Broadcast: full calendar + content strategy',
      'SONIX: Mixdown + Max for Live',
      'Drop: full campaign + promo contacts',
      'Crew briefing drafts + SMS approval',
    ],
    limits: [
      { label: 'Gigs',        value: '2 / mo' },
      { label: 'Scans',       value: '60 / mo' },
      { label: 'Deep Dive',   value: '1 / month' },
      { label: 'Artist Scan', value: '15 / mo' },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '£99',
    perGig: '£19.80 / gig at cap',
    gigs: '5 gigs / month',
    whoFor: 'Working DJs with a steady booking calendar.',
    wowAnchor: 'Five gigs a month, advanced and invoiced. Save data on every post.',
    features: [
      'All Labs included',
      'Everything in Artist',
      'Two artist aliases',
      'Team access: manager, photographer, content lead',
      'Multi-currency invoicing',
      'White-label advance emails',
    ],
    limits: [
      { label: 'Gigs',        value: '5 / mo' },
      { label: 'Scans',       value: '150 / mo' },
      { label: 'Deep Dive',   value: '2 / month' },
      { label: 'Artist Scan', value: '40 / mo' },
    ],
  },
  {
    id: 'road',
    name: 'Road',
    price: '£199',
    perGig: '£18 / gig at 11. Free past that.',
    gigs: 'Unlimited gigs',
    whoFor: 'Heavy touring. Festival summers. Every weekend a different city.',
    wowAnchor: 'Stop counting gigs. Run as many as the calendar holds.',
    features: [
      'All Labs included',
      'Everything in Pro',
      'Unlimited gigs',
      'Highest scan + deep dive ceilings',
      'Priority email support',
    ],
    limits: [
      { label: 'Gigs',        value: 'unlimited' },
      { label: 'Scans',       value: '400 / mo' },
      { label: 'Deep Dive',   value: '8 / month' },
      { label: 'Artist Scan', value: '100 / mo' },
    ],
  },
]

export default function PricingGridLive() {
  return (
    <>
      <div
        className="grid gap-px lg:grid-cols-4"
        style={{ background: BRT.divide, border: `1px solid ${BRT.divide}` }}
      >
        {TIERS.map(tier => (
          <div
            key={tier.id}
            className="p-7 md:p-9 flex flex-col relative"
            style={{ background: tier.featured ? BRT.ticketHi : BRT.ticket }}
          >
            {tier.featured && (
              <div className="absolute top-0 left-0 right-0" style={{ background: BRT.red, height: 3 }} />
            )}

            <div className="flex items-center justify-between gap-4 font-mono">
              <div className="text-[11px] uppercase tracking-[0.32em]" style={{ color: tier.featured ? BRT.red : BRT.inkDim }}>
                {tier.name}
              </div>
              {tier.featured && (
                <div className="px-2.5 py-1 text-[9px] uppercase tracking-[0.28em]" style={{ background: BRT.red, color: BRT.ink }}>
                  Most popular
                </div>
              )}
            </div>

            <div className="mt-7 flex items-baseline gap-2">
              <div
                className="font-black tracking-[-0.04em] leading-none"
                style={{ fontFamily: DISPLAY, fontSize: 'clamp(48px, 5.6vw, 76px)', color: BRT.ink }}
              >
                {tier.price}
              </div>
              <div className="font-mono text-[11px] uppercase tracking-[0.24em]" style={{ color: BRT.inkDim }}>
                / mo
              </div>
            </div>

            {/* Headline gig cap — the value lever */}
            <div
              className="mt-5 font-black uppercase tracking-[-0.01em] leading-[1.1]"
              style={{ fontFamily: DISPLAY, fontSize: 'clamp(20px, 1.8vw, 24px)', color: BRT.ink }}
            >
              {tier.gigs}
            </div>
            {/* Cost-per-gig anchor */}
            <div className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: BRT.red }}>
              {tier.perGig}
            </div>

            <p className="mt-6 font-mono text-[12.5px] leading-[1.6] min-h-[52px]" style={{ color: BRT.inkSoft }}>
              {tier.whoFor}
            </p>

            <div className="mt-5 pl-4 py-2 text-[12.5px] leading-[1.55]" style={{ borderLeft: `2px solid ${BRT.red}`, color: BRT.ink, fontFamily: DISPLAY }}>
              {tier.wowAnchor}
            </div>

            <ul className="mt-6 space-y-2.5 font-mono text-[12px] leading-[1.6] flex-1" style={{ color: BRT.inkSoft }}>
              {tier.features.map(f => (
                <li key={f} className="flex gap-2.5">
                  <span className="shrink-0 text-[10px] leading-tight" style={{ color: BRT.red }}>■</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-7 pt-5 grid grid-cols-2 gap-x-3 gap-y-3 font-mono" style={{ borderTop: `1px solid ${BRT.divide}` }}>
              {tier.limits.map(l => (
                <div key={l.label} className="text-[10px] tracking-[0.18em]">
                  <div className="uppercase" style={{ color: BRT.inkDim }}>{l.label}</div>
                  <div className="mt-1 text-[12px] tracking-[0.04em]" style={{ color: BRT.ink }}>{l.value}</div>
                </div>
              ))}
            </div>

            <CheckoutButton tier={tier.id} featured={tier.featured}>
              Start {tier.name} →
            </CheckoutButton>
          </div>
        ))}
      </div>

      <div
        className="mt-px p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5"
        style={{ background: BRT.ticket, border: `1px solid ${BRT.divide}`, borderTop: 'none' }}
      >
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.32em] mb-2" style={{ color: BRT.red }}>
            Running multiple artists?
          </div>
          <div
            className="font-black uppercase tracking-[-0.02em] leading-[1.15]"
            style={{ fontFamily: DISPLAY, fontSize: 'clamp(20px, 2vw, 26px)', color: BRT.ink }}
          >
            Management tier. Multi-artist dashboard, team access, white-label everything.
          </div>
        </div>
        <a
          href="mailto:hello@signallabos.com?subject=Management%20tier"
          className="shrink-0 px-7 py-4 text-[11px] uppercase tracking-[0.28em] font-mono font-bold text-center whitespace-nowrap"
          style={{ color: BRT.ink, border: `1px solid ${BRT.divide}` }}
        >
          Email us →
        </a>
      </div>
    </>
  )
}
