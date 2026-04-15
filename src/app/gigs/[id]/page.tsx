'use client'

import { GigDetail } from '@/components/gigs/GigDetail'
import { useParams } from 'next/navigation'

export default function GigPage() {
  const { id } = useParams<{ id: string }>()
  return <GigDetail gigId={id} />
}
