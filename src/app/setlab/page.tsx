'use client'

import { useEffect, useState } from 'react'
import { SetLab } from '@/components/setlab/SetLab'
import MobileScan from '@/components/mobile/MobileScan'

export default function SetLabPage() {
  // First paint renders null (both server and client) to avoid a hydration
  // mismatch between desktop SSR (no window) and mobile client (small viewport).
  // A plain background keeps the screen from flashing white during the swap.
  const [mobile, setMobile] = useState<boolean | null>(null)
  useEffect(() => {
    // Match exactly the CSS media query that toggles the mobile tab bar
    // (globals.css `@media (max-width: 768px)`), so the two never disagree.
    const mq = window.matchMedia('(max-width: 768px)')
    const apply = () => setMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  if (mobile === null) {
    return <div style={{ minHeight: '100vh', background: '#050505' }} />
  }
  if (mobile) return <MobileScan />
  return <SetLab />
}
