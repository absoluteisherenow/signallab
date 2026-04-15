'use client'

import React, { useState, useEffect } from 'react'
import { SignalLabHeader } from './SignalLabHeader'
import { ScanPulse } from '@/components/ui/ScanPulse'

interface SavedStrategy {
  id: string
  source: string
  query: string | null
  answer: string | null
  phases: { name: string; timing: string; actions: string[] }[] | null
  always_on: string[] | null
  created_at: string
}

interface StrategyPost {
  day: string
  scheduled_at: string
  platform: string
  format: string
  caption: string
  featured_track: string | null
  notes: string
}

interface MediaMatch {
  id: string
  thumbnail_url: string | null
  media_type: string
  filename: string
  score: number
}

// Hardcoded shot ideas for empty-state per format.
// TODO Phase 2: replace with Claude-generated suggestions derived from card caption + reasoning.
const SHOT_IDEAS: Record<string, string[]> = {
  post: ['Moody venue exterior', 'Booth close-up', 'Artist in venue light'],
  reel: ['Process shot 15s', 'Pre-show walk-in', 'Crowd from booth POV'],
  carousel: ['Venue series 3-6 stills', 'Before/after set', 'Hardware flat-lay'],
  story: ['Behind the decks', 'Sound check moment', 'Hotel window view'],
}

function shotIdeasFor(format: string): string[] {
  return SHOT_IDEAS[(format || '').toLowerCase()] || SHOT_IDEAS.post
}

// Build a stable card identifier from a post — used for assignment persistence
function cardIdFor(post: StrategyPost): string {
  const day = (post.day || '').toLowerCase().replace(/\s+/g, '-')
  const platform = (post.platform || '').toLowerCase()
  const format = (post.format || '').toLowerCase()
  const dateKey = post.scheduled_at ? post.scheduled_at.slice(0, 10) : ''
  return `${day}-${dateKey}-${platform}-${format}`
}

// Loose keyword extraction from a caption — short tokens only
function captionKeywords(caption: string): string[] {
  if (!caption) return []
  const stop = new Set(['the','and','for','with','your','this','that','from','have','has','are','was','were','will','what','when','where','into','out','its','it\u2019s','you','our'])
  return Array.from(new Set(
    caption
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !stop.has(w))
  )).slice(0, 8)
}

function isoWeekStart(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay() || 7
  if (day !== 1) d.setHours(-24 * (day - 1))
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

const PLATFORM_COLOR: Record<string, string> = {
  instagram: '#ff2a1a', tiktok: '#f2f2f2', threads: '#6a7a9a', twitter: '#4a5a7a',
  Instagram: '#ff2a1a', TikTok: '#f2f2f2', Threads: '#6a7a9a', 'X / Twitter': '#4a5a7a',
}

const s = {
  bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border)',
  gold: 'var(--gold)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
  font: 'var(--font-mono)',
}

