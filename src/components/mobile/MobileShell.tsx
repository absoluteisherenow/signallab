'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMobile } from '@/hooks/useMobile'
import GigDayTimeline from '@/components/gigs/GigDayTimeline'
import { MobileTonightF } from '@/components/mobile/MobileTonightF'

interface Gig {
  id: string
  venue: string
  city: string
  date: string
  set_time?: string
  set_end_time?: string
  status?: string
  fee?: number
  promoter_email?: string
  al_name?: string
  al_phone?: string
  venue_address?: string
  hospitality?: string
  backline?: string
}

interface RecentScan {
  id: string
  filename: string
  created_at: string
  status: string
}

interface Release {
  id: string
  title: string
  artist?: string
  type: string
  release_date: string
  label?: string
  streaming_url?: string
  artwork_url?: string
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

function SystemNotificationTicker({ notifications }: { notifications: SystemNotification[] }) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (notifications.length <= 1) return
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex(prev => (prev + 1) % notifications.length)
        setVisible(true)
      }, 400)
    }, 5000)
    return () => clearInterval(interval)
  }, [notifications.length])

  if (notifications.length === 0) return null

  const current = notifications[index]

  function notifTimeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  return (
    <button
      onClick={() => router.push('/notifications')}
      style={{
        display: 'block',
        width: '100%',
        background: 'var(--panel)',
        borderLeft: '3px solid var(--gold)',
        borderTop: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        padding: '14px 16px',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        textAlign: 'left',
        transition: 'opacity 0.35s ease',
        opacity: visible ? 1 : 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '13px',
            color: 'var(--text)',
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {current.title}
          </div>
          {current.message && (
            <div style={{
              fontSize: '11px',
              color: 'var(--text-dimmer)',
              lineHeight: 1.4,
              marginTop: '3px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {current.message}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '10px', color: 'var(--text-dimmest)' }}>
            {notifTimeAgo(current.created_at)}
          </span>
          {notifications.length > 1 && (
            <span style={{ fontSize: '9px', color: 'var(--text-dimmest)' }}>
              {index + 1}/{notifications.length}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

const s = {
  bg: 'var(--bg)',
  panel: 'var(--panel)',
  border: 'var(--border-dim)',
  borderBright: 'var(--border)',
  gold: 'var(--gold)',
  goldBright: 'var(--gold-bright)',
  text: 'var(--text)',
  dim: 'var(--text-dim)',
  dimmer: 'var(--text-dimmer)',
  red: 'var(--red-brown, #8a4a3a)',
  font: 'var(--font-mono)',
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

interface Alert {
  id: string
  venue: string
  date: string
  missing: string[]
  urgency: 'urgent' | 'warning' | 'ok'
  href: string
}

function NotificationTicker({ alerts }: { alerts: Alert[] }) {
  const [index, setIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    if (expanded || alerts.length <= 1) return
    const interval = setInterval(() => {
      setAnimating(true)
      setTimeout(() => {
        setIndex(prev => (prev + 1) % alerts.length)
        setAnimating(false)
      }, 300)
    }, 4000)
    return () => clearInterval(interval)
  }, [expanded, alerts.length])

  const current = alerts[index]

  if (expanded) {
    return (
      <div>
        <button onClick={() => setExpanded(false)} style={{
          width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '10px 12px 6px',
        }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.red, textTransform: 'uppercase' }}>
            {alerts.length} action{alerts.length !== 1 ? 's' : ''} needed
          </div>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 4px 4px' }}>
          {alerts.map(a => (
            <a key={a.id} href={a.href} style={{
              background: a.urgency === 'urgent' ? 'rgba(138,74,58,0.08)' : 'rgba(255,42,26,0.05)',
              border: `1px solid ${a.urgency === 'urgent' ? 'rgba(138,74,58,0.25)' : 'rgba(255,42,26,0.15)'}`,
              padding: '14px 16px', textDecoration: 'none', display: 'block',
            }}>
              <div style={{ fontSize: '13px', color: s.text, marginBottom: '4px' }}>{a.venue} · {a.date}</div>
              <div style={{
                fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase',
                color: a.urgency === 'urgent' ? s.red : s.gold,
              }}>
                {a.urgency === 'urgent' ? 'Missing' : 'Confirm'}: {a.missing.join(', ')}
              </div>
            </a>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(true)}
        style={{
          width: '100%', background: current.urgency === 'urgent' ? 'rgba(138,74,58,0.08)' : 'rgba(255,42,26,0.05)',
          border: 'none',
          padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
          transition: 'opacity 0.3s ease',
          opacity: animating ? 0 : 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '13px', color: s.text, marginBottom: '4px', fontFamily: s.font }}>{current.venue} · {current.date}</div>
            <div style={{
              fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase',
              color: current.urgency === 'urgent' ? s.red : s.gold, fontFamily: s.font,
            }}>
              {current.urgency === 'urgent' ? 'Missing' : 'Confirm'}: {current.missing.join(', ')}
            </div>
          </div>
          {alerts.length > 1 && (
            <div style={{ fontSize: '10px', color: s.dimmer, flexShrink: 0, fontFamily: s.font }}>
              {index + 1}/{alerts.length}
            </div>
          )}
        </div>
      </button>
    </div>
  )
}

export default function MobileShell() {
  const [gigs, setGigs] = useState<Gig[]>([])
  const [releases, setReleases] = useState<Release[]>([])
  const [scans, setScans] = useState<RecentScan[]>([])
  const [loading, setLoading] = useState(true)
  const [isInstalled, setIsInstalled] = useState(true)
  const [showHowTo, setShowHowTo] = useState(false)
  const [systemNotifications, setSystemNotifications] = useState<SystemNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [tonightTravel, setTonightTravel] = useState<any[]>([])

  // Track ID state
  const [trackIdPhase, setTrackIdPhase] = useState<'idle' | 'listening' | 'identifying' | 'found' | 'not_found'>('idle')
  const [trackIdResult, setTrackIdResult] = useState<{ artist: string; title: string; label?: string } | null>(null)
  const [trackIdCountdown, setTrackIdCountdown] = useState(10)
  const trackIdRecorder = useRef<MediaRecorder | null>(null)
  const trackIdTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  async function startTrackId() {
    setTrackIdResult(null)
    setTrackIdCountdown(10)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported(m)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      trackIdRecorder.current = recorder
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (trackIdTimer.current) clearInterval(trackIdTimer.current)
        setTrackIdPhase('identifying')
        try {
          const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })
          const form = new FormData()
          form.append('audio', blob, 'snippet.webm')
          const res = await fetch('/api/fingerprint', { method: 'POST', body: form })
          const data = await res.json()
          if (data.found) {
            const track = { artist: data.artist || '', title: data.title || '', label: data.label }
            setTrackIdResult(track)
            await fetch('/api/tracks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tracks: [{ artist: track.artist, title: track.title, label: track.label || '', source: 'shazam' }] }) })
            setTrackIdPhase('found')
            setTimeout(() => setTrackIdPhase('idle'), 5000)
          } else {
            setTrackIdPhase('not_found')
            setTimeout(() => setTrackIdPhase('idle'), 3000)
          }
        } catch {
          setTrackIdPhase('not_found')
          setTimeout(() => setTrackIdPhase('idle'), 3000)
        }
      }
      recorder.start()
      setTrackIdPhase('listening')
      trackIdTimer.current = setInterval(() => {
        setTrackIdCountdown(prev => {
          if (prev <= 1) { recorder.stop(); return 0 }
          return prev - 1
        })
      }, 1000)
    } catch {
      setTrackIdPhase('not_found')
      setTimeout(() => setTrackIdPhase('idle'), 3000)
    }
  }

  function cancelTrackId() {
    if (trackIdRecorder.current?.state === 'recording') trackIdRecorder.current.stop()
    if (trackIdTimer.current) clearInterval(trackIdTimer.current)
    setTrackIdPhase('idle')
  }

  useEffect(() => {
    setIsInstalled(window.matchMedia('(display-mode: standalone)').matches)
  }, [])

  // Fetch system notifications
  useEffect(() => {
    fetch('/api/notifications?limit=10')
      .then(r => r.json())
      .then(d => {
        const notifs: SystemNotification[] = (d.notifications || []).filter((n: SystemNotification) => !n.read)
        setSystemNotifications(notifs)
        setUnreadCount(d.unread || notifs.length)
      })
      .catch(() => {})

    const interval = setInterval(() => {
      fetch('/api/notifications?limit=10')
        .then(r => r.json())
        .then(d => {
          const notifs: SystemNotification[] = (d.notifications || []).filter((n: SystemNotification) => !n.read)
          setSystemNotifications(notifs)
          setUnreadCount(d.unread || notifs.length)
        })
        .catch(() => {})
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/gigs').then(r => r.json()),
      fetch('/api/releases').then(r => r.json()),
      fetch('/api/mix-scans').then(r => r.json()),
    ]).then(([gigsR, relR, scanR]) => {
      if (gigsR.status === 'fulfilled') setGigs(gigsR.value.gigs || [])
      if (relR.status === 'fulfilled') setReleases(relR.value.releases || [])
      if (scanR.status === 'fulfilled') setScans((scanR.value.scans || []).slice(0, 3))
      setLoading(false)
    })
  }, [])

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const tonightGig = gigs.find(g => g.date === today)

  useEffect(() => {
    if (tonightGig) {
      fetch(`/api/gigs/${tonightGig.id}/travel`)
        .then(r => r.json())
        .then(d => setTonightTravel(d.bookings || []))
        .catch(() => {})
    }
  }, [tonightGig?.id])
  const upcoming = gigs
    .filter(g => new Date(g.date) >= now && g.date !== today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const nextGig = upcoming[0]
  const upcomingReleases = releases
    .filter(r => new Date(r.release_date) >= now)
    .sort((a, b) => a.release_date.localeCompare(b.release_date))

  // Count action items (gigs missing logistics only)
  const notifCount = upcoming.filter(g => missingLogistics(g).length > 0).length

  function missingLogistics(gig: Gig): string[] {
    const missing: string[] = []
    const gigDate = new Date(gig.date)
    const daysOut = Math.floor((gigDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    // Only flag if within 3 months
    if (daysOut > 90) return missing
    if (!gig.al_name && !gig.promoter_email) missing.push('contact')
    if (!gig.venue_address) missing.push('address')
    if (!gig.set_time) missing.push('set time')
    if (!gig.hospitality) missing.push('rider')
    return missing
  }

  function logisticsUrgency(gig: Gig): 'urgent' | 'warning' | 'ok' {
    const gigDate = new Date(gig.date)
    const daysOut = Math.floor((gigDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysOut <= 7) return 'urgent'
    if (daysOut <= 30) return 'warning'
    return 'ok'
  }

  if (loading) {
    return (
      <div style={{ background: s.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: s.font }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.dimmer, textTransform: 'uppercase' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ background: s.bg, minHeight: '100vh', fontFamily: s.font, color: s.text, paddingBottom: '72px' }}>

      {/* Header */}
      <div style={{ padding: '20px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="22" height="22" viewBox="0 0 64 64" fill="none">
            <polyline points="8,32 18,32 24,18 30,46 36,14 42,42 48,26 54,32 62,32" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '20px', fontWeight: 300, letterSpacing: '0.02em', color: s.text }}>
            Signal Lab
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: s.dimmer, textTransform: 'uppercase' }}>
            {now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
          <Link href="/notifications" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '44px', height: '44px', position: 'relative',
            textDecoration: 'none', WebkitTapHighlightColor: 'transparent',
            marginRight: '-10px',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={s.dimmer} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {(unreadCount > 0 || notifCount > 0) && (
              <span style={{
                position: 'absolute', top: '6px', right: '6px',
                minWidth: '16px', height: '16px', borderRadius: '8px',
                background: s.gold, color: '#050505',
                fontSize: '9px', fontWeight: 700, fontFamily: s.font,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1, padding: '0 4px',
              }}>
                {(unreadCount + notifCount) > 9 ? '9+' : unreadCount + notifCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Install prompt */}
      {!isInstalled && (
        <div style={{ padding: '0 16px', marginBottom: '16px' }}>
          {!showHowTo ? (
            <button
              onClick={() => setShowHowTo(true)}
              style={{
                width: '100%', background: 'linear-gradient(135deg, rgba(255,42,26,0.15) 0%, rgba(255,42,26,0.06) 100%)',
                border: `1px solid ${s.gold}50`, padding: '20px 20px',
                fontFamily: s.font, cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: s.gold, marginBottom: '8px', fontFamily: s.font }}>
                Add to Home Screen
              </div>
              <div style={{ fontSize: '11px', color: s.dim, lineHeight: 1.6, fontFamily: s.font }}>
                Runs like a native app — full screen, offline access, voice assistant, one-tap gig prep. Takes 10 seconds.
              </div>
            </button>
          ) : (
            <div style={{ background: 'linear-gradient(135deg, rgba(255,42,26,0.12) 0%, rgba(255,42,26,0.04) 100%)', border: `1px solid ${s.gold}40`, padding: '24px 20px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '6px' }}>
                Install Signal Lab
              </div>
              <div style={{ fontSize: '11px', color: s.dim, lineHeight: 1.6, marginBottom: '20px' }}>
                Full screen, instant launch from your home screen — no browser chrome, works offline.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '28px', height: '28px', background: `${s.gold}18`, border: `1px solid ${s.gold}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: s.gold, flexShrink: 0 }}>1</div>
                  <div style={{ fontSize: '13px', color: s.text }}>Tap the <span style={{ display: 'inline-block', border: `1px solid ${s.border}`, padding: '1px 7px', fontSize: '15px', verticalAlign: 'middle' }}>↑</span> share button below</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '28px', height: '28px', background: `${s.gold}18`, border: `1px solid ${s.gold}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: s.gold, flexShrink: 0 }}>2</div>
                  <div style={{ fontSize: '13px', color: s.text }}>Scroll down, tap "Add to Home Screen"</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '28px', height: '28px', background: `${s.gold}18`, border: `1px solid ${s.gold}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: s.gold, flexShrink: 0 }}>3</div>
                  <div style={{ fontSize: '13px', color: s.text }}>Tap "Add" — done</div>
                </div>
              </div>
              <button onClick={() => setShowHowTo(false)} style={{
                background: 'none', border: 'none', color: s.dimmer, fontFamily: s.font,
                fontSize: '10px', letterSpacing: '0.1em', cursor: 'pointer', padding: 0,
              }}>
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tonight card — BRT */}
      {tonightGig && (
        <MobileTonightF tonightGig={tonightGig} tonightTravel={tonightTravel} />
      )}

      {/* Quick actions — Track ID hero + scan/playlist/upload. On show day this sits below the Tonight card; otherwise it's at the top. */}
      <div style={{ padding: '0 16px', marginBottom: '20px' }}>
        <button
          onClick={() => {
            if (trackIdPhase === 'idle' || trackIdPhase === 'found' || trackIdPhase === 'not_found') startTrackId()
            else cancelTrackId()
          }}
          style={{
            width: '100%',
            background: trackIdPhase === 'listening' ? 'rgba(200,155,60,0.15)' : trackIdPhase === 'found' ? 'rgba(80,200,120,0.1)' : s.panel,
            border: `1px solid ${trackIdPhase === 'listening' ? s.gold : trackIdPhase === 'found' ? 'rgba(80,200,120,0.4)' : s.border}`,
            padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px',
            marginBottom: '10px',
          }}
        >
          <div style={{ fontSize: '44px', lineHeight: 1, color: trackIdPhase === 'listening' ? s.gold : trackIdPhase === 'found' ? '#f2f2f2' : s.gold }}>
            {trackIdPhase === 'listening' ? '●' : trackIdPhase === 'identifying' ? '⟳' : trackIdPhase === 'found' ? '✓' : '♪'}
          </div>
          <div style={{ fontSize: '13px', letterSpacing: '0.18em', color: s.text, textTransform: 'uppercase', fontWeight: 500 }}>
            {trackIdPhase === 'idle' ? 'Track ID' : trackIdPhase === 'listening' ? `Listening ${trackIdCountdown}s` : trackIdPhase === 'identifying' ? 'Identifying…' : trackIdPhase === 'found' && trackIdResult ? trackIdResult.title.slice(0, 24) : trackIdPhase === 'not_found' ? 'Not found — tap to retry' : 'Track ID'}
          </div>
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {[
            { label: 'Scan', href: '/setlab', icon: '◎' },
            { label: 'Playlist', href: '/mobile/discoveries', icon: '♫' },
            { label: 'Upload', href: '/broadcast', icon: '↑' },
          ].map(action => (
            <Link key={action.label} href={action.href} style={{
              background: s.panel, border: `1px solid ${s.border}`,
              padding: '20px 8px', textAlign: 'center', textDecoration: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
            }}>
              <div style={{ fontSize: '24px', color: s.gold, lineHeight: 1 }}>{action.icon}</div>
              <div style={{ fontSize: '10px', letterSpacing: '0.12em', color: s.dim, textTransform: 'uppercase' }}>{action.label}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Next gig (if no tonight) */}
      {!tonightGig && nextGig && (() => {
        const missing = missingLogistics(nextGig)
        const urgency = logisticsUrgency(nextGig)
        return (
          <div style={{ margin: '0 16px 16px', background: s.panel, border: `1px solid ${s.border}`, padding: '20px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '10px' }}>
              Next up
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '17px', color: s.text, marginBottom: '4px' }}>{nextGig.venue}</div>
                <div style={{ fontSize: '13px', color: s.dim }}>
                  {nextGig.city} · {formatDate(nextGig.date)}
                  {nextGig.set_time && ` · ${nextGig.set_time}`}
                </div>
              </div>
              <a href={`/gig-pass/${nextGig.id}`} style={{
                fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase',
                color: s.gold, textDecoration: 'none', border: `1px solid ${s.gold}40`,
                padding: '10px 16px', flexShrink: 0,
              }}>
                Pass
              </a>
            </div>
            {missing.length > 0 && (
              <div style={{
                marginTop: '12px', padding: '10px 14px',
                background: urgency === 'urgent' ? 'rgba(138,74,58,0.12)' : 'rgba(255,42,26,0.08)',
                border: `1px solid ${urgency === 'urgent' ? 'rgba(138,74,58,0.3)' : 'rgba(255,42,26,0.2)'}`,
              }}>
                <div style={{
                  fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: urgency === 'urgent' ? s.red : s.gold,
                }}>
                  {urgency === 'urgent' ? 'Missing' : 'Confirm'}: {missing.join(', ')}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Upcoming gigs — skip the hero gig already shown at top */}
      {(() => {
        const heroGigId = tonightGig?.id || nextGig?.id
        const otherGigs = upcoming.filter(g => g.id !== heroGigId)
        if (otherGigs.length === 0) return null
        return (
        <div style={{ padding: '0 16px', marginBottom: '24px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '12px' }}>
            Gigs
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {otherGigs.slice(0, 4).map(g => (
              <a key={g.id} href={`/gig-pass/${g.id}`} style={{
                background: s.panel, border: `1px solid ${s.border}`, padding: '14px 16px',
                textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: '14px', color: s.text }}>{g.venue}</div>
                  <div style={{ fontSize: '11px', color: s.dimmer, marginTop: '2px' }}>
                    {g.city}{g.set_time ? ` · ${g.set_time}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: s.dim, flexShrink: 0 }}>{formatDate(g.date)}</div>
              </a>
            ))}
          </div>
        </div>
        )
      })()}

      {/* Notifications box — above releases */}
      {(() => {
        const heroGigId = tonightGig?.id || nextGig?.id
        const alerts = upcoming
          .filter(g => g.id !== heroGigId && missingLogistics(g).length > 0)
          .map(g => ({
            id: g.id,
            venue: g.venue,
            date: formatDate(g.date),
            missing: missingLogistics(g),
            urgency: logisticsUrgency(g),
            href: `/gig-pass/${g.id}`,
          }))
        if (alerts.length === 0) return null
        return (
          <div style={{ padding: '0 16px', marginBottom: '24px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.red, textTransform: 'uppercase', marginBottom: '12px' }}>
              Notifications
            </div>
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '4px' }}>
              <NotificationTicker alerts={alerts} />
            </div>
          </div>
        )
      })()}

      {/* System notifications ticker — above releases */}
      {systemNotifications.length > 0 && (
        <div style={{ padding: '0 16px', marginBottom: '24px' }}>
          <SystemNotificationTicker notifications={systemNotifications} />
        </div>
      )}

      {/* Upcoming releases — at the bottom */}
      {upcomingReleases.length > 0 && (
        <div style={{ padding: '0 16px', marginBottom: '24px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '12px' }}>
            Releases
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {upcomingReleases.slice(0, 3).map(r => {
              const href = r.streaming_url || `/releases`
              const isExternal = !!r.streaming_url
              const cardStyle = {
                background: s.panel, border: `1px solid ${s.border}`, padding: '14px 16px',
                textDecoration: 'none' as const, display: 'flex', alignItems: 'center' as const, gap: '14px',
              }
              const cardContent = (
                <>
                  {r.artwork_url && (
                    <img src={r.artwork_url} alt="" style={{
                      width: 48, height: 48, objectFit: 'cover' as const, flexShrink: 0,
                      border: `1px solid ${s.border}`,
                    }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', color: s.text }}>{r.title}</div>
                    <div style={{ fontSize: '11px', color: s.dimmer, marginTop: '2px' }}>
                      {r.artist && `${r.artist} · `}{r.label || r.type}
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: s.dim, flexShrink: 0 }}>{formatDate(r.release_date)}</div>
                </>
              )
              return isExternal ? (
                <a key={r.id} href={href} target="_blank" rel="noopener noreferrer" style={cardStyle}>
                  {cardContent}
                </a>
              ) : (
                <Link key={r.id} href={href} style={cardStyle}>
                  {cardContent}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {scans.length > 0 && (
        <div style={{ padding: '0 16px', marginBottom: '24px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '12px' }}>
            Recent scans
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {scans.map(scan => (
              <div key={scan.id} style={{
                background: s.panel, border: `1px solid ${s.border}`, padding: '14px 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ fontSize: '13px', color: s.dim }}>{scan.filename || 'Mix scan'}</div>
                <div style={{ fontSize: '11px', color: s.dimmer }}>{timeAgo(scan.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }`}</style>
    </div>
  )
}
