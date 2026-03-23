'use client'

const plans = [
  {
    name: 'Creator',
    price: '£29',
    tagline: "You're making music. Everything in one place.",
    accent: 'text-[#8a8780]',
    button: 'Start with Creator',
    features: [
      'Signal Lab - unlimited gigs',
      'Basic advance templates',
      'Broadcast Lab - 30 captions / month',
      'Artist tone profile',
      'SetLab - unlimited set building',
      'Camelot + energy arcs',
      'Sonix Lab - 18 mixdown chains',
      'Arrangement mapping',
      'Email support',
    ],
  },
  {
    name: 'Artist',
    price: '£59',
    tagline: "You're touring. The system runs the business around the music.",
    accent: 'text-[#b08d57]',
    featured: true,
    button: 'Join Artist waitlist',
    features: [
      'Everything in Creator',
      'Unlimited captions',
      'Media scanner + trend detection',
      'Invoice generation + advance sheets',
      'Expense tracking',
      'Sonix Max for Live integration',
      'Track analysis tools',
      'Gmail integration',
      'Priority support',
    ],
  },
  {
    name: 'Pro',
    price: '£99',
    tagline: "You're managing artists. One command centre.",
    accent: 'text-[#6a7a9a]',
    button: 'Talk to us',
    features: [
      'Everything in Artist',
      'First team tier - multi-user access',
      'Shared dashboards + permission roles',
      'Multi-artist profiles',
      'Roster analytics dashboard',
      'Advanced content scanning',
      'Artist tone intelligence',
      'Sonix stems analysis',
      'Dedicated support channel',
    ],
  },
  {
    name: 'Agency',
    price: '£249',
    tagline: "You're running the operation. Advanced tools, full control.",
    accent: 'text-[#3d6b4a]',
    button: 'Book a demo',
    features: [
      'Everything in Pro',
      'Capped at 10 artist profiles',
      'Advanced team permissions',
      'White-label advancing emails',
      'Custom integrations',
      'Bulk operations + automation',
      'Account management',
    ],
  },
]

const labs = [
  {
    name: 'Signal Lab',
    role: 'Touring operations',
    text: 'Advancing, invoicing, contracts, logistics briefs, expenses, and live show pages that keep the whole team aligned.',
  },
  {
    name: 'Broadcast Lab',
    role: 'Audience engine',
    text: 'Tone-matched captions, media scanning, reference artist analysis, scheduling support, and content intelligence that feels native to the artist.',
  },
  {
    name: 'Sonix Lab',
    role: 'Production intelligence',
    text: 'Mix chains, arrangement support, track analysis, stems insights, and Max for Live depth for artists who want tools that actually speed up the work.',
  },
  {
    name: 'SetLab',
    role: 'DJ intelligence',
    text: 'Set building, energy arcs, harmonic flow, transition analysis, and narrative mapping designed to support craft without advertising the technology behind it.',
  },
]

const integrations = [
  'Every lab feeds one shared artist system',
  'Shows inform content timing and posting',
  'Set prep connects to touring workflow',
  'Production tools support the actual show build',
]

const outcomes = [
  'Stop jumping between disconnected tools',
  'Turn touring admin into a proper operating layer',
  'Move faster on content without sounding generic',
  'Build sets, tracks, and shows from the same system',
]

const faqs = [
  {
    q: 'Why not make the labs modular?',
    a: 'Because the value comes from integration. The point is not buying separate plugins. The point is one system where touring, content, production, and set prep all inform each other.',
  },
  {
    q: 'When does team access start?',
    a: 'At Pro. Creator and Artist stay single-user to keep the upgrade path clean and focused on the solo artist use case.',
  },
  {
    q: 'What is the main commercial argument?',
    a: 'Traditional advancing can cost around £150 per show. At 20 shows a year that is £3,000. Artist tier is £59 per month, which is £708 per year.',
  },
  {
    q: 'Who is this built for?',
    a: 'Electronic artists first, then managers, then agencies. The product is designed around the actual operating reality of touring and releasing music.',
  },
]