export function ContentStrategy() {
  const [posts, setPosts] = useState<StrategyPost[]>([])
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<StrategyPost>>({})
  const [addedSet, setAddedSet] = useState<Set<number>>(new Set())
  const [addingIndex, setAddingIndex] = useState<number | null>(null)
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null)

  // ── Content matching from library ─────────────────────────────────────
  // matchesByIndex: top 6 matches per card (we render top 3, hold 6 for swap)
  const [matchesByIndex, setMatchesByIndex] = useState<Record<number, MediaMatch[]>>({})
  // assignedByIndex: card index -> chosen scan id
  const [assignedByIndex, setAssignedByIndex] = useState<Record<number, string>>({})

  // ── Saved strategies from Signal Voice ────────────────────────────────
  const [savedStrategies, setSavedStrategies] = useState<SavedStrategy[]>([])
  const [loadingSaved, setLoadingSaved] = useState(true)

  useEffect(() => { loadSaved() }, [])

  async function loadSaved() {
    setLoadingSaved(true)
    try {
      const res = await fetch('/api/content-strategy')
      const data = await res.json()
      if (data.strategies) setSavedStrategies(data.strategies)
    } catch {}
    setLoadingSaved(false)
  }

  async function deleteSaved(id: string) {
    setSavedStrategies(prev => prev.filter(s => s.id !== id))
    try {
      await fetch('/api/content-strategy', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch {}
  }

  async function generateStrategy(p?: 'week' | 'month') {
    const usePeriod = p || period
    setLoading(true)
    setPosts([])
    setAddedSet(new Set())
    setMatchesByIndex({})
    setAssignedByIndex({})
    try {
      const res = await fetch('/api/content-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: usePeriod === 'week' ? 7 : 20, period: usePeriod, weekOffset: 0, monthOffset: 0 }),
      })
      const data = await res.json()
      if (data.posts) {
        setPosts(data.posts)
        loadMatchesForPosts(data.posts)
        loadExistingAssignments(data.posts)
      }
    } catch {}
    setLoading(false)
  }

  async function loadMatchesForPosts(list: StrategyPost[]) {
    // Fetch matches in parallel — dedupe across cards by passing already-used ids
    const used = new Set<string>()
    const results = await Promise.all(
      list.map(async (post) => {
        const keywords = captionKeywords(post.caption)
        const ideaText = [post.caption, (post as any).notes, (post as any).featured_track].filter(Boolean).join(' ')
        const url = `/api/content-plan/matches?format=${encodeURIComponent(post.format || 'POST')}&keywords=${encodeURIComponent(keywords.join(','))}&idea=${encodeURIComponent(ideaText.slice(0, 500))}`
        try {
          const res = await fetch(url)
          const data = await res.json()
          return (data.matches || []) as MediaMatch[]
        } catch {
          return [] as MediaMatch[]
        }
      })
    )
    const next: Record<number, MediaMatch[]> = {}
    results.forEach((matches, i) => {
      // Filter out already-used scan ids so each card gets distinct media where possible
      const filtered = matches.filter(m => !used.has(m.id))
      const display = (filtered.length ? filtered : matches).slice(0, 6)
      display.slice(0, 3).forEach(m => used.add(m.id))
      next[i] = display
    })
    setMatchesByIndex(next)
  }

  async function loadExistingAssignments(list: StrategyPost[]) {
    try {
      const week = isoWeekStart()
      const res = await fetch(`/api/content-plan/assign?week=${week}`)
      const data = await res.json()
      if (!data.assignments) return
      const map: Record<number, string> = {}
      list.forEach((post, i) => {
        const cid = cardIdFor(post)
        const found = data.assignments.find((a: any) => a.card_id === cid)
        if (found) map[i] = found.scan_id
      })
      if (Object.keys(map).length) setAssignedByIndex(map)
    } catch {}
  }

  async function assignMedia(index: number, match: MediaMatch) {
    const post = posts[index]
    if (!post) return
    setAssignedByIndex(prev => ({ ...prev, [index]: match.id }))
    try {
      await fetch('/api/content-plan/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: cardIdFor(post),
          scan_id: match.id,
          week: isoWeekStart(),
        }),
      })
    } catch {}
  }

  async function addToCalendar(post: StrategyPost, index: number) {
    setAddingIndex(index)
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
      setAddedSet(prev => new Set(prev).add(index))
    } catch {}
    setAddingIndex(null)
  }

  async function addAllToCalendar() {
    const unadded = posts.map((p, i) => ({ post: p, index: i })).filter(({ index }) => !addedSet.has(index))
    await Promise.all(unadded.map(({ post, index }) => addToCalendar(post, index)))
  }

  async function regeneratePost(index: number) {
    setRegeneratingIndex(index)
    try {
      const res = await fetch('/api/content-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 1, period, weekOffset: 0, monthOffset: 0 }),
      })
      const data = await res.json()
      if (data.posts?.[0]) {
        setPosts(prev => prev.map((p, i) => i === index ? data.posts[0] : p))
        setAddedSet(prev => { const n = new Set(prev); n.delete(index); return n })
      }
    } catch {}
    setRegeneratingIndex(null)
  }

  function startEdit(index: number) {
    setEditingIndex(index)
    setEditDraft({ ...posts[index] })
  }

  function saveEdit(index: number) {
    if (editDraft) {
      setPosts(prev => prev.map((p, i) => i === index ? { ...p, ...editDraft } as StrategyPost : p))
      setAddedSet(prev => { const n = new Set(prev); n.delete(index); return n })
    }
    setEditingIndex(null)
    setEditDraft({})
  }

  function switchPeriod(p: 'week' | 'month') {
    setPeriod(p)
    if (posts.length > 0) generateStrategy(p)
  }

  const hasStrategy = posts.length > 0
  const allAdded = hasStrategy && addedSet.size === posts.length

  // ── Header right slot ──────────────────────────────────────────────────

  const headerRight = hasStrategy ? (
    <div style={{ display: 'flex', gap: '8px' }}>
      {!allAdded && (
        <button
          onClick={addAllToCalendar}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            height: '32px', padding: '0 16px',
            background: 'transparent', color: 'rgba(240,235,226,0.7)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: '2px',
            fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase' as const,
            fontFamily: s.font, cursor: 'pointer', fontWeight: 400,
          }}
        >
          Add All to Calendar
        </button>
      )}
      <button
        onClick={() => generateStrategy()}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          height: '32px', padding: '0 16px',
          background: 'rgba(255,42,26,0.15)', color: '#d4a843',
          border: '1px solid rgba(255,42,26,0.35)', borderRadius: '2px',
          fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase' as const,
          fontFamily: s.font, cursor: 'pointer', fontWeight: 400,
        }}
      >
        New Strategy
      </button>
    </div>
  ) : null

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: s.bg, color: s.text, fontFamily: 'var(--font-geist-sans)' }}>
      <SignalLabHeader right={headerRight} />

      <div style={{ padding: '32px 48px' }}>
        {/* Period toggle */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '32px' }}>
          {(['week', 'month'] as const).map(p => (
            <button
              key={p}
              onClick={() => switchPeriod(p)}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                height: '32px', padding: '0 16px',
                background: period === p ? 'rgba(255,42,26,0.15)' : 'transparent',
                color: period === p ? '#d4a843' : 'rgba(240,235,226,0.7)',
                border: period === p ? '1px solid rgba(255,42,26,0.35)' : '1px solid rgba(255,255,255,0.12)',
                borderRadius: '2px',
                fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase' as const,
                fontFamily: s.font, cursor: 'pointer', fontWeight: 400,
              }}
            >
              This {p}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '120px', gap: '20px' }}>
            <ScanPulse size="lg" />
            <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: s.dim, fontFamily: s.font }}>
              Generating strategy...
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !hasStrategy && savedStrategies.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '100px', gap: '24px', maxWidth: '480px', margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: '13px', color: s.dim, lineHeight: 1.6 }}>
              Generate a content plan built from your gigs, releases, and what&apos;s working
            </div>
            <button
              onClick={() => generateStrategy()}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                height: '40px', padding: '0 22px',
                background: 'rgba(255,42,26,0.15)', color: '#d4a843',
                border: '1px solid rgba(255,42,26,0.35)',
                borderRadius: '2px',
                fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase' as const,
                fontFamily: s.font, cursor: 'pointer', fontWeight: 400,
              }}
            >
              Create Content Strategy
            </button>
          </div>
        )}

        {/* Saved strategies from Signal Voice */}
        {!loading && savedStrategies.length > 0 && (
          <div style={{ marginBottom: '40px' }}>
            <div style={{ fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.gold, fontFamily: s.font, marginBottom: '16px' }}>
              From Signal Voice
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {savedStrategies.map(strat => (
                <div key={strat.id} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderLeft: '2px solid rgba(212,168,67,0.4)',
                  borderRadius: '2px',
                  padding: '20px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      {strat.query && (
                        <div style={{ fontSize: '12px', color: s.dimmer, fontFamily: s.font, marginBottom: '6px' }}>
                          &ldquo;{strat.query}&rdquo;
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: 'rgba(240,235,226,0.6)', fontFamily: s.font }}>
                        {new Date(strat.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteSaved(strat.id)}
                      style={{
                        background: 'none', border: 'none', color: 'rgba(240,235,226,0.6)',
                        fontSize: '11px', cursor: 'pointer', padding: '2px 6px',
                      }}
                    >
                      Dismiss
                    </button>
                  </div>

                  {strat.answer && (
                    <div style={{ fontSize: '13px', color: s.text, lineHeight: 1.6, marginBottom: '14px' }}>
                      {strat.answer}
                    </div>
                  )}

                  {strat.phases && strat.phases.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                      {strat.phases.map((phase, i) => (
                        <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '2px', padding: '12px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                            <div style={{ fontSize: '12px', color: s.gold, letterSpacing: '0.1em', fontWeight: 500, fontFamily: s.font }}>
                              {phase.name.toUpperCase()}
                            </div>
                            <div style={{ fontSize: '11px', color: s.dimmer, fontFamily: s.font }}>{phase.timing}</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {phase.actions.map((action, j) => (
                              <div key={j} style={{ fontSize: '11px', color: s.dim, paddingLeft: '10px', borderLeft: '1px solid rgba(255,255,255,0.06)', lineHeight: 1.5 }}>
                                {action}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {strat.always_on && strat.always_on.length > 0 && (
                    <div>
                      <div style={{ fontSize: '11px', color: s.dimmer, letterSpacing: '0.12em', fontFamily: s.font, marginBottom: '6px' }}>ALWAYS ON</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {strat.always_on.map((item, i) => (
                          <div key={i} style={{ fontSize: '11px', color: 'rgba(240,235,226,0.65)', paddingLeft: '10px', borderLeft: '1px solid rgba(255,255,255,0.04)' }}>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cards grid */}
        {!loading && hasStrategy && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
            {posts.map((post, i) => {
              const isEditing = editingIndex === i
              const isAdded = addedSet.has(i)

              return (
                <div
                  key={i}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isAdded ? 'rgba(212,168,67,0.25)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '2px',
                    padding: '20px',
                    display: 'flex', flexDirection: 'column', gap: '12px',
                    opacity: isAdded ? 0.55 : 1,
                    transition: 'opacity 0.3s, border-color 0.3s',
                  }}
                >
                  {/* Header: day + platform */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.gold, fontFamily: s.font, fontWeight: 500 }}>
                      {post.day}
                    </span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {isAdded && (
                        <span style={{ fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: s.gold, fontFamily: s.font }}>
                          Added
                        </span>
                      )}
                      <span style={{
                        background: PLATFORM_COLOR[post.platform] || 'rgba(255,255,255,0.1)',
                        color: '#fff', padding: '2px 8px', borderRadius: '4px',
                        fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase',
                        fontFamily: s.font,
                      }}>
                        {post.platform}
                      </span>
                    </div>
                  </div>

                  {/* Format badge */}
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select
                        value={editDraft.platform || post.platform}
                        onChange={e => setEditDraft(d => ({ ...d, platform: e.target.value }))}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '2px', color: s.text, padding: '4px 8px', fontSize: '11px', fontFamily: s.font }}
                      >
                        {['instagram', 'tiktok', 'threads', 'twitter'].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <select
                        value={editDraft.format || post.format}
                        onChange={e => setEditDraft(d => ({ ...d, format: e.target.value }))}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '2px', color: s.text, padding: '4px 8px', fontSize: '11px', fontFamily: s.font }}
                      >
                        {['post', 'reel', 'carousel', 'story'].map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                  ) : (
                    <span style={{
                      alignSelf: 'flex-start',
                      background: 'rgba(255,255,255,0.06)', padding: '2px 10px', borderRadius: '4px',
                      fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase',
                      color: s.dim, fontFamily: s.font,
                    }}>
                      {post.format}
                    </span>
                  )}

                  {/* Caption */}
                  {isEditing ? (
                    <textarea
                      value={editDraft.caption ?? post.caption}
                      onChange={e => setEditDraft(d => ({ ...d, caption: e.target.value }))}
                      rows={4}
                      style={{
                        background: 'rgba(255,255,255,0.04)', border: `1px solid rgba(212,168,67,0.3)`,
                        borderRadius: '2px', color: s.text, padding: '10px', fontSize: '13px',
                        lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit',
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: '13px', color: s.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {post.caption}
                    </div>
                  )}

                  {/* Featured track */}
                  {(isEditing ? true : post.featured_track) && (
                    isEditing ? (
                      <input
                        value={editDraft.featured_track ?? post.featured_track ?? ''}
                        onChange={e => setEditDraft(d => ({ ...d, featured_track: e.target.value || null }))}
                        placeholder="Featured track"
                        style={{
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '2px', color: s.dim, padding: '6px 10px', fontSize: '11px',
                          fontFamily: s.font,
                        }}
                      />
                    ) : (
                      <div style={{ fontSize: '11px', color: s.dim, fontFamily: s.font, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ opacity: 0.5 }}>&#9835;</span> {post.featured_track}
                      </div>
                    )
                  )}

                  {/* Notes */}
                  {post.notes && !isEditing && (
                    <div style={{
                      fontSize: '11px', color: s.dimmer, fontStyle: 'italic', lineHeight: 1.5,
                      borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px',
                    }}>
                      {post.notes}
                    </div>
                  )}

                  {/* Matching content from library */}
                  {!isEditing && (() => {
                    const matches = matchesByIndex[i] || []
                    const display = matches.slice(0, 3)
                    const assignedId = assignedByIndex[i]
                    if (display.length === 0) {
                      // Empty state — no matches found
                      const ideas = shotIdeasFor(post.format)
                      return (
                        <div
                          style={{
                            border: '1px dashed rgba(255,255,255,0.14)',
                            borderRadius: '2px',
                            padding: '12px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '12px',
                              letterSpacing: '0.18em',
                              textTransform: 'uppercase' as const,
                              color: '#c9c4ba',
                              fontFamily: s.font,
                              fontWeight: 500,
                            }}
                          >
                            No match in library
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              letterSpacing: '0.14em',
                              textTransform: 'uppercase' as const,
                              color: s.dimmer,
                              fontFamily: s.font,
                            }}
                          >
                            Shoot this
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {ideas.map((idea, k) => (
                              <div
                                key={k}
                                style={{
                                  fontSize: '11px',
                                  color: s.dim,
                                  paddingLeft: '10px',
                                  borderLeft: '1px solid rgba(255,255,255,0.06)',
                                  lineHeight: 1.5,
                                }}
                              >
                                · {idea}
                              </div>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                            <a
                              href="/broadcast"
                              style={{
                                background: 'rgba(255,42,26,0.12)',
                                border: '1px solid rgba(255,42,26,0.3)',
                                color: s.gold,
                                padding: '5px 10px',
                                borderRadius: '2px',
                                fontSize: '11px',
                                letterSpacing: '0.14em',
                                textTransform: 'uppercase' as const,
                                fontFamily: s.font,
                                textDecoration: 'none',
                              }}
                            >
                              Scan content
                            </a>
                            <a
                              href="/broadcast"
                              style={{
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: s.dim,
                                padding: '5px 10px',
                                borderRadius: '2px',
                                fontSize: '11px',
                                letterSpacing: '0.14em',
                                textTransform: 'uppercase' as const,
                                fontFamily: s.font,
                                textDecoration: 'none',
                              }}
                            >
                              Already have this → upload
                            </a>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div
                          style={{
                            fontSize: '12px',
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase' as const,
                            color: '#c9c4ba',
                            fontFamily: s.font,
                            fontWeight: 500,
                          }}
                        >
                          Matching content
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                          {display.map((m) => {
                            const isAssigned = assignedId === m.id
                            return (
                              <button
                                key={m.id}
                                onClick={() => assignMedia(i, m)}
                                title={m.filename}
                                style={{
                                  position: 'relative',
                                  aspectRatio: '1 / 1',
                                  background: '#0e0e0e',
                                  border: `1px solid ${isAssigned ? '#ff2a1a' : 'rgba(255,255,255,0.07)'}`,
                                  borderRadius: '2px',
                                  padding: 0,
                                  cursor: 'pointer',
                                  overflow: 'hidden',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'stretch',
                                  transition: 'border-color 0.2s',
                                }}
                                onMouseEnter={e => {
                                  if (!isAssigned) (e.currentTarget as HTMLButtonElement).style.borderColor = '#ff2a1a'
                                }}
                                onMouseLeave={e => {
                                  if (!isAssigned) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.07)'
                                }}
                              >
                                <div style={{ flex: 1, position: 'relative', background: '#0a0a0a' }}>
                                  {m.thumbnail_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={m.thumbnail_url}
                                      alt={m.filename}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                    />
                                  ) : (
                                    <div
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '11px',
                                        color: s.dimmer,
                                        fontFamily: s.font,
                                      }}
                                    >
                                      {(m.media_type || '').toUpperCase()}
                                    </div>
                                  )}
                                </div>
                                <div
                                  style={{
                                    fontSize: '12px',
                                    color: '#ff2a1a',
                                    fontFamily: s.font,
                                    textAlign: 'center',
                                    padding: '3px 0',
                                    background: 'rgba(0,0,0,0.4)',
                                  }}
                                >
                                  {m.score?.toFixed(1) ?? '—'}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                          {display.map((m) => {
                            const isAssigned = assignedId === m.id
                            return (
                              <button
                                key={`use-${m.id}`}
                                onClick={() => assignMedia(i, m)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: isAssigned ? '#ff2a1a' : s.dimmer,
                                  fontSize: '11px',
                                  letterSpacing: '0.14em',
                                  textTransform: 'uppercase' as const,
                                  fontFamily: s.font,
                                  cursor: 'pointer',
                                  padding: 0,
                                }}
                              >
                                {isAssigned ? 'In use' : 'Use'}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '4px' }}>
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => saveEdit(i)}
                          style={{
                            background: s.gold, color: '#0a0a0f', border: 'none',
                            padding: '6px 14px', borderRadius: '2px',
                            fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                            fontFamily: s.font, cursor: 'pointer', fontWeight: 600,
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingIndex(null); setEditDraft({}) }}
                          style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            color: s.text, padding: '6px 14px', borderRadius: '2px',
                            fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                            fontFamily: s.font, cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        {!isAdded && (
                          <button
                            onClick={() => addToCalendar(post, i)}
                            disabled={addingIndex === i}
                            style={{
                              background: s.gold, color: '#0a0a0f', border: 'none',
                              padding: '6px 14px', borderRadius: '2px',
                              fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                              fontFamily: s.font, cursor: 'pointer', fontWeight: 600,
                              display: 'flex', alignItems: 'center', gap: '6px',
                              opacity: addingIndex === i ? 0.7 : 1,
                            }}
                          >
                            {addingIndex === i ? <ScanPulse size="sm" /> : null}
                            {addingIndex === i ? 'Adding...' : 'Add to Calendar'}
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(i)}
                          style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            color: s.text, padding: '6px 14px', borderRadius: '2px',
                            fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                            fontFamily: s.font, cursor: 'pointer',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => regeneratePost(i)}
                          disabled={regeneratingIndex === i}
                          style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            color: s.text, padding: '6px 14px', borderRadius: '2px',
                            fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                            fontFamily: s.font, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            opacity: regeneratingIndex === i ? 0.7 : 1,
                          }}
                        >
                          {regeneratingIndex === i ? <ScanPulse size="sm" /> : null}
                          {regeneratingIndex === i ? 'Regenerating...' : 'Regenerate'}
                        </button>
                        <a
                          href={`/broadcast/ads?caption=${encodeURIComponent(post.caption)}`}
                          style={{
                            background: 'none', border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(240,235,226,0.65)', padding: '6px 14px', borderRadius: '2px',
                            fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                            fontFamily: s.font, cursor: 'pointer', textDecoration: 'none',
                            display: 'inline-flex', alignItems: 'center',
                          }}
                        >
                          Boost →
                        </a>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
