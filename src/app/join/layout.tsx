import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Signal Lab OS — Early Access',
  description: 'Tailored Artist OS. Tour, content, production, sets — one system for the electronic music artist.',
}

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', background: '#070706' }}>{children}</div>
}
