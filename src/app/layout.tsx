import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Navigation } from '@/components/layout/Navigation'
import { VoiceCommandBar } from '@/components/ui/VoiceCommandBarWrapper'

export const metadata: Metadata = {
  title: 'Night Manoeuvres — Artist OS',
  description: 'The operating system for electronic artists',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'NM OS',
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
      <head>
        <style>{`
          @media (max-width: 768px) {
            .app-layout {
              flex-direction: column !important;
            }
            .app-main {
              width: 100% !important;
              min-height: auto !important;
            }
            .sidebar-nav {
              width: 100% !important;
              min-width: 100% !important;
              border-right: none !important;
              border-bottom: 1px solid var(--border-dim);
              flex-direction: row !important;
              overflow-x: auto !important;
              overflow-y: hidden !important;
              height: auto !important;
              max-height: none !important;
              -webkit-overflow-scrolling: touch;
            }
            .sidebar-nav > div:first-child {
              padding: 12px 16px !important;
              border-bottom: none !important;
              border-right: 1px solid var(--border-dim) !important;
              flex-shrink: 0;
            }
            .sidebar-nav > div:nth-child(2) {
              display: flex !important;
              flex-direction: row !important;
              gap: 8px;
              padding: 10px 12px !important;
              min-width: max-content;
            }
            .sidebar-nav > div:nth-child(3) {
              border-top: none !important;
              border-left: 1px solid var(--border-dim) !important;
              flex-shrink: 0;
            }
          }
        `}</style>
      </head>
      <body style={{ background: 'var(--bg)', color: 'var(--text)', margin: 0, padding: 0, }} >
        <div className="app-layout" style={{ display: 'flex', minHeight: '100vh', width: '100%' }} >
          <Navigation />
          <main className="app-main" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: '100vh', }} >
            {children}
          </main>
          <VoiceCommandBar />
        </div>
      </body>
    </html>
  )
}
