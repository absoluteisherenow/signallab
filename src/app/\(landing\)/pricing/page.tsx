'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const COLORS = {
  bg: '#070706',
  panel: '#0e0d0b',
  border: '#1a1917',
  borderMid: '#2e2c29',
  gold: '#b08d57',
  text: '#f0ebe2',
  textDim: '#8a8780',
  textDimmer: '#52504c',
  dimmest: '#2e2c29',
  green: '#3d6b4a',
  blue: '#6a7a9a',
  redBrown: '#9a6a5a',
}

const TIERS = [
  {
    name: 'Artist',
    price: '£29',
    period: '/month',
    desc: 'For independent artists managing their own career',
    color: '#8a7a6a',
    features: [
      'Signal Lab — unlimited gigs & content planning',
      'Broadcast Lab — 30 captions/month',
      'Set Lab — unlimited DJ tools',
      'Advance request forms (automated)',
      'Buffer publishing & scheduling',
      'Supabase persistence (secure cloud backup)',
      'Email support',
    ],
    cta: 'Get Access',
    href: '/login',
  },
  {
    name: 'Pro',
    price: '£59',
    period: '/month',
    desc: 'For serious artists and their teams',
    color: COLORS.gold,
    highlight: true,
    features: [
      'Everything in Artist',
      'Sonix Lab — unlimited (all 18 mixdown chains)',
      'Max for Live integration (Ableton native)',
      'Broadcast Lab — unlimited captions',
      'Intelligent media scanner & library',
      'Gmail integration & auto-replies',
      'PDF advance sheets & invoicing',
      'Priority support (1-hour response)',
    ],
    cta: 'Get Access',
    href: '/login',
  },
  {
    name: 'Agency',
    price: '£99',
    period: '/month',
    desc: 'For management companies and booking agents',
    color: '#6a8a7a',
    features: [
      'Everything in Pro',
      'Multi-artist profiles (up to 10)',
      'Roster dashboard & analytics',
      'Agency-branded advance forms',
      'Cross-artist revenue tracking',
      'Dedicated onboarding call',
      'API access for custom integrations',
      'Team collaboration tools',
    ],
    cta: 'Get Access',
    href: '/login',
  },
]

const BENEFITS = [
  {
    title: 'Stop Using Spreadsheets',
    desc: 'Gig management, invoicing, contracts — all in one place. No more Discord DMs with promoters or lost emails.',
    icon: '📊',
  },
  {
    title: 'Post 3x More Content',
    desc: 'AI caption generation tuned to your voice. Safe, Loose, Raw variants. Post to Instagram, TikTok, Threads in seconds.',
    icon: '📱',
  },
  {
    title: 'Professional Production',
    desc: '18 mixdown chains + Max for Live integration. One-click chain loading in Ableton. No more plugin hunting.',
    icon: '🎚️',
  },
  {
    title: 'Smart DJ Tools',
    desc: 'Camelot-aware set building, energy visualization, harmonic flow analysis. Better than Mixed In Key.',
    icon: '🎧',
  },
  {
    title: 'Save on Every Show',
    desc: 'Advancers charges £150/show. We\'re £59/month. At 20 shows/year, you save £2,292. That\'s real money.',
    icon: '💰',
  },
  {
    title: 'Built for Your Lane',
    desc: 'Designed by touring electronic musicians. Every feature exists because we needed it.',
    icon: '🎵',
  },
]

