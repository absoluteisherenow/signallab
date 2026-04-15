'use client'

import GigPassPageClient from './PageClient'
import { useParams } from 'next/navigation'

export default function Page() {
  const params = useParams<{ id: string }>()
  return <GigPassPageClient params={params} />
}
