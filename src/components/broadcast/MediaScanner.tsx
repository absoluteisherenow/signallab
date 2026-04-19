'use client'

import { useState, useRef, useEffect } from 'react'
import { SignalLabHeader } from './SignalLabHeader'
import { SCAN_TIERS, DEFAULT_TIER } from '@/lib/scanTiers'
import { supabase } from '@/lib/supabaseBrowser'
import { SKILLS_MEDIA_SCANNER } from '@/lib/skillPromptsClient'
import { useGatedSend } from '@/lib/outbound'
import { toast } from '@/lib/toast'
import { fetcher, FetcherError } from '@/lib/fetcher'

const USER_TIER = 'pro' as const  // 25 per batch, 150/month

interface MediaMoment {
  timestamp: number
  frame_number?: number
  score: number
  reason: string
  type: 'peak' | 'crowd' | 'lighting' | 'transition' | 'intimate'
  thumbnail?: string
}

interface ContentScore {
  reach: number
  authenticity: number
  culture: number
  visual_identity: number
  shareable_core: number
  shareable_core_note: string
  reasoning: string
  aesthetic?: number
}

interface ScanResult {
  best_moment: MediaMoment
  moments: MediaMoment[]
  overall_energy: number
  best_clip_start: number
  best_clip_end: number
  caption_context: string
  post_recommendation: string
  content_score: ContentScore
  tags: string[]
  tone_match: string
  platform_cuts: {
    instagram: string
    tiktok: string
    story: string
  }
  platform_ranking: {
    platform: string
    score: number
    reason: string
  }[]
}

interface FileScan {
  file?: File          // absent for scans restored from history
  name: string         // always present
  result: ScanResult
  frames: { dataUrl: string; timestamp: number }[]
  composite: number
  caption?: string
  captionLoading?: boolean
}

// Vision-capable Claude call — sends actual frame images alongside the prompt
async function callClaudeVision(
  system: string,
  frames: { dataUrl: string; timestamp: number }[],
  textPrompt: string,
  maxTokens = 2000
): Promise<string> {
  // Build content array: one image block per frame, then the text prompt
  // Parse the actual media_type from the data URL so a PNG fallback or
  // unusual canvas output doesn't get mis-labelled as jpeg (Anthropic rejects
  // with "The string did not match the expected pattern" otherwise).
  const content: object[] = frames.map((f, idx) => {
    const match = f.dataUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/)
    if (!match) throw new Error(`frame ${idx + 1} produced an invalid data URL — the file may be an unsupported codec or failed to decode`)
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: match[1],
        data: match[2],
      },
    }
  })

  // Add timestamp labels as a text block before the prompt
  const frameLabels = frames.map((f, i) => `Frame ${i + 1}: ${f.timestamp.toFixed(1)}s`).join(' | ')
  content.push({ type: 'text', text: `Frame timestamps: ${frameLabels}\n\n${textPrompt}` })

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      system,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `API error ${res.status}`)
  const text = data.content?.[0]?.text
  if (!text) throw new Error('Empty response from API')
  return text
}

async function extractFrames(file: File, count = 12): Promise<{ dataUrl: string; timestamp: number }[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const frames: { dataUrl: string; timestamp: number }[] = []

    video.preload = 'metadata'
    video.src = URL.createObjectURL(file)

    video.onloadedmetadata = () => {
      // Higher resolution for better visual analysis
      canvas.width = 480
      canvas.height = 270
      const duration = video.duration
      // Sample full duration — the opening frames may be the strongest hook
      const start = 0
      const end = duration
      const range = end - start
      const interval = range / (count - 1)
      let captured = 0

      const captureFrame = (time: number) => { video.currentTime = time }

      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        frames.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.75), timestamp: video.currentTime })
        captured++
        if (captured < count) {
          captureFrame(start + captured * interval)
        } else {
          URL.revokeObjectURL(video.src)
          resolve(frames)
        }
      }

      captureFrame(start)
    }
  })
}

async function extractImageFrame(file: File): Promise<{ dataUrl: string; timestamp: number }[]> {
  return new Promise((resolve) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    img.onload = () => {
      // Scale down to max 720px wide
      const scale = Math.min(1, 720 / img.width)
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve([{ dataUrl: canvas.toDataURL('image/jpeg', 0.8), timestamp: 0 }])
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  })
}

function isImageFile(file?: File, name?: string) {
  if (file) return file.type.startsWith('image/')
  return /\.(jpg|jpeg|png|gif|webp|heic|avif)$/i.test(name || '')
}

function compositeScore(r: ScanResult) {
  const s = r.content_score
  const aes = typeof s.aesthetic === 'number' ? s.aesthetic : null
  if (typeof s.shareable_core !== 'number') {
    const base = Math.round((s.reach * 0.25) + (s.authenticity * 0.30) + (s.culture * 0.25) + (s.visual_identity * 0.20))
    return aes !== null ? Math.round(base * 0.90 + aes * 0.10) : base
  }
  const base = Math.round((s.reach * 0.20) + (s.authenticity * 0.25) + (s.culture * 0.20) + (s.visual_identity * 0.15) + (s.shareable_core * 0.20))
  return aes !== null ? Math.round(base * 0.90 + aes * 0.10) : base
}

function scoreVerdict(score: number): { label: string; color: string } {
  if (score >= 75) return { label: 'POST IT', color: 'var(--green)' }
  if (score >= 60) return { label: 'TWEAK', color: 'var(--gold)' }
  if (score >= 45) return { label: 'RECONSIDER', color: '#9a6a5a' }
  return { label: "DON'T POST", color: '#8a4a3a' }
}

// Shared caption-generation system prompt — enforces NM voice rules and forbids
// the "literal image description" failure mode.
function buildCaptionSystemPrompt(artistName: string, voiceRules: string, extraRules = ''): string {
  const voice = voiceRules
    ? `You write Instagram captions for ${artistName}. Use this REAL voice profile from their scraped Instagram data:\n\n${voiceRules}\n\nMatch this voice EXACTLY.`
    : `You write Instagram captions for ${artistName}, an electronic music artist. Voice: warm insider tone, no hashtags, lowercase preferred, no exclamation marks, no emojis, no forced CTAs. Sparse, observational, confident. Underground electronic music world.`

  const hardRules = `
HARD RULES — violations invalidate the caption:
- NEVER describe what is literally in the image. No "a photo of", "shot of", "picture shows", "here's a". The image already shows it. Your job is what the image CAN'T say: context, feeling, what's next, the story behind it, the in-joke.
- NEVER use em-dashes (—). Use commas, full stops, or line breaks instead.
- NEVER put @mentions or tags in the caption itself. Tags go in the first comment.
- First 125 characters are the hook — they're what shows before "... more". Lead with something that earns the tap.
- If the artist is Night Manoeuvres, always render the name as "NIGHT manoeuvres" (NIGHT uppercase, manoeuvres lowercase). Never "Night Manoeuvres" or any other casing.
- No generic CTAs ("check it out", "link in bio", "tap to listen"). If there's an action, make it specific or leave it off.
${extraRules}

Return ONLY the caption text. No quotes, no prefix, no commentary, no "Caption:".`

  return voice + '\n' + hardRules
}

