const C = {
  bg: '#050505',
  panel: '#0e0e0e',
  border: '#1d1d1d',
  gold: '#ff2a1a',
  text: '#f2f2f2',
  dim: '#909090',
  dimmer: '#909090',
}

export default function PrivacyPage() {
  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(7,7,6,0.94)', borderBottom: `1px solid ${C.border}`,
        padding: '18px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backdropFilter: 'blur(12px)',
      }}>
        <a href="/" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '11px', fontWeight: 300, letterSpacing: '0.2em', color: C.gold, textDecoration: 'none' }}>
          SIGNAL LAB OS
        </a>
      </nav>

      {/* CONTENT */}
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '120px 48px 80px' }}>

        <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: C.gold, textTransform: 'uppercase', marginBottom: '12px' }}>
          Legal
        </div>
        <h1 style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 'clamp(22px, 3vw, 32px)',
          fontWeight: 300, letterSpacing: '0.04em',
          marginBottom: '8px',
        }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: '11px', color: C.dimmer, letterSpacing: '0.06em', marginBottom: '52px' }}>
          Last updated: April 2026
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

          <section>
            <h2 style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              Who We Are
            </h2>
            <p style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em' }}>
              Signal Lab OS (signallabos.com) is a creative business platform for independent electronic music artists. It is operated by ABSOLUTE. For data enquiries, contact us at advancingabsolute@gmail.com.
            </p>
          </section>

          <div style={{ width: '100%', height: '1px', background: C.border }} />

          <section>
            <h2 style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              What Data We Collect
            </h2>
            <div style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p><strong style={{ color: C.text }}>Account data</strong> — your name and email address when you create an account.</p>
              <p><strong style={{ color: C.text }}>Connected platform credentials</strong> — when you connect Instagram, we store an access token issued by Meta on your behalf. We do not store your Instagram password.</p>
              <p><strong style={{ color: C.text }}>Content data</strong> — captions, media files, scheduled posts, and release campaign data that you create inside the platform.</p>
              <p><strong style={{ color: C.text }}>Platform analytics</strong> — engagement metrics (likes, comments, reach) fetched from connected accounts to display inside your analytics dashboard.</p>
              <p><strong style={{ color: C.text }}>Gig and financial data</strong> — touring, invoice, and contract information you enter into Tour Lab.</p>
            </div>
          </section>

          <div style={{ width: '100%', height: '1px', background: C.border }} />

          <section>
            <h2 style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              How We Use Your Data
            </h2>
            <div style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p>To provide the core service — post scheduling, campaign management, gig planning, and invoicing.</p>
              <p>To publish content to your connected social accounts when you explicitly trigger a post or schedule.</p>
              <p>To send automated DM replies to followers who comment a trigger keyword on your posts, when you have enabled that feature for a specific post.</p>
              <p>To retrieve and display performance metrics from your connected accounts.</p>
              <p>We do not sell your data. We do not use your data to train models. We do not share your data with third parties except as required to operate the service (Supabase for data storage, Vercel for hosting, Meta for Instagram API access).</p>
            </div>
          </section>

          <div style={{ width: '100%', height: '1px', background: C.border }} />

          <section>
            <h2 style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              Instagram / Meta Data
            </h2>
            <div style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p>When you connect your Instagram account, Signal Lab OS requests access to publish content, read comments, and send DM replies on your behalf via the Meta Graph API.</p>
              <p>Access tokens are stored securely in our database and used only to perform actions you initiate inside the platform. Tokens are never shared.</p>
              <p>You can disconnect your Instagram account at any time from within Signal Lab OS. This revokes our access immediately.</p>
              <p>To request deletion of your data from our systems, email advancingabsolute@gmail.com or use the data deletion link in your account settings.</p>
            </div>
          </section>

          <div style={{ width: '100%', height: '1px', background: C.border }} />

          <section>
            <h2 style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              Data Retention
            </h2>
            <p style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em' }}>
              Your data is retained for as long as your account is active. If you request account deletion, all associated data is removed within 30 days. Access tokens for connected platforms are deleted immediately upon disconnection.
            </p>
          </section>

          <div style={{ width: '100%', height: '1px', background: C.border }} />

          <section>
            <h2 style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              Your Rights
            </h2>
            <p style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em' }}>
              You have the right to access, correct, or delete your personal data at any time. To exercise any of these rights, contact us at advancingabsolute@gmail.com.
            </p>
          </section>

          <div style={{ width: '100%', height: '1px', background: C.border }} />

          <section>
            <h2 style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '12px', fontWeight: 300, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              Contact
            </h2>
            <p style={{ fontSize: '12px', color: C.dim, lineHeight: '1.9', letterSpacing: '0.03em' }}>
              Signal Lab OS · advancingabsolute@gmail.com
            </p>
          </section>

        </div>
      </div>

      {/* FOOTER */}
      <footer style={{
        padding: '32px 48px', borderTop: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: '10px', color: C.dimmer, letterSpacing: '0.08em',
        marginTop: '40px',
      }}>
        <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '10px', fontWeight: 300, letterSpacing: '0.14em' }}>
          SIGNAL LAB OS
        </div>
        <div>signallabos.com</div>
      </footer>

    </div>
  )
}
