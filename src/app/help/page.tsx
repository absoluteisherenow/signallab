// ── /help ──────────────────────────────────────────────────────────────────
// Single-page help + contact escalation surface. Static during private beta.
// Email goes to hello@signallabos.com (manual triage). Once support volume
// climbs we can graduate to a ticket system.

import { BRT } from '@/lib/design/brt'

const DISPLAY = '"Helvetica Neue", Helvetica, Arial, sans-serif'

export const metadata = {
  title: 'Help · Signal Lab OS',
  description: 'Get in touch. Common questions. Status.',
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I cancel?',
    a: 'Go to /billing → Manage in Stripe → Cancel plan. Access continues until the period ends.',
  },
  {
    q: 'Can I switch tiers?',
    a: 'Yes. Manage in Stripe lets you upgrade or downgrade at any time. Upgrades pro-rate immediately, downgrades take effect next billing period.',
  },
  {
    q: 'What happens if I hit my monthly limit?',
    a: 'The action is blocked until the next reset (1st of the month). You can upgrade for instant headroom — pro-rated billing kicks in straight away.',
  },
  {
    q: 'Do you charge VAT?',
    a: 'UK customers pay VAT at the standard rate. Other regions per Stripe Tax — invoices include the breakdown.',
  },
  {
    q: 'My Instagram disconnected. What now?',
    a: 'Settings → Connections → Reconnect Instagram. Tokens expire every 60 days; we will email you ~7 days before.',
  },
  {
    q: 'Can I export my data?',
    a: 'Yes. Email hello@signallabos.com with the subject "Data export" and we will send a JSON dump within 7 days. Per UK GDPR.',
  },
]

export default function HelpPage() {
  return (
    <main style={{ background: BRT.bg, color: BRT.ink, minHeight: '100vh' }}>
      <div className="max-w-[820px] mx-auto px-6 py-16 md:py-24">
        <div className="font-mono text-[11px] uppercase tracking-[0.32em]" style={{ color: BRT.red }}>
          Help
        </div>
        <h1
          className="mt-3 font-black uppercase leading-[0.95] tracking-[-0.02em]"
          style={{ fontFamily: DISPLAY, fontSize: 'clamp(40px, 5vw, 64px)' }}
        >
          We answer every email.
        </h1>
        <p className="mt-6 font-mono text-[14px] leading-[1.7] max-w-[560px]" style={{ color: BRT.inkSoft }}>
          Email <a href="mailto:hello@signallabos.com" style={{ color: BRT.ink, textDecoration: 'underline' }}>hello@signallabos.com</a>.
          Anthony reads each one personally during beta. Reply target: same day for paying users, 48 hours otherwise.
        </p>

        <h2
          className="mt-16 font-black uppercase tracking-[-0.02em]"
          style={{ fontFamily: DISPLAY, fontSize: 'clamp(22px, 2.4vw, 32px)' }}
        >
          Common questions
        </h2>
        <div className="mt-6 divide-y" style={{ borderTop: `1px solid ${BRT.divide}`, borderBottom: `1px solid ${BRT.divide}` }}>
          {FAQ.map(({ q, a }) => (
            <div key={q} className="py-6" style={{ borderColor: BRT.divide }}>
              <div className="font-mono text-[13px] uppercase tracking-[0.18em]" style={{ color: BRT.ink }}>
                {q}
              </div>
              <div className="mt-3 font-mono text-[13px] leading-[1.7]" style={{ color: BRT.inkSoft }}>
                {a}
              </div>
            </div>
          ))}
        </div>

        <h2
          className="mt-16 font-black uppercase tracking-[-0.02em]"
          style={{ fontFamily: DISPLAY, fontSize: 'clamp(22px, 2.4vw, 32px)' }}
        >
          Something urgent?
        </h2>
        <p className="mt-4 font-mono text-[13px] leading-[1.7]" style={{ color: BRT.inkSoft }}>
          Email <a href="mailto:hello@signallabos.com?subject=URGENT" style={{ color: BRT.red, textDecoration: 'underline' }}>hello@signallabos.com</a> with "URGENT" in the subject. Phone support coming with the management tier.
        </p>

        <div className="mt-16 font-mono text-[11px]" style={{ color: BRT.inkDim }}>
          <a href="/terms" style={{ color: BRT.inkDim, textDecoration: 'underline' }}>Terms</a>
          {' · '}
          <a href="/billing-terms" style={{ color: BRT.inkDim, textDecoration: 'underline' }}>Billing terms</a>
          {' · '}
          <a href="/privacy" style={{ color: BRT.inkDim, textDecoration: 'underline' }}>Privacy</a>
        </div>
      </div>
    </main>
  )
}
