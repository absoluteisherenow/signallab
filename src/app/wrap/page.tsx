'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function WrapPage() {
  const year = new Date().getFullYear()
  const [loading, setLoading] = useState(true)
  const [artistName, setArtistName] = useState('')
  const [stats, setStats] = useState<{
    gigs: number
    cities: number
    boothHours: number | null
    topTrack: string | null
    posts: number
    revenue: number | null
    currency: string
    bestGig: string | null
    empty: boolean
  } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const yearStart = `${year}-01-01`
        const yearEnd = `${year}-12-31`

        // Artist name
        const { data: settings } = await supabase.from('artist_settings').select('artist_name').single()
        setArtistName(settings?.artist_name || 'Artist')

        // Gigs this year
        const { data: gigs } = await supabase
          .from('gigs')
          .select('venue, venue_city, slot_time, debrief_rating')
          .gte('date', yearStart)
          .lte('date', yearEnd)
          .neq('status', 'cancelled')
        const gigCount = gigs?.length || 0

        if (gigCount < 3) {
          setStats({ gigs: gigCount, cities: 0, boothHours: null, topTrack: null, posts: 0, revenue: null, currency: '£', bestGig: null, empty: true })
          setLoading(false)
          return
        }

        // Cities
        const cities = new Set(gigs?.map(g => g.venue_city || g.venue).filter(Boolean))
        const cityCount = cities.size

        // Booth hours — estimate from slot_time if available
        let boothHours: number | null = null
        const slotTimes = gigs?.map(g => g.slot_time).filter(Boolean) || []
        if (slotTimes.length > 0) {
          const totalMins = slotTimes.reduce((sum, slot) => {
            const match = slot?.match(/(\d+)\s*(?:hrs?|hours?|min)/i)
            if (match) {
              if (slot.toLowerCase().includes('min')) return sum + parseInt(match[1])
              return sum + parseInt(match[1]) * 60
            }
            // Try to parse "22:00-02:00" format
            const rangeMatch = slot?.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/)
            if (rangeMatch) {
              const startH = parseInt(rangeMatch[1]), startM = parseInt(rangeMatch[2])
              let endH = parseInt(rangeMatch[3]), endM = parseInt(rangeMatch[4])
              if (endH < startH) endH += 24
              return sum + (endH - startH) * 60 + (endM - startM)
            }
            return sum
          }, 0)
          if (totalMins > 0) boothHours = Math.round(totalMins / 60)
        }

        // Best gig by debrief rating
        const rated = gigs?.filter(g => g.debrief_rating) || []
        const bestGigRow = rated.sort((a, b) => (b.debrief_rating || 0) - (a.debrief_rating || 0))[0]
        const bestGig = bestGigRow?.venue || null

        // Top track by crowd_hits
        const { data: topTrackRow } = await supabase
          .from('dj_tracks')
          .select('title, artist, crowd_hits')
          .gt('crowd_hits', 0)
          .order('crowd_hits', { ascending: false })
          .limit(1)
          .single()
        const topTrack = topTrackRow ? `${topTrackRow.artist} — ${topTrackRow.title}` : null

        // Posts this year
        const { count: postCount } = await supabase
          .from('scheduled_posts')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', yearStart)
          .lte('created_at', yearEnd + 'T23:59:59')

        // Revenue this year
        const { data: invoices } = await supabase
          .from('invoices')
          .select('amount, currency')
          .gte('created_at', yearStart)
          .lte('created_at', yearEnd + 'T23:59:59')
        const currency = invoices?.[0]?.currency || '£'
        const revenue = invoices?.length ? invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0) : null

        setStats({
          gigs: gigCount,
          cities: cityCount,
          boothHours,
          topTrack,
          posts: postCount || 0,
          revenue,
          currency,
          bestGig,
          empty: false,
        })
      } catch {
        setStats(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [year])

  function shareText() {
    if (!stats) return ''
    const parts = [`Night Manoeuvres OS — ${year} Wrap:`]
    if (stats.gigs) parts.push(`${stats.gigs} gigs`)
    if (stats.cities > 1) parts.push(`${stats.cities} cities`)
    if (stats.posts) parts.push(`${stats.posts} posts`)
    return parts.join(', ') + `. @${artistName.toLowerCase().replace(/\s+/g, '')}`
  }

  function handleShare() {
    navigator.clipboard.writeText(shareText()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const s = {
    bg: '#070706', gold: '#c9a96e', text: '#f0ebe2', dim: '#8a8780',
    border: '#1a1917', font: "'DM Mono', monospace",
  }

  if (loading) {
    return (
      <div style={{ background: s.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: s.font }}>
        <div style={{ color: s.dim, fontSize: 11, letterSpacing: '0.2em' }}>Loading...</div>
      </div>
    )
  }

  if (stats?.empty) {
    return (
      <div style={{ background: s.bg, minHeight: '100vh', fontFamily: s.font, padding: '60px 40px', maxWidth: 600, margin: '0 auto' }}>
        <Link href="/dashboard" style={{ color: s.dim, fontSize: 10, letterSpacing: '0.2em', textDecoration: 'none', textTransform: 'uppercase' }}>← Back</Link>
        <div style={{ marginTop: 60, color: s.dim, fontSize: 14, lineHeight: 1.8 }}>
          You&apos;re just getting started — check back at the end of the year.
        </div>
        <div style={{ marginTop: 24 }}>
          <Link href="/gigs" style={{ color: s.gold, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', textDecoration: 'none' }}>Add your first gig →</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: s.bg, minHeight: '100vh', fontFamily: s.font, padding: '40px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <Link href="/dashboard" style={{ color: s.dim, fontSize: 10, letterSpacing: '0.2em', textDecoration: 'none', textTransform: 'uppercase' }}>← Back</Link>

        <div style={{ marginTop: 48, marginBottom: 56 }}>
          <div style={{ fontSize: 10, color: s.gold, letterSpacing: '0.35em', textTransform: 'uppercase', marginBottom: 12 }}>
            {artistName}
          </div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 300, lineHeight: 1.1, color: s.text }}>
            Your {year}<br /><span style={{ color: s.gold }}>in music.</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, borderTop: `1px solid ${s.border}` }}>
          {stats?.gigs ? (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '28px 0', borderBottom: `1px solid ${s.border}` }}>
              <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: s.dim }}>Shows played</div>
              <div style={{ fontSize: 'clamp(40px, 7vw, 64px)', fontFamily: "'Unbounded', sans-serif", fontWeight: 300, color: s.gold, lineHeight: 1 }}>{stats.gigs}</div>
            </div>
          ) : null}

          {(stats?.cities || 0) > 1 ? (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '28px 0', borderBottom: `1px solid ${s.border}` }}>
              <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: s.dim }}>Cities</div>
              <div style={{ fontSize: 'clamp(40px, 7vw, 64px)', fontFamily: "'Unbounded', sans-serif", fontWeight: 300, color: s.text, lineHeight: 1 }}>{stats.cities}</div>
            </div>
          ) : null}

          {stats?.boothHours ? (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '28px 0', borderBottom: `1px solid ${s.border}` }}>
              <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: s.dim }}>Hours in the booth</div>
              <div style={{ fontSize: 'clamp(40px, 7vw, 64px)', fontFamily: "'Unbounded', sans-serif", fontWeight: 300, color: s.text, lineHeight: 1 }}>~{stats.boothHours}</div>
            </div>
          ) : null}

          {stats?.topTrack ? (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '28px 0', borderBottom: `1px solid ${s.border}`, gap: 24 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: s.dim, flexShrink: 0 }}>Crowd favourite</div>
              <div style={{ fontSize: 16, color: s.text, textAlign: 'right' }}>{stats.topTrack}</div>
            </div>
          ) : null}

          {stats?.bestGig ? (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '28px 0', borderBottom: `1px solid ${s.border}`, gap: 24 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: s.dim, flexShrink: 0 }}>Best show</div>
              <div style={{ fontSize: 16, color: s.text, textAlign: 'right' }}>{stats.bestGig}</div>
            </div>
          ) : null}

          {stats?.posts ? (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '28px 0', borderBottom: `1px solid ${s.border}` }}>
              <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: s.dim }}>Posts created</div>
              <div style={{ fontSize: 'clamp(40px, 7vw, 64px)', fontFamily: "'Unbounded', sans-serif", fontWeight: 300, color: s.text, lineHeight: 1 }}>{stats.posts}</div>
            </div>
          ) : null}

          {stats?.revenue ? (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '28px 0', borderBottom: `1px solid ${s.border}` }}>
              <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: s.dim }}>Invoiced</div>
              <div style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontFamily: "'Unbounded', sans-serif", fontWeight: 300, color: s.text, lineHeight: 1 }}>
                {stats.currency}{Math.round(stats.revenue).toLocaleString()}
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 48, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={handleShare}
            style={{ background: s.gold, color: '#070706', border: 'none', padding: '14px 28px', cursor: 'pointer', fontFamily: s.font, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}
          >
            {copied ? 'Copied ✓' : 'Share wrap →'}
          </button>
          <Link
            href="/broadcast"
            style={{ background: 'transparent', color: s.dim, border: `1px solid ${s.border}`, padding: '14px 28px', textDecoration: 'none', fontFamily: s.font, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}
          >
            Plan {year + 1} →
          </Link>
        </div>
      </div>
    </div>
  )
}
