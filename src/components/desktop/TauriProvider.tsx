'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { isTauri } from '@/lib/tauri'

interface TauriContextValue {
  isDesktop: boolean
  isOnline: boolean
}

const TauriContext = createContext<TauriContextValue>({
  isDesktop: false,
  isOnline: true,
})

export function useTauri() {
  return useContext(TauriContext)
}

export function TauriProvider({ children }: { children: ReactNode }) {
  const [isDesktop, setIsDesktop] = useState(false)
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setIsDesktop(isTauri())
    setIsOnline(navigator.onLine)

    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return (
    <TauriContext.Provider value={{ isDesktop, isOnline }}>
      {children}
    </TauriContext.Provider>
  )
}