const FAQ = [
  {
    q: 'Do I need to use all four modules?',
    a: 'No. Use what you need. Signal Lab for touring? Just that. Broadcast Lab for content? Just that. But they\'re stronger together — gig data syncs to your content calendar.',
  },
  {
    q: 'Can I try it before I buy?',
    a: 'Yes. We run early access in rolling cohorts. Join the waitlist and we\'ll notify you when spots open. No credit card required.',
  },
  {
    q: 'What if I only do 5 shows a year?',
    a: 'Signal Lab costs the same whether you do 5 shows or 50. The ROI is still there — especially if you\'re booking your own tours.',
  },
  {
    q: 'Does it work with my existing tools?',
    a: 'We support Gmail, Buffer, Rekordbox, and Ableton Live (Max for Live). More integrations coming soon. Custom API access available for Pro/Agency tiers.',
  },
  {
    q: 'What about my data? Is it secure?',
    a: 'All data stored in Supabase with enterprise-grade encryption. We don\'t sell your data. Ever. You own your gig records, contacts, and content.',
  },
]

export default function PricingPage() {
  const router = useRouter()
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div style={{ background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Mono', monospace", minHeight: '100vh' }}>
      {/* NAV */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: `rgba(7,7,6,0.92)`,
          borderBottom: `1px solid ${COLORS.border}`,
          padding: '20px 48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Link href="/">
          <div
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontSize: '11px',
              fontWeight: 300,
              letterSpacing: '0.2em',
              color: COLORS.gold,
              cursor: 'pointer',
            }}
          >
            THE MODULAR SUITE
          </div>
        </Link>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <Link
            href="/login"
            style={{
              fontSize: '10px',
              letterSpacing: '0.15em',
              color: COLORS.textDim,
              textDecoration: 'none',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.gold)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}
          >
            Sign in
          </Link>
          <Link
            href="/login"
            style={{
              fontSize: '10px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              background: COLORS.gold,
              color: COLORS.bg,
              padding: '10px 20px',
              textDecoration: 'none',
              border: `1px solid ${COLORS.gold}`,
              transition: 'all 0.15s',
            }}
          >
            Get Access →
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section
        style={{
          minHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '120px 48px 80px',
          textAlign: 'center',
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div
          style={{
            fontSize: '9px',
            letterSpacing: '0.3em',
            color: COLORS.gold,
            textTransform: 'uppercase',
            marginBottom: '32px',
          }}
        >
          Simple, Honest Pricing
        </div>

        <h1
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontSize: 'clamp(32px, 5vw, 60px)',
            fontWeight: 200,
            letterSpacing: '0.04em',
            lineHeight: 1.1,
            marginBottom: '20px',
            maxWidth: '900px',
          }}
        >
          One system. Four modules. Your price.
        </h1>

        <p
          style={{
            fontSize: '13px',
            color: COLORS.textDim,
            lineHeight: '1.8',
            maxWidth: '640px',
            letterSpacing: '0.04em',
            marginBottom: '40px',
          }}
        >
          Designed for artists who want to own their career. No hidden fees. No feature gates. Just professional tools at a fair price.
        </p>
      </section>

      {/* PRICING TIERS */}
      <section style={{ padding: '80px 48px', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '32px',
              marginBottom: '80px',
            }}
          >
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                style={{
                  background: tier.highlight ? `linear-gradient(135deg, ${COLORS.panel} 0%, #1a1310 100%)` : COLORS.panel,
                  border: `2px solid ${tier.highlight ? tier.color : COLORS.border}`,
                  padding: '48px 32px',
                  position: 'relative',
                  transform: tier.highlight ? 'scale(1.04)' : 'scale(1)',
                  transition: 'all 0.2s',
                }}
              >
                {tier.highlight && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-14px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: tier.color,
                      color: COLORS.bg,
                      padding: '6px 16px',
                      fontSize: '9px',
                      letterSpacing: '0.1em',
                      fontWeight: 'bold',
                    }}
                  >
                    MOST POPULAR
                  </div>
                )}

                <h3
                  style={{
                    fontSize: '18px',
                    fontWeight: 'bold',
                    color: tier.color,
                    marginBottom: '8px',
                    letterSpacing: '0.08em',
                  }}
                >
                  {tier.name}
                </h3>

                <p
                  style={{
                    fontSize: '12px',
                    color: COLORS.textDim,
                    marginBottom: '24px',
                    lineHeight: '1.6',
                    minHeight: '48px',
                  }}
                >
                  {tier.desc}
                </p>

                <div style={{ marginBottom: '32px' }}>
                  <div
                    style={{
                      fontSize: '36px',
                      fontWeight: 'bold',
                      color: tier.color,
                      letterSpacing: '0.02em',
                    }}
                  >
                    {tier.price}
                    <span
                      style={{
                        fontSize: '12px',
                        color: COLORS.textDim,
                        fontWeight: 'normal',
                        marginLeft: '8px',
                      }}
                    >
                      {tier.period}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '9px',
                      color: COLORS.textDimmer,
                      letterSpacing: '0.08em',
                      marginTop: '8px',
                    }}
                  >
                    Billed monthly · Cancel anytime
                  </div>
                </div>

                <button
                  onClick={() => router.push(tier.href)}
                  style={{
                    width: '100%',
                    background: tier.highlight ? tier.color : 'transparent',
                    color: tier.highlight ? COLORS.bg : tier.color,
                    border: `1px solid ${tier.color}`,
                    padding: '14px 32px',
                    fontSize: '10px',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    marginBottom: '32px',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (tier.highlight) {
                      e.currentTarget.style.opacity = '0.85'
                    } else {
                      e.currentTarget.style.background = tier.color + '15'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (tier.highlight) {
                      e.currentTarget.style.opacity = '1'
                    } else {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  {tier.cta} →
                </button>

                <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: '32px' }}>
                  <div
                    style={{
                      fontSize: '9px',
                      letterSpacing: '0.1em',
                      color: COLORS.textDimmer,
                      textTransform: 'uppercase',
                      marginBottom: '16px',
                    }}
                  >
                    Includes:
                  </div>
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        style={{
                          fontSize: '12px',
                          color: COLORS.textDim,
                          lineHeight: '1.6',
                          paddingLeft: '20px',
                          position: 'relative',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            left: 0,
                            color: tier.color,
                          }}
                        >
                          ✓
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {/* ROI COMPARISON */}
          <div
            style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              padding: '48px',
              textAlign: 'center',
            }}
          >
            <h3
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: '20px',
                fontWeight: 200,
                marginBottom: '24px',
                letterSpacing: '0.04em',
              }}
            >
              The Math
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '32px',
                marginBottom: '32px',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '28px',
                    fontWeight: 'bold',
                    color: COLORS.gold,
                    marginBottom: '8px',
                  }}
                >
                  £150
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: COLORS.textDim,
                  }}
                >
                  Advancers charges per show
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  color: COLORS.textDimmer,
                }}
              >
                vs
              </div>

              <div>
                <div
                  style={{
                    fontSize: '28px',
                    fontWeight: 'bold',
                    color: COLORS.green,
                    marginBottom: '8px',
                  }}
                >
                  £59
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: COLORS.textDim,
                  }}
                >
                  Pro tier per month
                </div>
              </div>
            </div>

            <p
              style={{
                fontSize: '13px',
                color: COLORS.textDim,
                lineHeight: '1.8',
                maxWidth: '600px',
                margin: '0 auto',
              }}
            >
              At just 20 shows a year, that's £3,000 vs £708. <br />
              <strong style={{ color: COLORS.text }}>
                You break even at 4 shows. Everything else is profit.
              </strong>
              <br />
              Plus, we do everything Advancers does — advance requests, logistics, invoicing — plus content, music production, and DJ tools.
            </p>
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section style={{ padding: '80px 48px', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontSize: 'clamp(24px, 3vw, 40px)',
              fontWeight: 200,
              letterSpacing: '0.04em',
              marginBottom: '60px',
              textAlign: 'center',
            }}
          >
            Why The Modular Suite?
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '40px',
            }}
          >
            {BENEFITS.map((benefit) => (
              <div key={benefit.title}>
                <div
                  style={{
                    fontSize: '40px',
                    marginBottom: '16px',
                  }}
                >
                  {benefit.icon}
                </div>
                <h3
                  style={{
                    fontSize: '16px',
                    fontWeight: 'bold',
                    marginBottom: '12px',
                    letterSpacing: '0.08em',
                    color: COLORS.gold,
                  }}
                >
                  {benefit.title}
                </h3>
                <p
                  style={{
                    fontSize: '13px',
                    color: COLORS.textDim,
                    lineHeight: '1.7',
                  }}
                >
                  {benefit.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: '80px 48px', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontSize: 'clamp(24px, 3vw, 40px)',
              fontWeight: 200,
              letterSpacing: '0.04em',
              marginBottom: '60px',
              textAlign: 'center',
            }}
          >
            Questions?
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {FAQ.map((item, idx) => (
              <div
                key={idx}
                style={{
                  border: `1px solid ${COLORS.border}`,
                  background: openFaq === idx ? COLORS.panel : 'transparent',
                  transition: 'all 0.2s',
                }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  style={{
                    width: '100%',
                    padding: '20px 24px',
                    background: 'transparent',
                    border: 'none',
                    color: COLORS.text,
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '13px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: 'bold', letterSpacing: '0.02em' }}>{item.q}</span>
                  <span
                    style={{
                      color: COLORS.gold,
                      fontSize: '16px',
                      transition: 'transform 0.2s',
                      transform: openFaq === idx ? 'rotate(180deg)' : 'rotate(0)',
                    }}
                  >
                    ↓
                  </span>
                </button>

                {openFaq === idx && (
                  <div
                    style={{
                      padding: '0 24px 20px',
                      borderTop: `1px solid ${COLORS.border}`,
                      fontSize: '12px',
                      color: COLORS.textDim,
                      lineHeight: '1.8',
                    }}
                  >
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 48px' }}>
        <div
          style={{
            maxWidth: '600px',
            margin: '0 auto',
            textAlign: 'center',
            borderTop: `1px solid ${COLORS.border}`,
            paddingTop: '80px',
          }}
        >
          <h2
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontSize: 'clamp(24px, 3vw, 40px)',
              fontWeight: 200,
              letterSpacing: '0.04em',
              marginBottom: '20px',
            }}
          >
            Ready to level up?
          </h2>

          <p
            style={{
              fontSize: '13px',
              color: COLORS.textDim,
              lineHeight: '1.8',
              marginBottom: '40px',
            }}
          >
            Join the early access. Limited spots available. We're onboarding artists and management companies personally.
          </p>

          <button
            onClick={() => router.push('/login')}
            style={{
              fontSize: '10px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              background: COLORS.gold,
              color: COLORS.bg,
              padding: '16px 40px',
              border: `1px solid ${COLORS.gold}`,
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.15s',
              fontFamily: "'DM Mono', monospace",
              marginBottom: '16px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Get Access →
          </button>

          <div
            style={{
              fontSize: '10px',
              color: COLORS.textDimmer,
              letterSpacing: '0.08em',
            }}
          >
            No credit card required
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer
        style={{
          padding: '40px 48px',
          borderTop: `1px solid ${COLORS.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '32px',
          fontSize: '10px',
          color: COLORS.textDimmer,
          letterSpacing: '0.08em',
        }}
      >
        <div
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontSize: '11px',
            fontWeight: 300,
            letterSpacing: '0.15em',
          }}
        >
          THE MODULAR SUITE
        </div>

        <div
          style={{
            display: 'flex',
            gap: '32px',
          }}
        >
          <Link
            href="/"
            style={{
              color: COLORS.textDim,
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.gold)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}
          >
            Home
          </Link>
          <a
            href="https://github.com/absoluteisherenow"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: COLORS.textDim,
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.gold)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}
          >
            GitHub
          </a>
        </div>

        <div>© 2026 · Private Beta</div>
      </footer>
    </div>
  )
}
