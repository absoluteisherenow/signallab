'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BRT } from '@/lib/design/brt'
import { supabase } from '@/lib/supabaseBrowser'
import type { ChainScanResult } from '@/lib/chainScan'
import { PhaseRail } from './chain/PhaseRail'
import { SignalLabHeader } from './SignalLabHeader'
import { MediaStrip } from './chain/MediaStrip'
import { PhaseDrop } from './chain/PhaseDrop'
import { PhaseScan } from './chain/PhaseScan'
import { PhaseScanResults } from './chain/PhaseScanResults'
import { PhaseVoice } from './chain/PhaseVoice'
import { RefManagerDrawer } from './chain/RefManagerDrawer'
import type { ChainPhase, VoiceRef, VoiceRefProfile } from './chain/types'

/**
 * Columns we pull off artist_profiles for every ref. This is the deep-dive
 * payload written by /api/artist-scan — style_rules, visual_aesthetic, etc.
 * Without these, caption gen has only names + weights and writes fortune
 * cookies. With them, Claude has real voice evidence to blend from.
 */
// NOTE: the actual columns on artist_profiles are `name` and `handle`, NOT
// `artist_name` / `instagram_handle`. Earlier code in the repo used the wrong
// names and silently fell back to display_name, which is why NM's deep-dive
// data never reached caption gen even though it's been sitting in the table
// since 2026-04-07 (50 posts, opus deep dive, full chips + style_rules).
const ARTIST_PROFILE_COLS = 'id, name, handle, biography, style_rules, chips, lowercase_pct, short_caption_pct, no_hashtags_pct, brand_positioning, content_strategy_notes, visual_aesthetic, content_performance'

