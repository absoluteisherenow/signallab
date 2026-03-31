'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Release {
  id: string
  title: string
  type: string
  release_date: string
  label?: string
  notes?: string
}

interface CampaignPost {
  phase: string
  days_offset: number
  platform: string
  caption: string
  dm_reply: string
  rationale: string
}

interface SavedPost {
  id: string
  caption: string
  platform: string
  scheduled_at: string
  status: string
  format_type: string
}

const PHASE_ORDER = [
  'SILENCE BREAKER', 'AUDIO PREVIEW 1', 'ANNOUNCEMENT', 'DEEP DIVE',
  'AUDIO PREVIEW 2', 'PRE-SAVE / PRE-ORDER', 'AUDIO PREVIEW 3',
  'DROP DAY', 'EARLY MOMENTUM', 'PRESS BLURB',
]

function phaseColor(phase: string) {
  if (phase.startsWith('AUDIO PREVIEW')) return 'var(--green)'
  if (phase === 'ANNOUNCEMENT') return 'var(--gold)'
  if (phase === 'DROP DAY') return 'var(--gold)'
  if (phase === 'PRESS BLURB') return '#7a8fa0'
  return 'var(--text-dimmer)'
}

function dayLabel(offset: number) {
  if (offset === 0) return 'Drop day'
  if (offset < 0) return `${Math.abs(offset)}d before`
  return `${offset}d after`
}

