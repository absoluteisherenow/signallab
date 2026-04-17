'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BlurredAmount } from '@/components/ui/BlurredAmount'

type Period = 'q1' | 'q2' | 'q3' | 'q4' | 'year'

interface WrapStats {
  gigs: number
  cities: string[]
  boothHours: number | null
  topTracks: string[]
  posts: number
  revenue: number | null
  currency: string
  bestGig: string | null
  recentGigs: { venue: string; location: string; date: string }[]
  empty: boolean
}

function periodRange(period: Period, year: number): { start: string; end: string; label: string } {
  switch (period) {
    case 'q1': return { start: `${year}-01-01`, end: `${year}-03-31`, label: `Q1 ${year}` }
    case 'q2': return { start: `${year}-04-01`, end: `${year}-06-30`, label: `Q2 ${year}` }
    case 'q3': return { start: `${year}-07-01`, end: `${year}-09-30`, label: `Q3 ${year}` }
    case 'q4': return { start: `${year}-10-01`, end: `${year}-12-31`, label: `Q4 ${year}` }
    case 'year': return { start: `${year}-01-01`, end: `${year}-12-31`, label: `${year}` }
  }
}

function currentQuarter(): Period {
  const m = new Date().getMonth()
  if (m < 3) return 'q1'
  if (m < 6) return 'q2'
  if (m < 9) return 'q3'
  return 'q4'
}

