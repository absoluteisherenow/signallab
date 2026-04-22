'use client'

// Content-prompt engine surface. Hits /api/brain/content-prompts and renders
// the generated concepts as a grid of cards Anthony can copy or carry into
// Broadcast. Per project_nm brain priorities: content + growth > inbound.
//
// State summary banner at the top shows WHAT the brain saw when it generated —
// mission, active threads, perf signals — so the output is legible, not magic.

import { useEffect, useState } from 'react'

type Platform = 'instagram' | 'tiktok' | 'threads'

interface Concept {
  slug: string
  hook: string
  format: 'carousel' | 'reel' | 'photo' | 'story' | 'text'
  rationale: string
  caption_draft: string
  narrative_anchor: string | null
  tie_in_gig: string | null
  capture_window: string | null
}

interface StateSummary {
  mission: string | null
  mission_north_star: string | null
  next_gig: string | null
  next_gig_date: string | null
  active_narratives: string[]
  upcoming_gigs_count: number
  top_posts_count: number
  red_flags: string[]
  positive_signals: string[]
}

interface Response {
  ok: true
  platform: Platform
  task: string
  generated_at: string
  window_days: number
  state_summary: StateSummary
  concepts: Concept[]
  usage?: { cost_usd?: number }
}

const BRT = {
  bg: '#000',
  ink: '#f2f2f2',
  border: '#1a1a1a',
  borderBright: '#2a2a2a',
  dim: '#6a6a6a',
  red: '#ff2a1a',
  warn: '#ffb546',
  ok: '#7aff9e',
}

const box: React.CSSProperties = { border: `1px solid ${BRT.border}`, background: '#0a0a0a', padding: 16 }
const label: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: BRT.dim,
}
const btn: React.CSSProperties = {
  background: BRT.red,
  color: '#000',
  border: 0,
  padding: '10px 18px',
  fontFamily: 'monospace',
  fontSize: 12,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  background: 'transparent',
  color: BRT.dim,
  border: `1px solid ${BRT.border}`,
  padding: '8px 14px',
  fontFamily: 'monospace',
  fontSize: 11,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}

const platformChipBase: React.CSSProperties = {
  padding: '8px 14px',
  fontFamily: 'monospace',
  fontSize: 11,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}

function fmtFormat(f: Concept['format']): string {
  return f.toUpperCase()
}

function capWindowColor(w: string | null): string {
  if (!w) return BRT.dim
  if (w === 'soundcheck' || w === 'studio') return BRT.ok
  if (w === 'travel' || w === 'pre-show' || w === 'post-show') return BRT.warn
  return BRT.dim
}

