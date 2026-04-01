import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Signal Lab OS — Early Access',
  description: 'Tailored OS for electronic music. Tour, content, production, sets — one connected system.',
}

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', background: '#070706' }}>{children}</div>
}
