'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MobileTonightF } from '@/components/mobile/MobileTonightF'
import { shareOrCopy, haptic } from '@/lib/native-bridge'

interface Gig {
  id: string
  venue: string
  city: string
  date: string
  set_time?: string
  set_end_time?: string
  status?: string
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
  border: '#222',
  red: '#ff2a1a',
  redPressed: '#a01510',
  text: '#f2f2f2',
  dim: '#d8d8d8',
  dimmer: '#b0b0b0',
  dimmest: '#909090',
  amber: '#f5a623',
}

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"

// Mobile-scope allowed href prefixes. Anything else is display-only.
const MOBILE_HREF_PREFIXES = ['/dashboard', '/setlab', '/mobile/post', '/gigs', '/notifications', '/meditate', '/gl/', '/gig-pass/']

function isMobileHref(href: string | null): boolean {
  if (!href) return false
  return MOBILE_HREF_PREFIXES.some(p => href === p || href.startsWith(p + (p.endsWith('/') ? '' : '/')) || href.startsWith(p + '?') || href === p)
}

function notifTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function formatGigStrip(gig: Gig) {
  let d = ''
  try {
    d = new Date(gig.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
  } catch {}
  const venue = (gig.venue || '').toUpperCase()
  const days = daysAway(gig.date)
  return { days: `${days}D`, venue, date: d }
}

function daysAway(dateStr: string) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / 86400000))
}

type ListenPhase = 'idle' | 'listening' | 'identifying' | 'identified' | 'not_found' | 'error'

