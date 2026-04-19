'use client'

import { useEffect, useMemo, useState } from 'react'
import { BRT } from '@/lib/design/brt'
import { supabase } from '@/lib/supabaseBrowser'
import { flagCaption, runVoiceCheck, scrubAiTells, type FlaggedRange } from '@/lib/voiceCheck'
import { RefManagerDrawer } from './chain/RefManagerDrawer'
import type { VoiceRef } from './chain/types'

interface ArtistProfile {
  id: string
  artist_name: string | null
  instagram_handle?: string | null
}

const PRESETS = [
  { label: 'Show announce', prompt: "announce tomorrow's show at warehouse 9" },
  { label: 'Release', prompt: 'new track out friday' },
  { label: 'Studio', prompt: 'studio day, working on the new ep' },
]

function buildAlignedSystem(refs: VoiceRef[]): string {
  const voice = refs.length === 0
    ? 'Default tone: terse, lowercase, specific, observational.'
    : refs.map(r => r.kind === 'self'
        ? `- You (NIGHT manoeuvres) [weight ${r.weight}]: terse, lowercase, time-stamped, specific.`
        : `- ${r.name} [weight ${r.weight}]: match cadence and word choice.`
      ).join('\n')
  return `You write a single social caption in the artist's aligned voice.

VOICE BLEND:
${voice}

HARD RULES:
- No em-dashes (—) or en-dashes (–).
- No hashtags, no @mentions.
- Lowercase default.
- Never open with "a photo of", "here's a", "this is".
- No clichés: "diving into", "unpack", "unleash", "elevate", "unmissable", "tapestry", "journey".
- No superlatives: "incredible", "amazing", "magical", "epic", "legendary".
- No AI mentions.
- Stay specific — if the user's prompt mentions a concrete thing, keep it.
- Output the caption only. No commentary, no quotes.`
}

const DRIFT_SYSTEM = `You write a single generic brand-voice social caption, the kind a cliché AI assistant would produce for a major artist without a voice profile.

Use at least ONE em-dash. Use at least TWO brand-voice clichés from this list: "diving into", "unpack", "unleash", "elevate", "unmissable", "journey", "unveil", "tapestry", "realm", "at the forefront", "unlock the magic". Use at least ONE superlative ("incredible", "amazing", "magical", "epic", "legendary", "breathtaking", "phenomenal"). Be overwrought, generic, corporate.

Output the caption only. No commentary, no quotes.`

async function callCaption(system: string, user: string): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      system,
      max_tokens: 400,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `API error ${res.status}`)
  const text = data.content?.[0]?.text
  if (!text) throw new Error('Empty response')
  return text.trim()
}

/**
 * ArtistVoicePage — the dedicated proof surface. Lives at /broadcast/voice.
 * Not a sidebar tab. Reached from the chain's alignment badge and onboarding.
 *
 * Core sell: same prompt run two ways — aligned (green ships) vs unaligned AI
 * drift (red blocked with inline flagged words).
 */