function profileFromRow(row: any | null | undefined): VoiceRefProfile | null {
  if (!row) return null
  return {
    handle: row.handle ?? null,
    biography: row.biography ?? null,
    style_rules: row.style_rules ?? null,
    chips: row.chips ?? null,
    lowercase_pct: row.lowercase_pct ?? null,
    short_caption_pct: row.short_caption_pct ?? null,
    no_hashtags_pct: row.no_hashtags_pct ?? null,
    brand_positioning: row.brand_positioning ?? null,
    content_strategy_notes: row.content_strategy_notes ?? null,
    visual_aesthetic: row.visual_aesthetic ?? null,
    content_performance: row.content_performance ?? null,
  }
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function buildMediaMeta(file: File): string {
  const size = fmtBytes(file.size)
  const isVid = file.type.startsWith('video/')
  const kind = isVid ? 'VIDEO' : 'IMAGE'
  return `${size} · ${kind}`
}

/**
 * Alignment score = simple deterministic blend of weights.
 * Real scoring can swap in later without UI changes.
 */
function computeAlignment(refs: VoiceRef[]): number {
  if (refs.length === 0) return 0
  const self = refs.find(r => r.kind === 'self')
  const others = refs.filter(r => r.kind !== 'self')
  const selfW = self?.weight ?? 0
  const otherAvg = others.length ? others.reduce((a, b) => a + b.weight, 0) / others.length : 0
  // Weight the user themselves at 60%, the blend at 40%.
  return Math.min(100, Math.round(selfW * 0.6 + otherAvg * 0.4))
}

/**
 * BroadcastChain — the single-page chain flow that replaced the old tab-heavy
 * Broadcast Lab. Phases run top to bottom: Drop → Scan → Voice → Approve.
 * Each phase reveals only when the previous one has produced its output.
 */
export function BroadcastChain() {
  const [phase, setPhase] = useState<ChainPhase>('drop')
  const [file, setFile] = useState<File | null>(null)
  const [scanResult, setScanResult] = useState<ChainScanResult | null>(null)
  const [composite, setComposite] = useState(0)
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [refs, setRefs] = useState<VoiceRef[]>([])
  const [refsOpen, setRefsOpen] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  // Client-only "now" label. Rendering `new Date()` inline caused a hydration
  // mismatch because the server's second and the client's second differ. We
  // render empty on SSR, fill on mount, and tick once a minute.
  const [nowLabel, setNowLabel] = useState('')
  useEffect(() => {
    const tick = () => setNowLabel(
      new Date().toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    )
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  // Load pinned references on mount. Seed with the implicit "You · NM" ref
  // even if the row isn't in the DB yet — the scoring still needs something.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Pull refs AND their full artist_profiles payload (style_rules,
      // visual_aesthetic, chips, performance metrics — everything the deep-
      // dive scan already wrote). Embedded join alias `artist_profiles(...)`
      // returns the joined row inline so we don't have to fan out queries.
      const { data } = await supabase
        .from('user_voice_refs')
        .select(`id, artist_profile_id, self_sample_text, display_name, weight, display_order, artist_profiles(${ARTIST_PROFILE_COLS})`)
        .eq('user_id', user.id)
        .order('display_order')

      if (cancelled) return

      // Look up NM's own artist_profiles row so the `self` ref carries real
      // deep-dive data (style_rules, lowercase_pct, peak_content, chips,
      // visual_aesthetic). Confirmed in DB: name='NIGHT manoeuvres',
      // handle='@nightmanoeuvres', data_source='opus-deep-dive', 50 posts.
      // Match on name OR handle so variants still resolve.
      const { data: selfProfile } = await supabase
        .from('artist_profiles')
        .select(ARTIST_PROFILE_COLS)
        .or('name.ilike.NIGHT manoeuvres,name.ilike.night manoeuvres,handle.ilike.@nightmanoeuvres,handle.ilike.nightmanoeuvres')
        .limit(1)
        .maybeSingle()

      if (cancelled) return

      if (data && data.length > 0) {
        const mapped: VoiceRef[] = data.map((row: any) => {
          const isSelf = !row.artist_profile_id
          const joined = row.artist_profiles
          const name = isSelf
            ? 'You · NM'
            : row.display_name
              || joined?.name
              || joined?.handle
              || 'Reference'
          return {
            id: row.id,
            name,
            weight: row.weight,
            kind: isSelf ? 'self' : 'artist',
            artist_profile_id: row.artist_profile_id ?? null,
            profile: isSelf ? profileFromRow(selfProfile) : profileFromRow(joined),
          }
        })
        setRefs(mapped)
      } else {
        setRefs([{
          id: 'self-default',
          name: 'You · NM',
          weight: 100,
          kind: 'self',
          profile: profileFromRow(selfProfile),
        }])
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleMedia = useCallback((files: File[]) => {
    const first = files[0]
    if (!first) return
    setFile(first)
    setScanError(null)
    setScanResult(null)
    setComposite(0)
    setThumbnail(null)
    setPhase('scanning')
  }, [])

  const handleScanComplete = useCallback(
    (res: ChainScanResult, comp: number, thumb: string | null) => {
      setScanResult(res)
      setComposite(comp)
      setThumbnail(thumb)
      setPhase('scanned')
      // Fire-and-forget persistence to media_scans. Not blocking the UI.
      ;(async () => {
        try {
          await fetch('/api/media/scans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_name: file?.name,
              composite_score: comp,
              result: res,
            }),
          })
        } catch {
          // non-fatal — intentionally silent; scan still shows in UI
        }
      })()
    },
    [file]
  )

  const handleReplace = useCallback(() => {
    setFile(null)
    setScanResult(null)
    setComposite(0)
    setThumbnail(null)
    setPhase('drop')
  }, [])

  const alignmentScore = useMemo(() => computeAlignment(refs), [refs])
  const isVideo = !!file && file.type.startsWith('video/')

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
      {/* scanlines + grain overlays (purely cosmetic) */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 60,
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(255,255,255,0.012) 0 1px, transparent 1px 3px)',
          mixBlendMode: 'overlay',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 61,
          opacity: 0.28,
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.06  0 0 0 0 0.06  0 0 0 0 0.06  0 0 0 0.24 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          backgroundSize: '160px 160px',
        }}
      />

      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          // rows: shared header (with centered rail inside) · chain body
          gridTemplateRows: 'auto 1fr',
          gap: 0,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Shared site header. Chain is home — eyebrow + tabs match every
            other page, title is hidden (DROP is the focal centrepiece), and
            the PhaseRail + time slot into the horizontally-centered `center`
            prop so the progress indicator reads as the header's midline. */}
        <SignalLabHeader
          hideTitle
          center={
            <>
              <PhaseRail phase={phase} />
              <div
                suppressHydrationWarning
                style={{
                  fontSize: 10,
                  letterSpacing: '0.22em',
                  color: '#5a5a5a',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {nowLabel}
              </div>
            </>
          }
        />

        {/* Body — padded to match the shared header's horizontal rhythm. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, padding: '24px 48px 48px' }}>
          {phase === 'drop' && <PhaseDrop onMedia={handleMedia} voiceTrained={refs.length > 1} />}

          {file && phase === 'scanning' && (
            <>
              <MediaStrip
                name={file.name}
                meta={buildMediaMeta(file)}
                status="Scanning…"
                thumbnail={thumbnail}
              />
              {scanError ? (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 14,
                    padding: 18,
                    background: BRT.ticket,
                    border: `1px solid ${BRT.red}`,
                  }}
                >
                  <div style={{ color: BRT.red, fontSize: 14, fontWeight: 700 }}>
                    Scan failed: {scanError}
                  </div>
                  <button
                    onClick={handleReplace}
                    style={{
                      padding: '12px 18px',
                      background: 'transparent',
                      border: `1px solid ${BRT.borderBright}`,
                      color: BRT.ink,
                      fontSize: 11,
                      letterSpacing: '0.22em',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <PhaseScan
                  file={file}
                  onComplete={handleScanComplete}
                  onError={(msg) => setScanError(msg)}
                />
              )}
            </>
          )}

          {file && scanResult && phase === 'scanned' && (
            <>
              <MediaStrip
                name={file.name}
                meta={buildMediaMeta(file)}
                thumbnail={thumbnail}
                onReplace={handleReplace}
              />
              <PhaseScanResults
                result={scanResult}
                composite={composite}
                fileName={file.name}
                isVideo={isVideo}
                thumbnail={thumbnail}
                onNext={() => setPhase('voice')}
                onSkip={handleReplace}
              />
            </>
          )}

          {file && scanResult && phase === 'voice' && (
            <>
              <MediaStrip
                name={file.name}
                meta={buildMediaMeta(file)}
                thumbnail={thumbnail}
                onReplace={handleReplace}
              />
              <PhaseVoice
                scan={scanResult}
                fileName={file.name}
                isVideo={isVideo}
                thumbnail={thumbnail}
                refs={refs}
                alignmentScore={alignmentScore}
                onOpenRefs={() => setRefsOpen(true)}
              />
            </>
          )}
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