export default function ContentPromptsAdmin() {
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [count, setCount] = useState(5)
  const [windowDays, setWindowDays] = useState(21)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Response | null>(null)
  const [error, setError] = useState<string>('')
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/brain/content-prompts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform, count, window_days: windowDays }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || `HTTP ${res.status}`)
        setData(null)
        return
      }
      setData(body as Response)
    } catch (e: any) {
      setError(e?.message || 'generation failed')
    } finally {
      setLoading(false)
    }
  }

  async function copy(slug: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug((s) => (s === slug ? null : s)), 1600)
    } catch {
      // ignored — user likely denied clipboard. Fallback: select manually.
    }
  }

  return (
    <div style={{ background: BRT.bg, color: BRT.ink, minHeight: '100vh', fontFamily: 'monospace', padding: '40px 32px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <div style={{ ...label, color: BRT.red, marginBottom: 6 }}>Brain · content prompts</div>
            <h1 style={{ fontSize: 28, margin: 0, fontWeight: 500 }}>What to post next</h1>
            <div style={{ fontSize: 12, color: BRT.dim, marginTop: 6 }}>
              Grounded in active narratives, upcoming gigs, and what&apos;s been moving followers.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 0 }}>
              {(['instagram', 'tiktok', 'threads'] as Platform[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  style={{
                    ...platformChipBase,
                    background: platform === p ? BRT.red : 'transparent',
                    color: platform === p ? '#000' : BRT.dim,
                    border: `1px solid ${platform === p ? BRT.red : BRT.border}`,
                    borderRight: p === 'threads' ? `1px solid ${platform === p ? BRT.red : BRT.border}` : 'none',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            <select
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10))}
              style={{
                background: 'transparent',
                color: BRT.ink,
                border: `1px solid ${BRT.border}`,
                padding: '8px 10px',
                fontFamily: 'inherit',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {[3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n} style={{ background: BRT.bg }}>
                  {n} concepts
                </option>
              ))}
            </select>
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(parseInt(e.target.value, 10))}
              style={{
                background: 'transparent',
                color: BRT.ink,
                border: `1px solid ${BRT.border}`,
                padding: '8px 10px',
                fontFamily: 'inherit',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {[7, 14, 21, 30, 45, 60].map((d) => (
                <option key={d} value={d} style={{ background: BRT.bg }}>
                  {d}-day window
                </option>
              ))}
            </select>
            <button onClick={generate} disabled={loading} style={{ ...btn, opacity: loading ? 0.5 : 1, cursor: loading ? 'default' : 'pointer' }}>
              {loading ? 'Generating…' : data ? 'Regenerate' : 'Generate'}
            </button>
          </div>
        </div>

        {error ? (
          <div style={{ ...box, borderColor: BRT.red, color: BRT.red, marginBottom: 24, fontSize: 12 }}>
            {error}
          </div>
        ) : null}

        {data ? (
          <>
            <div style={{ ...box, marginBottom: 24 }}>
              <div style={{ ...label, marginBottom: 10 }}>State at generation</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, fontSize: 12 }}>
                <div>
                  <div style={{ color: BRT.dim, marginBottom: 4 }}>Mission</div>
                  <div>{data.state_summary.mission || '—'}</div>
                  {data.state_summary.mission_north_star ? (
                    <div style={{ color: BRT.dim, marginTop: 4, fontSize: 11 }}>
                      ★ {data.state_summary.mission_north_star}
                    </div>
                  ) : null}
                </div>
                <div>
                  <div style={{ color: BRT.dim, marginBottom: 4 }}>Next gig</div>
                  <div>{data.state_summary.next_gig || '—'}</div>
                  <div style={{ color: BRT.dim, marginTop: 4, fontSize: 11 }}>
                    {data.state_summary.next_gig_date || ''} · {data.state_summary.upcoming_gigs_count} in window
                  </div>
                </div>
                <div>
                  <div style={{ color: BRT.dim, marginBottom: 4 }}>Active threads</div>
                  <div>{data.state_summary.active_narratives.length ? data.state_summary.active_narratives.join(', ') : '—'}</div>
                </div>
                <div>
                  <div style={{ color: BRT.dim, marginBottom: 4 }}>Perf signals</div>
                  {data.state_summary.positive_signals.map((s, i) => (
                    <div key={`p${i}`} style={{ color: BRT.ok, fontSize: 11 }}>
                      + {s}
                    </div>
                  ))}
                  {data.state_summary.red_flags.map((s, i) => (
                    <div key={`r${i}`} style={{ color: BRT.warn, fontSize: 11 }}>
                      ! {s}
                    </div>
                  ))}
                  {!data.state_summary.positive_signals.length && !data.state_summary.red_flags.length ? (
                    <div style={{ color: BRT.dim }}>—</div>
                  ) : null}
                </div>
              </div>
              <div style={{ fontSize: 10, color: BRT.dim, marginTop: 12, letterSpacing: '0.1em' }}>
                Generated {new Date(data.generated_at).toLocaleTimeString()} · Window {data.window_days}d
                {data.usage?.cost_usd ? ` · $${data.usage.cost_usd.toFixed(4)}` : ''}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                gap: 16,
              }}
            >
              {data.concepts.map((c) => {
                const copied = copiedSlug === c.slug
                return (
                  <div key={c.slug} style={{ ...box, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ ...label, color: BRT.red }}>{fmtFormat(c.format)}</div>
                      {c.capture_window ? (
                        <div style={{ ...label, color: capWindowColor(c.capture_window) }}>{c.capture_window}</div>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 16, lineHeight: 1.35, color: BRT.ink }}>{c.hook}</div>
                    <div style={{ fontSize: 11, color: BRT.dim, lineHeight: 1.5 }}>{c.rationale}</div>

                    {c.narrative_anchor || c.tie_in_gig ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {c.narrative_anchor ? (
                          <span
                            style={{
                              fontSize: 10,
                              letterSpacing: '0.1em',
                              textTransform: 'uppercase',
                              color: BRT.dim,
                              border: `1px solid ${BRT.border}`,
                              padding: '3px 8px',
                            }}
                          >
                            thread · {c.narrative_anchor}
                          </span>
                        ) : null}
                        {c.tie_in_gig ? (
                          <span
                            style={{
                              fontSize: 10,
                              letterSpacing: '0.1em',
                              textTransform: 'uppercase',
                              color: BRT.warn,
                              border: `1px solid ${BRT.border}`,
                              padding: '3px 8px',
                            }}
                          >
                            gig · {c.tie_in_gig}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div
                      style={{
                        borderTop: `1px solid ${BRT.border}`,
                        paddingTop: 10,
                        fontSize: 12,
                        color: BRT.ink,
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.5,
                        background: 'rgba(255,255,255,0.02)',
                        padding: 10,
                        marginTop: 4,
                      }}
                    >
                      {c.caption_draft}
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                      <button
                        onClick={() => copy(c.slug, c.caption_draft)}
                        style={{ ...btnGhost, flex: 1, color: copied ? BRT.ok : BRT.dim, borderColor: copied ? BRT.ok : BRT.border }}
                      >
                        {copied ? '✓ Copied' : 'Copy caption'}
                      </button>
                      <button
                        onClick={() => copy(c.slug + '-full', `${c.hook}\n\n${c.caption_draft}`)}
                        style={{ ...btnGhost }}
                      >
                        + Hook
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : !loading ? (
          <div style={{ ...box, textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 14, color: BRT.ink, marginBottom: 8 }}>
              Hit <span style={{ color: BRT.red }}>Generate</span> to see what the brain would post next.
            </div>
            <div style={{ fontSize: 11, color: BRT.dim }}>
              Reads your active narratives, upcoming gigs, and recent performance. Takes 10–20 seconds.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
