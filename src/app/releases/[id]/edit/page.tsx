'use client'

import EditReleaseClient from './PageClient'
import { useParams } from 'next/navigation'

export default function Page() {
  const params = useParams<{ id: string }>()
  return <EditReleaseClient params={params} />
}
