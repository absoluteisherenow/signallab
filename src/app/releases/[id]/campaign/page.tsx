'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ScreenshotUpload } from '@/components/ui/ScreenshotUpload'

interface Release {
  id: string
  title: string
  artist?: string
  type: string
  release_date: string
  label?: string
  artwork_url?: string
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

interface PromoContact {
  id: string
  name: string
  email?: string
  whatsapp?: string
  instagram?: string
  tag?: string
}

export default function CampaignPage({ params }: { params: { id: string } }) {
  const [release, setRelease] = useState<Release | null>(null)
  const [posts, setPosts] = useState<CampaignPost[]>([])
  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([])
  const [generating, setGenerating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importText, setImportText] = useState('')
  const [importingFromText, setImportingFromText] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [error, setError] = useState('')

  // Promo service panel
  const [promoList, setPromoList] = useState<PromoContact[]>([])
  const [selectedPromo, setSelectedPromo] = useState<Set<string>>(new Set())
  const [promoChannel, setPromoChannel] = useState<'email' | 'whatsapp' | 'instagram'>('email')
  const [promoMessage, setPromoMessage] = useState('')
  const [promoSending, setPromoSending] = useState(false)
  const [promoSent, setPromoSent] = useState<string[]>([])
  const [promoCopied, setPromoCopied] = useState<string | null>(null)
  const [promoMessageGenerated, setPromoMessageGenerated] = useState(false)
  const [generatingMessage, setGeneratingMessage] = useState(false)

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

      // Load promo list from settings
      const settingsRes = await fetch('/api/settings')
      const settingsJson = await settingsRes.json()
      if (settingsJson.settings?.promo_list?.length) {
        setPromoList(settingsJson.settings.promo_list)
      }
    }
    load()
  }, [params.id])

  async function parseImportedCampaign(rawText: string) {
    if (!release) return
    setImportingFromText(true)
    setError('')
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          nocache: true,
          system: `You parse release campaign plans into structured post data. NEVER fabricate — only extract what is actually in the data. Return ONLY valid JSON.`,
          messages: [{
            role: 'user',
            content: `Parse this campaign plan into structured posts for a release campaign.

RELEASE: "${release.title}" by ${release.artist || 'the artist'}
TYPE: ${release.type}
RELEASE DATE: ${release.release_date}
LABEL: ${release.label || 'unknown'}

CAMPAIGN DATA TO PARSE:
${rawText}

Extract each post/task/action into this format. Match the phases to these standard names where possible:
SILENCE BREAKER, AUDIO PREVIEW 1, ANNOUNCEMENT, DEEP DIVE, AUDIO PREVIEW 2, PRE-SAVE / PRE-ORDER, AUDIO PREVIEW 3, DROP DAY, EARLY MOMENTUM, PRESS BLURB

Return JSON array:
[{
  "phase": "phase name",
  "days_offset": <number, negative = before release, 0 = drop day, positive = after>,
  "platform": "Instagram|Stories|TikTok|Twitter|All",
  "caption": "the post content or task description",
  "dm_reply": "",
  "rationale": "brief note on why this post matters"
}]

If the imported data has specific dates, calculate the days_offset from the release date ${release.release_date}.
If it's a general plan without specific dates, space them out sensibly before and after release.
Only include posts/actions you can actually see in the data — NEVER invent extra ones.`,
          }],
        }),
      })
      const data = await res.json()
      const raw = data.content?.[0]?.text || '[]'
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed) && parsed.length > 0) {
        setPosts(parsed)
        setSaved(false)
        setImporting(false)
        setImportText('')
      } else {
        setError('Could not extract campaign posts from that data')
      }
    } catch {
      setError('Failed to parse campaign data')
    } finally {
      setImportingFromText(false)
    }
  }

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

  async function generatePromoMessage() {
    if (!release) return
    setGeneratingMessage(true)
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 400,
          system: `You write short, direct promo messages for electronic music artists sending releases to their network. No hype, no AI fluff — keep it personal and brief, like a real message between people in music. Never mention AI.`,
          messages: [{
            role: 'user',
            content: `Write a short promo message for this release:
Title: "${release.title}"
Artist: ${release.artist || 'the artist'}
Type: ${release.type}
Label: ${release.label || 'self-released'}
Release date: ${release.release_date}

Write as if the artist is messaging their network directly. One paragraph, 2-4 sentences. Conversational. Include the release title and date. No subject line, no sign-off — just the message body.`,
          }],
        }),
      })
      const data = await res.json()
      const text = data.content?.[0]?.text?.trim() || ''
      if (text) {
        setPromoMessage(text)
        setPromoMessageGenerated(true)
      }
    } catch { /* silent */ } finally { setGeneratingMessage(false) }
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
      {!generating && posts.length === 0 && savedPosts.length === 0 && !importing && (
        <div style={{ padding: '64px 52px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', maxWidth: '640px', margin: '0 auto' }}>
            {/* Generate */}
            <button
              onClick={generate}
              style={{
                background: 'var(--panel)', border: '1px solid var(--border-dim)',
                padding: '40px 28px', cursor: 'pointer', textAlign: 'center',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-dim)'}
            >
              <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '12px', fontFamily: 'var(--font-mono)' }}>
                Generate campaign
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>
                10 posts · audio preview cadence · platform-optimised timing
              </div>
            </button>

            {/* Import */}
            <button
              onClick={() => setImporting(true)}
              style={{
                background: 'var(--panel)', border: '1px solid var(--border-dim)',
                padding: '40px 28px', cursor: 'pointer', textAlign: 'center',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-dim)'}
            >
              <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '12px', fontFamily: 'var(--font-mono)' }}>
                Import campaign
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>
                Screenshot or paste from label plan, Google Sheet, or notes
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Import mode */}
      {importing && posts.length === 0 && (
        <div style={{ padding: '36px 52px 48px', maxWidth: '720px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase' }}>
              Import campaign
            </div>
            <button onClick={() => setImporting(false)} style={{
              fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--text-dimmer)', background: 'none', border: '1px solid var(--border-dim)',
              padding: '5px 12px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
            }}>
              Cancel
            </button>
          </div>

          {/* Screenshot upload */}
          <div style={{ marginBottom: '20px' }}>
            <ScreenshotUpload
              extractionPrompt={`Extract a release campaign plan from this image. Return JSON array of posts/tasks with: phase (e.g. ANNOUNCEMENT, AUDIO PREVIEW 1, DROP DAY, etc.), days_offset (number relative to release date, negative = before), platform (Instagram/Stories/TikTok/Twitter/All), caption (the post content or task), dm_reply (empty string), rationale (brief note). The release date is ${release?.release_date || 'unknown'}. Only extract what you can see — NEVER fabricate.`}
              onExtracted={(fields) => {
                if (Array.isArray(fields)) {
                  setPosts(fields)
                  setSaved(false)
                  setImporting(false)
                } else {
                  setError('Could not extract campaign from screenshot')
                }
              }}
            />
          </div>

          {/* Or paste text */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '28px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '14px' }}>
              Or paste campaign plan
            </div>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder="Paste from Google Sheet, email, Notion, label campaign doc..."
              rows={8}
              style={{
                width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)',
                color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '12px',
                padding: '14px 16px', outline: 'none', boxSizing: 'border-box',
                resize: 'vertical', lineHeight: 1.6, marginBottom: '14px',
              }}
            />
            <button
              onClick={() => parseImportedCampaign(importText)}
              disabled={!importText.trim() || importingFromText}
              style={{
                background: 'var(--gold)', color: '#070706', border: 'none',
                padding: '0 28px', height: '40px', fontSize: '10px',
                letterSpacing: '0.16em', textTransform: 'uppercase',
                cursor: !importText.trim() || importingFromText ? 'not-allowed' : 'pointer',
                opacity: !importText.trim() || importingFromText ? 0.5 : 1,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {importingFromText ? 'Parsing…' : 'Import →'}
            </button>
          </div>
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

      {/* PROMO SERVICE PANEL */}
      {release && (
        <section style={{ borderTop: '1px solid var(--border-dim)', padding: '36px 52px 52px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <span style={{ display: 'block', width: '20px', height: '1px', background: 'var(--gold)' }} />
            Promo
          </div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '16px', fontWeight: 300, letterSpacing: '0.03em', marginBottom: '6px' }}>
            Service this release
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '28px' }}>
            Send to your promo list via email, WhatsApp, or Instagram.
            {promoList.length === 0 && (
              <span> <Link href="/business/settings" style={{ color: 'var(--gold)' }}>Add contacts in Settings → Promo list</Link></span>
            )}
          </div>

          {promoList.length > 0 && (
            <>
              {/* Channel selector */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                {(['email', 'whatsapp', 'instagram'] as const).map(ch => (
                  <button
                    key={ch}
                    onClick={() => setPromoChannel(ch)}
                    style={{
                      padding: '8px 20px', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase',
                      fontFamily: 'var(--font-mono)', cursor: 'pointer',
                      background: promoChannel === ch ? 'var(--gold)' : 'none',
                      color: promoChannel === ch ? '#070706' : 'var(--text-dimmer)',
                      border: promoChannel === ch ? 'none' : '1px solid var(--border-dim)',
                    }}
                  >
                    {ch === 'email' ? 'Email' : ch === 'whatsapp' ? 'WhatsApp' : 'Instagram'}
                  </button>
                ))}
              </div>

              {/* Contact list */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.16em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Select contacts</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setSelectedPromo(new Set(promoList.filter(c => promoChannel === 'email' ? c.email : promoChannel === 'whatsapp' ? c.whatsapp : c.instagram).map(c => c.id)))}
                      style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dimmer)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)' }}>
                      Select all
                    </button>
                    <span style={{ color: 'var(--border-dim)' }}>·</span>
                    <button onClick={() => setSelectedPromo(new Set())}
                      style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dimmer)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)' }}>
                      Clear
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {promoList.map(contact => {
                    const hasChannel = promoChannel === 'email' ? !!contact.email : promoChannel === 'whatsapp' ? !!contact.whatsapp : !!contact.instagram
                    const channelValue = promoChannel === 'email' ? contact.email : promoChannel === 'whatsapp' ? contact.whatsapp : contact.instagram
                    const isSent = promoSent.includes(contact.id)
                    const isSelected = selectedPromo.has(contact.id)
                    return (
                      <div
                        key={contact.id}
                        onClick={() => {
                          if (!hasChannel) return
                          const next = new Set(selectedPromo)
                          if (next.has(contact.id)) next.delete(contact.id)
                          else next.add(contact.id)
                          setSelectedPromo(next)
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '10px 14px', border: `1px solid ${isSelected ? 'rgba(176,141,87,0.4)' : 'var(--border-dim)'}`,
                          background: isSelected ? 'rgba(176,141,87,0.05)' : 'var(--panel)',
                          cursor: hasChannel ? 'pointer' : 'default',
                          opacity: hasChannel ? 1 : 0.4,
                        }}
                      >
                        <div style={{
                          width: '14px', height: '14px', border: `1px solid ${isSelected ? 'var(--gold)' : 'var(--border-dim)'}`,
                          background: isSelected ? 'var(--gold)' : 'transparent', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isSelected && <span style={{ fontSize: '8px', color: '#070706', fontWeight: 'bold' }}>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text)' }}>{contact.name}</span>
                            {contact.tag && <span style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '1px 5px' }}>{contact.tag}</span>}
                            {isSent && <span style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)' }}>Sent ✓</span>}
                          </div>
                          {channelValue && <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '2px' }}>{channelValue}</div>}
                          {!hasChannel && <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '2px' }}>No {promoChannel} on file</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Message composer */}
              {selectedPromo.size > 0 && (
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '20px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.16em', color: 'var(--text-dimmer)', textTransform: 'uppercase' }}>
                      Message
                    </div>
                    <button
                      onClick={generatePromoMessage}
                      disabled={generatingMessage}
                      style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', background: 'none', border: '1px solid var(--gold-dim)', padding: '4px 12px', cursor: generatingMessage ? 'wait' : 'pointer', fontFamily: 'var(--font-mono)', opacity: generatingMessage ? 0.5 : 1 }}
                    >
                      {generatingMessage ? 'Drafting…' : promoMessageGenerated ? 'Redraft' : 'Draft message'}
                    </button>
                  </div>
                  <textarea
                    value={promoMessage}
                    onChange={e => setPromoMessage(e.target.value)}
                    rows={5}
                    placeholder={`Write your promo message for ${release.title}…`}
                    style={{
                      width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)',
                      color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px',
                      padding: '12px 14px', lineHeight: 1.6, resize: 'vertical',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {/* Send actions */}
              {selectedPromo.size > 0 && promoMessage.trim() && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {promoChannel === 'email' && (
                    <button
                      onClick={async () => {
                        const contacts = promoList.filter(c => selectedPromo.has(c.id) && c.email)
                        if (!contacts.length || !promoMessage.trim()) return
                        setPromoSending(true)
                        try {
                          const res = await fetch('/api/promo/send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              contacts: contacts.map(c => ({ id: c.id, name: c.name, email: c.email })),
                              message: promoMessage,
                              subject: `${release.title} — out ${release.release_date}`,
                              releaseId: params.id,
                            }),
                          })
                          const data = await res.json()
                          if (data.sent) setPromoSent(prev => [...prev, ...data.sent])
                        } catch { /* silent */ } finally { setPromoSending(false) }
                      }}
                      disabled={promoSending}
                      style={{
                        background: 'var(--gold)', color: '#070706', border: 'none',
                        padding: '0 28px', height: '40px', fontSize: '10px',
                        letterSpacing: '0.16em', textTransform: 'uppercase',
                        cursor: promoSending ? 'wait' : 'pointer', fontFamily: 'var(--font-mono)',
                        width: 'fit-content',
                      }}
                    >
                      {promoSending ? 'Sending…' : `Send to ${selectedPromo.size} contact${selectedPromo.size > 1 ? 's' : ''} →`}
                    </button>
                  )}

                  {promoChannel === 'whatsapp' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {promoList.filter(c => selectedPromo.has(c.id) && c.whatsapp).map(contact => (
                        <a
                          key={contact.id}
                          href={`https://wa.me/${contact.whatsapp?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(promoMessage)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setPromoSent(prev => prev.includes(contact.id) ? prev : [...prev, contact.id])}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '10px',
                            background: 'none', border: '1px solid rgba(61,107,74,0.4)',
                            color: 'var(--green)', padding: '0 20px', height: '36px',
                            fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase',
                            textDecoration: 'none', fontFamily: 'var(--font-mono)', width: 'fit-content',
                          }}
                        >
                          Open WhatsApp → {contact.name}
                        </a>
                      ))}
                      <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '4px' }}>
                        Opens WhatsApp with your message pre-filled — tap send in the app.
                      </div>
                    </div>
                  )}

                  {promoChannel === 'instagram' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(promoMessage)
                          setPromoCopied('message')
                          setTimeout(() => setPromoCopied(null), 2000)
                        }}
                        style={{
                          background: 'none', border: '1px solid var(--border-dim)',
                          color: promoCopied === 'message' ? 'var(--green)' : 'var(--text-dimmer)',
                          padding: '0 20px', height: '36px', fontSize: '10px',
                          letterSpacing: '0.14em', textTransform: 'uppercase',
                          cursor: 'pointer', fontFamily: 'var(--font-mono)', width: 'fit-content',
                        }}
                      >
                        {promoCopied === 'message' ? 'Copied ✓' : 'Copy message'}
                      </button>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                        {promoList.filter(c => selectedPromo.has(c.id) && c.instagram).map(contact => (
                          <a
                            key={contact.id}
                            href={`https://instagram.com/${contact.instagram}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setPromoSent(prev => prev.includes(contact.id) ? prev : [...prev, contact.id])}
                            style={{
                              fontSize: '10px', letterSpacing: '0.1em', color: 'var(--gold)',
                              border: '1px solid var(--gold-dim)', padding: '4px 12px',
                              textDecoration: 'none', fontFamily: 'var(--font-mono)',
                            }}
                          >
                            @{contact.instagram}
                          </a>
                        ))}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>
                        Copy message above, then open each profile to DM.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
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