export function ArtistVoicePage() {
  const [refs, setRefs] = useState<VoiceRef[]>([])
  const [refsOpen, setRefsOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [aligned, setAligned] = useState<string | null>(null)
  const [drift, setDrift] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [available, setAvailable] = useState<Record<string, ArtistProfile>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('user_voice_refs')
        .select('id, artist_profile_id, display_name, weight, display_order, artist_profiles(id, artist_name, instagram_handle)')
        .eq('user_id', user.id)
        .order('display_order')
      if (cancelled) return
      if (data && data.length > 0) {
        const mapped: VoiceRef[] = data.map((row: any) => {
          const isSelf = !row.artist_profile_id
          const name = isSelf
            ? 'You · NM'
            : row.display_name
              || row.artist_profiles?.artist_name
              || row.artist_profiles?.instagram_handle
              || 'Reference'
          return {
            id: row.id,
            name,
            weight: row.weight,
            kind: isSelf ? 'self' : 'artist',
            artist_profile_id: row.artist_profile_id ?? null,
          }
        })
        setRefs(mapped)
      } else {
        setRefs([{ id: 'self-default', name: 'You · NM', weight: 100, kind: 'self' }])
      }

      const { data: profs } = await supabase.from('artist_profiles').select('id, artist_name, instagram_handle').limit(200)
      if (!cancelled && profs) {
        const byId: Record<string, ArtistProfile> = {}
        profs.forEach((p: any) => { byId[p.id] = p })
        setAvailable(byId)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function generate(p: string) {
    const q = p.trim()
    if (!q) return
    setLoading(true)
    setErr(null)
    setAligned(null)
    setDrift(null)
    try {
      const [a, d] = await Promise.all([
        callCaption(buildAlignedSystem(refs), q),
        callCaption(DRIFT_SYSTEM, q),
      ])
      setAligned(scrubAiTells(a))
      setDrift(d)
    } catch (e: any) {
      setErr(e?.message || 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  const alignmentScore = useMemo(() => {
    if (refs.length === 0) return 0
    const self = refs.find(r => r.kind === 'self')?.weight ?? 0
    const others = refs.filter(r => r.kind !== 'self')
    const otherAvg = others.length ? others.reduce((a, b) => a + b.weight, 0) / others.length : 0
    return Math.min(100, Math.round(self * 0.6 + otherAvg * 0.4))
  }, [refs])

  const alignedCheck = aligned ? runVoiceCheck(aligned) : null
  const driftFlags = drift ? flagCaption(drift) : []

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BRT.bg,
        color: BRT.ink,
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        WebkitFontSmoothing: 'antialiased',
        letterSpacing: '-0.005em',
        position: 'relative',
      }}
    >
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 60, backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.012) 0 1px, transparent 1px 3px)', mixBlendMode: 'overlay' }} />
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 61, opacity: 0.28, backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.06  0 0 0 0 0.06  0 0 0 0 0.06  0 0 0 0.24 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")", backgroundSize: '160px 160px' }} />

      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          gridTemplateRows: 'auto auto auto 1fr',
          padding: '20px 32px 24px',
          gap: 16,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 24,
            paddingBottom: 14,
            borderBottom: `1px solid ${BRT.divide}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, minWidth: 0, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.3em', color: '#5a5a5a', fontWeight: 700, textTransform: 'uppercase' }}>
              Broadcast / Tone
            </div>
            <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1, color: BRT.ink }}>
              ARTIST VOICE
            </div>
            <div style={{ color: '#9a9a9a', fontSize: 12, lineHeight: 1.45, maxWidth: 440 }}>
              Align to artists you lean into, plus yourself. Every caption runs through this blend —{' '}
              <strong style={{ color: BRT.ink, fontWeight: 700 }}>nothing ships sounding like AI.</strong>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 16,
              fontSize: 10,
              letterSpacing: '0.22em',
              color: '#5a5a5a',
              fontWeight: 700,
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            <div>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: BRT.green, marginRight: 6 }} />
              Voice locked
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', color: BRT.ink }}>
                {alignmentScore}
              </span>
              /100
            </div>
          </div>
        </div>

        {/* References row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
          {refs.slice(0, 4).map(r => (
            <div
              key={r.id}
              style={{
                background: BRT.ticket,
                border: `1px solid ${r.kind === 'self' ? BRT.red : BRT.borderBright}`,
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    letterSpacing: '-0.01em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {r.name}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    letterSpacing: '0.2em',
                    color: r.kind === 'self' ? BRT.red : '#5a5a5a',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    flexShrink: 0,
                  }}
                >
                  {r.kind === 'self' ? 'SELF' : 'REF'}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 'auto',
                  paddingTop: 6,
                  borderTop: `1px solid ${BRT.divide}`,
                }}
              >
                <span style={{ fontSize: 8, letterSpacing: '0.22em', color: '#5a5a5a', fontWeight: 700, textTransform: 'uppercase' }}>W</span>
                <div style={{ flex: 1, height: 2, background: BRT.divide, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${r.weight}%`, background: BRT.red }} />
                </div>
                <span style={{ fontSize: 10, color: BRT.ink, fontWeight: 700, minWidth: 22, textAlign: 'right' }}>
                  {r.weight}
                </span>
              </div>
            </div>
          ))}
          {Array.from({ length: Math.max(0, 4 - refs.slice(0, 4).length) }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          <button
            onClick={() => setRefsOpen(true)}
            style={{
              background: 'transparent',
              border: `1px dashed ${BRT.borderBright}`,
              color: '#5a5a5a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 4,
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: 12,
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 300, lineHeight: 1 }}>+</div>
            <div style={{ fontSize: 9, letterSpacing: '0.22em', fontWeight: 700, textTransform: 'uppercase' }}>
              Add ref
            </div>
          </button>
        </div>

        {/* Prompt bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto auto',
            gap: 12,
            alignItems: 'stretch',
            background: BRT.ticket,
            border: `1px solid ${BRT.red}`,
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: '0.28em', color: BRT.red, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>
            ◉ Test prompt
          </div>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                generate(prompt)
              }
            }}
            placeholder="type something · e.g. 'announce tomorrow at warehouse 9'"
            style={{
              background: 'transparent',
              border: 'none',
              color: BRT.ink,
              fontSize: 18,
              fontFamily: 'inherit',
              letterSpacing: '-0.01em',
              fontWeight: 500,
              outline: 'none',
              width: '100%',
              padding: 0,
            }}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => { setPrompt(p.prompt); generate(p.prompt) }}
                style={{
                  padding: '6px 10px',
                  background: 'transparent',
                  border: `1px solid ${BRT.borderBright}`,
                  color: '#9a9a9a',
                  fontSize: 10,
                  letterSpacing: '0.2em',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => generate(prompt)}
            disabled={loading || !prompt.trim()}
            style={{
              padding: '10px 18px',
              background: loading || !prompt.trim() ? BRT.dimmest : BRT.red,
              border: 'none',
              color: BRT.bg,
              fontSize: 11,
              letterSpacing: '0.24em',
              fontWeight: 800,
              textTransform: 'uppercase',
              cursor: loading || !prompt.trim() ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>

        {/* Comparison */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, minHeight: 0 }}>
          {/* Aligned panel */}
          <Panel
            borderColor={BRT.red}
            label="◉ Your aligned voice"
            labelColor={BRT.red}
            status={aligned ? { text: '● Ships', color: BRT.green } : null}
          >
            {err && <div style={{ color: BRT.red, fontSize: 12 }}>{err}</div>}
            {!aligned ? (
              <Empty icon="↓" label="Type a prompt to hear your voice" />
            ) : (
              <>
                <Body>{aligned}</Body>
                {alignedCheck && (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Check label="No em-dash" ok={alignedCheck.em_dash.ok} />
                    <Check label="No clichés" ok={alignedCheck.cliches.ok} />
                    <Check label="Specific" ok={alignedCheck.specific.ok} />
                    <Check label="Human" ok={alignedCheck.human.ok} />
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 8,
                    borderTop: `1px solid ${BRT.divide}`,
                    marginTop: 'auto',
                  }}
                >
                  <span style={{ fontSize: 10, letterSpacing: '0.28em', color: BRT.green, fontWeight: 700, textTransform: 'uppercase' }}>
                    Passes voice check
                  </span>
                </div>
              </>
            )}
          </Panel>

          {/* Drift panel */}
          <Panel
            borderColor={BRT.borderBright}
            label="Same prompt · unaligned AI"
            labelColor="#5a5a5a"
            status={drift ? { text: '● Blocked', color: BRT.red } : null}
          >
            {!drift ? (
              <Empty icon="✕" label="What we'd block by default" />
            ) : (
              <>
                <FlaggedBody text={drift} flags={driftFlags} />
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 8,
                    borderTop: `1px solid ${BRT.divide}`,
                    marginTop: 'auto',
                  }}
                >
                  <span style={{ fontSize: 10, letterSpacing: '0.28em', color: BRT.red, fontWeight: 700, textTransform: 'uppercase' }}>
                    Blocked pre-send · AI drift
                  </span>
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>

      <RefManagerDrawer
        open={refsOpen}
        refs={refs}
        onClose={() => setRefsOpen(false)}
        onChange={setRefs}
      />
    </div>
  )
}

