'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { staggerContainer, staggerItem } from '@/lib/motion'

/* ── Types ── */

interface AttentionItem {
  type: 'post_approval' | 'overdue_invoice' | 'missing_advance' | 'unbooked_travel'
  label: string
  count: number
  href: string
}

interface UpcomingGig {
  id: string
  title: string
  venue: string
  location: string
  date: string
  status: string
}

interface ActivityItem {
  id?: string
  title: string
  type?: string
  created_at?: string
  timestamp?: string
  href?: string | null
  read?: boolean
}

interface TaskItem {
  id: string
  title: string
  status: string
  priority: string | null
  created_at: string
}

interface Stats {
  confirmed_gigs: number
  tracks: number
  queued_content: number
  sets: number
  releases: number
}

interface NextScheduledPost {
  id: string
  platform: string
  caption: string
  scheduled_at: string
  media_url: string | null
  media_urls: string[] | null
}

interface NextGigPrep {
  advance_done: boolean
  travel_booked: boolean
  set_time_confirmed: boolean
}

interface TodayBrief {
  brief: string | null
  needs_attention: AttentionItem[]
  next_gig: UpcomingGig | null
  next_gig_prep: NextGigPrep | null
  upcoming_gigs: UpcomingGig[]
  content_pipeline: { drafts: number; scheduled: number; approved: number }
  stats: Stats
  next_scheduled_post: NextScheduledPost | null
  recent_activity: ActivityItem[]
  tasks: TaskItem[]
}

/* ── Helpers ── */

function daysUntil(dateStr: string): number {
  const now = new Date()
  const target = new Date(dateStr)
  const diff = target.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function hoursUntil(dateStr: string): number {
  const now = new Date()
  const target = new Date(dateStr)
  const diff = target.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60)))
}

function relativeTime(timestamp: string): string {
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return `${Math.floor(diffDays / 7)}w ago`
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'GOOD MORNING.'
  if (h < 17) return 'GOOD AFTERNOON.'
  return 'GOOD EVENING.'
}

function getWeekDays(): { day: string; date: number; isToday: boolean; fullDate: Date }[] {
  const now = new Date()
  const days: { day: string; date: number; isToday: boolean; fullDate: Date }[] = []
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  for (let i = 0; i < 7; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    days.push({
      day: dayNames[d.getDay()],
      date: d.getDate(),
      isToday: i === 0,
      fullDate: d,
    })
  }
  return days
}

function gigCountdown(dateStr: string): string {
  const days = daysUntil(dateStr)
  if (days === 0) return 'TONIGHT'
  if (days === 1) return 'TOMORROW'
  return `IN ${days} DAYS`
}

/* ── Skeleton ── */

