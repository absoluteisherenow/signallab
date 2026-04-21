'use client'

/**
 * MobilePost — the "out and about / in the club" mobile IG composer.
 *
 * Flow:
 *   1. Pick media (image or video). Images auto-scan via /api/claude.
 *   2. Optional: GENERATE CAPTION -> 3 variants (safe/loose/raw). Tap to select.
 *   3. Tag accounts (user_tags), collab_with, hashtags, first_comment.
 *   4. voiceCheck lints caption on Review.
 *   5. Approval gate shows full preview; on approve, uploads + POSTs to
 *      /api/social/instagram/post.
 */

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BRT } from '@/lib/design/brt'
import { runVoiceCheck } from '@/lib/voiceCheck'
import { useGatedSend } from '@/lib/outbound'
import { scanSingleFile, type ChainScanResult } from '@/lib/chainScan'
import { generateCaptionVariants } from '@/lib/chainCaptionGen'

const C = BRT

interface QuickScan {
  score: number
  hook: number
  on_brand: boolean
  note: string
}

interface CaptionVariantsResult {
  long: string
  safe: string
  loose: string
  raw: string
}

function summariseChainScan(r: ChainScanResult): QuickScan {
  const cs = r.content_score
  const score = Math.round(
    ((cs.reach + cs.authenticity + cs.culture + cs.visual_identity + cs.shareable_core) / 5) || 0
  )
  const hook = Math.round(cs.shareable_core || cs.reach || score)
  const on_brand = (cs.visual_identity ?? 0) >= 55 && (cs.authenticity ?? 0) >= 55
  const note = (r.wow_note || r.editorial_angle || cs.shareable_core_note || cs.reasoning || '')
    .replace(/[—–]/g, ',')
    .trim()
    .split('\n')[0]
    .slice(0, 220)
  return { score, hook, on_brand, note }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

/** Grab a frame ~1s in from a video file and return as a JPEG data URL.
 *  Used so the scan + caption pipeline can read the content of a Reel too. */
function videoFrameDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'auto'
    v.muted = true
    v.playsInline = true
    v.src = url
    const cleanup = () => URL.revokeObjectURL(url)
    v.onloadedmetadata = () => {
      const seekTo = Math.min(1, (v.duration || 1) / 3)
      v.currentTime = isFinite(seekTo) ? seekTo : 0
    }
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas')
        const maxW = 720
        const scale = v.videoWidth > maxW ? maxW / v.videoWidth : 1
        c.width = Math.round(v.videoWidth * scale)
        c.height = Math.round(v.videoHeight * scale)
        const ctx = c.getContext('2d')
        if (!ctx) throw new Error('no canvas ctx')
        ctx.drawImage(v, 0, 0, c.width, c.height)
        const out = c.toDataURL('image/jpeg', 0.82)
        cleanup()
        resolve(out)
      } catch (err) {
        cleanup()
        reject(err)
      }
    }
    v.onerror = () => { cleanup(); reject(new Error('video load failed')) }
  })
}

