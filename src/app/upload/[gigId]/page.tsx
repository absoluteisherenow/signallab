'use client'

import UploadPageClient from './PageClient'
import { useParams } from 'next/navigation'

export default function Page() {
  const params = useParams<{ gigId: string }>()
  return <UploadPageClient params={params} />
}