// Post-process a generated caption to mechanically enforce hard brand rules
// (prompt-level instructions don't reliably enforce character-level bans).
function scrubCaption(raw: string, artistName: string): string {
  let s = (raw || '').trim()

  // Strip wrapping quotes if the model wrapped the whole thing
  s = s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim()

  // Strip "Caption:" prefix if present
  s = s.replace(/^caption\s*:\s*/i, '')

  // Strip literal-description openers
  s = s.replace(/^(a |the )?(photo|shot|picture|image|snap|capture)( of)?\s+/i, '')
  s = s.replace(/^here'?s (a |the |some )?/i, '')
  s = s.replace(/^this (is |shows )/i, '')

  // Em-dash and en-dash → comma (or period if followed by capital+space after cleanup)
  s = s.replace(/\s*[—–]\s*/g, ', ')

  // Collapse any double-commas the replacement may have produced
  s = s.replace(/,\s*,/g, ',')
  s = s.replace(/,\s*\./g, '.')

  // Force NIGHT manoeuvres casing for NM
  if (/night\s*man[oeœ]+uvres/i.test(artistName)) {
    s = s.replace(/\bnight\s*man[oeœ]+uvres\b/gi, 'NIGHT manoeuvres')
  }

  return s.trim()
}

// Pick the lead image for a carousel. Highest reach (scroll-stop) wins, with a
// small bonus for images flagged strong as "Carousel Lead" in platform_ranking.
function pickCarouselLead(scans: FileScan[]): number {
  let bestIdx = 0
  let bestScore = -1
  scans.forEach((sc, i) => {
    const reach = sc.result.content_score?.reach ?? 0
    const leadBonus = sc.result.platform_ranking?.find(p => /carousel lead/i.test(p.platform))?.score ?? 0
    // 70% reach, 30% carousel-lead signal
    const score = reach * 0.7 + leadBonus * 0.3
    if (score > bestScore) { bestScore = score; bestIdx = i }
  })
  return bestIdx
}

// ── SchedulePreview ──────────────────────────────────────────────────────────
// Renders the post exactly as it'll appear on Instagram, so the user can see
// what they're approving BEFORE the schedule call fires. Per the hard rule:
// no confirm button until the user has viewed and explicitly approved the
// preview. Approved state resets whenever the edit fields change.
interface SchedulePreviewProps {
  mode: 'single' | 'carousel'
  scans: FileScan[]
  activeScan: FileScan
  caption: string
  firstComment: string
  hashtags: string
  tagHandles: string
  locationName: string
  scheduleDate: string
  scheduleTime: string
  artistName: string
  approved: boolean
  onEdit: () => void
  onApprove: () => void
  onConfirm: () => void
  onPostNow: () => void
  scheduling: boolean
  posting: boolean
}

function SchedulePreview(props: SchedulePreviewProps) {
  const {
    mode, scans, activeScan, caption, firstComment, hashtags, tagHandles,
    locationName, scheduleDate, scheduleTime, artistName,
    approved, onEdit, onApprove, onConfirm, onPostNow, scheduling, posting,
  } = props

  const [slideIdx, setSlideIdx] = useState(0)
  const slides = mode === 'carousel'
    ? scans.map(sc => {
        const heroIdx = sc.result.best_moment?.frame_number ? sc.result.best_moment.frame_number - 1 : 0
        return sc.frames[heroIdx] || sc.frames[0]
      }).filter(Boolean)
    : [activeScan.frames[0]].filter(Boolean)

  const currentFrame = slides[slideIdx] || slides[0]

  // Reels post 9:16. Single-image + carousel default to 1:1 (IG's feed crop).
  // This keeps the preview honest — no surprise crop at publish time.
  const activeIsVideo = mode !== 'carousel' && !isImageFile(activeScan.file, activeScan.name)
  const previewAspect = activeIsVideo ? '9 / 16' : '1 / 1'

  const tagUsernames = tagHandles
    .split(/[\s,\n]+/)
    .map(h => h.trim().replace(/^@/, ''))
    .filter(Boolean)

  const parsedHashtags = hashtags
    .split(/[,\s]+/)
    .map(h => h.trim().replace(/^#/, ''))
    .filter(Boolean)

  const firstCommentRendered = [
    firstComment.trim(),
    parsedHashtags.map(h => `#${h}`).join(' '),
  ].filter(Boolean).join('\n\n')

  const scheduledDisplay = scheduleDate && scheduleTime
    ? new Date(`${scheduleDate}T${scheduleTime}`).toLocaleString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '(date/time missing)'

  // Truncate caption to show ...more state if >125 chars
  const truncatedCaption = caption.length > 125 ? caption.slice(0, 125) + '…' : caption

  return (
    <div>
      <div style={{ fontSize: '12px', letterSpacing: '0.18em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '12px' }}>
        Preview — this is exactly how it'll post
      </div>

      {/* IG-style post card */}
      <div style={{ background: '#000', border: '1px solid #262626', maxWidth: '468px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #1a1a1a' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #d4a843, #8a5a3a)', marginRight: '10px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', color: '#fff', fontWeight: 600, lineHeight: 1.2 }}>{artistName.toLowerCase().replace(/\s+/g, '')}</div>
            {locationName && (
              <div style={{ fontSize: '11px', color: '#a8a8a8', lineHeight: 1.2, marginTop: '2px' }}>{locationName}</div>
            )}
          </div>
          <div style={{ color: '#fff', fontSize: '18px' }}>⋯</div>
        </div>

        {/* Image with tag pins drawn */}
        {currentFrame && (
          <div style={{ position: 'relative', background: '#000', aspectRatio: previewAspect, overflow: 'hidden' }}>
            <img
              src={currentFrame.dataUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            {/* Tag pins — on slide 1 only for now (real per-slide UI later) */}
            {slideIdx === 0 && tagUsernames.map((u, i) => {
              const y = 0.5 + (i * 0.05 - 0.05 * (tagUsernames.length - 1) / 2)
              return (
                <div key={i} style={{ position: 'absolute', left: '50%', top: `${y * 100}%`, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
                  <div style={{ background: '#000', color: '#fff', fontSize: '12px', padding: '4px 8px', borderRadius: '3px', whiteSpace: 'nowrap', fontWeight: 500 }}>
                    @{u}
                  </div>
                  <div style={{ width: '10px', height: '10px', background: '#000', transform: 'translateX(calc(50% - 5px)) rotate(45deg)', marginTop: '-5px' }} />
                </div>
              )
            })}
            {/* Slide dots for carousel */}
            {mode === 'carousel' && slides.length > 1 && (
              <div style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '4px' }}>
                {slides.map((_, i) => (
                  <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: i === slideIdx ? '#0095f6' : 'rgba(255,255,255,0.5)' }} />
                ))}
              </div>
            )}
            {/* Carousel navigation */}
            {mode === 'carousel' && slides.length > 1 && (
              <>
                {slideIdx > 0 && (
                  <button onClick={() => setSlideIdx(slideIdx - 1)} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', fontSize: '16px' }}>‹</button>
                )}
                {slideIdx < slides.length - 1 && (
                  <button onClick={() => setSlideIdx(slideIdx + 1)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', fontSize: '16px' }}>›</button>
                )}
              </>
            )}
          </div>
        )}

        {/* Actions row */}
        <div style={{ display: 'flex', padding: '8px 12px', gap: '16px', color: '#fff', fontSize: '22px' }}>
          <span>♡</span>
          <span>💬</span>
          <span>↗</span>
        </div>

        {/* Caption */}
        <div style={{ padding: '0 12px 8px', color: '#fff', fontSize: '13px', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
          <span style={{ fontWeight: 600, marginRight: '6px' }}>{artistName.toLowerCase().replace(/\s+/g, '')}</span>
          {truncatedCaption}
          {caption.length > 125 && <span style={{ color: '#a8a8a8', marginLeft: '4px' }}>more</span>}
        </div>

        {/* First comment (rendered as IG comment) */}
        {firstCommentRendered && (
          <div style={{ padding: '4px 12px 12px', color: '#fff', fontSize: '13px', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
            <span style={{ fontWeight: 600, marginRight: '6px' }}>{artistName.toLowerCase().replace(/\s+/g, '')}</span>
            <span dangerouslySetInnerHTML={{
              __html: firstCommentRendered
                .replace(/#([a-zA-Z0-9_]+)/g, '<span style="color:#e0f1ff">#$1</span>')
                .replace(/@([a-zA-Z0-9_.]+)/g, '<span style="color:#e0f1ff">@$1</span>'),
            }} />
          </div>
        )}
      </div>

      {/* Meta — scheduled time */}
      <div style={{ marginTop: '14px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
        Scheduled for <span style={{ color: 'var(--text)' }}>{scheduledDisplay}</span>
        {mode === 'carousel' && <span style={{ marginLeft: '10px' }}>· {slides.length} slides</span>}
        {tagUsernames.length > 0 && <span style={{ marginLeft: '10px' }}>· {tagUsernames.length} tag{tagUsernames.length === 1 ? '' : 's'}</span>}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
        <button
          onClick={onEdit}
          disabled={scheduling}
          style={{ flex: 1, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '12px', cursor: scheduling ? 'default' : 'pointer' }}
        >
          ← Edit
        </button>
        {!approved ? (
          <button
            onClick={onApprove}
            style={{ flex: 2, background: 'rgba(212,168,67,0.12)', border: '1px solid var(--gold)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '12px', cursor: 'pointer' }}
          >
            ✓ Approve preview
          </button>
        ) : (
          <>
            <button
              onClick={onConfirm}
              disabled={scheduling || posting}
              style={{ flex: 1, background: (scheduling || posting) ? 'transparent' : 'rgba(255,42,26,0.15)', border: '1px solid rgba(255,42,26,0.5)', color: (scheduling || posting) ? 'var(--text-dimmer)' : '#ff6b55', fontFamily: 'var(--font-mono)', fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '12px', cursor: (scheduling || posting) ? 'default' : 'pointer' }}
            >
              {scheduling ? 'Scheduling…' : 'Schedule →'}
            </button>
            <button
              onClick={onPostNow}
              disabled={scheduling || posting}
              style={{ flex: 1, background: (scheduling || posting) ? 'transparent' : 'rgba(212,168,67,0.15)', border: '1px solid var(--gold)', color: (scheduling || posting) ? 'var(--text-dimmer)' : 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '12px', cursor: (scheduling || posting) ? 'default' : 'pointer' }}
            >
              {posting ? 'Posting…' : 'Post now →'}
            </button>
          </>
        )}
      </div>
      <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-dimmer)', lineHeight: 1.5 }}>
        {approved
          ? 'Preview approved. Schedule for later, or post now.'
          : 'Review the post above. Click Approve to unlock the publish buttons.'}
      </div>
    </div>
  )
}

export function MediaScanner() {
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanningIndex, setScanningIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [scans, setScans] = useState<FileScan[]>([])
  // History — Supabase-backed (media_scans table). localStorage acts as a
  // hot cache so the UI paints instantly on mount before the network response.
  const [savedScans, setSavedScans] = useState<{ id?: string; name: string; result: ScanResult; composite: number; caption?: string; thumbnail?: string }[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('signal_scan_history')
      const parsed = saved ? JSON.parse(saved) : []
      return parsed.sort((a: any, b: any) => b.composite - a.composite)
    } catch { return [] }
  })
  const [showHistory, setShowHistory] = useState(false)
  const [selectedScan, setSelectedScan] = useState(0)
  const [error, setError] = useState('')
  const [usageInfo, setUsageInfo] = useState<{ used: number; remaining: number; monthlyLimit: number; credits: number } | null>(null)
  const [userId, setUserId] = useState('dev-user')
  const [voiceRules, setVoiceRules] = useState<string>('')
  const [artistName, setArtistName] = useState<string>('the artist')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [schedulingFor, setSchedulingFor] = useState<number | null>(null)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduleCaption, setScheduleCaption] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [scheduledOk, setScheduledOk] = useState<number | null>(null)
  const [carouselMode, setCarouselMode] = useState(false)
  const [carouselSelected, setCarouselSelected] = useState<Set<number>>(new Set())
  const [buildingCarousel, setBuildingCarousel] = useState(false)
  const [carouselCaption, setCarouselCaption] = useState<string>('')
  const [carouselLeadIndex, setCarouselLeadIndex] = useState<number | null>(null)
  const [carouselCaptionLoading, setCarouselCaptionLoading] = useState(false)
  // Schedule panel — new fields for IG-compliant posting (tags, first comment,
  // hashtags, location). Separate from the caption because per the hard rule
  // "no @mentions in captions" tags belong in first_comment.
  const [scheduleFirstComment, setScheduleFirstComment] = useState('')
  const [scheduleHashtags, setScheduleHashtags] = useState('')
  const [scheduleTagHandles, setScheduleTagHandles] = useState('')
  const [scheduleLocationName, setScheduleLocationName] = useState('')
  const [scheduleMode, setScheduleMode] = useState<'single' | 'carousel'>('single')
  // Preview-approve gate: user MUST render the preview and click Approve before
  // any schedule/publish call is allowed. Hard rule from feedback memory.
  const [schedulePhase, setSchedulePhase] = useState<'edit' | 'preview'>('edit')
  const [previewApproved, setPreviewApproved] = useState(false)
  const [postingNow, setPostingNow] = useState(false)
  const gatedSend = useGatedSend()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const tierLimits = SCAN_TIERS[USER_TIER]

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxUrl(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Restore scans from localStorage cache immediately (before Supabase responds)
  useEffect(() => {
    if (scans.length === 0 && savedScans.length > 0) {
      setScans(savedScans.map(s => ({
        name: s.name,
        result: s.result,
        composite: s.composite,
        caption: s.caption,
        frames: s.thumbnail ? [{ dataUrl: s.thumbnail, timestamp: 0 }] : [],
      })))
    }
  }, [savedScans])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const id = session?.user?.id || 'dev-user'
      setUserId(id)
      fetch(`/api/scan-usage?userId=${id}&tier=${USER_TIER}`)
        .then(r => r.json())
        .then(d => setUsageInfo({ used: d.used, remaining: d.remaining, monthlyLimit: d.monthlyLimit, credits: d.credits }))
        .catch(() => {})
      // Pull persistent scan history from Supabase — survives device switches
      fetch(`/api/media/scans?userId=${id}&limit=50`)
        .then(r => r.json())
        .then(d => {
          if (Array.isArray(d.scans) && d.scans.length > 0) {
            const mapped = d.scans.map((s: any) => ({
              id: s.id,
              name: s.file_name,
              result: s.result,
              composite: s.composite_score,
              caption: s.caption || undefined,
              thumbnail: s.thumbnail_url || undefined,
            }))
            const sortedMapped = [...mapped].sort((a, b) => b.composite - a.composite)
            setSavedScans(sortedMapped)
            try { localStorage.setItem('signal_scan_history', JSON.stringify(sortedMapped)) } catch {}
            // Restore into main scans panel so results survive a refresh
            setScans(prev => prev.length > 0 ? prev : sortedMapped.map((s: typeof sortedMapped[0]) => ({
              name: s.name,
              result: s.result,
              composite: s.composite,
              caption: s.caption,
              frames: s.thumbnail ? [{ dataUrl: s.thumbnail, timestamp: 0 }] : [],
            })))
          }
        })
        .catch(() => {})
    })
    // Load voice profile for caption generation
    supabase.from('artist_settings').select('profile').limit(1).single().then(({ data }) => {
      const name = data?.profile?.name || 'the artist'
      setArtistName(name)
      // Fetch voice rules from artist_profiles
      supabase.from('artist_profiles').select('style_rules').ilike('name', name).limit(1).single().then(({ data: vp }) => {
        if (vp?.style_rules) setVoiceRules(vp.style_rules)
      })
    })
  }, [])

  const s = {
    bg: 'var(--bg)',
    panel: 'var(--panel)',
    border: 'var(--border)',
    gold: 'var(--gold)',
    text: 'var(--text)',
    textDim: 'var(--text-dim)',
    textDimmer: 'var(--text-dimmer)',
    font: 'var(--font-mono)',
    green: 'var(--green)',
  }

  function addFiles(incoming: FileList | File[] | null) {
    if (!incoming) return
    const media = Array.from(incoming as ArrayLike<File>).filter(f => f.type.startsWith('video/') || f.type.startsWith('image/'))
    if (!media.length) { setError('Please select video or image files'); return }
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      const merged = [...prev, ...media.filter(f => !names.has(f.name))]
      if (merged.length > tierLimits.batchLimit) {
        setError(`Your plan allows ${tierLimits.batchLimit} files per batch`)
        return merged.slice(0, tierLimits.batchLimit)
      }
      setError('')
      return merged
    })
    setScans([])
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index))
    setScans([])
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  async function scanFile(file: File, index: number, total: number): Promise<FileScan> {
    setScanningIndex(index)
    const isImage = isImageFile(file)
    setProgressLabel(isImage ? `Analysing ${file.name}...` : `Extracting frames from ${file.name}...`)
    setProgress(Math.round((index / total) * 100 + 5))

    const frames = isImage ? await extractImageFrame(file) : await extractFrames(file, 8)

    setProgressLabel(`Analysing ${file.name} (${index + 1} of ${total})...`)
    setProgress(Math.round((index / total) * 100 + 30))

    const duration = frames[frames.length - 1]?.timestamp ?? 0

    const systemPrompt = isImage
      ? `You are an expert visual content strategist for electronic music artists — Bicep, Floating Points, fred again.., Four Tet, Bonobo. You deeply understand what images and photos perform in this world: raw, atmospheric, authentic.

${SKILLS_MEDIA_SCANNER}

Analyse what you genuinely see in this image. Return ONLY valid JSON — no markdown, no explanation.`
      : `You are an expert video editor and social media strategist for electronic music artists — Bicep, Floating Points, fred again.., Four Tet, Bonobo. You deeply understand what show footage performs in this world: raw, human, unpolished, in-the-room. You are looking at actual frames extracted from a show video.

CRITICAL SOCIAL MEDIA RULE: The clip MUST start on the strongest, most attention-grabbing frame. The first 1-3 seconds decide everything on TikTok and Instagram Reels. Never bury the best moment in the middle — set best_clip_start AT or just before best_moment.timestamp so the hook is the opening frame. A strong hook = more loops = more reach.

${SKILLS_MEDIA_SCANNER}

Analyse what you genuinely see in each frame. Return ONLY valid JSON — no markdown, no explanation.`

    const textPrompt = isImage
      ? `You are looking at a photo/image called "${file.name}".

Analyse what you see:
- SUBJECT: what's in the image — crowd, artist, studio, venue, record, equipment, landscape, abstract
- LIGHTING: quality, colour, mood, drama
- COMPOSITION: framing, depth, focus, visual interest
- EMOTIONAL QUALITY: raw vs polished, authentic vs staged, atmospheric vs flat
- PLATFORM FIT: would this stop a scroll on Instagram? Work as a grid post? A story?
- AESTHETIC: does it fit the underground electronic music world

Return JSON exactly:
{
  "best_moment": {
    "timestamp": 0,
    "frame_number": 1,
    "score": <0-100>,
    "reason": "<describe exactly what you see — subject, lighting, composition, why it works or doesn't>",
    "type": "peak|crowd|lighting|transition|intimate"
  },
  "moments": [
    { "timestamp": 0, "frame_number": 1, "score": <0-100>, "reason": "<what you see>", "type": "peak|crowd|lighting|transition|intimate" }
  ],
  "overall_energy": <1-10>,
  "best_clip_start": 0,
  "best_clip_end": 0,
  "visual_quality": "<one sentence on image quality, lighting, sharpness, composition>",
  "caption_context": "<one sentence describing what is in the image — use for caption generation>",
  "post_recommendation": "<specific recommendation: grid post, story, carousel lead, skip>",
  "content_score": {
    "reach": <0-100 scroll-stop power, hook strength, share trigger>,
    "authenticity": <0-100 voice consistency, genuine energy, personal signature>,
    "culture": <0-100 scene credibility, underground codes, genre awareness>,
    "visual_identity": <0-100 colour palette, tonal match, composition style>,
    "shareable_core": <0-100 is there one frame or detail worth screenshotting and DMing a friend>,
    "shareable_core_note": "<name the exact frame/detail that is the shareable core, or say 'none found' — if none found, shareable_core must be below 50>",
    "aesthetic": <0-100 overall visual beauty — lighting quality, compositional elegance, colour harmony, how pleasing it is to look at independent of content>,
    "reasoning": "<based on what you see: subject, mood, composition, platform fit>"
  },
  "tags": ["<subject>", "<mood>", "<context if detectable>"],
  "tone_match": "<which reference artist's aesthetic this feels closest to, and why>",
  "platform_cuts": {
    "instagram": "<grid post / carousel / skip — why>",
    "tiktok": "<still image with audio / skip — why>",
    "story": "<good for story / skip — why>"
  },
  "platform_ranking": [
    { "platform": "Instagram Grid", "score": <0-100>, "reason": "<based on what you see>" },
    { "platform": "Instagram Story", "score": <0-100>, "reason": "<based on what you see>" },
    { "platform": "Carousel Lead", "score": <0-100>, "reason": "<would this work as the first image in a carousel>" }
  ]
}`
      : `You are looking at ${frames.length} frames extracted from a show video called "${file.name}" (duration ~${duration.toFixed(0)}s).

Each image is a real frame from the footage. Look carefully at:
- CROWD: density, energy, movement, hands up, phones out, faces
- LIGHTING: quality, colour, drama, whether it enhances the shot
- COMPOSITION: is the artist visible, is the crowd in frame, angle quality
- MOMENT TYPE: is this a peak drop, breakdown, crowd swell, lighting change, intimate moment
- EMOTIONAL QUALITY: raw vs polished, authentic vs staged
- PLATFORM FIT: would this stop a scroll on TikTok? Instagram?

Identify which SPECIFIC FRAME NUMBER (1-${frames.length}) contains the single best moment for social media. Be specific about what you actually see.

Return JSON exactly:
{
  "best_moment": {
    "timestamp": <exact timestamp of best frame>,
    "frame_number": <1-${frames.length}>,
    "score": <0-100>,
    "reason": "<describe exactly what you see in this frame — crowd state, lighting, composition, why it works>",
    "type": "peak|crowd|lighting|transition|intimate"
  },
  "moments": [
    { "timestamp": <ts>, "frame_number": <n>, "score": <0-100>, "reason": "<what you see>", "type": "peak|crowd|lighting|transition|intimate" },
    { "timestamp": <ts>, "frame_number": <n>, "score": <0-100>, "reason": "<what you see>", "type": "peak|crowd|lighting|transition|intimate" },
    { "timestamp": <ts>, "frame_number": <n>, "score": <0-100>, "reason": "<what you see>", "type": "peak|crowd|lighting|transition|intimate" }
  ],
  "overall_energy": <1-10>,
  "best_clip_start": <timestamp of best_moment or 1-2s before it — this IS the hook/opening frame>,
  "best_clip_end": <best_clip_start + 15 to 30 seconds>,
  "visual_quality": "<one sentence on actual image quality, lighting conditions, shakiness>",
  "caption_context": "<one sentence describing what is genuinely happening in the footage>",
  "post_recommendation": "<specific recommendation based on what you actually see>",
  "content_score": {
    "reach": <0-100 scroll-stop power, hook strength, completion likelihood, share trigger>,
    "authenticity": <0-100 voice consistency, genuine energy, raw vs manufactured>,
    "culture": <0-100 scene credibility, underground codes, genre awareness, peer respect>,
    "visual_identity": <0-100 colour palette, tonal match, composition style, grid cohesion>,
    "shareable_core": <0-100 is there one frame or moment worth screenshotting and DMing a friend>,
    "shareable_core_note": "<name the exact frame/moment that is the shareable core, or say 'none found' — if none found, shareable_core must be below 50>",
    "aesthetic": <0-100 overall visual beauty — lighting quality, compositional elegance, colour harmony, how pleasing it is to look at independent of content>,
    "reasoning": "<based on what you see: crowd reaction, lighting, composition>"
  },
  "tags": ["<venue/event if detectable from context>", "<show footage>", "<live electronic>"],
  "tone_match": "<which reference artist this footage feels closest to, and specifically why based on what you see>",
  "platform_cuts": {
    "instagram": "<timestamp range e.g. 0:15 – 0:45 — why>",
    "tiktok": "<timestamp range — why>",
    "story": "<timestamp range — why>"
  },
  "platform_ranking": [
    { "platform": "TikTok", "score": <0-100>, "reason": "<based on what you see>" },
    { "platform": "Instagram Reel", "score": <0-100>, "reason": "<based on what you see>" },
    { "platform": "Instagram Story", "score": <0-100>, "reason": "<based on what you see>" }
  ]
}`

    const raw = await callClaudeVision(systemPrompt, frames, textPrompt, 2000)

    const data = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return { file, name: file.name, result: data, frames, composite: compositeScore(data) }
  }

  async function scanAll() {
    if (!files.length) return

    // Check monthly limit
    if (usageInfo && usageInfo.remaining < files.length) {
      const shortfall = files.length - usageInfo.remaining
      setError(`Not enough scans remaining this month (${usageInfo.remaining} left). Remove ${shortfall} clip${shortfall > 1 ? 's' : ''} or top up with credits.`)
      return
    }

    setScanning(true)
    setProgress(0)
    setError('')
    setScans([])

    const results: FileScan[] = []
    try {
      for (let i = 0; i < files.length; i++) {
        const scan = await scanFile(files[i], i, files.length)
        results.push(scan)
        setScans([...results])
      }

      // Record usage
      await fetch('/api/scan-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tier: USER_TIER, count: files.length }),
      }).then(r => r.json()).then(d => {
        if (d.remaining !== undefined) setUsageInfo(prev => prev ? { ...prev, used: prev.used + files.length, remaining: d.remaining } : null)
      }).catch(() => {})

      // Sort: highest composite first
      results.sort((a, b) => b.composite - a.composite)
      setScans(results)
      setSelectedScan(0)
      setProgress(100)
      setProgressLabel('Generating captions...')

      // Auto-generate captions for all scans using VISION — passes the actual
      // hero frame to the caption model instead of a text description, so the
      // caption isn't a game of telephone through caption_context.
      const generateCaption = async (scan: FileScan, idx: number) => {
        try {
          const heroIdx = scan.result.best_moment?.frame_number ? scan.result.best_moment.frame_number - 1 : 0
          const heroFrame = scan.frames[heroIdx] || scan.frames[0]
          if (!heroFrame) {
            setScans(prev => prev.map((s, i) => i === idx ? { ...s, captionLoading: false } : s))
            return
          }
          const system = buildCaptionSystemPrompt(artistName, voiceRules)
          const textPrompt = `Look at this image. Write ONE Instagram caption ${artistName} would post with it.

Signal from the scan (use as context, do not repeat literally):
- Post recommendation: ${scan.result.post_recommendation}
- Tone match: ${scan.result.tone_match || 'underground electronic'}
- Energy: ${scan.result.overall_energy}/10

Remember: the caption is what the image CAN'T say. Do not describe what's in the frame.`
          const rawCaption = await callClaudeVision(system, [heroFrame], textPrompt, 300)
          const caption = scrubCaption(rawCaption, artistName)
          setScans(prev => prev.map((s, i) => i === idx ? { ...s, caption, captionLoading: false } : s))
        } catch {
          setScans(prev => prev.map((s, i) => i === idx ? { ...s, captionLoading: false } : s))
        }
      }

      // Mark all as loading
      setScans(prev => prev.map(s => ({ ...s, captionLoading: true })))

      // Generate in batches of 3
      for (let i = 0; i < results.length; i += 3) {
        const batch = results.slice(i, i + 3).map((scan, bIdx) => generateCaption(scan, i + bIdx))
        await Promise.all(batch)
      }

      // If multiple scans, also generate ONE carousel-level caption keyed to
      // the strongest scroll-stop image. This is what you'd actually post if
      // treating these as a single carousel (vs separate posts).
      if (results.length > 1) {
        setCarouselCaptionLoading(true)
        setCarouselCaption('')
        setCarouselLeadIndex(null)
        try {
          const leadIdx = pickCarouselLead(results)
          setCarouselLeadIndex(leadIdx)
          const leadScan = results[leadIdx]
          const heroFrameIdx = leadScan.result.best_moment?.frame_number ? leadScan.result.best_moment.frame_number - 1 : 0
          const leadFrame = leadScan.frames[heroFrameIdx] || leadScan.frames[0]
          if (leadFrame) {
            const otherCount = results.length - 1
            const extraRules = `
- This is a CAROUSEL caption. The image you see is slot 1 (the scroll-stopper). There are ${otherCount} more image(s) after it.
- The caption must work for the whole set, not just slot 1. It should reward the swipe.
- Do not enumerate or narrate the slides ("first we have...", "next up..."). Trust the reader to swipe.`
            const system = buildCaptionSystemPrompt(artistName, voiceRules, extraRules)
            const otherContexts = results
              .filter((_, i) => i !== leadIdx)
              .slice(0, 5)
              .map((s, i) => `Slot ${i + 2}: ${s.result.post_recommendation} (energy ${s.result.overall_energy}/10)`)
              .join('\n')
            const textPrompt = `Look at this image — it's slot 1 of a ${results.length}-slide Instagram carousel.

Lead slot (what you see): ${leadScan.result.post_recommendation}
Tone match: ${leadScan.result.tone_match || 'underground electronic'}

Other slots in the set:
${otherContexts}

Write ONE caption for the whole carousel. Lead image is your hook.`
            const rawCaption = await callClaudeVision(system, [leadFrame], textPrompt, 400)
            setCarouselCaption(scrubCaption(rawCaption, artistName))
          }
        } catch {
          // silent — carousel caption is additive, individual captions still work
        } finally {
          setCarouselCaptionLoading(false)
        }
      } else {
        setCarouselCaption('')
        setCarouselLeadIndex(null)
      }

      setProgressLabel('All scans complete')

      // Auto-save to media library by score tier
      for (const s of results) {
        if (s.composite >= 70 && s.frames[0]?.dataUrl) {
          const category = s.composite >= 80 ? 'top_picks' : 'strong'
          const safeName = s.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
          const filename = `score${s.composite}_${safeName}.jpg`
          uploadFrameToR2(s.frames[0].dataUrl, filename, category).catch(() => {})
        }
      }

      // Save to scan history (lightweight — one thumbnail per scan, no full frames)
      // Persist to Supabase first so we get back row ids — needed for clear-history DELETE
      const historyEntries = await Promise.all(results.map(async (s) => {
        const base = {
          name: s.name,
          result: s.result,
          composite: s.composite,
          caption: s.caption,
          thumbnail: s.frames[0]?.dataUrl || undefined,
        }
        try {
          const res = await fetch('/api/media/scans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              file_name: s.name,
              file_size: s.file?.size,
              mime_type: s.file?.type,
              thumbnail_url: s.frames[0]?.dataUrl || null,
              composite_score: s.composite,
              content_score: s.result.content_score,
              result: s.result,
              caption: s.caption || null,
            }),
          })
          const data = await res.json()
          return { ...base, id: data?.scan?.id }
        } catch {
          return base
        }
      }))
      const updated = [...historyEntries, ...savedScans].slice(0, 50) // Keep last 50
      setSavedScans(updated)
      try { localStorage.setItem('signal_scan_history', JSON.stringify(updated)) } catch {}
    } catch (err: any) {
      setError('Scan failed: ' + err.message)
    } finally {
      setScanning(false)
    }
  }

  function useInBroadcast() {
    const scan = scans[selectedScan]
    if (!scan) return
    const params = new URLSearchParams({ context: scan.result.caption_context })
    window.open('/broadcast?' + params.toString(), '_blank')
  }

  async function downloadClip(scan: FileScan) {
    if (!scan.file) return  // restored from history — no File object available
    const url = URL.createObjectURL(scan.file)
    const a = document.createElement('a')
    a.href = url
    const ext = scan.file.name.split('.').pop() || 'mp4'
    const start = scan.result.best_clip_start?.toFixed(0) ?? '0'
    const end = scan.result.best_clip_end?.toFixed(0) ?? '30'
    a.download = `${scan.file.name.replace(/\.[^.]+$/, '')}_trim_${start}s-${end}s.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Upload a base64 frame to R2 and return the public URL
  async function uploadFrameToR2(dataUrl: string, filename: string, category?: string): Promise<string> {
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    const file = new File([blob], filename, { type: 'image/jpeg' })
    const form = new FormData()
    form.append('file', file)
    const endpoint = category ? `/api/media?category=${encodeURIComponent(category)}` : '/api/upload'
    const r = await fetch(endpoint, { method: 'POST', body: form })
    const data = await r.json()
    if (!data.url) throw new Error('Upload failed')
    return data.url
  }

  // Upload an actual File (e.g. original .mp4/.mov) to R2 and return the URL.
  // Used by the Schedule + Post now paths when the active scan is a video —
  // Reels need the real video file hosted publicly, a JPEG frame won't do.
  async function uploadFileToR2(file: File, filename?: string): Promise<string> {
    const form = new FormData()
    const namedFile = filename
      ? new File([file], filename, { type: file.type || 'application/octet-stream' })
      : file
    form.append('file', namedFile)
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    const data = await r.json()
    if (!data.url) throw new Error('Upload failed')
    return data.url
  }

  const [downloading, setDownloading] = useState(false)

  // ── Content Intelligence input modes ────────────────────────────────────────
  const [inputMode, setInputMode] = useState<'files' | 'folder' | 'instagram'>('files')
  const [folderUrl, setFolderUrl] = useState('')
  const [instagramHandle, setInstagramHandle] = useState('')
  const [importing, setImporting] = useState(false)
  const [scanMax, setScanMax] = useState<10 | 25 | 50 | 100>(25)
  const [skipAlreadyScanned, setSkipAlreadyScanned] = useState(true)

  async function urlsToFiles(items: { url: string; filename: string }[]): Promise<File[]> {
    const out: File[] = []
    for (const item of items) {
      try {
        const res = await fetch(item.url)
        if (!res.ok) continue
        const blob = await res.blob()
        const ext = (item.filename.split('.').pop() || '').toLowerCase()
        const type = ext === 'mp4' ? 'video/mp4'
          : ext === 'mov' ? 'video/quicktime'
          : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
          : ext === 'png' ? 'image/png'
          : blob.type || 'application/octet-stream'
        out.push(new File([blob], item.filename, { type }))
      } catch { /* skip failures */ }
    }
    return out
  }

  async function importFromFolder() {
    if (!folderUrl.trim()) { setError('Paste a folder share link'); return }
    setImporting(true)
    setError('')
    try {
      const res = await fetch('/api/content-intelligence/folder-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: folderUrl.trim(), max: scanMax, skipAlreadyScanned, userId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Folder import failed')
      const items: { url: string; filename: string }[] = data.files || []
      if (!items.length) { setError('No supported media files found in folder'); return }
      const fetched = await urlsToFiles(items)
      if (!fetched.length) { setError('Could not download any files from folder'); return }
      addFiles(fetched)
    } catch (err: any) {
      setError(err.message || 'Folder import failed')
    } finally {
      setImporting(false)
    }
  }

  async function importFromInstagram() {
    const raw = instagramHandle.trim()
    if (!raw) { setError('Enter an Instagram handle or profile URL'); return }
    // Extract handle from URL or @handle
    let handle = raw.replace(/^@/, '')
    const urlMatch = raw.match(/instagram\.com\/([^/?#]+)/i)
    if (urlMatch) handle = urlMatch[1]
    handle = handle.replace(/\/$/, '')
    setImporting(true)
    setError('')
    try {
      const res = await fetch('/api/content-intelligence/instagram-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, max: scanMax, skipAlreadyScanned, userId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Instagram import failed')
      const items: { url: string; filename: string }[] = data.files || []
      if (!items.length) { setError('No posts found'); return }
      const fetched = await urlsToFiles(items)
      if (!fetched.length) { setError('Could not download any media from Instagram'); return }
      addFiles(fetched)
    } catch (err: any) {
      setError(err.message || 'Instagram import failed')
    } finally {
      setImporting(false)
    }
  }

  async function handleDownload(scan: FileScan) {
    setDownloading(true)
    try { await downloadClip(scan) } finally { setDownloading(false) }
  }

  const typeColors: Record<string, string> = {
    peak: '#ff2a1a',
    crowd: '#f2f2f2',
    lighting: '#6a7a9a',
    transition: '#9a6a5a',
  }

  const activeScan = scans[selectedScan] || null

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh' }}>

      <SignalLabHeader right={usageInfo ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: s.textDimmer, letterSpacing: '0.1em' }}>
          <span>{usageInfo.used} / {usageInfo.monthlyLimit} scans</span>
          {usageInfo.credits > 0 && <span style={{ color: s.gold }}>+{usageInfo.credits} credits</span>}
          <div style={{ width: '80px', height: '2px', background: s.border }}>
            <div style={{ height: '2px', background: usageInfo.remaining < 5 ? '#8a4a3a' : s.gold, width: `${Math.min(100, (usageInfo.used / usageInfo.monthlyLimit) * 100)}%` }} />
          </div>
        </div>
      ) : undefined} />

      <div style={{ padding: '20px 32px 8px', borderBottom: `1px solid ${s.border}` }}>
        <p style={{ margin: 0, fontSize: '14px', color: s.textDim, lineHeight: 1.6, maxWidth: 640 }}>
          Drop photos or videos. AI scores every frame for reach, authenticity, culture and visual identity — strongest content ranked first, ready to post.
        </p>
      </div>

      <div style={{ padding: '32px' }}>

      <div style={{ display: 'grid', gridTemplateColumns: scans.length > 0 && activeScan && selectedScan >= 0 ? '1fr 1fr' : '1fr', gap: '24px' }}>

        {/* LEFT: UPLOAD + CONTROLS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Scan rules strip — always visible */}
          <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', letterSpacing: '0.18em', color: '#d8d8d8', textTransform: 'uppercase' }}>Max</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {([10, 25, 50, 100] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setScanMax(n)}
                    style={{
                      background: scanMax === n ? s.gold : 'transparent',
                      color: scanMax === n ? '#050505' : s.textDim,
                      border: `1px solid ${scanMax === n ? s.gold : s.border}`,
                      fontFamily: s.font,
                      fontSize: '12px',
                      letterSpacing: '0.1em',
                      padding: '4px 10px',
                      cursor: 'pointer',
                    }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <span style={{ fontSize: '12px', letterSpacing: '0.18em', color: '#d8d8d8', textTransform: 'uppercase' }}>Skip already scanned</span>
              <button
                onClick={() => setSkipAlreadyScanned(v => !v)}
                style={{
                  width: '32px',
                  height: '16px',
                  border: `1px solid ${s.border}`,
                  background: skipAlreadyScanned ? s.gold : 'transparent',
                  position: 'relative',
                  cursor: 'pointer',
                  padding: 0,
                }}>
                <span style={{
                  position: 'absolute',
                  top: '1px',
                  left: skipAlreadyScanned ? '17px' : '1px',
                  width: '12px',
                  height: '12px',
                  background: skipAlreadyScanned ? '#050505' : s.textDimmer,
                  transition: 'left 0.15s',
                }} />
              </button>
            </label>
          </div>

          {/* Input mode tabs */}
          <div style={{ display: 'flex', gap: '0', borderBottom: `1px solid ${s.border}` }}>
            {([
              { id: 'files', label: 'Drop files' },
              { id: 'folder', label: 'Folder URL' },
              { id: 'instagram', label: 'Instagram URL' },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => { setInputMode(tab.id); setError('') }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${inputMode === tab.id ? s.gold : 'transparent'}`,
                  color: inputMode === tab.id ? s.gold : s.textDim,
                  fontFamily: s.font,
                  fontSize: '12px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  padding: '10px 16px',
                  cursor: 'pointer',
                }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Folder URL mode */}
          {inputMode === 'folder' && (
            <div style={{ background: s.panel, border: `1px dashed ${s.border}`, padding: '24px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.18em', color: '#d8d8d8', textTransform: 'uppercase', marginBottom: '10px' }}>Folder share link</div>
              <input
                type="text"
                value={folderUrl}
                onChange={e => setFolderUrl(e.target.value)}
                placeholder="Dropbox or Google Drive folder URL"
                style={{
                  width: '100%',
                  background: '#050505',
                  border: `1px solid ${s.border}`,
                  color: s.text,
                  fontFamily: s.font,
                  fontSize: '12px',
                  padding: '10px 12px',
                  marginBottom: '12px',
                }}
              />
              <button
                onClick={importFromFolder}
                disabled={importing}
                style={{
                  background: 'var(--panel)',
                  border: `1px solid ${s.gold}`,
                  color: s.gold,
                  fontFamily: s.font,
                  fontSize: '12px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  padding: '10px 18px',
                  cursor: importing ? 'wait' : 'pointer',
                  opacity: importing ? 0.6 : 1,
                }}>
                {importing ? 'Importing...' : 'Import →'}
              </button>
              <div style={{ fontSize: '12px', color: '#909090', marginTop: '10px' }}>Dropbox · Google Drive · iCloud not supported</div>
            </div>
          )}

          {/* Instagram URL mode */}
          {inputMode === 'instagram' && (
            <div style={{ background: s.panel, border: `1px dashed ${s.border}`, padding: '24px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.18em', color: '#d8d8d8', textTransform: 'uppercase', marginBottom: '10px' }}>Instagram profile</div>
              <input
                type="text"
                value={instagramHandle}
                onChange={e => setInstagramHandle(e.target.value)}
                placeholder="@handle or instagram.com/handle"
                style={{
                  width: '100%',
                  background: '#050505',
                  border: `1px solid ${s.border}`,
                  color: s.text,
                  fontFamily: s.font,
                  fontSize: '12px',
                  padding: '10px 12px',
                  marginBottom: '12px',
                }}
              />
              <button
                onClick={importFromInstagram}
                disabled={importing}
                style={{
                  background: 'var(--panel)',
                  border: `1px solid ${s.gold}`,
                  color: s.gold,
                  fontFamily: s.font,
                  fontSize: '12px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  padding: '10px 18px',
                  cursor: importing ? 'wait' : 'pointer',
                  opacity: importing ? 0.6 : 1,
                }}>
                {importing ? 'Scanning...' : 'Scan posts →'}
              </button>
              <div style={{ fontSize: '12px', color: '#909090', marginTop: '10px' }}>Pulls posts from your connected account or via public scrape</div>
            </div>
          )}

          {/* Drop zone — only visible in files mode (or when files are queued from any source) */}
          {(inputMode === 'files' || files.length > 0) && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !files.length && fileInputRef.current?.click()}
            style={{
              background: dragging ? '#1d1d1d' : s.panel,
              border: `1px dashed ${dragging ? s.gold : files.length ? s.gold + '60' : s.border}`,
              padding: '32px',
              textAlign: 'center',
              cursor: files.length ? 'default' : 'pointer',
              transition: 'all 0.15s',
            }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,image/*"
              multiple
              onChange={e => addFiles(e.target.files)}
              style={{ display: 'none' }}
            />
            {files.length === 0 ? (
              <div>
                <div style={{ fontSize: '32px', color: s.textDimmer, marginBottom: '12px' }}>⬆</div>
                <div style={{ fontSize: '14px', color: s.textDim, marginBottom: '8px' }}>Drop videos and photos here</div>
                <div style={{ fontSize: '11px', color: s.textDimmer, marginBottom: '12px' }}>MP4, MOV, JPG, PNG · Up to {tierLimits.batchLimit} files per batch</div>
                <div style={{ fontSize: '12px', color: s.textDimmer, lineHeight: '1.6', maxWidth: '320px', margin: '0 auto' }}>
                  Finds your most engaging moments and scores each on<br />
                  <span style={{ color: s.textDim }}>Reach · Authenticity · Culture · Visual Identity</span>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '12px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '12px' }}>{files.length} file{files.length > 1 ? 's' : ''} queued</div>
                {files.map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${s.border}`, fontSize: '11px' }}>
                    <span style={{ color: s.textDim, textAlign: 'left', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ color: s.textDimmer, marginLeft: '12px', flexShrink: 0 }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button
                      onClick={e => { e.stopPropagation(); removeFile(i) }}
                      style={{ background: 'transparent', border: 'none', color: s.textDimmer, cursor: 'pointer', marginLeft: '8px', fontSize: '14px', padding: '0 4px', flexShrink: 0 }}>
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
                  style={{ marginTop: '12px', background: 'transparent', border: `1px solid ${s.border}`, color: s.textDim, fontFamily: s.font, fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer' }}>
                  + Add more
                </button>
              </div>
            )}
          </div>
          )}

          {/* Scan button */}
          {files.length > 0 && !scanning && (
            <button onClick={scanAll} style={{
              background: 'var(--panel)',
              border: `1px solid ${s.gold}`,
              color: s.gold,
              fontFamily: s.font,
              fontSize: '11px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              padding: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              boxShadow: '0 0 20px rgba(255,42,26,0.1)',
            }}>
              {files.length > 1 ? `Scan all ${files.length} files →` : 'Scan content →'}
            </button>
          )}

          {/* Progress */}
          {scanning && (
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '12px', letterSpacing: '0.15em', color: s.textDim, marginBottom: '12px', textTransform: 'uppercase' }}>{progressLabel}</div>
              <div style={{ height: '2px', background: s.border, position: 'relative', marginBottom: '8px' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '2px', background: s.gold, width: `${progress}%`, transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ fontSize: '12px', color: s.textDimmer }}>{progress}%</div>
            </div>
          )}

          {error && <div style={{ fontSize: '11px', color: '#8a4a3a', padding: '12px 16px', border: '1px solid #4a2a1a', background: '#1a0a06' }}>{error}</div>}

          {/* Scan History */}
          {savedScans.length > 0 && scans.length === 0 && (
            <div>
              <button
                onClick={() => setShowHistory(!showHistory)}
                style={{ background: 'none', border: 'none', color: s.textDimmer, fontFamily: s.font, fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', padding: '4px 0' }}
              >
                {showHistory ? '▾' : '▸'} Previous scans ({savedScans.length})
              </button>
              {showHistory && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  {savedScans.map((scan, i) => {
                    const v = scoreVerdict(scan.composite)
                    return (
                      <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', background: s.panel, border: `1px solid ${s.border}`, padding: '10px 14px' }}>
                        {scan.thumbnail && <img src={scan.thumbnail} alt="" style={{ width: '48px', height: '28px', objectFit: 'cover', flexShrink: 0 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '11px', color: s.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scan.caption || scan.result.caption_context || scan.name}</div>
                          <div style={{ fontSize: '11px', color: s.textDimmer }}>
                            R:{scan.result.content_score.reach} · A:{scan.result.content_score.authenticity} · C:{scan.result.content_score.culture} · V:{scan.result.content_score.visual_identity}{typeof scan.result.content_score.shareable_core === 'number' ? ` · S:${scan.result.content_score.shareable_core}` : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '16px', fontWeight: 300, color: v.color }}>{scan.composite}</span>
                          <span style={{ fontSize: '11px', letterSpacing: '0.1em', color: v.color, textTransform: 'uppercase' }}>{v.label}</span>
                        </div>
                      </div>
                    )
                  })}
                  <button
                    onClick={() => {
                      // Delete from Supabase (fire-and-forget) for any rows with ids
                      savedScans.forEach(scan => {
                        if (scan.id) {
                          fetch(`/api/media/scans?id=${scan.id}`, { method: 'DELETE' }).catch(() => {})
                        }
                      })
                      setSavedScans([])
                      localStorage.removeItem('signal_scan_history')
                      setShowHistory(false)
                    }}
                    style={{ background: 'none', border: `1px solid ${s.border}`, color: s.textDimmer, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px', cursor: 'pointer' }}
                  >
                    Clear history
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Post cards — strongest first */}
          {scans.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '12px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase' }}>{scans.length} scanned · strongest first</div>
                  <button onClick={() => {
                    setScans([])
                    setSavedScans([])
                    localStorage.removeItem('signal_scan_history')
                    savedScans.forEach(scan => {
                      if (scan.id) fetch(`/api/media/scans?id=${scan.id}`, { method: 'DELETE' }).catch(() => {})
                    })
                  }} style={{ background: 'none', border: '1px solid rgba(192,64,64,0.5)', color: '#c04040', fontFamily: s.font, fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', padding: '4px 10px' }}>
                    Clear ×
                  </button>
                </div>
                {scans.length > 1 && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => {
                      // Prefer the auto-generated carousel caption; fall back to
                      // lead scan's own caption, then to raw context list.
                      const ctx = carouselCaption
                        || (carouselLeadIndex !== null ? scans[carouselLeadIndex]?.caption : '')
                        || `Carousel of ${scans.length} pieces: ${scans.map(sc => sc.result.caption_context).join('; ')}`
                      const params = new URLSearchParams({ context: ctx })
                      window.open('/broadcast?' + params.toString(), '_blank')
                    }} style={{ background: 'transparent', border: `1px solid ${s.gold}40`, color: s.gold, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 12px', cursor: 'pointer' }}>
                      Carousel caption →
                    </button>
                    <button onClick={() => { setCarouselMode(m => !m); setCarouselSelected(new Set()) }} style={{ background: carouselMode ? 'rgba(212,168,67,0.12)' : 'transparent', border: `1px solid ${carouselMode ? s.gold : s.border}`, color: carouselMode ? s.gold : s.textDimmer, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 12px', cursor: 'pointer' }}>
                      {carouselMode ? 'Cancel' : 'Select'}
                    </button>
                    {carouselMode && carouselSelected.size >= 2 && (
                      <button
                        onClick={async () => {
                          setBuildingCarousel(true)
                          try {
                            const urls: string[] = []
                            for (const idx of Array.from(carouselSelected)) {
                              const sc = scans[idx]
                              const frame = sc.frames[sc.result.best_moment?.frame_number ? sc.result.best_moment.frame_number - 1 : 0] || sc.frames[0]
                              if (frame) {
                                const url = await uploadFrameToR2(frame.dataUrl, `carousel_${sc.name}_${idx}.jpg`)
                                urls.push(url)
                              }
                            }
                            const params = new URLSearchParams({ mediaUrls: urls.join(','), format: 'carousel' })
                            window.open('/broadcast?' + params.toString(), '_blank')
                          } finally {
                            setBuildingCarousel(false)
                            setCarouselMode(false)
                            setCarouselSelected(new Set())
                          }
                        }}
                        disabled={buildingCarousel}
                        style={{ background: 'rgba(255,42,26,0.1)', border: `1px solid rgba(255,42,26,0.4)`, color: buildingCarousel ? s.textDimmer : '#ff6b55', fontFamily: s.font, fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 12px', cursor: buildingCarousel ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {buildingCarousel ? 'Uploading...' : `Build carousel (${carouselSelected.size})`}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {/* Carousel caption panel — only when >1 scan and not selecting */}
              {scans.length > 1 && !carouselMode && (carouselCaptionLoading || carouselCaption) && (
                <div style={{ background: s.panel, border: `1px solid ${s.gold}40`, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', letterSpacing: '0.18em', color: s.gold, textTransform: 'uppercase' }}>
                      Carousel caption
                      {carouselLeadIndex !== null && !carouselCaptionLoading && (
                        <span style={{ color: s.textDimmer, marginLeft: '10px', letterSpacing: '0.12em' }}>
                          Lead: slot {carouselLeadIndex + 1} · {scans[carouselLeadIndex]?.name}
                        </span>
                      )}
                    </div>
                    {!carouselCaptionLoading && carouselCaption && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(carouselCaption).catch(() => {}) }}
                        style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.textDimmer, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 8px', cursor: 'pointer' }}
                      >
                        Copy
                      </button>
                    )}
                  </div>
                  {carouselCaptionLoading ? (
                    <div style={{ fontSize: '12px', color: s.textDimmer, fontStyle: 'italic' }}>Writing carousel caption...</div>
                  ) : (
                    <div style={{ fontSize: '13px', color: s.text, lineHeight: '1.55', whiteSpace: 'pre-wrap' }}>{carouselCaption}</div>
                  )}
                </div>
              )}
              {scans.map((scan, i) => {
                const v = scoreVerdict(scan.composite)
                const bestFrame = scan.frames[scan.result.best_moment?.frame_number ? scan.result.best_moment.frame_number - 1 : 0] || scan.frames[0]
                const isCarouselPicked = carouselSelected.has(i)
                const isSelected = !carouselMode && selectedScan === i
                return (
                  <div
                    key={i}
                    onClick={() => {
                      if (carouselMode) {
                        setCarouselSelected(prev => {
                          const next = new Set(prev)
                          next.has(i) ? next.delete(i) : next.add(i)
                          return next
                        })
                      } else {
                        setSelectedScan(i)
                      }
                    }}
                    style={{
                      background: s.panel,
                      border: `1px solid ${isCarouselPicked ? '#ff6b55' : isSelected ? s.gold + '80' : s.border}`,
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}>
                    {/* Filename */}
                    <div style={{ padding: '8px 16px 6px', fontSize: '11px', color: s.textDimmer, letterSpacing: '0.08em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scan.name}</div>
                    {/* Image */}
                    {bestFrame && (
                      <div style={{ position: 'relative' }}>
                        <img
                          src={bestFrame.dataUrl}
                          alt=""
                          onClick={(e) => { e.stopPropagation(); setLightboxUrl(bestFrame.dataUrl) }}
                          style={{ width: '100%', display: 'block', maxHeight: '360px', objectFit: 'contain', background: '#0a0a0a', cursor: 'zoom-in' }}
                          title="Click to view full image"
                        />
                        {isCarouselPicked && (
                          <div style={{ position: 'absolute', top: '8px', left: '8px', width: '22px', height: '22px', background: '#ff6b55', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#050505', fontWeight: 700 }}>✓</div>
                        )}
                        <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(10,9,7,0.85)', padding: '4px 10px' }}>
                          <span style={{ fontSize: '16px', fontWeight: 300, color: v.color }}>{scan.composite}</span>
                          <span style={{ fontSize: '11px', letterSpacing: '0.12em', color: v.color, textTransform: 'uppercase' }}>{v.label}</span>
                        </div>
                        {i === 0 && scans.length > 1 && (
                          <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(10,9,7,0.85)', padding: '3px 8px', fontSize: '11px', letterSpacing: '0.14em', color: s.green, textTransform: 'uppercase' }}>★ Top pick</div>
                        )}
                      </div>
                    )}
                    {/* Caption + meta */}
                    <div style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '11px', color: s.textDimmer }}>
                          R:{scan.result.content_score.reach} · A:{scan.result.content_score.authenticity} · C:{scan.result.content_score.culture} · V:{scan.result.content_score.visual_identity}{typeof scan.result.content_score.shareable_core === 'number' ? ` · S:${scan.result.content_score.shareable_core}` : ''}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {scan.result.platform_ranking?.slice(0, 2).map((p, pi) => (
                            <span key={pi} style={{ fontSize: '11px', color: s.textDimmer }}>{p.platform.split(' ')[0]}: {p.score}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Frames for selected scan */}
          {activeScan && activeScan.frames.length > 0 && (
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '16px' }}>
              <div style={{ fontSize: '12px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '10px' }}>Extracted frames</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                {activeScan.frames.map((f, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={f.dataUrl} alt="" style={{ width: '100%', display: 'block' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', fontSize: '12px', color: s.textDim, padding: '2px 4px' }}>{f.timestamp.toFixed(1)}s</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: RESULTS */}
        {activeScan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {scans.length > 1 && (
              <div style={{ fontSize: '12px', color: s.textDimmer, letterSpacing: '0.1em', paddingBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedScan === 0 ? <span style={{ color: s.green }}>★ TOP PICK — </span> : null}
                {activeScan.name}
              </div>
            )}

            {/* Content Score */}
            <div style={{ background: s.panel, border: `1px solid ${s.gold}`, boxShadow: '0 0 20px rgba(255,42,26,0.08)' }}>
              {/* Thumbnail strip */}
              {activeScan.frames[0] && (
                <img
                  src={activeScan.frames[0].dataUrl}
                  alt=""
                  onClick={() => setLightboxUrl(activeScan.frames[0].dataUrl)}
                  style={{ width: '100%', display: 'block', cursor: 'zoom-in' }}
                  title="Click to view full image"
                />
              )}
              <div style={{ padding: '24px 28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase' }}>Content intelligence</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 300, color: scoreVerdict(activeScan.composite).color }}>{activeScan.composite}</span>
                  <span style={{ fontSize: '11px', letterSpacing: '0.14em', color: scoreVerdict(activeScan.composite).color, textTransform: 'uppercase' }}>{scoreVerdict(activeScan.composite).label}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Reach', value: activeScan.result.content_score.reach, weight: 0.20, desc: 'Scroll-stop · share trigger' },
                  { label: 'Authenticity', value: activeScan.result.content_score.authenticity, weight: 0.25, desc: 'Voice · genuine energy' },
                  { label: 'Culture', value: activeScan.result.content_score.culture, weight: 0.20, desc: 'Scene cred · underground' },
                  { label: 'Visual ID', value: activeScan.result.content_score.visual_identity, weight: 0.15, desc: 'Palette · composition' },
                  { label: 'Shareable Core', value: activeScan.result.content_score.shareable_core ?? 0, weight: 0.20, desc: 'Screenshot moment · DM-worthy' },
                ].map(metric => {
                  const contribution = Math.round(metric.value * metric.weight)
                  return (
                  <div key={metric.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                      <div style={{ fontSize: '12px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase' }}>{metric.label}</div>
                      <div style={{ fontSize: '11px', color: s.textDimmer, letterSpacing: '0.08em' }}>weight {Math.round(metric.weight * 100)}%</div>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 300, color: metric.value >= 80 ? s.green : metric.value >= 60 ? s.gold : '#8a4a3a', marginBottom: '4px' }}>{metric.value}</div>
                    <div style={{ height: '2px', background: '#1d1d1d', marginBottom: '6px' }}>
                      <div style={{ height: '2px', background: metric.value >= 80 ? s.green : metric.value >= 60 ? s.gold : '#8a4a3a', width: `${metric.value}%`, transition: 'width 0.8s ease' }} />
                    </div>
                    <div style={{ fontSize: '12px', color: s.textDimmer, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{metric.desc}</span>
                      <span style={{ color: s.textDim }}>+{contribution}</span>
                    </div>
                  </div>
                  )
                })}
              </div>
              {/* Composite math breakdown — shows how the score was built */}
              <div style={{ fontSize: '12px', color: s.textDimmer, lineHeight: '1.6', marginBottom: '14px', fontFamily: 'monospace', padding: '8px 10px', background: '#0a0a0a', border: `1px solid ${s.border}` }}>
                {typeof activeScan.result.content_score.shareable_core === 'number' ? (
                  <>({activeScan.result.content_score.reach} × 0.20) + ({activeScan.result.content_score.authenticity} × 0.25) + ({activeScan.result.content_score.culture} × 0.20) + ({activeScan.result.content_score.visual_identity} × 0.15) + ({activeScan.result.content_score.shareable_core} × 0.20) = <span style={{ color: scoreVerdict(activeScan.composite).color }}>{activeScan.composite}</span></>
                ) : (
                  <>({activeScan.result.content_score.reach} × 0.25) + ({activeScan.result.content_score.authenticity} × 0.30) + ({activeScan.result.content_score.culture} × 0.25) + ({activeScan.result.content_score.visual_identity} × 0.20) = <span style={{ color: scoreVerdict(activeScan.composite).color }}>{activeScan.composite}</span></>
                )}
              </div>
              {activeScan.result.content_score.shareable_core_note && (
                <div style={{ fontSize: '11px', color: s.gold, lineHeight: '1.6', marginBottom: '14px', padding: '10px 12px', background: '#0a0a0a', border: `1px solid ${s.gold}`, letterSpacing: '0.02em' }}>
                  <div style={{ fontSize: '11px', letterSpacing: '0.18em', color: s.gold, textTransform: 'uppercase', marginBottom: '6px', opacity: 0.7 }}>Shareable core</div>
                  {activeScan.result.content_score.shareable_core_note}
                </div>
              )}
              <div style={{ fontSize: '12px', color: s.textDim, lineHeight: '1.7', paddingTop: '16px', borderTop: `1px solid ${s.border}` }}>
                {activeScan.result.content_score.reasoning}
              </div>
            </div>

            {/* Best moment */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px 28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase' }}>Best moment</div>
                {!isImageFile(activeScan.file, activeScan.name) && (
                  <button
                    onClick={() => handleDownload(activeScan)}
                    disabled={downloading}
                    style={{
                      background: downloading ? 'transparent' : 'rgba(255,42,26,0.08)',
                      border: `1px solid ${downloading ? s.border : s.gold + '80'}`,
                      color: downloading ? s.textDimmer : s.gold,
                      fontFamily: s.font,
                      fontSize: '11px',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      padding: '6px 14px',
                      cursor: downloading ? 'default' : 'pointer',
                    }}
                  >
                    {downloading ? 'Extracting...' : `↓ Download clip (${activeScan.result.best_clip_start?.toFixed(0) ?? '?'}s – ${activeScan.result.best_clip_end?.toFixed(0) ?? '?'}s)`}
                  </button>
                )}
              </div>
              {!isImageFile(activeScan.file, activeScan.name) ? (
                <div style={{ fontSize: '36px', fontWeight: 300, color: s.gold, marginBottom: '6px', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", letterSpacing: '-0.02em' }}>
                  {activeScan.result.best_moment.timestamp.toFixed(1)}s
                </div>
              ) : (
                <div style={{ fontSize: '12px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '6px' }}>Photo</div>
              )}
              <div style={{ fontSize: '12px', color: s.textDim, marginBottom: '14px', lineHeight: '1.7' }}>
                {activeScan.result.best_moment.reason}
              </div>
              {(activeScan.result as ScanResult & { visual_quality?: string }).visual_quality && (
                <div style={{ fontSize: '11px', color: s.textDimmer, marginBottom: '12px', lineHeight: '1.6', paddingTop: '12px', borderTop: `1px solid ${s.border}` }}>
                  {(activeScan.result as ScanResult & { visual_quality?: string }).visual_quality}
                </div>
              )}
              <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: s.textDimmer }}>
                <span>Energy: <span style={{ color: s.gold }}>{activeScan.result.overall_energy}/10</span></span>
                <span>Type: <span style={{ color: typeColors[activeScan.result.best_moment.type] || s.gold }}>{activeScan.result.best_moment.type}</span></span>
              </div>
            </div>

            {/* Tone + Tags */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {activeScan.result.tone_match && (
                <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                  <div style={{ fontSize: '12px', letterSpacing: '0.2em', color: s.green, textTransform: 'uppercase', marginBottom: '10px' }}>Tone match</div>
                  <div style={{ fontSize: '12px', color: s.textDim, lineHeight: '1.7' }}>{activeScan.result.tone_match}</div>
                </div>
              )}
              {activeScan.result.tags && activeScan.result.tags.length > 0 && (
                <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                  <div style={{ fontSize: '12px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '10px' }}>Auto-tags</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {activeScan.result.tags.map((tag, i) => (
                      <span key={i} style={{ fontSize: '11px', color: s.textDim, background: '#1d1d1d', padding: '4px 10px', letterSpacing: '0.04em' }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Platform ranking */}
            {activeScan.result.platform_ranking && (
              <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                <div style={{ fontSize: '12px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Platform ranking</div>
                {activeScan.result.platform_ranking.map((p, i) => {
                  const pv = scoreVerdict(p.score)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 0', borderBottom: i < activeScan.result.platform_ranking.length - 1 ? `1px solid ${s.border}` : 'none' }}>
                      <div style={{ fontSize: '20px', fontWeight: 300, color: pv.color, width: '36px' }}>{p.score}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          <span style={{ fontSize: '12px', color: s.text }}>{p.platform}</span>
                          <span style={{ fontSize: '11px', letterSpacing: '0.1em', color: pv.color, textTransform: 'uppercase' }}>{pv.label}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: s.textDimmer }}>{p.reason}</div>
                      </div>
                      <div style={{ height: '2px', width: '80px', background: '#1d1d1d' }}>
                        <div style={{ height: '2px', background: pv.color, width: `${p.score}%`, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Platform cuts */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '12px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Clip timestamps</div>
              {Object.entries(activeScan.result.platform_cuts).map(([platform, cut]) => (
                <div key={platform} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${s.border}`, fontSize: '11px' }}>
                  <span style={{ color: s.textDimmer, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{platform}</span>
                  <span style={{ color: s.textDim }}>{cut}</span>
                </div>
              ))}
            </div>

            {/* All moments */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '12px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>All moments</div>
              {activeScan.result.moments.map((moment, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: `1px solid ${s.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: s.text }}>{moment.timestamp.toFixed(1)}s</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: typeColors[moment.type] || s.gold, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{moment.type}</span>
                      <span style={{ fontSize: '12px', color: s.gold }}>{moment.score}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: s.textDimmer }}>{moment.reason}</div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '11px', color: s.textDim, marginBottom: '14px', lineHeight: '1.6' }}>{activeScan.result.post_recommendation}</div>
              <div style={{ fontSize: '12px', color: s.textDimmer, marginBottom: '18px' }}>Caption context: <span style={{ color: s.textDim }}>{activeScan.result.caption_context}</span></div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: schedulingFor === selectedScan ? '16px' : 0 }}>
                <button onClick={() => {
                  if (schedulingFor === selectedScan) {
                    setSchedulingFor(null)
                    setSchedulePhase('edit')
                    setPreviewApproved(false)
                  } else {
                    setSchedulingFor(selectedScan)
                    setSchedulePhase('edit')
                    setPreviewApproved(false)
                    // Default mode: carousel if >1 scan AND we have a generated
                    // carousel caption, else single.
                    const defaultMode = scans.length > 1 && carouselCaption ? 'carousel' : 'single'
                    setScheduleMode(defaultMode)
                    setScheduleCaption(
                      defaultMode === 'carousel'
                        ? carouselCaption
                        : (activeScan.caption || activeScan.result.caption_context || '')
                    )
                    setScheduleFirstComment('')
                    setScheduleHashtags('')
                    setScheduleTagHandles('')
                    setScheduleLocationName('')
                  }
                }} style={{
                  flex: 1,
                  background: schedulingFor === selectedScan ? 'transparent' : 'var(--panel)',
                  border: `1px solid ${schedulingFor === selectedScan ? s.border : s.gold}`,
                  color: schedulingFor === selectedScan ? s.textDim : s.gold,
                  fontFamily: s.font,
                  fontSize: '12px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  padding: '14px',
                  cursor: 'pointer',
                }}>
                  {schedulingFor === selectedScan ? 'Close' : 'Write caption + schedule'}
                </button>
                {scheduledOk === selectedScan && (
                  <div style={{ padding: '14px 18px', fontSize: '12px', letterSpacing: '0.14em', color: s.green, border: `1px solid ${s.green}40`, whiteSpace: 'nowrap' }}>Scheduled ✓</div>
                )}
                {!isImageFile(activeScan.file, activeScan.name) && (
                  <button
                    onClick={() => handleDownload(activeScan)}
                    disabled={downloading}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${s.border}`,
                      color: downloading ? s.textDimmer : s.textDim,
                      fontFamily: s.font,
                      fontSize: '12px',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      padding: '14px 18px',
                      cursor: downloading ? 'default' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {downloading ? 'Extracting...' : '↓ Best clip'}
                  </button>
                )}
              </div>

              {/* Inline schedule panel — multi-step: edit → preview → confirm */}
              {schedulingFor === selectedScan && (
                <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${s.border}` }}>
                  {/* Mode selector — only when 2+ scans exist */}
                  {scans.length > 1 && schedulePhase === 'edit' && (
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                      {(['carousel', 'single'] as const).map(m => (
                        <button
                          key={m}
                          onClick={() => {
                            setScheduleMode(m)
                            setScheduleCaption(
                              m === 'carousel'
                                ? (carouselCaption || scheduleCaption)
                                : (activeScan.caption || scheduleCaption)
                            )
                          }}
                          style={{
                            flex: 1,
                            background: scheduleMode === m ? 'rgba(212,168,67,0.12)' : 'transparent',
                            border: `1px solid ${scheduleMode === m ? s.gold : s.border}`,
                            color: scheduleMode === m ? s.gold : s.textDimmer,
                            fontFamily: s.font,
                            fontSize: '11px',
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            padding: '8px',
                            cursor: 'pointer',
                          }}
                        >
                          {m === 'carousel' ? `Carousel (${scans.length})` : 'This one only'}
                        </button>
                      ))}
                    </div>
                  )}

                  {schedulePhase === 'edit' ? (
                    // ── EDIT PHASE ─────────────────────────────────────────
                    <>
                      <div style={{ fontSize: '12px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '12px' }}>
                        {scheduleMode === 'carousel' ? `Carousel · ${scans.length} slides` : 'Single post'}
                      </div>

                      <label style={{ display: 'block', fontSize: '10px', letterSpacing: '0.14em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '4px' }}>Caption</label>
                      <textarea
                        value={scheduleCaption}
                        onChange={e => { setScheduleCaption(e.target.value); setPreviewApproved(false) }}
                        rows={4}
                        style={{ width: '100%', background: s.panel, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '10px', resize: 'vertical', marginBottom: '10px', boxSizing: 'border-box' }}
                        placeholder="Caption (hook in first 125 chars — no @mentions, no em-dashes)"
                      />

                      <label style={{ display: 'block', fontSize: '10px', letterSpacing: '0.14em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '4px' }}>Tag accounts in image (@handle, one per line)</label>
                      <textarea
                        value={scheduleTagHandles}
                        onChange={e => { setScheduleTagHandles(e.target.value); setPreviewApproved(false) }}
                        rows={2}
                        style={{ width: '100%', background: s.panel, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '10px', resize: 'vertical', marginBottom: '10px', boxSizing: 'border-box' }}
                        placeholder="@fabriclondon&#10;@collaborator"
                      />

                      <label style={{ display: 'block', fontSize: '10px', letterSpacing: '0.14em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '4px' }}>First comment (goes below the post — @mentions + hashtags live here, not in caption)</label>
                      <textarea
                        value={scheduleFirstComment}
                        onChange={e => { setScheduleFirstComment(e.target.value); setPreviewApproved(false) }}
                        rows={2}
                        style={{ width: '100%', background: s.panel, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '10px', resize: 'vertical', marginBottom: '10px', boxSizing: 'border-box' }}
                        placeholder="@fabriclondon · new one out now"
                      />

                      <label style={{ display: 'block', fontSize: '10px', letterSpacing: '0.14em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '4px' }}>Hashtags (comma or space separated, # optional)</label>
                      <input
                        type="text"
                        value={scheduleHashtags}
                        onChange={e => { setScheduleHashtags(e.target.value); setPreviewApproved(false) }}
                        style={{ width: '100%', background: s.panel, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }}
                        placeholder="fabric, newmusic, electronic"
                      />

                      <label style={{ display: 'block', fontSize: '10px', letterSpacing: '0.14em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '4px' }}>Location (optional)</label>
                      <input
                        type="text"
                        value={scheduleLocationName}
                        onChange={e => { setScheduleLocationName(e.target.value); setPreviewApproved(false) }}
                        style={{ width: '100%', background: s.panel, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '10px', marginBottom: '12px', boxSizing: 'border-box' }}
                        placeholder="Fabric, London"
                      />

                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <input type="date" value={scheduleDate} onChange={e => { setScheduleDate(e.target.value); setPreviewApproved(false) }}
                          style={{ flex: 1, background: s.panel, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px 10px' }} />
                        <input type="time" value={scheduleTime} onChange={e => { setScheduleTime(e.target.value); setPreviewApproved(false) }}
                          style={{ flex: 1, background: s.panel, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px 10px' }} />
                      </div>

                      <button
                        disabled={!scheduleCaption.trim() || !scheduleDate || !scheduleTime}
                        onClick={() => { setSchedulePhase('preview'); setPreviewApproved(false) }}
                        style={{ width: '100%', background: 'transparent', border: `1px solid ${s.gold}`, color: s.gold, fontFamily: s.font, fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '12px', cursor: (!scheduleCaption.trim() || !scheduleDate || !scheduleTime) ? 'default' : 'pointer', opacity: (!scheduleCaption.trim() || !scheduleDate || !scheduleTime) ? 0.4 : 1 }}
                      >
                        Preview post →
                      </button>
                    </>
                  ) : (
                    // ── PREVIEW PHASE — renders IG-like mock ──────────────
                    <SchedulePreview
                      mode={scheduleMode}
                      scans={scans}
                      activeScan={activeScan}
                      caption={scheduleCaption}
                      firstComment={scheduleFirstComment}
                      hashtags={scheduleHashtags}
                      tagHandles={scheduleTagHandles}
                      locationName={scheduleLocationName}
                      scheduleDate={scheduleDate}
                      scheduleTime={scheduleTime}
                      artistName={artistName}
                      approved={previewApproved}
                      onEdit={() => setSchedulePhase('edit')}
                      onApprove={() => setPreviewApproved(true)}
                      onConfirm={async () => {
                        setScheduling(true)
                        try {
                          const parsedHashtags = scheduleHashtags
                            .split(/[,\s]+/)
                            .map(h => h.trim().replace(/^#/, ''))
                            .filter(Boolean)
                          const tagUsernames = scheduleTagHandles
                            .split(/[\s,\n]+/)
                            .map(h => h.trim().replace(/^@/, ''))
                            .filter(Boolean)

                          // Apply caption scrub at post time too — user may have edited
                          // after generation and re-introduced banned chars (em-dashes,
                          // wrong NM casing). Hard rule enforcement must be terminal.
                          const cleanCaption = scrubCaption(scheduleCaption, artistName)

                          // Build media URLs by uploading to R2. Fail loud on errors —
                          // a carousel with missing slides is worse than not posting.
                          let media_url: string | null = null
                          let media_urls: string[] | null = null
                          const activeIsImage = isImageFile(activeScan.file, activeScan.name)

                          if (scheduleMode === 'carousel') {
                            // Upload all scans' hero frames (images only — IG carousel
                            // with mixed image/video is not yet supported here)
                            const urls: string[] = []
                            for (let i = 0; i < scans.length; i++) {
                              const sc = scans[i]
                              if (!isImageFile(sc.file, sc.name)) {
                                throw new Error(`Slide ${i + 1} is a video. Carousel mode supports images only for now.`)
                              }
                              const heroIdx = sc.result.best_moment?.frame_number ? sc.result.best_moment.frame_number - 1 : 0
                              const frame = sc.frames[heroIdx] || sc.frames[0]
                              if (!frame) throw new Error(`Slide ${i + 1} has no usable frame`)
                              const safeName = sc.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40)
                              const url = await uploadFrameToR2(frame.dataUrl, `sched_${safeName}_${i}.jpg`)
                              urls.push(url)
                            }
                            media_urls = urls
                          } else if (activeIsImage) {
                            const frame = activeScan.frames[0]
                            if (!frame) throw new Error('No frame available for this image')
                            const safeName = activeScan.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
                            media_url = await uploadFrameToR2(frame.dataUrl, `sched_${safeName}.jpg`)
                          } else {
                            // Video — upload the original file so IG can pull it as a Reel
                            if (!activeScan.file) throw new Error('No video file available')
                            const safeName = activeScan.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
                            media_url = await uploadFileToR2(activeScan.file, `sched_${safeName}`)
                          }

                          // user_tags — default all to image centre (0.5, 0.5). For
                          // carousel, they apply to slot 1 (the lead) unless split
                          // by the user later. Real pin-placement UI comes later.
                          const user_tags = tagUsernames.map((username, i) => ({
                            username,
                            x: 0.5,
                            y: 0.5 + (i * 0.05 - 0.05 * (tagUsernames.length - 1) / 2),
                            slide_index: 0,
                          }))

                          const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
                          const format = scheduleMode === 'carousel'
                            ? 'carousel'
                            : (activeIsImage ? 'post' : 'reel')

                          // fetcher surfaces errors via the toast system + auto-fix
                          // prompt where applicable. It throws a FetcherError on
                          // failure so our catch can still tidy up UI state.
                          await fetcher('/api/schedule', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              platform: 'instagram',
                              caption: cleanCaption,
                              format,
                              scheduled_at: scheduledAt,
                              media_url,
                              media_urls,
                              user_tags: user_tags.length ? user_tags : null,
                              first_comment: scheduleFirstComment ? scrubCaption(scheduleFirstComment, artistName) : null,
                              hashtags: parsedHashtags.length ? parsedHashtags : null,
                              location_name: scheduleLocationName || null,
                              status: 'scheduled',
                              preview_approved_at: new Date().toISOString(),
                            }),
                            errorContext: 'schedule-create',
                          })
                          setScheduledOk(selectedScan)
                          setSchedulingFor(null)
                          setSchedulePhase('edit')
                          setPreviewApproved(false)
                          toast.success(`Scheduled for ${new Date(scheduledAt).toLocaleString()}`, { title: 'Scheduled' })
                        } catch (err) {
                          // fetcher already surfaced the toast for HTTP/network
                          // failures. Only show a manual toast for pre-upload
                          // validation errors (missing frame, mixed carousel, etc).
                          console.error('Schedule error:', err)
                          if (!(err instanceof FetcherError)) {
                            toast.error(err instanceof Error ? err.message : 'Unknown error', { title: 'Could not schedule' })
                          }
                        }
                        setScheduling(false)
                      }}
                      scheduling={scheduling}
                      posting={postingNow}
                      onPostNow={async () => {
                        if (!window.confirm('Post to Instagram now?')) return
                        setPostingNow(true)
                        try {
                          const parsedHashtags = scheduleHashtags
                            .split(/[,\s]+/).map(h => h.trim().replace(/^#/, '')).filter(Boolean)
                          const tagUsernames = scheduleTagHandles
                            .split(/[\s,\n]+/).map(h => h.trim().replace(/^@/, '')).filter(Boolean)

                          // Terminal scrub — enforces em-dash / NM casing even if
                          // user edited the caption after generation.
                          const cleanCaption = scrubCaption(scheduleCaption, artistName)

                          let image_url: string | undefined
                          let image_urls: string[] | undefined
                          let video_url: string | undefined
                          const activeIsImage = isImageFile(activeScan.file, activeScan.name)

                          if (scheduleMode === 'carousel') {
                            const urls: string[] = []
                            for (let i = 0; i < scans.length; i++) {
                              const sc = scans[i]
                              if (!isImageFile(sc.file, sc.name)) {
                                throw new Error(`Slide ${i + 1} is a video. Carousel mode supports images only for now.`)
                              }
                              const heroIdx = sc.result.best_moment?.frame_number ? sc.result.best_moment.frame_number - 1 : 0
                              const frame = sc.frames[heroIdx] || sc.frames[0]
                              if (!frame) throw new Error(`Slide ${i + 1} has no usable frame`)
                              const safeName = sc.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40)
                              urls.push(await uploadFrameToR2(frame.dataUrl, `now_${safeName}_${i}.jpg`))
                            }
                            image_urls = urls
                          } else if (activeIsImage) {
                            const frame = activeScan.frames[0]
                            if (!frame) throw new Error('No frame available for this image')
                            const safeName = activeScan.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
                            image_url = await uploadFrameToR2(frame.dataUrl, `now_${safeName}.jpg`)
                          } else {
                            // Video path — upload the real file, publish as a Reel
                            if (!activeScan.file) throw new Error('No video file available')
                            const safeName = activeScan.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
                            video_url = await uploadFileToR2(activeScan.file, `now_${safeName}`)
                          }

                          const user_tags = tagUsernames.map((username, i) => ({
                            username, x: 0.5,
                            y: 0.5 + (i * 0.05 - 0.05 * (tagUsernames.length - 1) / 2),
                            slide_index: 0,
                          }))

                          const post_format = scheduleMode === 'carousel'
                            ? 'carousel'
                            : (activeIsImage ? 'post' : 'reel')

                          const thumbnailMedia = image_urls && image_urls.length
                            ? image_urls
                            : image_url
                              ? [image_url]
                              : video_url
                                ? [video_url]
                                : []
                          const result = await gatedSend<
                            Record<string, unknown>,
                            { success?: boolean; error?: string }
                          >({
                            endpoint: '/api/social/instagram/post',
                            skipServerPreview: true,
                            previewBody: {
                              caption: cleanCaption,
                              image_url, image_urls, video_url,
                              user_tags: user_tags.length ? user_tags : undefined,
                              first_comment: scheduleFirstComment ? scrubCaption(scheduleFirstComment, artistName) : undefined,
                              hashtags: parsedHashtags.length ? parsedHashtags : undefined,
                              post_format,
                            },
                            buildConfig: () => ({
                              kind: 'post',
                              summary: `Publish ${post_format} to Instagram`,
                              to: '@instagram',
                              platform: 'instagram',
                              text: cleanCaption,
                              media: thumbnailMedia,
                              meta: [
                                { label: 'Format', value: post_format },
                                ...(parsedHashtags.length ? [{ label: 'Hashtags', value: `${parsedHashtags.length}` }] : []),
                                ...(user_tags.length ? [{ label: 'User tags', value: `${user_tags.length}` }] : []),
                                ...(scheduleFirstComment ? [{ label: 'First comment', value: 'set' }] : []),
                              ],
                            }),
                          })
                          if (!result.confirmed) {
                            if (result.error) toast.error(result.error, { title: 'Preview failed' })
                            setPostingNow(false)
                            return
                          }
                          if (!result.data?.success) throw new Error(result.data?.error || result.error || 'post failed')
                          toast.success('Posted to Instagram', { title: 'Live' })
                          setSchedulingFor(null)
                          setSchedulePhase('edit')
                          setPreviewApproved(false)
                        } catch (err) {
                          // Route the failure through the classifier so known
                          // causes (IG token expired, stuck publish state) can
                          // trigger the auto-fix prompt.
                          console.error('Post now error:', err)
                          const { classifyError } = await import('@/lib/error-classifier')
                          const { AUTOFIX_EVENT } = await import('@/lib/fetcher')
                          const cls = classifyError({ error: err, context: 'post-publish' })
                          if (cls.category === 'autofix' && cls.fix) {
                            window.dispatchEvent(new CustomEvent(AUTOFIX_EVENT, {
                              detail: { fix: cls.fix, classification: cls },
                            }))
                          } else if (cls.category !== 'silent') {
                            toast.error(cls.message, { title: 'Post failed', duration: 7000 })
                          }
                        }
                        setPostingNow(false)
                      }}
                    />
                  )}
                </div>
              )}
              </div>{/* end padding */}
            </div>
          </div>
        )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={lightboxUrl}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', cursor: 'default' }}
          />
        </div>
      )}

      </div>

      </div>{/* end inner padding */}
    </div>
  )
}
