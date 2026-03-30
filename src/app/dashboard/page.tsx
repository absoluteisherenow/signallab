'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface ScheduledPost {
  id: string
  platform: string
  caption: string
  scheduled_at: string
  status: string
  gig_title?: string
}

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

interface UrgentItem { text: string; href: string; due: string; type: 'gold' | 'red' }

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
    <div style={{ borderBottom: '1px solid var(--border-dim)', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
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
            borderTop: isToday ? '1px solid var(--gold)' : '1px solid transparent',
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

export default function Dashboard() {
  const [gigs, setGigs] = useState<Gig[]>([])
  const [gigsLoading, setGigsLoading] = useState(true)
  const [urgent, setUrgent] = useState<UrgentItem[]>([])
  const [advanceStatuses, setAdvanceStatuses] = useState<Record<string, string>>({})
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([])
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => { setNow(new Date()) }, [])

  const greeting = !now ? '' : now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'

  useEffect(() => {
    fetch('/api/gigs').then(r => r.json()).then(d => { setGigs(d.gigs || []) }).catch(() => {}).finally(() => setGigsLoading(false))
    fetch('/api/schedule').then(r => r.json()).then(d => { setScheduledPosts(d.posts || []) }).catch(() => {})
    fetch('/api/advance').then(r => r.json()).then(d => {
      if (d.requests) {
        const map: Record<string, string> = {}
        d.requests.forEach((req: { gig_id: string; completed: boolean }) => { map[req.gig_id] = req.completed ? 'complete' : 'sent' })
        setAdvanceStatuses(map)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!now) return
    const items: UrgentItem[] = []
    const today = now.getTime()

    gigs.filter(g => g.status !== 'cancelled').forEach(g => {
      const daysTo = Math.ceil((new Date(g.date).getTime() - today) / 86400000)
      if (daysTo >= 0 && daysTo <= 30 && !advanceStatuses[g.id]) {
        items.push({ text: `Send advance — ${g.title}`, href: `/gigs?open=${g.id}`, due: `${daysTo}d`, type: 'gold' })
      }
    })

    fetch('/api/invoices').then(r => r.json()).then(d => {
      if (d.invoices) {
        d.invoices.filter((inv: { status: string; due_date?: string; gig_title: string }) =>
          inv.status === 'pending' && inv.due_date && new Date(inv.due_date).getTime() < today
        ).forEach((inv: { status: string; due_date?: string; gig_title: string }) => {
          const overdueDays = Math.ceil((today - new Date(inv.due_date!).getTime()) / 86400000)
          items.push({ text: `Invoice overdue — ${inv.gig_title}`, href: '/business/finances', due: `${overdueDays}d overdue`, type: 'red' })
        })
        setUrgent([...items])
      } else {
        setUrgent(items)
      }
    }).catch(() => setUrgent(items))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gigs, advanceStatuses])

  const next = gigs[0]
  const daysTo = next && now ? Math.ceil((new Date(next.date).getTime() - now.getTime()) / 86400000) : 0
  const confirmed = gigs.filter(g => g.status === 'confirmed')
  const totalFees = confirmed.reduce((a, g) => a + (g.fee || 0), 0)

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ padding: '48px 52px 40px', borderBottom: '1px solid var(--border-dim)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div className="display" style={{ fontSize: 'clamp(32px, 4vw, 48px)', lineHeight: 1.0 }} suppressHydrationWarning>
            {greeting}.
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dimmer)', marginTop: '8px' }} suppressHydrationWarning>
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

      {/* Week strip */}
      <WeekStrip gigs={gigs} scheduledPosts={scheduledPosts} />

      <div style={{ padding: '40px 52px' }}>

        {/* Next show hero + attention — two columns */}
        <div style={{ display: 'grid', gridTemplateColumns: next ? '1fr 1fr' : '1fr', gap: '16px', marginBottom: '40px' }}>

          {/* Next show */}
          {next && (
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '32px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, var(--gold) 0%, transparent 60%)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '14px' }}>Next show</div>
                  <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text)', marginBottom: '4px', lineHeight: 1.2 }}>{next.title}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-dimmer)', marginBottom: '24px' }}>{next.venue} · {next.location}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid var(--border-dim)', paddingTop: '18px', marginBottom: '22px' }}>
                    {[
                      { l: 'Date', v: new Date(next.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) },
                      { l: 'Doors', v: next.time || '—' },
                      { l: 'Cap', v: (next.audience || 0).toLocaleString() },
                      { l: 'Fee', v: `€${(next.fee || 0).toLocaleString()}` },
                    ].map(item => (
                      <div key={item.l}>
                        <div style={{ fontSize: '8.5px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '5px' }}>{item.l}</div>
                        <div style={{ fontSize: '13px', color: item.l === 'Fee' ? 'var(--gold)' : 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{item.v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Link href={`/broadcast?gig=${next.id}&title=${encodeURIComponent(next.title)}&date=${next.date}`} style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green)', border: '1px solid rgba(61,107,74,0.3)', padding: '9px 16px', textDecoration: 'none', transition: 'all 0.12s' }}>Create post</Link>
                    <Link href={`/gigs/${next.id}`} style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '9px 16px', textDecoration: 'none', transition: 'all 0.12s' }}>Advance</Link>
                  </div>
                </div>
                <div style={{ textAlign: 'right', paddingLeft: '24px', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '52px', lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--text)' }}>{daysTo}</div>
                  <div style={{ fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginTop: '6px' }}>days away</div>
                </div>
              </div>
            </div>
          )}

          {/* Needs attention */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '20px' }}>
              <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.22em', color: 'var(--text-dimmer)', textTransform: 'uppercase' }}>Needs attention</div>
              {urgent.length > 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--gold)' }}>{urgent.length}</div>}
            </div>
            {urgent.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--text-dimmer)', paddingTop: '8px' }}>All clear.</div>
            ) : (
              urgent.map((item, i) => (
                <Link key={i} href={item.href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderBottom: i < urgent.length - 1 ? '1px solid var(--border-dim)' : 'none', textDecoration: 'none', transition: 'opacity 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.6'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: item.type === 'red' ? 'var(--red-brown)' : 'var(--gold)', flexShrink: 0 }} />
                    <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{item.text}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dimmer)', flexShrink: 0, marginLeft: '16px' }}>{item.due}</div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '40px' }}>
          {[
            { label: 'Confirmed income', value: `€${totalFees.toLocaleString()}`, sub: `${confirmed.length} shows booked` },
            { label: 'Total audience', value: gigs.reduce((a, g) => a + (g.audience || 0), 0).toLocaleString(), sub: 'Across upcoming shows' },
            { label: 'Needs attention', value: String(urgent.length), sub: urgent.length === 0 ? 'All clear' : 'Actions required', alert: urgent.length > 0 },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '22px 24px' }}>
              <div style={{ fontSize: '8.5px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: '10px' }}>{stat.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', lineHeight: 1, marginBottom: '6px', color: stat.alert ? 'var(--red-brown)' : 'var(--gold)' }}>{stat.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Forthcoming shows */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>Forthcoming shows</div>
            <Link href="/gigs" style={{ fontSize: '11px', color: 'var(--text-dimmer)', textDecoration: 'none', transition: 'color 0.12s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--gold)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmer)'}>
              View all →
            </Link>
          </div>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 80px 90px 80px 100px', padding: '10px 22px', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255,255,255,0.02)' }}>
              {['Show', 'Venue', 'Date', 'Status', 'Cap', 'Fee'].map(h => (
                <div key={h} style={{ fontSize: '8.5px', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>{h}</div>
              ))}
            </div>
            {gigsLoading && (
              <div style={{ padding: '40px 22px', color: 'var(--text-dimmer)', fontSize: '12px' }}>Loading...</div>
            )}
            {!gigsLoading && gigs.length === 0 && (
              <div style={{ padding: '40px 22px', color: 'var(--text-dimmer)', fontSize: '12px' }}>
                No gigs yet — <Link href="/gigs/new" style={{ color: 'var(--gold)', textDecoration: 'none' }}>add your first show →</Link>
              </div>
            )}
            {gigs.map((gig, i) => {
              const d = new Date(gig.date)
              const isConfirmed = gig.status === 'confirmed'
              return (
                <div key={gig.id}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 140px 80px 90px 80px 100px', padding: '13px 22px', borderBottom: i < gigs.length - 1 ? '1px solid var(--border-dim)' : 'none', alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => window.location.href = `/gigs/${gig.id}`}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '2px' }}>{gig.title}</div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>{gig.venue}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>{d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                  <div>
                    <span style={{ fontSize: '9.5px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: isConfirmed ? 'var(--green)' : 'var(--amber)' }}>
                      ● {gig.status}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dimmer)' }}>{(gig.audience || 0).toLocaleString()}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>€{(gig.fee || 0).toLocaleString()}</div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