export default function CampaignPage({ params }: { params: { id: string } }) {
  const [release, setRelease] = useState<Release | null>(null)
  const [posts, setPosts] = useState<CampaignPost[]>([])
  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      // Load release
      const { data } = await supabase
        .from('releases')
        .select('*')
        .eq('id', params.id)
        .single()
      if (data) setRelease(data)

      // Load any existing campaign posts
      const res = await fetch(`/api/releases/${params.id}/campaign`)
      const json = await res.json()
      if (json.posts?.length) setSavedPosts(json.posts)
    }
    load()
  }, [params.id])

  async function generate() {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(`/api/releases/${params.id}/campaign`, { method: 'POST' })
      const json = await res.json()
      if (json.error) { setError(json.error); return }
      setPosts(json.posts || [])
      setSaved(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  async function saveToSignalLab() {
    if (!release || !posts.length) return
    setSaving(true)
    try {
      const res = await fetch(`/api/releases/${params.id}/campaign`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ posts, releaseDate: release.release_date, releaseId: params.id }),
      })
      const json = await res.json()
      if (json.error) { setError(json.error); return }
      setSaved(true)
      // Reload saved posts
      const check = await fetch(`/api/releases/${params.id}/campaign`)
      const checkJson = await check.json()
      if (checkJson.posts?.length) setSavedPosts(checkJson.posts)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(idx: number) {
    setEditingIdx(idx)
    setEditText(posts[idx].caption)
  }

  function saveEdit(idx: number) {
    const updated = [...posts]
    updated[idx] = { ...updated[idx], caption: editText }
    setPosts(updated)
    setEditingIdx(null)
    setSaved(false)
  }

  const releaseDate = release ? new Date(release.release_date) : null

  function scheduledDate(offset: number) {
    if (!releaseDate) return ''
    const d = new Date(releaseDate)
    d.setDate(d.getDate() + offset)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', fontFamily: 'var(--font-mono)' }}>

      {/* Header */}
      <div style={{ padding: '48px 52px 36px', borderBottom: '1px solid var(--border-dim)' }}>
        <Link href="/releases" style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textDecoration: 'none', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          ← Drop Lab
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px' }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <span style={{ display: 'block', width: '28px', height: '1px', background: 'var(--gold)' }} />
              Campaign Builder
            </div>
            {release ? (
              <>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '28px', fontWeight: 300, letterSpacing: '0.03em' }}>
                  {release.title}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginTop: '6px' }}>
                  {release.type.charAt(0).toUpperCase() + release.type.slice(1)}
                  {release.label ? ` · ${release.label}` : ''}
                  {' · '}
                  {release.release_date && new Date(release.release_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </>
            ) : (
              <div style={{ height: '40px', background: 'var(--border-dim)', width: '200px', borderRadius: '2px' }} />
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={generate}
              disabled={generating}
              style={{
                background: generating ? 'transparent' : 'var(--gold)',
                color: generating ? 'var(--gold)' : '#070706',
                border: generating ? '1px solid var(--gold-dim)' : 'none',
                padding: '0 28px', height: '40px', fontSize: '10px',
                letterSpacing: '0.16em', textTransform: 'uppercase', cursor: generating ? 'wait' : 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {generating ? 'Generating…' : posts.length ? 'Regenerate' : 'Generate campaign'}
            </button>

            {posts.length > 0 && !saved && (
              <button
                onClick={saveToSignalLab}
                disabled={saving}
                style={{
                  background: 'transparent', color: 'var(--green)',
                  border: '1px solid rgba(61,107,74,0.4)',
                  padding: '0 24px', height: '40px', fontSize: '10px',
                  letterSpacing: '0.16em', textTransform: 'uppercase', cursor: saving ? 'wait' : 'pointer',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {saving ? 'Saving…' : 'Save to Signal Lab →'}
              </button>
            )}

            {saved && (
              <Link href="/broadcast" style={{
                background: 'transparent', color: 'var(--green)',
                border: '1px solid rgba(61,107,74,0.4)',
                padding: '0 24px', height: '40px', fontSize: '10px',
                letterSpacing: '0.16em', textTransform: 'uppercase', textDecoration: 'none',
                display: 'flex', alignItems: 'center',
              }}>
                View in Signal Lab →
              </Link>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ margin: '24px 52px 0', padding: '14px 18px', background: 'rgba(154,106,90,0.08)', border: '1px solid rgba(154,106,90,0.25)', fontSize: '11px', color: 'var(--red-brown)' }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!generating && posts.length === 0 && savedPosts.length === 0 && (
        <div style={{ padding: '64px 52px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-dimmer)', marginBottom: '8px' }}>No campaign generated yet</div>
          <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', opacity: 0.6, marginBottom: '32px' }}>
            10 posts · audio preview cadence · platform-optimised timing
          </div>
          <button
            onClick={generate}
            style={{
              background: 'var(--gold)', color: '#070706', border: 'none',
              padding: '0 32px', height: '44px', fontSize: '10px',
              letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Generate campaign
          </button>
        </div>
      )}

      {/* Generating state */}
      {generating && (
        <div style={{ padding: '48px 52px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '24px' }}>
            Strategising…
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{
              padding: '24px 28px', border: '1px solid var(--border-dim)',
              marginBottom: '2px', display: 'flex', gap: '20px', alignItems: 'flex-start',
              background: 'var(--panel)',
            }}>
              <div style={{ width: '100px', height: '10px', background: 'var(--border-dim)', borderRadius: '2px', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: '12px', background: 'var(--border-dim)', borderRadius: '2px', marginBottom: '8px', width: '80%' }} />
                <div style={{ height: '12px', background: 'var(--border-dim)', borderRadius: '2px', width: '60%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generated posts */}
      {!generating && posts.length > 0 && (
        <div style={{ padding: '36px 52px 48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--text-dimmer)', textTransform: 'uppercase' }}>
              Campaign — {posts.length} posts
            </div>
            {saved && (
              <div style={{ fontSize: '10px', color: 'var(--green)', letterSpacing: '0.1em' }}>
                Saved to Signal Lab as drafts
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {posts.map((post, idx) => (
              <div key={idx} style={{
                background: 'var(--panel)', border: '1px solid var(--border-dim)',
                padding: '22px 28px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{
                      fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase',
                      color: phaseColor(post.phase), padding: '3px 8px',
                      border: `1px solid ${phaseColor(post.phase)}30`,
                    }}>
                      {post.phase}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)' }}>
                      {scheduledDate(post.days_offset)} · {dayLabel(post.days_offset)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <div style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'var(--text-dimmer)', textTransform: 'uppercase' }}>
                      {post.platform}
                    </div>
                    {editingIdx !== idx && (
                      <button
                        onClick={() => startEdit(idx)}
                        style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)' }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                {editingIdx === idx ? (
                  <div>
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      style={{
                        width: '100%', background: '#0c0b09', border: '1px solid var(--border-dim)',
                        color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px',
                        padding: '12px 14px', lineHeight: 1.6, resize: 'vertical', minHeight: '80px',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button onClick={() => saveEdit(idx)} style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', background: 'none', border: '1px solid var(--gold-dim)', padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                        Save
                      </button>
                      <button onClick={() => setEditingIdx(null)} style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmer)', background: 'none', border: '1px solid var(--border-dim)', padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: '10px' }}>
                      {post.caption}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', opacity: 0.6, fontStyle: 'italic', marginBottom: post.dm_reply ? '12px' : 0 }}>
                      {post.rationale}
                    </div>
                    {post.dm_reply && (
                      <div style={{
                        background: 'rgba(176,141,87,0.06)', border: '1px solid rgba(176,141,87,0.18)',
                        padding: '10px 14px', display: 'flex', gap: '12px', alignItems: 'flex-start',
                      }}>
                        <div style={{ fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--gold)', flexShrink: 0, paddingTop: '1px' }}>
                          Auto-DM
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.6, fontStyle: 'italic' }}>
                          "{post.dm_reply}"
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {!saved && (
            <div style={{ marginTop: '24px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                onClick={saveToSignalLab}
                disabled={saving}
                style={{
                  background: 'var(--gold)', color: '#070706', border: 'none',
                  padding: '0 28px', height: '40px', fontSize: '10px',
                  letterSpacing: '0.16em', textTransform: 'uppercase', cursor: saving ? 'wait' : 'pointer',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {saving ? 'Saving…' : 'Save all to Signal Lab →'}
              </button>
              <div style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>
                Saves as drafts — review timing in Signal Lab calendar before scheduling
              </div>
            </div>
          )}
        </div>
      )}

      {/* Existing saved posts (if no new generation) */}
      {!generating && posts.length === 0 && savedPosts.length > 0 && (
        <div style={{ padding: '36px 52px 48px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '20px' }}>
            Active campaign — {savedPosts.length} posts in Signal Lab
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {savedPosts.map((post, i) => (
              <div key={post.id} style={{
                background: 'var(--panel)', border: '1px solid var(--border-dim)',
                padding: '18px 28px', display: 'grid', gridTemplateColumns: '120px 1fr 80px 80px',
                gap: '16px', alignItems: 'center',
              }}>
                <div style={{ fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)' }}>
                  {post.format_type?.replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {post.caption.slice(0, 70)}{post.caption.length > 70 ? '…' : ''}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(post.scheduled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </div>
                <div style={{
                  fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: post.status === 'posted' ? 'var(--green)' : post.status === 'scheduled' ? 'var(--gold)' : 'var(--text-dimmer)',
                }}>
                  {post.status}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
            <Link href="/broadcast" style={{
              fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--gold)', border: '1px solid var(--gold-dim)', padding: '8px 20px', textDecoration: 'none',
            }}>
              Open Signal Lab →
            </Link>
            <button
              onClick={generate}
              style={{
                fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '8px 20px',
                background: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)',
              }}
            >
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
