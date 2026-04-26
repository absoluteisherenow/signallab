// ── /billing-terms ──────────────────────────────────────────────────────────
// Subscription-specific terms. Companion to /terms (general ToS) and
// /privacy. Anthony — review and tweak before public launch; this is a
// reasonable starting baseline for a UK-incorporated SaaS with monthly
// auto-renew billing via Stripe.

import { BRT } from '@/lib/design/brt'

const DISPLAY = '"Helvetica Neue", Helvetica, Arial, sans-serif'

export const metadata = {
  title: 'Billing terms · Signal Lab OS',
}

export default function BillingTermsPage() {
  return (
    <main style={{ background: BRT.bg, color: BRT.ink, minHeight: '100vh' }}>
      <div className="max-w-[760px] mx-auto px-6 py-16 md:py-24">
        <div className="font-mono text-[11px] uppercase tracking-[0.32em]" style={{ color: BRT.red }}>
          Legal
        </div>
        <h1
          className="mt-3 font-black uppercase leading-[1] tracking-[-0.02em]"
          style={{ fontFamily: DISPLAY, fontSize: 'clamp(36px, 5vw, 56px)' }}
        >
          Billing terms
        </h1>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: BRT.inkDim }}>
          Last updated: 24 April 2026
        </p>

        <div className="mt-10 space-y-8 font-mono text-[13.5px] leading-[1.8]" style={{ color: BRT.inkSoft }}>
          <section>
            <h2 className="text-[14px] uppercase tracking-[0.18em] mb-3" style={{ color: BRT.ink }}>1. Subscription</h2>
            <p>
              Signal Lab OS is sold as a recurring monthly subscription. By subscribing you authorise us, via Stripe, to charge
              the listed price each month until you cancel. Prices are in GBP (£) and listed on /pricing. UK customers are
              charged VAT at the prevailing rate.
            </p>
          </section>

          <section>
            <h2 className="text-[14px] uppercase tracking-[0.18em] mb-3" style={{ color: BRT.ink }}>2. Renewal &amp; cancellation</h2>
            <p>
              Subscriptions renew automatically each month on the anniversary of your initial purchase. You may cancel at any
              time via /billing → Manage in Stripe. Cancellation takes effect at the end of the current billing period — your
              access continues until that date. We do not pro-rate refunds for partial months unless required by law.
            </p>
          </section>

          <section>
            <h2 className="text-[14px] uppercase tracking-[0.18em] mb-3" style={{ color: BRT.ink }}>3. Upgrades &amp; downgrades</h2>
            <p>
              Upgrades are billed pro-rata for the remainder of the current period. Downgrades take effect at the start of the
              next billing period. Tier limits (scans, captions, deep dives, artist scans) reset on the 1st of each calendar
              month regardless of subscription start date.
            </p>
          </section>

          <section>
            <h2 className="text-[14px] uppercase tracking-[0.18em] mb-3" style={{ color: BRT.ink }}>4. Failed payments</h2>
            <p>
              If a payment fails, Stripe will retry the charge up to three times over seven days. If still unsuccessful your
              account moves to past_due status — write access is paused; read access continues for 14 days. After 14 days of
              non-payment the account is downgraded to free tier and historical data is preserved for 90 days before deletion.
            </p>
          </section>

          <section>
            <h2 className="text-[14px] uppercase tracking-[0.18em] mb-3" style={{ color: BRT.ink }}>5. Refunds</h2>
            <p>
              We offer a 14-day money-back guarantee on the first month of any new subscription — email
              {' '}<a href="mailto:hello@signallabos.com" style={{ color: BRT.ink, textDecoration: 'underline' }}>hello@signallabos.com</a>
              {' '}with your account email. After 14 days, monthly charges are non-refundable. UK consumer rights are not affected.
            </p>
          </section>

          <section>
            <h2 className="text-[14px] uppercase tracking-[0.18em] mb-3" style={{ color: BRT.ink }}>6. Price changes</h2>
            <p>
              We will give at least 30 days' notice by email before any price change affecting your plan. You may cancel before
              the change takes effect; otherwise continued use after the renewal date constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-[14px] uppercase tracking-[0.18em] mb-3" style={{ color: BRT.ink }}>7. Data on cancellation</h2>
            <p>
              On cancellation your data is retained for 90 days for reactivation. After 90 days it is permanently deleted from
              production systems. Backups are purged on a 30-day rolling basis. Export is available on request via
              {' '}<a href="mailto:hello@signallabos.com?subject=Data%20export" style={{ color: BRT.ink, textDecoration: 'underline' }}>hello@signallabos.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-[14px] uppercase tracking-[0.18em] mb-3" style={{ color: BRT.ink }}>8. Contact</h2>
            <p>
              Questions about billing: <a href="mailto:hello@signallabos.com" style={{ color: BRT.ink, textDecoration: 'underline' }}>hello@signallabos.com</a>.
              These billing terms supplement, and are subject to, our <a href="/terms" style={{ color: BRT.ink, textDecoration: 'underline' }}>general Terms</a> and <a href="/privacy" style={{ color: BRT.ink, textDecoration: 'underline' }}>Privacy Policy</a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
