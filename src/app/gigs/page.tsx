import { GigsList } from '@/components/gigs/GigsList'
import { Suspense } from 'react'

export default function GigsPage() {
  return (
    <Suspense>
      <GigsList />
    </Suspense>
  )
}
