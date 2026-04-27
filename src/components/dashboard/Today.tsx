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
  starred?: boolean
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
  hotel_booked: boolean
  transport_booked: boolean
  ground_booked: boolean
  is_hometown: boolean
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

interface AnticipationNotice {
  lab: 'Set' | 'Broadcast' | 'Grow' | 'Operator'
  title: string
  detail: string
  href: string
  priority: number
}

/** Single unified row rendered in the consolidated "What needs you" column.
 *  Merges legacy `needs_attention` items (post_approval, overdue_invoice etc)
 *  with `anticipation` notices so the artist sees one ranked list instead of
 *  three competing surfaces. */
interface AttnRow {
  key: string
  rank: number
  tag: string
  title: string
  detail: string
  href: string
  urgent: boolean
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

/** Merge `needs_attention` + `anticipation notices` into one ranked list.
 *  Urgency priority: overdue_invoice > unbooked_travel > missing_advance >
 *  notices (by their server-assigned priority) > post_approval. The cap of
 *  6 keeps the column scannable without scroll. */
function mergeAttention(
  needs: AttentionItem[],
  notices: AnticipationNotice[]
): AttnRow[] {
  const tagFor: Record<string, string> = {
    overdue_invoice: 'Finance',
    post_approval: 'Broadcast',
    missing_advance: 'Tour',
    unbooked_travel: 'Tour',
  }
  const detailFor: Record<string, string> = {
    overdue_invoice: 'Past due. Chase or write off.',
    post_approval: 'Review in Broadcast so the publish cron takes them live.',
    missing_advance: 'Confirm logistics with the promoter before show day.',
    unbooked_travel: 'Book hotel + transport before prices climb.',
  }
  const urgencyWeight: Record<string, number> = {
    overdue_invoice: 100,
    unbooked_travel: 80,
    missing_advance: 70,
    post_approval: 30,
  }
  const fromNeeds: AttnRow[] = needs.map((n) => ({
    key: `need-${n.type}`,
    rank: 0,
    tag: (tagFor[n.type] || 'Operator').toUpperCase(),
    title: n.label,
    detail: detailFor[n.type] || '',
    href: n.href,
    urgent: n.type === 'overdue_invoice' || n.type === 'unbooked_travel',
  })).map((row, i) => ({ ...row, _w: urgencyWeight[needs[i].type] || 50 } as AttnRow & { _w: number }))

  const fromNotices: AttnRow[] = notices.map((n) => ({
    key: `notice-${n.lab}-${n.title}`,
    rank: 0,
    tag: n.lab.toUpperCase(),
    title: n.title,
    detail: n.detail,
    href: n.href,
    urgent: n.priority >= 9,
  })).map((row, i) => ({ ...row, _w: notices[i].priority * 5 } as AttnRow & { _w: number }))

  const all = [...fromNeeds, ...fromNotices] as Array<AttnRow & { _w: number }>
  all.sort((a, b) => b._w - a._w)
  return all.slice(0, 6).map((row, i) => ({ ...row, rank: i + 1 }))
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
  const [notices, setNotices] = useState<AnticipationNotice[]>([])
  // Local optimistic state for task checkbox + star toggles. Mirrors the
  // server fields onto each row id so the UI updates instantly while the
  // PATCH is in flight.
  const [taskOverrides, setTaskOverrides] = useState<Record<string, { done?: boolean; starred?: boolean; title?: string }>>({})
  // Inline edit state — clicking a todo title swaps it for an input. Blur or
  // Enter commits via PATCH; Esc cancels. Saves the artist a navigation to
  // /tasks for trivial typos / wording tweaks.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  // Quick-add inline at top of the column. Empty string = not active.
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskText, setNewTaskText] = useState('')