export default function MobileShell() {
  const router = useRouter()
  const [gigs, setGigs] = useState<Gig[]>([])
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<SystemNotification[]>([])
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; status: string }>>([])
  const [tonightTravel, setTonightTravel] = useState<any[]>([])
  const [glSlug, setGlSlug] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)

  const [listenPhase, setListenPhase] = useState<ListenPhase>('idle')
  const [listenCountdown, setListenCountdown] = useState(10)
  const [listenResult, setListenResult] = useState<{ artist: string; title: string } | null>(null)
  const [listenError, setListenError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/gigs').then(r => r.json()),
      fetch('/api/notifications?limit=10').then(r => r.json()),
      fetch('/api/tasks').then(r => r.json()),
    ]).then(([gigsR, notifR, tasksR]) => {
      if (gigsR.status === 'fulfilled') setGigs(gigsR.value.gigs || [])
      if (notifR.status === 'fulfilled') setNotifications(notifR.value.notifications || [])
      if (tasksR.status === 'fulfilled') {
        const open = (tasksR.value.tasks || []).filter((t: any) => t.status !== 'done' && t.status !== 'archived')
        setTasks(open.slice(0, 10))
      }
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current)
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop()
      }
    }
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

  useEffect(() => {
    if (!nextGig) return
    fetch('/api/guest-list')
      .then(r => r.json())
      .then(d => {
        const hit = (d.invites || []).find((i: any) => i.gig_id === nextGig.id)
        if (hit) setGlSlug(hit.slug)
      })
      .catch(() => {})
  }, [nextGig?.id])

  async function handleShareGL() {
    if (!nextGig || sharing) return
    setSharing(true)
    try {
      let slug = glSlug
      if (!slug) {
        const res = await fetch('/api/guest-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gig_id: nextGig.id }),
        })
        const d = await res.json()
        slug = d?.invite?.slug || null
        if (slug) setGlSlug(slug)
      }
      if (!slug) return
      const url = `${window.location.origin}/gl/${slug}`
      const title = `Guest list · ${nextGig.venue}`
      void haptic('light')
      const surface = await shareOrCopy({ url, title })
      if (surface === 'clipboard') {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }
    } finally {
      setSharing(false)
    }
  }

  async function startListening() {
    setListenError('')
    setListenResult(null)
    setListenCountdown(10)
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setListenError('Microphone not available')
      setListenPhase('error')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(
        m => MediaRecorder.isTypeSupported(m)
      ) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder

      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (countdownRef.current) clearInterval(countdownRef.current)
        setListenPhase('identifying')
        try {
          const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })
          const form = new FormData()
          form.append('audio', blob, 'snippet.webm')
          const res = await fetch('/api/fingerprint', { method: 'POST', body: form })
          const data = await res.json()
          if (data.found) {
            const track = { artist: data.artist || '', title: data.title || '' }
            setListenResult(track)
            // Auto-save
            fetch('/api/tracks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tracks: [{ artist: track.artist, title: track.title, label: data.label || '', source: 'shazam' }] }),
            }).catch(() => {})
            setListenPhase('identified')
            // 6s gives time to read artist+title without feeling rushed.
            // Progress bar below makes the countdown visible (ADHD: clear
            // time signal, no surprise dismissal).
            autoDismissRef.current = setTimeout(() => closeListen(), 6000)
          } else {
            setListenPhase('not_found')
            autoDismissRef.current = setTimeout(() => closeListen(), 2000)
          }
        } catch {
          setListenError('Could not identify')
          setListenPhase('error')
        }
      }

      setListenPhase('listening')
      recorder.start(500)
      let secs = 10
      countdownRef.current = setInterval(() => {
        secs -= 1
        setListenCountdown(secs)
        if (secs <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
        }
      }, 1000)
    } catch {
      setListenError('Microphone access needed')
      setListenPhase('error')
    }
  }

  function closeListen() {
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current)
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
    setListenPhase('idle')
    setListenResult(null)
    setListenError('')
  }

  if (loading) {
    return (
      <div style={{ background: COLOR.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: COLOR.dimmer, textTransform: 'uppercase', fontWeight: 700 }}>LOADING</div>
      </div>
    )
  }

  if (tonightGig) {
    return (
      <div style={{ background: COLOR.bg, minHeight: '100vh', fontFamily: FONT, color: COLOR.text, paddingBottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
        <TopBar />
        <MobileTonightF tonightGig={tonightGig} tonightTravel={tonightTravel} />
      </div>
    )
  }

  const strip = nextGig ? formatGigStrip(nextGig) : null

  return (
    <div style={{ background: COLOR.bg, minHeight: '100vh', fontFamily: FONT, color: COLOR.text, paddingBottom: 'calc(160px + env(safe-area-inset-bottom))' }}>
      <TopBar />

      {/* SHAZAM HERO */}
      <div style={{ padding: '40px 20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
        <ShazamButton onPress={startListening} />
        <Link
          href="/setlab/library"
          style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.22em',
            color: COLOR.dimmer, textTransform: 'uppercase',
            textDecoration: 'none', WebkitTapHighlightColor: 'transparent',
            padding: '6px 14px',
          }}
        >
          VIEW TRACK ID PLAYLIST →
        </Link>
      </div>

      {/* GIG HERO CARD — distinct from feed: solid panel, left red bar, larger poster */}
      {strip && nextGig && (
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{
            display: 'flex', alignItems: 'stretch',
            background: COLOR.panel,
            borderLeft: `3px solid ${COLOR.red}`,
          }}>
            <button
              onClick={() => router.push(`/gigs`)}
              style={{
                flex: 1, background: 'transparent', border: 'none',
                padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '14px',
                color: COLOR.text, WebkitTapHighlightColor: 'transparent',
                overflow: 'hidden',
              }}
            >
              {(nextGig as any).artwork_url ? (
                <img
                  src={(nextGig as any).artwork_url}
                  alt=""
                  style={{ height: 54, width: 54, objectFit: 'cover', flexShrink: 0, display: 'block' }}
                />
              ) : (
                <div style={{
                  height: 54, width: 54, flexShrink: 0,
                  background: 'rgba(255,42,26,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', fontWeight: 800, letterSpacing: '0.2em', color: COLOR.red,
                }}>
                  GIG
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {/* Single eyebrow combines countdown + absolute date so they
                    don't repeat across two lines (audit: "30 APR" + "IN 4 DAYS"
                    were saying the same thing). */}
                <div style={{
                  fontSize: '9px', fontWeight: 700, letterSpacing: '0.24em',
                  color: COLOR.red, textTransform: 'uppercase',
                }}>
                  NEXT · {strip.days} · {strip.date}
                </div>
                <div style={{
                  fontSize: '14px', fontWeight: 700, letterSpacing: '0.04em',
                  color: COLOR.text, textTransform: 'uppercase',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {strip.venue}
                </div>
                {(() => {
                  const g = nextGig as any
                  const parts: string[] = []
                  if (typeof g.ra_attending === 'number') parts.push(`${g.ra_attending} GOING`)
                  const tiers = (g.dice_tiers as Array<{ name: string; status: string }> | null) || []
                  if (tiers.length) {
                    const onIdx = tiers.findIndex((t) => t.status === 'on-sale')
                    if (onIdx === -1) {
                      parts.push(tiers.every((t) => t.status === 'sold-out') ? 'DICE SOLD OUT' : 'DICE OFF-SALE')
                    } else {
                      parts.push(`T${onIdx + 1}/${tiers.length} ON SALE`)
                    }
                  }
                  return parts.length ? (
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.16em', color: COLOR.red, textTransform: 'uppercase', marginTop: '2px' }}>
                      {parts.join(' · ')}
                    </div>
                  ) : null
                })()}
              </div>
            </button>
            <button
              onClick={handleShareGL}
              disabled={sharing}
              style={{
                background: 'transparent', border: 'none',
                borderLeft: `1px solid ${COLOR.border}`,
                padding: '0 16px', cursor: 'pointer',
                fontSize: '10px', fontWeight: 800, letterSpacing: '0.22em',
                color: copied ? COLOR.red : COLOR.text, textTransform: 'uppercase',
                WebkitTapHighlightColor: 'transparent',
                minWidth: '80px',
              }}
            >
              {copied ? 'COPIED' : 'SHARE GL'}
            </button>
          </div>
        </div>
      )}

      {/* Unified feed — notifications + tasks, one line each, tag pill for type */}
      <div style={{ padding: '28px 20px 40px' }}>
        <SignalFeed notifications={notifications} tasks={tasks} />
      </div>

      {/* Listen modal */}
      {listenPhase !== 'idle' && (
        <ListenModal
          phase={listenPhase}
          countdown={listenCountdown}
          result={listenResult}
          error={listenError}
          onClose={closeListen}
          onRetry={startListening}
        />
      )}
    </div>
  )
}

function ListenModal({
  phase, countdown, result, error, onClose, onRetry,
}: {
  phase: ListenPhase
  countdown: number
  result: { artist: string; title: string } | null
  error: string
  onClose: () => void
  onRetry: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(5,5,5,0.96)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        fontFamily: FONT,
      }}
    >
      <style>{`
        @keyframes shazam-pulse {
          0% { transform: scale(1); opacity: 0.9; }
          100% { transform: scale(1.45); opacity: 0; }
        }
      `}</style>

      {phase === 'listening' && (
        <div style={{ position: 'relative', width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: `2px solid ${COLOR.red}`,
            animation: 'shazam-pulse 1.4s ease-out infinite',
          }} />
          <div style={{
            position: 'absolute', inset: '20px', borderRadius: '50%',
            border: `1px solid ${COLOR.red}80`,
            animation: 'shazam-pulse 1.4s ease-out infinite 0.4s',
          }} />
          <div style={{
            width: 140, height: 140, borderRadius: '50%',
            background: COLOR.red,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#000', fontWeight: 800, fontSize: 40, letterSpacing: '-0.035em',
          }}>
            {countdown}
          </div>
        </div>
      )}

      {phase === 'listening' && (
        <div style={{
          marginTop: 32, fontSize: 11, fontWeight: 700, letterSpacing: '0.22em',
          color: COLOR.dimmer, textTransform: 'uppercase',
        }}>
          LISTENING
        </div>
      )}

      {phase === 'identifying' && (
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', color: COLOR.red, textTransform: 'uppercase' }}>
          MATCHING
        </div>
      )}

      {phase === 'identified' && result && (
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', color: COLOR.red, textTransform: 'uppercase', marginBottom: 16 }}>
            ADDED TO CRATE
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: COLOR.text, marginBottom: 6, lineHeight: 1.2 }}>
            {result.title}
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: COLOR.dim, marginBottom: 24 }}>
            {result.artist}
          </div>
          {/* Visible 6s countdown — replaces the silent 2.4s auto-dismiss
              that disappeared before slower readers could parse the result. */}
          <div style={{ width: 220, height: 2, background: 'rgba(255,255,255,0.08)', margin: '0 auto', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: COLOR.red, animation: 'shazam-countdown 6s linear forwards' }} />
          </div>
          <style>{`@keyframes shazam-countdown { from { width: 100%; } to { width: 0%; } }`}</style>
        </div>
      )}

      {phase === 'not_found' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: COLOR.dim, marginBottom: 6 }}>No match</div>
          <div style={{ fontSize: 11, color: COLOR.dimmer }}>Try closer to the speaker</div>
        </div>
      )}

      {phase === 'error' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: COLOR.dim, marginBottom: 20 }}>{error || 'Something went wrong'}</div>
          <button onClick={onRetry} style={{
            background: COLOR.red, color: '#000', border: 'none',
            padding: '14px 28px', fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
            textTransform: 'uppercase', cursor: 'pointer', fontFamily: FONT,
          }}>
            RETRY
          </button>
        </div>
      )}

      {phase !== 'identified' && phase !== 'not_found' && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 20, right: 20,
            background: 'transparent', border: 'none',
            color: COLOR.dimmer, fontSize: 11, fontWeight: 800, letterSpacing: '0.22em',
            textTransform: 'uppercase', cursor: 'pointer', fontFamily: FONT,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          CLOSE
        </button>
      )}
    </div>
  )
}

