'use client'

import React, { useState, useEffect } from 'react'
import { SignalLabHeader } from './SignalLabHeader'
import { ScanPulse } from '@/components/ui/ScanPulse'

interface ScheduledPost {
  id: string
  platform: string
  caption: string
  format: string
  scheduled_at: string
  status: 'scheduled' | 'posted' | 'draft'
  gig_title?: string
  media_url?: string
  notes?: string
  featured_track?: string
}

interface Gig {
  id: string
  title: string
  venue: string
  location: string
  date: string
  time: string
  status: string
}

interface Release {
  id: string
  title: string
  type: string // single, ep, album
  release_date: string
  label?: string
}

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

const PLATFORM_COLOR: Record<string, string> = {
  instagram: '#b08d57', tiktok: '#3d6b4a', threads: '#6a7a9a', twitter: '#4a5a7a',
  Instagram: '#b08d57', TikTok: '#3d6b4a', Threads: '#6a7a9a', 'X / Twitter': '#4a5a7a',
}

const s = {
  bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border)',
  gold: 'var(--gold)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
  teal: 'var(--green)', purple: 'var(--purple)',
  font: 'var(--font-mono)',
}

export function BroadcastCalendar() {
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [gigs, setGigs] = useState<Gig[]>([])
  const [releases, setReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null)
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const [filterPlatform, setFilterPlatform] = useState('All')

  // Plan panel
  const [planOpen, setPlanOpen] = useState(false)
  const [planCount, setPlanCount] = useState(5)
  const [planPeriod, setPlanPeriod] = useState<'week' | 'month'>('week')
  const [planning, setPlanning] = useState(false)
  const [planResult, setPlanResult] = useState<any[]>([])

  // Import panel
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<any[]>([])
  const [importDrag, setImportDrag] = useState(false)

  // Performance data
  const [perfData, setPerfData] = useState<{
    topPosts: { artist_name: string; caption: string; likes: number; comments: number; engagement_score: number; media_type: string; taken_at: string }[]
    byPlatform: { instagram: { avg_engagement: number; post_count: number }; tiktok: { avg_engagement: number; post_count: number } }
    totalScanned: number
    lastScanned: string | null
  } | null>(null)

  useEffect(() => { loadAll(); loadPerf() }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadPosts(), loadGigs(), loadReleases()])
    setLoading(false)
  }

  async function loadPerf() {
    try {
      const res = await fetch('/api/trends')
      const data = await res.json()
      setPerfData(data)
    } catch {}
  }

  async function loadPosts() {
    try {
      const res = await fetch('/api/schedule')
      const data = await res.json()
      if (data.success && data.posts?.length > 0) setPosts(data.posts)
    } catch { setPosts([]) }
  }

  async function loadGigs() {
    try {
      const res = await fetch('/api/gigs')
      const data = await res.json()
      if (data.gigs) setGigs(data.gigs)
    } catch {}
  }

  async function loadReleases() {
    try {
      const res = await fetch('/api/releases')
      const data = await res.json()
      if (data.releases) setReleases(data.releases)
    } catch {}
  }

  // ── Date helpers ──────────────────────────────────────────────────────────

  const today = new Date()

  // Week view: Mon–Sun of current week + offset
  function getWeekStart(offset: number) {
    const d = new Date(today)
    d.setDate(today.getDate() - today.getDay() + 1 + offset * 7)
    d.setHours(0, 0, 0, 0)
    return d
  }

  // Month view: all days in current month + offset
  function getMonthDays(offset: number): Date[] {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1)
    const year = d.getFullYear()
    const month = d.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    return Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
  }

  function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  }

  function getPostsForDay(day: Date, storiesOnly = false) {
    return posts.filter(p => {
      if (filterPlatform !== 'All' && p.platform.toLowerCase() !== filterPlatform.toLowerCase()) return false
      const isStory = p.format === 'story'
      if (storiesOnly !== isStory) return false
      return isSameDay(new Date(p.scheduled_at), day)
    })
  }

  function getGigsForDay(day: Date) {
    return gigs.filter(g => g.date && isSameDay(new Date(g.date), day))
  }

  function getReleaseForDay(day: Date) {
    return releases.find(r => isSameDay(new Date(r.release_date), day))
  }

  // Days within N days before a release
  function getTeaseWindowForDay(day: Date): Release | null {
    for (const r of releases) {
      const rd = new Date(r.release_date)
      const diff = Math.floor((rd.getTime() - day.getTime()) / 86400000)
      if (diff > 0 && diff <= 7) return r
    }
    return null
  }

  function formatDate(d: Date) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  function formatPostTime(post: ScheduledPost) {
    return new Date(post.scheduled_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  // ── Content planning ──────────────────────────────────────────────────────

  async function generatePlan() {
    setPlanning(true)
    setPlanResult([])
    try {
      const res = await fetch('/api/content-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: planCount, period: planPeriod, weekOffset, monthOffset }),
      })
      const data = await res.json()
      if (data.posts) setPlanResult(data.posts)
    } catch {}
    setPlanning(false)
  }

  async function acceptPost(post: any) {
    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: post.platform || 'instagram',
          caption: post.caption,
          format: post.format || 'post',
          scheduled_at: post.scheduled_at,
          status: 'draft',
          notes: post.notes,
          featured_track: post.featured_track || null,
        }),
      })
      await loadPosts()
      setPlanResult(prev => prev.filter(p => p !== post))
    } catch {}
  }

  async function acceptAll() {
    await Promise.all(planResult.map(acceptPost))
    setPlanOpen(false)
  }

  // ── Screenshot import ─────────────────────────────────────────────────────

  async function handleImportFile(file: File) {
    setImporting(true)
    setImportResult([])
    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(',')[1]
        const mediaType = file.type || 'image/jpeg'
        const res = await fetch('/api/content-plan/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, mediaType }),
        })
        const data = await res.json()
        if (data.posts) setImportResult(data.posts)
        else setImportResult([])
        setImporting(false)
      }
      reader.readAsDataURL(file)
    } catch {
      setImporting(false)
    }
  }

  async function acceptImportedPost(post: any) {
    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: post.platform || 'Instagram',
          caption: post.caption,
          format: post.format || 'post',
          scheduled_at: post.scheduled_at,
          status: 'draft',
          notes: post.notes || null,
          featured_track: post.featured_track || null,
        }),
      })
      await loadPosts()
      setImportResult(prev => prev.filter(p => p !== post))
    } catch {}
  }

  async function acceptAllImported() {
    await Promise.all(importResult.map(acceptImportedPost))
    setImportOpen(false)
  }

  function ImportPanel() {
    return (
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: '420px',
        background: s.panel, borderLeft: `1px solid ${s.gold}40`,
        zIndex: 50, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '24px', borderBottom: `1px solid ${s.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '9px', letterSpacing: '0.22em', textTransform: 'uppercase', color: s.gold, marginBottom: '4px' }}>Broadcast Lab</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '18px', fontWeight: 700, color: s.text }}>Import rollout plan</div>
          </div>
          <button onClick={() => { setImportOpen(false); setImportResult([]) }} style={{ background: 'none', border: 'none', color: s.dim, fontSize: '18px', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {importResult.length === 0 && !importing && (
            <>
              <div style={{ fontSize: '11px', color: s.dimmer, marginBottom: '20px', lineHeight: '1.7' }}>
                Screenshot your Google Sheets, Notion, or any content plan. Claude will read the dates, platforms, and captions.
              </div>
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setImportDrag(true) }}
                onDragLeave={() => setImportDrag(false)}
                onDrop={e => { e.preventDefault(); setImportDrag(false); const f = e.dataTransfer.files[0]; if (f) handleImportFile(f) }}
                onClick={() => (document.getElementById('broadcast-import-file') as HTMLInputElement)?.click()}
                style={{
                  border: `2px dashed ${importDrag ? s.gold : s.border}`,
                  background: importDrag ? `${s.gold}08` : 'transparent',
                  padding: '40px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  marginBottom: '16px',
                }}>
                <div style={{ fontSize: '28px', marginBottom: '12px', opacity: 0.4 }}>↑</div>
                <div style={{ fontSize: '12px', color: s.dim, letterSpacing: '0.08em' }}>Drop screenshot here or click to upload</div>
                <div style={{ fontSize: '10px', color: s.dimmer, marginTop: '6px' }}>PNG, JPG — Google Sheets, Notion, any format</div>
                <input id="broadcast-import-file" type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }} />
              </div>
            </>
          )}

          {importing && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: '11px', color: s.dim, letterSpacing: '0.1em' }}>Reading your plan...</div>
              <div style={{ marginTop: '16px', fontSize: '9px', color: s.dimmer }}>Claude is parsing dates, platforms, and captions</div>
            </div>
          )}

          {importResult.length > 0 && (
            <>
              <div style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.gold, marginBottom: '16px' }}>
                {importResult.length} post{importResult.length !== 1 ? 's' : ''} found
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {importResult.map((post, i) => (
                  <div key={i} style={{ background: '#1a1917', border: `1px solid ${PLATFORM_COLOR[post.platform] || s.gold}30`, borderLeft: `2px solid ${PLATFORM_COLOR[post.platform] || s.gold}`, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <div>
                        <span style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: PLATFORM_COLOR[post.platform] || s.gold }}>{post.platform}</span>
                        <span style={{ fontSize: '9px', color: s.dimmer, marginLeft: '8px' }}>{post.format}</span>
                      </div>
                      <span style={{ fontSize: '9px', color: s.dimmer }}>{new Date(post.scheduled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: s.dim, lineHeight: '1.5', marginBottom: '8px' }}>{post.caption}</div>
                    {post.notes && <div style={{ fontSize: '10px', color: s.dimmer, fontStyle: 'italic', marginBottom: '8px' }}>{post.notes}</div>}
                    <button onClick={() => acceptImportedPost(post)} style={{
                      background: 'transparent', border: `1px solid ${PLATFORM_COLOR[post.platform] || s.gold}60`,
                      color: PLATFORM_COLOR[post.platform] || s.gold, fontFamily: s.font,
                      fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase',
                      padding: '5px 12px', cursor: 'pointer',
                    }}>Add to calendar →</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {importResult.length > 1 && (
          <div style={{ padding: '16px 24px', borderTop: `1px solid ${s.border}` }}>
            <button onClick={acceptAllImported} style={{
              width: '100%', fontFamily: s.font, fontSize: '10px', letterSpacing: '0.18em',
              textTransform: 'uppercase', padding: '12px', background: s.gold,
              color: '#070706', border: 'none', cursor: 'pointer',
            }}>
              Accept all {importResult.length} posts →
            </button>
          </div>
        )}

        {importResult.length > 0 && (
          <div style={{ padding: importResult.length > 1 ? '0 24px 16px' : '16px 24px', borderTop: importResult.length <= 1 ? `1px solid ${s.border}` : 'none' }}>
            <button onClick={() => setImportResult([])} style={{
              width: '100%', fontFamily: s.font, fontSize: '10px', letterSpacing: '0.14em',
              textTransform: 'uppercase', padding: '10px', background: 'transparent',
              color: s.dimmer, border: `1px solid ${s.border}`, cursor: 'pointer',
            }}>
              Upload different screenshot
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function PostChip({ post }: { post: ScheduledPost }) {
    const color = PLATFORM_COLOR[post.platform] || s.gold
    return (
      <div onClick={(e) => { e.stopPropagation(); setSelectedPost(post) }}
        style={{
          background: '#1a1917', border: `1px solid ${color}30`,
          borderLeft: `2px solid ${color}`,
          padding: '5px 7px', cursor: 'pointer',
          opacity: post.status === 'posted' ? 0.45 : 1,
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span style={{ fontSize: '9px', letterSpacing: '0.12em', color, textTransform: 'uppercase' }}>{post.platform.split(' ')[0].split('/')[0].trim()}</span>
          <span style={{ fontSize: '9px', color: s.dimmer }}>{formatPostTime(post)}</span>
        </div>
        <div style={{ fontSize: '11px', color: s.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{post.caption}</div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '3px', alignItems: 'center' }}>
          <span style={{ fontSize: '9px', color: s.dimmer, textTransform: 'uppercase' }}>{post.format}</span>
          {post.featured_track && <span style={{ fontSize: '9px', color: s.teal }}>♪ {post.featured_track}</span>}
          <span style={{ marginLeft: 'auto', fontSize: '9px', color: post.status === 'posted' ? s.teal : post.status === 'draft' ? s.dimmer : s.gold, textTransform: 'uppercase' }}>{post.status}</span>
        </div>
      </div>
    )
  }

  function StoryDot({ day }: { day: Date }) {
    const stories = getPostsForDay(day, true)
    const hasStory = stories.length > 0
    return (
      <div onClick={() => stories[0] && setSelectedPost(stories[0])}
        title={hasStory ? stories[0].caption : 'No story planned'}
        style={{
          width: '22px', height: '22px', borderRadius: '50%',
          border: `1.5px solid ${hasStory ? s.gold : s.border}`,
          background: hasStory ? `${s.gold}15` : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: hasStory ? 'pointer' : 'default',
          flexShrink: 0,
        }}>
        <span style={{ fontSize: '9px', color: hasStory ? s.gold : s.dimmer }}>{hasStory ? '●' : '○'}</span>
      </div>
    )
  }

  function DayCell({ day, compact = false }: { day: Date; compact?: boolean }) {
    const isToday = isSameDay(day, today)
    const dayPosts = getPostsForDay(day)
    const dayGigs = getGigsForDay(day)
    const release = getReleaseForDay(day)
    const teaseWindow = !release ? getTeaseWindowForDay(day) : null
    const minH = compact ? '130px' : '180px'

    return (
      <div style={{
        background: s.panel,
        border: `1px solid ${isToday ? s.gold + '50' : release ? s.purple + '50' : teaseWindow ? s.purple + '25' : s.border}`,
        minHeight: minH,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: compact ? '7px 9px' : '9px 11px',
          borderBottom: `1px solid ${s.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: release ? `${s.purple}18` : teaseWindow ? `${s.purple}08` : 'transparent',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {!compact && <span style={{ fontSize: '9px', letterSpacing: '0.2em', color: isToday ? s.gold : s.dimmer, textTransform: 'uppercase' }}>
              {day.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}
            </span>}
            <span style={{ fontSize: compact ? '11px' : '12px', color: isToday ? s.gold : s.dim }}>{day.getDate()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <StoryDot day={day} />
            {release && <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: s.purple, textTransform: 'uppercase', background: `${s.purple}20`, padding: '2px 5px' }}>OUT</span>}
            {teaseWindow && !release && <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: s.purple + 'aa', textTransform: 'uppercase' }}>↑ tease</span>}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '5px', display: 'flex', flexDirection: 'column', gap: '3px', overflow: 'hidden' }}>
          {release && (
            <div style={{ background: `${s.purple}20`, border: `1px solid ${s.purple}40`, borderLeft: `2px solid ${s.purple}`, padding: '4px 7px' }}>
              <div style={{ fontSize: '9px', color: s.purple, textTransform: 'uppercase', letterSpacing: '0.1em' }}>RELEASE</div>
              <div style={{ fontSize: '10px', color: s.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{release.title}</div>
              <div style={{ fontSize: '9px', color: s.dimmer }}>{release.type}{release.label ? ` · ${release.label}` : ''}</div>
            </div>
          )}
          {dayGigs.map(gig => (
            <div key={gig.id} style={{ background: `${s.gold}08`, border: `1px solid ${s.gold}25`, borderLeft: `2px solid ${s.gold}`, padding: '4px 7px' }}>
              <div style={{ fontSize: '9px', color: s.gold, textTransform: 'uppercase', letterSpacing: '0.1em' }}>GIG</div>
              <div style={{ fontSize: '10px', color: s.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gig.title}</div>
              <div style={{ fontSize: '9px', color: s.dimmer }}>{gig.venue}</div>
            </div>
          ))}
          {dayPosts.slice(0, compact ? 2 : 4).map(post => (
            <PostChip key={post.id} post={post} />
          ))}
          {dayPosts.length > (compact ? 2 : 4) && (
            <div style={{ fontSize: '9px', color: s.dimmer, textAlign: 'center', padding: '3px' }}>+{dayPosts.length - (compact ? 2 : 4)} more</div>
          )}
        </div>
      </div>
    )
  }

  // ── Week view ─────────────────────────────────────────────────────────────

  function WeekView() {
    const weekStart = getWeekStart(weekOffset)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      return d
    })
    const weekLabel = `${formatDate(days[0])} — ${formatDate(days[6])}`

    return (
      <>
        {/* Stories lane header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.dimmer, width: '80px', flexShrink: 0 }}>Stories</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', flex: 1 }}>
            {days.map((day, i) => {
              const stories = getPostsForDay(day, true)
              const hasStory = stories.length > 0
              return (
                <div key={i} style={{
                  background: hasStory ? `${s.gold}10` : s.panel,
                  border: `1px solid ${hasStory ? s.gold + '40' : s.border}`,
                  padding: '6px 8px',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  cursor: hasStory ? 'pointer' : 'default',
                  minHeight: '34px',
                }}
                  onClick={() => stories[0] && setSelectedPost(stories[0])}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: `1.5px solid ${hasStory ? s.gold : s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '7px', color: hasStory ? s.gold : s.dimmer }}>{hasStory ? '●' : '○'}</span>
                  </div>
                  {hasStory
                    ? <span style={{ fontSize: '10px', color: s.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stories[0].caption.slice(0, 30)}</span>
                    : <span style={{ fontSize: '9px', color: s.dimmer }}>No story</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Main week grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {days.map((day, i) => <DayCell key={i} day={day} />)}
        </div>
      </>
    )
  }

  // ── Month view ────────────────────────────────────────────────────────────

  function MonthView() {
    const monthDays = getMonthDays(monthOffset)
    const firstDay = monthDays[0]
    // Pad to start on Monday
    const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1
    const paddedDays: (Date | null)[] = [...Array(startDow).fill(null), ...monthDays]
    while (paddedDays.length % 7 !== 0) paddedDays.push(null)

    const monthLabel = firstDay.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
          {DAYS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '9px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', padding: '6px 0' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
          {paddedDays.map((day, i) =>
            day ? <DayCell key={i} day={day} compact={true} /> : <div key={i} />
          )}
        </div>
      </>
    )
  }

  // ── Nav label ─────────────────────────────────────────────────────────────

  function navLabel() {
    if (viewMode === 'week') {
      const ws = getWeekStart(weekOffset)
      const we = new Date(ws); we.setDate(ws.getDate() + 6)
      return `${formatDate(ws)} — ${formatDate(we)}`
    }
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  }

  function navPrev() { viewMode === 'week' ? setWeekOffset(w => w - 1) : setMonthOffset(m => m - 1) }
  function navNext() { viewMode === 'week' ? setWeekOffset(w => w + 1) : setMonthOffset(m => m + 1) }
  function navToday() { setWeekOffset(0); setMonthOffset(0) }

  const totalScheduled = posts.filter(p => p.status === 'scheduled').length
  const totalDraft = posts.filter(p => p.status === 'draft').length
  const totalStories = posts.filter(p => p.format === 'story').length

  // ── Plan panel ────────────────────────────────────────────────────────────

  function PlanPanel() {
    return (
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: '380px',
        background: s.panel, borderLeft: `1px solid ${s.gold}40`,
        zIndex: 50, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '24px', borderBottom: `1px solid ${s.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '9px', letterSpacing: '0.22em', textTransform: 'uppercase', color: s.gold, marginBottom: '4px' }}>Broadcast Lab</div>
            <div className="font-['Unbounded'] text-lg font-bold tracking-tight" style={{ color: s.text }}>Plan content</div>
          </div>
          <button onClick={() => { setPlanOpen(false); setPlanResult([]) }} style={{ background: 'none', border: 'none', color: s.dim, fontSize: '18px', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${s.border}` }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '12px' }}>How many posts?</div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
            {[3, 5, 7, 10, 14].map(n => (
              <button key={n} onClick={() => setPlanCount(n)} style={{
                fontFamily: s.font, fontSize: '12px', padding: '7px 12px',
                background: planCount === n ? s.gold : 'transparent',
                color: planCount === n ? '#070706' : s.dim,
                border: `1px solid ${planCount === n ? s.gold : s.border}`,
                cursor: 'pointer',
              }}>{n}</button>
            ))}
          </div>
          <div style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '10px' }}>Period</div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
            {(['week', 'month'] as const).map(p => (
              <button key={p} onClick={() => setPlanPeriod(p)} style={{
                fontFamily: s.font, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px',
                background: planPeriod === p ? s.gold : 'transparent',
                color: planPeriod === p ? '#070706' : s.dim,
                border: `1px solid ${planPeriod === p ? s.gold : s.border}`,
                cursor: 'pointer',
              }}>{p}</button>
            ))}
          </div>
          <button onClick={generatePlan} disabled={planning} style={{
            width: '100%', fontFamily: s.font, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase',
            padding: '12px', background: s.gold, color: '#070706', border: 'none', cursor: planning ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            opacity: planning ? 0.7 : 1,
          }}>
            {planning && <ScanPulse size="sm" color="#070706" />}
            {planning ? 'Analysing your lane...' : `Suggest ${planCount} strongest posts`}
          </button>
          {!planning && planResult.length === 0 && (
            <div style={{ marginTop: '10px', fontSize: '10px', color: s.dimmer, lineHeight: '1.6' }}>
              Ranked by real engagement data from your lane — format, timing, voice patterns that actually performed.
            </div>
          )}
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {planResult.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: s.dim }}>{planResult.length} posts suggested</div>
                <button onClick={acceptAll} style={{ fontFamily: s.font, fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 12px', background: 'transparent', border: `1px solid ${s.gold}`, color: s.gold, cursor: 'pointer' }}>
                  Accept all →
                </button>
              </div>
              {planResult.map((post, i) => (
                <div key={i} style={{ background: '#141210', border: `1px solid ${s.border}`, borderLeft: `2px solid ${PLATFORM_COLOR[post.platform] || s.gold}`, padding: '12px 14px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '10px', color: PLATFORM_COLOR[post.platform] || s.gold, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{post.platform} · {post.format}</span>
                    <span style={{ fontSize: '10px', color: s.dimmer }}>{post.day}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: s.text, lineHeight: '1.5', marginBottom: '8px' }}>{post.caption}</div>
                  {post.featured_track && (
                    <div style={{ fontSize: '10px', color: s.teal, marginBottom: '6px' }}>♪ {post.featured_track}</div>
                  )}
                  {post.notes && (
                    <div style={{ fontSize: '10px', color: s.dimmer, borderLeft: `1px solid ${s.border}`, paddingLeft: '8px', marginBottom: '8px', lineHeight: '1.5', fontStyle: 'italic' }}>
                      {post.notes}
                    </div>
                  )}
                  <button onClick={() => acceptPost(post)} style={{ fontFamily: s.font, fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 10px', background: 'transparent', border: `1px solid ${s.border}`, color: s.dim, cursor: 'pointer', width: '100%' }}>
                    Add to calendar →
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <SignalLabHeader right={
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '10px', color: s.dim, letterSpacing: '0.08em', textAlign: 'right', lineHeight: '1.8' }}>
            <div>{totalScheduled} scheduled · {totalDraft} drafts · {totalStories} stories</div>
          </div>
          {/* View toggle */}
          <div style={{ display: 'flex', gap: '2px' }}>
            {(['week', 'month'] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                fontFamily: s.font, fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase',
                padding: '7px 13px', cursor: 'pointer',
                background: viewMode === v ? s.gold : 'transparent',
                border: `1px solid ${viewMode === v ? s.gold : s.border}`,
                color: viewMode === v ? '#070706' : s.dim,
              }}>{v}</button>
            ))}
          </div>
          {/* Nav */}
          <div style={{ display: 'flex', gap: '3px' }}>
            <button onClick={navPrev} style={{ background: s.panel, border: `1px solid ${s.border}`, color: s.dim, fontFamily: s.font, fontSize: '14px', padding: '7px 13px', cursor: 'pointer' }}>←</button>
            <button onClick={navToday} style={{ background: s.panel, border: `1px solid ${s.border}`, color: s.dim, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '7px 13px', cursor: 'pointer' }}>Today</button>
            <button onClick={navNext} style={{ background: s.panel, border: `1px solid ${s.border}`, color: s.dim, fontFamily: s.font, fontSize: '14px', padding: '7px 13px', cursor: 'pointer' }}>→</button>
          </div>
          {/* Import button */}
          <button onClick={() => { setImportOpen(true); setPlanOpen(false) }} style={{
            fontFamily: s.font, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase',
            padding: '8px 18px', background: 'transparent', color: s.gold, border: `1px solid ${s.gold}60`, cursor: 'pointer',
          }}>Import plan</button>
          {/* Plan button */}
          <button onClick={() => { setPlanOpen(true); setImportOpen(false) }} style={{
            fontFamily: s.font, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase',
            padding: '8px 18px', background: s.gold, color: '#070706', border: 'none', cursor: 'pointer',
          }}>Plan content</button>
        </div>
      } />

      <div style={{ padding: '28px', paddingRight: (planOpen || importOpen) ? '448px' : '28px', transition: 'padding-right 0.2s' }}>

        {/* Platform filter + nav label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.14em', color: s.dim, marginRight: '8px' }}>{navLabel()}</div>
          {['All', 'instagram', 'tiktok', 'threads'].map(p => (
            <button key={p} onClick={() => setFilterPlatform(p)} style={{
              fontFamily: s.font, fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase',
              padding: '5px 13px',
              background: filterPlatform === p ? s.panel : 'transparent',
              border: filterPlatform === p ? `1px solid ${PLATFORM_COLOR[p] || s.gold}` : `1px solid ${s.border}`,
              color: filterPlatform === p ? (PLATFORM_COLOR[p] || s.gold) : s.dimmer,
              cursor: 'pointer',
            }}>{p}</button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '9px', color: s.dimmer }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.purple, display: 'inline-block' }} /> Release
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.gold, display: 'inline-block', marginLeft: '6px' }} /> Gig
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.teal, display: 'inline-block', marginLeft: '6px' }} /> Story
          </div>
        </div>

        {viewMode === 'week' ? <WeekView /> : <MonthView />}

        {/* ── Recent Performance ─────────────────────────────────────────── */}
        {perfData && (
          <div style={{ marginTop: '32px', borderTop: `1px solid ${s.border}`, paddingTop: '20px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.22em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '12px' }}>
              Recent Performance
            </div>

            {/* Summary row */}
            <div style={{ fontSize: '10px', color: s.dim, letterSpacing: '0.06em', marginBottom: perfData.topPosts.length > 0 ? '16px' : 0 }}>
              {perfData.lastScanned
                ? (() => {
                    const days = Math.floor((Date.now() - new Date(perfData.lastScanned).getTime()) / 86400000)
                    return `Last scanned: ${days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`}`
                  })()
                : 'Not yet scanned'}
              {perfData.totalScanned > 0 && (
                <span style={{ color: s.dimmer }}> · {perfData.totalScanned} posts analysed</span>
              )}
              {perfData.topPosts.length > 0 && (
                <span style={{ color: s.gold }}> · Top: {perfData.topPosts[0].engagement_score} score</span>
              )}
            </div>

            {/* Top 3 post cards */}
            {perfData.topPosts.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {perfData.topPosts.slice(0, 3).map((post, i) => {
                  const isTikTok = String(post.media_type || '').toLowerCase().includes('tiktok')
                  const platformIcon = isTikTok ? '🎵' : '📸'
                  const scoreColor = post.engagement_score >= 500 ? s.gold : s.dim
                  return (
                    <div key={i} style={{
                      background: s.panel,
                      border: `1px solid ${s.border}`,
                      borderLeft: `2px solid ${post.engagement_score >= 500 ? s.gold : s.border}`,
                      padding: '10px 12px',
                      minWidth: '200px',
                      maxWidth: '260px',
                      flex: '1 1 200px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <span style={{ fontSize: '11px' }}>{platformIcon}</span>
                        <span style={{ fontSize: '11px', color: scoreColor, fontFamily: s.font, letterSpacing: '0.04em' }}>
                          {post.engagement_score}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: s.dim, lineHeight: '1.5', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {post.caption || '(no caption)'}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '9px', color: s.dimmer, letterSpacing: '0.06em' }}>
                        <span>♥ {post.likes}</span>
                        <span>💬 {post.comments}</span>
                        {post.media_type && <span style={{ textTransform: 'uppercase' }}>{post.media_type}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {perfData.totalScanned === 0 && (
              <div style={{ fontSize: '10px', color: s.dimmer, fontStyle: 'italic' }}>
                Scan reference artists in Signal Lab to see engagement data here.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Post detail panel */}
      {selectedPost && !planOpen && (
        <div style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: '360px',
          background: s.panel, borderLeft: `1px solid ${PLATFORM_COLOR[selectedPost.platform] || s.gold}`,
          zIndex: 50, padding: '28px', overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: PLATFORM_COLOR[selectedPost.platform] || s.gold, marginBottom: '6px' }}>
                {selectedPost.platform} · {selectedPost.format}
              </div>
              <div style={{ fontSize: '10px', color: s.dimmer }}>{new Date(selectedPost.scheduled_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {formatPostTime(selectedPost)}</div>
            </div>
            <button onClick={() => setSelectedPost(null)} style={{ background: 'none', border: 'none', color: s.dim, fontSize: '18px', cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ fontSize: '14px', color: s.text, lineHeight: '1.7', letterSpacing: '0.04em', marginBottom: '20px' }}>{selectedPost.caption}</div>
          {selectedPost.featured_track && (
            <div style={{ fontSize: '11px', color: s.teal, marginBottom: '12px' }}>♪ {selectedPost.featured_track}</div>
          )}
          {selectedPost.notes && (
            <div style={{ borderLeft: `2px solid ${s.border}`, paddingLeft: '12px', fontSize: '11px', color: s.dimmer, lineHeight: '1.6', fontStyle: 'italic', marginBottom: '20px' }}>
              {selectedPost.notes}
            </div>
          )}
          {selectedPost.gig_title && (
            <div style={{ fontSize: '10px', color: s.gold, marginBottom: '12px' }}>↳ {selectedPost.gig_title}</div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button onClick={() => window.location.href = '/broadcast'} style={{ flex: 1, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '10px', background: 'transparent', border: `1px solid ${s.gold}`, color: s.gold, cursor: 'pointer' }}>
              Edit
            </button>
            <button onClick={() => setSelectedPost(null)} style={{ fontFamily: s.font, fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '10px 14px', background: 'transparent', border: `1px solid ${s.border}`, color: s.dim, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        </div>
      )}

      {planOpen && <PlanPanel />}
      {importOpen && <ImportPanel />}

      {loading && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: 'rgba(14,13,11,0.96)', border: `1px solid ${s.border}`, padding: '12px 18px', fontSize: '11px', color: s.dim }}>
          Loading...
        </div>
      )}
    </div>
  )
}
