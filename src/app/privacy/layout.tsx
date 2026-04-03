import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Signal Lab OS',
}

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', background: '#070706' }}>{children}</div>
}
