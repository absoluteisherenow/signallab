'use client'

import ClaimPageClient from './PageClient'
import { useParams } from 'next/navigation'

export default function Page() {
  const params = useParams<{ slug: string }>()
  return <ClaimPageClient params={params} />
}
