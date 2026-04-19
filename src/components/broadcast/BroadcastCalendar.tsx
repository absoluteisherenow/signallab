'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { SignalLabHeader } from './SignalLabHeader'
import { ScanPulse } from '@/components/ui/ScanPulse'
import { useGatedSend } from '@/lib/outbound'

interface ScheduledPost {
  id: string
  platform: string
  caption: string
  format: string
  scheduled_at: string
  // Status lifecycle:
  //   draft     — generated but not yet committed
  //   scheduled — in queue, awaiting user approval
  //   approved  — user has approved, cron will publish at scheduled_at
  //   posted    — successfully published
  //   failed    — cron tried to publish and errored (see error_message)
  status: 'draft' | 'scheduled' | 'approved' | 'posted' | 'failed'
  gig_title?: string
  media_url?: string
  media_urls?: string[]   // Carousel slides — when set with 2+ entries, publish route uses CAROUSEL flow
  notes?: string
  featured_track?: string
  error_message?: string
  approved_at?: string
  gig_id?: string
  // Comment-to-DM automation (created on publish)
  dm_enabled?: boolean
  dm_keyword?: string
  dm_message?: string
  dm_reward_url?: string
  dm_reward_type?: string
  dm_follow_required?: boolean
  dm_campaign_name?: string
  // Tagging extras (forwarded to platform APIs at publish time)
  collaborators?: string[]      // IG Collab post co-authors (usernames, no @)
  location_name?: string         // human-readable
  location_id?: string           // IG/FB Page ID for geo-tag
  user_tags?: Array<{ username: string; x?: number; y?: number }>
  hashtags?: string[]            // surfaced separately so we can append/strip cleanly
  first_comment?: string         // auto-posted as the first comment after publish
  cover_url?: string             // Reels custom cover
  thumb_offset?: number          // Reels thumbnail timestamp (ms)
  share_to_feed?: boolean        // Reels → also share to main feed
  alt_text?: string              // Accessibility
}

interface Gig {
  id: string
  title: string
  venue: string
  location: string
  date: string
  time: string
  status: string
  // Tag suggestion fields
  venue_handle?: string
  venue_location_id?: string
  promoter_handle?: string
  photographer_name?: string
  photographer_handle?: string
  lineup?: Array<{ name: string; handle?: string }>
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
  instagram: '#ff2a1a', tiktok: '#f2f2f2', threads: '#6a7a9a', twitter: '#4a5a7a',
  Instagram: '#ff2a1a', TikTok: '#f2f2f2', Threads: '#6a7a9a', 'X / Twitter': '#4a5a7a',
}

const s = {
  bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border)',
  gold: 'var(--gold)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
  teal: 'var(--green)', purple: 'var(--purple)',
  font: 'var(--font-mono)',
}

/** Live IG username search for collaborator field */
function CollabSearch({ onAdd, existing }: { onAdd: (username: string) => void; existing: string[] }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ username: string; full_name: string; profile_pic_url: string; followers: number; is_verified: boolean }>>([])
  const [searching, setSearching] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder="Search Instagram username..."
        value={query}
        onChange={e => {
          const v = e.target.value.replace(/^@/, '')
          setQuery(v)
          if (timer.current) clearTimeout(timer.current)
          if (v.length < 2) { setResults([]); setSearching(false); return }
          setSearching(true)
          timer.current = setTimeout(async () => {
            try {
              const res = await fetch(`/api/ig-lookup?q=${encodeURIComponent(v)}`)
              const data = await res.json()
              setResults(data.results || [])
            } catch { setResults([]) }
            setSearching(false)
          }, 600)
        }}
        style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none' }}
      />
      {searching && (
        <div style={{ position: 'absolute', right: '8px', top: '8px', fontSize: '12px', color: s.dimmer }}>searching...</div>
      )}
      {results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: s.panel, border: `1px solid ${s.border}`, zIndex: 10 }}>
          {results.map((r, i) => {
            const already = existing.some(c => c.toLowerCase() === r.username.toLowerCase())
            return (
              <button
                key={i}
                onClick={() => {
                  if (!already) onAdd(r.username)
                  setQuery('')
                  setResults([])
                }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                  background: 'transparent', border: 'none', borderBottom: `1px solid ${s.border}`,
                  color: already ? s.dimmer : s.text, cursor: already ? 'default' : 'pointer', textAlign: 'left',
                }}
              >
                {r.profile_pic_url && (
                  <img src={r.profile_pic_url} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
                )}
                <div>
                  <div style={{ fontFamily: s.font, fontSize: '11px', fontWeight: 600 }}>
                    @{r.username} {r.is_verified && <span style={{ color: s.gold }}>✓</span>}
                    {already && <span style={{ color: s.teal, marginLeft: '6px', fontWeight: 400 }}>added</span>}
                  </div>
                  <div style={{ fontFamily: s.font, fontSize: '12px', color: s.dimmer }}>
                    {r.full_name}{r.followers > 0 ? ` · ${r.followers >= 1000 ? `${(r.followers / 1000).toFixed(1)}k` : r.followers} followers` : ''}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
      {query.length >= 2 && !searching && results.length === 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: s.panel, border: `1px solid ${s.border}`, padding: '10px 12px', zIndex: 10 }}>
          <div style={{ fontSize: '12px', color: s.dimmer }}>No business/creator account found for &ldquo;{query}&rdquo;</div>
          <div style={{ fontSize: '11px', color: s.dimmer, marginTop: '2px' }}>Only public business/creator profiles show up</div>
          <button
            onClick={() => { onAdd(query); setQuery(''); setResults([]) }}
            style={{ background: 'none', border: 'none', color: s.gold, fontFamily: s.font, fontSize: '12px', cursor: 'pointer', padding: '4px 0', marginTop: '4px' }}
          >
            + Add &ldquo;{query}&rdquo; anyway
          </button>
        </div>
      )}
    </div>
  )
}

