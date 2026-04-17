'use client'

import { SignalLabHeader } from '@/components/broadcast/SignalLabHeader'
import { UnifiedComposer } from '@/components/broadcast/UnifiedComposer'

export default function QuickPostPage() {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <SignalLabHeader />
      <div style={{ padding: '32px 48px' }}>
        <UnifiedComposer />
      </div>
    </div>
  )
}
