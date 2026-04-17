'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { PageHeader } from '@/components/ui/PageHeader'
import { staggerContainer, staggerItem } from '@/lib/motion'

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
  set_time_changed: 'var(--gold)',
  gig_added: 'var(--green)',
  gig_cancelled: '#8a4a3a',
  advance_sent: 'var(--text-dimmer)',
  advance_received: 'var(--green)',
  invoice_created: 'var(--gold)',
  invoice_request: 'var(--gold)',
  invoice_overdue: '#8a4a3a',
  payment_received: 'var(--green)',
  system: 'var(--text-dimmer)',
  cron_error: '#8a4a3a',
  content_review: 'var(--gold)',
}

const TYPE_LABEL: Record<string, string> = {
  set_time_changed: 'Logistics',
  gig_added: 'Gig',
  gig_cancelled: 'Gig',
  advance_sent: 'Advance',
  advance_received: 'Advance',
  invoice_created: 'Finance',
  invoice_request: 'Finance',
  invoice_overdue: 'Finance',
  payment_received: 'Finance',
  system: 'System',
  cron_error: 'System',
  content_review: 'Content',
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const FILTERS = ['All', 'Unread', 'Logistics', 'Gig', 'Advance', 'Finance', 'Content']

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')

  async function load() {
    try {
      const r = await fetch('/api/notifications?limit=100')
      const d = await r.json()
      setNotifications(d.notifications || [])
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  async function handleClick(n: Notification) {
    if (!n.read) {
      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) })
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    }
    if (n.href) router.push(n.href)
  }

  const filtered = notifications.filter(n => {
    if (filter === 'All') return true
    if (filter === 'Unread') return !n.read
    return TYPE_LABEL[n.type] === filter
  })

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)', minHeight: '100vh' }}>

      <PageHeader
        section="Activity"
        title="Notifications"
        right={unreadCount > 0 ? (
          <button onClick={markAllRead} style={{ background: 'transparent', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '12px 22px', cursor: 'pointer' }}>
            Mark all read
          </button>
        ) : undefined}
      />

      <div style={{ padding: '32px 56px' }}>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '28px' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                background: filter === f ? 'var(--panel)' : 'transparent',
                border: `1px solid ${filter === f ? 'var(--gold)' : 'var(--border-dim)'}`,
                color: filter === f ? 'var(--gold)' : 'var(--text-dimmer)',
                fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em',
                textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer', transition: 'all 0.15s',
              }}>
              {f}
              {f === 'Unread' && unreadCount > 0 && ` (${unreadCount})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-dimmer)', fontSize: '13px', padding: '40px 0' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '64px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '12px' }}>Nothing here</div>
            <div style={{ fontSize: '14px', color: 'var(--text-dim)' }}>
              {filter === 'Unread' ? 'All caught up.' : 'No notifications in this category yet.'}
            </div>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
          >
            {filtered.map((n, i) => {
              const color = TYPE_COLOR[n.type] || 'var(--text-dimmer)'
              const label = TYPE_LABEL[n.type] || 'System'
              return (
                <motion.div key={n.id}
                  variants={staggerItem}
                  onClick={() => handleClick(n)}
                  style={{
                    display: 'grid', gridTemplateColumns: '5px 1fr auto',
                    gap: '18px', alignItems: 'flex-start',
                    padding: '20px 24px',
                    background: n.read ? 'var(--panel)' : '#0a0906',
                    border: `1px solid ${n.read ? 'var(--border-dim)' : '#1d1d1d'}`,
                    cursor: n.href ? 'pointer' : 'default',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (n.href) e.currentTarget.style.background = '#111009' }}
                  onMouseLeave={e => { e.currentTarget.style.background = n.read ? 'var(--panel)' : '#0a0906' }}
                >
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: color, marginTop: '6px', flexShrink: 0 }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '9px', letterSpacing: '0.2em', color, textTransform: 'uppercase' }}>{label}</span>
                    </div>
                    <div style={{ fontSize: '14px', color: n.read ? 'var(--text-dim)' : 'var(--text)', marginBottom: n.message ? '4px' : 0 }}>{n.title}</div>
                    {n.message && <div style={{ fontSize: '12px', color: 'var(--text-dimmer)', lineHeight: 1.5 }}>{n.message}</div>}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dimmest)', textAlign: 'right', flexShrink: 0, paddingTop: '2px' }}>{timeAgo(n.created_at)}</div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </div>
    </div>
  )
}
