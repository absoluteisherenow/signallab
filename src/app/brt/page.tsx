'use client'

/**
 * Brutalist (BRT) landing / waitlist page.
 * Design tokens: src/lib/design/brt.ts
 * Inspired by Berghain · Circoloco · brutalist boarding passes.
 */

import { useState } from 'react'
import { BRT } from '@/lib/design/brt'

const plans = [
  {
    name: 'Creator',
    price: '£29',
    tagline: "You're making music. This keeps everything in one place.",
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
    tagline: 'Every tool. No limits. No waiting.',
    features: [
      'Everything in Artist',
      'Two artist aliases — run multiple projects',
      'Multi-currency invoicing',
      'Team access — manager, photographer, content',
      'Full listen tracking — who played, how long',
      'Follow-up intelligence — know who to chase',
      'White-label emails — your branding',
      'Producer chain database',
      'Stem exports',
      'Priority processing on everything',
      'Dedicated support',
    ],
  },
]

const labs = [
  { name: 'Tour Lab', role: 'Gigs, contracts, finances, advancing. The business side — handled.', action: 'Run the business' },
  { name: 'Broadcast Lab', role: 'Content intelligence, captions tuned to your voice, scheduling, trend detection.', action: 'Own the narrative' },
  { name: 'Set Lab', role: 'Track library, set building, Rekordbox sync, energy + flow scoring.', action: 'Prepare the set' },
  { name: 'SONIX Lab', role: 'Mix chain analysis, production workflow, frequency and structure data, VST plugin.', action: 'Production analysis' },
  { name: 'Drop Lab', role: 'Release management, campaign timelines, streaming links, promo coordination.', action: 'Ship the music' },
]

const features = [
  { title: 'Contract parser', desc: 'Paste a booking email. Venue, times, hotel, backline, fee, deposits — extracted. Gig created in one click.' },
  { title: 'Content Intelligence', desc: 'Drop your footage. Four scores — Reach, Authenticity, Culture, Visual Identity. Know what to post.' },
  { title: 'Track intelligence', desc: 'Every track gets energy scoring, flow compatibility, mix-in data across your full library.' },
  { title: 'Tone profiles', desc: 'Scan the artists you study. Captions generate in your voice, not a brand\u2019s.' },
  { title: 'Rekordbox sync', desc: 'Import your full library. Every track enriched. Export sets back as Rekordbox XML.' },
]

const faqs = [
  {
    q: 'Why one system instead of separate tools?',
    a: 'The value is in the connections. Gig data informs content timing. Set prep connects to show schedule. Production feeds into releases. Separate tools can\u2019t do that.',
  },
  {
    q: 'How much does traditional advancing cost?',
    a: 'A dedicated advancing service runs around \u00a3150 per show. At 20 shows a year, that\u2019s \u00a33,000. Signal Lab OS is \u00a359/month \u2014 \u00a3708/year \u2014 and does advancing, content, set prep, production.',
  },
  {
    q: 'Do I need to be a touring DJ?',
    a: 'No. If you\u2019re making electronic music and posting about it, there\u2019s value. If you\u2019re playing regularly, the ROI is immediate.',
  },
  {
    q: 'Is there a free tier?',
    a: 'Not yet. Private beta \u2014 focused on artists serious about their workflow. No payment details to join the waitlist.',
  },
]

// ── BRT primitives ────────────────────────────────────────────────────────────

