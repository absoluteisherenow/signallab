'use client'

import { useEffect } from 'react'

export default function AdvanceLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add('advance-active')
    return () => { document.body.classList.remove('advance-active') }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#070706' }}>
      {children}
    </div>
  )
}
