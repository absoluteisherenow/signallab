import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Content Upload — Signal Lab OS',
}

export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', background: '#070706' }}>{children}</div>
}
