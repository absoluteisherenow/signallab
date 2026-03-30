'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'


const QUICK = [
  { label: "This week's posts", href: '/broadcast/calendar', color: 'var(--green)' },
  { label: 'Build a set', href: '/setlab', color: '#9a6a5a' },
  { label: 'Sonix Lab', href: '/sonix', color: '#6a7a9a' },
  { label: 'Finances', href: '/business/finances', color: 'var(--gold)' },
]

interface UrgentItem { text: string; href: string; due: string; dot: string }

export default function Dashboard() {
  const [gigs, setGigs] = useState<Array<{ id: string; title: string; venue: string; location: string; date: string; time: string; fee: number; currency: string; audience: number; status: string }>>([])
  const [gigsLoading, setGigsLoading] = useState(true)
  const [urgent, setUrgent] = useState<UrgentItem[]>([])
  const [advanceStatuses, setAdvanceStatuses] = useState<Record<string, string>>({})
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => { setNow(new Date()) }, [])
  const greeting = !now ? '' : now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'

  useEffect(() => {
    fetch('/api/gigs').then(r => r.json()).then(d => { setGigs(d.gigs || []) }).catch(() => {}).finally(() => setGigsLoading(false))
    fetch('/api/advance').then(r => r.json()).then(d => {
      if (d.requests) {
        const map: Record<string, string> = {}
        d.requests.forEach((req: { gig_id: string; completed: boolean }) => { map[req.gig_id] = req.completed ? 'complete' : 'sent' })
        setAdvanceStatuses(map)
      }
    }).catch(() => {})
  }, [])

  // Recompute urgent items whenever gigs or advance statuses change
  useEffect(() => {
    if (!now) return
    const items: UrgentItem[] = []
    const today = now.getTime()

    // Gigs within 30 days with no advance sent
    gigs.filter(g => g.status !== 'cancelled').forEach(g => {
      const daysTo = Math.ceil((new Date(g.date).getTime() - today) / 86400000)
      if (daysTo >= 0 && daysTo <= 30 && !advanceStatuses[g.id]) {
        items.push({ text: `Send advance — ${g.title}`, href: `/gigs?open=${g.id}`, due: `${daysTo}d`, dot: 'var(--gold)' })
      }
    })

    // Fetch invoices for overdue check
    fetch('/api/invoices').then(r => r.json()).then(d => {
      if (d.invoices) {
        d.invoices.filter((inv: { status: string; due_date?: string; gig_title: string }) =>
          inv.status === 'pending' && inv.due_date && new Date(inv.due_date).getTime() < today
        ).forEach((inv: { status: string; due_date?: string; gig_title: string }) => {
          const overdueDays = Math.ceil((today - new Date(inv.due_date!).getTime()) / 86400000)
          items.push({ text: `Invoice overdue — ${inv.gig_title}`, href: '/business/finances', due: `${overdueDays}d overdue`, dot: '#8a4a3a' })
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
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)', minHeight: '100vh' }}>
      <div style={{ padding: '52px 56px 44px', borderBottom: '1px solid var(--border-dim)' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: 'var(--gold)' }} />Tour Lab — Command centre
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div className="display" style={{ fontSize: 'clamp(32px, 4vw, 52px)', lineHeight: 1.0 }} suppressHydrationWarning>{greeting}.</div>
            <div style={{ fontSize: '13px', color: 'var(--text-dimmer)', marginTop: '10px' }} suppressHydrationWarning>{now?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Link href="/broadcast" style={{ textDecoration: 'none', background: 'linear-gradient(180deg, #162e1c 0%, #0e1e10 100%)', border: '1px solid rgba(61, 107, 74, 0.6)', color: 'var(--green)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '14px 28px' }}>+ New post</Link>
            <Link href="/gigs/new" style={{ textDecoration: 'none', background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: '1px solid var(--gold)', color: 'var(--gold)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '14px 28px' }}>+ New gig</Link>
          </div>
        </div>
      </div>

      <div style={{ padding: '44px 56px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '44px' }}>
          {/* Needs Attention — LEFT */}
          <div className="card" style={{ padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '24px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold-bright)', textTransform: 'uppercase' }}>Needs attention</div>
              {urgent.length > 0 && <div style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>{urgent.length}</div>}
            </div>
            {urgent.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--text-dimmer)', padding: '16px 0' }}>Nothing urgent right now.</div>
            ) : (
              urgent.map((item, i) => (
                <Link key={i} href={item.href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: i < urgent.length - 1 ? '1px solid var(--border-dim)' : 'none', textDecoration: 'none' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.6'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: item.dot, flexShrink: 0 }} />
                    <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{item.text}</div>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', flexShrink: 0, marginLeft: '16px' }}>{item.due}</div>
                </Link>
              ))
            )}
          </div>

          {/* Next Show — RIGHT */}
          {next && (
            <div className="card" style={{ padding: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase' }}>Next show</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>{daysTo} days</div>
              </div>
              <div className="display" style={{ fontSize: '22px', marginBottom: '6px', lineHeight: 1.2 }}>{next.title}</div>
              <div style={{ fontSize: '14px', color: 'var(--text-dim)', marginBottom: '24px' }}>{next.venue} · {next.location}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid var(--border-dim)', paddingTop: '20px', marginBottom: '24px' }}>
                {[
                  { l: 'Date', v: new Date(next.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) },
                  { l: 'Time', v: next.time },
                  { l: 'Cap', v: (next.audience || 0).toLocaleString() },
                  { l: 'Fee', v: `€${(next.fee || 0).toLocaleString()}` },
                ].map(item => (
                  <div key={item.l}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '6px' }}>{item.l}</div>
                    <div style={{ fontSize: '15px', color: 'var(--text-dim)' }}>{item.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Link href={`/broadcast?gig=${next.id}&title=${encodeURIComponent(next.title)}&date=${next.date}`} style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--green)', border: '1px solid rgba(61, 107, 74, 0.25)', padding: '10px 18px', textDecoration: 'none' }}>Create post</Link>
                <Link href={`/gigs/${next.id}`} style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '10px 18px', textDecoration: 'none' }}>Advance</Link>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase' }}>Forthcoming shows</div>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-dim)' }} />
            <Link href="/gigs" style={{ fontSize: '10px', color: 'var(--text-dimmer)', textDecoration: 'none' }}>View all →</Link>
          </div>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)' }}>
            {gigsLoading && (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-dimmer)', fontSize: 12 }}>Loading...</div>
            )}
            {!gigsLoading && gigs.length === 0 && (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-dimmer)', fontSize: 12 }}>No gigs yet — <a href="/gigs/new" style={{ color: 'var(--gold)', textDecoration: 'none' }}>add your first show →</a></div>
            )}
            {gigs.map((gig, i) => {
              const d = new Date(gig.date)
              const days = now ? Math.ceil((d.getTime() - now.getTime()) / 86400000) : 0
              return (
                <div key={gig.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 150px 100px 90px 110px auto', padding: '18px 24px', borderBottom: i < gigs.length - 1 ? '1px solid var(--border-dim)' : 'none', alignItems: 'center', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#111009'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div>
                    <div style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '2px' }}>{gig.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>{gig.venue}</div>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-dimmer)' }}>{gig.location?.split(',')[1]?.trim()}</div>
                  <div><span style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: gig.status === 'confirmed' ? 'var(--green)' : '#8a6a3a', background: gig.status === 'confirmed' ? 'rgba(61, 107, 74, 0.1)' : 'rgba(138, 106, 58, 0.1)', padding: '4px 10px' }}>{gig.status}</span></div>
                  <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{(gig.audience || 0).toLocaleString()}</div>
                  <div style={{ fontSize: '14px', color: 'var(--text)' }}>€{(gig.fee || 0).toLocaleString()}</div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <Link href={`/broadcast?gig=${gig.id}&title=${encodeURIComponent(gig.title)}&date=${gig.date}`} style={{ fontSize: '11px', color: 'var(--green)', textDecoration: 'none' }}>Post</Link>
                    <Link href={`/gigs/${gig.id}`} style={{ fontSize: '11px', color: 'var(--text-dimmer)', textDecoration: 'none' }}>Advance</Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px', marginBottom: '44px' }}>
          {QUICK.map(a => (
            <Link key={a.label} href={a.href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '20px 24px', textDecoration: 'none', fontSize: '12px', color: a.color, transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#141310'; e.currentTarget.style.borderColor = a.color + '40' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--panel)'; e.currentTarget.style.borderColor = 'var(--border-dim)' }}>
              {a.label}<span style={{ opacity: 0.4 }}>→</span>
            </Link>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px' }}>
          {[
            { label: 'Next show', value: next ? `${daysTo}d` : '—', sub: next ? `${next.venue}` : 'No upcoming shows' },
            { label: 'Confirmed income', value: `€${totalFees.toLocaleString()}`, sub: `${confirmed.length} shows` },
            { label: 'Total audience', value: gigs.reduce((a, g) => a + (g.audience || 0), 0).toLocaleString(), sub: 'All upcoming' },
            { label: 'Needs attention', value: String(urgent.length), sub: urgent.length === 0 ? 'All clear' : 'Actions required', alert: urgent.length > 0 },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'var(--panel)', border: `1px solid ${stat.alert ? 'rgba(138, 74, 58, 0.19)' : 'var(--border-dim)'}`, padding: '28px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '14px' }}>{stat.label}</div>
              <div className="display" style={{ fontSize: '38px', color: stat.alert ? 'var(--gold)' : 'var(--text)', lineHeight: 1, marginBottom: '8px' }}>{stat.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-dimmest)' }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
