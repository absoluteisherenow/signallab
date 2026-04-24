'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BRT } from '@/lib/design/brt'
import { supabase } from '@/lib/supabaseBrowser'
import { ideas, type Idea } from '@/lib/nm-plan-data'
import type { ChainScanResult } from '@/lib/chainScan'
import { PhaseRail } from './chain/PhaseRail'
import { SignalLabHeader } from './SignalLabHeader'
import { MediaStrip } from './chain/MediaStrip'
import { PhaseDrop } from './chain/PhaseDrop'
import { PhaseScanConsole } from './chain/PhaseScanConsole'
import { PhaseScanVerdict } from './chain/PhaseScanVerdict'
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

// Rebuild the meta string from a persisted fileMeta object (no File blob).
// Used after a refresh rehydration — lets MediaStrip render the same
// "150KB · IMAGE" chip without the real File in hand.
function buildMediaMetaFromMeta(meta: { size: number; type: string }): string {
  const size = fmtBytes(meta.size)
  const isVid = meta.type.startsWith('video/')
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
/**
 * Derive a tight caption-gen context string from an idea brief. Kept terse
 * because Claude is already heavily primed by SKILLS_CAPTION_GEN — this just
 * needs to plant the angle: title + kicker + the idea's own caption draft.
 */
function ideaToContext(idea: Idea): string {
  const parts = [idea.title, idea.kicker, idea.caption?.trim()].filter(Boolean)
  return parts.join(' — ')
}

// Tab-scoped session for the broadcast chain. Lets a refresh mid-flow land
// the user back in the voice phase with their scan + thumbnail intact, so
// they don't lose 30s of work. The actual File blob can't round-trip through
// storage, so we persist a lightweight fileMeta and gate the publish CTA on
// re-attach if the blob is missing.
const SESSION_KEY = 'broadcast.chain.v1'
const SESSION_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

type SessionSnapshot = {
  phase: ChainPhase
  scanResult: ChainScanResult | null
  composite: number
  thumbnail: string | null
  fileMeta: { name: string; type: string; size: number } | null
  savedAt: number
}

function loadSession(): SessionSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const snap = JSON.parse(raw) as SessionSnapshot
    if (!snap.savedAt || Date.now() - snap.savedAt > SESSION_MAX_AGE_MS) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return snap
  } catch {
    return null
  }
}

function saveSession(snap: SessionSnapshot) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(snap))
  } catch {
    // Quota or serialisation failure — non-fatal, refresh will just wipe.
  }
}

