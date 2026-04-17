'use client'

import { Today } from '@/components/dashboard/Today'
import { useMobile } from '@/hooks/useMobile'
import MobileShell from '@/components/mobile/MobileShell'

export default function DashboardPage() {
  const mobile = useMobile()
  if (mobile) return <MobileShell />
  return <Today />
}