function WrapContent() {
  const searchParams = useSearchParams()
  const isPublic = searchParams.get('share') === '1'
  const year = new Date().getFullYear()
  const [loading, setLoading] = useState(true)
  const [artistName, setArtistName] = useState('')
  const [bio, setBio] = useState<string | null>(null)
  const [bookingEmail, setBookingEmail] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>(currentQuarter())
  const [stats, setStats] = useState<WrapStats | null>(null)
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    async function loadProfile() {
      const { data } = await supabase.from('artist_settings').select('profile, team, advance').single()
      const profile = data?.profile as Record<string, unknown> | null
      setArtistName((profile?.name as string) || 'Artist')
      setBio((profile?.bio as string) || null)
      const team = data?.team as { role?: string; email?: string }[] | null
      const booking = team?.find(t => t.role?.toLowerCase().includes('book'))
      setBookingEmail(booking?.email || (data?.advance as Record<string, string>)?.reply_email || null)
    }
    loadProfile()
  }, [])

  useEffect(() => {
    async function loadStats() {
      setLoading(true)
      try {
        const { start, end } = periodRange(period, year)

        const { data: gigs } = await supabase
          .from('gigs')
          .select('venue, location, date, slot_time, debrief_rating')
          .gte('date', start)
          .lte('date', end)
          .neq('status', 'cancelled')
          .order('date', { ascending: false })

        const gigCount = gigs?.length || 0

        if (gigCount === 0) {
          setStats({ gigs: 0, cities: [], boothHours: null, topTracks: [], posts: 0, revenue: null, currency: '£', bestGig: null, recentGigs: [], empty: true })
          setLoading(false)
          return
        }

        const citySet = new Set<string>()
        gigs?.forEach(g => { if (g.location) citySet.add(g.location) })
        const cities = Array.from(citySet)

        let boothHours: number | null = null
        const slotTimes = gigs?.map(g => g.slot_time).filter(Boolean) || []
        if (slotTimes.length > 0) {
          const totalMins = slotTimes.reduce((sum, slot) => {
            const rangeMatch = slot?.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/)
            if (rangeMatch) {
              const startH = parseInt(rangeMatch[1]), startM = parseInt(rangeMatch[2])
              let endH = parseInt(rangeMatch[3]), endM = parseInt(rangeMatch[4])
              if (endH < startH) endH += 24
              return sum + (endH - startH) * 60 + (endM - startM)
            }
            const hrMatch = slot?.match(/(\d+)\s*(?:hrs?|hours?)/i)
            if (hrMatch) return sum + parseInt(hrMatch[1]) * 60
            return sum
          }, 0)
          if (totalMins > 0) boothHours = Math.round(totalMins / 60)
        }

        const rated = gigs?.filter(g => g.debrief_rating) || []
        const bestGigRow = rated.sort((a, b) => (b.debrief_rating || 0) - (a.debrief_rating || 0))[0]
        const bestGig = bestGigRow?.venue || null

        const { data: topTrackRows } = await supabase
          .from('dj_tracks')
          .select('title, artist, crowd_hits')
          .gt('crowd_hits', 0)
          .order('crowd_hits', { ascending: false })
          .limit(3)
        const topTracks = (topTrackRows || []).map(t => `${t.artist} — ${t.title}`)

        const { count: postCount } = await supabase
          .from('scheduled_posts')
          .select('*', { count: 'exact', head: true })
          .gte('scheduled_at', start)
          .lte('scheduled_at', end + 'T23:59:59')
          .eq('status', 'posted')

        const { data: invoices } = await supabase
          .from('invoices')
          .select('amount, currency')
          .gte('created_at', start)
          .lte('created_at', end + 'T23:59:59')
          .eq('status', 'paid')
        const currency = invoices?.[0]?.currency || '£'
        const revenue = invoices?.length ? invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0) : null

        const recentGigs = (gigs || []).slice(0, 6).map(g => ({ venue: g.venue, location: g.location, date: g.date }))

        setStats({ gigs: gigCount, cities, boothHours, topTracks, posts: postCount || 0, revenue, currency, bestGig, recentGigs, empty: false })
      } catch {
        setStats(null)
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [period, year])

  const { label } = periodRange(period, year)
  const periods: { key: Period; label: string }[] = [
    { key: 'q1', label: 'Q1' }, { key: 'q2', label: 'Q2' },
    { key: 'q3', label: 'Q3' }, { key: 'q4', label: 'Q4' },
    { key: 'year', label: 'Year' },
  ]

  function handleCopyShare() {
    const url = `${window.location.origin}/wrap?share=1`
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  function handleCopyText() {
    if (!stats) return
    const parts = [`${artistName} — ${label}:`]
    if (stats.gigs) parts.push(`${stats.gigs} show${stats.gigs !== 1 ? 's' : ''}`)
    if (stats.cities.length > 1) parts.push(`${stats.cities.length} cities`)
    if (stats.posts) parts.push(`${stats.posts} posts`)
    navigator.clipboard.writeText(parts.join(', ')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const s = {
    bg: 'var(--bg)', gold: 'var(--gold)', text: 'var(--text)', dim: 'var(--text-dim)',
    dimmer: 'var(--text-dimmer)', border: 'var(--border-dim)', panel: 'var(--panel)',
    font: 'var(--font-mono)',
  }

  if (loading) {
    return (
      <div style={{ background: s.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: s.font }}>
        <div style={{ color: s.dimmer, fontSize: 11, letterSpacing: '0.2em' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ background: s.bg, minHeight: '100vh', fontFamily: s.font, padding: '40px', color: s.text }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {!isPublic && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 48 }}>
            <Link href="/dashboard" style={{ color: s.dimmer, fontSize: 10, letterSpacing: '0.2em', textDecoration: 'none', textTransform: 'uppercase' }}>← Dashboard</Link>
            <button
              onClick={handleCopyShare}
              style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dimmer, padding: '8px 16px', cursor: 'pointer', fontFamily: s.font, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' }}
            >
              {linkCopied ? 'Link copied ✓' : 'Share with promoter →'}
            </button>
          </div>
        )}

        {isPublic && (
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.3em', color: s.dimmer, textTransform: 'uppercase' }}>Signal Lab OS</div>
          </div>
        )}

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 10, color: s.gold, letterSpacing: '0.35em', textTransform: 'uppercase', marginBottom: 10 }}>
            {artistName}
          </div>
          <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 'clamp(26px, 5vw, 44px)', fontWeight: 300, lineHeight: 1.1 }}>
            {isPublic ? 'Artist overview' : 'Your quarter'}<br />
            <span style={{ color: s.gold }}>{label}</span>
          </div>
          {isPublic && bio && (
            <div style={{ marginTop: 20, fontSize: 13, color: s.dim, lineHeight: 1.8, maxWidth: 500 }}>
              {bio}
            </div>
          )}
        </div>

        {/* Period selector — private only */}
        {!isPublic && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 40 }}>
            {periods.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                style={{
                  background: period === p.key ? s.gold : 'transparent',
                  color: period === p.key ? '#050505' : s.dimmer,
                  border: `1px solid ${period === p.key ? s.gold : s.border}`,
                  padding: '7px 14px', cursor: 'pointer',
                  fontFamily: s.font, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                  transition: 'all 0.15s',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {stats?.empty && (
          <div style={{ color: s.dim, fontSize: 13, lineHeight: 1.8, padding: '40px 0' }}>
            No gigs logged for {label}.
            {!isPublic && (
              <div style={{ marginTop: 20 }}>
                <Link href="/gigs" style={{ color: s.gold, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', textDecoration: 'none' }}>Add gigs →</Link>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        {!stats?.empty && (
          <div style={{ borderTop: `1px solid ${s.border}` }}>
            {stats?.gigs ? (
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '24px 0', borderBottom: `1px solid ${s.border}` }}>
                <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: s.dimmer }}>Shows</div>
                <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 'clamp(36px, 6vw, 56px)', fontWeight: 300, color: s.gold, lineHeight: 1 }}>{stats.gigs}</div>
              </div>
            ) : null}

            {stats?.cities && stats.cities.length > 0 ? (
              <div style={{ padding: '24px 0', borderBottom: `1px solid ${s.border}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: stats.cities.length > 1 ? 10 : 0 }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: s.dimmer }}>Cities</div>
                  <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 'clamp(36px, 6vw, 56px)', fontWeight: 300, color: s.text, lineHeight: 1 }}>{stats.cities.length}</div>
                </div>
                {stats.cities.length > 0 && (
                  <div style={{ fontSize: 11, color: s.dimmer, textAlign: 'right' }}>{stats.cities.join(' · ')}</div>
                )}
              </div>
            ) : null}

            {stats?.boothHours ? (
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '24px 0', borderBottom: `1px solid ${s.border}` }}>
                <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: s.dimmer }}>Hours in booth</div>
                <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 'clamp(36px, 6vw, 56px)', fontWeight: 300, color: s.text, lineHeight: 1 }}>~{stats.boothHours}</div>
              </div>
            ) : null}

            {stats?.recentGigs && stats.recentGigs.length > 0 && isPublic ? (
              <div style={{ padding: '24px 0', borderBottom: `1px solid ${s.border}` }}>
                <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: s.dimmer, marginBottom: 14 }}>Recent shows</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {stats.recentGigs.map((g, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 12, color: s.text }}>{g.venue}</span>
                      <span style={{ fontSize: 10, color: s.dimmer }}>{g.location} · {new Date(g.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {stats?.topTracks && stats.topTracks.length > 0 ? (
              <div style={{ padding: '24px 0', borderBottom: `1px solid ${s.border}` }}>
                <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: s.dimmer, marginBottom: 14 }}>
                  {stats.topTracks.length === 1 ? 'Crowd favourite' : 'Crowd favourites'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {stats.topTracks.map((t, i) => (
                    <div key={i} style={{ fontSize: 12, color: i === 0 ? s.text : s.dim }}>{t}</div>
                  ))}
                </div>
              </div>
            ) : null}

            {stats?.bestGig && !isPublic ? (
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '24px 0', borderBottom: `1px solid ${s.border}`, gap: 24 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: s.dimmer, flexShrink: 0 }}>Best show</div>
                <div style={{ fontSize: 14, color: s.text, textAlign: 'right' }}>{stats.bestGig}</div>
              </div>
            ) : null}

            {stats?.posts && !isPublic ? (
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '24px 0', borderBottom: `1px solid ${s.border}` }}>
                <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: s.dimmer }}>Posts published</div>
                <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 'clamp(36px, 6vw, 56px)', fontWeight: 300, color: s.text, lineHeight: 1 }}>{stats.posts}</div>
              </div>
            ) : null}

            {stats?.revenue && !isPublic ? (
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '24px 0', borderBottom: `1px solid ${s.border}` }}>
                <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: s.dimmer }}>Invoiced</div>
                <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 300, color: s.text, lineHeight: 1 }}>
                  <BlurredAmount>{stats.currency}{Math.round(stats.revenue).toLocaleString()}</BlurredAmount>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* CTAs */}
        <div style={{ marginTop: 40, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isPublic ? (
            <>
              {bookingEmail && (
                <a
                  href={`mailto:${bookingEmail}?subject=Booking enquiry — ${artistName}`}
                  style={{ background: s.gold, color: '#050505', padding: '14px 28px', textDecoration: 'none', fontFamily: s.font, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}
                >
                  Booking enquiry →
                </a>
              )}
            </>
          ) : (
            <>
              {!stats?.empty && (
                <button
                  onClick={handleCopyText}
                  style={{ background: 'transparent', color: s.dimmer, border: `1px solid ${s.border}`, padding: '12px 24px', cursor: 'pointer', fontFamily: s.font, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' }}
                >
                  {copied ? 'Copied ✓' : 'Copy summary →'}
                </button>
              )}
              <button
                onClick={handleCopyShare}
                style={{ background: s.gold, color: '#050505', border: 'none', padding: '12px 24px', cursor: 'pointer', fontFamily: s.font, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}
              >
                {linkCopied ? 'Link copied ✓' : 'Share with promoter →'}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}

export default function WrapPage() {
  return (
    <Suspense fallback={
      <div style={{ background: '#050505', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <div style={{ color: '#909090', fontSize: 11, letterSpacing: '0.2em' }}>Loading...</div>
      </div>
    }>
      <WrapContent />
    </Suspense>
  )
}