export default function ModularSuiteLandingPage() {
  return (
    <div className="min-h-screen bg-[#070706] text-[#f0ebe2] font-mono">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Unbounded:wght@200;300;400&display=swap');
        .display-font { font-family: 'Unbounded', sans-serif; }
        .mono-font { font-family: 'DM Mono', monospace; }
      `}</style>

      <header className="border-b border-[#1a1917] sticky top-0 z-30 bg-[#070706]/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
          <div>
            <div className="tracking-[0.35em] text-[11px] text-[#b08d57] uppercase">Night Manoeuvres</div>
            <div className="tracking-[0.28em] text-[10px] text-[#52504c] uppercase mt-1">Artist OS / Modular Suite</div>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-[12px] tracking-[0.2em] uppercase text-[#8a8780]">
            <a href="#labs" className="hover:text-[#f0ebe2]">Labs</a>
            <a href="#system" className="hover:text-[#f0ebe2]">System</a>
            <a href="#pricing" className="hover:text-[#f0ebe2]">Pricing</a>
            <a href="#waitlist" className="hover:text-[#f0ebe2]">Waitlist</a>
          </nav>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="border-b border-[#1a1917]">
          <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
            <div className="max-w-6xl">
              <div className="flex items-center gap-4 text-[#b08d57] text-[11px] tracking-[0.35em] uppercase mb-8">
                <span className="block h-px w-12 bg-[#b08d57]" />
                <span>The operating system for electronic artists</span>
              </div>
              <h1 className="display-font text-[56px] leading-[0.94] md:text-[110px] md:leading-[0.92] font-[200] tracking-[-0.05em] text-[#f0ebe2] max-w-6xl">
                One integrated system for touring, content, production, and DJ workflow.
              </h1>
              <p className="mt-10 max-w-4xl text-[18px] md:text-[28px] leading-[1.9] text-[#8a8780]">
                Artist OS brings Signal Lab, Broadcast Lab, Sonix Lab, and SetLab into one connected layer so serious electronic artists can run the entire operation without context switching.
              </p>
              <div className="mt-12 flex flex-col gap-4 sm:flex-row">
                <a href="#pricing" className="border border-[#b08d57] bg-[#b08d57] px-8 py-4 text-[13px] uppercase tracking-[0.28em] text-[#070706] transition hover:opacity-90">
                  See pricing
                </a>
                <a href="#waitlist" className="border border-[#1a1917] px-8 py-4 text-[13px] uppercase tracking-[0.28em] text-[#f0ebe2] hover:border-[#b08d57] hover:text-[#b08d57]">
                  Join waitlist
                </a>
              </div>
            </div>

            <div className="mt-20 grid grid-cols-1 gap-px border border-[#1a1917] bg-[#1a1917] md:grid-cols-4">
              {[
                ['System model', '1 core + 4 labs', 'Built to be fully integrated'],
                ['Main plan', '£59 / month', 'Artist tier'],
                ['Annual comparison', '£708 vs £3,000', 'At 20 shows / year'],
                ['Best upgrade gate', 'Team access at Pro', 'Not earlier'],
              ].map(([label, value, sub]) => (
                <div key={label} className="bg-[#0b0a09] p-8">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-[#52504c]">{label}</div>
                  <div className="mt-5 text-[30px] md:text-[34px] text-[#f0ebe2]">{value}</div>
                  <div className="mt-3 text-[14px] text-[#52504c]">{sub}</div>
                </div>
              ))}
            </div>

            <div className="mt-16 border border-[#1a1917] bg-[#0b0a09] p-8 md:p-12">
              <div className="text-[11px] uppercase tracking-[0.35em] text-[#b08d57]">5-second system view</div>
              <div className="mt-8 overflow-x-auto">
                <div className="min-w-[900px]">
                  <div className="flex justify-center">
                    <div className="border border-[#3a2e1f] px-8 py-5 text-center">
                      <div className="text-[11px] uppercase tracking-[0.28em] text-[#52504c]">Core</div>
                      <div className="display-font mt-3 text-[32px] font-[200] tracking-[-0.03em] text-[#f0ebe2]">Artist OS</div>
                      <div className="mt-3 text-[14px] text-[#8a8780]">The operating system for electronic artists</div>
                    </div>
                  </div>
                  <div className="mx-auto h-10 w-px bg-[#3a2e1f]" />
                  <div className="mx-auto h-px max-w-[760px] bg-[#3a2e1f]" />
                  <div className="grid grid-cols-4 gap-6 pt-10">
                    {[
                      ['Sonix Lab', 'Production intelligence', 'Create tracks'],
                      ['SetLab', 'DJ intelligence', 'Prepare sets'],
                      ['Signal Lab', 'Touring operations', 'Perform shows'],
                      ['Broadcast Lab', 'Audience engine', 'Publish content'],
                    ].map(([name, role, action]) => (
                      <div key={name} className="relative text-center">
                        <div className="absolute left-1/2 top-[-40px] h-10 w-px -translate-x-1/2 bg-[#3a2e1f]" />
                        <div className="border border-[#1a1917] bg-[#070706] px-5 py-6 min-h-[180px]">
                          <div className="display-font text-[28px] font-[200] tracking-[-0.03em] text-[#f0ebe2]">{name}</div>
                          <div className="mt-3 text-[12px] uppercase tracking-[0.24em] text-[#52504c]">{role}</div>
                          <div className="mt-8 text-[18px] text-[#b08d57]">{action}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mx-auto mt-10 max-w-4xl text-center text-[16px] md:text-[18px] leading-[1.9] text-[#8a8780]">
                One system that follows the full artist workflow: create music, build sets, play shows, and publish the story around them.
              </p>
            </div>
          </div>
        </section>

        {/* INTEGRATION */}
        <section id="system" className="border-b border-[#1a1917]">
          <div className="mx-auto max-w-7xl px-6 py-24 md:py-28 grid gap-16 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="text-[11px] uppercase tracking-[0.35em] text-[#b08d57]">Why integration matters</div>
              <h2 className="display-font mt-6 text-[40px] md:text-[72px] font-[200] leading-[1.02] tracking-[-0.04em] max-w-3xl">
                One system that gets smarter when every lab connects.
              </h2>
              <p className="mt-8 max-w-2xl text-[18px] leading-[1.9] text-[#8a8780]">
                The product gets stronger because the labs are connected. Touring data informs content. Set prep informs show prep. Production decisions connect back into the release and performance cycle.
              </p>
            </div>
            <div className="grid gap-px border border-[#1a1917] bg-[#1a1917]">
              <div className="bg-[#0b0a09] p-8">
                <div className="text-[11px] uppercase tracking-[0.28em] text-[#52504c]">What the integration changes</div>
                <ul className="mt-6 space-y-4 text-[16px] leading-[1.8] text-[#8a8780]">
                  {integrations.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="text-[#b08d57]">→</span><span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-[#0b0a09] p-8">
                <div className="text-[11px] uppercase tracking-[0.28em] text-[#52504c]">What the user gets</div>
                <ul className="mt-6 space-y-4 text-[16px] leading-[1.8] text-[#8a8780]">
                  {outcomes.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="text-[#3d6b4a]">•</span><span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* LABS */}
        <section id="labs" className="border-b border-[#1a1917]">
          <div className="mx-auto max-w-7xl px-6 py-24 md:py-28">
            <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.35em] text-[#b08d57]">The four labs</div>
                <h2 className="display-font mt-6 text-[42px] md:text-[74px] font-[200] leading-[1.02] tracking-[-0.04em] max-w-4xl">
                  Capabilities inside the system.
                </h2>
              </div>
              <p className="max-w-xl text-[16px] md:text-[18px] leading-[1.8] text-[#8a8780]">
                Every plan gets the full architecture. Higher tiers unlock more depth, more operational control, and more workflow intelligence.
              </p>
            </div>
            <div className="mt-16 grid gap-px border border-[#1a1917] bg-[#1a1917] md:grid-cols-2">
              {labs.map((lab) => (
                <div key={lab.name} className="bg-[#0b0a09] p-10 md:p-12 min-h-[280px]">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-[#52504c]">{lab.role}</div>
                  <h3 className="display-font mt-4 text-[34px] font-[200] tracking-[-0.03em]">{lab.name}</h3>
                  <p className="mt-8 max-w-xl text-[17px] leading-[1.9] text-[#8a8780]">{lab.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="border-b border-[#1a1917]">
          <div className="mx-auto max-w-7xl px-6 py-24 md:py-28">
            <div className="text-center">
              <div className="text-[11px] uppercase tracking-[0.35em] text-[#b08d57]">Pricing structure</div>
              <h2 className="display-font mt-6 text-[40px] md:text-[74px] font-[200] leading-[1.05] tracking-[-0.04em]">
                A clean ladder from solo artist to full operation.
              </h2>
              <p className="mx-auto mt-8 max-w-4xl text-[18px] md:text-[24px] leading-[1.9] text-[#8a8780]">
                Creator and Artist stay single-user. Team access starts at Pro. Artist is the power middle plan and the clearest commercial choice for touring acts.
              </p>
            </div>
            <div className="mt-16 grid gap-px border border-[#1a1917] bg-[#1a1917] lg:grid-cols-4">
              {plans.map((plan) => (
                <div key={plan.name} className={`${plan.featured ? 'bg-[#11100d]' : 'bg-[#0b0a09]'} p-8 md:p-10 flex flex-col`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-[11px] uppercase tracking-[0.28em] text-[#52504c]">{plan.name}</div>
                    {plan.featured && (
                      <div className="border border-[#3a2e1f] px-3 py-2 text-[10px] uppercase tracking-[0.28em] text-[#b08d57]">
                        Most popular
                      </div>
                    )}
                  </div>
                  <div className={`mt-5 text-[40px] ${plan.accent}`}>{plan.price}</div>
                  <div className="text-[12px] uppercase tracking-[0.24em] text-[#52504c]">per month</div>
                  <p className="mt-6 text-[15px] leading-[1.8] text-[#8a8780] min-h-[84px]">{plan.tagline}</p>
                  <ul className="mt-6 space-y-3 text-[15px] leading-[1.8] text-[#8a8780] flex-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3">
                        <span className="text-[#b08d57]">•</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <button className={`mt-8 border px-5 py-4 text-[11px] uppercase tracking-[0.28em] ${plan.featured ? 'border-[#b08d57] bg-[#b08d57] text-[#070706]' : 'border-[#1a1917] text-[#f0ebe2] hover:border-[#b08d57] hover:text-[#b08d57]'}`}>
                    {plan.button}
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-16 grid gap-px border border-[#1a1917] bg-[#1a1917] md:grid-cols-3">
              {[
                ['Traditional advancing', '£150 / show', '20 shows = £3,000 / year'],
                ['Artist tier', '£59 / month', '12 months = £708 / year'],
                ['Indicative saving', '£2,292', 'Before content and workflow gains'],
              ].map(([label, value, sub]) => (
                <div key={label} className="bg-[#0b0a09] p-8 text-center">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-[#52504c]">{label}</div>
                  <div className="mt-5 text-[34px] text-[#f0ebe2]">{value}</div>
                  <div className="mt-3 text-[14px] text-[#52504c]">{sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* WAITLIST */}
        <section id="waitlist" className="border-b border-[#1a1917]">
          <div className="mx-auto max-w-5xl px-6 py-24 md:py-32 text-center">
            <div className="text-[11px] uppercase tracking-[0.35em] text-[#b08d57]">Private beta</div>
            <h2 className="display-font mt-6 text-[42px] md:text-[82px] font-[200] leading-[1.02] tracking-[-0.05em]">
              Join the waitlist.
            </h2>
            <p className="mx-auto mt-8 max-w-3xl text-[18px] md:text-[24px] leading-[1.9] text-[#8a8780]">
              Built for artists first. Then teams. Then agencies. Early access is for people who want the full operating layer, not another disconnected app.
            </p>
            <form className="mx-auto mt-12 max-w-3xl">
              <div className="flex flex-col border border-[#1a1917] bg-[#0b0a09] sm:flex-row">
                <input type="email" placeholder="your@email.com" className="w-full bg-transparent px-7 py-5 text-[16px] text-[#f0ebe2] outline-none placeholder:text-[#52504c]" />
                <button type="button" className="border-t border-[#1a1917] bg-[#b08d57] px-8 py-5 text-[12px] uppercase tracking-[0.3em] text-[#070706] sm:border-l sm:border-t-0">
                  Join →
                </button>
              </div>
              <p className="mt-5 text-[13px] tracking-[0.15em] uppercase text-[#52504c]">
                Private beta / no payment details needed
              </p>
            </form>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq">
          <div className="mx-auto max-w-6xl px-6 py-24 md:py-28">
            <div className="text-[11px] uppercase tracking-[0.35em] text-[#b08d57]">FAQ</div>
            <div className="mt-10 grid gap-px border border-[#1a1917] bg-[#1a1917]">
              {faqs.map((faq) => (
                <div key={faq.q} className="bg-[#0b0a09] p-8 md:p-10">
                  <h3 className="display-font text-[26px] font-[200] tracking-[-0.03em]">{faq.q}</h3>
                  <p className="mt-4 max-w-4xl text-[16px] leading-[1.9] text-[#8a8780]">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
