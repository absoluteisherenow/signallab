'use client'

import { useEffect, useState, Suspense } from 'react'
import { GigsList } from '@/components/gigs/GigsList'
import { TravelGenius } from '@/components/business/TravelGenius'
import MobileGigs from '@/components/mobile/MobileGigs'

export default function GigsPage() {
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
  if (mobile) return <MobileGigs />
  return (
    <Suspense>
      <GigsList />
      <TravelGenius />
    </Suspense>
  )
}
