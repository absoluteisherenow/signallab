'use client'

import CampaignPageClient from './PageClient'
import { useParams } from 'next/navigation'

export default function Page() {
  const params = useParams<{ id: string }>()
  return <CampaignPageClient params={params} />
}
