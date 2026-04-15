// ── PricingGrid ─────────────────────────────────────────────────────────────
// Three tier cards + Management contact-sales card below. BRT ticket styling,
// hairline gutters, red accent on the featured tier.
//
// Honesty: no DJ Mix scanner (paused), no Ads Manager (not built), no Sonix
// Pro stem-analysis/producer-chain-database (not built). Pro features match
// /brt's verified list.

import { BRT } from '@/lib/design/brt'

const DISPLAY = '"Helvetica Neue", Helvetica, Arial, sans-serif'

interface Tier {
  name: string
  price: string
  whoFor: string
  wowAnchor: string
  features: string[]
  limits: { label: string; value: string }[]
  featured?: boolean
}

const TIERS: Tier[] = [
  {
    name: 'Creator',
    price: '£29',
    whoFor: 'Releasing music. Playing the occasional show.',
    wowAnchor: 'Crate dig your library. Find what you did not know to search for.',
    features: [
      'Tour Lab: gigs, advancing, invoices',
      'Set Lab: full library + Crate Dig',
      'SONIX Lab: Compose + Arrange modes',
      'Broadcast: scanner + captions',
      'Drop: single release, manual promo',
    ],
    limits: [
      { label: 'Scans',       value: '20 / mo' },
      { label: 'Captions',    value: '30 / mo' },
      { label: 'Deep Dive',   value: '1 / 90 days' },
      { label: 'Artist Scan', value: '5 / mo' },
    ],
  },
  {
    name: 'Artist',
    price: '£59',
    whoFor: 'Touring. Running a real content rhythm.',
    wowAnchor: 'Drop a release. Get a ten-post campaign written for you.',
    featured: true,
    features: [
      'Everything in Creator',
      'Broadcast: full calendar, content strategy, unlimited captions',
      'SONIX: Mixdown + Max for Live',
      'Drop: full campaign, promo contacts, opens tracked',
      'Crew briefing drafts + SMS approval',
    ],
    limits: [
      { label: 'Scans',       value: '60 / mo' },
      { label: 'Captions',    value: 'unlimited' },
      { label: 'Deep Dive',   value: '1 / month' },
      { label: 'Artist Scan', value: '15 / mo' },
    ],
  },
  {
    name: 'Pro',
    price: '£99',
    whoFor: 'Established artists with a team behind them.',
    wowAnchor: 'Benchmark against 40 artists a month. Know exactly why their posts save.',
    features: [
      'Everything in Artist',
      'Two artist aliases',
      'Team access: manager, photographer, content lead',
      'Multi-currency invoicing',
      'White-label advance emails',
      'Full listen tracking on promo sends',
      'Follow-up intelligence across the release arc',
    ],
    limits: [
      { label: 'Scans',       value: '150 / mo' },
      { label: 'Captions',    value: 'unlimited' },
      { label: 'Deep Dive',   value: '2 / month' },
      { label: 'Artist Scan', value: '40 / mo' },
    ],
  },
]

