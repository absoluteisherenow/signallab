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
  title: string
  timestamp: string
  href?: string
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

export function Today() {
  const router = useRouter()
  const [data, setData] = useState<TodayBrief | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/today/brief')
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then(setData)
      .catch(() => setError(true))
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
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 6, fontWeight: 700 }}>
              Signal Lab OS
            </div>
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
          </div>

          <div style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {[
                { label: '+ Gig', href: '/gigs/new' },
                { label: '+ Post', href: '/post' },
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
                  onClick={() => router.push(`/calendar?date=${d.fullDate.toISOString().split('T')[0]}`)}
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
          </div>
        </div>

        {/* Week strip + context line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 8 }}>
          <p style={{ fontSize: 12, color: 'var(--text-dimmer)', margin: 0, lineHeight: 1.5, flex: 1 }}>
            {contextLine}
          </p>
        </div>
      </div>

      {/* ── The Labs ── */}
      <div style={{ padding: '16px 24px 0', flexShrink: 0 }}>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, margin: '0 0 12px', letterSpacing: '-0.03em', textTransform: 'uppercase' }}>
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
            { label: 'Releases', stat: `${data.stats.releases} releases`, href: '/releases' },
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
                <div style={{ fontSize: 'clamp(14px, 1.8vw, 28px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.03em', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 32, flex: 1, minHeight: 0, overflow: 'hidden' }}>
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

              {/* Next Scheduled Post preview */}
              {data.next_scheduled_post && (
                <Link
                  href="/calendar"
                  style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.1)', background: 'var(--panel)', textDecoration: 'none', color: 'inherit', transition: 'border-color 0.15s', maxWidth: 480 }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
                >
                  {(data.next_scheduled_post.media_urls?.[0] || data.next_scheduled_post.media_url) && (
                    <img
                      src={data.next_scheduled_post.media_urls?.[0] || data.next_scheduled_post.media_url!}
                      alt=""
                      style={{ width: 44, height: 44, objectFit: 'cover', flexShrink: 0 }}
                    />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-dimmest)', fontWeight: 700, marginBottom: 3 }}>
                      Next Post &middot; {data.next_scheduled_post.platform.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dimmer)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {data.next_scheduled_post.caption?.slice(0, 80) || 'No caption'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dimmest)', marginTop: 2 }}>
                      {new Date(data.next_scheduled_post.scheduled_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </Link>
              )}
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
        </div>

        {/* Right: To Do + Needs Attention */}
        <div style={{ flex: 0.4, minWidth: 220, maxWidth: 340 }}>
          {/* TO DO */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 900 }}>
                To Do
              </div>
              <Link href="/tasks" style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--gold)', textDecoration: 'none', fontWeight: 700 }}>All {data.tasks.length} &rarr;</Link>
            </div>
            {data.tasks.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-dimmest)' }}>No open tasks</div>
            )}
            <motion.div variants={staggerContainer} initial="hidden" animate="visible">
              {data.tasks.slice(0, 3).map((task) => (
                <motion.div
                  key={task.id}
                  variants={staggerItem}
                  onClick={() => router.push('/tasks')}
                  style={{ padding: '6px 10px', borderLeft: '2px solid var(--border)', marginBottom: 3, cursor: 'pointer', fontSize: 11, color: 'var(--text-dimmer)', transition: 'border-color 0.15s' }}
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
