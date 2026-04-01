'use client'

import { BroadcastLab } from '@/components/broadcast/BroadcastLab'
import { useMobile } from '@/hooks/useMobile'
import MobileUpload from '@/components/mobile/MobileUpload'

export default function Broadcast() {
  const mobile = useMobile()
  if (mobile) return <MobileUpload />
  return <BroadcastLab />
}
