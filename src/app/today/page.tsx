'use client'

import { Today } from '@/components/dashboard/Today'
import { useMobile } from '@/hooks/useMobile'
import MobileShell from '@/components/mobile/MobileShell'

export default function TodayPage() {
  const mobile = useMobile()
  if (mobile) return <MobileShell />
  return <Today />
}
