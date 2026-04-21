'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { useMobile } from '@/hooks/useMobile'
import MobileShell from '@/components/mobile/MobileShell'
import GigDayTimeline from '@/components/gigs/GigDayTimeline'
import { BlurredAmount } from '@/components/ui/BlurredAmount'

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
  set_time?: string
  set_length?: number
  doors_time?: string
  doors?: string
  venue_address?: string
  address?: string
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
  const mobile = useMobile()
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
  const [unreadCount, setUnreadCount] = useState(0)
  const [tasks, setTasks] = useState<{ id: string; text: string; done: boolean }[]>([])
  const [addingTask, setAddingTask] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [tracksCount, setTracksCount] = useState(0)
  const [releasesCount, setReleasesCount] = useState(0)

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
            // Auto-save
            await fetch('/api/tracks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tracks: [{ artist: track.artist, title: track.title, label: track.label || '', source: 'shazam' }] }) })
            setTrackIdPhase('found')
            setTimeout(() => setTrackIdPhase('idle'), 4000)
          } else {
            setTrackIdPhase('not_found')
            setTimeout(() => setTrackIdPhase('idle'), 3000)
          }
        } catch {
          setTrackIdPhase('not_found')
          setTimeout(() => setTrackIdPhase('idle'), 3000)
        }
      }
      setTrackIdPhase('listening')
      recorder.start(500)
      let secs = 10
      trackIdTimer.current = setInterval(() => {
        secs -= 1
        setTrackIdCountdown(secs)
        if (secs <= 0) {
          if (trackIdTimer.current) clearInterval(trackIdTimer.current)
          if (trackIdRecorder.current?.state !== 'inactive') trackIdRecorder.current?.stop()
        }
      }, 1000)
    } catch {
      setTrackIdPhase('idle')
    }
  }

  function cancelTrackId() {
    if (trackIdTimer.current) clearInterval(trackIdTimer.current)
    if (trackIdRecorder.current?.state !== 'inactive') trackIdRecorder.current?.stop()
    setTrackIdPhase('idle')
  }

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

      fetch('/api/notifications?unread=true').then(r => r.json()).then(d => {
        setUnreadCount(d.unread || 0)
      }).catch(() => {}),

      fetch('/api/tracks').then(r => r.json()).then(d => {
        setTracksCount((d.tracks || []).length)
      }).catch(() => {}),

      fetch('/api/releases').then(r => r.json()).then(d => {
        setReleasesCount((d.releases || []).length)
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

  useEffect(() => {
    try {
      const stored = localStorage.getItem('dashboard-tasks')
      if (stored) setTasks(JSON.parse(stored))
    } catch { /* silent */ }
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

    parts.push("That's your briefing. Have a great session.")
    return parts.join(' ')
  }

  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Mobile early-return — must come after ALL hooks but before any other early
  // returns so the desktop tonight/dashboard paths never render on a phone.
  if (mobile) return <MobileShell />

  function toggleAudioBrief() {
    if (speaking) {
      audioRef.current?.pause()
      audioRef.current = null
      setSpeaking(false)
      return
    }
    const text = buildAudioBriefText()
    setSpeaking(true)
    fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url) }
        audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url) }
        audio.play().catch(() => setSpeaking(false))
      })
      .catch(() => setSpeaking(false))
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

          {/* Gig day timeline */}
          <GigDayTimeline
            gig={{
              venue: tonightGig.venue,
              location: tonightGig.location,
              date: tonightGig.date,
              time: tonightGig.time,
              set_time: tonightGig.set_time || tonightGig.time,
              set_length: tonightGig.set_length,
              doors_time: tonightGig.doors_time || tonightGig.doors,
              venue_address: tonightGig.venue_address || tonightGig.address || tonightGig.location,
              al_name: tonightGig.al_name,
              al_phone: tonightGig.al_phone,
              promoter_email: tonightGig.promoter_email,
              promoter_phone: tonightGig.promoter_phone,
              driver_name: tonightGig.driver_name,
              driver_phone: tonightGig.driver_phone,
            }}
            travelBookings={tonightTravel as any}
          />

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
            <a
              href={`/api/gigs/${tonightGig.id}/wallet`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                border: '1px solid rgba(255,42,26,0.3)',
                color: 'var(--gold)',
                padding: '14px 28px',
                fontSize: '11px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase' as const,
                textDecoration: 'none',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Wallet pass
            </a>
            <Link
              href={`/gig-pass/${tonightGig.id}`}
              style={{
                display: 'inline-block',
                border: '1px solid rgba(255,42,26,0.3)',
                color: 'var(--gold)',
                padding: '14px 28px',
                fontSize: '11px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase' as const,
                textDecoration: 'none',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Gig pass
            </Link>
          </div>
        </div>

        {/* Bottom padding */}
        <div style={{ height: '48px' }} />
      </div>
    )
  }

  const todayStr2 = new Date().toISOString().slice(0, 10)
  // Next gig = nearest upcoming, any date window
  const nextGig = allGigs
    .filter(g => g.date >= todayStr2 && g.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null
  const confirmedGigsCount = allGigs.filter(g => g.status === 'confirmed' && g.date >= todayStr2).length
  const queuedPostsCount = allPosts.filter(p => p.status === 'scheduled').length

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── TOP BAR ── */}
      <div style={{ padding: '16px 48px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: 'var(--gold)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', paddingTop: '4px' }}>
          Signal Lab OS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              onClick={trackIdPhase === 'listening' ? cancelTrackId : startTrackId}
              disabled={trackIdPhase === 'identifying'}
              className="btn-secondary btn-sm"
              style={{ border: trackIdPhase === 'listening' ? '1px solid var(--gold)' : undefined, color: trackIdPhase === 'listening' ? 'var(--gold)' : undefined }}
            >
              {trackIdPhase === 'idle' && '♫ Track ID'}
              {trackIdPhase === 'listening' && `Listening... ${trackIdCountdown}s`}
              {trackIdPhase === 'identifying' && 'Identifying...'}
              {trackIdPhase === 'found' && `✓ ${trackIdResult?.artist} — ${trackIdResult?.title}`}
              {trackIdPhase === 'not_found' && 'Not found — try again'}
            </button>
            <Link href="/gigs/new" className="btn-primary btn-sm" style={{ textDecoration: 'none' }}>+ GIG</Link>
            <Link href="/broadcast" className="btn-secondary btn-sm" style={{ textDecoration: 'none' }}>+ POST</Link>
            <Link href="/business/finances" className="btn-secondary btn-sm" style={{ textDecoration: 'none' }}>+ INVOICE</Link>
            <Link href="/releases/new" className="btn-secondary btn-sm" style={{ textDecoration: 'none' }}>+ RELEASE</Link>
            <button onClick={() => setAddingTask(true)} className="btn-secondary btn-sm">+ TASK</button>
          </div>
          {/* Week strip */}
          {now && (
            <div style={{ display: 'flex', gap: '2px' }}>
              {Array.from({ length: 7 }, (_, i) => {
                const d = new Date(now)
                d.setDate(d.getDate() + i)
                const key = d.toISOString().slice(0, 10)
                const isToday = key === todayStr2
                const hasGig = allGigs.some(g => g.date === key)
                return (
                  <div key={i} style={{
                    background: isToday ? 'var(--gold)' : 'transparent',
                    color: isToday ? 'var(--bg)' : 'var(--text-dimmer)',
                    padding: '5px 8px',
                    textAlign: 'center',
                    fontFamily: 'var(--font-mono)',
                    minWidth: '36px',
                    position: 'relative',
                  }}>
                    <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {d.toLocaleDateString('en-GB', { weekday: 'short' })}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.2 }}>{d.getDate()}</div>
                    {hasGig && !isToday && (
                      <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--gold)', margin: '2px auto 0' }} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── GREETING + SUBTITLE ── */}
      <div style={{ padding: '4px 48px 0', flexShrink: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(56px, 8vw, 120px)',
            fontWeight: 900,
            lineHeight: 0.88,
            letterSpacing: '-0.05em',
            color: 'var(--text)',
            textTransform: 'uppercase',
          }}
          suppressHydrationWarning
        >
          {greeting}.
        </div>
        <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-dimmer)', letterSpacing: '0.04em', marginTop: '8px' }} suppressHydrationWarning>
          {!loading && now?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          {!loading && nextGig && ` · ${daysUntil(nextGig.date) === 0 ? 'tonight' : `${daysUntil(nextGig.date)}d`} to ${nextGig.venue || nextGig.title}`}
          {!loading && overdueInvoices.length > 0 && ` · ${overdueInvoices.length} invoice${overdueInvoices.length !== 1 ? 's' : ''} overdue`}
          {!loading && queuedPostsCount > 0 && ` · ${queuedPostsCount} posts queued`}
        </div>
      </div>

      {/* ── THE LABS — count cards ── */}
      <div style={{ padding: '12px 48px 0', flexShrink: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text)', marginBottom: '6px' }}>
          The Labs
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1px' }}>
          {[
            { href: '/gigs', label: 'GIGS', count: confirmedGigsCount, unit: 'CONFIRMED' },
            { href: '/broadcast', label: 'CONTENT', count: queuedPostsCount, unit: 'QUEUED' },
            { href: '/setlab', label: 'SETS', count: djSets.length, unit: 'SETS' },
            { href: '/sonix', label: 'TRACKS', count: tracksCount, unit: 'TRACKS' },
            { href: '/promo', label: 'RELEASES', count: releasesCount, unit: 'RELEASES' },
          ].map(card => (
            <Link key={card.href} href={card.href} style={{
              display: 'block', background: 'var(--panel)', border: '1px solid var(--border-dim)',
              padding: '12px 16px', textDecoration: 'none', transition: 'background 0.15s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#111' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--panel)' }}
            >
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 900, letterSpacing: '-0.01em', color: 'var(--text)', textTransform: 'uppercase' }}>
                {card.label}
              </div>
              <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-dimmer)', letterSpacing: '0.06em', marginTop: '2px' }}>
                {loading ? '—' : `${card.count} ${card.unit}`}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── MAIN 2-COL: gig hero + tasks ── */}
      <div style={{ flex: 1, display: 'flex', padding: '12px 48px 16px', gap: '32px', minHeight: 0, overflow: 'hidden' }}>

        {/* LEFT: Next gig hero */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden' }}>
          {loading ? null : nextGig ? (
            <>
              <div style={{ fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--gold)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                Next Gig · {daysUntil(nextGig.date) === 0 ? 'Tonight' : daysUntil(nextGig.date) === 1 ? 'Tomorrow' : `In ${daysUntil(nextGig.date)} Days`}
              </div>
              <Link href={`/gigs/${nextGig.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(48px, 8.5vw, 130px)',
                  fontWeight: 900,
                  lineHeight: 0.88,
                  letterSpacing: '-0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--text)',
                }}>
                  {nextGig.venue || nextGig.title}
                </div>
                {nextGig.location && (
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(24px, 4vw, 60px)',
                    fontWeight: 900,
                    lineHeight: 0.9,
                    letterSpacing: '-0.03em',
                    textTransform: 'uppercase',
                    color: 'var(--text-dimmer)',
                    marginTop: '2px',
                  }}>
                    {nextGig.location}
                  </div>
                )}
              </Link>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-dimmer)', letterSpacing: '0.04em' }}>
                  {fmtGigDate(nextGig.date).toUpperCase()}
                </span>
                <span style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', border: `1px solid ${nextGig.status === 'confirmed' ? 'var(--gold)' : 'var(--border)'}`, color: nextGig.status === 'confirmed' ? 'var(--gold)' : 'var(--text-dimmer)', padding: '2px 8px' }}>
                  {nextGig.status}
                </span>
                {!advanceMap[nextGig.id] && (
                  <span style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', border: '1px solid rgba(255,160,30,0.5)', color: 'rgba(255,160,30,0.8)', padding: '2px 8px' }}>
                    Advance Needed
                  </span>
                )}
                {!nextGig.set_time && !nextGig.time && (
                  <span style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', border: '1px solid rgba(255,160,30,0.5)', color: 'rgba(255,160,30,0.8)', padding: '2px 8px' }}>
                    Set Time Needed
                  </span>
                )}
              </div>
              {/* Next scheduled post preview */}
              {weekPosts[0] && (
                <div style={{ marginTop: '12px', background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '12px 14px', maxWidth: '520px' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--text-dimmer)', marginBottom: '4px' }}>
                    Next Post · {weekPosts[0].platform}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                    {weekPosts[0].caption}
                  </div>
                  <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-dimmer)', marginTop: '4px' }}>
                    {new Date(weekPosts[0].scheduled_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at {new Date(weekPosts[0].scheduled_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <Link href="/gigs/new" style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                Next Gig
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(48px, 8.5vw, 130px)', fontWeight: 900, lineHeight: 0.88, letterSpacing: '-0.04em', textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>
                No Shows<br />Booked
              </div>
              <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-dimmer)', marginTop: '8px' }}>Add a gig →</div>
            </Link>
          )}
        </div>

        {/* RIGHT: Tasks + Attention */}
        <div style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0', overflowY: 'auto' }}>

          {/* TO DO */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text)' }}>
                To Do
              </span>
              {tasks.length > 3 && (
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-dimmer)', letterSpacing: '0.06em' }}>
                  All {tasks.length} →
                </span>
              )}
            </div>
            {tasks.length === 0 && !addingTask && (
              <div style={{ fontSize: '12px', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)' }}>No tasks</div>
            )}
            {tasks.slice(0, 5).map((t) => (
              <div key={t.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px' }}>
                <button
                  onClick={() => {
                    const updated = tasks.map(x => x.id === t.id ? { ...x, done: !x.done } : x)
                    setTasks(updated)
                    localStorage.setItem('dashboard-tasks', JSON.stringify(updated))
                  }}
                  style={{ background: 'none', border: '1px solid var(--border)', width: '12px', height: '12px', flexShrink: 0, cursor: 'pointer', marginTop: '3px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {t.done && <span style={{ fontSize: '8px', color: 'var(--gold)', lineHeight: 1 }}>✓</span>}
                </button>
                <span style={{ fontSize: '12px', color: t.done ? 'var(--text-dimmer)' : 'var(--text)', fontFamily: 'var(--font-mono)', textDecoration: t.done ? 'line-through' : 'none', flex: 1, lineHeight: 1.5 }}>
                  {t.text}
                </span>
                <button
                  onClick={() => {
                    const updated = tasks.filter(x => x.id !== t.id)
                    setTasks(updated)
                    localStorage.setItem('dashboard-tasks', JSON.stringify(updated))
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-dimmer)', cursor: 'pointer', fontSize: '14px', padding: '0 2px', flexShrink: 0 }}
                >
                  ×
                </button>
              </div>
            ))}
            {addingTask ? (
              <form onSubmit={(e) => {
                e.preventDefault()
                if (!newTask.trim()) { setAddingTask(false); return }
                const updated = [...tasks, { id: Date.now().toString(), text: newTask.trim(), done: false }]
                setTasks(updated)
                localStorage.setItem('dashboard-tasks', JSON.stringify(updated))
                setNewTask('')
                setAddingTask(false)
              }} style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                <input
                  autoFocus
                  value={newTask}
                  onChange={e => setNewTask(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setAddingTask(false); setNewTask('') } }}
                  placeholder="New task…"
                  style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)', padding: '4px 8px', fontSize: '11px', fontFamily: 'var(--font-mono)', outline: 'none' }}
                />
                <button type="submit" className="btn-primary btn-sm" style={{ padding: '4px 8px', fontSize: '10px' }}>Add</button>
              </form>
            ) : (
              <button
                onClick={() => setAddingTask(true)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dimmer)', cursor: 'pointer', fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '4px 0', textAlign: 'left' }}
              >
                + Add task
              </button>
            )}
          </div>

          {/* NEEDS ATTENTION */}
          {!loading && (overdueInvoices.length > 0 || briefingItems.some(i => i.dot === 'gold' || i.dot === 'red' || i.dot === 'redflag')) && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text)', marginBottom: '10px' }}>
                Needs Attention
              </div>
              {overdueInvoices.length > 0 && (
                <Link href="/business/finances" style={{ textDecoration: 'none', display: 'block', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>
                    {overdueInvoices.length} overdue invoice{overdueInvoices.length !== 1 ? 's' : ''}
                  </span>
                </Link>
              )}
              {briefingItems.filter(i => i.dot === 'gold' || i.dot === 'amber').slice(0, 2).map(item => (
                <Link key={item.key} href={item.href} style={{ textDecoration: 'none', display: 'block', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', lineHeight: 1.4 }}>{item.text}</span>
                </Link>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* Chase toast */}
      {chaseToast && (
        <div style={{
          position: 'fixed', bottom: '32px', right: '32px',
          background: 'var(--panel)', border: '1px solid var(--gold)',
          color: 'var(--gold)', fontFamily: 'var(--font-mono)',
          fontSize: '11px', letterSpacing: '0.08em', padding: '12px 20px',
          zIndex: 9999, pointerEvents: 'none',
        }}>
          {chaseToast}
        </div>
      )}
    </div>
  )
}