  useEffect(() => {
    fetch('/api/today/brief')
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then(setData)
      .catch(() => setError(true))

    // Anticipation: cross-lab "things I noticed" feed. Runs separately so a
    // slow query here never blocks the main dashboard render. Result is
    // merged into the unified attention column below.
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
  const attentionRows = mergeAttention(data.needs_attention, notices)

  // Personal todo column: starred first, then most-recent. Done items stay
  // visible in the list (line-through + dimmed) until next page load — the
  // satisfying tick-off moment is the whole point of the checkbox. Server
  // filters status='completed' on next /api/today/brief fetch so they fall
  // away naturally on refresh. Cap at 8 visible so the column never scrolls.
  const visibleTasks = data.tasks
    .map(t => ({ ...t, ...(taskOverrides[t.id] || {}) }))
    .sort((a, b) => {
      // Done items sink to the bottom; among the rest, starred float to top
      const aDone = !!a.done, bDone = !!b.done
      if (aDone !== bDone) return aDone ? 1 : -1
      return Number(!!b.starred) - Number(!!a.starred)
    })
    .slice(0, 8)

  async function toggleTaskDone(id: string, current: boolean) {
    setTaskOverrides(o => ({ ...o, [id]: { ...o[id], done: !current } }))
    try {
      await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: !current ? 'completed' : 'open' }),
      })
    } catch {
      // Roll back on error so the UI reflects reality
      setTaskOverrides(o => ({ ...o, [id]: { ...o[id], done: current } }))
    }
  }
  async function toggleTaskStar(id: string, current: boolean) {
    setTaskOverrides(o => ({ ...o, [id]: { ...o[id], starred: !current } }))
    try {
      await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: !current }),
      })
    } catch {
      setTaskOverrides(o => ({ ...o, [id]: { ...o[id], starred: current } }))
    }
  }
  async function commitEdit(id: string, original: string) {
    const next = editingText.trim()
    setEditingId(null)
    if (!next || next === original) return
    setTaskOverrides(o => ({ ...o, [id]: { ...o[id], title: next } }))
    try {
      await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: next }),
      })
    } catch {
      // Revert on failure
      setTaskOverrides(o => ({ ...o, [id]: { ...o[id], title: original } }))
    }
  }
  async function commitNewTask() {
    const title = newTaskText.trim()
    setAddingTask(false)
    setNewTaskText('')
    if (!title) return
    try {
      const r = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const j = await r.json().catch(() => ({}))
      if (j?.task) {
        // Splice the new row into local state so it shows instantly without
        // a full /api/today/brief refetch.
        setData(d => d ? { ...d, tasks: [j.task, ...d.tasks] } : d)
      }
    } catch {}
  }

  // Build context line — single status string under the greeting
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
      {/* ── Header: Greeting + My To Do (left) | Quick Actions + Week + Next Post (right) ── */}
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

            {/* My To Do — moved up here so nothing important sits below the
                fold. 2-col grid mirrors the right rail's vertical footprint.
                Star toggles + checkboxes make the list read instantly as
                "your hand-written list" vs the system attention column. */}
            {visibleTasks.length > 0 && (
              <section className="band band-todo" style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 900 }}>
                    My To Do
                  </div>
                  <Link href="/tasks" style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmer)', textDecoration: 'none', fontWeight: 700 }}>
                    All {data.tasks.filter(t => !taskOverrides[t.id]?.done).length} &rarr;
                  </Link>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
                  {visibleTasks.map((task) => {
                    const starred = !!task.starred
                    const done = !!task.done
                    return (
                      <div
                        key={task.id}
                        className={`todo-pill${starred ? ' starred' : ''}${done ? ' done' : ''}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '14px 1fr auto',
                          gap: 8,
                          alignItems: 'center',
                          padding: '8px 10px',
                          borderLeft: `2px solid ${done ? 'var(--text-dimmest)' : starred ? 'var(--gold)' : 'rgba(255,255,255,0.15)'}`,
                          color: done ? 'var(--text-dimmest)' : 'var(--text)',
                          fontSize: 11,
                          lineHeight: 1.35,
                          transition: 'border-color 140ms ease, background 140ms ease, color 140ms ease',
                        }}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleTaskDone(task.id, done) }}
                          aria-label={done ? 'Mark incomplete' : 'Mark complete'}
                          style={{
                            width: 14, height: 14, padding: 0,
                            border: `1.5px solid ${done ? 'var(--text-dimmest)' : starred ? 'var(--gold)' : 'var(--text-dimmer)'}`,
                            background: done ? 'var(--text-dimmest)' : 'transparent',
                            cursor: 'pointer',
                            position: 'relative',
                          }}
                        >
                          {done && (
                            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#050505', lineHeight: 1 }}>
                              {'\u2713'}
                            </span>
                          )}
                        </button>
                        {editingId === task.id ? (
                          <input
                            autoFocus
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onBlur={() => commitEdit(task.id, task.title)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
                              if (e.key === 'Escape') { setEditingId(null) }
                            }}
                            style={{
                              fontFamily: 'inherit', fontSize: 11, color: 'var(--text)',
                              background: 'transparent', border: 'none', outline: 'none',
                              padding: 0, margin: 0, width: '100%',
                              borderBottom: '1px solid var(--gold)',
                            }}
                          />
                        ) : (
                          <span
                            onClick={() => { setEditingId(task.id); setEditingText(task.title) }}
                            title="Click to edit"
                            style={{
                              cursor: 'text',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              textDecoration: done ? 'line-through' : 'none',
                            }}
                          >
                            {task.title}
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleTaskStar(task.id, starred) }}
                          aria-label={starred ? 'Unstar' : 'Star'}
                          style={{
                            background: 'transparent', border: 'none',
                            color: starred ? 'var(--gold)' : 'var(--text-dimmest)',
                            fontSize: 12, cursor: 'pointer', padding: 0, lineHeight: 1,
                            opacity: done ? 0.4 : 1,
                          }}
                        >
                          {starred ? '\u2605' : '\u2606'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Activity ticker — single row, scrolling, pinned to bottom of column */}
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
              }}
              className="ticker-wrap">
                <div className="ticker-inner" style={{
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

            {/* Next Post preview tile */}
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
                    {(() => {
                      const when = new Date(data.next_scheduled_post.scheduled_at)
                      const time = when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                      const days = daysUntil(data.next_scheduled_post.scheduled_at)
                      const rel = days === 0 ? 'TODAY' : days === 1 ? 'TOMORROW' : days < 7 ? `IN ${days} DAYS` : when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()
                      return `${rel} · ${time} · ${data.next_scheduled_post.platform.toUpperCase()}`
                    })()}
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
        .ticker-wrap:hover .ticker-inner,
        .ticker-wrap:focus-within .ticker-inner { animation-play-state: paused; }

        /* DIM-ON-REST treatment (Mock C/D).
           Each band sits at 0.55 brightness so the page rests calm. Hover or
           keyboard-focus inside a band brightens it to full. The next-gig
           hero stays always-lit so the page has one anchor point. Urgent
           items inside a dim band keep full opacity so red registers at a
           glance. */
        .band {
          transition: opacity 180ms ease;
          opacity: 0.55;
        }
        .band:hover, .band:focus-within { opacity: 1; }
        .band-anchor { opacity: 1; }
        .attn-row.urgent .attn-title,
        .attn-row.urgent .attn-tag { opacity: 1; }

        /* Two-level lab tile hover: hovering the band pushes siblings to 0.6
           so the focused tile pops without needing a heavy accent. The gold
           border + dark fill apply to the inner <a> (which is the bordered
           element) — applying to the motion.div wrapper had no visible
           effect since the wrapper has no border. */
        .band-labs:hover .lab-tile,
        .band-labs:focus-within .lab-tile { opacity: 0.6; transition: opacity 140ms ease; }
        .band-labs .lab-tile:hover { opacity: 1 !important; }
        .band-labs .lab-tile:hover a { border-color: var(--gold) !important; background: #161313 !important; }

        /* Personal todo hover affordance */
        .band-todo .todo-pill:hover { border-left-color: var(--gold) !important; background: rgba(255,255,255,0.02); }

        /* Attention row hover — gold left bar + faint background lift so the
           target reads as "click to action" not "click to a generic page".
           Each row's href is now action-specific (e.g. single missing-advance
           gig deep-links to /gigs/X#advance, not /gigs). */
        .band-attn .attn-row { position: relative; padding-left: 12px !important; transition: background 140ms ease; }
        .band-attn .attn-row::before {
          content: ''; position: absolute; left: 0; top: 0; bottom: 0;
          width: 2px; background: transparent; transition: background 140ms ease;
        }
        .band-attn .attn-row:hover { background: rgba(255,255,255,0.025); }
        .band-attn .attn-row:hover::before { background: var(--gold); }
        .band-attn .attn-row.urgent::before { background: var(--gold); opacity: 0.6; }
        .band-attn .attn-row.urgent:hover::before { opacity: 1; }
      `}</style>

      {/* ── The Labs ── */}
      <div style={{ padding: '0 24px 0', flexShrink: 0 }}>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, margin: '0 0 4px', letterSpacing: '-0.03em', textTransform: 'uppercase', textAlign: 'center' }}>
          The Labs
        </h2>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="band band-labs"
          style={{ display: 'flex', gap: 8, overflow: 'hidden' }}
        >
          {[
            { label: 'Gigs', stat: `${data.stats.confirmed_gigs} confirmed`, href: '/gigs' },
            { label: 'Content', stat: `${data.stats.queued_content} queued`, href: '/calendar' },
            { label: 'Sets', stat: `${data.stats.sets} sets`, href: '/setlab' },
            { label: 'Tracks', stat: `${data.stats.tracks} tracks`, href: '/setlab' },
            { label: 'Releases', stat: `${data.stats.releases} releases`, href: '/promo' },
          ].map((card) => (
            <motion.div key={card.label} variants={staggerItem} className="lab-tile" style={{ flex: 1, minWidth: 0 }}>
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

      {/* ── Next Gig (left, always-lit anchor) + What needs you (right, single ranked column) ── */}
      <div style={{ padding: '2px 24px 0', display: 'flex', gap: 32, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div className="band-anchor" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                      {!data.next_gig_prep.is_hometown && (
                        <>
                          <span style={{ fontSize: 10, padding: '2px 8px', border: `1px solid ${data.next_gig_prep.hotel_booked ? 'rgba(255,255,255,0.15)' : 'var(--gold)'}`, fontWeight: 700, color: data.next_gig_prep.hotel_booked ? 'var(--text-dimmer)' : 'var(--gold)' }}>
                            {data.next_gig_prep.hotel_booked ? 'HOTEL \u2713' : 'HOTEL NEEDED'}
                          </span>
                          <span style={{ fontSize: 10, padding: '2px 8px', border: `1px solid ${data.next_gig_prep.transport_booked ? 'rgba(255,255,255,0.15)' : 'var(--gold)'}`, fontWeight: 700, color: data.next_gig_prep.transport_booked ? 'var(--text-dimmer)' : 'var(--gold)' }}>
                            {data.next_gig_prep.transport_booked ? 'TRANSPORT \u2713' : 'TRANSPORT NEEDED'}
                          </span>
                          <span style={{ fontSize: 10, padding: '2px 8px', border: `1px solid ${data.next_gig_prep.ground_booked ? 'rgba(255,255,255,0.15)' : 'var(--gold)'}`, fontWeight: 700, color: data.next_gig_prep.ground_booked ? 'var(--text-dimmer)' : 'var(--gold)' }}>
                            {data.next_gig_prep.ground_booked ? 'GROUND \u2713' : 'GROUND NEEDED'}
                          </span>
                        </>
                      )}
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

        {/* Right: single unified "What needs you" column. Replaces the old
            three-surface stack (top-of-page Noticed band + right-rail
            Needs Attention sub-section + right-rail attention pills). */}
        <aside className="band band-attn" style={{ flex: 0.4, minWidth: 240, maxWidth: 360, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 900 }}>
              What needs you
            </div>
            {attentionRows.length > 0 && (
              <span style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmer)', fontWeight: 700 }}>
                {attentionRows.length} item{attentionRows.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          {attentionRows.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-dimmest)' }}>Nothing urgent. Go make something.</div>
          ) : (
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {attentionRows.map((row) => (
                <Link
                  key={row.key}
                  href={row.href}
                  className={`attn-row${row.urgent ? ' urgent' : ''}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '20px 1fr',
                    gap: 10,
                    padding: '10px 0',
                    borderTop: '1px solid var(--border-dim)',
                    textDecoration: 'none',
                    color: 'inherit',
                    alignItems: 'start',
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, color: row.urgent ? 'var(--gold)' : 'var(--text-dimmest)', paddingTop: 2, fontFamily: 'var(--font-mono)' }}>
                    {String(row.rank).padStart(2, '0')}
                  </div>
                  <div>
                    <div className="attn-tag" style={{ fontSize: 9, letterSpacing: '0.18em', fontWeight: 700, color: row.urgent ? 'var(--gold)' : 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: 3 }}>
                      {row.tag}
                    </div>
                    <div className="attn-title" style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.35, fontWeight: 600 }}>
                      {row.title}
                    </div>
                    {row.detail && (
                      <div style={{ fontSize: 11, color: 'var(--text-dimmest)', marginTop: 3, lineHeight: 1.4 }}>
                        {row.detail}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
