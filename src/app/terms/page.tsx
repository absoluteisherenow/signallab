export const dynamic = 'force-dynamic'

const C = {
  bg: '#050505',
  panel: '#0e0e0e',
  border: '#1d1d1d',
  gold: '#ff2a1a',
  text: '#f2f2f2',
  dim: '#909090',
  dimmer: '#909090',
}

export default function TermsPage() {
  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", minHeight: '100vh' }}>

      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(7,7,6,0.94)', borderBottom: `1px solid ${C.border}`,
        padding: '18px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backdropFilter: 'blur(12px)',
      }}>
        <a href="/" style={{ fontSize: '11px', fontWeight: 300, letterSpacing: '0.2em', color: C.gold, textDecoration: 'none' }}>
          SIGNAL LAB OS
        </a>
      </nav>

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '120px 48px 80px' }}>

        <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: C.gold, textTransform: 'uppercase', marginBottom: '12px' }}>
          Legal
        </div>
        <h1 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 300, letterSpacing: '0.04em', marginBottom: '8px' }}>
          Terms of Service
        </h1>
        <p style={{ fontSize: '11px', color: C.dimmer, letterSpacing: '0.06em', marginBottom: '52px' }}>
          Last updated: April 2026
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

          <section>
            <h2 style={{ fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              Acceptance
            </h2>
            <p style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em' }}>
              By creating a Signal Lab OS account or using any part of the service at signallabos.com, you agree to these Terms of Service. Signal Lab OS is operated by ABSOLUTE. If you do not agree, do not use the service.
            </p>
          </section>

          <div style={{ width: '100%', height: '1px', background: C.border }} />

          <section>
            <h2 style={{ fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              The Service
            </h2>
            <p style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em' }}>
              Signal Lab OS is a creative business platform for independent electronic music artists. It includes tools for scheduling and publishing posts to connected social accounts (including TikTok, Instagram, Threads, and YouTube), managing releases, gigs, and invoices, and viewing analytics pulled from those connected accounts.
            </p>
          </section>

          <div style={{ width: '100%', height: '1px', background: C.border }} />

          <section>
            <h2 style={{ fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              Your Content
            </h2>
            <div style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p>You retain all ownership of the content you upload, schedule, or publish through Signal Lab OS.</p>
              <p>You are solely responsible for the content you publish through the service. You must have the rights to any audio, video, images, and text you upload, and your content must comply with the policies of every platform it is published to (including TikTok&apos;s Community Guidelines and Terms of Service).</p>
              <p>You grant Signal Lab OS a limited licence to store, process, and transmit your content strictly to perform the actions you initiate — publishing posts, storing media, and retrieving analytics on your behalf.</p>
            </div>
          </section>

          <div style={{ width: '100%', height: '1px', background: C.border }} />

          <section>
            <h2 style={{ fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              Connected Accounts
            </h2>
            <p style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em' }}>
              When you connect a third-party account (TikTok, Instagram, Threads, YouTube, etc.), you authorise Signal Lab OS to access that account via the provider&apos;s official API using OAuth. Access tokens are stored securely and used only to perform actions you initiate. You can disconnect any account at any time from inside the platform, which revokes access immediately.
            </p>
          </section>

          <div style={{ width: '100%', height: '1px', background: C.border }} />

          <section>
            <h2 style={{ fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              Acceptable Use
            </h2>
            <div style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p>You agree not to use Signal Lab OS to publish content that is unlawful, infringing, deceptive, harassing, or that violates the terms of any connected platform.</p>
              <p>You agree not to attempt to reverse engineer, resell, or abuse the service, its APIs, or any connected third-party APIs accessed through it.</p>
              <p>We may suspend or terminate accounts that violate these terms or that are reported for abuse by a connected platform.</p>
            </div>
          </section>

          <div style={{ width: '100%', height: '1px', background: C.border }} />

          <section>
            <h2 style={{ fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              Service Availability
            </h2>
            <p style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em' }}>
              Signal Lab OS is provided on an &ldquo;as is&rdquo; basis. We do not guarantee uninterrupted service, and the availability of features that depend on third-party APIs (TikTok, Meta, YouTube, etc.) is subject to those providers&apos; uptime and policy changes.
            </p>
          </section>

          <div style={{ width: '100%', height: '1px', background: C.border }} />

          <section>
            <h2 style={{ fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              Limitation of Liability
            </h2>
            <p style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em' }}>
              To the maximum extent permitted by law, Signal Lab OS and ABSOLUTE are not liable for indirect, incidental, or consequential damages arising out of your use of the service, including losses caused by third-party platform policy changes, outages, or account actions taken by connected platforms.
            </p>
          </section>

          <div style={{ width: '100%', height: '1px', background: C.border }} />

          <section>
            <h2 style={{ fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              Termination
            </h2>
            <p style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em' }}>
              You may terminate your account at any time by contacting us at advancingabsolute@gmail.com. Upon termination, your data is removed in accordance with our Privacy Policy.
            </p>
          </section>

          <div style={{ width: '100%', height: '1px', background: C.border }} />

          <section>
            <h2 style={{ fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              Changes
            </h2>
            <p style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em' }}>
              We may update these terms as the service evolves. Material changes will be posted on this page with a revised &ldquo;last updated&rdquo; date.
            </p>
          </section>

          <div style={{ width: '100%', height: '1px', background: C.border }} />

          <section>
            <h2 style={{ fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              Contact
            </h2>
            <p style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em' }}>
              Signal Lab OS · advancingabsolute@gmail.com
            </p>
          </section>

        </div>
      </div>

      <footer style={{
        padding: '32px 48px', borderTop: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: '10px', color: C.dimmer, letterSpacing: '0.08em',
        marginTop: '40px',
      }}>
        <div style={{ fontSize: '10px', fontWeight: 300, letterSpacing: '0.14em' }}>
          SIGNAL LAB OS
        </div>
        <div>signallabos.com</div>
      </footer>

    </div>
  )
}