export default function MobilePost() {
  const router = useRouter()
  const gatedSend = useGatedSend()
  const fileRef = useRef<HTMLInputElement>(null)
  const [caption, setCaption] = useState('')
  const [when, setWhen] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaDataUrl, setMediaDataUrl] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Scan state
  const [scanning, setScanning] = useState(false)
  const [scan, setScan] = useState<QuickScan | null>(null)
  const [fullScan, setFullScan] = useState<ChainScanResult | null>(null)
  const [scanFailed, setScanFailed] = useState(false)

  // Caption generation
  const [generating, setGenerating] = useState(false)
  const [variants, setVariants] = useState<CaptionVariantsResult | null>(null)
  const [variantsUsed, setVariantsUsed] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // Tags / collab / hashtags / first comment
  const [tagInput, setTagInput] = useState('')
  const [userTags, setUserTags] = useState<string[]>([])
  const [collabWith, setCollabWith] = useState('')
  const [firstComment, setFirstComment] = useState('')

  // Voice check result
  const [voiceErrors, setVoiceErrors] = useState<string[]>([])

  function pickMedia() {
    fileRef.current?.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setMediaFile(f)
    setMediaUrl(URL.createObjectURL(f))
    setScan(null)
    setFullScan(null)
    setScanFailed(false)
    setVariants(null)
    setVariantsUsed(false)

    try {
      const preview = f.type.startsWith('image/')
        ? await fileToDataUrl(f)
        : f.type.startsWith('video/')
          ? await videoFrameDataUrl(f)
          : null
      setMediaDataUrl(preview)
    } catch {
      setMediaDataUrl(null)
    }

    if (f.type.startsWith('image/') || f.type.startsWith('video/')) {
      runFullScan(f)
    }
  }

  // Full chain scan — same pipeline as desktop /broadcast: 6 frames for video,
  // single frame for image, Sonnet vision + Opus editorial polish. The
  // single-frame stub we had before gave Claude one blurry stil to judge a
  // whole Reel on, which produced lazy captions.
  async function runFullScan(file: File) {
    setScanning(true)
    setScanFailed(false)
    try {
      const { result } = await scanSingleFile(file)
      setFullScan(result)
      setScan(summariseChainScan(result))
    } catch {
      setScanFailed(true)
    } finally {
      setScanning(false)
    }
  }

  async function generateCaption() {
    if (!fullScan) {
      setGenError(scanning ? 'wait for scan to finish' : 'scan first')
      return
    }
    setGenerating(true)
    setGenError(null)
    try {
      const result = await generateCaptionVariants({
        scan: fullScan,
        refs: [],
        platform: 'instagram',
        fileName: mediaFile?.name || 'post',
        imageDataUrl: mediaDataUrl,
      })
      setVariants({
        long: (result.long || '').trim(),
        safe: (result.safe || '').trim(),
        loose: (result.loose || '').trim(),
        raw: (result.raw || '').trim(),
      })
      setVariantsUsed(false)
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'generation failed')
    } finally {
      setGenerating(false)
    }
  }

  function selectVariant(v: string) {
    setCaption(v)
    setVariantsUsed(true)
  }

  function addTag() {
    const raw = tagInput.replace(/^@/, '').trim()
    if (!raw) return
    if (userTags.includes(raw)) {
      setTagInput('')
      return
    }
    setUserTags(prev => [...prev, raw])
    setTagInput('')
  }

  function removeTag(u: string) {
    setUserTags(prev => prev.filter(x => x !== u))
  }

  // Block on @ and # in caption itself (hard rule).
  function captionFieldErrors(text: string): string[] {
    const errs: string[] = []
    if (/@[a-zA-Z0-9._]+/.test(text)) errs.push('no @mentions in the caption (use Tag Accounts)')
    if (/#[a-zA-Z0-9_]+/.test(text)) errs.push('no hashtags in the caption (use the Hashtags field)')
    return errs
  }

  async function onReviewTap() {
    setError(null)
    const errs: string[] = []
    errs.push(...captionFieldErrors(caption))
    const v = runVoiceCheck(caption)
    if (!v.em_dash.ok) errs.push('em-dash or en-dash found')
    if (v.human.detail && v.human.detail.length) {
      errs.push(...v.human.detail.map(d => 'AI tell: ' + d))
    }
    if (when === 'schedule') {
      if (!scheduledAt) {
        errs.push('pick a schedule time')
      } else {
        const t = new Date(scheduledAt).getTime()
        const minAllowed = Date.now() + 5 * 60 * 1000
        if (!Number.isFinite(t) || t < minAllowed) {
          errs.push('Pick a time at least 5 minutes from now.')
        }
      }
    }
    if (!mediaFile) errs.push('add media')

    if (errs.length) {
      setVoiceErrors(errs)
      return
    }
    setVoiceErrors([])
    await doSend()
  }

  async function doSend() {
    setSending(true)
    setError(null)
    try {
      if (!mediaFile) throw new Error('no media')

      // Upload first so the gate preview can show the uploaded image URL.
      const form = new FormData()
      form.append('file', mediaFile)
      const upRes = await fetch('/api/upload', { method: 'POST', body: form })
      const upData = await upRes.json()
      if (!upRes.ok || !upData.url) throw new Error(upData.error || 'upload failed')
      const publicUrl: string = upData.url

      const hashtagsArr: string[] = []

      const userTagsPayload = userTags.map(u => ({ username: u, x: 0.5, y: 0.5 }))
      const collabClean = collabWith.trim() ? collabWith.replace(/^@/, '').trim() : undefined

      const firstCommentPreview = firstComment.trim() || undefined

      const isVideo = mediaFile.type.startsWith('video/')
      const format: 'post' | 'reel' = isVideo ? 'reel' : 'post'

      let previewBody: Record<string, unknown>
      let endpoint: string

      if (when === 'schedule') {
        // Route through the scheduler. /api/schedule is gated via
        // requireConfirmed, so useGatedSend still enforces approval.
        const scheduledIso = new Date(scheduledAt).toISOString()
        previewBody = {
          platform: 'instagram',
          caption,
          format,
          scheduled_at: scheduledIso,
          status: 'scheduled',
          media_url: publicUrl,
          user_tags: userTagsPayload,
          first_comment: firstComment.trim() || null,
          hashtags: hashtagsArr.length ? hashtagsArr : null,
          collaborators: collabClean ? [collabClean] : null,
        }
        endpoint = '/api/schedule'
      } else {
        previewBody = {
          caption,
          post_format: format,
          user_tags: userTagsPayload,
          first_comment: firstComment.trim() || undefined,
          hashtags: hashtagsArr.length ? hashtagsArr : undefined,
          collab_with: collabClean,
        }
        if (isVideo) previewBody.video_url = publicUrl
        else previewBody.image_url = publicUrl
        endpoint = '/api/social/instagram/post'
      }

      const result = await gatedSend({
        endpoint,
        previewBody,
        skipServerPreview: true,
        buildConfig: () => ({
          kind: 'post',
          summary: when === 'schedule'
            ? `Schedule Instagram post for ${scheduledAt}`
            : 'Publish Instagram post now',
          platform: 'instagram',
          text: caption,
          media: [publicUrl],
          tags: userTags,
          collaborators: collabClean ? [collabClean] : undefined,
          firstComment: firstCommentPreview,
          scheduledFor: when === 'schedule' ? scheduledAt : undefined,
          mediaAspect: 'square',
          accountHandle: '@nightmanoeuvres',
        }),
      })

      if (!result.confirmed) {
        setSending(false)
        return
      }
      if (result.error) throw new Error(result.error)

      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'send failed')
    } finally {
      setSending(false)
    }
  }

  const canReview = caption.trim().length > 0 && !!mediaFile

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: '0.22em',
    color: C.inkDim,
    textTransform: 'uppercase',
    fontWeight: 700,
    marginBottom: 10,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: C.surface,
    border: `1px solid ${C.divide}`,
    color: C.ink,
    fontFamily: 'inherit',
    fontSize: 14,
    padding: '12px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    minHeight: 44,
  }

  const captionInlineErrors = captionFieldErrors(caption)

  return (
    <div style={{
      background: C.bg,
      minHeight: '100vh',
      color: C.ink,
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      paddingBottom: 140,
      overflowX: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '18px 16px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${C.divide}`,
      }}>
        <div style={{
          fontSize: 11,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          fontWeight: 800,
          color: C.ink,
        }}>
          New post
        </div>
        <button
          onClick={() => router.back()}
          style={{
            background: 'none',
            border: 'none',
            color: C.inkDim,
            fontSize: 13,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontFamily: 'inherit',
            minHeight: 44,
            padding: '0 6px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>

      {done ? (
        <div style={{ padding: '64px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12 }}>
            Queued
          </div>
          <div style={{ fontSize: 13, color: C.inkDim, marginBottom: 28 }}>
            {when === 'schedule' ? 'Scheduled for ' + (scheduledAt || 'later') : 'Posting now'}
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              background: C.red,
              color: C.bg,
              border: 'none',
              padding: '16px 28px',
              fontSize: 12,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontWeight: 800,
              fontFamily: 'inherit',
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            Back to Home
          </button>
        </div>
      ) : (
        <>
          {/* Media */}
          <div style={{ padding: '16px' }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
            <button
              onClick={pickMedia}
              style={{
                width: '100%',
                minHeight: 180,
                background: C.surface,
                border: `1px dashed ${C.divide}`,
                color: C.ink,
                fontFamily: 'inherit',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                padding: 0,
              }}
            >
              {mediaUrl ? (
                mediaFile?.type.startsWith('video/') ? (
                  <video src={mediaUrl} style={{ width: '100%', maxHeight: 320, display: 'block' }} controls />
                ) : (
                  <img src={mediaUrl} alt="" style={{ width: '100%', maxHeight: 320, display: 'block', objectFit: 'cover' }} />
                )
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 32, color: C.inkDim, marginBottom: 8 }}>+</div>
                  <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.inkDim, fontWeight: 700 }}>
                    Add media
                  </div>
                </div>
              )}
            </button>

            {/* Scan verdict card */}
            {mediaFile?.type.startsWith('image/') && (
              <div style={{ marginTop: 10 }}>
                {scanning && (
                  <div style={{
                    padding: '10px 12px',
                    background: C.surface,
                    border: `1px solid ${C.divide}`,
                    fontSize: 11,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    color: C.inkDim,
                  }}>
                    Scanning...
                  </div>
                )}
                {!scanning && scanFailed && (
                  <div style={{
                    padding: '10px 12px',
                    background: C.surface,
                    border: `1px solid ${C.divide}`,
                    fontSize: 11,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    color: C.inkDim,
                  }}>
                    Scan unavailable
                  </div>
                )}
                {!scanning && scan && (
                  <div style={{
                    padding: '12px 14px',
                    background: C.surface,
                    border: `1px solid ${scan.on_brand ? C.divide : C.red}`,
                  }}>
                    <div style={{
                      display: 'flex',
                      gap: 14,
                      marginBottom: 8,
                      alignItems: 'baseline',
                    }}>
                      <div>
                        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.035em' }}>
                          {scan.score}
                        </span>
                        <span style={{ fontSize: 10, color: C.inkDim, letterSpacing: '0.2em', marginLeft: 4, textTransform: 'uppercase' }}>
                          Score
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.035em' }}>
                          {scan.hook}
                        </span>
                        <span style={{ fontSize: 10, color: C.inkDim, letterSpacing: '0.2em', marginLeft: 4, textTransform: 'uppercase' }}>
                          Hook
                        </span>
                      </div>
                      <div style={{
                        marginLeft: 'auto',
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.2em',
                        textTransform: 'uppercase',
                        color: scan.on_brand ? C.ink : C.red,
                      }}>
                        {scan.on_brand ? 'On brand' : 'Off brand'}
                      </div>
                    </div>
                    {scan.note && (
                      <div style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.4 }}>
                        {scan.note}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Caption */}
          <div style={{ padding: '0 16px 16px' }}>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Caption..."
              rows={4}
              style={{
                width: '100%',
                background: C.surface,
                border: `1px solid ${captionInlineErrors.length ? C.red : C.divide}`,
                color: C.ink,
                fontFamily: 'inherit',
                fontSize: 14,
                padding: '14px 14px',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
                lineHeight: 1.5,
              }}
            />
            {captionInlineErrors.length > 0 && (
              <div style={{ fontSize: 11, color: C.red, marginTop: 6, lineHeight: 1.5 }}>
                {captionInlineErrors.join(' · ')}
              </div>
            )}

            {/* Generate caption button or variants */}
            {variants && !variantsUsed ? (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(['long', 'safe', 'loose', 'raw'] as const).map(k => {
                  const text = variants[k]
                  if (!text) return null
                  return (
                    <button
                      key={k}
                      onClick={() => selectVariant(text)}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        background: C.surface,
                        border: `1px solid ${C.divide}`,
                        color: C.ink,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        minHeight: 56,
                      }}
                    >
                      <div style={{
                        fontSize: 10,
                        letterSpacing: '0.22em',
                        textTransform: 'uppercase',
                        fontWeight: 800,
                        color: C.red,
                        marginBottom: 6,
                      }}>
                        {k}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {text}
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <button
                onClick={generateCaption}
                disabled={generating || scanning || !fullScan}
                style={{
                  marginTop: 10,
                  width: '100%',
                  minHeight: 44,
                  background: 'transparent',
                  border: `1px solid ${fullScan ? C.red : C.divide}`,
                  color: fullScan ? C.red : C.inkDim,
                  fontFamily: 'inherit',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  cursor: fullScan && !generating ? 'pointer' : 'default',
                }}
              >
                {generating ? 'Generating...' : scanning ? 'Scanning...' : variantsUsed ? 'Regenerate' : 'Generate caption'}
              </button>
            )}
            {genError && (
              <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>
                {genError}
              </div>
            )}
          </div>

          {/* Tag accounts */}
          <div style={{ padding: '0 16px 16px' }}>
            <div style={labelStyle}>Tag accounts</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: userTags.length ? 10 : 0 }}>
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value.replace(/[^a-zA-Z0-9._@]/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="Add @username"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={addTag}
                disabled={!tagInput.trim()}
                style={{
                  minWidth: 72,
                  minHeight: 44,
                  background: tagInput.trim() ? C.red : C.surface,
                  border: 'none',
                  color: tagInput.trim() ? C.bg : C.inkDim,
                  fontFamily: 'inherit',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  cursor: tagInput.trim() ? 'pointer' : 'default',
                }}
              >
                Add
              </button>
            </div>
            {userTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {userTags.map(u => (
                  <button
                    key={u}
                    onClick={() => removeTag(u)}
                    style={{
                      fontSize: 12,
                      padding: '6px 10px',
                      background: C.surface,
                      border: `1px solid ${C.divide}`,
                      color: C.ink,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>@{u}</span>
                    <span style={{ color: C.inkDim, fontSize: 14 }}>×</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Collab with */}
          <div style={{ padding: '0 16px 16px' }}>
            <div style={labelStyle}>Collab with</div>
            <input
              value={collabWith}
              onChange={e => setCollabWith(e.target.value.replace(/[^a-zA-Z0-9._@]/g, ''))}
              placeholder="@username (optional)"
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: C.inkDim, marginTop: 6, lineHeight: 1.5 }}>
              They&apos;ll get an invite to co-author. Post lands on both grids after they accept.
            </div>
          </div>

          {/* First comment */}
          <div style={{ padding: '0 16px 20px' }}>
            <div style={labelStyle}>First comment</div>
            <textarea
              value={firstComment}
              onChange={e => setFirstComment(e.target.value)}
              placeholder="Optional first-comment text"
              rows={2}
              style={{
                ...inputStyle,
                resize: 'vertical',
                lineHeight: 1.5,
              }}
            />
          </div>

          {/* When */}
          <div style={{ padding: '0 16px 20px' }}>
            <div style={labelStyle}>When</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {(['now', 'schedule'] as const).map(w => {
                const active = when === w
                return (
                  <button
                    key={w}
                    onClick={() => setWhen(w)}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      background: active ? C.red : C.surface,
                      border: `1px solid ${active ? C.red : C.divide}`,
                      color: active ? C.bg : C.ink,
                      fontFamily: 'inherit',
                      fontSize: 12,
                      fontWeight: 800,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                  >
                    {w === 'now' ? 'Now' : 'Schedule'}
                  </button>
                )
              })}
            </div>
            {when === 'schedule' && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                style={inputStyle}
              />
            )}
          </div>

          {/* Review & approve */}
          <div style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 64,
            padding: '12px 16px',
            background: C.bg,
            borderTop: `1px solid ${C.divide}`,
          }}>
            {voiceErrors.length > 0 && (
              <div style={{
                fontSize: 11,
                color: C.red,
                marginBottom: 8,
                lineHeight: 1.5,
              }}>
                {voiceErrors.map((e, i) => <div key={i}>• {e}</div>)}
              </div>
            )}
            {error && (
              <div style={{
                fontSize: 11,
                color: C.red,
                marginBottom: 8,
                lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}
            <button
              onClick={onReviewTap}
              disabled={!canReview || sending}
              style={{
                width: '100%',
                minHeight: 56,
                background: canReview && !sending ? C.red : C.surface,
                border: 'none',
                color: canReview && !sending ? C.bg : C.inkDim,
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                cursor: canReview && !sending ? 'pointer' : 'default',
              }}
            >
              {sending ? 'Sending...' : 'Review & approve'}
            </button>
          </div>
        </>
      )}

    </div>
  )
}
