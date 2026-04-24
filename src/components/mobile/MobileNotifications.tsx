'use client'

import { useState, useEffect } from 'react'
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

const COLOR = {
  bg: '#050505',
  panel: '#0e0e0e',
  border: '#222',
  borderDim: '#1d1d1d',
  red: '#ff2a1a',
  text: '#f2f2f2',
  dim: '#d8d8d8',
  dimmer: '#b0b0b0',
  dimmest: '#909090',
}

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"

const TYPE_LABEL: Record<string, string> = {
  set_time_changed: 'LOGISTICS',
  gig_added: 'GIG',
  gig_cancelled: 'GIG',
  advance_sent: 'ADVANCE',
  advance_received: 'ADVANCE',
  invoice_created: 'FINANCE',
  invoice_request: 'FINANCE',
  invoice_overdue: 'FINANCE',
  payment_received: 'FINANCE',
  system: 'SYSTEM',
  cron_error: 'SYSTEM',
  content_review: 'CONTENT',
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'NOW'
  if (m < 60) return `${m}M`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}H`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}D`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
}

export default function MobileNotifications() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'ALL' | 'UNREAD'>('ALL')

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/notifications?limit=100')
      const d = await r.json()
      setNotifications(d.notifications || [])
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleClick(n: Notification) {
    if (!n.read) {
      fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id }),
      }).catch(() => {})
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    }
    if (n.href) router.push(n.href)
  }

  const filtered = tab === 'UNREAD' ? notifications.filter(n => !n.read) : notifications

  return (
    <div style={{ background: COLOR.bg, color: COLOR.text, fontFamily: FONT, minHeight: '100vh', paddingBottom: 'calc(72px + env(safe-area-inset-bottom))' }}>

      {/* Top bar */}
      <div style={{
        padding: 'calc(20px + env(safe-area-inset-top)) 20px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{
          fontSize: '28px', fontWeight: 800, letterSpacing: '-0.035em',
          lineHeight: 0.9, color: COLOR.text, textTransform: 'uppercase',
        }}>
          NOTIFICATIONS
        </div>
        <button
          onClick={() => router.back()}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            minHeight: '44px', minWidth: '44px', padding: '0 4px',
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            fontFamily: FONT, WebkitTapHighlightColor: 'transparent',
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em',
            color: COLOR.dimmer, textTransform: 'uppercase',
          }}
        >
          BACK
        </button>
      </div>

      {/* Tabs + refresh */}
      <div style={{
        padding: '0 20px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${COLOR.borderDim}`,
      }}>
        <div style={{ display: 'flex', gap: '24px' }}>
          {(['ALL', 'UNREAD'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '8px 0', fontFamily: FONT,
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em',
                color: tab === t ? COLOR.text : COLOR.dimmer,
                textTransform: 'uppercase',
                borderBottom: tab === t ? `1px solid ${COLOR.red}` : '1px solid transparent',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: FONT, fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.18em', color: COLOR.dimmer,
            textTransform: 'uppercase', padding: '8px 4px',
            minHeight: '44px',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          REFRESH
        </button>
      </div>

      {/* List */}
      <div style={{ padding: '16px 20px' }}>
        {loading ? (
          <div style={{
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em',
            color: COLOR.dimmer, textTransform: 'uppercase', padding: '40px 0',
            textAlign: 'center',
          }}>
            LOADING
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            padding: '80px 0', textAlign: 'center',
            fontSize: '18px', fontWeight: 500, color: COLOR.dimmer,
            letterSpacing: '0.02em',
          }}>
            NO NOTIFICATIONS
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(n => {
              const label = TYPE_LABEL[n.type] || 'SYSTEM'
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    position: 'relative',
                    background: COLOR.panel,
                    border: `1px solid ${COLOR.borderDim}`,
                    padding: '16px',
                    cursor: n.href ? 'pointer' : 'default',
                    minHeight: '44px',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {!n.read && (
                    <div style={{
                      position: 'absolute', top: '10px', left: '10px',
                      width: '4px', height: '4px', background: COLOR.red,
                    }} />
                  )}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: '8px', paddingLeft: !n.read ? '12px' : 0,
                  }}>
                    <div style={{
                      fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em',
                      color: COLOR.red, textTransform: 'uppercase',
                    }}>
                      {label}
                    </div>
                    <div style={{
                      fontSize: '11px', fontWeight: 500, letterSpacing: '0.08em',
                      color: COLOR.dimmer,
                    }}>
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '14px', fontWeight: 500, color: COLOR.text,
                    lineHeight: 1.35, paddingLeft: !n.read ? '12px' : 0,
                  }}>
                    {n.title}
                  </div>
                  {n.message && (
                    <div style={{
                      fontSize: '13px', fontWeight: 500, color: COLOR.dimmer,
                      marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden',
                      textOverflow: 'ellipsis', paddingLeft: !n.read ? '12px' : 0,
                    }}>
                      {n.message}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
