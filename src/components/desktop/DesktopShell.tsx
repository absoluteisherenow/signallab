'use client'

import { useState, useEffect, ReactNode } from 'react'

export function DesktopShell({ children, desktopChildren }: { children: ReactNode; desktopChildren: ReactNode }) {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    setIsDesktop(!!(window as any).__TAURI_INTERNALS__)
  }, [])

  if (isDesktop) return <>{desktopChildren}</>
  return <>{children}</>
}