const DISPLAY = '"Helvetica Neue", Helvetica, Arial, sans-serif'
const MONO = "'Helvetica Neue', Helvetica, Arial, sans-serif, ui-monospace, monospace"

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 12,
      fontFamily: MONO, fontSize: 11, letterSpacing: '0.32em',
      textTransform: 'uppercase', color: BRT.red,
    }}>
      <span style={{ display: 'block', width: 40, height: 1, background: BRT.red }} />
      <span>{children}</span>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontFamily: DISPLAY, fontWeight: 900, fontSize: 'clamp(40px, 7vw, 88px)',
      lineHeight: 0.95, letterSpacing: '-0.04em', color: BRT.ink,
      textTransform: 'uppercase', marginTop: 24, marginBottom: 24, maxWidth: 1100,
    }}>
      {children}
    </h2>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BRTLandingPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleWaitlistSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setStatus('error'); setMessage('Enter your email.'); return }
    try {
      setStatus('loading'); setMessage('')
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'brt-landing' }),
      })
      const data = await res.json()
      if (data.success) { setStatus('success'); setMessage('YOU\u2019RE IN. WE\u2019LL BE IN TOUCH.'); setEmail(''); return }
      if (data.duplicate) { setStatus('success'); setMessage('ALREADY ON THE LIST.'); setEmail(''); return }
      setStatus('error'); setMessage('Something went wrong. Try again.')
    } catch {
      setStatus('error'); setMessage('Something went wrong. Try again.')
    }
  }

  const container: React.CSSProperties = { maxWidth: 1400, margin: '0 auto', padding: '0 32px' }
  const sectionBorder: React.CSSProperties = { borderTop: `1px solid ${BRT.divide}` }

  return (
    <div style={{
      background: BRT.bg, color: BRT.ink,
      fontFamily: MONO, fontSize: 14, lineHeight: 1.6,
      minHeight: '100vh', position: 'relative',
    }}>
      {/* Scanline overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,0.015) 2px 3px)',
      }} />

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: `${BRT.bg}f2`, backdropFilter: 'blur(8px)',
        borderBottom: `1px solid ${BRT.divide}`,
      }}>
        <div style={{ ...container, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 18, letterSpacing: '-0.02em', color: BRT.ink, textTransform: 'uppercase' }}>
              Signal Lab
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.2em', color: BRT.inkDim, textTransform: 'uppercase' }}>
              OS
            </span>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 28, fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            <a href="#labs" style={{ color: BRT.inkSoft, textDecoration: 'none' }}>Labs</a>
            <a href="#features" style={{ color: BRT.inkSoft, textDecoration: 'none' }}>Features</a>
            <a href="#pricing" style={{ color: BRT.inkSoft, textDecoration: 'none' }}>Pricing</a>
            <a href="#waitlist" style={{
              border: `1px solid ${BRT.red}`, color: BRT.red,
              padding: '10px 20px', textDecoration: 'none', letterSpacing: '0.22em',
            }}>
              Waitlist
            </a>
          </nav>
        </div>
      </header>

      <main style={{ position: 'relative', zIndex: 2 }}>

        {/* ── HERO ────────────────────────────────────────────────────────── */}
        <section style={{ ...sectionBorder, borderTop: 'none', padding: '56px 0 80px' }}>
          <div style={container}>
            <Eyebrow>Private Beta — Join the Waitlist</Eyebrow>
            <h1 style={{
              fontFamily: DISPLAY, fontWeight: 900,
              fontSize: 'clamp(56px, 11vw, 180px)',
              lineHeight: 0.88, letterSpacing: '-0.06em',
              color: BRT.ink, textTransform: 'uppercase',
              marginTop: 32, marginBottom: 32, maxWidth: 1400,
            }}>
              Your gigs.<br />Your content.<br />Your music.<br /><span style={{ color: BRT.red }}>One OS.</span>
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.7, color: BRT.inkSoft, maxWidth: 780 }}>
              Signal Lab OS replaces the spreadsheets, the WhatsApp threads, the five different apps. Tour management, content scheduling, production analysis, DJ set prep, release management — one system, built for electronic artists.
            </p>
            <div style={{ marginTop: 40, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <a href="#waitlist" style={{
                background: BRT.red, color: BRT.ink,
                padding: '18px 32px', textDecoration: 'none',
                fontFamily: MONO, fontSize: 12, letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 700,
                border: `1px solid ${BRT.red}`,
              }}>
                Join the waitlist →
              </a>
              <a href="#labs" style={{
                background: 'transparent', color: BRT.ink,
                padding: '18px 32px', textDecoration: 'none',
                fontFamily: MONO, fontSize: 12, letterSpacing: '0.28em', textTransform: 'uppercase',
                border: `1px solid ${BRT.divide}`,
              }}>
                See what&rsquo;s inside
              </a>
            </div>

            {/* STATS STRIP */}
            <div style={{
              marginTop: 64, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 1, background: BRT.divide, border: `1px solid ${BRT.divide}`,
            }}>
              {[
                ['5 LABS', 'Tour · Broadcast · Set · SONIX · Drop'],
                ['£59 / MONTH', 'Artist tier · most popular'],
                ['£2,292 SAVED', 'vs traditional advancing at 20 shows/yr'],
                ['1 SYSTEM', 'Replaces 5+ tools'],
              ].map(([v, l]) => (
                <div key={v} style={{ background: BRT.ticket, padding: '28px 24px' }}>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 28, letterSpacing: '-0.02em', color: BRT.ink }}>{v}</div>
                  <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', color: BRT.inkDim, textTransform: 'uppercase' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── LABS ───────────────────────────────────────────────────────── */}
        <section id="labs" style={{ ...sectionBorder, padding: '80px 0' }}>
          <div style={container}>
            <Eyebrow>The Labs</Eyebrow>
            <SectionHeading>Five connected labs.<br />One artist workflow.</SectionHeading>
            <p style={{ fontSize: 18, lineHeight: 1.7, color: BRT.inkSoft, maxWidth: 720, marginBottom: 48 }}>
              Create music. Build sets. Play shows. Tell the story. Ship the release. Each lab handles one part. Together they form the full creative cycle.
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 1, background: BRT.divide, border: `1px solid ${BRT.divide}`,
            }}>
              {labs.map(lab => (
                <div key={lab.name} style={{ background: BRT.ticket, padding: '40px 32px', display: 'flex', flexDirection: 'column', minHeight: 280 }}>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 32, letterSpacing: '-0.03em', color: BRT.ink, textTransform: 'uppercase' }}>{lab.name}</div>
                  <div style={{ marginTop: 16, fontFamily: MONO, fontSize: 14, lineHeight: 1.7, color: BRT.inkSoft, flex: 1 }}>{lab.role}</div>
                  <div style={{ marginTop: 24, fontFamily: MONO, fontSize: 12, letterSpacing: '0.22em', color: BRT.red, textTransform: 'uppercase' }}>→ {lab.action}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEATURES ───────────────────────────────────────────────────── */}
        <section id="features" style={{ ...sectionBorder, padding: '80px 0' }}>
          <div style={container}>
            <Eyebrow>What makes it different</Eyebrow>
            <SectionHeading>Every part of<br />the workflow.<br /><span style={{ color: BRT.red }}>Handled.</span></SectionHeading>
            <div style={{
              marginTop: 48, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 1, background: BRT.divide, border: `1px solid ${BRT.divide}`,
            }}>
              {features.map(f => (
                <div key={f.title} style={{ background: BRT.ticket, padding: '32px 28px' }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.22em', color: BRT.red, textTransform: 'uppercase', marginBottom: 14 }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.7, color: BRT.inkSoft }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PRICING ────────────────────────────────────────────────────── */}
        <section id="pricing" style={{ ...sectionBorder, padding: '80px 0' }}>
          <div style={container}>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ display: 'inline-block' }}>
                <Eyebrow>Pricing</Eyebrow>
              </div>
              <h2 style={{
                fontFamily: DISPLAY, fontWeight: 900, fontSize: 'clamp(40px, 7vw, 88px)',
                lineHeight: 0.95, letterSpacing: '-0.04em', color: BRT.ink,
                textTransform: 'uppercase', marginTop: 20, marginBottom: 20,
              }}>
                Simple. No surprises.
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.7, color: BRT.inkSoft, maxWidth: 640, margin: '0 auto' }}>
                Most touring artists choose the Artist tier. If you&rsquo;re just making music, Creator covers it.
              </p>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 1, background: BRT.divide, border: `1px solid ${BRT.divide}`,
            }}>
              {plans.map(plan => (
                <div key={plan.name} style={{
                  background: plan.featured ? BRT.ticketHi : BRT.ticket,
                  padding: '40px 32px',
                  display: 'flex', flexDirection: 'column',
                  position: 'relative',
                }}>
                  {plan.featured && (
                    <div style={{
                      position: 'absolute', top: 0, right: 0,
                      background: BRT.red, color: BRT.ink,
                      padding: '8px 16px',
                      fontFamily: MONO, fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', fontWeight: 700,
                    }}>
                      Most popular
                    </div>
                  )}
                  <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.28em', color: BRT.inkDim, textTransform: 'uppercase' }}>{plan.name}</div>
                  <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 56, letterSpacing: '-0.04em', color: plan.featured ? BRT.red : BRT.ink }}>{plan.price}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', color: BRT.inkDim, textTransform: 'uppercase' }}>/ month</span>
                  </div>
                  <p style={{ marginTop: 20, fontSize: 13, lineHeight: 1.7, color: BRT.inkSoft, minHeight: 72 }}>{plan.tagline}</p>
                  <ul style={{ marginTop: 24, padding: 0, listStyle: 'none', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {plan.features.map(f => (
                      <li key={f} style={{ fontSize: 13, lineHeight: 1.6, color: BRT.inkSoft, display: 'flex', gap: 10 }}>
                        <span style={{ color: BRT.red, flexShrink: 0 }}>■</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <a href="#waitlist" style={{
                    marginTop: 32,
                    background: plan.featured ? BRT.red : 'transparent',
                    color: plan.featured ? BRT.ink : BRT.ink,
                    border: `1px solid ${plan.featured ? BRT.red : BRT.divide}`,
                    padding: '16px 20px', textAlign: 'center', textDecoration: 'none',
                    fontFamily: MONO, fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: plan.featured ? 700 : 400,
                  }}>
                    Join waitlist
                  </a>
                </div>
              ))}
            </div>

            {/* Management note */}
            <div style={{
              marginTop: 32, background: BRT.ticket, border: `1px solid ${BRT.divide}`,
              padding: '24px 28px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.22em', color: BRT.inkDim, textTransform: 'uppercase', marginBottom: 6 }}>Running artists?</div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: BRT.inkSoft }}>Management tier available — multi-artist dashboard, team access, white-label advance emails. Priced separately.</div>
              </div>
              <a href="mailto:hello@signallabos.com?subject=Management%20tier" style={{
                background: 'transparent', color: BRT.ink,
                border: `1px solid ${BRT.divide}`,
                padding: '14px 24px', textDecoration: 'none',
                fontFamily: MONO, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', whiteSpace: 'nowrap',
              }}>
                Get in touch →
              </a>
            </div>
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────────────────────── */}
        <section style={{ ...sectionBorder, padding: '80px 0' }}>
          <div style={container}>
            <Eyebrow>FAQ</Eyebrow>
            <SectionHeading>Questions.<br />Straight answers.</SectionHeading>
            <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 1, background: BRT.divide, border: `1px solid ${BRT.divide}` }}>
              {faqs.map(f => (
                <div key={f.q} style={{ background: BRT.ticket, padding: '28px 32px' }}>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 20, letterSpacing: '-0.01em', color: BRT.ink, textTransform: 'uppercase' }}>{f.q}</div>
                  <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.75, color: BRT.inkSoft }}>{f.a}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── WAITLIST ───────────────────────────────────────────────────── */}
        <section id="waitlist" style={{ ...sectionBorder, padding: '80px 0' }}>
          <div style={{ ...container, maxWidth: 720, textAlign: 'center' }}>
            <Eyebrow>Early Access</Eyebrow>
            <h2 style={{
              fontFamily: DISPLAY, fontWeight: 900, fontSize: 'clamp(40px, 7vw, 88px)',
              lineHeight: 0.95, letterSpacing: '-0.04em', color: BRT.ink,
              textTransform: 'uppercase', marginTop: 20, marginBottom: 20,
            }}>
              Waitlist.
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: BRT.inkSoft, marginBottom: 32 }}>
              We open in small groups. We'll email when there's a spot.
            </p>

            {status === 'success' ? (
              <div style={{
                border: `1px solid ${BRT.red}`, padding: '32px 24px',
                fontFamily: MONO, fontSize: 13, letterSpacing: '0.18em', color: BRT.red, textTransform: 'uppercase',
              }}>
                {message}
              </div>
            ) : (
              <form onSubmit={handleWaitlistSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  type="email"
                  placeholder="EMAIL ADDRESS"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  style={{
                    background: BRT.ticket, border: `1px solid ${BRT.divide}`,
                    color: BRT.ink, padding: '18px 20px',
                    fontFamily: MONO, fontSize: 13, letterSpacing: '0.1em',
                    outline: 'none', width: '100%', boxSizing: 'border-box',
                  }}
                />
                {status === 'error' && (
                  <div style={{ fontFamily: MONO, fontSize: 11, color: BRT.red, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{message}</div>
                )}
                <button
                  type="submit"
                  disabled={status === 'loading' || !email}
                  style={{
                    background: status === 'loading' ? BRT.inkDim : BRT.red,
                    color: BRT.ink, border: `1px solid ${BRT.red}`,
                    padding: '18px 24px',
                    fontFamily: MONO, fontSize: 12, letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 700,
                    cursor: status === 'loading' || !email ? 'default' : 'pointer',
                    width: '100%',
                  }}
                >
                  {status === 'loading' ? 'SUBMITTING…' : 'REQUEST EARLY ACCESS →'}
                </button>
              </form>
            )}

            <div style={{ marginTop: 20, fontFamily: MONO, fontSize: 10, letterSpacing: '0.2em', color: BRT.inkDim, textTransform: 'uppercase' }}>
              Private beta · Personal onboarding · No spam
            </div>
          </div>
        </section>

        {/* ── FOOTER ─────────────────────────────────────────────────────── */}
        <footer style={{ ...sectionBorder, padding: '32px 0' }}>
          <div style={{ ...container, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 14, letterSpacing: '-0.01em', color: BRT.ink, textTransform: 'uppercase' }}>
              Signal Lab OS
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', color: BRT.inkDim, textTransform: 'uppercase' }}>
              signallabos.com
            </div>
          </div>
        </footer>

      </main>
    </div>
  )
}
