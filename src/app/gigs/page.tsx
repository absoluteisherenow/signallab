import { GigsList } from '@/components/gigs/GigsList'
import { TravelGenius } from '@/components/business/TravelGenius'
import { Suspense } from 'react'

export default function GigsPage() {
  return (
    <Suspense>
      <GigsList />
      <TravelGenius />
    </Suspense>
  )
}
