'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Gig {
  id: string
  title: string
  venue: string
  location: string
  date: string
  time: string
  fee: number
  currency: string
  audience: number
  status: string
}

interface AdvanceRequest {
  gig_id: string
  completed: boolean
}

interface DjSet {
  id: string
  name: string
  venue: string
  slot_type: string
  created_at: string
}

interface Invoice {
  id: string
  gig_title: string
  amount: number
  currency: string
  status: string
  due_date: string
}

interface ScheduledPost {
  id: string
  platform: string
  caption: string
  scheduled_at: string
  status: string
  gig_title?: string
}

// ── WeekStrip ─────────────────────────────────────────────────────────────────

function WeekStrip({ gigs, scheduledPosts }: { gigs: Gig[]; scheduledPosts: ScheduledPost[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  const today = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const todayKey = fmt(today)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    const monday = today.getDate() - ((today.getDay() + 6) % 7)
    d.setDate(monday + i)
    return d
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
      {days.map((d, i) => {
        const key = fmt(d)
        const isToday = key === todayKey
        const dayGigs = gigs.filter(g => g.date === key)
        const dayPosts = scheduledPosts.filter(p => p.scheduled_at?.slice(0, 10) === key)
        return (
          <div key={i} style={{
            padding: '12px 16px 10px',
            borderRight: i < 6 ? '1px solid var(--border-dim)' : 'none',
            background: isToday ? 'rgba(201,169,110,0.04)' : 'transparent',
            borderTop: isToday ? '2px solid var(--gold)' : '2px solid transparent',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '7px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: isToday ? 'var(--gold)' : 'var(--text-dimmer)' }}>
                {d.toLocaleDateString('en-GB', { weekday: 'short' })}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: isToday ? 'var(--gold)' : 'var(--text-dimmer)' }}>
                {d.getDate()}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {dayGigs.map((g, j) => (
                <Link key={j} href={`/gigs/${g.id}`} style={{ display: 'block', fontSize: '9px', color: 'var(--gold)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  ● {g.venue || g.title}
                </Link>
              ))}
              {dayPosts.map((p, j) => (
                <div key={j} style={{ fontSize: '9px', color: 'var(--green)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  ● {p.platform || 'Post'}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ width = '100%', height = '16px', style = {} }: { width?: string; height?: string; style?: React.CSSProperties }) {
  return (
    <div style={{
      width, height,
      background: 'linear-gradient(90deg, var(--border-dim) 25%, var(--border) 50%, var(--border-dim) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
      borderRadius: '2px',
      ...style,
    }} />
  )
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: '12px' }}>
      {children}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter()

  const [now, setNow] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)

  const [weekGigs, setWeekGigs] = useState<Gig[]>([])
  const [advanceMap, setAdvanceMap] = useState<Record<string, 'sent' | 'complete'>>({})
  const [djSets, setDjSets] = useState<DjSet[]>([])

  const [overdueInvoices, setOverdueInvoices] = useState<Invoice[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [weekPosts, setWeekPosts] = useState<ScheduledPost[]>([])

  const [recentSignal, setRecentSignal] = useState<ScheduledPost[]>([])

  // For WeekStrip we need all gigs and all posts
  const [allGigs, setAllGigs] = useState<Gig[]>([])
  const [allPosts, setAllPosts] = useState<ScheduledPost[]>([])

  useEffect(() => { setNow(new Date()) }, [])

  // Redirect if no profile
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      if (!d.settings?.profile?.name) router.push('/onboarding')
    }).catch(() => {})
  }, [router])

  useEffect(() => {
    const today = new Date()
    const in7 = new Date(today.getTime() + 7 * 86400000)
    const todayStr = today.toISOString().slice(0, 10)
    const in7Str = in7.toISOString().slice(0, 10)

    const fetches = [
      // Gigs
      fetch('/api/gigs').then(r => r.json()).then(d => {
        const gigs: Gig[] = d.gigs || []
        setAllGigs(gigs)
        const thisWeek = gigs.filter(g => g.date >= todayStr && g.date <= in7Str && g.status !== 'cancelled')
        setWeekGigs(thisWeek)
      }).catch(() => {}),

      // Advance requests
      fetch('/api/advance').then(r => r.json()).then(d => {
        const map: Record<string, 'sent' | 'complete'> = {}
        ;(d.requests || []).forEach((req: AdvanceRequest) => {
          map[req.gig_id] = req.completed ? 'complete' : 'sent'
        })
        setAdvanceMap(map)
      }).catch(() => {}),

      // Invoices
      fetch('/api/invoices').then(r => r.json()).then(d => {
        const nowStr = new Date().toISOString().slice(0, 10)
        const overdue = (d.invoices || []).filter(
          (inv: Invoice) => inv.status !== 'paid' && inv.due_date && inv.due_date < nowStr
        )
        setOverdueInvoices(overdue)
      }).catch(() => {}),

      // Notifications (unread count)
      fetch('/api/notifications?unread=true').then(r => r.json()).then(d => {
        setUnreadCount(d.unread || 0)
      }).catch(() => {}),

      // Scheduled posts
      fetch('/api/schedule').then(r => r.json()).then(d => {
        const posts: ScheduledPost[] = d.posts || []
        setAllPosts(posts)

        // This week's scheduled posts
        const thisWeekPosts = posts.filter(p => {
          if (!p.scheduled_at) return false
          const dateStr = p.scheduled_at.slice(0, 10)
          return dateStr >= todayStr && dateStr <= in7Str && p.status === 'scheduled'
        })
        setWeekPosts(thisWeekPosts)

        // Recent signal — last 3 posted
        const posted = posts
          .filter(p => p.status === 'posted')
          .sort((a, b) => (b.scheduled_at || '').localeCompare(a.scheduled_at || ''))
          .slice(0, 3)
        setRecentSignal(posted)
      }).catch(() => {}),
    ]

    Promise.allSettled(fetches).finally(() => setLoading(false))
  }, [])

  // Load dj_sets directly via supabase client for set readiness
  useEffect(() => {
    async function loadSets() {
      try {
        const { supabase } = await import('@/lib/supabase')
        const { data } = await supabase
          .from('dj_sets')
          .select('id, name, venue, slot_type, created_at')
          .order('created_at', { ascending: false })
          .limit(50)
        if (data) setDjSets(data)
      } catch { /* silent */ }
    }
    loadSets()
  }, [])

  const greeting = !now ? '' : now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'

  // Match a set to a gig by fuzzy venue name comparison
  function getSetForGig(gig: Gig): DjSet | null {
    if (!djSets.length || !gig.venue) return null
    const gigVenueNorm = gig.venue.toLowerCase().slice(0, 6)
    return djSets.find(s => s.venue && s.venue.toLowerCase().includes(gigVenueNorm)) || null
  }

  function fmtDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  function fmtDateTime(isoStr: string) {
    return new Date(isoStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
      <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>

        {/* Header */}
        <div style={{ padding: '48px 52px 40px', borderBottom: '1px solid var(--border-dim)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div className="display" style={{ fontSize: 'clamp(28px, 3.5vw, 42px)', lineHeight: 1.0 }} suppressHydrationWarning>
              {greeting}.
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginTop: '6px', fontFamily: 'var(--font-mono)' }} suppressHydrationWarning>
              {now?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/broadcast" className="btn-secondary" style={{ textDecoration: 'none', padding: '0 20px', height: 36, display: 'flex', alignItems: 'center', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              + New post
            </Link>
            <Link href="/gigs/new" className="btn-primary" style={{ textDecoration: 'none', padding: '0 20px', height: 36, display: 'flex', alignItems: 'center', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              + New gig
            </Link>
          </div>
        </div>

        {/* ── SECTION 1: THIS WEEK ─────────────────────────────────────────── */}
        <div style={{ padding: '36px 52px 0' }}>
          <SectionLabel>This week</SectionLabel>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[1, 2].map(i => (
                <div key={i} style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '24px 28px' }}>
                  <Skeleton width="40%" height="13px" style={{ marginBottom: '10px' }} />
                  <Skeleton width="25%" height="11px" style={{ marginBottom: '18px' }} />
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <Skeleton width="100px" height="30px" />
                    <Skeleton width="100px" height="30px" />
                  </div>
                </div>
              ))}
            </div>
          ) : weekGigs.length === 0 ? (
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '28px', color: 'var(--text-dimmer)', fontSize: '13px' }}>
              No gigs this week —{' '}
              <Link href="/gigs/new" style={{ color: 'var(--gold)', textDecoration: 'none' }}>add one →</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {weekGigs.map(gig => {
                const linkedSet = getSetForGig(gig)
                const advanceStatus = advanceMap[gig.id]

                return (
                  <div key={gig.id} style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '24px 28px', position: 'relative', overflow: 'hidden' }}>
                    {/* Gold top rule */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, var(--gold) 0%, transparent 50%)' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px' }}>

                      {/* Left: gig info */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text)', marginBottom: '3px' }}>{gig.venue || gig.title}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', marginBottom: '18px' }}>
                          {fmtDate(gig.date)}{gig.time ? ` · ${gig.time}` : ''}{gig.location ? ` · ${gig.location}` : ''}
                        </div>

                        {/* Status pills */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
                          {/* Set readiness */}
                          <div style={{
                            fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 10px',
                            border: `1px solid ${linkedSet ? 'rgba(61,107,74,0.4)' : 'var(--border-dim)'}`,
                            color: linkedSet ? 'var(--green)' : 'var(--text-dimmer)',
                          }}>
                            {linkedSet ? `Set: ${linkedSet.name || linkedSet.slot_type}` : 'No set built yet'}
                          </div>

                          {/* Advance */}
                          <div style={{
                            fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 10px',
                            border: `1px solid ${advanceStatus ? 'rgba(61,107,74,0.4)' : 'rgba(138,106,58,0.35)'}`,
                            color: advanceStatus ? 'var(--green)' : 'var(--amber)',
                          }}>
                            {advanceStatus === 'complete' ? 'Advance complete' : advanceStatus === 'sent' ? 'Advance sent' : 'Advance needed'}
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {linkedSet ? (
                            <Link href="/setlab" style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', border: '1px solid var(--gold-dim)', padding: '8px 16px', textDecoration: 'none' }}>
                              Open set →
                            </Link>
                          ) : (
                            <Link href={`/setlab?gig=${gig.id}`} style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', border: '1px solid var(--gold-dim)', padding: '8px 16px', textDecoration: 'none' }}>
                              Build set →
                            </Link>
                          )}
                          <Link href={`/gigs/${gig.id}`} style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '8px 16px', textDecoration: 'none' }}>
                            View gig
                          </Link>
                        </div>
                      </div>

                      {/* Right: days away counter */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '36px', lineHeight: 1, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                          {Math.max(0, Math.ceil((new Date(gig.date).getTime() - Date.now()) / 86400000))}
                        </div>
                        <div style={{ fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginTop: '4px' }}>days away</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── SECTION 2: OUTSTANDING ───────────────────────────────────────── */}
        <div style={{ padding: '36px 52px 0' }}>
          <SectionLabel>Outstanding</SectionLabel>

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '22px 24px' }}>
                  <Skeleton width="60%" height="11px" style={{ marginBottom: '10px' }} />
                  <Skeleton width="40%" height="22px" style={{ marginBottom: '14px' }} />
                  <Skeleton width="80px" height="28px" />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>

              {/* Overdue invoices */}
              <div style={{ background: 'var(--panel)', border: `1px solid ${overdueInvoices.length > 0 ? 'rgba(154,106,90,0.3)' : 'var(--border-dim)'}`, padding: '22px 24px' }}>
                <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: '8px' }}>Overdue invoices</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', lineHeight: 1, marginBottom: '6px', color: overdueInvoices.length > 0 ? 'var(--red-brown)' : 'var(--text-dim)' }}>
                  {overdueInvoices.length}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '16px' }}>
                  {overdueInvoices.length === 0 ? 'All clear' : overdueInvoices.length === 1 ? '1 invoice past due' : `${overdueInvoices.length} invoices past due`}
                </div>
                <Link href="/business/finances" style={{ display: 'inline-block', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '7px 14px', textDecoration: 'none' }}>
                  View invoices →
                </Link>
              </div>

              {/* Notifications */}
              <div style={{ background: 'var(--panel)', border: `1px solid ${unreadCount > 0 ? 'rgba(176,141,87,0.2)' : 'var(--border-dim)'}`, padding: '22px 24px' }}>
                <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: '8px' }}>Unread notifications</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', lineHeight: 1, marginBottom: '6px', color: unreadCount > 0 ? 'var(--gold)' : 'var(--text-dim)' }}>
                  {unreadCount}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '16px' }}>
                  {unreadCount === 0 ? 'Nothing new' : unreadCount === 1 ? '1 unread' : `${unreadCount} unread`}
                </div>
                <Link href="/notifications" style={{ display: 'inline-block', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '7px 14px', textDecoration: 'none' }}>
                  Open notifications →
                </Link>
              </div>

              {/* Scheduled posts this week */}
              <div style={{ background: 'var(--panel)', border: `1px solid ${weekPosts.length > 0 ? 'rgba(61,107,74,0.3)' : 'var(--border-dim)'}`, padding: '22px 24px' }}>
                <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: '8px' }}>Posts this week</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', lineHeight: 1, marginBottom: '6px', color: weekPosts.length > 0 ? 'var(--green)' : 'var(--text-dim)' }}>
                  {weekPosts.length}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '16px' }}>
                  {weekPosts.length === 0 ? 'Nothing scheduled' : weekPosts.length === 1 ? '1 post queued' : `${weekPosts.length} posts queued`}
                </div>
                <Link href="/broadcast" style={{ display: 'inline-block', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '7px 14px', textDecoration: 'none' }}>
                  Open broadcast →
                </Link>
              </div>

            </div>
          )}
        </div>

        {/* ── SECTION 3: RECENT SIGNAL ─────────────────────────────────────── */}
        <div style={{ padding: '36px 52px 0' }}>
          <SectionLabel>Recent signal</SectionLabel>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '16px 22px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <Skeleton width="50px" height="10px" />
                  <Skeleton width="60%" height="11px" />
                  <Skeleton width="60px" height="10px" style={{ marginLeft: 'auto' }} />
                </div>
              ))}
            </div>
          ) : recentSignal.length === 0 ? (
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '28px', color: 'var(--text-dimmer)', fontSize: '13px' }}>
              No posts yet —{' '}
              <Link href="/broadcast" style={{ color: 'var(--gold)', textDecoration: 'none' }}>plan your week →</Link>
            </div>
          ) : (
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', overflow: 'hidden' }}>
              {recentSignal.map((post, i) => (
                <div key={post.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr 80px',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '14px 22px',
                  borderBottom: i < recentSignal.length - 1 ? '1px solid var(--border-dim)' : 'none',
                }}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                    {post.platform || '—'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {(post.caption || '').slice(0, 80)}{(post.caption || '').length > 80 ? '…' : ''}
                  </div>
                  <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-dimmer)', textAlign: 'right' }}>
                    {post.scheduled_at ? fmtDateTime(post.scheduled_at) : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── SECTION 4: THIS MONTH ───────────────────────────────────────── */}
        {(() => {
          if (loading) return null
          const now2 = new Date()
          const monthStart = new Date(now2.getFullYear(), now2.getMonth(), 1).toISOString().slice(0, 10)
          const monthEnd = new Date(now2.getFullYear(), now2.getMonth() + 1, 0).toISOString().slice(0, 10)

          const monthGigs = allGigs.filter(g => g.date >= monthStart && g.date <= monthEnd && g.status !== 'cancelled')
          const monthPosts = allPosts.filter(p => {
            const d = (p.scheduled_at || '').slice(0, 10)
            return d >= monthStart && d <= monthEnd && p.status === 'posted'
          })
          const monthRevenue = monthGigs.reduce((s, g) => s + (g.fee || 0), 0)

          const monthName = now2.toLocaleDateString('en-GB', { month: 'long' })

          return (
            <div style={{ padding: '36px 52px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <SectionLabel>{monthName}</SectionLabel>
                <Link href="/wrap" style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dimmer)', textDecoration: 'none' }}>
                  Full wrap →
                </Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '20px 22px' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: '8px' }}>Gigs</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', lineHeight: 1, color: monthGigs.length > 0 ? 'var(--text)' : 'var(--text-dim)', marginBottom: '5px' }}>
                    {monthGigs.length}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>
                    {monthGigs.length === 0 ? 'None booked' : monthGigs.map(g => g.venue || g.title).join(', ').slice(0, 40)}
                  </div>
                </div>
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '20px 22px' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: '8px' }}>Posts live</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', lineHeight: 1, color: monthPosts.length > 0 ? 'var(--text)' : 'var(--text-dim)', marginBottom: '5px' }}>
                    {monthPosts.length}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>
                    {monthPosts.length === 0 ? 'Nothing posted yet' : `${monthPosts.length} post${monthPosts.length !== 1 ? 's' : ''} published`}
                  </div>
                </div>
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '20px 22px' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: '8px' }}>Revenue</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', lineHeight: 1, color: monthRevenue > 0 ? 'var(--text)' : 'var(--text-dim)', marginBottom: '5px' }}>
                    {monthRevenue > 0 ? `£${monthRevenue.toLocaleString()}` : '—'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>
                    {monthRevenue === 0 ? 'No gig fees logged' : `from ${monthGigs.length} gig${monthGigs.length !== 1 ? 's' : ''}`}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── WEEK STRIP ───────────────────────────────────────────────────── */}
        <div style={{ margin: '36px 52px 0', border: '1px solid var(--border-dim)', overflow: 'hidden' }}>
          <WeekStrip gigs={allGigs} scheduledPosts={allPosts} />
        </div>

        <div style={{ height: '48px' }} />
      </div>
    </>
  )
}