export default function PricingGrid() {
  return (
    <>
      {/* Tier cards */}
      <div
        className="grid gap-px lg:grid-cols-3"
        style={{ background: BRT.divide, border: `1px solid ${BRT.divide}` }}
      >
        {TIERS.map(tier => (
          <div
            key={tier.name}
            className="p-9 md:p-11 flex flex-col relative"
            style={{
              background: tier.featured ? BRT.ticketHi : BRT.ticket,
            }}
          >
            {tier.featured && (
              <div
                className="absolute top-0 left-0 right-0"
                style={{ background: BRT.red, height: 3 }}
              />
            )}

            {/* Header row */}
            <div className="flex items-center justify-between gap-4 font-mono">
              <div
                className="text-[11px] uppercase tracking-[0.32em]"
                style={{ color: tier.featured ? BRT.red : BRT.inkDim }}
              >
                {tier.name}
              </div>
              {tier.featured && (
                <div
                  className="px-2.5 py-1 text-[9px] uppercase tracking-[0.28em]"
                  style={{
                    background: BRT.red,
                    color: BRT.ink,
                  }}
                >
                  Most popular
                </div>
              )}
            </div>

            {/* Price — Helvetica 900 */}
            <div className="mt-8 flex items-baseline gap-2">
              <div
                className="font-black tracking-[-0.04em] leading-none"
                style={{
                  fontFamily: DISPLAY,
                  fontSize: 'clamp(64px, 7vw, 92px)',
                  color: BRT.ink,
                }}
              >
                {tier.price}
              </div>
              <div
                className="font-mono text-[11px] uppercase tracking-[0.24em]"
                style={{ color: BRT.inkDim }}
              >
                / mo
              </div>
            </div>

            {/* Who for */}
            <p
              className="mt-6 font-mono text-[13px] leading-[1.7] min-h-[56px]"
              style={{ color: BRT.inkSoft }}
            >
              {tier.whoFor}
            </p>

            {/* Wow anchor */}
            <div
              className="mt-5 pl-5 py-2 text-[13px] leading-[1.6]"
              style={{
                borderLeft: `2px solid ${BRT.red}`,
                color: BRT.ink,
                fontFamily: DISPLAY,
              }}
            >
              {tier.wowAnchor}
            </div>

            {/* Feature list */}
            <ul
              className="mt-7 space-y-3 font-mono text-[12.5px] leading-[1.65] flex-1"
              style={{ color: BRT.inkSoft }}
            >
              {tier.features.map(f => (
                <li key={f} className="flex gap-3">
                  <span className="shrink-0 text-[11px] leading-tight" style={{ color: BRT.red }}>■</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {/* Hard limits row */}
            <div
              className="mt-8 pt-6 grid grid-cols-2 gap-x-3 gap-y-3 font-mono"
              style={{ borderTop: `1px solid ${BRT.divide}` }}
            >
              {tier.limits.map(l => (
                <div key={l.label} className="text-[10px] tracking-[0.18em]">
                  <div className="uppercase" style={{ color: BRT.inkDim }}>{l.label}</div>
                  <div className="mt-1 text-[12px] tracking-[0.04em]" style={{ color: BRT.ink }}>{l.value}</div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <a
              href="#waitlist"
              className="mt-8 px-6 py-4 text-[11px] uppercase tracking-[0.28em] text-center font-mono font-bold transition-colors"
              style={{
                background: tier.featured ? BRT.red : 'transparent',
                border: `1px solid ${tier.featured ? BRT.red : BRT.divide}`,
                color: BRT.ink,
              }}
            >
              Request access →
            </a>
          </div>
        ))}
      </div>

      {/* Management contact-sales card */}
      <div
        className="mt-px p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5"
        style={{
          background: BRT.ticket,
          border: `1px solid ${BRT.divide}`,
          borderTop: 'none',
        }}
      >
        <div>
          <div
            className="font-mono text-[10px] uppercase tracking-[0.32em] mb-2"
            style={{ color: BRT.red }}
          >
            Running multiple artists?
          </div>
          <div
            className="font-black uppercase tracking-[-0.02em] leading-[1.15]"
            style={{
              fontFamily: DISPLAY,
              fontSize: 'clamp(20px, 2vw, 26px)',
              color: BRT.ink,
            }}
          >
            Management tier. Multi-artist dashboard, team access, white-label everything.
          </div>
        </div>
        <a
          href="mailto:hello@signallabos.com?subject=Management%20tier"
          className="shrink-0 px-7 py-4 text-[11px] uppercase tracking-[0.28em] font-mono font-bold text-center whitespace-nowrap"
          style={{
            color: BRT.ink,
            border: `1px solid ${BRT.divide}`,
          }}
        >
          Email us →
        </a>
      </div>
    </>
  )
}
