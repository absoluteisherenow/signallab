import type { Metadata } from 'next'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Night Manoeuvres - The Modular Suite',
  description: 'The operating system for electronic music artists',
  viewport: 'width=device-width, initial-scale=1',
}

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ background: "#070706", color: "#f0ebe2", margin: 0, padding: 0 }}>
        <main style={{ width: "100%", minHeight: "100vh" }}>
          {children}
        </main>
      </body>
    </html>
  )
}