function clearSession() {
  if (typeof window === 'undefined') return
  try { sessionStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
}

export function BroadcastChain() {
  const [phase, setPhase] = useState<ChainPhase>('drop')
  const [file, setFile] = useState<File | null>(null)
  // When the tab reloads the real File blob is gone but we keep the meta
  // so the UI still knows name/size/type for MediaStrip + publish gating.
  const [fileMeta, setFileMeta] = useState<{ name: string; type: string; size: number } | null>(null)
  const [scanResult, setScanResult] = useState<ChainScanResult | null>(null)
  const [composite, setComposite] = useState(0)
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  // Carousel slides 2..N (images only). Stored as data URLs so caption gen
  // can feed the whole set to Claude vision without re-reading blobs. Empty
  // for single-file uploads or when the hero is a video. Cap at 19 extras
  // (20 total slides) — matches IG carousel limit and Anthropic image cap.
  const [additionalImageUrls, setAdditionalImageUrls] = useState<string[]>([])
  // Raw File objects for every carousel slide (slides 2..N). Images live in
  // both additionalImageUrls (data URL, for caption vision) AND here (for
  // upload). Video extras live ONLY here — no data URL because vision skips
  // them. Order matches the carousel publish order 1:1 (hero is `file`).
  const [additionalFiles, setAdditionalFiles] = useState<File[]>([])
  const [refs, setRefs] = useState<VoiceRef[]>([])
  const [refsOpen, setRefsOpen] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  // Gate the save effect until we've hydrated — otherwise the first render
  // overwrites a valid snapshot with empty state.
  const [hydrated, setHydrated] = useState(false)
  // Pinned idea from /broadcast?idea=<slug>. If set, caption-gen context is
  // seeded with the idea's angle so the user doesn't have to retype it.
  const [pinnedIdea, setPinnedIdea] = useState<Idea | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const slug = params.get('idea')
    if (!slug) return
    const found = ideas.find(i => i.slug === slug)
    if (found) setPinnedIdea(found)
  }, [])
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

  // Hydrate once on mount. If a snapshot exists and is fresh, jump straight
  // to the voice phase with the scan result + thumbnail restored. The File
  // blob is gone, so we stub fileMeta and rely on a re-attach banner in the
  // voice phase to collect the bytes before publish.
  useEffect(() => {
    const snap = loadSession()
    if (snap && snap.scanResult && (snap.phase === 'voice' || snap.phase === 'scanned')) {
      setScanResult(snap.scanResult)
      setComposite(snap.composite)
      setThumbnail(snap.thumbnail)
      setFileMeta(snap.fileMeta)
      setPhase('voice')
    }
    setHydrated(true)
  }, [])

  // Persist relevant state whenever it changes post-hydration. We skip the
  // scanning phase (blob in flight) and drop phase (nothing to save).
  useEffect(() => {
    if (!hydrated) return
    if (phase === 'drop' || phase === 'scanning') {
      clearSession()
      return
    }
    if (!scanResult) return
    const meta = fileMeta ?? (file ? { name: file.name, type: file.type, size: file.size } : null)
    saveSession({
      phase,
      scanResult,
      composite,
      thumbnail,
      fileMeta: meta,
      savedAt: Date.now(),
    })
  }, [hydrated, phase, scanResult, composite, thumbnail, file, fileMeta])

  const handleMedia = useCallback((files: File[]) => {
    const first = files[0]
    if (!first) return
    setFile(first)
    setFileMeta({ name: first.name, type: first.type, size: first.size })
    setScanError(null)
    setScanResult(null)
    setComposite(0)
    setThumbnail(null)
    setAdditionalImageUrls([])
    setAdditionalFiles([])
    setPhase('scanning')
    // Carousel: images + videos both accepted as extras regardless of hero
    // type. IG supports video-first carousels up to 10 slides. Images get a
    // data URL read-off for caption vision; videos skip it.
    if (files.length > 1) {
      const extras = files.slice(1, 10)
      setAdditionalFiles(extras)
      const imageExtras = extras.filter((f) => f.type.startsWith('image/'))
      Promise.all(
        imageExtras.map((f) => new Promise<string | null>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(f)
        })),
      ).then((urls) => {
        const clean = urls.filter((u): u is string => typeof u === 'string' && u.startsWith('data:image/'))
        setAdditionalImageUrls(clean)
      })
    }
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
    setFileMeta(null)
    setScanResult(null)
    setComposite(0)
    setThumbnail(null)
    setAdditionalImageUrls([])
    setPhase('drop')
    clearSession()
  }, [])

  const alignmentScore = useMemo(() => computeAlignment(refs), [refs])
  // Prefer the stored blob's type, fall back to restored fileMeta after
  // a refresh (when `file` is null but scanResult was rehydrated).
  const isVideo = (file?.type ?? fileMeta?.type ?? '').startsWith('video/')
  const activeName = file?.name ?? fileMeta?.name ?? ''
  // Append " · N SLIDES" when extras were uploaded so the strip telegraphs
  // "this is a carousel, caption knows about all of them" without a bigger
  // UI change. Hidden when hero is video (carousels are image-only).
  const totalExtras = additionalFiles.length
  const carouselSuffix = !isVideo && totalExtras > 0 ? ` · ${totalExtras + 1} SLIDES` : ''
  const activeMeta = (file ? buildMediaMeta(file) : fileMeta ? buildMediaMetaFromMeta(fileMeta) : '') + carouselSuffix

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
          {pinnedIdea && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                background: BRT.ticket,
                border: `1px solid ${BRT.red}`,
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: BRT.ink,
              }}
            >
              <span style={{ color: BRT.red, fontWeight: 700 }}>◆ FROM IDEAS</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.02em', textTransform: 'none' }}>
                {pinnedIdea.title}
              </span>
              <a
                href={`/broadcast/ideas/${pinnedIdea.slug}`}
                style={{ color: BRT.inkDim, textDecoration: 'none', fontSize: 10, letterSpacing: '0.18em' }}
              >
                VIEW BRIEF
              </a>
              <button
                onClick={() => {
                  setPinnedIdea(null)
                  // Strip ?idea= so a refresh doesn't re-pin.
                  if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href)
                    url.searchParams.delete('idea')
                    window.history.replaceState({}, '', url.pathname + url.search)
                  }
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: BRT.inkDim,
                  fontSize: 14,
                  cursor: 'pointer',
                  padding: '0 4px',
                  lineHeight: 1,
                  fontFamily: 'inherit',
                }}
                aria-label="Unpin idea"
              >
                ✕
              </button>
            </div>
          )}
          {phase === 'drop' && (
            <PhaseDrop
              onMedia={handleMedia}
              voiceTrained={refs.length > 1}
              onReject={(msg) => setScanError(msg)}
            />
          )}
          {phase === 'drop' && scanError && (
            <div
              style={{
                marginTop: 14,
                padding: '12px 16px',
                border: '1px solid rgba(255,42,26,0.4)',
                background: 'rgba(255,42,26,0.06)',
                color: 'var(--gold-bright, #ff5440)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {scanError}
            </div>
          )}

          {file && phase === 'scanning' && (
            <>
              <MediaStrip
                name={file.name}
                meta={buildMediaMeta(file)}
                status="Scanning…"
                thumbnail={thumbnail}
              />
              {additionalFiles.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: '10px 14px',
                    border: `1px solid ${BRT.borderBright}`,
                    background: BRT.ticket,
                    margin: '8px 0',
                  }}
                >
                  <div style={{ fontSize: 10, letterSpacing: '0.28em', color: BRT.red, fontWeight: 700, textTransform: 'uppercase' }}>
                    ◉ Carousel queued · {additionalFiles.length + 1} slides (hero + {additionalFiles.length} extras)
                  </div>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                    {additionalFiles.map((f, i) => (
                      <div
                        key={i}
                        style={{
                          flex: '0 0 auto',
                          padding: '6px 10px',
                          border: `1px solid ${BRT.borderBright}`,
                          fontSize: 10,
                          letterSpacing: '0.12em',
                          color: f.type.startsWith('video/') ? BRT.red : '#9a9a9a',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                          maxWidth: 180,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {f.type.startsWith('video/') ? '▶ ' : '▦ '}{f.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                <PhaseScanConsole
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
                meta={buildMediaMeta(file) + carouselSuffix}
                thumbnail={thumbnail}
                onReplace={handleReplace}
                onClear={handleReplace}
              />
              <PhaseScanVerdict
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

          {scanResult && phase === 'voice' && (
            <>
              <MediaStrip
                name={activeName}
                meta={activeMeta}
                thumbnail={thumbnail}
                onReplace={handleReplace}
                onClear={handleReplace}
              />
              {!file && (
                <div
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(255,42,26,0.06)',
                    border: `1px solid ${BRT.red}`,
                    color: BRT.ink,
                    fontSize: 11,
                    letterSpacing: '0.22em',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  Session restored · reattach media to publish
                </div>
              )}
              <PhaseVoice
                scan={scanResult}
                file={file}
                fileName={activeName}
                isVideo={isVideo}
                thumbnail={thumbnail}
                additionalImages={additionalImageUrls}
                additionalFiles={additionalFiles}
                onReorderCarousel={(from, to) => {
                  // Full reorder incl. hero swap. Build a flat [hero, ...extras]
                  // slide list with each file + its image dataURL (null for
                  // videos), move the requested index, then split back into
                  // file/thumbnail/additionalFiles/additionalImageUrls.
                  if (!file) return
                  if (from === to) return
                  const heroIsImage = file.type.startsWith('image/')
                  const fileToUrl = new Map<File, string | null>()
                  fileToUrl.set(file, heroIsImage ? thumbnail : null)
                  let imgIdx = 0
                  for (const f of additionalFiles) {
                    if (f.type.startsWith('image/')) {
                      fileToUrl.set(f, additionalImageUrls[imgIdx] ?? null)
                      imgIdx++
                    } else {
                      fileToUrl.set(f, null)
                    }
                  }
                  const slides: { file: File; url: string | null }[] = [
                    { file, url: fileToUrl.get(file) ?? null },
                    ...additionalFiles.map(f => ({ file: f, url: fileToUrl.get(f) ?? null })),
                  ]
                  if (from < 0 || from >= slides.length || to < 0 || to >= slides.length) return
                  const [moved] = slides.splice(from, 1)
                  slides.splice(to, 0, moved)
                  const newHero = slides[0]
                  const newExtras = slides.slice(1)
                  setFile(newHero.file)
                  setFileMeta({ name: newHero.file.name, type: newHero.file.type, size: newHero.file.size })
                  setThumbnail(newHero.file.type.startsWith('image/') ? newHero.url : null)
                  setAdditionalFiles(newExtras.map(s => s.file))
                  setAdditionalImageUrls(
                    newExtras
                      .filter(s => s.file.type.startsWith('image/') && s.url)
                      .map(s => s.url as string),
                  )
                }}
                refs={refs}
                alignmentScore={alignmentScore}
                onOpenRefs={() => setRefsOpen(true)}
                onRemoveRef={(id) => setRefs(prev => prev.filter(r => r.id !== id))}
                initialContext={pinnedIdea ? ideaToContext(pinnedIdea) : undefined}
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
