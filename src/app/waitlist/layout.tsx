// ── (marketing) Layout ──────────────────────────────────────────────────────
// BRT design language (src/lib/design/brt.ts) — Helvetica 900 uppercase,
// Circoloco red accent, ticket-style cards, subtle scanline overlay. Sticky
// marketing header with SIGNAL LAB logo + labs/features/pricing nav + red
// WAITLIST button. The `scrollPaddingTop` keeps anchor jumps clear of the
// sticky header.

import Link from 'next/link'
import { BRT, BRT_OVERLAY } from '@/lib/design/brt'
import AnchorScroll from '@/components/marketing/AnchorScroll'

const DISPLAY = '"Helvetica Neue", Helvetica, Arial, sans-serif'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: BRT.bg,
        color: BRT.ink,
        minHeight: '100vh',
        scrollPaddingTop: '72px',
        position: 'relative',
      }}
    >
      {/* Anchor-link scroll handler — the real scroll container is the root
          layout's `main.app-main`, not the window, so native hash navigation
          doesn't work on its own. */}
      <AnchorScroll />

      {/* Scanline overlay — subtle CRT texture over the whole page */}
      <div style={BRT_OVERLAY.scanlines} />

      {/* Sticky header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: `${BRT.bg}f2`,
          backdropFilter: 'blur(8px)',
          borderBottom: `1px solid ${BRT.divide}`,
        }}
      >
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 h-[64px] flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <span
              className="text-[16px] md:text-[18px] font-black tracking-[-0.02em] uppercase"
              style={{ fontFamily: DISPLAY, color: BRT.ink }}
            >
              Signal Lab
            </span>
            <span
              className="font-mono text-[10px] tracking-[0.2em] uppercase hidden sm:inline"
              style={{ color: BRT.inkDim }}
            >
              OS
            </span>
          </Link>
          <nav className="flex items-center gap-4 sm:gap-7 shrink-0 font-mono">
            <a
              href="#labs"
              className="hidden md:block text-[11px] uppercase tracking-[0.2em] transition-colors"
              style={{ color: BRT.inkSoft }}
            >
              Labs
            </a>
            <a
              href="#moments"
              className="hidden md:block text-[11px] uppercase tracking-[0.2em] transition-colors"
              style={{ color: BRT.inkSoft }}
            >
              Features
            </a>
            <a
              href="#waitlist"
              className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.22em] px-3 py-2 sm:px-5 sm:py-2.5 transition-colors"
              style={{
                border: `1px solid ${BRT.red}`,
                color: BRT.red,
              }}
            >
              Waitlist
            </a>
          </nav>
        </div>
      </header>

      <main style={{ position: 'relative', zIndex: 2 }}>{children}</main>

      {/* Override the root .page-enter fadeIn so the marketing hero fits the
          viewport exactly — the translateY(4px) initial state was pushing the
          hero 4px below the fold during the 200ms animation window. */}
      <style>{`
        .page-enter {
          animation: none !important;
          transform: none !important;
          opacity: 1 !important;
        }
      `}</style>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${BRT.divide}`, position: 'relative', zIndex: 2 }}>
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="text-[14px] font-black tracking-[-0.01em] uppercase"
              style={{ fontFamily: DISPLAY, color: BRT.ink }}
            >
              Signal Lab OS
            </span>
            <span className="font-mono text-[10px] tracking-[0.2em]" style={{ color: BRT.inkDim }}>
              · Built by NIGHT manoeuvres
            </span>
          </div>
          <div className="flex items-center gap-6 font-mono text-[10px] tracking-[0.2em] uppercase">
            <a href="/privacy" style={{ color: BRT.inkDim }}>Privacy</a>
            <a href="mailto:hello@signallabos.com" style={{ color: BRT.inkDim }}>Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