function ShazamButton({ onPress }: { onPress: () => void }) {
  const [pressed, setPressed] = useState(false)
  const size = typeof window !== 'undefined' && window.innerWidth < 360 ? 180 : 220
  return (
    <button
      onClick={onPress}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: pressed ? COLOR.redPressed : COLOR.red,
        border: 'none', cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        boxShadow: pressed
          ? '0 0 0 0 rgba(255,42,26,0)'
          : '0 0 60px rgba(255,42,26,0.35), 0 0 120px rgba(255,42,26,0.15)',
        transition: 'background 80ms ease, box-shadow 200ms ease',
        WebkitTapHighlightColor: 'transparent',
        padding: 0,
      }}
    >
      <div style={{
        fontSize: size >= 220 ? '32px' : '26px', fontWeight: 900,
        letterSpacing: '0.14em', color: '#000', textTransform: 'uppercase',
        lineHeight: 1,
      }}>
        TRACK ID
      </div>
      <div style={{
        marginTop: '12px',
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.22em',
        color: '#000', opacity: 0.7, textTransform: 'uppercase',
      }}>
        TAP · SHAZAM · 10s
      </div>
    </button>
  )
}

// Map a notification.type string to a short pill tag. Keep mapping tight —
// anything we don't recognise falls through to ALERT so nothing ever renders
// without a tag.
function pillForNotification(type: string): { tag: string; tone: 'red' | 'amber' | 'dim' } {
  const t = (type || '').toLowerCase()
  if (t.includes('invoice') || t.includes('payment')) return { tag: 'INVOICE', tone: 'amber' }
  if (t.includes('gig') || t.includes('booking') || t.includes('show')) return { tag: 'GIG', tone: 'amber' }
  if (t.includes('release') || t.includes('track') || t.includes('song')) return { tag: 'RELEASE', tone: 'dim' }
  if (t.includes('agent') || t.includes('fail') || t.includes('error')) return { tag: 'ALERT', tone: 'red' }
  if (t.includes('post') || t.includes('content') || t.includes('caption')) return { tag: 'POST', tone: 'dim' }
  return { tag: 'ALERT', tone: 'red' }
}