function Panel({
  borderColor,
  label,
  labelColor,
  status,
  children,
}: {
  borderColor: string
  label: string
  labelColor: string
  status: { text: string; color: string } | null
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: BRT.ticket,
        border: `1px solid ${borderColor}`,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.28em', fontWeight: 700, textTransform: 'uppercase', color: labelColor }}>
          {label}
        </div>
        {status && (
          <div style={{ fontSize: 10, letterSpacing: '0.22em', fontWeight: 700, textTransform: 'uppercase', color: status.color }}>
            {status.text}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

function Empty({ icon, label }: { icon: string; label: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        color: '#5a5a5a',
        textAlign: 'center',
        background: BRT.ticketLo,
        border: `1px dashed ${BRT.borderBright}`,
        padding: 24,
      }}
    >
      <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-0.03em', color: BRT.dimmest, lineHeight: 1 }}>
        {icon}
      </div>
      <div style={{ fontSize: 10, letterSpacing: '0.28em', fontWeight: 700, textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 17,
        lineHeight: 1.5,
        letterSpacing: '-0.008em',
        padding: '14px 16px',
        background: BRT.ticketLo,
        border: `1px solid ${BRT.borderBright}`,
        fontWeight: 500,
        color: BRT.ink,
        whiteSpace: 'pre-wrap',
      }}
    >
      {children}
    </div>
  )
}

function FlaggedBody({ text, flags }: { text: string; flags: FlaggedRange[] }) {
  const pieces: React.ReactNode[] = []
  let cursor = 0
  flags.forEach((f, i) => {
    if (f.start > cursor) pieces.push(<span key={`t-${i}`}>{text.slice(cursor, f.start)}</span>)
    pieces.push(
      <span
        key={`f-${i}`}
        title={f.kind.replace('_', ' ')}
        style={{
          color: BRT.red,
          textDecoration: 'underline',
          textDecorationColor: BRT.red,
          textDecorationThickness: 2,
          cursor: 'help',
        }}
      >
        {text.slice(f.start, f.end)}
      </span>
    )
    cursor = f.end
  })
  if (cursor < text.length) pieces.push(<span key="tail">{text.slice(cursor)}</span>)
  return (
    <div
      style={{
        fontSize: 17,
        lineHeight: 1.5,
        letterSpacing: '-0.008em',
        padding: '14px 16px',
        background: BRT.ticketLo,
        border: `1px solid ${BRT.borderBright}`,
        fontWeight: 400,
        color: '#9a9a9a',
        whiteSpace: 'pre-wrap',
      }}
    >
      {pieces}
    </div>
  )
}

function Check({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span
        style={{
          width: 12,
          height: 12,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 8,
          fontWeight: 900,
          background: ok ? BRT.green : BRT.red,
          color: BRT.bg,
          flexShrink: 0,
        }}
      >
        {ok ? '✓' : '×'}
      </span>
      <span style={{ fontSize: 9, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase', color: ok ? '#9a9a9a' : BRT.red }}>
        {label}
      </span>
    </div>
  )
}
