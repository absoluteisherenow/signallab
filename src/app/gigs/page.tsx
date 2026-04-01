'use client'

import { GigsList } from '@/components/gigs/GigsList'
import { TravelGenius } from '@/components/business/TravelGenius'
import { Suspense } from 'react'
import { useMobile } from '@/hooks/useMobile'
import MobileGigs from '@/components/mobile/MobileGigs'

export default function GigsPage() {
  const mobile = useMobile()

  if (mobile) return <MobileGigs />

  return (
    <Suspense>
      <GigsList />
      <TravelGenius />
    </Suspense>
  )
}
