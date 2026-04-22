'use client'

import { useEffect, useState } from 'react'
import { redirect } from 'next/navigation'
import MobileCrate from '@/components/mobile/MobileCrate'

export default function LibraryPage() {
  const [mobile, setMobile] = useState<boolean | null>(null)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const apply = () => setMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  if (mobile === null) {
    return <div style={{ minHeight: '100vh', background: '#050505' }} />
  }
  if (mobile) return <MobileCrate />
  redirect('/setlab')
}
