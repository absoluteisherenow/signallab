import type { Metadata } from 'next'
import './globals.css'
import { Navigation } from '@/components/layout/Navigation'

export const metadata: Metadata = {
  title: 'Night Manoeuvres - Signal Lab Dashboard',
  description: 'Professional DJ & Event Management Dashboard',
  viewport: 'width=device-width, initial-scale=1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ background: "#070706", color: "#f0ebe2" }}>
        <div className="flex" style={{ minHeight: "100vh" }}>
          <Navigation />
          <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: "100vh" }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