type FeedRow = {
  key: string
  tag: string
  tone: 'red' | 'amber' | 'dim'
  title: string
  meta: string
  href: string | null
  unread: boolean
  urgency: number // higher = more urgent, used for sort
}

function SignalFeed({
  notifications, tasks,
}: {
  notifications: SystemNotification[]
  tasks: Array<{ id: string; title: string; status: string }>
}) {
  const rows: FeedRow[] = [
    ...notifications.map((n): FeedRow => {
      const pill = pillForNotification(n.type)
      return {
        key: `n-${n.id}`,
        tag: pill.tag,
        tone: pill.tone,
        title: n.title,
        meta: notifTimeAgo(n.created_at),
        href: n.href || '/notifications',
        unread: !n.read,
        urgency: (n.read ? 0 : 40) + (pill.tone === 'red' ? 20 : pill.tone === 'amber' ? 10 : 0),
      }
    }),
    ...tasks.map((t): FeedRow => ({
      key: `t-${t.id}`,
      tag: 'TASK',
      tone: 'dim',
      title: t.title,
      meta: '',
      href: '/tasks',
      unread: false,
      urgency: 5,
    })),
  ]
  rows.sort((a, b) => b.urgency - a.urgency)
  const items = rows.slice(0, 6)
  const [idx, setIdx] = useState(0)

  // Auto-rotate every 4s. Pause when there's only one item.
  useEffect(() => {
    if (items.length <= 1) return
    const t = setInterval(() => setIdx(i => (i + 1) % items.length), 4000)
    return () => clearInterval(t)
  }, [items.length])

  if (items.length === 0) {
    return (
      <div style={{
        border: `1px solid ${COLOR.border}`,
        padding: '22px 18px',
        fontSize: '13px', color: COLOR.dimmest, textAlign: 'center',
      }}>
        All clear.
      </div>
    )
  }

  const r = items[Math.min(idx, items.length - 1)]

  return (
    <Link
      href={r.href || '#'}
      style={{
        display: 'block',
        border: `1px solid ${COLOR.border}`,
        background: COLOR.panel,
        padding: '16px 18px 14px',
        textDecoration: 'none', color: 'inherit',
        WebkitTapHighlightColor: 'transparent',
        position: 'relative',
        minHeight: '96px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <FeedPill tag={r.tag} tone={r.tone} />
        {r.meta && (
          <div style={{
            fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
            color: COLOR.dimmer,
          }}>
            {r.meta}
          </div>
        )}
      </div>
      <div style={{
        fontSize: '15px', fontWeight: r.unread ? 600 : 500,
        color: r.unread ? COLOR.text : COLOR.dim,
        lineHeight: 1.4,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {r.title}
      </div>

      {items.length > 1 && (
        <div style={{
          display: 'flex', gap: '4px', marginTop: '14px',
          justifyContent: 'center',
        }}>
          {items.map((_, i) => (
            <div key={i} style={{
              width: i === idx ? '14px' : '4px',
              height: '2px',
              background: i === idx ? COLOR.red : COLOR.border,
              transition: 'width 200ms ease, background 200ms ease',
            }} />
          ))}
        </div>
      )}
    </Link>
  )
}

function FeedPill({ tag, tone }: { tag: string; tone: 'red' | 'amber' | 'dim' }) {
  const palette = tone === 'red'
    ? { bg: 'rgba(255,42,26,0.12)', fg: COLOR.red, border: 'rgba(255,42,26,0.25)' }
    : tone === 'amber'
    ? { bg: 'rgba(245,166,35,0.1)', fg: COLOR.amber, border: 'rgba(245,166,35,0.22)' }
    : { bg: 'transparent', fg: COLOR.dimmer, border: COLOR.border }
  return (
    <div style={{
      flexShrink: 0,
      fontSize: '9px', fontWeight: 800, letterSpacing: '0.18em',
      color: palette.fg, background: palette.bg,
      border: `1px solid ${palette.border}`,
      padding: '4px 7px',
      textTransform: 'uppercase',
      minWidth: '58px', textAlign: 'center',
    }}>
      {tag}
    </div>
  )
}

function TopBar() {
  return (
    <div style={{
      padding: 'calc(20px + env(safe-area-inset-top)) 20px 0',
      minHeight: '44px',
      display: 'flex', alignItems: 'center',
    }}>
      <div style={{
        fontSize: '10px', fontWeight: 700, letterSpacing: '0.22em',
        color: COLOR.text, textTransform: 'uppercase',
      }}>
        SIGNAL LAB
      </div>
    </div>
  )
}
