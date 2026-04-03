'use client'

import Link from 'next/link'

const tiers = [
  {
    name: 'Creator',
    price: '£29',
    tagline: "You're making music. This keeps everything in one place.",
    accent: 'text-[#8a8780]',
    accentHex: '#8a7a6a',
    features: [
      'Tour Lab — gigs, advancing, logistics',
      'Broadcast Lab — captions + scheduling',
      'Set Lab — track library + set building',
      'Drop Lab — release management',
      'Promo mail outs',
      'Email support',
    ],
  },
  {
    name: 'Artist',
    price: '£59',
    tagline: "You're touring. The system runs the business around the music.",
    accent: 'text-[#b08d57]',
    accentHex: '#b08d57',
    featured: true,
    features: [
      'Everything in Creator',
      'Content Strategy — trend detection + media scanning',
      'SONIX Lab — mix chain analysis + VST plugin',
      'Set Lab — energy scoring + Rekordbox sync',
      'Contract parser + invoice tracking',
      'Campaign builder for releases',
      'Promo mail outs + open tracking',
      'Unlimited captions',
      'Priority support',
    ],
  },
  {
    name: 'Pro',
    price: '£99',
    tagline: "Every tool. No limits. No waiting.",
    accent: 'text-[#6a7a9a]',
    accentHex: '#6a8a7a',
    features: [
      'Everything in Artist',
      'Two artist aliases — run multiple projects',
      'Multi-currency invoicing',
      'Team access — manager, photographer, content',
      'Full listen tracking — who played, how long',
      'Follow-up intelligence — know who to chase',
      'White-label emails — your branding, not ours',
      'Producer chain database',
      'Stem exports',
      'Priority processing on everything',
      'Dedicated support',
    ],
  },
]

const testimonials = [
  { quote: 'Finally a tool built for artists, not just for spreadsheet jockeys.', author: 'DJ in the scene' },
  { quote: 'Replaced Advancers, Buffer, and three Google Sheets. Worth every penny.', author: 'Touring electronic artist' },
  { quote: "The caption generator alone has 3x'd my content output.", author: 'Festival & club promoter' },
]

