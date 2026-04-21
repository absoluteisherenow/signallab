'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MobileTonightF } from '@/components/mobile/MobileTonightF'

interface Gig {
  id: string
  venue: string
  city: string
  date: string
  set_time?: string
  set_end_time?: string
  status?: string
  promoter_email?: string
  al_name?: string
  al_phone?: string
  venue_address?: string
  hospitality?: string
  backline?: string
}

interface SystemNotification {
  id: string
  created_at: string
  type: string
  title: string
  message: string | null
  href: string | null
  read: boolean
}

const COLOR = {
  bg: '#050505',
  panel: '#0e0e0e',
  panelHi: '#161616',
  border: '#222',
  borderDim: '#1d1d1d',
  red: '#ff2a1a',
  text: '#f2f2f2',
  dim: '#d8d8d8',
  dimmer: '#b0b0b0',
  dimmest: '#909090',
}

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"

function notifTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function formatCityDate(gig: Gig) {
  let d = ''
  try {
    d = new Date(gig.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
  } catch {}
  const city = (gig.city || '').toUpperCase()
  return city ? `${city} · ${d}` : d
}

function daysAway(dateStr: string) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / 86400000))
}

export default function MobileShell() {
  const router = useRouter()
  const [gigs, setGigs] = useState<Gig[]>([])
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<SystemNotification[]>([])
  const [tonightTravel, setTonightTravel] = useState<any[]>([])

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/gigs').then(r => r.json()),
      fetch('/api/notifications?limit=10').then(r => r.json()),
    ]).then(([gigsR, notifR]) => {
      if (gigsR.status === 'fulfilled') setGigs(gigsR.value.gigs || [])
      if (notifR.status === 'fulfilled') setNotifications(notifR.value.notifications || [])
      setLoading(false)
    })
  }, [])

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const tonightGig = gigs.find(g => g.date === today)
  const upcoming = gigs
    .filter(g => new Date(g.date) >= now && g.date !== today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const nextGig = upcoming[0]

  useEffect(() => {
    if (tonightGig) {
      fetch(`/api/gigs/${tonightGig.id}/travel`)
        .then(r => r.json())
        .then(d => setTonightTravel(d.bookings || []))
        .catch(() => {})
    }
  }, [tonightGig?.id])

  if (loading) {
    return (
      <div style={{ background: COLOR.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: COLOR.dimmer, textTransform: 'uppercase', fontWeight: 700 }}>LOADING</div>
      </div>
    )
  }

  // Gig-day path: delegate entirely
  if (tonightGig) {
    return (
      <div style={{ background: COLOR.bg, minHeight: '100vh', fontFamily: FONT, color: COLOR.text, paddingBottom: '72px' }}>
        <TopBar />
        <MobileTonightF tonightGig={tonightGig} tonightTravel={tonightTravel} />
      </div>
    )
  }

  const nextPassHref = nextGig ? `/gig-pass/${nextGig.id}` : '/gigs'
  const heroHref = nextGig ? `/gigs/${nextGig.id}` : '/gigs'

  return (
    <div style={{ background: COLOR.bg, minHeight: '100vh', fontFamily: FONT, color: COLOR.text, paddingBottom: '72px' }}>
      <TopBar />

      {/* HERO */}
      <div
        onClick={() => nextGig && router.push(heroHref)}
        style={{
          padding: '48px 20px 0',
          cursor: nextGig ? 'pointer' : 'default',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{
          fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em',
          color: COLOR.dimmer, textTransform: 'uppercase', marginBottom: '14px',
        }}>
          NEXT UP
        </div>

        {nextGig ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '44px', fontWeight: 800, letterSpacing: '-0.035em',
                lineHeight: 0.9, color: COLOR.text, textTransform: 'uppercase',
                wordBreak: 'break-word',
              }}>
                {nextGig.venue}
              </div>
              <div style={{
                marginTop: '14px', fontSize: '14px', fontWeight: 500,
                color: COLOR.dimmer, letterSpacing: '0.02em',
              }}>
                {formatCityDate(nextGig)}
              </div>
            </div>
            <div style={{
              fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em',
              color: COLOR.red, flexShrink: 0, lineHeight: 1,
              paddingTop: '4px',
            }}>
              {daysAway(nextGig.date)}D
            </div>
          </div>
        ) : (
          <div style={{
            fontSize: '44px', fontWeight: 800, letterSpacing: '-0.035em',
            lineHeight: 0.9, color: COLOR.dimmest, textTransform: 'uppercase',
          }}>
            NO GIG BOOKED
          </div>
        )}
      </div>

      {/* Red divider */}
      <div style={{ height: '1px', background: COLOR.red, margin: '40px 0' }} />

      {/* QUICK 2x2 */}
      <div style={{ padding: '0 20px', marginBottom: '32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <QuickCell label="POST" href="/mobile/post" />
          <QuickCell label="SCAN" href="/setlab" />
          <QuickCell label="TOUR" href="/gigs" />
          <QuickCell label="PASS" href={nextPassHref} />
        </div>
      </div>

      {/* LATEST */}
      <div style={{ padding: '0 20px' }}>
        <div style={{
          fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em',
          color: COLOR.dimmer, textTransform: 'uppercase', marginBottom: '14px',
        }}>
          LATEST
        </div>

        {notifications.length === 0 ? (
          <div style={{ fontSize: '14px', fontWeight: 500, color: COLOR.dimmest, padding: '12px 0' }}>
            All clear.
          </div>
        ) : (
          <Link href="/notifications" style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {notifications.slice(0, 3).map(n => (
                <div key={n.id} style={{
                  height: '52px', display: 'flex', alignItems: 'center', gap: '12px',
                }}>
                  <div style={{
                    width: '4px', height: '4px', borderRadius: '50%',
                    background: !n.read ? COLOR.red : COLOR.dimmest,
                    flexShrink: 0,
                  }} />
                  <div style={{
                    flex: 1, minWidth: 0,
                    fontSize: '14px', fontWeight: 500, color: COLOR.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {n.title}
                  </div>
                  <div style={{
                    fontSize: '11px', fontWeight: 500, color: COLOR.dimmer, flexShrink: 0,
                  }}>
                    {notifTimeAgo(n.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </Link>
        )}
      </div>
    </div>
  )
}

function TopBar() {
  return (
    <div style={{
      padding: '20px 20px 0', display: 'flex',
      alignItems: 'center', justifyContent: 'space-between',
      minHeight: '44px',
    }}>
      <div style={{
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em',
        color: COLOR.text, textTransform: 'uppercase',
      }}>
        SIGNAL LAB
      </div>
      <Link href="/notifications" style={{
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em',
        color: COLOR.dimmer, textDecoration: 'none',
        minHeight: '44px', minWidth: '44px',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        WebkitTapHighlightColor: 'transparent',
        textTransform: 'uppercase',
      }}>
        ALERTS
      </Link>
    </div>
  )
}

function QuickCell({ label, href }: { label: string; href: string }) {
  const [pressed, setPressed] = useState(false)
  return (
    <Link
      href={href}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        height: '72px',
        background: COLOR.panel,
        border: `1px solid ${COLOR.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textDecoration: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em',
        color: pressed ? COLOR.red : COLOR.text, textTransform: 'uppercase',
      }}>
        {label}
      </div>
    </Link>
  )
}
