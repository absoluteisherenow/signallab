'use client'

import MobilePost from '@/components/mobile/MobilePost'
import { MobileDesktopRedirect } from '@/components/mobile/MobileDesktopRedirect'
import { useMobile } from '@/hooks/useMobile'

export default function MobilePostPage() {
  const mobile = useMobile()
  if (!mobile) {
    return <MobileDesktopRedirect feature="Broadcast Lab" />
  }
  return <MobilePost />
}