function Skeleton() {
  return (
    <div style={{ padding: '32px 24px' }}>
      <div style={{ height: 60, width: 400, background: 'var(--panel)', marginBottom: 24, animation: 'pulse 1.4s ease-in-out infinite' }} />
      <div style={{ height: 16, width: 500, background: 'var(--panel)', marginBottom: 40, animation: 'pulse 1.4s ease-in-out infinite', animationDelay: '0.1s' }} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 40 }}>
        {[1, 2, 3, 4, 5].map((_, i) => (
          <div key={i} style={{ flex: 1, height: 80, background: 'var(--panel)', animation: 'pulse 1.4s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
      <div style={{ height: 200, background: 'var(--panel)', marginBottom: 24, animation: 'pulse 1.4s ease-in-out infinite', animationDelay: '0.3s' }} />
      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
    </div>
  )
}

/* ── Main component ── */

interface AnticipationNotice {
  lab: 'Set' | 'Broadcast' | 'Grow' | 'Operator'
  title: string
  detail: string
  href: string
  priority: number
}

export function Today() {
  const router = useRouter()
  const [data, setData] = useState<TodayBrief | null>(null)
  const [error, setError] = useState(false)
  const [notices, setNotices] = useState<AnticipationNotice[]>([])

  useEffect(() => {
    fetch('/api/today/brief')
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then(setData)
      .catch(() => setError(true))

    // Anticipation: cross-lab "things I noticed" strip. Runs separately so a
    // slow query here never blocks the main dashboard render.
    fetch('/api/today/anticipation')
      .then(r => r.ok ? r.json() : { notices: [] })
      .then(j => setNotices(j.notices || []))
      .catch(() => {})
  }, [])

  if (error) {
    return (
      <div style={{ padding: '32px 24px', color: 'var(--text-dimmest)', fontSize: 13 }}>
        Failed to load dashboard.
      </div>
    )
  }

  if (!data) return <Skeleton />

  const weekDays = getWeekDays()
  const now = new Date()
  const dateString = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const nextGig = data.next_gig
  const overdueCount = data.needs_attention.find((n) => n.type === 'overdue_invoice')?.count ?? 0

  // Build context line like old dashboard
  const contextParts: string[] = [dateString]
  if (nextGig) {
    const h = hoursUntil(nextGig.date)
    if (h <= 24) contextParts.push(`${h}h to doors at ${nextGig.venue.toUpperCase()}`)
    else contextParts.push(`${daysUntil(nextGig.date)}d to ${nextGig.venue.toUpperCase()}`)
  }
  if (overdueCount > 0) contextParts.push(`${overdueCount} invoices overdue`)
  if (data.stats.queued_content > 0) contextParts.push(`${data.stats.queued_content} posts queued`)
  const contextLine = contextParts.join(' \u00B7 ')

  return (
    <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxWidth: '100%' }}>
      {/* ── Header: Greeting + Quick Actions + Week Strip ── */}
      <div style={{ padding: '4px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', marginBottom: 0 }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 24, display: 'flex', flexDirection: 'column' }}>
            <h1 style={{
              fontSize: 'clamp(36px, 5vw, 60px)',
              fontWeight: 900,
              lineHeight: 0.95,
              margin: 0,
              letterSpacing: '-0.03em',
              textTransform: 'uppercase',
            }}>
              {getGreeting()}
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-dimmer)', margin: '4px 0 0', lineHeight: 1.4 }}>
              {contextLine}
            </p>

            {/* Cross-lab anticipation — "things I noticed" strip. Only renders
                when the backend surfaced at least one notice, so an empty state
                doesn't push the ticker off-screen. */}
            {notices.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>Noticed</div>
                {notices.map((n, i) => (
                  <Link
                    key={i}
                    href={n.href}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'baseline',
                      padding: '6px 0', borderTop: i === 0 ? '1px solid var(--border-dim)' : 'none',
                      borderBottom: '1px solid var(--border-dim)',
                      textDecoration: 'none', color: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 9, letterSpacing: '0.2em', fontWeight: 700, color: 'var(--gold)', width: 72, flexShrink: 0 }}>
                      {n.lab.toUpperCase()} LAB
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text)' }}>{n.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dimmest)', marginLeft: 'auto' }}>{n.detail}</span>
                  </Link>
                ))}
              </div>
            )}

            {/* Activity ticker — single row, scrolling */}
            {data.recent_activity && data.recent_activity.length > 0 && (
              <div style={{
                marginTop: 'auto',
                paddingTop: 10,
                paddingBottom: 10,
                borderTop: '1px solid var(--border-dim)',
                borderBottom: '1px solid var(--border-dim)',
                overflow: 'hidden',
                position: 'relative',
                maskImage: 'linear-gradient(to right, transparent, black 4%, black 96%, transparent)',
                WebkitMaskImage: 'linear-gradient(to right, transparent, black 4%, black 96%, transparent)',
              }}>
                <div style={{
                  display: 'inline-flex',
                  gap: 48,
                  whiteSpace: 'nowrap',
                  animation: `ticker ${Math.max(30, data.recent_activity.length * 8)}s linear infinite`,
                  paddingLeft: '100%',
                }}>
                  {[...data.recent_activity, ...data.recent_activity].map((item, i) => {
                    const ts = item.created_at || item.timestamp
                    const isNew = item.read === false
                    const inner = (
                      <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'inline-flex', gap: 12, alignItems: 'center' }}>
                        {isNew && (
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />
                        )}
                        {item.type && (
                          <span style={{ color: isNew ? 'var(--gold)' : 'var(--text-dimmest)', fontWeight: 700, letterSpacing: '0.2em' }}>
                            {item.type.replace(/_/g, ' ')}
                          </span>
                        )}
                        <span style={{ color: isNew ? 'var(--gold)' : 'var(--text)' }}>{item.title}</span>
                        {ts && (
                          <span style={{ color: 'var(--text-dimmest)', fontSize: 10 }}>
                            {relativeTime(ts)}
                          </span>
                        )}
                      </span>
                    )
                    const key = `${item.id || item.title}-${i}`
                    return item.href ? (
                      <Link key={key} href={item.href} style={{ textDecoration: 'none', color: 'inherit' }}>
                        {inner}
                      </Link>
                    ) : (
                      <span key={key}>{inner}</span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {[
                { label: '+ Gig', href: '/gigs/new' },
                { label: '+ Post', href: '/broadcast/quick-post' },
                { label: '+ Invoice', href: '/business/finances' },
                { label: '+ Release', href: '/releases/new' },
                { label: '+ Task', href: '/tasks' },
              ].map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text)',
                    textDecoration: 'none',
                    padding: '8px 18px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'transparent',
                    whiteSpace: 'nowrap',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = '#161616' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.background = 'transparent' }}
                >
                  {action.label}
                </Link>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
              {weekDays.map((d) => (
                <div
                  key={d.day + d.date}
                  onClick={() => router.push(`/broadcast/calendar?date=${d.fullDate.toISOString().split('T')[0]}`)}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '6px 0 8px',
                    background: d.isToday ? 'var(--gold)' : 'transparent',
                    color: d.isToday ? '#050505' : 'var(--text-dimmer)',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!d.isToday) e.currentTarget.style.background = '#161616' }}
                  onMouseLeave={(e) => { if (!d.isToday) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ fontSize: 10, letterSpacing: '0.12em', fontWeight: 700 }}>{d.day}</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{d.date}</div>
                </div>
              ))}
            </div>

            {/* Next Post preview tile — fills the vertical space under the week strip */}
            {data.next_scheduled_post && (
              <Link
                href="/broadcast/calendar"
                style={{
                  display: 'flex', gap: 12, alignItems: 'stretch',
                  marginTop: 8, padding: 10,
                  border: '1px solid rgba(255,255,255,0.1)', background: 'var(--panel)',
                  textDecoration: 'none', color: 'inherit', transition: 'border-color 0.15s',
                  width: '100%', boxSizing: 'border-box',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
              >
                {(data.next_scheduled_post.media_urls?.[0] || data.next_scheduled_post.media_url) ? (
                  <img
                    src={data.next_scheduled_post.media_urls?.[0] || data.next_scheduled_post.media_url!}
                    alt=""
                    style={{ width: 88, height: 88, objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{ width: 88, height: 88, flexShrink: 0, background: '#161616', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-dimmest)', letterSpacing: '0.15em', fontWeight: 700 }}>
                    {data.next_scheduled_post.platform.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingTop: 2, paddingBottom: 2 }}>
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 700, lineHeight: 1.3, marginBottom: 4 }}>
                      Next Post
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                      {data.next_scheduled_post.caption?.slice(0, 140) || 'No caption'}
                    </div>
                  </div>
                  <div style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmest)', fontWeight: 700, marginTop: 4 }}>
                    {new Date(data.next_scheduled_post.scheduled_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase()} &middot; {data.next_scheduled_post.platform.toUpperCase()}
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>

      {/* ── The Labs ── */}
      <div style={{ padding: '0 24px 0', flexShrink: 0 }}>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, margin: '0 0 4px', letterSpacing: '-0.03em', textTransform: 'uppercase' }}>
          The Labs
        </h2>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          style={{ display: 'flex', gap: 8, overflow: 'hidden' }}
        >
          {[
            { label: 'Gigs', stat: `${data.stats.confirmed_gigs} confirmed`, href: '/gigs' },
            { label: 'Content', stat: `${data.stats.queued_content} queued`, href: '/calendar' },
            { label: 'Sets', stat: `${data.stats.sets} sets`, href: '/setlab' },
            { label: 'Tracks', stat: `${data.stats.tracks} tracks`, href: '/setlab' },
            { label: 'Releases', stat: `${data.stats.releases} releases`, href: '/promo' },
          ].map((card) => (
            <motion.div key={card.label} variants={staggerItem} style={{ flex: 1, minWidth: 0 }}>
              <Link
                href={card.href}
                style={{
                  display: 'block',
                  padding: '16px 10px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'var(--panel)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  textDecoration: 'none',
                  color: 'inherit',
                  overflow: 'hidden',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = '#161616' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.background = 'var(--panel)' }}
              >
                <div style={{ fontSize: 'clamp(20px, 2.8vw, 42px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.03em', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 'clamp(9px, 0.7vw, 11px)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmest)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {card.stat}
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* ── Next Gig (left) + To Do / Needs Attention (right) ── */}
      <div style={{ padding: '2px 24px 0', display: 'flex', gap: 32, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left: Next Gig — HUGE venue + city, post preview, prep checklist */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {nextGig ? (
            <>
              <Link href={`/gigs/${nextGig.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 700, marginBottom: 8 }}>
                  Next Gig &middot; {gigCountdown(nextGig.date)}
                </div>
                <h2 style={{
                  fontSize: 'clamp(48px, 8vw, 120px)',
                  fontWeight: 900,
                  lineHeight: 0.88,
                  margin: 0,
                  letterSpacing: '-0.04em',
                  textTransform: 'uppercase',
                  wordBreak: 'break-word',
                }}>
                  {nextGig.venue}
                </h2>
                <h3 style={{
                  fontSize: 'clamp(28px, 4vw, 56px)',
                  fontWeight: 900,
                  lineHeight: 0.92,
                  margin: '4px 0 14px',
                  letterSpacing: '-0.03em',
                  textTransform: 'uppercase',
                  color: 'var(--text-dimmer)',
                }}>
                  {nextGig.location}
                </h3>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-dimmer)', textTransform: 'uppercase', letterSpacing: '0.08em', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>{new Date(nextGig.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', border: '1px solid var(--border)', fontWeight: 700 }}>
                    {nextGig.status.toUpperCase()}
                  </span>
                  {data.next_gig_prep && (
                    <>
                      <span style={{ fontSize: 10, padding: '2px 8px', border: `1px solid ${data.next_gig_prep.set_time_confirmed ? 'rgba(255,255,255,0.15)' : 'var(--gold)'}`, fontWeight: 700, color: data.next_gig_prep.set_time_confirmed ? 'var(--text-dimmer)' : 'var(--gold)' }}>
                        {data.next_gig_prep.set_time_confirmed ? 'SET TIME \u2713' : 'SET TIME NEEDED'}
                      </span>
                      <span style={{ fontSize: 10, padding: '2px 8px', border: `1px solid ${data.next_gig_prep.advance_done ? 'rgba(255,255,255,0.15)' : 'var(--gold)'}`, fontWeight: 700, color: data.next_gig_prep.advance_done ? 'var(--text-dimmer)' : 'var(--gold)' }}>
                        {data.next_gig_prep.advance_done ? 'ADVANCE \u2713' : 'ADVANCE NEEDED'}
                      </span>
                      <span style={{ fontSize: 10, padding: '2px 8px', border: `1px solid ${data.next_gig_prep.travel_booked ? 'rgba(255,255,255,0.15)' : 'var(--gold)'}`, fontWeight: 700, color: data.next_gig_prep.travel_booked ? 'var(--text-dimmer)' : 'var(--gold)' }}>
                        {data.next_gig_prep.travel_booked ? 'TRAVEL \u2713' : 'TRAVEL NEEDED'}
                      </span>
                    </>
                  )}
                </div>
              </Link>

            </>
          ) : (
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--text-dimmest)', fontWeight: 700, marginBottom: 8 }}>Next Gig</div>
              <h2 style={{ fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 900, lineHeight: 0.92, margin: '0 0 12px', letterSpacing: '-0.03em', textTransform: 'uppercase', color: 'var(--text-dimmest)' }}>
                No upcoming gigs
              </h2>
              <Link href="/gigs" style={{ fontSize: 11, color: 'var(--gold)', textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>View gigs</Link>
            </div>
          )}

          {/* THEN — upcoming gigs beyond the Next Gig */}
          {data.upcoming_gigs && data.upcoming_gigs.length > 1 && (
            <div style={{ marginTop: 20, maxWidth: 640 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--text-dimmest)', fontWeight: 700, marginBottom: 8 }}>
                Then
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {data.upcoming_gigs.slice(1, 4).map((g) => {
                  const d = new Date(g.date)
                  const dateLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
                  return (
                    <Link
                      key={g.id}
                      href={`/gigs/${g.id}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '72px 1fr auto',
                        alignItems: 'baseline',
                        gap: 16,
                        padding: '10px 0',
                        borderTop: '1px solid var(--border-dim)',
                        textDecoration: 'none',
                        color: 'inherit',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#101010')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--gold)' }}>{dateLabel}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.venue.trim()}
                      </span>
                      <span style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>
                        {g.location.trim()}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* Right: To Do + Needs Attention */}
        <div style={{ flex: 0.4, minWidth: 220, maxWidth: 340, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* TO DO */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 900 }}>
                To Do
              </div>
              <Link href="/tasks" style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmer)', textDecoration: 'none', fontWeight: 700 }}>All {data.tasks.length} &rarr;</Link>
            </div>
            {data.tasks.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-dimmest)' }}>No open tasks</div>
            )}
            <motion.div variants={staggerContainer} initial="hidden" animate="visible" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {data.tasks.map((task) => (
                <motion.div
                  key={task.id}
                  variants={staggerItem}
                  onClick={() => router.push('/tasks')}
                  style={{ padding: '8px 10px', borderLeft: '2px solid var(--border)', marginBottom: 4, cursor: 'pointer', fontSize: 11, color: 'var(--text-dimmer)', transition: 'border-color 0.15s', lineHeight: 1.4 }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderLeftColor = 'var(--gold)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderLeftColor = 'var(--border)')}
                >
                  {task.title}
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* NEEDS ATTENTION */}
          {data.needs_attention.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-dim)' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 900, marginBottom: 8 }}>
                Needs Attention
              </div>
              <motion.div variants={staggerContainer} initial="hidden" animate="visible">
                {data.needs_attention.map((item) => (
                  <motion.div
                    key={item.type}
                    variants={staggerItem}
                    onClick={() => router.push(item.href)}
                    style={{ padding: '6px 10px', borderLeft: '2px solid var(--gold)', marginBottom: 3, cursor: 'pointer', fontSize: 11, color: 'var(--gold)', transition: 'opacity 0.15s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    {item.label}
                  </motion.div>
                ))}
              </motion.div>
            </div>
          )}

        </div>
      </div>

    </div>
  )
}
