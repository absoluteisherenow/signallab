// ── Marketing page (canonical /) ────────────────────────────────────────────
// BRT design language (src/lib/design/brt.ts). Helvetica 900 uppercase display,
// DM Mono body, Circoloco red accent, ticket-style cards with hairline gutters.
// Composed of the canonical /brt sections + the new additions from the plan:
// 5 hero moments with LIVE/BETA honesty, animated scan demo, 3-field waitlist,
// live count, flow diagram, hard pricing limits, closing slab.

import { BRT } from '@/lib/design/brt'
import HeroScan from '@/components/marketing/HeroScan'
import MomentCard from '@/components/marketing/MomentCard'
import FlowDiagram from '@/components/marketing/FlowDiagram'
import LabGrid from '@/components/marketing/LabGrid'
// PricingGrid intentionally NOT imported — pricing is hidden during private beta.
// Tier logic + PricingGrid component are still in the codebase ready to wire back in.
import WaitlistForm from '@/components/marketing/WaitlistForm'
import WaitlistCount from '@/components/marketing/WaitlistCount'

const DISPLAY = '"Helvetica Neue", Helvetica, Arial, sans-serif'

export const metadata = {
  title: 'Signal Lab OS · Your gigs. Your content. Your music. One OS.',
  description:
    'Tour management, content scheduling, production analysis, DJ set prep, release management. One system, built for electronic music artists.',
}

// ── Five hero moments ───────────────────────────────────────────────────────
// Every entry is live or beta in production today. No aspirational copy.
const MOMENTS = [
  {
    moment: 'Upload a clip. Know it will scroll-stop before you post.',
    detail: 'Four scores back in seconds: reach, authenticity, culture, visual identity. Plus the crop, the time, the rank against every other post going up tonight. The post flies or it does not, before you commit.',
    labs: ['BROADCAST LAB'],
    status: 'LIVE' as const,
  },
  {
    moment: 'Find the hidden gems behind the tracks you already love.',
    detail: 'Crate Dig walks Discogs across the artist, the label, the year, the style. The deep cuts, the forgotten B-sides, the records you would never find searching by name.',
    labs: ['SET LAB'],
    status: 'LIVE' as const,
  },
  {
    moment: 'Night before the gig. Content crew get briefed.',
    detail: 'Brief approved over SMS. Crew get a direct upload link. Every clip they send scans on arrival and comes back as a suggested post, ready for you to approve.',
    labs: ['TOUR LAB', 'BROADCAST LAB'],
    status: 'LIVE' as const,
  },
  {
    moment: 'Booking lands. Invoice, gig, advancing all drafted automatically.',
    detail: 'The dates, the fee, the venue, the rider notes. Pulled from the email the moment it arrives. Everything drafted. You verify and confirm.',
    labs: ['TOUR LAB'],
    status: 'BETA' as const,
  },
  {
    moment: 'Release date in. A proven campaign built from your feed. Shoot list included.',
    detail: 'Every caption, every phase, every DM reply drafted. Plus the shoot list: what to capture, what angle, when to post. Drawn from your save rate, your last releases, your audience. You approve. You shoot.',
    labs: ['DROP LAB'],
    status: 'BETA' as const,
  },
]

// ── Stats strip (hero) ──────────────────────────────────────────────────────
// Pricing is hidden during private beta — all four tiles are non-price facts
// about the product's positioning, not money claims.
const STATS: [string, string][] = [
  ['5 LABS', 'Tour · Broadcast · Set · SONIX · Drop'],
  ['1 SYSTEM', 'Replaces 5+ apps'],
  ['PRIVATE BETA', 'By invite · personal onboarding'],
  ['APPROVAL-FIRST', 'Nothing goes out without your yes'],
]

// ── FAQ ─────────────────────────────────────────────────────────────────────
// Three questions. First comes from /brt's core pitch. Second reassures the
// post-signup path. Third addresses the "too early to join" objection.
const FAQS = [
  {
    q: 'Why one system instead of five apps?',
    a: 'Because every app you bolt on is another login, another export, another thing that knows nothing about the others. One system means the gig you just confirmed shows up in the brief, in the invoice, in the campaign. Without you forwarding anything.',
  },
  {
    q: 'What happens after I join the waitlist?',
    a: 'We email you within a few days with a calendar link. The first call is a setup session, not a sales pitch. If we are not the right fit, we will tell you on the call.',
  },
  {
    q: 'Do I need to be touring to get value?',
    a: 'No. Creator covers releasing music, occasional shows, and the content rhythm around them. The product earns its keep before you are touring full-time.',
  },
]

