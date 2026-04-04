'use client'

import { useEffect, useState, useRef } from 'react'

export function FetchProgress() {
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)

  useEffect(() => {
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      // Only track API calls, not static assets
      const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : ''
      const isApi = url.startsWith('/api')
      if (isApi) {
        activeRef.current++
        setActive(activeRef.current)
      }
      try {
        return await originalFetch(...args)
      } finally {
        if (isApi) {
          activeRef.current = Math.max(0, activeRef.current - 1)
          setActive(activeRef.current)
        }
      }
    }
    return () => { window.fetch = originalFetch }
  }, [])

  if (active === 0) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: '2px',
      zIndex: 99999, overflow: 'hidden', background: 'var(--border-dim)',
    }}>
      <div style={{
        height: '100%', width: '40%',
        background: 'linear-gradient(90deg, transparent, var(--red-brown), transparent)',
        animation: 'sl-fetch-progress 1.2s ease-in-out infinite',
      }} />
      <style>{`@keyframes sl-fetch-progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
    </div>
  )
}
