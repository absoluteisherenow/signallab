'use client'

import { ReactNode, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function DesktopShellInner({ children, desktopChildren }: { children: ReactNode; desktopChildren: ReactNode }) {
  const params = useSearchParams()
  const isDesktop = params.has('desktop') || (typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__)

  if (isDesktop) return <>{desktopChildren}</>
  return <>{children}</>
}

export function DesktopShell({ children, desktopChildren }: { children: ReactNode; desktopChildren: ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <DesktopShellInner desktopChildren={desktopChildren}>{children}</DesktopShellInner>
    </Suspense>
  )
}
