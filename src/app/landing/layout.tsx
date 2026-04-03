'use client'

import { useEffect } from 'react'

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  useEffect(() => {
    // Hide app shell elements on landing pages
    document.body.classList.add('landing-active')
    return () => { document.body.classList.remove('landing-active') }
  }, [])

  return <>{children}</>
}
