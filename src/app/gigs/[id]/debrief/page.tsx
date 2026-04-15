'use client'

import GigDebriefPageClient from './PageClient'
import { useParams } from 'next/navigation'

export default function Page() {
  const params = useParams<{ id: string }>()
  return <GigDebriefPageClient params={params} />
}
