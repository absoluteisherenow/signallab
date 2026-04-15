'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export function NotificationBell() {
  const router = useRouter()
  const [unread, setUnread] = useState(0)
  const [ringing, setRinging] = useState(false)
  const prevUnread = useRef(0)

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/api/notifications?limit=20')
        const d = await r.json()
        const count = d.unread || 0
        // Trigger ring animation when new notifications arrive
        if (count > prevUnread.current && prevUnread.current >= 0) {
          setRinging(true)
          setTimeout(() => setRinging(false), 1200)
        }
        prevUnread.current = count
        setUnread(count)
      } catch {}
    }
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <style>{`
        @keyframes bell-ring {
          0% { transform: rotate(0deg); }
          10% { transform: rotate(14deg); }
          20% { transform: rotate(-12deg); }
          30% { transform: rotate(10deg); }
          40% { transform: rotate(-8deg); }
          50% { transform: rotate(6deg); }
          60% { transform: rotate(-4deg); }
          70% { transform: rotate(2deg); }
          80% { transform: rotate(-1deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes badge-pop {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <button
        onClick={() => router.push('/notifications')}
        style={{
          background: 'none',
          border: '1px solid transparent',
          cursor: 'pointer',
          padding: '10px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: ringing ? '#ff2a1a' : '#8a8780', transition: 'color 0.3s',
          borderRadius: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#ff2a1a'; e.currentTarget.style.background = 'rgba(255,42,26,0.06)' }}
        onMouseLeave={e => { e.currentTarget.style.color = ringing ? '#ff2a1a' : '#8a8780'; e.currentTarget.style.background = 'none' }}
        title="Notifications"
      >
        <svg
          width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          style={{
            transformOrigin: '50% 4px',
            animation: ringing ? 'bell-ring 0.8s ease-in-out' : 'none',
          }}
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: '0px', right: '0px',
            minWidth: '20px', height: '20px', borderRadius: 0,
            background: '#ff2a1a', color: '#050505',
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.22em',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1, padding: '0 5px',
            animation: ringing ? 'badge-pop 0.4s ease-out' : 'none',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  )
}
