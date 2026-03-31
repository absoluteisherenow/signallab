'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SignalBar from '@/components/SignalBar'

interface Gig {
  id: string
  title: string
  venue: string
  location: string
  date: string
  time: string
  fee: number
  currency: string
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
}

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
            padding: '10px 14px 9px',
            borderRight: i < 6 ? '1px solid var(--border-dim)' : 'none',
            background: isToday ? 'rgba(201,169,110,0.04)' : 'transparent',
            borderTop: isToday ? '2px solid var(--gold)' : '2px solid transparent',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '5px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: isToday ? 'var(--gold)' : 'var(--text-dimmer)' }}>
                {d.toLocaleDateString('en-GB', { weekday: 'short' })}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: isToday ? 'var(--gold)' : 'var(--text-dimmer)' }}>
                {d.getDate()}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
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

export default function Dashboard() {
  const router = useRouter()
  const [now, setNow] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)

  const [upcomingGigs, setUpcomingGigs] = useState<Gig[]>([])
  const [advanceMap, setAdvanceMap] = useState<Record<string, 'sent' | 'complete'>>({})
  const [djSets, setDjSets] = useState<DjSet[]>([])
  const [overdueInvoices, setOverdueInvoices] = useState<Invoice[]>([])
  const [weekPosts, setWeekPosts] = useState<ScheduledPost[]>([])
  const [allGigs, setAllGigs] = useState<Gig[]>([])
  const [allPosts, setAllPosts] = useState<ScheduledPost[]>([])
  const [quarterStats, setQuarterStats] = useState({ gigs: 0, posts: 0, revenue: 0 })
  const [quarterLabel, setQuarterLabel] = useState('')
  const [brief, setBrief] = useState('')

  useEffect(() => { setNow(new Date()) }, [])

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      if (!d.settings?.profile?.name) router.push('/onboarding')
    }).catch(() => {})
  }, [router])

  useEffect(() => {
    const today = new Date()
    const in14 = new Date(today.getTime() + 14 * 86400000)
    const todayStr = today.toISOString().slice(0, 10)
    const in7Str = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10)
    const in14Str = in14.toISOString().slice(0, 10)
    const yr = today.getFullYear()
    const q = Math.floor(today.getMonth() / 3)
    const quarterStart = new Date(yr, q * 3, 1).toISOString().slice(0, 10)
    const quarterEnd = new Date(yr, q * 3 + 3, 0).toISOString().slice(0, 10)
    const qLabel = `Q${q + 1} ${yr}`
    setQuarterLabel(qLabel)

    // Local accumulators so we can pass data to /api/brief after all fetches settle
    let fetchedUpcomingGigs: Gig[] = []
    let fetchedWeekPosts: ScheduledPost[] = []
    let fetchedOverdueInvoices: Invoice[] = []
    let fetchedQuarterGigs = 0
    let fetchedQuarterPosts = 0
    let fetchedQuarterRevenue = 0

    const fetches = [
      fetch('/api/gigs').then(r => r.json()).then(d => {
        const gigs: Gig[] = d.gigs || []
        setAllGigs(gigs)
        const upcoming = gigs.filter(g => g.date >= todayStr && g.date <= in14Str && g.status !== 'cancelled').slice(0, 3)
        setUpcomingGigs(upcoming)
        fetchedUpcomingGigs = upcoming
        const qg = gigs.filter(g => g.date >= quarterStart && g.date <= quarterEnd && g.status !== 'cancelled')
        fetchedQuarterGigs = qg.length
        fetchedQuarterRevenue = qg.reduce((s, g) => s + (g.fee || 0), 0)
        setQuarterStats(prev => ({ ...prev, gigs: qg.length, revenue: fetchedQuarterRevenue }))
      }).catch(() => {}),

      fetch('/api/advance').then(r => r.json()).then(d => {
        const map: Record<string, 'sent' | 'complete'> = {}
        ;(d.requests || []).forEach((req: AdvanceRequest) => {
          map[req.gig_id] = req.completed ? 'complete' : 'sent'
        })
        setAdvanceMap(map)
      }).catch(() => {}),

      fetch('/api/invoices').then(r => r.json()).then(d => {
        const nowStr = new Date().toISOString().slice(0, 10)
        const overdue = (d.invoices || []).filter(
          (inv: Invoice) => inv.status !== 'paid' && inv.due_date && inv.due_date < nowStr
        )
        setOverdueInvoices(overdue)
        fetchedOverdueInvoices = overdue
      }).catch(() => {}),

      fetch('/api/schedule').then(r => r.json()).then(d => {
        const posts: ScheduledPost[] = d.posts || []
        setAllPosts(posts)
        const weekScheduled = posts.filter(p => {
          if (!p.scheduled_at) return false
          const ds = p.scheduled_at.slice(0, 10)
          return ds >= todayStr && ds <= in7Str && p.status === 'scheduled'
        })
        setWeekPosts(weekScheduled)
        fetchedWeekPosts = weekScheduled
        const qp = posts.filter(p => {
          const ds = (p.scheduled_at || '').slice(0, 10)
          return ds >= quarterStart && ds <= quarterEnd && p.status === 'posted'
        })
        fetchedQuarterPosts = qp.length
        setQuarterStats(prev => ({ ...prev, posts: qp.length }))
      }).catch(() => {}),
    ]

    Promise.allSettled(fetches).finally(() => {
      setLoading(false)
      fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gigs: fetchedUpcomingGigs,
          posts: fetchedWeekPosts,
          overdueInvoices: fetchedOverdueInvoices,
          quarterStats: { gigs: fetchedQuarterGigs, posts: fetchedQuarterPosts, revenue: fetchedQuarterRevenue },
        }),
      })
        .then(r => r.json())
        .then(d => { if (d.brief) setBrief(d.brief) })
        .catch(() => {})
    })
  }, [])

  useEffect(() => {
    async function loadSets() {
      try {
        const { supabase } = await import('@/lib/supabase')
        const { data } = await supabase.from('dj_sets').select('id, name, venue, slot_type').order('created_at', { ascending: false }).limit(50)
        if (data) setDjSets(data)
      } catch { /* silent */ }
    }
    loadSets()
  }, [])

  const greeting = !now ? '' : now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'

  function getSetForGig(gig: Gig): DjSet | null {
    if (!djSets.length || !gig.venue) return null
    const norm = gig.venue.toLowerCase().slice(0, 6)
    return djSets.find(s => s.venue && s.venue.toLowerCase().includes(norm)) || null
  }

  function daysUntil(dateStr: string) {
    return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000))
  }

  function daysSince(dateStr: string) {
    return Math.max(0, Math.ceil((Date.now() - new Date(dateStr).getTime()) / 86400000))
  }

  function fmtGigDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  const monthName = now ? now.toLocaleDateString('en-GB', { month: 'long' }) : '' // kept for any other uses

  // Build briefing items
  const briefingItems: { key: string; dot: string; text: React.ReactNode; href: string; action: string }[] = []

  if (!loading) {
    if (upcomingGigs.length === 0) {
      briefingItems.push({ key: 'no-gigs', dot: 'dim', text: 'No upcoming shows in the next 14 days', href: '/gigs/new', action: 'Add a gig →' })
    } else {
      upcomingGigs.forEach(gig => {
        const set = getSetForGig(gig)
        const adv = advanceMap[gig.id]
        const days = daysUntil(gig.date)
        const label = gig.venue || gig.title
        const dateLabel = fmtGigDate(gig.date)
        const urgency = days <= 3

        const issues: string[] = []
        if (!set) issues.push('no set built')
        if (!adv) issues.push('advance not sent')

        briefingItems.push({
          key: gig.id,
          dot: urgency ? 'gold' : issues.length ? 'amber' : 'green',
          text: (
            <span>
              <span style={{ color: 'var(--text)' }}>{label}</span>
              <span style={{ color: urgency ? 'var(--gold)' : 'var(--text-dimmer)' }}> · {days === 0 ? 'tonight' : days === 1 ? '1 day' : `${days} days`}</span>
              <span style={{ color: 'var(--text-dimmer)' }}> · {dateLabel}</span>
              {issues.length > 0 && <span style={{ color: 'var(--gold-bright)' }}> — {issues.join(', ')}</span>}
              {issues.length === 0 && <span style={{ color: 'var(--green)' }}> — all good</span>}
            </span>
          ),
          href: `/gigs/${gig.id}`,
          action: !set ? 'Build set →' : !adv ? 'Send advance →' : 'View →',
        })
      })
    }

    if (overdueInvoices.length > 0) {
      const oldest = overdueInvoices.reduce((a, b) => (a.due_date < b.due_date ? a : b))
      const oldestDays = daysSince(oldest.due_date)
      const isCritical = oldestDays > 7
      briefingItems.push({
        key: 'invoices',
        dot: isCritical ? 'redflag' : 'red',
        text: (
          <span>
            <span style={{ color: 'var(--text)' }}>{overdueInvoices.length} invoice{overdueInvoices.length !== 1 ? 's' : ''} overdue</span>
            <span style={{ color: isCritical ? '#ff4040' : '#c05a4a' }}> — oldest {oldestDays} day{oldestDays !== 1 ? 's' : ''}</span>
          </span>
        ),
        href: '/business/finances',
        action: 'View invoices →',
      })
    }

    if (weekPosts.length === 0) {
      briefingItems.push({ key: 'no-posts', dot: 'dim', text: 'No posts scheduled this week', href: '/broadcast', action: 'Plan content →' })
    } else {
      briefingItems.push({
        key: 'posts',
        dot: 'green',
        text: <span><span style={{ color: 'var(--text)' }}>{weekPosts.length} post{weekPosts.length !== 1 ? 's' : ''}</span><span style={{ color: 'var(--text-dimmer)' }}> scheduled this week</span></span>,
        href: '/broadcast',
        action: 'Open Broadcast Lab →',
      })
    }
  }

  const dotColor: Record<string, string> = {
    gold: 'var(--gold)',
    green: 'var(--green)',
    amber: '#b08d57',
    red: '#c05a4a',
    redflag: '#ff4040',
    dim: 'var(--border)',
  }

  return (
    <>
      <style>{`@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
      <div style={{ background: 'var(--bg)', color: 'var(--text)', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── BRAND BAR ── */}
        <div style={{ padding: '16px 52px', borderBottom: '1px solid var(--border-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '11px', fontWeight: 600, letterSpacing: '0.18em', color: 'rgba(234,229,220,0.5)', textTransform: 'uppercase' }}>Signal Lab OS</div>
        </div>

        {/* ── MAIN CONTENT: fills remaining height ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '32px 52px 0', gap: '20px', minHeight: 0 }}>

          {/* ── GREETING + ACTIONS ── */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '12px', fontFamily: 'var(--font-mono)' }} suppressHydrationWarning>
                {now?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(40px, 5vw, 72px)', fontWeight: 300, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--text)' }} suppressHydrationWarning>
                {greeting}.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', paddingBottom: '6px' }}>
              <Link href="/broadcast" className="btn-secondary" style={{ textDecoration: 'none', padding: '0 18px', height: 32, display: 'flex', alignItems: 'center', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                + New post
              </Link>
              <Link href="/gigs/new" className="btn-primary" style={{ textDecoration: 'none', padding: '0 18px', height: 32, display: 'flex', alignItems: 'center', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                + New gig
              </Link>
              <Link href="/releases/new" className="btn-secondary" style={{ textDecoration: 'none', padding: '0 18px', height: 32, display: 'flex', alignItems: 'center', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                + New release
              </Link>
            </div>
          </div>

          {/* ── SIGNAL BAR ── */}
          <SignalBar onAction={() => router.refresh()} />

          {/* ── YOUR WEEK BRIEFING ── */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '10px' }}>Your week</div>
            {brief && (
              <div style={{
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-dimmer)',
                lineHeight: 1.5,
                marginBottom: '10px',
                fontStyle: 'italic',
              }}>
                {brief}
              </div>
            )}
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', overflow: 'hidden' }}>
              {loading ? (
                <>
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', alignItems: 'center', gap: '14px', padding: '13px 20px', borderBottom: i < 3 ? '1px solid var(--border-dim)' : 'none' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
                      <div style={{ height: 12, background: 'linear-gradient(90deg, var(--border-dim) 25%, var(--border) 50%, var(--border-dim) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', borderRadius: 2, width: `${50 + i * 15}%` }} />
                      <div style={{ height: 10, width: 70, background: 'var(--border-dim)', borderRadius: 2 }} />
                    </div>
                  ))}
                </>
              ) : (
                briefingItems.map((item, i) => (
                  <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', alignItems: 'center', gap: '14px', padding: '12px 20px', borderBottom: i < briefingItems.length - 1 ? '1px solid var(--border-dim)' : 'none' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor[item.dot] || 'var(--border)', flexShrink: 0 }} />
                    <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>{item.text}</div>
                    <Link href={item.href} style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--gold)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'}>
                      {item.action}
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── THIS QUARTER + WEEK STRIP ROW ── */}
          <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: '20px', alignItems: 'start' }}>
            {/* Quarter stats */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>{quarterLabel || '—'}</div>
                <Link href="/wrap" style={{ fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dimmer)', textDecoration: 'none' }}>Full wrap →</Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {[
                  { label: 'Gigs', value: loading ? '—' : String(quarterStats.gigs), sub: quarterStats.gigs === 0 ? 'None booked' : 'this quarter' },
                  { label: 'Posts live', value: loading ? '—' : String(quarterStats.posts), sub: quarterStats.posts === 0 ? 'Nothing posted' : 'published' },
                  { label: 'Revenue', value: loading ? '—' : quarterStats.revenue > 0 ? `£${quarterStats.revenue.toLocaleString()}` : '—', sub: quarterStats.revenue === 0 ? 'No fees logged' : 'from gigs' },
                ].map(stat => (
                  <div key={stat.label} style={{ borderRight: '1px solid var(--border-dim)', padding: '16px 24px 16px 0', marginRight: '24px' }}>
                    <div style={{ fontSize: '9px', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: '10px' }}>{stat.label}</div>
                    <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(28px, 3vw, 40px)', fontWeight: 300, lineHeight: 1, color: 'var(--text)', marginBottom: '6px' }}>{stat.value}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>{stat.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick links */}
            <div style={{ paddingTop: '27px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {[
                  { label: 'Drop Lab', href: '/releases' },
                  { label: 'Broadcast Lab', href: '/broadcast' },
                  { label: 'Set Lab', href: '/setlab' },
                  { label: 'SONIX Lab', href: '/sonix' },
                ].map(({ label, href }) => (
                  <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', fontSize: '11px', color: 'var(--text-dimmer)', textDecoration: 'none', padding: '7px 14px', border: '1px solid var(--border-dim)', background: 'var(--panel)', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-dim)' }}>
                    {label} <span style={{ fontSize: '10px', color: 'var(--gold)', opacity: 0.5 }}>→</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* ── WEEK STRIP ── */}
          <div style={{ border: '1px solid var(--border-dim)', overflow: 'hidden', flexShrink: 0 }}>
            <WeekStrip gigs={allGigs} scheduledPosts={allPosts} />
          </div>

        </div>
        <div style={{ height: '24px', flexShrink: 0 }} />
      </div>
    </>
  )
}
