import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Navigation } from '@/components/layout/Navigation'
import { CommandPalette } from '@/components/ui/CommandPalette'
import { KeyboardShortcuts } from '@/components/ui/KeyboardShortcuts'
import { SignalGenius } from '@/components/dashboard/SignalGenius'
import { FetchProgress } from '@/components/ui/FetchProgress'
import { DesktopShell } from '@/components/desktop/DesktopShell'
import { ApprovalGateProvider } from '@/lib/approval-gate'
import { ToastProvider } from '@/lib/toast'
import { AutoFixPrompt } from '@/components/AutoFixPrompt'
import { GlobalErrorCatcher } from '@/components/GlobalErrorCatcher'
import { NativeBoot } from '@/components/NativeBoot'

export const metadata: Metadata = {
  title: 'Signal Lab OS',
  description: 'Tailored Artist OS',
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Signal Lab OS',
  },
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#050505',
  viewportFit: 'cover',
}

// iOS Home-Screen splash images. Without these, "Add to Home Screen"
// shows a blank white flash while the app boots. Each entry pairs a
// device-resolution media query with a pre-rendered PNG in /public/splash.
// Generated from public/icon-512.png via scripts/gen-splash.sh.
const APPLE_SPLASHES: Array<{ w: number; h: number; ratio: number }> = [
  { w: 1290, h: 2796, ratio: 3 }, // iPhone 15/14 Pro Max
  { w: 1179, h: 2556, ratio: 3 }, // iPhone 15/14 Pro
  { w: 1284, h: 2778, ratio: 3 }, // iPhone 14 Plus / 13 Pro Max
  { w: 1170, h: 2532, ratio: 3 }, // iPhone 14 / 13
  { w: 1125, h: 2436, ratio: 3 }, // iPhone 13 mini / X / 11 Pro
  { w: 828, h: 1792, ratio: 2 },  // iPhone XR / 11
  { w: 750, h: 1334, ratio: 2 },  // iPhone SE (2nd/3rd) / 8
  { w: 640, h: 1136, ratio: 2 },  // iPhone SE (1st)
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {APPLE_SPLASHES.map(({ w, h, ratio }) => {
          const cssW = w / ratio
          const cssH = h / ratio
          return (
            <link
              key={`${w}x${h}`}
              rel="apple-touch-startup-image"
              href={`/splash/splash-${w}x${h}.png`}
              media={`(device-width: ${cssW}px) and (device-height: ${cssH}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`}
            />
          )
        })}
      </head>
      <body style={{ background: 'var(--bg)', color: 'var(--text)', margin: 0, padding: 0 }}>
        <ApprovalGateProvider>
        <ToastProvider>
        <FetchProgress />
        <DesktopShell
          desktopChildren={
            <div className="app-shell" style={{ minHeight: '100vh', width: '100%' }}>
              <main className="app-main" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: '100vh' }}>
                <div className="page-enter">
                  {children}
                </div>
              </main>
            </div>
          }
        >
          <div className="app-shell" style={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
            <Navigation />
            <main className="app-main" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: '100vh' }}>
              <div className="page-enter">
                {children}
              </div>
            </main>
            <SignalGenius />
            <CommandPalette />
            <KeyboardShortcuts />
          </div>
        </DesktopShell>
        <AutoFixPrompt />
        <GlobalErrorCatcher />
        <NativeBoot />
        </ToastProvider>
        </ApprovalGateProvider>
        <script dangerouslySetInnerHTML={{ __html: `
  if ('serviceWorker' in navigator) {
    // Auto-reload once when a new SW activates so users never have to hard-
    // refresh after a deploy. Guarded by a session flag so we can never loop.
    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js').then(function(reg) {
        if (!reg) return;
        // If a waiting SW is already there from a previous visit, activate it.
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        reg.addEventListener('updatefound', function() {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', function() {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              // New SW ready + an old one is controlling — tell the new one
              // to activate immediately (controllerchange listener reloads).
              sw.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      }).catch(function() {});
    });
  }
`}} />
      </body>
    </html>
  )
}
