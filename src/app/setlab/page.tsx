'use client'

import { SetLab } from '@/components/setlab/SetLab'
import { useMobile } from '@/hooks/useMobile'
import MobileScan from '@/components/mobile/MobileScan'

export default function SetLabPage() {
  const mobile = useMobile()
  if (mobile) return <MobileScan />
  return <SetLab />
}
