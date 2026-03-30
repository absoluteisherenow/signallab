'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Notification {
  id: string
  created_at: string
  type: string
  title: string
  message: string | null
  href: string | null
  read: boolean
  gig_id: string | null
}

const TYPE_COLOR: Record<string, string> = {
  set_time_changed: '#b08d57',
  gig_added: '#3d6b4a',
  gig_cancelled: '#8a4a3a',
  advance_sent: '#52504c',
  advance_received: '#3d6b4a',
  invoice_overdue: '#8a4a3a',
  system: '#52504c',
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function NotificationBell() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  async function load() {
    try {
      const r = await fetch('/api/notifications?limit=20')
      const d = await r.json()
      setNotifications(d.notifications || [])
      setUnread(d.unread || 0)
    } catch {}
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnread(0)
  }

  async function handleClick(n: Notification) {
    if (!n.read) {
      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) })
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
      setUnread(prev => Math.max(0, prev - 1))
    }
    if (n.href) {
      setOpen(false)
      router.push(n.href)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '8px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: open ? '#b08d57' : '#52504c', transition: 'color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#8a8780' }}
        onMouseLeave={e => { e.currentTarget.style.color = open ? '#b08d57' : '#52504c' }}
        title="Notifications"
      >
        {/* Bell SVG */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: '4px', right: '4px',
            width: '14px', height: '14px', borderRadius: '50%',
            background: '#b08d57', color: '#070706',
            fontSize: '8px', fontWeight: 700, fontFamily: "'DM Mono', monospace",
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: '8px',
          width: '320px', background: '#0e0d0b', border: '1px solid #1a1917',
          zIndex: 200, boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #1a1917' }}>
            <span style={{ fontSize: '10px', letterSpacing: '0.22em', color: '#b08d57', textTransform: 'uppercase' }}>Notifications</span>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {unread > 0 && (
                <button onClick={markAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: '#52504c', fontFamily: "'DM Mono', monospace", letterSpacing: '0.1em', padding: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = '#8a8780'}
                  onMouseLeave={e => e.currentTarget.style.color = '#52504c'}>
                  Mark all read
                </button>
              )}
              <button onClick={() => { setOpen(false); router.push('/notifications') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: '#52504c', fontFamily: "'DM Mono', monospace", letterSpacing: '0.1em', padding: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = '#8a8780'}
                onMouseLeave={e => e.currentTarget.style.color = '#52504c'}>
                View all →
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 18px', textAlign: 'center', fontSize: '12px', color: '#52504c' }}>No notifications yet.</div>
            ) : (
              notifications.slice(0, 15).map(n => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    display: 'flex', gap: '12px', alignItems: 'flex-start',
                    padding: '14px 18px', borderBottom: '1px solid #111009',
                    cursor: n.href ? 'pointer' : 'default',
                    background: n.read ? 'transparent' : '#0a0906',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (n.href) e.currentTarget.style.background = '#141310' }}
                  onMouseLeave={e => { e.currentTarget.style.background = n.read ? 'transparent' : '#0a0906' }}
                >
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: TYPE_COLOR[n.type] || '#52504c', flexShrink: 0, marginTop: '5px' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: n.read ? '#52504c' : '#f0ebe2', lineHeight: 1.4, marginBottom: '3px' }}>{n.title}</div>
                    {n.message && <div style={{ fontSize: '11px', color: '#52504c', lineHeight: 1.4 }}>{n.message}</div>}
                  </div>
                  <div style={{ fontSize: '10px', color: '#2e2c29', flexShrink: 0, marginTop: '2px' }}>{timeAgo(n.created_at)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
