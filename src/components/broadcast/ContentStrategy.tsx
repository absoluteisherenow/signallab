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

const PLATFORM_COLOR: Record<string, string> = {
  instagram: '#b08d57', tiktok: '#3d6b4a', threads: '#6a7a9a', twitter: '#4a5a7a',
  Instagram: '#b08d57', TikTok: '#3d6b4a', Threads: '#6a7a9a', 'X / Twitter': '#4a5a7a',
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
    try {
      const res = await fetch('/api/content-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: usePeriod === 'week' ? 7 : 20, period: usePeriod, weekOffset: 0, monthOffset: 0 }),
      })
      const data = await res.json()
      if (data.posts) setPosts(data.posts)
    } catch {}
    setLoading(false)
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
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: s.text, padding: '8px 16px', borderRadius: '8px',
            fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase' as const,
            fontFamily: s.font, cursor: 'pointer',
          }}
        >
          Add All to Calendar
        </button>
      )}
      <button
        onClick={() => generateStrategy()}
        style={{
          background: s.gold, color: '#0a0a0f', border: 'none',
          padding: '8px 16px', borderRadius: '8px',
          fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase' as const,
          fontFamily: s.font, cursor: 'pointer', fontWeight: 600,
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
                background: period === p ? s.gold : 'rgba(255,255,255,0.05)',
                color: period === p ? '#0a0a0f' : 'rgba(240,235,226,0.4)',
                border: period === p ? 'none' : '1px solid rgba(255,255,255,0.1)',
                padding: '6px 16px', borderRadius: '6px',
                fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                fontFamily: s.font, cursor: 'pointer', fontWeight: period === p ? 600 : 400,
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
                background: s.gold, color: '#0a0a0f', border: 'none',
                padding: '12px 28px', borderRadius: '8px',
                fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase' as const,
                fontFamily: s.font, cursor: 'pointer', fontWeight: 600,
              }}
            >
              Create Content Strategy
            </button>
          </div>
        )}

        {/* Saved strategies from Signal Voice */}
        {!loading && savedStrategies.length > 0 && (
          <div style={{ marginBottom: '40px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.gold, fontFamily: s.font, marginBottom: '16px' }}>
              From Signal Voice
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {savedStrategies.map(strat => (
                <div key={strat.id} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderLeft: '2px solid rgba(212,168,67,0.4)',
                  borderRadius: '10px',
                  padding: '20px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      {strat.query && (
                        <div style={{ fontSize: '10px', color: s.dimmer, fontFamily: s.font, marginBottom: '6px' }}>
                          &ldquo;{strat.query}&rdquo;
                        </div>
                      )}
                      <div style={{ fontSize: '9px', color: 'rgba(240,235,226,0.2)', fontFamily: s.font }}>
                        {new Date(strat.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteSaved(strat.id)}
                      style={{
                        background: 'none', border: 'none', color: 'rgba(240,235,226,0.2)',
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
                        <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', padding: '12px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                            <div style={{ fontSize: '10px', color: s.gold, letterSpacing: '0.1em', fontWeight: 500, fontFamily: s.font }}>
                              {phase.name.toUpperCase()}
                            </div>
                            <div style={{ fontSize: '9px', color: s.dimmer, fontFamily: s.font }}>{phase.timing}</div>
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
                      <div style={{ fontSize: '9px', color: s.dimmer, letterSpacing: '0.12em', fontFamily: s.font, marginBottom: '6px' }}>ALWAYS ON</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {strat.always_on.map((item, i) => (
                          <div key={i} style={{ fontSize: '11px', color: 'rgba(240,235,226,0.3)', paddingLeft: '10px', borderLeft: '1px solid rgba(255,255,255,0.04)' }}>
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
                    borderRadius: '12px',
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
                        <span style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: s.gold, fontFamily: s.font }}>
                          Added
                        </span>
                      )}
                      <span style={{
                        background: PLATFORM_COLOR[post.platform] || 'rgba(255,255,255,0.1)',
                        color: '#fff', padding: '2px 8px', borderRadius: '4px',
                        fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase',
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
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: s.text, padding: '4px 8px', fontSize: '11px', fontFamily: s.font }}
                      >
                        {['instagram', 'tiktok', 'threads', 'twitter'].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <select
                        value={editDraft.format || post.format}
                        onChange={e => setEditDraft(d => ({ ...d, format: e.target.value }))}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: s.text, padding: '4px 8px', fontSize: '11px', fontFamily: s.font }}
                      >
                        {['post', 'reel', 'carousel', 'story'].map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                  ) : (
                    <span style={{
                      alignSelf: 'flex-start',
                      background: 'rgba(255,255,255,0.06)', padding: '2px 10px', borderRadius: '4px',
                      fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase',
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
                        borderRadius: '8px', color: s.text, padding: '10px', fontSize: '13px',
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
                          borderRadius: '6px', color: s.dim, padding: '6px 10px', fontSize: '11px',
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

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '4px' }}>
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => saveEdit(i)}
                          style={{
                            background: s.gold, color: '#0a0a0f', border: 'none',
                            padding: '6px 14px', borderRadius: '6px',
                            fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                            fontFamily: s.font, cursor: 'pointer', fontWeight: 600,
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingIndex(null); setEditDraft({}) }}
                          style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            color: s.text, padding: '6px 14px', borderRadius: '6px',
                            fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase' as const,
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
                              padding: '6px 14px', borderRadius: '6px',
                              fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase' as const,
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
                            color: s.text, padding: '6px 14px', borderRadius: '6px',
                            fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase' as const,
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
                            color: s.text, padding: '6px 14px', borderRadius: '6px',
                            fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                            fontFamily: s.font, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            opacity: regeneratingIndex === i ? 0.7 : 1,
                          }}
                        >
                          {regeneratingIndex === i ? <ScanPulse size="sm" /> : null}
                          {regeneratingIndex === i ? 'Regenerating...' : 'Regenerate'}
                        </button>
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
