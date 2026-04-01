'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SignalBar from '@/components/SignalBar'
import { SkeletonRows } from '@/components/ui/Skeleton'

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
  promoter_email?: string
  promoter_phone?: string
  al_name?: string
  al_phone?: string
  al_email?: string
  driver_name?: string
  driver_phone?: string
  driver_notes?: string
  notes?: string
}

interface TravelBooking {
  id: string
  type: string
  name: string
  flight_number?: string
  from_location?: string
  to_location?: string
  departure_at?: string
  arrival_at?: string
  check_in?: string
  check_out?: string
  reference?: string
  notes?: string
}

interface SetTrack {
  id: string
  title: string
  artist: string
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
            padding: '12px 14px 10px',
            borderRight: i < 6 ? '1px solid var(--border-dim)' : 'none',
            background: isToday ? 'rgba(201,169,110,0.03)' : 'transparent',
            borderTop: isToday ? '2px solid var(--gold)' : '2px solid transparent',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: isToday ? 'var(--gold)' : 'var(--text-dimmer)', fontFamily: 'var(--font-mono)' }}>
                {d.toLocaleDateString('en-GB', { weekday: 'short' })}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: isToday ? 'var(--gold)' : 'var(--text-dimmer)' }}>
                {d.getDate()}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {dayGigs.map((g, j) => (
                <Link key={j} href={`/gigs/${g.id}`} style={{ display: 'block', fontSize: '9px', color: 'var(--gold)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {g.venue || g.title}
                </Link>
              ))}
              {dayPosts.map((p, j) => (
                <div key={j} style={{ fontSize: '9px', color: 'var(--green)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.platform || 'Post'}
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
  const [speaking, setSpeaking] = useState(false)
  const [chaseToast, setChaseToast] = useState<string | null>(null)
  const [chasingGigId, setChasingGigId] = useState<string | null>(null)

  // Tonight Mode state
  const [tonightGig, setTonightGig] = useState<Gig | null>(null)
  const [tonightTravel, setTonightTravel] = useState<TravelBooking[]>([])
  const [tonightTracks, setTonightTracks] = useState<SetTrack[]>([])
  const [tonightSetName, setTonightSetName] = useState<string | null>(null)

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

  // Tonight Mode: when a gig matches today, fetch full details + travel + set tracks
  useEffect(() => {
    if (allGigs.length === 0) return
    const todayStr = new Date().toISOString().slice(0, 10)
    const foundGig = allGigs.find(g => g.date === todayStr && g.status !== 'cancelled')
    if (!foundGig) { setTonightGig(null); return }
    const todaysGig: Gig = foundGig

    // Fetch full gig details (the list endpoint may not include all fields)
    fetch(`/api/gigs/${todaysGig.id}`).then(r => r.json()).then(d => {
      if (d.gig) setTonightGig(d.gig)
      else setTonightGig(todaysGig)
    }).catch(() => setTonightGig(todaysGig))

    // Fetch travel bookings
    fetch(`/api/gigs/${todaysGig.id}/travel`).then(r => r.json()).then(d => {
      setTonightTravel(d.bookings || [])
    }).catch(() => {})

    // Fetch linked set tracks
    async function loadTonightSet() {
      try {
        const { supabase } = await import('@/lib/supabase')
        // Try gig_id link first, then venue match
        let { data: linkedSet } = await supabase
          .from('dj_sets')
          .select('id, name')
          .eq('gig_id', todaysGig.id)
          .limit(1)
          .maybeSingle()

        if (!linkedSet && todaysGig.venue) {
          const norm = todaysGig.venue.toLowerCase().slice(0, 6)
          const { data: sets } = await supabase
            .from('dj_sets')
            .select('id, name, venue')
            .order('created_at', { ascending: false })
            .limit(50)
          if (sets) {
            linkedSet = sets.find(s => s.venue && s.venue.toLowerCase().includes(norm)) || null
          }
        }

        if (linkedSet) {
          setTonightSetName(linkedSet.name)
          const { data: tracks } = await supabase
            .from('set_tracks')
            .select('dj_tracks(id, title, artist)')
            .eq('set_id', linkedSet.id)
            .order('position', { ascending: true })
          if (tracks) {
            setTonightTracks(tracks.flatMap((t: any) => t.dj_tracks ? [t.dj_tracks] : []))
          }
        }
      } catch { /* silent */ }
    }
    loadTonightSet()
  }, [allGigs])

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

  function buildAudioBriefText(): string {
    const parts: string[] = []
    const dayName = now?.toLocaleDateString('en-GB', { weekday: 'long' }) || 'Today'
    parts.push(`${greeting}. Here's your ${dayName} briefing.`)

    if (upcomingGigs.length === 0) {
      parts.push('No gigs in the next 14 days.')
    } else {
      const gigCount = upcomingGigs.length
      parts.push(`You have ${gigCount} upcoming ${gigCount === 1 ? 'gig' : 'gigs'}.`)
      upcomingGigs.forEach(gig => {
        const days = Math.max(0, Math.ceil((new Date(gig.date).getTime() - Date.now()) / 86400000))
        const when = days === 0 ? 'tonight' : days === 1 ? 'tomorrow' : `in ${days} days`
        const venue = gig.venue || gig.title
        const adv = advanceMap[gig.id]
        const advNote = adv === 'complete' ? 'advance complete' : adv === 'sent' ? 'advance sent' : 'advance not yet sent'
        parts.push(`${venue}, ${when}. ${advNote}.`)
      })
    }

    if (weekPosts.length > 0) {
      parts.push(`${weekPosts.length} ${weekPosts.length === 1 ? 'post' : 'posts'} scheduled this week.`)
    } else {
      parts.push('No posts scheduled this week.')
    }

    if (overdueInvoices.length > 0) {
      parts.push(`You have ${overdueInvoices.length} overdue ${overdueInvoices.length === 1 ? 'invoice' : 'invoices'}. Follow up needed.`)
    }

    if (quarterStats.revenue > 0) {
      parts.push(`Revenue this quarter: £${quarterStats.revenue.toLocaleString()}.`)
    }

    parts.push("That's your briefing. Have a great session.")
    return parts.join(' ')
  }

  function toggleAudioBrief() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const text = buildAudioBriefText()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.95
    utterance.pitch = 1
    utterance.volume = 1
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    setSpeaking(true)
  }

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

  async function sendAdvanceChase(gig: Gig) {
    if (chasingGigId) return
    setChasingGigId(gig.id)
    try {
      const res = await fetch('/api/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gigId: gig.id,
          gigTitle: gig.title,
          venue: gig.venue,
          date: gig.date,
          promoterEmail: gig.promoter_email,
          subject: `Just checking in — ${gig.title} advance`,
        }),
      })
      if (res.ok) {
        setChaseToast(`Chase sent for ${gig.venue || gig.title}`)
      } else {
        setChaseToast('Failed to send — check promoter email is set')
      }
    } catch {
      setChaseToast('Failed to send chase')
    } finally {
      setChasingGigId(null)
      setTimeout(() => setChaseToast(null), 4000)
    }
  }

  // Build briefing items
  const briefingItems: { key: string; dot: string; text: React.ReactNode; href: string; action: string; chaseGig?: Gig }[] = []

  if (!loading) {
    if (upcomingGigs.length === 0) {
      briefingItems.push({ key: 'no-gigs', dot: 'dim', text: 'No upcoming shows in the next 14 days', href: '/gigs/new', action: 'Add a gig' })
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
        else if (adv === 'sent') issues.push('advance not completed')

        // Show chase button for gigs within 10 days with an advance issue and a promoter email
        const showChase = days <= 10 && (adv === 'sent' || !adv) && !!gig.promoter_email

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
          action: !set ? 'Build set' : !adv ? 'Send advance' : 'View',
          chaseGig: showChase ? gig : undefined,
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
            <span style={{ color: isCritical ? '#ff4040' : 'var(--red-brown)' }}> — oldest {oldestDays} day{oldestDays !== 1 ? 's' : ''}</span>
          </span>
        ),
        href: '/business/finances',
        action: 'View invoices',
      })
    }

    if (weekPosts.length === 0) {
      briefingItems.push({ key: 'no-posts', dot: 'dim', text: 'No posts scheduled this week', href: '/broadcast', action: 'Plan content' })
    } else {
      briefingItems.push({
        key: 'posts',
        dot: 'green',
        text: <span><span style={{ color: 'var(--text)' }}>{weekPosts.length} post{weekPosts.length !== 1 ? 's' : ''}</span><span style={{ color: 'var(--text-dimmer)' }}> scheduled this week</span></span>,
        href: '/broadcast',
        action: 'Open Broadcast',
      })
    }
  }

  const dotColor: Record<string, string> = {
    gold: 'var(--gold)',
    green: 'var(--green)',
    amber: 'var(--amber)',
    red: 'var(--red-brown)',
    redflag: '#ff4040',
    dim: 'var(--border)',
  }

  // ── TONIGHT MODE ──
  if (tonightGig && !loading) {
    const advStatus = advanceMap[tonightGig.id]
    const advLabel = advStatus === 'complete' ? 'Complete' : advStatus === 'sent' ? 'Sent' : 'Not sent'
    const advColor = advStatus === 'complete' ? 'var(--green)' : advStatus === 'sent' ? 'var(--gold)' : 'var(--text-dimmer)'

    const mapsUrl = tonightGig.location
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tonightGig.location)}`
      : null

    const travelSummary = tonightTravel.length > 0
      ? tonightTravel.map(t => {
          if (t.type === 'flight') return `Flight ${t.flight_number || t.name || ''} ${t.from_location || ''} → ${t.to_location || ''}`
          if (t.type === 'hotel') return `Hotel: ${t.name || 'Booked'}${t.check_in ? ` · Check-in ${t.check_in}` : ''}`
          if (t.type === 'train') return `Train: ${t.from_location || ''} → ${t.to_location || ''}`
          return `${t.type}: ${t.name || 'Booked'}`
        })
      : null

    return (
      <div style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 24px',
      }}>
        {/* Back link */}
        <div style={{ width: '100%', maxWidth: '640px', paddingTop: '24px' }}>
          <button
            onClick={() => setTonightGig(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dimmer)',
              fontSize: '11px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase' as const,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              padding: '8px 0',
            }}
          >
            ← Back to dashboard
          </button>
        </div>

        {/* Main card */}
        <div style={{
          width: '100%',
          maxWidth: '640px',
          background: 'var(--panel)',
          border: '1px solid var(--border-dim)',
          marginTop: '16px',
          padding: '48px 40px 40px',
        }}>
          {/* Tonight label */}
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.3em',
            textTransform: 'uppercase' as const,
            color: 'var(--gold)',
            fontFamily: 'var(--font-mono)',
            marginBottom: '32px',
          }}>
            Tonight
          </div>

          {/* Gig name / venue */}
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 5vw, 42px)',
            fontWeight: 300,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            color: 'var(--text)',
            marginBottom: '6px',
          }}>
            {tonightGig.title}
          </div>
          <div style={{
            fontSize: '16px',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            marginBottom: '40px',
          }}>
            {tonightGig.venue}
          </div>

          {/* Set time — huge, gold, the hero element */}
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(64px, 12vw, 96px)',
            fontWeight: 300,
            lineHeight: 1,
            letterSpacing: '-0.03em',
            color: 'var(--gold)',
            marginBottom: '48px',
          }}>
            {tonightGig.time || '—'}
          </div>

          {/* Details grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '40px' }}>

            {/* Venue address */}
            {tonightGig.location && (
              <div>
                <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>
                  Venue address
                </div>
                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '14px', color: 'var(--text)', textDecoration: 'underline', textDecorationColor: 'var(--border-dim)', textUnderlineOffset: '3px' }}
                  >
                    {tonightGig.location}
                  </a>
                ) : (
                  <div style={{ fontSize: '14px', color: 'var(--text)' }}>{tonightGig.location}</div>
                )}
              </div>
            )}

            {/* Local contact */}
            {tonightGig.al_name && (
              <div>
                <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>
                  Local contact
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text)' }}>
                  {tonightGig.al_name}
                  {tonightGig.al_phone && (
                    <> · <a href={`tel:${tonightGig.al_phone}`} style={{ color: 'var(--gold)', textDecoration: 'none' }}>{tonightGig.al_phone}</a></>
                  )}
                </div>
              </div>
            )}

            {/* Promoter */}
            {(tonightGig.promoter_email || tonightGig.promoter_phone) && (
              <div>
                <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>
                  Promoter
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text)' }}>
                  {tonightGig.promoter_phone && (
                    <a href={`tel:${tonightGig.promoter_phone}`} style={{ color: 'var(--gold)', textDecoration: 'none' }}>{tonightGig.promoter_phone}</a>
                  )}
                  {tonightGig.promoter_phone && tonightGig.promoter_email && <> · </>}
                  {tonightGig.promoter_email && (
                    <a href={`mailto:${tonightGig.promoter_email}`} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>{tonightGig.promoter_email}</a>
                  )}
                </div>
              </div>
            )}

            {/* Driver */}
            {tonightGig.driver_name && (
              <div>
                <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>
                  Driver
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text)' }}>
                  {tonightGig.driver_name}
                  {tonightGig.driver_phone && (
                    <> · <a href={`tel:${tonightGig.driver_phone}`} style={{ color: 'var(--gold)', textDecoration: 'none' }}>{tonightGig.driver_phone}</a></>
                  )}
                </div>
              </div>
            )}

            {/* Travel status */}
            {travelSummary && (
              <div>
                <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>
                  Travel
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {travelSummary.map((line, i) => (
                    <div key={i} style={{ fontSize: '14px', color: 'var(--text)' }}>{line}</div>
                  ))}
                </div>
              </div>
            )}
            {tonightTravel.length === 0 && (
              <div>
                <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>
                  Travel
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-dimmer)' }}>No bookings</div>
              </div>
            )}

            {/* Advance status */}
            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>
                Advance
              </div>
              <div style={{ fontSize: '14px', color: advColor, fontFamily: 'var(--font-mono)' }}>
                {advLabel}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border-dim)', marginBottom: '32px' }} />

          {/* Your Set section */}
          <div>
            <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'var(--gold)', fontFamily: 'var(--font-mono)', marginBottom: '16px' }}>
              Your set{tonightSetName ? ` — ${tonightSetName}` : ''}
            </div>
            {tonightTracks.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {tonightTracks.map((track, i) => (
                  <div key={track.id} style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', width: '20px', textAlign: 'right', flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text)' }}>
                      {track.artist} — {track.title}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-dimmer)', fontStyle: 'italic' }}>
                No set linked to this gig
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border-dim)', margin: '32px 0' }} />

          {/* Quick actions */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link
              href={`/gigs/${tonightGig.id}/debrief`}
              style={{
                display: 'inline-block',
                background: 'var(--gold)',
                color: 'var(--bg)',
                padding: '14px 28px',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase' as const,
                textDecoration: 'none',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Start debrief
            </Link>
            <Link
              href={`/gigs/${tonightGig.id}`}
              style={{
                display: 'inline-block',
                border: '1px solid var(--border-dim)',
                color: 'var(--text-dim)',
                padding: '14px 28px',
                fontSize: '11px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase' as const,
                textDecoration: 'none',
                fontFamily: 'var(--font-mono)',
              }}
            >
              View gig details
            </Link>
          </div>
        </div>

        {/* Bottom padding */}
        <div style={{ height: '48px' }} />
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── ZONE 1: GREETING + ACTIONS ── */}
      <div style={{ padding: '40px 48px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '14px', fontFamily: 'var(--font-mono)' }} suppressHydrationWarning>
              {now?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(40px, 5vw, 72px)', fontWeight: 300, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--text)' }} suppressHydrationWarning>
                {greeting}.
              </div>
              {!loading && typeof window !== 'undefined' && 'speechSynthesis' in window && (
                <button
                  onClick={toggleAudioBrief}
                  title={speaking ? 'Stop brief' : 'Listen to brief'}
                  style={{
                    background: 'none',
                    border: `1px solid ${speaking ? 'var(--gold)' : 'var(--border)'}`,
                    color: speaking ? 'var(--gold)' : 'var(--text-dimmer)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    letterSpacing: '0.12em',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'color 0.15s, border-color 0.15s',
                    flexShrink: 0,
                    marginBottom: '4px',
                  }}
                  onMouseEnter={e => { if (!speaking) { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)' } }}
                  onMouseLeave={e => { if (!speaking) { (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' } }}
                >
                  {speaking ? '⏹' : '▶'} {speaking ? 'Stop' : 'Listen to brief'}
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', paddingBottom: '6px' }}>
            <Link href="/broadcast" className="btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
              + New post
            </Link>
            <Link href="/gigs/new" className="btn-primary btn-sm" style={{ textDecoration: 'none' }}>
              + New gig
            </Link>
            <Link href="/releases/new" className="btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
              + New release
            </Link>
          </div>
        </div>

        {/* ── SIGNAL BAR ── */}
        <SignalBar onAction={() => router.refresh()} />
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 48px', gap: '24px', minHeight: 0, overflow: 'auto', paddingBottom: '32px' }}>

        {/* ── ZONE 2: YOUR WEEK BRIEFING ── */}
        <div>
          <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '10px', fontFamily: 'var(--font-mono)' }}>Your week</div>
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
          {loading ? (
            <SkeletonRows count={3} />
          ) : (
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', overflow: 'hidden' }}>
              {briefingItems.map((item, i) => (
                <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', alignItems: 'center', gap: '14px', padding: '12px 20px', borderBottom: i < briefingItems.length - 1 ? '1px solid var(--border-dim)' : 'none' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor[item.dot] || 'var(--border)', flexShrink: 0 }} />
                  <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>{item.text}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {item.chaseGig && (
                      <button
                        onClick={() => sendAdvanceChase(item.chaseGig!)}
                        disabled={chasingGigId === item.chaseGig.id}
                        style={{
                          background: 'none',
                          border: '1px solid var(--border)',
                          color: chasingGigId === item.chaseGig.id ? 'var(--text-dimmer)' : 'var(--gold)',
                          fontSize: '9px',
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase' as const,
                          fontFamily: 'var(--font-mono)',
                          padding: '3px 8px',
                          cursor: chasingGigId === item.chaseGig.id ? 'wait' : 'pointer',
                          whiteSpace: 'nowrap' as const,
                          transition: 'border-color 0.12s, color 0.12s',
                        }}
                        onMouseEnter={e => { if (!chasingGigId) (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                      >
                        {chasingGigId === item.chaseGig.id ? 'Sending...' : 'Chase'}
                      </button>
                    )}
                    <Link href={item.href} style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', textDecoration: 'none', whiteSpace: 'nowrap', transition: 'color 0.12s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--gold)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'}>
                      {item.action}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Chase toast */}
          {chaseToast && (
            <div style={{
              position: 'fixed',
              bottom: '32px',
              right: '32px',
              background: 'var(--panel)',
              border: '1px solid var(--gold)',
              color: 'var(--gold)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.08em',
              padding: '12px 20px',
              zIndex: 9999,
              pointerEvents: 'none',
            }}>
              {chaseToast}
            </div>
          )}
        </div>

        {/* ── ZONE 3: STATS + WEEK STRIP ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)' }}>{quarterLabel || '—'}</div>
            <Link href="/wrap" style={{ fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dimmer)', textDecoration: 'none', fontFamily: 'var(--font-mono)', transition: 'color 0.12s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--gold)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmer)'}
            >Full wrap</Link>
          </div>

          {/* Stats bar — matches reference design */}
          <div className="stats-bar" style={{ border: '1px solid var(--border-dim)', background: 'var(--panel)' }}>
            {[
              { label: 'Gigs', value: loading ? '—' : String(quarterStats.gigs), sub: quarterStats.gigs === 0 ? 'None booked' : 'this quarter' },
              { label: 'Posts live', value: loading ? '—' : String(quarterStats.posts), sub: quarterStats.posts === 0 ? 'Nothing posted' : 'published' },
              { label: 'Revenue', value: loading ? '—' : quarterStats.revenue > 0 ? `£${quarterStats.revenue.toLocaleString()}` : '—', sub: quarterStats.revenue === 0 ? 'No fees logged' : 'from gigs' },
            ].map((stat, i) => (
              <div key={stat.label} className="stat-block" style={i === 0 ? { paddingLeft: '28px' } : undefined}>
                <div className="stat-label">{stat.label}</div>
                <div className="stat-num">{stat.value}</div>
                <div className="stat-sub">{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── WEEK STRIP ── */}
        <div style={{ border: '1px solid var(--border-dim)', overflow: 'hidden', background: 'var(--panel)' }}>
          <WeekStrip gigs={allGigs} scheduledPosts={allPosts} />
        </div>

      </div>
    </div>
  )
}