export function BroadcastCalendar() {
  const gatedSend = useGatedSend()
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [gigs, setGigs] = useState<Gig[]>([])
  const [releases, setReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editDraft, setEditDraft] = useState<Partial<ScheduledPost>>({})
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const coverVideoRef = useRef<HTMLVideoElement>(null)
  const [coverDuration, setCoverDuration] = useState(0)
  const [draggedPostId, setDraggedPostId] = useState<string | null>(null)
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchWorking, setBatchWorking] = useState(false)
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const [filterPlatform, setFilterPlatform] = useState('All')
  const [focusedDate, setFocusedDate] = useState<string | null>(null)

  // ── Honour ?date=YYYY-MM-DD from URL (deep links from Today dashboard) ────
  const searchParams = useSearchParams()
  useEffect(() => {
    const raw = searchParams?.get('date')
    if (!raw) return
    const target = new Date(raw)
    if (isNaN(target.getTime())) return
    const now = new Date()
    // Monday-of-week for both dates
    const mondayOf = (d: Date) => {
      const x = new Date(d)
      x.setHours(0, 0, 0, 0)
      const day = x.getDay() || 7
      x.setDate(x.getDate() - day + 1)
      return x
    }
    const diffWeeks = Math.round((mondayOf(target).getTime() - mondayOf(now).getTime()) / (7 * 24 * 60 * 60 * 1000))
    const diffMonths = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
    setWeekOffset(diffWeeks)
    setMonthOffset(diffMonths)
    setFocusedDate(raw)
  }, [searchParams])

  // Plan panel
  const [planOpen, setPlanOpen] = useState(false)
  const [planCount, setPlanCount] = useState(5)
  const [planPeriod, setPlanPeriod] = useState<'week' | 'month'>('week')
  const [planning, setPlanning] = useState(false)
  const [planResult, setPlanResult] = useState<any[]>([])
  const [planMeta, setPlanMeta] = useState<{ skippedFilledDates?: string[] } | null>(null)

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

  // Smart Ads suggestions
  const [adsSugg, setAdsSugg] = useState<{
    proven: any[]
    predicted: any[]
    median_score: number
    sample_size: number
    note?: string
  } | null>(null)

  useEffect(() => { loadAll(); loadPerf(); loadAdsSuggestions() }, [])

  async function loadAdsSuggestions() {
    try {
      const res = await fetch('/api/ads/suggestions')
      if (!res.ok) return
      const data = await res.json()
      setAdsSugg(data)
    } catch {}
  }

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadPosts(), loadGigs(), loadReleases()])
    setLoading(false)
  }

  async function loadPerf() {
    try {
      const res = await fetch('/api/trends')
      if (!res.ok) return
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('application/json')) return
      const data = await res.json()
      // Trends API returns { trends, postsAnalysed, artistsIncluded, ... }
      // Map into perfData shape for the calendar
      const trends = data.trends || []
      const topPosts = trends.slice(0, 3).map((t: any, i: number) => ({
        artist_name: (data.artistsIncluded || [])[0] || '',
        caption: t.context || t.name || '',
        likes: t.posts_supporting || 0,
        comments: 0,
        engagement_score: t.fit || 0,
        media_type: t.platform || 'instagram',
        taken_at: '',
      }))
      setPerfData({
        topPosts,
        byPlatform: { instagram: { avg_engagement: 0, post_count: data.postsAnalysed || 0 }, tiktok: { avg_engagement: 0, post_count: 0 } },
        totalScanned: data.postsAnalysed || 0,
        lastScanned: null,
      })
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
    return posts
      .filter(p => {
        if (filterPlatform !== 'All' && p.platform.toLowerCase() !== filterPlatform.toLowerCase()) return false
        const isStory = p.format === 'story'
        if (storiesOnly !== isStory) return false
        return isSameDay(new Date(p.scheduled_at), day)
      })
      // Time-of-day order — earliest first inside each day
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  }

  // Conflict detection: two non-story, non-posted posts on the same platform
  // scheduled within 2 hours of each other on the same day cannibalise reach.
  const CONFLICT_WINDOW_MS = 2 * 60 * 60 * 1000
  const conflictIds = React.useMemo(() => {
    const ids = new Set<string>()
    const eligible = posts.filter(p => p.format !== 'story' && p.status !== 'posted')
    for (let i = 0; i < eligible.length; i++) {
      for (let j = i + 1; j < eligible.length; j++) {
        const a = eligible[i], b = eligible[j]
        if (a.platform.toLowerCase() !== b.platform.toLowerCase()) continue
        const ta = new Date(a.scheduled_at).getTime()
        const tb = new Date(b.scheduled_at).getTime()
        if (!isSameDay(new Date(a.scheduled_at), new Date(b.scheduled_at))) continue
        if (Math.abs(ta - tb) < CONFLICT_WINDOW_MS) {
          ids.add(a.id)
          ids.add(b.id)
        }
      }
    }
    return ids
  }, [posts])

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
    setPlanMeta(null)
    try {
      const res = await fetch('/api/content-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: planCount, period: planPeriod, weekOffset, monthOffset }),
      })
      const data = await res.json()
      if (data.posts) setPlanResult(data.posts)
      if (data.meta) setPlanMeta(data.meta)
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

  // ── Batch operations ──────────────────────────────────────────────────────

  function clearSelection() { setSelectedIds(new Set()) }

  async function batchDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} post${selectedIds.size === 1 ? '' : 's'}? This cannot be undone.`)) return
    setBatchWorking(true)
    const ids = [...selectedIds]
    // Optimistic
    setPosts(prev => prev.filter(p => !selectedIds.has(p.id)))
    clearSelection()
    try {
      await Promise.all(ids.map(id => fetch('/api/schedule', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).catch(() => null)))
    } finally {
      await loadPosts()
      setBatchWorking(false)
    }
  }

  async function batchApprove() {
    if (selectedIds.size === 0) return
    setBatchWorking(true)
    const ids = [...selectedIds]
    setPosts(prev => prev.map(p => selectedIds.has(p.id) ? { ...p, status: 'approved', approved_at: new Date().toISOString() } : p))
    clearSelection()
    try {
      await Promise.all(ids.map(id => fetch('/api/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'approved', approved_at: new Date().toISOString() }),
      }).catch(() => null)))
    } finally {
      await loadPosts()
      setBatchWorking(false)
    }
  }

  async function batchShiftDays(days: number) {
    if (selectedIds.size === 0) return
    setBatchWorking(true)
    const ids = [...selectedIds]
    const updates = posts.filter(p => selectedIds.has(p.id)).map(p => {
      const d = new Date(p.scheduled_at)
      d.setDate(d.getDate() + days)
      return { id: p.id, scheduled_at: d.toISOString() }
    })
    setPosts(prev => prev.map(p => {
      const u = updates.find(x => x.id === p.id)
      return u ? { ...p, scheduled_at: u.scheduled_at } : p
    }))
    try {
      await Promise.all(updates.map(u => fetch('/api/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(u),
      }).catch(() => null)))
    } finally {
      await loadPosts()
      setBatchWorking(false)
    }
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
            <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: s.gold, marginBottom: '4px' }}>Broadcast Lab</div>
            <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '18px', fontWeight: 700, color: s.text }}>Import rollout plan</div>
          </div>
          <button onClick={() => { setImportOpen(false); setImportResult([]) }} style={{ background: 'none', border: 'none', color: s.dim, fontSize: '18px', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {importResult.length === 0 && !importing && (
            <>
              <div style={{ fontSize: '11px', color: s.dimmer, marginBottom: '20px', lineHeight: '1.7' }}>
                Screenshot your Google Sheets, Notion, or any content plan. We'll read the dates, platforms, and captions automatically.
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
                <div style={{ fontSize: '12px', color: s.dimmer, marginTop: '6px' }}>PNG, JPG — Google Sheets, Notion, any format</div>
                <input id="broadcast-import-file" type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }} />
              </div>
            </>
          )}

          {importing && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: '11px', color: s.dim, letterSpacing: '0.1em' }}>Reading your plan...</div>
              <div style={{ marginTop: '16px', fontSize: '11px', color: s.dimmer }}>Parsing dates, platforms, and captions</div>
            </div>
          )}

          {importResult.length > 0 && (
            <>
              <div style={{ fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.gold, marginBottom: '16px' }}>
                {importResult.length} post{importResult.length !== 1 ? 's' : ''} found
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {importResult.map((post, i) => (
                  <div key={i} style={{ background: '#1d1d1d', border: `1px solid ${PLATFORM_COLOR[post.platform] || s.gold}30`, borderLeft: `2px solid ${PLATFORM_COLOR[post.platform] || s.gold}`, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <div>
                        <span style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: PLATFORM_COLOR[post.platform] || s.gold }}>{post.platform}</span>
                        <span style={{ fontSize: '11px', color: s.dimmer, marginLeft: '8px' }}>{post.format}</span>
                      </div>
                      <span style={{ fontSize: '11px', color: s.dimmer }}>{new Date(post.scheduled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: s.dim, lineHeight: '1.5', marginBottom: '8px' }}>{post.caption}</div>
                    {post.notes && <div style={{ fontSize: '12px', color: s.dimmer, fontStyle: 'italic', marginBottom: '8px' }}>{post.notes}</div>}
                    <button onClick={() => acceptImportedPost(post)} style={{
                      background: 'transparent', border: `1px solid ${PLATFORM_COLOR[post.platform] || s.gold}60`,
                      color: PLATFORM_COLOR[post.platform] || s.gold, fontFamily: s.font,
                      fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase',
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
              width: '100%', fontFamily: s.font, fontSize: '12px', letterSpacing: '0.18em',
              textTransform: 'uppercase', padding: '12px', background: s.gold,
              color: '#050505', border: 'none', cursor: 'pointer',
            }}>
              Accept all {importResult.length} posts →
            </button>
          </div>
        )}

        {importResult.length > 0 && (
          <div style={{ padding: importResult.length > 1 ? '0 24px 16px' : '16px 24px', borderTop: importResult.length <= 1 ? `1px solid ${s.border}` : 'none' }}>
            <button onClick={() => setImportResult([])} style={{
              width: '100%', fontFamily: s.font, fontSize: '12px', letterSpacing: '0.14em',
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
    const isConflicting = conflictIds.has(post.id)
    const conflictColor = '#d97a3a' // amber, not destructive red
    return (
      <div
        draggable
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', post.id); setDraggedPostId(post.id) }}
        onDragEnd={() => { setDraggedPostId(null); setDropTargetDate(null) }}
        onClick={(e) => {
          e.stopPropagation()
          // Shift/Cmd/Ctrl click → toggle in multi-select; plain click → open detail
          if (e.shiftKey || e.metaKey || e.ctrlKey) {
            setSelectedIds(prev => {
              const next = new Set(prev)
              if (next.has(post.id)) next.delete(post.id)
              else next.add(post.id)
              return next
            })
          } else {
            setSelectedPost(post)
          }
        }}
        title={isConflicting ? `Scheduled within 2h of another ${post.platform} post — they may cannibalise each other's reach` : undefined}
        style={{
          background: selectedIds.has(post.id) ? `${s.gold}18` : '#1d1d1d',
          border: `1px solid ${selectedIds.has(post.id) ? s.gold : isConflicting ? conflictColor + '70' : color + '30'}`,
          borderLeft: `2px solid ${color}`,
          padding: '5px 7px', cursor: draggedPostId === post.id ? 'grabbing' : 'grab',
          opacity: draggedPostId === post.id ? 0.4 : post.status === 'posted' ? 0.45 : 1,
          overflow: 'hidden', minWidth: 0,
          transition: 'opacity 0.15s',
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
          <span style={{ fontSize: '11px', letterSpacing: '0.12em', color, textTransform: 'uppercase' }}>{post.platform.split(' ')[0].split('/')[0].trim()}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {isConflicting && <span style={{ fontSize: '11px', color: conflictColor }}>⚠</span>}
            <span style={{ fontSize: '11px', color: s.dimmer }}>{formatPostTime(post)}</span>
          </div>
        </div>
        <div style={{ fontSize: '11px', color: s.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{post.caption}</div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '3px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: s.dimmer, textTransform: 'uppercase' }}>{post.format}</span>
          {post.featured_track && <span style={{ fontSize: '11px', color: s.teal }}>♪ {post.featured_track}</span>}
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: post.status === 'posted' ? s.teal : post.status === 'draft' ? s.dimmer : s.gold, textTransform: 'uppercase' }}>{post.status}</span>
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
        <span style={{ fontSize: '11px', color: hasStory ? s.gold : s.dimmer }}>{hasStory ? '●' : '○'}</span>
      </div>
    )
  }

  async function handleDrop(day: Date, postId: string) {
    const post = posts.find(p => p.id === postId)
    if (!post) return
    // Keep original time, just move the date
    const orig = new Date(post.scheduled_at)
    const newDate = new Date(day)
    newDate.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds(), 0)
    const newScheduledAt = newDate.toISOString()
    // Optimistic update
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, scheduled_at: newScheduledAt } : p))
    if (selectedPost?.id === postId) setSelectedPost({ ...selectedPost, scheduled_at: newScheduledAt })
    try {
      await fetch('/api/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: postId, scheduled_at: newScheduledAt }),
      })
    } catch {}
  }

  function DayCell({ day, compact = false }: { day: Date; compact?: boolean }) {
    const isToday = isSameDay(day, today)
    const dayPosts = getPostsForDay(day)
    const dayGigs = getGigsForDay(day)
    const release = getReleaseForDay(day)
    const teaseWindow = !release ? getTeaseWindowForDay(day) : null
    const minH = compact ? '130px' : '180px'
    const dayKey = day.toISOString().split('T')[0]
    const isDropTarget = dropTargetDate === dayKey && draggedPostId !== null

    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDropTargetDate(dayKey) }}
        onDragLeave={() => setDropTargetDate(null)}
        onDrop={(e) => { e.preventDefault(); setDropTargetDate(null); const id = e.dataTransfer.getData('text/plain'); if (id) handleDrop(day, id) }}
        style={{
        background: isDropTarget ? `${s.gold}12` : s.panel,
        border: `1px solid ${isDropTarget ? s.gold + '80' : isToday ? s.gold + '50' : release ? s.purple + '50' : teaseWindow ? s.purple + '25' : s.border}`,
        minHeight: minH,
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        transition: 'background 0.15s, border-color 0.15s',
      }}>
        {/* Header */}
        <div style={{
          padding: compact ? '7px 9px' : '9px 11px',
          borderBottom: `1px solid ${s.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: release ? `${s.purple}18` : teaseWindow ? `${s.purple}08` : 'transparent',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {!compact && <span style={{ fontSize: '11px', letterSpacing: '0.2em', color: isToday ? s.gold : s.dimmer, textTransform: 'uppercase' }}>
              {day.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}
            </span>}
            <span style={{ fontSize: compact ? '11px' : '12px', color: isToday ? s.gold : s.dim }}>{day.getDate()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <StoryDot day={day} />
            {release && <span style={{ fontSize: '11px', letterSpacing: '0.1em', color: s.purple, textTransform: 'uppercase', background: `${s.purple}20`, padding: '2px 5px' }}>OUT</span>}
            {teaseWindow && !release && <span style={{ fontSize: '11px', letterSpacing: '0.1em', color: s.purple + 'aa', textTransform: 'uppercase' }}>↑ tease</span>}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '5px', display: 'flex', flexDirection: 'column', gap: '3px', overflow: 'hidden' }}>
          {release && (
            <div style={{ background: `${s.purple}20`, border: `1px solid ${s.purple}40`, borderLeft: `2px solid ${s.purple}`, padding: '4px 7px' }}>
              <div style={{ fontSize: '11px', color: s.purple, textTransform: 'uppercase', letterSpacing: '0.1em' }}>RELEASE</div>
              <div style={{ fontSize: '12px', color: s.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{release.title}</div>
              <div style={{ fontSize: '11px', color: s.dimmer }}>{release.type}{release.label ? ` · ${release.label}` : ''}</div>
            </div>
          )}
          {dayGigs.map(gig => (
            <div key={gig.id} style={{ background: `${s.gold}08`, border: `1px solid ${s.gold}25`, borderLeft: `2px solid ${s.gold}`, padding: '4px 7px' }}>
              <div style={{ fontSize: '11px', color: s.gold, textTransform: 'uppercase', letterSpacing: '0.1em' }}>GIG</div>
              <div style={{ fontSize: '12px', color: s.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gig.title}</div>
              <div style={{ fontSize: '11px', color: s.dimmer }}>{gig.venue}</div>
            </div>
          ))}
          {dayPosts.slice(0, compact ? 2 : 4).map(post => (
            <PostChip key={post.id} post={post} />
          ))}
          {dayPosts.length > (compact ? 2 : 4) && (
            <div style={{ fontSize: '11px', color: s.dimmer, textAlign: 'center', padding: '3px' }}>+{dayPosts.length - (compact ? 2 : 4)} more</div>
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
          <div style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.dimmer, width: '80px', flexShrink: 0 }}>Stories</div>
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
                    ? <span style={{ fontSize: '12px', color: s.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stories[0].caption.slice(0, 30)}</span>
                    : <span style={{ fontSize: '11px', color: s.dimmer }}>No story</span>}
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
            <div key={d} style={{ textAlign: 'center', fontSize: '11px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', padding: '6px 0' }}>{d}</div>
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
            <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: s.gold, marginBottom: '4px' }}>Broadcast Lab</div>
            <div className="font-['Helvetica Neue', Helvetica, Arial, sans-serif] text-lg font-bold tracking-tight" style={{ color: s.text }}>Plan content</div>
          </div>
          <button onClick={() => { setPlanOpen(false); setPlanResult([]) }} style={{ background: 'none', border: 'none', color: s.dim, fontSize: '18px', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${s.border}` }}>
          <div style={{ fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '12px' }}>How many posts?</div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
            {[3, 5, 7, 10, 14].map(n => (
              <button key={n} onClick={() => setPlanCount(n)} style={{
                fontFamily: s.font, fontSize: '12px', padding: '7px 12px',
                background: planCount === n ? s.gold : 'transparent',
                color: planCount === n ? '#050505' : s.dim,
                border: `1px solid ${planCount === n ? s.gold : s.border}`,
                cursor: 'pointer',
              }}>{n}</button>
            ))}
          </div>
          <div style={{ fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '10px' }}>Period</div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
            {(['week', 'month'] as const).map(p => (
              <button key={p} onClick={() => setPlanPeriod(p)} style={{
                fontFamily: s.font, fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px',
                background: planPeriod === p ? s.gold : 'transparent',
                color: planPeriod === p ? '#050505' : s.dim,
                border: `1px solid ${planPeriod === p ? s.gold : s.border}`,
                cursor: 'pointer',
              }}>{p}</button>
            ))}
          </div>
          <button onClick={generatePlan} disabled={planning} style={{
            width: '100%', fontFamily: s.font, fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase',
            padding: '12px', background: s.gold, color: '#050505', border: 'none', cursor: planning ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            opacity: planning ? 0.7 : 1,
          }}>
            {planning && <ScanPulse size="sm" color="#050505" />}
            {planning ? 'Analysing your lane...' : `Suggest ${planCount} strongest posts`}
          </button>
          {!planning && planResult.length === 0 && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: s.dimmer, lineHeight: '1.6' }}>
              Ranked by real engagement data from your lane — format, timing, voice patterns that actually performed.
            </div>
          )}
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {planResult.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: s.dim }}>
                  {planResult.length} posts suggested
                  {planMeta?.skippedFilledDates && planMeta.skippedFilledDates.length > 0 && (
                    <span style={{ color: s.dimmer, marginLeft: '10px', textTransform: 'none', letterSpacing: '0.04em' }}>
                      · skipped {planMeta.skippedFilledDates.length} day{planMeta.skippedFilledDates.length === 1 ? '' : 's'} already booked
                    </span>
                  )}
                </div>
                <button onClick={acceptAll} style={{ fontFamily: s.font, fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 12px', background: 'transparent', border: `1px solid ${s.gold}`, color: s.gold, cursor: 'pointer' }}>
                  Accept all →
                </button>
              </div>
              {planResult.map((post, i) => (
                <div key={i} style={{ background: '#141210', border: `1px solid ${s.border}`, borderLeft: `2px solid ${PLATFORM_COLOR[post.platform] || s.gold}`, padding: '12px 14px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: PLATFORM_COLOR[post.platform] || s.gold, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{post.platform} · {post.format}</span>
                    <span style={{ fontSize: '12px', color: s.dimmer }}>{post.day}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: s.text, lineHeight: '1.5', marginBottom: '8px' }}>{post.caption}</div>
                  {post.featured_track && (
                    <div style={{ fontSize: '12px', color: s.teal, marginBottom: '6px' }}>♪ {post.featured_track}</div>
                  )}
                  {post.notes && (
                    <div style={{ fontSize: '12px', color: s.dimmer, borderLeft: `1px solid ${s.border}`, paddingLeft: '8px', marginBottom: '8px', lineHeight: '1.5', fontStyle: 'italic' }}>
                      {post.notes}
                    </div>
                  )}
                  <button onClick={() => acceptPost(post)} style={{ fontFamily: s.font, fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 10px', background: 'transparent', border: `1px solid ${s.border}`, color: s.dim, cursor: 'pointer', width: '100%' }}>
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

      {/* Floating batch action bar — appears when posts are multi-selected */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: '#141210', border: `1px solid ${s.gold}80`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 24px rgba(255,42,26,0.15)',
          padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px',
          zIndex: 80, fontFamily: s.font,
        }}>
          <span style={{ fontSize: '12px', letterSpacing: '0.14em', color: s.gold, textTransform: 'uppercase' }}>
            {selectedIds.size} selected
          </span>
          <div style={{ width: '1px', height: '20px', background: s.border }} />
          <button disabled={batchWorking} onClick={() => batchShiftDays(-1)} title="Shift back 1 day" style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dim, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 10px', cursor: 'pointer' }}>← 1d</button>
          <button disabled={batchWorking} onClick={() => batchShiftDays(1)} title="Shift forward 1 day" style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dim, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 10px', cursor: 'pointer' }}>1d →</button>
          <button disabled={batchWorking} onClick={() => batchShiftDays(7)} title="Shift forward 1 week" style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dim, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 10px', cursor: 'pointer' }}>1w →</button>
          <div style={{ width: '1px', height: '20px', background: s.border }} />
          <button disabled={batchWorking} onClick={batchApprove} style={{ background: 'transparent', border: `1px solid ${s.gold}`, color: s.gold, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '6px 12px', cursor: 'pointer' }}>Approve</button>
          <button disabled={batchWorking} onClick={batchDelete} style={{ background: 'transparent', border: '1px solid #8a4a3a', color: '#c97a5a', fontFamily: s.font, fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '6px 12px', cursor: 'pointer' }}>Delete</button>
          <div style={{ width: '1px', height: '20px', background: s.border }} />
          <button onClick={clearSelection} title="Clear selection" style={{ background: 'transparent', border: 'none', color: s.dimmer, fontSize: '14px', cursor: 'pointer', padding: '0 4px' }}>×</button>
        </div>
      )}

      <SignalLabHeader right={
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '12px', color: s.dim, letterSpacing: '0.08em', textAlign: 'right', lineHeight: '1.8' }}>
            <div>{totalScheduled} scheduled · {totalDraft} drafts · {totalStories} stories</div>
          </div>
          {/* View toggle */}
          <div style={{ display: 'flex', gap: '2px' }}>
            {(['week', 'month'] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                height: '32px', padding: '0 14px', borderRadius: '2px',
                fontFamily: s.font, fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase',
                cursor: 'pointer', fontWeight: 400,
                background: viewMode === v ? 'rgba(255,42,26,0.15)' : 'transparent',
                border: viewMode === v ? '1px solid rgba(255,42,26,0.35)' : '1px solid rgba(255,255,255,0.25)',
                color: viewMode === v ? '#d4a843' : 'rgba(240,235,226,0.75)',
              }}>{v}</button>
            ))}
          </div>
          {/* Nav */}
          <div style={{ display: 'flex', gap: '3px' }}>
            <button onClick={navPrev} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '32px', padding: '0 12px', borderRadius: '2px', background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(240,235,226,0.75)', fontFamily: s.font, fontSize: '14px', cursor: 'pointer' }}>←</button>
            <button onClick={navToday} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '32px', padding: '0 14px', borderRadius: '2px', background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(240,235,226,0.75)', fontFamily: s.font, fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }}>Today</button>
            <button onClick={navNext} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '32px', padding: '0 12px', borderRadius: '2px', background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(240,235,226,0.75)', fontFamily: s.font, fontSize: '14px', cursor: 'pointer' }}>→</button>
          </div>
          {/* Import button */}
          <button onClick={() => { setImportOpen(true); setPlanOpen(false) }} style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            height: '32px', padding: '0 16px', borderRadius: '2px',
            fontFamily: s.font, fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase',
            background: 'transparent', color: 'rgba(240,235,226,0.75)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer',
          }}>Import plan</button>
          {/* Plan button */}
          <button onClick={() => { setPlanOpen(true); setImportOpen(false) }} style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            height: '32px', padding: '0 16px', borderRadius: '2px',
            fontFamily: s.font, fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase',
            background: 'rgba(255,42,26,0.15)', color: '#d4a843', border: '1px solid rgba(255,42,26,0.35)', cursor: 'pointer',
          }}>Plan content</button>
        </div>
      } />

      <div style={{ padding: '28px', paddingRight: (planOpen || importOpen) ? '448px' : '28px', transition: 'padding-right 0.2s' }}>

        {/* Month/week nav + platform filter */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={navPrev} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '32px', padding: '0 12px', borderRadius: '2px', background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(240,235,226,0.75)', fontFamily: s.font, fontSize: '16px', cursor: 'pointer', lineHeight: 1 }}>←</button>
            <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '18px', fontWeight: 300, color: s.text, minWidth: '200px', textAlign: 'center' }}>
              {navLabel()}
            </div>
            <button onClick={navNext} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '32px', padding: '0 12px', borderRadius: '2px', background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(240,235,226,0.75)', fontFamily: s.font, fontSize: '16px', cursor: 'pointer', lineHeight: 1 }}>→</button>
            <button onClick={navToday} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '32px', padding: '0 14px', borderRadius: '2px', background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(240,235,226,0.75)', fontFamily: s.font, fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer', marginLeft: '4px' }}>Today</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {['All', 'instagram', 'tiktok', 'threads'].map(p => (
              <button key={p} onClick={() => setFilterPlatform(p)} style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                height: '28px', padding: '0 12px', borderRadius: '2px',
                fontFamily: s.font, fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase',
                background: filterPlatform === p ? 'rgba(255,42,26,0.12)' : 'transparent',
                border: filterPlatform === p ? `1px solid ${PLATFORM_COLOR[p] || 'rgba(255,42,26,0.35)'}` : '1px solid rgba(255,255,255,0.25)',
                color: filterPlatform === p ? (PLATFORM_COLOR[p] || '#d4a843') : 'rgba(240,235,226,0.7)',
                cursor: 'pointer',
              }}>{p}</button>
            ))}
            <div style={{ marginLeft: '12px', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '11px', color: s.dimmer }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.purple, display: 'inline-block' }} /> Release
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.gold, display: 'inline-block', marginLeft: '6px' }} /> Gig
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.teal, display: 'inline-block', marginLeft: '6px' }} /> Story
            </div>
          </div>
        </div>

        {viewMode === 'week' ? <WeekView /> : <MonthView />}

        {/* First-time empty state — surfaces when calendar is fully empty */}
        {!loading && posts.length === 0 && gigs.length === 0 && releases.length === 0 && (
          <div style={{ marginTop: '24px', background: s.panel, border: `1px dashed ${s.border}`, padding: '40px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.gold, marginBottom: '8px' }}>Your calendar is empty</div>
            <div style={{ fontSize: '12px', color: s.dimmer, marginBottom: '20px', maxWidth: '440px', margin: '0 auto 20px', lineHeight: '1.6' }}>
              Add gigs and releases in their respective tabs, or generate a content plan now from what you already have.
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button onClick={() => setPlanOpen(true)} style={{ background: 'rgba(255,42,26,0.15)', border: '1px solid rgba(255,42,26,0.35)', color: '#d4a843', fontFamily: s.font, fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '10px 18px', cursor: 'pointer' }}>
                Plan posts →
              </button>
              <button onClick={() => setImportOpen(true)} style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dim, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '10px 18px', cursor: 'pointer' }}>
                Import existing plan
              </button>
            </div>
          </div>
        )}

        {/* ── Smart Ads — boost suggestions ─────────────────────────────── */}
        {adsSugg && (adsSugg.proven.length > 0 || adsSugg.predicted.length > 0) && (
          <div style={{ marginTop: '32px', borderTop: `1px solid ${s.border}`, paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: s.gold }}>
                Smart Ads · boost candidates
              </div>
              <div style={{ fontSize: '12px', color: s.dimmer }}>
                Median engagement {adsSugg.median_score} · sampled {adsSugg.sample_size} posts
              </div>
            </div>

            {adsSugg.predicted.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', color: s.teal, marginBottom: '8px' }}>
                  ◇ Predicted winners — catch them while hot
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {adsSugg.predicted.map((p: any) => (
                    <div key={p.id} style={{ background: '#141210', border: `1px solid ${s.teal}40`, borderLeft: `2px solid ${s.teal}`, padding: '12px 14px', maxWidth: '300px', flex: '1 1 240px' }}>
                      <div style={{ fontSize: '11px', color: s.text, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: '8px' }}>
                        {p.caption || '(no caption)'}
                      </div>
                      <div style={{ fontSize: '12px', color: s.teal, marginBottom: '6px' }}>
                        ↗ {p.projected_vs_median}× median in 48h · {p.age_hours}h old
                      </div>
                      <div style={{ fontSize: '11px', color: s.dimmer, marginBottom: '8px', lineHeight: 1.5 }}>{p.why}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: '12px', color: s.gold }}>£{p.recommended_budget.gbp_low}–£{p.recommended_budget.gbp_high}</div>
                        {p.permalink && (
                          <a href={p.permalink} target="_blank" rel="noreferrer" style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.gold, textDecoration: 'none', border: `1px solid ${s.gold}`, padding: '4px 8px' }}>
                            Boost →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {adsSugg.proven.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', color: s.gold, marginBottom: '8px' }}>
                  ✓ Proven winners — extend organic reach
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {adsSugg.proven.map((p: any) => (
                    <div key={p.id} style={{ background: '#141210', border: `1px solid ${s.border}`, borderLeft: `2px solid ${s.gold}`, padding: '12px 14px', maxWidth: '300px', flex: '1 1 240px' }}>
                      <div style={{ fontSize: '11px', color: s.text, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: '8px' }}>
                        {p.caption || '(no caption)'}
                      </div>
                      <div style={{ fontSize: '12px', color: s.gold, marginBottom: '6px' }}>
                        {p.score_vs_median}× median · ♥ {p.likes} 💬 {p.comments} 🔖 {p.saves}
                      </div>
                      <div style={{ fontSize: '11px', color: s.dimmer, marginBottom: '8px', lineHeight: 1.5 }}>{p.why}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: '12px', color: s.gold }}>£{p.recommended_budget.gbp_low}–£{p.recommended_budget.gbp_high}</div>
                        {p.permalink && (
                          <a href={p.permalink} target="_blank" rel="noreferrer" style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.gold, textDecoration: 'none', border: `1px solid ${s.gold}`, padding: '4px 8px' }}>
                            Boost →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Recent Performance ─────────────────────────────────────────── */}
        {perfData && (
          <div style={{ marginTop: '32px', borderTop: `1px solid ${s.border}`, paddingTop: '20px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '12px' }}>
              Recent Performance
            </div>

            {/* Summary row */}
            <div style={{ fontSize: '12px', color: s.dim, letterSpacing: '0.06em', marginBottom: perfData.topPosts.length > 0 ? '16px' : 0 }}>
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
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '11px', color: s.dimmer, letterSpacing: '0.06em' }}>
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
              <div style={{ fontSize: '12px', color: s.dimmer, fontStyle: 'italic' }}>
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
              <div style={{ fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', color: PLATFORM_COLOR[selectedPost.platform] || s.gold, marginBottom: '6px' }}>
                {selectedPost.platform} · {selectedPost.format}
              </div>
              <div style={{ fontSize: '12px', color: s.dimmer }}>{new Date(selectedPost.scheduled_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {formatPostTime(selectedPost)}</div>
            </div>
            <button onClick={() => { setSelectedPost(null); setEditMode(false) }} style={{ background: 'none', border: 'none', color: s.dim, fontSize: '18px', cursor: 'pointer' }}>×</button>
          </div>
          {(() => {
            const st = selectedPost.status
            const map: Record<string, { label: string; color: string; bg: string }> = {
              draft:     { label: 'Draft',                color: '#9a8c6f', bg: 'rgba(154,140,111,0.10)' },
              scheduled: { label: 'Awaiting approval',    color: s.gold,    bg: 'rgba(255,42,26,0.12)'  },
              approved:  { label: 'Approved · queued',    color: '#3d6b4a', bg: 'rgba(61,107,74,0.14)'   },
              posted:    { label: 'Posted',               color: '#3d6b4a', bg: 'rgba(61,107,74,0.18)'   },
              failed:    { label: 'Failed',               color: '#b43c3c', bg: 'rgba(180,60,60,0.14)'   },
            }
            const m = map[st] || map.scheduled
            return (
              <div style={{ display: 'inline-block', padding: '6px 10px', background: m.bg, border: `1px solid ${m.color}`, color: m.color, fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '16px' }}>
                {m.label}
              </div>
            )
          })()}
          {selectedPost.status === 'failed' && selectedPost.error_message && (
            <div style={{ fontSize: '12px', color: '#b43c3c', marginBottom: '14px', lineHeight: '1.5' }}>↳ {selectedPost.error_message}</div>
          )}
          {editMode ? (
            <>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', color: s.dimmer, display: 'block', marginBottom: '4px' }}>Caption</label>
                <textarea
                  value={editDraft.caption || ''}
                  onChange={e => setEditDraft(d => ({ ...d, caption: e.target.value }))}
                  style={{ width: '100%', minHeight: '100px', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '13px', lineHeight: '1.7', padding: '10px', resize: 'vertical', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', color: s.dimmer, display: 'block', marginBottom: '4px' }}>Platform</label>
                  <select
                    value={editDraft.platform || 'instagram'}
                    onChange={e => setEditDraft(d => ({ ...d, platform: e.target.value }))}
                    style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none' }}
                  >
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                    <option value="threads">Threads</option>
                    <option value="twitter">X / Twitter</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', color: s.dimmer, display: 'block', marginBottom: '4px' }}>Format</label>
                  <select
                    value={editDraft.format || 'post'}
                    onChange={e => setEditDraft(d => ({ ...d, format: e.target.value }))}
                    style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none' }}
                  >
                    <option value="post">Post</option>
                    <option value="reel">Reel</option>
                    <option value="carousel">Carousel</option>
                    <option value="story">Story</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', color: s.dimmer, display: 'block', marginBottom: '4px' }}>Scheduled</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="date"
                    value={(() => { try { return (editDraft.scheduled_at || '').slice(0, 10) } catch { return '' } })()}
                    onChange={e => {
                      const prev = editDraft.scheduled_at ? new Date(editDraft.scheduled_at) : new Date()
                      const [y, m, d] = e.target.value.split('-').map(Number)
                      prev.setFullYear(y, m - 1, d)
                      setEditDraft(dr => ({ ...dr, scheduled_at: prev.toISOString() }))
                    }}
                    style={{ flex: 1, background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none' }}
                  />
                  <input
                    type="time"
                    value={(() => { try { const d = new Date(editDraft.scheduled_at || ''); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` } catch { return '12:00' } })()}
                    onChange={e => {
                      const prev = editDraft.scheduled_at ? new Date(editDraft.scheduled_at) : new Date()
                      const [h, min] = e.target.value.split(':').map(Number)
                      prev.setHours(h, min, 0, 0)
                      setEditDraft(dr => ({ ...dr, scheduled_at: prev.toISOString() }))
                    }}
                    style={{ width: '100px', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none' }}
                  />
                </div>
              </div>

              {/* Linked gig + Suggested tags */}
              <div style={{ borderTop: `1px solid ${s.border}`, paddingTop: '14px', marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '10px' }}>Linked gig</div>
                <select
                  value={editDraft.gig_id || ''}
                  onChange={e => setEditDraft(d => ({ ...d, gig_id: e.target.value || undefined }))}
                  style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none', marginBottom: '10px' }}
                >
                  <option value="">— None —</option>
                  {gigs.map(g => (
                    <option key={g.id} value={g.id}>{g.title} · {g.venue} · {new Date(g.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</option>
                  ))}
                </select>
                {(() => {
                  const linked = gigs.find(g => g.id === editDraft.gig_id)
                  if (!linked) return null
                  // Build candidate handles from gig
                  const collabSet = new Set((editDraft.collaborators || []).map(c => c.toLowerCase()))
                  const candidates: Array<{ label: string; handle: string; kind: string }> = []
                  if (linked.venue_handle) candidates.push({ label: 'Venue', handle: linked.venue_handle, kind: 'venue' })
                  if (linked.promoter_handle) candidates.push({ label: 'Promoter', handle: linked.promoter_handle, kind: 'promoter' })
                  if (linked.photographer_handle) candidates.push({ label: linked.photographer_name || 'Photographer', handle: linked.photographer_handle, kind: 'photographer' })
                  if (Array.isArray(linked.lineup)) {
                    linked.lineup.filter(l => l.handle).forEach(l => candidates.push({ label: l.name, handle: l.handle!, kind: 'lineup' }))
                  }
                  return (
                    <div style={{ background: 'rgba(255,42,26,0.06)', border: `1px solid ${s.border}`, padding: '12px' }}>
                      <div style={{ fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', color: s.gold, marginBottom: '8px' }}>Suggested · one click to add</div>
                      {candidates.length === 0 && (
                        <div style={{ fontSize: '12px', color: s.dimmer, fontStyle: 'italic' }}>
                          No tag suggestions for this gig yet. Add venue / photographer / lineup handles on the gig page.
                        </div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                        {candidates.map((c, i) => {
                          const already = collabSet.has(c.handle.toLowerCase())
                          return (
                            <button
                              key={i}
                              onClick={() => {
                                if (already) return
                                setEditDraft(d => ({ ...d, collaborators: [...(d.collaborators || []), c.handle] }))
                              }}
                              style={{
                                background: already ? 'rgba(61,107,74,0.18)' : 'transparent',
                                border: `1px solid ${already ? s.teal : s.gold + '60'}`,
                                color: already ? s.teal : s.text,
                                fontFamily: s.font, fontSize: '12px',
                                padding: '5px 9px', cursor: already ? 'default' : 'pointer',
                                letterSpacing: '0.04em',
                              }}
                            >
                              {already ? '✓ ' : '+ '}@{c.handle} <span style={{ color: s.dimmer }}>· {c.kind}</span>
                            </button>
                          )
                        })}
                      </div>
                      {(linked.venue || linked.venue_location_id) && (
                        <button
                          onClick={() => setEditDraft(d => ({
                            ...d,
                            location_name: linked.venue + (linked.location ? `, ${linked.location}` : ''),
                            location_id: linked.venue_location_id || d.location_id,
                          }))}
                          style={{
                            background: 'transparent', border: `1px solid ${s.gold}60`, color: s.text,
                            fontFamily: s.font, fontSize: '12px', padding: '5px 9px', cursor: 'pointer', letterSpacing: '0.04em',
                          }}
                        >
                          ⟟ Use venue location: {linked.venue}
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Tagging block */}
              <div style={{ borderTop: `1px solid ${s.border}`, paddingTop: '14px', marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '10px' }}>Tags & Extras</div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, display: 'block', marginBottom: '4px' }}>Collaborators (IG Collab post)</label>
                  {/* Added collabs as chips */}
                  {(editDraft.collaborators || []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                      {(editDraft.collaborators || []).map((c, i) => (
                        <span key={i} style={{
                          background: 'rgba(61,107,74,0.18)', border: `1px solid ${s.teal}`, color: s.teal,
                          fontFamily: s.font, fontSize: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: '6px',
                        }}>
                          @{c}
                          <button
                            onClick={() => setEditDraft(d => ({ ...d, collaborators: (d.collaborators || []).filter((_, j) => j !== i) }))}
                            style={{ background: 'none', border: 'none', color: s.teal, cursor: 'pointer', fontSize: '12px', padding: 0, lineHeight: 1 }}
                          >×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Live search input */}
                  {(editDraft.collaborators || []).length < 3 && (
                    <CollabSearch
                      existing={editDraft.collaborators || []}
                      onAdd={(username) => setEditDraft(d => ({ ...d, collaborators: [...(d.collaborators || []), username] }))}
                    />
                  )}
                  <div style={{ fontSize: '11px', color: s.dimmer, marginTop: '4px' }}>Up to 3. Promoters, photographers, labels — they get a notification + co-author byline.</div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, display: 'block', marginBottom: '4px' }}>Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Phonox, London"
                    value={editDraft.location_name || ''}
                    onChange={e => setEditDraft(d => ({ ...d, location_name: e.target.value }))}
                    style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none', marginBottom: '4px' }}
                  />
                  <input
                    type="text"
                    placeholder="FB Page ID (optional — geo-tag)"
                    value={editDraft.location_id || ''}
                    onChange={e => setEditDraft(d => ({ ...d, location_id: e.target.value }))}
                    style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none' }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, display: 'block', marginBottom: '4px' }}>Hashtags</label>
                  <input
                    type="text"
                    placeholder="techno, london, underground"
                    value={(editDraft.hashtags || []).join(', ')}
                    onChange={e => setEditDraft(d => ({ ...d, hashtags: e.target.value.split(/[\s,]+/).map(x => x.trim().replace(/^#/, '')).filter(Boolean) }))}
                    style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none' }}
                  />
                  <div style={{ fontSize: '11px', color: s.dimmer, marginTop: '4px' }}>Stored separately so they can be auto-appended to caption or first comment.</div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, display: 'block', marginBottom: '4px' }}>First comment (auto-posted)</label>
                  <textarea
                    placeholder="hashtag dump or credits"
                    value={editDraft.first_comment || ''}
                    onChange={e => setEditDraft(d => ({ ...d, first_comment: e.target.value }))}
                    style={{ width: '100%', minHeight: '50px', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none', resize: 'vertical' }}
                  />
                </div>

                {(editDraft.format || '').toLowerCase() === 'reel' && (
                  <>
                    {/* Visual cover frame picker */}
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, display: 'block', marginBottom: '8px' }}>Cover frame</label>
                      {selectedPost?.media_url && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(selectedPost.media_url) ? (
                        <div style={{ background: s.bg, border: `1px solid ${s.border}`, padding: '10px' }}>
                          <video
                            ref={coverVideoRef}
                            src={selectedPost.media_url}
                            muted
                            playsInline
                            onLoadedMetadata={e => {
                              const v = e.currentTarget
                              setCoverDuration(v.duration)
                              if (editDraft.thumb_offset != null) v.currentTime = editDraft.thumb_offset / 1000
                            }}
                            style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', display: 'block', marginBottom: '8px', background: '#000' }}
                          />
                          <input
                            type="range"
                            min={0}
                            max={coverDuration || 1}
                            step={0.05}
                            value={editDraft.thumb_offset != null ? editDraft.thumb_offset / 1000 : 0}
                            onChange={e => {
                              const t = parseFloat(e.target.value)
                              if (coverVideoRef.current) coverVideoRef.current.currentTime = t
                              setEditDraft(d => ({ ...d, thumb_offset: Math.round(t * 1000) }))
                            }}
                            style={{ width: '100%', cursor: 'pointer', accentColor: s.gold }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                            <span style={{ fontSize: '11px', color: s.dim, fontFamily: s.font }}>
                              {(editDraft.thumb_offset != null ? editDraft.thumb_offset / 1000 : 0).toFixed(1)}s
                            </span>
                            <span style={{ fontSize: '11px', color: s.dimmer, fontFamily: s.font }}>
                              {coverDuration.toFixed(1)}s
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '11px', color: s.dimmer, fontFamily: s.font, padding: '12px', border: `1px dashed ${s.border}`, textAlign: 'center' }}>
                          No video attached. Upload a video to pick a cover frame.
                        </div>
                      )}
                    </div>

                    {/* Cover image URL override */}
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, display: 'block', marginBottom: '4px' }}>Cover image URL (override)</label>
                      <input
                        type="text"
                        placeholder="https://... (optional, overrides frame picker)"
                        value={editDraft.cover_url || ''}
                        onChange={e => setEditDraft(d => ({ ...d, cover_url: e.target.value }))}
                        style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none' }}
                      />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '12px', color: s.text, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={editDraft.share_to_feed !== false}
                          onChange={e => setEditDraft(d => ({ ...d, share_to_feed: e.target.checked }))}
                        />
                        Share to feed
                      </label>
                    </div>
                  </>
                )}

                <div style={{ marginBottom: '4px' }}>
                  <label style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, display: 'block', marginBottom: '4px' }}>Alt text (accessibility)</label>
                  <input
                    type="text"
                    placeholder="describe the image"
                    value={editDraft.alt_text || ''}
                    onChange={e => setEditDraft(d => ({ ...d, alt_text: e.target.value }))}
                    style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none' }}
                  />
                </div>
              </div>

              {/* Comment → DM automation */}
              <div style={{ borderTop: `1px solid ${s.border}`, paddingTop: '14px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editDraft.dm_enabled ? '6px' : '0' }}>
                  <div style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: editDraft.dm_enabled ? s.gold : s.dimmer }}>Comment → DM</div>
                  <button
                    onClick={() => setEditDraft(d => ({ ...d, dm_enabled: !d.dm_enabled }))}
                    style={{
                      width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', position: 'relative',
                      background: editDraft.dm_enabled ? s.gold : s.border, transition: 'background 0.2s',
                    }}
                  >
                    <div style={{
                      width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '2px',
                      left: editDraft.dm_enabled ? '18px' : '2px', transition: 'left 0.2s',
                    }} />
                  </button>
                </div>
                {editDraft.dm_enabled && <div style={{ fontSize: '12px', color: s.dimmer, marginBottom: '12px', lineHeight: 1.5 }}>
                  When someone comments your keyword, they automatically get a DM with your link. Activates the moment this post publishes.
                </div>}
                {!editDraft.dm_enabled && <div style={{ fontSize: '12px', color: s.dimmer, marginTop: '4px', marginBottom: '0' }}>Off</div>}

                {editDraft.dm_enabled && <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, display: 'block', marginBottom: '4px' }}>Trigger word</label>
                    <input
                      type="text"
                      placeholder="LINK"
                      value={editDraft.dm_keyword || ''}
                      onChange={e => setEditDraft(d => ({ ...d, dm_keyword: e.target.value }))}
                      style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, display: 'block', marginBottom: '4px' }}>Reward type</label>
                    <select
                      value={editDraft.dm_reward_type || 'download'}
                      onChange={e => setEditDraft(d => ({ ...d, dm_reward_type: e.target.value }))}
                      style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none' }}
                    >
                      {['download', 'stream', 'buy', 'tickets', 'presave', 'discount', 'other'].map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, display: 'block', marginBottom: '4px' }}>Reward URL</label>
                  <input
                    type="text"
                    placeholder="https://…"
                    value={editDraft.dm_reward_url || ''}
                    onChange={e => setEditDraft(d => ({ ...d, dm_reward_url: e.target.value }))}
                    style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none' }}
                  />
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, display: 'block', marginBottom: '4px' }}>DM message</label>
                  <textarea
                    placeholder="Here you go — link inside ↓"
                    value={editDraft.dm_message || ''}
                    onChange={e => setEditDraft(d => ({ ...d, dm_message: e.target.value }))}
                    style={{ width: '100%', minHeight: '60px', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px', outline: 'none', resize: 'vertical' }}
                  />
                </div>

                <label style={{ fontSize: '12px', color: s.text, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editDraft.dm_follow_required || false}
                    onChange={e => setEditDraft(d => ({ ...d, dm_follow_required: e.target.checked }))}
                  />
                  Require follow before sending DM
                </label>
                </>}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true)
                    try {
                      const res = await fetch('/api/schedule', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          id: selectedPost.id,
                          caption: editDraft.caption,
                          platform: editDraft.platform,
                          format: editDraft.format,
                          scheduled_at: editDraft.scheduled_at,
                          collaborators: editDraft.collaborators || [],
                          location_name: editDraft.location_name || null,
                          location_id: editDraft.location_id || null,
                          hashtags: editDraft.hashtags || [],
                          first_comment: editDraft.first_comment || null,
                          cover_url: editDraft.cover_url || null,
                          thumb_offset: editDraft.thumb_offset ?? null,
                          share_to_feed: editDraft.share_to_feed !== false,
                          alt_text: editDraft.alt_text || null,
                          gig_id: editDraft.gig_id || null,
                          dm_keyword: editDraft.dm_keyword || null,
                          dm_message: editDraft.dm_message || null,
                          dm_reward_url: editDraft.dm_reward_url || null,
                          dm_reward_type: editDraft.dm_reward_type || null,
                          dm_follow_required: editDraft.dm_follow_required || false,
                          dm_campaign_name: editDraft.dm_campaign_name || null,
                        }),
                      })
                      const result = await res.json()
                      if (result.success && result.post) {
                        setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, ...result.post } : p))
                        setSelectedPost({ ...selectedPost, ...result.post })
                        setEditMode(false)
                      }
                    } catch {} finally { setSaving(false) }
                  }}
                  style={{ flex: 1, fontFamily: s.font, fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '10px', background: s.gold, border: 'none', color: s.bg, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.5 : 1 }}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  style={{ fontFamily: s.font, fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '10px 14px', background: 'transparent', border: `1px solid ${s.border}`, color: s.dim, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '14px', color: s.text, lineHeight: '1.7', letterSpacing: '0.04em', marginBottom: '20px' }}>{selectedPost.caption}</div>

              {/* Media preview — video or image */}
              {selectedPost.media_url && (() => {
                const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(selectedPost.media_url)
                return (
                  <div style={{ marginBottom: '20px', borderRadius: '4px', overflow: 'hidden', border: `1px solid ${s.border}`, background: '#000' }}>
                    {isVideo ? (
                      <video
                        src={selectedPost.media_url}
                        controls
                        playsInline
                        preload="metadata"
                        style={{ width: '100%', maxHeight: '400px', display: 'block' }}
                        poster={selectedPost.cover_url || undefined}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selectedPost.media_url} alt="Post media" style={{ width: '100%', display: 'block' }} />
                    )}
                  </div>
                )
              })()}

              {/* Carousel preview — when 2+ slides, show badge + horizontally scrolling thumb strip */}
              {selectedPost.media_urls && selectedPost.media_urls.length >= 2 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{
                      fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase',
                      padding: '3px 8px', background: s.gold, color: s.bg, fontWeight: 600,
                    }}>
                      Carousel · {selectedPost.media_urls.length} slides
                    </span>
                  </div>
                  <div style={{
                    display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px',
                    scrollbarWidth: 'thin',
                  }}>
                    {selectedPost.media_urls.map((url, i) => {
                      const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)
                      return (
                        <div key={i} style={{ position: 'relative', flex: '0 0 auto' }}>
                          <div style={{
                            width: '64px', height: '80px', background: '#0a0a0a',
                            border: `1px solid ${s.border}`, overflow: 'hidden',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {isVideo ? (
                              <div style={{ fontSize: '20px', color: s.dimmer }}>▶</div>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={url} alt={`slide ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            )}
                          </div>
                          <div style={{
                            position: 'absolute', top: '2px', left: '2px',
                            background: 'rgba(0,0,0,0.7)', color: s.text,
                            fontSize: '11px', padding: '1px 4px', letterSpacing: '0.08em',
                          }}>{i + 1}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {selectedPost.featured_track && (
                <div style={{ fontSize: '11px', color: s.teal, marginBottom: '12px' }}>♪ {selectedPost.featured_track}</div>
              )}
              {selectedPost.notes && (
                <div style={{ borderLeft: `2px solid ${s.border}`, paddingLeft: '12px', fontSize: '11px', color: s.dimmer, lineHeight: '1.6', fontStyle: 'italic', marginBottom: '20px' }}>
                  {selectedPost.notes}
                </div>
              )}
              {selectedPost.gig_title && (
                <div style={{ fontSize: '12px', color: s.gold, marginBottom: '12px' }}>↳ {selectedPost.gig_title}</div>
              )}
              {/* Tagging summary */}
              {(selectedPost.collaborators?.length || selectedPost.location_name || selectedPost.hashtags?.length || selectedPost.first_comment || selectedPost.cover_url || selectedPost.user_tags?.length) && (
                <div style={{ borderTop: `1px solid ${s.border}`, paddingTop: '14px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '8px' }}>Tags & Extras</div>
                  {selectedPost.collaborators?.length ? (
                    <div style={{ fontSize: '11px', color: s.text, marginBottom: '6px' }}>
                      <span style={{ color: s.dimmer }}>Collab · </span>{selectedPost.collaborators.map(c => `@${c}`).join(', ')}
                    </div>
                  ) : null}
                  {selectedPost.location_name && (
                    <div style={{ fontSize: '11px', color: s.text, marginBottom: '6px' }}>
                      <span style={{ color: s.dimmer }}>Location · </span>{selectedPost.location_name}
                    </div>
                  )}
                  {selectedPost.user_tags?.length ? (
                    <div style={{ fontSize: '11px', color: s.text, marginBottom: '6px' }}>
                      <span style={{ color: s.dimmer }}>Tagged · </span>{selectedPost.user_tags.map(u => { const name = typeof u === 'string' ? u : (u.username || 'unknown'); return name.startsWith('@') ? name : `@${name}` }).join(', ')}
                    </div>
                  ) : null}
                  {selectedPost.hashtags?.length ? (
                    <div style={{ fontSize: '11px', color: s.teal, marginBottom: '6px', wordBreak: 'break-word' }}>
                      {selectedPost.hashtags.map(h => `#${h}`).join(' ')}
                    </div>
                  ) : null}
                  {selectedPost.first_comment && (
                    <div style={{ fontSize: '12px', color: s.dim, marginBottom: '6px', lineHeight: '1.5' }}>
                      <span style={{ color: s.dimmer }}>First comment · </span>{selectedPost.first_comment}
                    </div>
                  )}
                  {selectedPost.cover_url && (
                    <div style={{ fontSize: '12px', color: s.dim, marginBottom: '6px' }}>
                      <span style={{ color: s.dimmer }}>Cover set · </span>{selectedPost.thumb_offset != null ? `@${(selectedPost.thumb_offset/1000).toFixed(1)}s` : 'custom image'}
                    </div>
                  )}
                  {selectedPost.format?.toLowerCase() === 'reel' && (
                    <div style={{ fontSize: '12px', color: s.dimmer }}>
                      Share to feed: {selectedPost.share_to_feed === false ? 'no' : 'yes'}
                    </div>
                  )}
                </div>
              )}
              {selectedPost.dm_enabled && selectedPost.dm_keyword && selectedPost.dm_message && (
                <div style={{ borderTop: `1px solid ${s.border}`, paddingTop: '14px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.gold, marginBottom: '8px' }}>Comment → DM armed</div>
                  <div style={{ fontSize: '11px', color: s.text, marginBottom: '4px' }}>
                    Trigger: <span style={{ color: s.gold }}>"{selectedPost.dm_keyword}"</span>
                  </div>
                  <div style={{ fontSize: '12px', color: s.dim, marginBottom: '4px', lineHeight: 1.5 }}>{selectedPost.dm_message}</div>
                  {selectedPost.dm_reward_url && (
                    <div style={{ fontSize: '12px', color: s.dimmer, wordBreak: 'break-all' }}>↳ {selectedPost.dm_reward_url}</div>
                  )}
                  {selectedPost.dm_follow_required && (
                    <div style={{ fontSize: '11px', color: s.dimmer, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Requires follow</div>
                  )}
                </div>
              )}
              {/* Action buttons */}
              {/* Posted confirmation */}
              {selectedPost.status === 'posted' && (
                <div style={{ width: '100%', textAlign: 'center', padding: '14px', background: 'rgba(61,107,74,0.18)', border: '1px solid #3d6b4a', color: '#5aaa6a', fontSize: '12px', letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: s.font, fontWeight: 700, marginBottom: '8px' }}>
                  Published
                </div>
              )}
              {/* Post Now — publish immediately (only for unpublished posts) */}
              {selectedPost.status !== 'posted' && selectedPost.caption && (selectedPost.media_url || (selectedPost.media_urls && selectedPost.media_urls.length > 0)) && (
                <button
                  disabled={publishing}
                  onClick={async () => {
                    setPublishing(true)
                    try {
                      const p = selectedPost
                      const postId = p.id
                      const endpoint = p.platform === 'twitter' ? '/api/social/twitter/post'
                        : p.platform === 'tiktok' ? '/api/social/tiktok/post'
                        : p.platform === 'threads' ? '/api/buffer'
                        : '/api/social/instagram/post'
                      const mediaUrl = p.media_urls?.length ? p.media_urls[0] : p.media_url
                      const body = p.platform === 'twitter' ? { text: p.caption }
                        : p.platform === 'threads' ? { text: p.caption, media_urls: p.media_urls || [p.media_url], channels: ['threads'], post_format: p.format }
                        : p.platform === 'tiktok' ? { caption: p.caption, video_url: mediaUrl }
                        : {
                            caption: p.caption,
                            image_url: mediaUrl,
                            media_urls: p.media_urls,
                            format: p.format,
                            collaborators: p.collaborators,
                            location_id: p.location_id,
                            location_name: p.location_name,
                            user_tags: p.user_tags,
                            first_comment: p.first_comment,
                            hashtags: p.hashtags,
                            cover_url: p.cover_url,
                            thumb_offset: p.thumb_offset,
                            share_to_feed: p.share_to_feed !== false,
                          }
                      const platformLabel = p.platform === 'twitter' ? 'X / Twitter' : p.platform === 'tiktok' ? 'TikTok' : p.platform === 'threads' ? 'Threads' : 'Instagram'
                      const gateResult = await gatedSend<typeof body, { success?: boolean; post_id?: string; tweet_id?: string; publish_id?: string; id?: string; error?: string }>({
                        endpoint,
                        previewBody: body,
                        skipServerPreview: true,
                        buildConfig: () => ({
                          kind: 'post',
                          summary: `Publish to ${platformLabel}`,
                          platform: platformLabel,
                          text: p.caption,
                          media: p.media_urls?.length ? p.media_urls : (p.media_url ? [p.media_url] : []),
                        }),
                      })
                      if (!gateResult.confirmed) { setPublishing(false); return }
                      const result = gateResult.data
                      if (result && (result.success || result.post_id || result.tweet_id || result.publish_id)) {
                        // Mark as posted
                        await fetch('/api/schedule', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: postId, status: 'posted', platform_post_id: result.post_id || result.id || null }),
                        })
                        const posted = { ...p, status: 'posted' as const }
                        setPosts(prev => prev.map(pp => pp.id === postId ? { ...pp, status: 'posted' } : pp))
                        setSelectedPost(posted)
                      } else {
                        alert('Post failed: ' + (result?.error || gateResult.error || 'unknown error'))
                      }
                    } catch (err: any) {
                      alert('Post failed: ' + err.message)
                    } finally {
                      setPublishing(false)
                    }
                  }}
                  style={{ width: '100%', fontFamily: s.font, fontSize: '12px', letterSpacing: '0.16em', textTransform: 'uppercase', padding: '14px', background: s.gold, border: 'none', color: s.bg, cursor: publishing ? 'wait' : 'pointer', opacity: publishing ? 0.5 : 1, marginBottom: '8px', fontWeight: 700 }}
                >
                  {publishing ? 'Publishing...' : 'Post now'}
                </button>
              )}
              {/* Approve — for drafts and scheduled */}
              {(selectedPost.status === 'draft' || selectedPost.status === 'scheduled') && (
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/schedule', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: selectedPost.id, status: 'approved', approved_at: new Date().toISOString() }),
                      })
                      const result = await res.json()
                      if (result.success && result.post) {
                        setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, ...result.post } : p))
                        setSelectedPost({ ...selectedPost, ...result.post })
                      }
                    } catch {}
                  }}
                  style={{ width: '100%', fontFamily: s.font, fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '12px', background: 'transparent', border: `1px solid ${s.gold}`, color: s.gold, cursor: 'pointer', marginBottom: '8px' }}
                >
                  Approve for auto-posting
                </button>
              )}
              {selectedPost.status === 'approved' && (
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/schedule', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: selectedPost.id, status: 'scheduled', approved_at: null }),
                      })
                      const result = await res.json()
                      if (result.success && result.post) {
                        setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, ...result.post } : p))
                        setSelectedPost({ ...selectedPost, ...result.post })
                      }
                    } catch {}
                  }}
                  style={{ width: '100%', fontFamily: s.font, fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '10px', background: 'transparent', border: `1px solid ${s.border}`, color: s.dim, cursor: 'pointer', marginBottom: '8px' }}
                >
                  Unapprove
                </button>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button onClick={() => { setEditDraft({
                  caption: selectedPost.caption,
                  platform: selectedPost.platform,
                  format: selectedPost.format,
                  scheduled_at: selectedPost.scheduled_at,
                  gig_id: selectedPost.gig_id,
                  collaborators: selectedPost.collaborators || [],
                  location_name: selectedPost.location_name || '',
                  location_id: selectedPost.location_id || '',
                  hashtags: selectedPost.hashtags || [],
                  first_comment: selectedPost.first_comment || '',
                  cover_url: selectedPost.cover_url || '',
                  thumb_offset: selectedPost.thumb_offset,
                  share_to_feed: selectedPost.share_to_feed !== false,
                  alt_text: selectedPost.alt_text || '',
                  dm_keyword: selectedPost.dm_keyword || '',
                  dm_message: selectedPost.dm_message || '',
                  dm_reward_url: selectedPost.dm_reward_url || '',
                  dm_reward_type: selectedPost.dm_reward_type || 'download',
                  dm_follow_required: selectedPost.dm_follow_required || false,
                  dm_campaign_name: selectedPost.dm_campaign_name || '',
                }); setEditMode(true) }} style={{ flex: 1, fontFamily: s.font, fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '10px', background: 'transparent', border: `1px solid ${s.gold}`, color: s.gold, cursor: 'pointer' }}>
                  Edit
                </button>
                <button onClick={async () => {
                  const id = selectedPost.id
                  setSelectedPost(null)
                  setEditMode(false)
                  try {
                    await fetch('/api/schedule', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
                    setPosts(prev => prev.filter(p => p.id !== id))
                  } catch {}
                }} style={{ fontFamily: s.font, fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '10px 14px', background: 'transparent', border: '1px solid rgba(180,60,60,0.4)', color: '#b43c3c', cursor: 'pointer' }}>
                  Delete
                </button>
              </div>
            </>
          )}
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
