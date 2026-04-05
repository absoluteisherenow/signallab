'use client'

import { ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'

export function DesktopShell({ children, desktopChildren }: { children: ReactNode; desktopChildren: ReactNode }) {
  const params = useSearchParams()
  const isDesktop = params.has('desktop') || (typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__)

  if (isDesktop) return <>{desktopChildren}</>
  return <>{children}</>
}
