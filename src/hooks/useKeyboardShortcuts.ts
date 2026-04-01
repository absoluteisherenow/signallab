'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function useKeyboardShortcuts() {
  const router = useRouter()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if focus is in an input, textarea, or select
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      // Skip if any modifier key (except plain shift for uppercase)
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault()
          router.push('/gigs/new')
          break
        case 'p':
          e.preventDefault()
          router.push('/broadcast')
          break
        case 'i':
          e.preventDefault()
          router.push('/business/finances')
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [router])
}