// ── BRT primitives ──────────────────────────────────────────────────────────
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="inline-flex items-center gap-3 font-mono text-[11px] tracking-[0.32em] uppercase"
      style={{ color: BRT.red }}
    >
      <span className="block w-10 h-px" style={{ background: BRT.red }} />
      <span>{children}</span>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-black uppercase leading-[0.95] tracking-[-0.04em] mt-6 mb-6 max-w-[1100px]"
      style={{
        fontFamily: DISPLAY,
        fontSize: 'clamp(40px, 7vw, 88px)',
        color: BRT.ink,
      }}
    >
      {children}
    </h2>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function MarketingHome() {
  return (
    <>
      {/* ── Hero — fits in one viewport, stats strip below ──────────────── */}
      <section
        className="flex flex-col justify-center"
        style={{
          minHeight: 'calc(100svh - 65px)',
          borderBottom: `1px solid ${BRT.divide}`,
        }}
      >
        <div className="max-w-[1400px] mx-auto w-full px-5 md:px-8 py-4 md:py-6 grid lg:grid-cols-[1.15fr_1fr] gap-6 lg:gap-12 items-center">
          {/* Left: copy */}
          <div className="flex flex-col gap-4 md:gap-5">
            <Eyebrow>Private Beta · Join the waitlist</Eyebrow>
            <h1
              className="font-black uppercase leading-[0.88] tracking-[-0.055em]"
              style={{
                fontFamily: DISPLAY,
                fontSize: 'clamp(40px, 6vw, 92px)',
                color: BRT.ink,
              }}
            >
              Your gigs.<br />Your content.<br />Your music.<br />
              <span style={{ color: BRT.red }}>One OS.</span>
            </h1>
            <p
              className="text-[14px] md:text-[16px] leading-[1.65] max-w-[560px] font-mono"
              style={{ color: BRT.inkSoft }}
            >
              Signal Lab OS replaces the spreadsheets, the WhatsApp threads, the five different apps. Tour management, content scheduling, production analysis, DJ set prep, release management. One system, built for electronic music artists.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#waitlist"
                className="font-mono text-[11px] md:text-[12px] uppercase tracking-[0.28em] font-bold px-6 py-4 md:px-7"
                style={{
                  background: BRT.red,
                  color: BRT.ink,
                  border: `1px solid ${BRT.red}`,
                }}
              >
                Join the waitlist →
              </a>
              <a
                href="#moments"
                className="font-mono text-[11px] md:text-[12px] uppercase tracking-[0.28em] px-6 py-4 md:px-7 transition-colors"
                style={{
                  color: BRT.ink,
                  border: `1px solid ${BRT.divide}`,
                }}
              >
                See what&rsquo;s inside
              </a>
            </div>
            <WaitlistCount />
          </div>

          {/* Right: live scan demo */}
          <div className="lg:pl-2">
            <HeroScan />
          </div>
        </div>
      </section>

      {/* ── Stats strip (separate section, compact) ──────────────────────── */}
      <section style={{ borderBottom: `1px solid ${BRT.divide}` }}>
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-6 md:py-8">
          <div
            className="grid grid-cols-2 lg:grid-cols-4 gap-px"
            style={{ background: BRT.divide, border: `1px solid ${BRT.divide}` }}
          >
            {STATS.map(([v, l]) => (
              <div key={v} className="p-5 md:p-6" style={{ background: BRT.ticket }}>
                <div
                  className="font-black tracking-[-0.02em]"
                  style={{ fontFamily: DISPLAY, fontSize: 24, color: BRT.ink }}
                >
                  {v}
                </div>
                <div
                  className="mt-2 font-mono text-[10px] md:text-[11px] tracking-[0.2em] uppercase"
                  style={{ color: BRT.inkDim }}
                >
                  {l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Five hero moments ────────────────────────────────────────────── */}
      <section
        id="moments"
        className="scroll-mt-20 lg:min-h-[100svh] lg:flex lg:flex-col lg:justify-center"
        style={{ borderBottom: `1px solid ${BRT.divide}` }}
      >
        <div className="max-w-[1400px] mx-auto w-full px-5 md:px-8 py-10 md:py-12">
          <Eyebrow>Five things it does today</Eyebrow>
          <SectionHeading>Every screen<br />earns its place.</SectionHeading>
          {/* 5 cards. Desktop: 6-col grid, first 3 span 2 cols (top row of 3),
              last 2 span 3 cols (bottom row of 2). No empty cells. */}
          <div
            className="mt-6 grid gap-px md:grid-cols-2 lg:grid-cols-6"
            style={{ background: BRT.divide, border: `1px solid ${BRT.divide}` }}
          >
            {MOMENTS.map((m, i) => (
              <MomentCard
                key={m.moment}
                {...m}
                className={i < 3 ? 'lg:col-span-2' : 'lg:col-span-3'}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Flow diagram ─────────────────────────────────────────────────── */}
      <section
        id="flow"
        className="scroll-mt-20"
        style={{ borderBottom: `1px solid ${BRT.divide}` }}
      >
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-16 md:py-24">
          <Eyebrow>How it connects</Eyebrow>
          <SectionHeading>The whole night,<br />end to end.</SectionHeading>
          <FlowDiagram />
        </div>
      </section>

      {/* ── Labs grid ────────────────────────────────────────────────────── */}
      <section
        id="labs"
        className="scroll-mt-20 lg:min-h-[100svh] lg:flex lg:flex-col lg:justify-center"
        style={{ borderBottom: `1px solid ${BRT.divide}` }}
      >
        <div className="max-w-[1400px] mx-auto w-full px-5 md:px-8 py-8 md:py-10">
          <Eyebrow>The Labs</Eyebrow>
          <SectionHeading>Five connected labs.<br />One artist workflow.</SectionHeading>
          <p
            className="text-[13px] md:text-[14px] leading-[1.55] max-w-[640px] mb-5 font-mono"
            style={{ color: BRT.inkSoft }}
          >
            Each lab handles one part of the creative cycle. Together they form the whole.
          </p>
          <LabGrid />
        </div>
      </section>

      {/* Pricing section intentionally removed for private beta. Reintroduce
          when public pricing is ready — PricingGrid and tier gating logic
          are still in the codebase (src/components/marketing/PricingGrid.tsx,
          src/lib/scanTiers.ts, etc.). */}

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="scroll-mt-20" style={{ borderBottom: `1px solid ${BRT.divide}` }}>
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-16 md:py-24">
          <Eyebrow>FAQ</Eyebrow>
          <SectionHeading>Questions.<br />Straight answers.</SectionHeading>
          <div
            className="mt-8 flex flex-col gap-px"
            style={{ background: BRT.divide, border: `1px solid ${BRT.divide}` }}
          >
            {FAQS.map(f => (
              <div key={f.q} className="p-7 md:p-9" style={{ background: BRT.ticket }}>
                <div
                  className="font-bold uppercase tracking-[-0.01em] text-[18px] md:text-[22px] leading-[1.2]"
                  style={{ fontFamily: DISPLAY, color: BRT.ink }}
                >
                  {f.q}
                </div>
                <p
                  className="mt-3 text-[14px] leading-[1.75] font-mono"
                  style={{ color: BRT.inkSoft }}
                >
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Waitlist ─────────────────────────────────────────────────────── */}
      <section
        id="waitlist"
        className="scroll-mt-20"
        style={{ borderBottom: `1px solid ${BRT.divide}` }}
      >
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-16 md:py-24 grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-20 items-start">
          <div className="flex flex-col gap-6">
            <Eyebrow>Early access</Eyebrow>
            <h2
              className="font-black uppercase leading-[0.95] tracking-[-0.04em]"
              style={{
                fontFamily: DISPLAY,
                fontSize: 'clamp(44px, 7vw, 88px)',
                color: BRT.ink,
              }}
            >
              Step<br />inside.
            </h2>
            <p
              className="text-[15px] md:text-[17px] leading-[1.7] max-w-[500px] font-mono"
              style={{ color: BRT.inkSoft }}
            >
              Every artist onboarded personally. Three fields. We take it from there.
            </p>
            <ul className="mt-2 flex flex-col gap-3 font-mono text-[13px] leading-[1.65]" style={{ color: BRT.inkSoft }}>
              <li className="flex gap-4 items-baseline">
                <span className="shrink-0" style={{ color: BRT.red }}>■</span>
                <span>Full setup call. Your accounts, your aliases, your team.</span>
              </li>
              <li className="flex gap-4 items-baseline">
                <span className="shrink-0" style={{ color: BRT.red }}>■</span>
                <span>No card. No commitment. Invite-only access during private beta.</span>
              </li>
              <li className="flex gap-4 items-baseline">
                <span className="shrink-0" style={{ color: BRT.red }}>■</span>
                <span>Honest fit check. If we are wrong for you, we will say.</span>
              </li>
            </ul>
          </div>
          <WaitlistForm />
        </div>
      </section>

      {/* ── Closing slab ─────────────────────────────────────────────────── */}
      <section>
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-16 md:py-24">
          <div
            className="p-10 md:p-16 flex flex-col md:flex-row md:items-end md:justify-between gap-10"
            style={{ background: BRT.ticket, border: `1px solid ${BRT.divide}` }}
          >
            <div
              className="font-black uppercase leading-[0.9] tracking-[-0.04em]"
              style={{
                fontFamily: DISPLAY,
                fontSize: 'clamp(32px, 5.5vw, 72px)',
                color: BRT.ink,
              }}
            >
              Run the business.<br />
              <span style={{ color: BRT.red }}>Stay in the music.</span>
            </div>
            <a
              href="#waitlist"
              className="font-mono text-[11px] md:text-[12px] uppercase tracking-[0.28em] font-bold px-8 py-5 shrink-0 text-center whitespace-nowrap"
              style={{
                background: BRT.red,
                color: BRT.ink,
                border: `1px solid ${BRT.red}`,
              }}
            >
              Request access →
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