const comparison = [
  ['Advance requests', '·', '·', ''],
  ['Gig management', '·', '·', ''],
  ['Invoicing', '·', '', ''],
  ['Content scheduling', '·', '', ''],
  ['Intelligent captions', '·', '', ''],
  ['Production analysis (SONIX)', '·', '', ''],
  ['DJ set tools', '·', '', ''],
  ['Release management', '·', '', ''],
  ['Multi-artist mgmt', '· (Agency)', '', ''],
  ['Cost per show*', '£2.95', '£150', '—'],
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#070706] text-[#f0ebe2] font-mono">

      {/* HEADER */}
      <header className="border-b border-[#1a1917] sticky top-0 z-30 bg-[#070706]/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
          <Link href="/landing" className="flex items-center gap-3 no-underline">
            <span className="display-font text-[13px] font-[200] tracking-[0.04em] text-[#f0ebe2]">Signal Lab</span>
            <span className="text-[9px] tracking-[0.08em] text-[#52504c]">OS</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-[12px] tracking-[0.18em] uppercase text-[#8a8780]">
            <Link href="/landing#labs" className="hover:text-[#f0ebe2] transition-colors no-underline">Labs</Link>
            <Link href="/landing#features" className="hover:text-[#f0ebe2] transition-colors no-underline">Features</Link>
            <Link href="/landing#waitlist" className="border border-[#b08d57] px-5 py-2 text-[#b08d57] hover:bg-[#b08d57] hover:text-[#070706] transition-all no-underline">Waitlist</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="border-b border-[#1a1917]">
          <div className="mx-auto max-w-7xl px-6 py-8 md:py-14">
            <div className="max-w-5xl">
              <div className="flex items-center gap-4 text-[#b08d57] text-[11px] tracking-[0.35em] uppercase mb-8">
                <span className="block h-px w-12 bg-[#b08d57]" />
                <span>Pricing</span>
              </div>
              <h1 className="display-font text-[48px] leading-[0.96] md:text-[100px] md:leading-[0.93] font-[200] tracking-[-0.05em] text-[#f0ebe2] max-w-5xl">
                One system. Every stage of your career.
              </h1>
              <p className="mt-10 max-w-3xl text-[18px] md:text-[26px] leading-[1.8] text-[#8a8780]">
                All tiers include Tour Lab, Broadcast Lab, Set Lab, SONIX Lab, and Drop Lab. Most touring artists choose the Artist tier.
              </p>
            </div>
          </div>
        </section>

        {/* PRICING TIERS */}
        <section className="border-b border-[#1a1917]">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
            <div className="grid gap-px border border-[#1a1917] bg-[#1a1917] lg:grid-cols-3">
              {tiers.map(tier => (
                <div key={tier.name} className={`${tier.featured ? 'bg-[#11100d]' : 'bg-[#0b0a09]'} p-8 md:p-10 flex flex-col relative`}>
                  {tier.featured && <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#b08d57]" />}
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-[11px] uppercase tracking-[0.28em] text-[#52504c]">{tier.name}</div>
                    {tier.featured && (
                      <div className="border border-[#3a2e1f] px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-[#b08d57]">
                        Most popular
                      </div>
                    )}
                  </div>
                  <div className={`mt-5 display-font text-[40px] font-[200] ${tier.accent}`}>
                    {tier.price}
                    <span className="text-[11px] text-[#52504c] font-mono ml-1.5">/month</span>
                  </div>
                  <p className="mt-5 text-[14px] leading-[1.8] text-[#8a8780] min-h-[72px]">{tier.tagline}</p>
                  <Link href={tier.featured ? '/login' : '/landing#waitlist'}
                    className={`mt-6 border px-5 py-4 text-[11px] uppercase tracking-[0.28em] text-center transition-all no-underline block ${
                      tier.featured
                        ? 'border-[#b08d57] bg-[#b08d57] text-[#070706] hover:opacity-90'
                        : 'border-[#1a1917] text-[#f0ebe2] hover:border-[#b08d57] hover:text-[#b08d57]'
                    }`}>
                    {tier.featured ? 'Get access' : 'Join waitlist'}
                  </Link>
                  <ul className="mt-8 pt-6 border-t border-[#1a1917] space-y-3 text-[14px] leading-[1.7] text-[#8a8780] flex-1">
                    {tier.features.map(feature => (
                      <li key={feature} className="flex gap-3">
                        <span style={{ color: tier.accentHex }} className="shrink-0">·</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* MANAGEMENT NOTE */}
            <div className="mt-2 border border-[#1a1917] bg-[#0b0a09] p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#52504c] mb-1">Running artists?</div>
                <div className="text-[14px] text-[#8a8780] leading-[1.7]">Management tier available — multi-artist dashboard, team access, white-label advance emails. Priced separately.</div>
              </div>
              <a href="mailto:hello@signallabos.com?subject=Management%20tier" className="shrink-0 border border-[#1a1917] px-6 py-3 text-[11px] uppercase tracking-[0.22em] text-[#8a8780] hover:border-[#b08d57] hover:text-[#b08d57] transition-all text-center no-underline">
                Get in touch →
              </a>
            </div>
          </div>
        </section>

        {/* THE MATH */}
        <section className="border-b border-[#1a1917]">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
            <div className="flex items-center gap-4 text-[#b08d57] text-[11px] tracking-[0.35em] uppercase mb-6">
              <span className="block h-px w-12 bg-[#b08d57]" />
              <span>The math</span>
            </div>
            <h2 className="display-font text-[38px] md:text-[72px] font-[200] leading-[0.98] tracking-[-0.04em] max-w-4xl">
              Break even at four shows.
            </h2>
            <div className="mt-16 grid gap-px border border-[#1a1917] bg-[#1a1917] md:grid-cols-3">
              {[
                ['Without Signal Lab OS', '~£3,000 / year', 'Advancing alone at £150/show × 20 shows', false],
                ['With Signal Lab OS', '£708 / year', 'Plus content, production, set prep, and release tools', true],
                ['You save', '£2,292+', 'Before content and workflow gains', false],
              ].map(([label, value, sub, highlight]) => (
                <div key={label as string} className="bg-[#0b0a09] p-8 md:p-10">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-[#52504c]">{label}</div>
                  <div className={`mt-4 display-font text-[32px] md:text-[40px] font-[200] ${highlight ? 'text-[#3d6b4a]' : 'text-[#f0ebe2]'}`}>{value}</div>
                  <div className="mt-2 text-[13px] text-[#52504c]">{sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section className="border-b border-[#1a1917]">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
            <div className="flex items-center gap-4 text-[#b08d57] text-[11px] tracking-[0.35em] uppercase mb-6">
              <span className="block h-px w-12 bg-[#b08d57]" />
              <span>What artists say</span>
            </div>
            <div className="mt-10 grid gap-px border border-[#1a1917] bg-[#1a1917] md:grid-cols-3">
              {testimonials.map((item, idx) => (
                <div key={idx} className="bg-[#0b0a09] p-8 md:p-10">
                  <p className="text-[15px] leading-[1.8] text-[#8a8780] italic">{item.quote}</p>
                  <div className="mt-6 text-[10px] tracking-[0.12em] text-[#52504c]">— {item.author}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COMPARISON TABLE */}
        <section className="border-b border-[#1a1917]">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
            <div className="flex items-center gap-4 text-[#b08d57] text-[11px] tracking-[0.35em] uppercase mb-6">
              <span className="block h-px w-12 bg-[#b08d57]" />
              <span>How we compare</span>
            </div>
            <h2 className="display-font text-[38px] md:text-[72px] font-[200] leading-[0.98] tracking-[-0.04em] max-w-4xl mb-16">
              Everything else is catch-up.
            </h2>
            <div className="border border-[#1a1917] bg-[#0b0a09] overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#1a1917]">
                    <th className="text-left p-5 font-normal text-[10px] tracking-[0.18em] uppercase text-[#52504c]">Feature</th>
                    <th className="text-center p-5 font-normal text-[10px] tracking-[0.18em] uppercase text-[#b08d57]">Signal Lab OS</th>
                    <th className="text-center p-5 font-normal text-[10px] tracking-[0.18em] uppercase text-[#52504c]">Advancers</th>
                    <th className="text-center p-5 font-normal text-[10px] tracking-[0.18em] uppercase text-[#52504c]">Sheets</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row, idx) => (
                    <tr key={idx} className="border-b border-[#1a1917] last:border-b-0">
                      <td className="p-5 text-[#f0ebe2]">{row[0]}</td>
                      <td className={`text-center p-5 ${row[1] ? 'text-[#3d6b4a]' : 'text-[#52504c]'}`}>{row[1] || '—'}</td>
                      <td className={`text-center p-5 ${row[2] ? 'text-[#8a8780]' : 'text-[#52504c]'}`}>{row[2] || '—'}</td>
                      <td className="text-center p-5 text-[#52504c]">{row[3] || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-[9px] tracking-[0.12em] text-[#52504c]">*at 20 shows/year on Artist tier (£59/mo)</div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-b border-[#1a1917]">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
            <div className="max-w-4xl">
              <div className="flex items-center gap-4 text-[#b08d57] text-[11px] tracking-[0.35em] uppercase mb-8">
                <span className="block h-px w-12 bg-[#b08d57]" />
                <span>Get started</span>
              </div>
              <h2 className="display-font text-[48px] md:text-[80px] font-[200] leading-[0.96] tracking-[-0.04em]">
                Ready when you are.
              </h2>
              <p className="mt-8 max-w-2xl text-[18px] leading-[1.8] text-[#8a8780]">
                Early access is limited. We're onboarding artists personally. No payment details needed.
              </p>
              <div className="mt-12 flex flex-col gap-4 sm:flex-row">
                <Link href="/login" className="border border-[#b08d57] bg-[#b08d57] px-8 py-4 text-[13px] uppercase tracking-[0.28em] text-[#070706] transition hover:opacity-90 text-center no-underline">
                  Get access
                </Link>
                <Link href="/landing" className="border border-[#1a1917] px-8 py-4 text-[13px] uppercase tracking-[0.28em] text-[#8a8780] hover:border-[#b08d57] hover:text-[#b08d57] transition-all text-center no-underline">
                  Back to home
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-[#1a1917] py-10 px-6">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-[11px] tracking-[0.2em] uppercase text-[#52504c]">Signal Lab OS · Private beta · 2026</div>
          <div className="text-[11px] tracking-[0.15em] text-[#52504c]">
            <a href="mailto:hello@signallabos.com" className="hover:text-[#8a8780] transition-colors no-underline">hello@signallabos.com</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
