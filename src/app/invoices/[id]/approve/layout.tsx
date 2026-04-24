'use client'

import { useEffect } from 'react'

export default function ApproveLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add('approve-active')
    return () => { document.body.classList.remove('approve-active') }
  }, [])

  return <>{children}</>
}
