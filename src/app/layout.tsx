import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Navigation } from '@/components/layout/Navigation'
import { VoiceCommandBar } from '@/components/ui/VoiceCommandBarWrapper'
import { CommandPalette } from '@/components/ui/CommandPalette'
import { KeyboardShortcuts } from '@/components/ui/KeyboardShortcuts'
import { SignalGenius } from '@/components/dashboard/SignalGenius'

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
  themeColor: '#070706',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ background: 'var(--bg)', color: 'var(--text)', margin: 0, padding: 0 }}>
        <div className="app-shell" style={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
          <Navigation />
          <main className="app-main" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: '100vh' }}>
            <div className="page-enter">
              {children}
            </div>
          </main>
          <SignalGenius />
          <VoiceCommandBar />
          <CommandPalette />
          <KeyboardShortcuts />
        </div>
        <script dangerouslySetInnerHTML={{ __html: `
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js').catch(function() {});
    });
  }
`}} />
      </body>
    </html>
  )
}
