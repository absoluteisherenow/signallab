'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BRT } from '@/lib/design/brt'
import { useGatedSend } from '@/lib/outbound'
import { generateCaptionVariants } from '@/lib/chainCaptionGen'
import { runVoiceCheck } from '@/lib/voiceCheck'
import type { ChainScanResult } from '@/lib/chainScan'
import { extractFrames, type ScanFrame } from '@/lib/chainScan'
import { supabase } from '@/lib/supabaseBrowser'
import type { VoiceRef, Platform, CaptionVariant } from './types'
import { PLATFORM_LABEL, PLATFORM_LIMITS } from './types'
import { BrainVerdictCard } from './BrainVerdictCard'

interface Props {
  scan: ChainScanResult
  /** The actual File blob. Null after a session restore (sessionStorage
   *  can't round-trip blobs) — publish is gated on reattach. Required to
   *  upload to R2 and hand Meta Graph a public URL; data URLs / blob URLs
   *  will not resolve from their side. */
  file: File | null
  fileName: string
  isVideo: boolean
  thumbnail: string | null
  refs: VoiceRef[]
  alignmentScore: number
  onOpenRefs: () => void
  onRemoveRef?: (id: string) => void
  /** Seed the context field from an upstream source (e.g. /broadcast?idea=).
   *  Pre-commits so first caption render uses it without waiting for blur. */
  initialContext?: string
}

const VARIANTS: CaptionVariant[] = ['long', 'safe', 'loose', 'raw']

/**
 * Intent chips — one-tap context presets for the most common NM post types.
 * Each chip prefills the context field with a real angle, so Claude never
 * has to fill a void with poetry. The prefill text is intentionally written
 * like the artist would brief a collaborator: direct, unambiguous, the WHY
 * not just the WHAT.
 */
const INTENT_CHIPS: { key: string; label: string; prefill: string }[] = [
  { key: 'announce', label: 'Announce', prefill: 'announce a new show. no date confirmed in the caption unless we know it.' },
  { key: 'release', label: 'Release', prefill: 'announce or remind about a release. keep it plain, link lives in bio.' },
  { key: 'press',    label: 'Press',    prefill: 'new press photos. signal-boost the photographer in a first-comment tag placeholder.' },
  { key: 'studio',   label: 'Studio',   prefill: 'studio moment. name gear if it appears, do not embellish the process.' },
  { key: 'live',     label: 'Live',     prefill: 'live show recap or teaser. concrete venue + day only if we know it.' },
  { key: 'thanks',   label: 'Thanks',   prefill: 'thank a venue, photographer, collaborator or radio host. understated, never effusive.' },
  { key: 'teaser',   label: 'Teaser',   prefill: 'tease something coming. no dates, no names, no hype words. fragment only.' },
  { key: 'story',    label: 'Story',    prefill: 'quick IG story style update. a line max. 🌓 sign-off.' },
]

export function PhaseVoice({
  scan,
  file,
  fileName,
  isVideo,
  thumbnail,
  refs,
  alignmentScore,
  onOpenRefs,
  onRemoveRef,
  initialContext,
}: Props) {
  const [captions, setCaptions] = useState<Record<CaptionVariant, string> | null>(null)
  // Per-variant user edits. Overrides the AI output. Wiped when a fresh
  // regen lands so the user's local tweaks don't shadow better generations.
  const [edits, setEdits] = useState<Partial<Record<CaptionVariant, string>>>({})
  const [variant, setVariant] = useState<CaptionVariant>('loose')
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  // Brain verdict state — when present and gated, the publish button blocks
  // until Anthony either re-checks with a passing verdict or explicitly
  // overrides. Any hard_block failure or confidence below the abstain
  // threshold flips `brainBlocked` on.
  const [brainBlocked, setBrainBlocked] = useState(false)
  const [brainOverride, setBrainOverride] = useState(false)
  // Schedule state — inline picker, no modal. `scheduleOpen` toggles the
  // datetime row under the CTA. Default to "tonight 19:00" because 18:00–19:00
  // is NM's validated peak (reference_ig_posting_times.md).
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleAt, setScheduleAt] = useState<string>(defaultScheduleISO())
  const [scheduling, setScheduling] = useState(false)
  const [scheduledMsg, setScheduledMsg] = useState<string | null>(null)
  // Tags / details panel — user_tags, location, first_comment, hashtags.
  // IG won't let you put @mentions in captions (HARD RULE
  // feedback_no_tags_in_captions) so this is the ONLY place tags land.
  // Open by default on IG/Threads so the user sees the tagging/location/
  // first-comment fields immediately instead of hunting for a toggle.
  const [tagsOpen, setTagsOpen] = useState(true)
  // Comma-separated @handles typed by the user. Strip @ on normalise.
  const [tagPeople, setTagPeople] = useState('')
  const [locationName, setLocationName] = useState('')
  const [firstCommentExtra, setFirstCommentExtra] = useState('')
  // NM is 92% no-hashtags per project_nm_performance_baselines.md — off by
  // default. If toggled on, the user types comma-separated tags, hashtag
  // chars are optional.
  const [hashtagsEnabled, setHashtagsEnabled] = useState(false)
  const [hashtagsText, setHashtagsText] = useState('')
  // Collaborators = IG Collab co-authors (post header shows "with @x").
  // Different concept to user_tags — requires each co-author to accept
  // the invite before it goes live. Memory HARD feedback_collabs_hit_miss
  // says collabs are hit-and-miss for NM — warn, don't default on.
  const [collabInput, setCollabInput] = useState('')
  // Alt text for accessibility + IG search ranking.
  const [altText, setAltText] = useState('')
  // Reel-only: whether it also hits the main grid. Default true (IG default).
  const [shareToFeed, setShareToFeed] = useState(true)
  // Live IG verification results per handle. Key = lowercased handle.
  // 'pending' | 'ok' | 'missing' | 'error'. Drives the green/red dot
  // next to each typed tag.
  const [handleStatus, setHandleStatus] = useState<Record<string, 'pending' | 'ok' | 'missing' | 'error'>>({})
  // Supabase-side artist suggestions when the user starts typing a handle.
  // Populated by a cheap /api/tag-suggest fetch — surfaces the real
  // artist_profiles we've scanned so the user can't mistype "@dotmjr"
  // vs "@dot_major".
  const [suggestions, setSuggestions] = useState<{ handle: string; name: string }[]>([])
  const [suggestFor, setSuggestFor] = useState<'people' | 'collab' | null>(null)
  // `context` is the single most important input for caption quality. Without
  // it Claude has nothing to write TOWARD (no release, no gig, no angle) and
  // falls back to poetic description — the fortune-cookie failure mode.
  const [context, setContext] = useState(initialContext ?? '')
  // Debounced context that actually triggers regen — so typing doesn't
  // fire a Claude call on every keystroke. Seed with initialContext so the
  // first generation already reflects the pinned idea's angle.
  const [committedContext, setCommittedContext] = useState(initialContext ?? '')
  // Intent chip is now BACKEND ONLY — it used to paste its full directive
  // ("studio moment. name gear if it appears, do not embellish the process.")
  // into the user-visible context field, which looked like prompt leakage to
  // the artist. Now the chip stores just a key; the full prefill is merged
  // into committedContext at call time and never shown in the textarea.
  const [activeIntent, setActiveIntent] = useState<string | null>(null)
  const intentPrefill = activeIntent ? (INTENT_CHIPS.find(c => c.key === activeIntent)?.prefill ?? '') : ''
  const mergedContext = [intentPrefill, committedContext].filter(s => s && s.trim()).join('\n').trim()

  // Cover picker (video only). IG-style every-frame scrubber — the artist
  // drags through the full video timeline, the live preview seeks to that
  // moment, `thumb_offset` (ms into clip) is sent to Meta's REELS container
  // on publish. A filmstrip of 12 evenly-spaced frames sits under the
  // scrubber for visual orientation (same pattern as IG's native cover
  // tool). null coverTime = let Meta pick frame 0.
  const [coverFrames, setCoverFrames] = useState<ScanFrame[]>([])
  const [coverTime, setCoverTime] = useState<number>(0)
  const [videoDuration, setVideoDuration] = useState<number>(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const coverVideoRef = useRef<HTMLVideoElement | null>(null)
  const coverOffsetMs = useMemo(() => {
    if (!isVideo || !videoDuration) return null
    return Math.max(0, Math.round(coverTime * 1000))
  }, [isVideo, coverTime, videoDuration])

  useEffect(() => {
    let cancelled = false
    if (!isVideo || !file) {
      setCoverFrames([])
      setCoverTime(0)
      setVideoDuration(0)
      if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null) }
      return
    }
    // Object URL for the scrubber preview — revoked on cleanup so the
    // browser doesn't leak the blob.
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    // Background filmstrip — 12 thumbs for visual orientation under the
    // slider. Not canonical frames; just waypoints so the artist knows
    // roughly where in the clip they're scrubbing to.
    extractFrames(file, 12)
      .then(frames => { if (!cancelled) setCoverFrames(frames) })
      .catch(() => { if (!cancelled) setCoverFrames([]) })
    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [isVideo, file])

  // Active priority gig — fetched once on mount so every caption regen
  // anchors to the current north star without the artist retyping it.
  // Before this shipped, I had the Vespers priority baked into memory but
  // wasn't applying it at caption-gen time, which is what caused the
  // "falling flat / losing faith" incident on 2026-04-21. Decision tree
  // now: next confirmed upcoming gig in DB → formatted priority string →
  // injected into chainCaptionGen. Gigs DB is source of truth — if the
  // artist moves the priority, the system follows automatically.
  const [priorityContext, setPriorityContext] = useState<string | null>(null)
  // Authed user id — passed to chainCaptionGen so the central brain can
  // post-check output and log verdicts to invariant_log. Optional: caption
  // gen still works for unauthed sessions (degrades to no telemetry).
  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data.user?.id || null)
    })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const today = new Date().toISOString().slice(0, 10)
        const { data } = await supabase
          .from('gigs')
          .select('title, venue, location, date, status, notes')
          .gte('date', today)
          .in('status', ['confirmed', 'pending'])
          .order('date', { ascending: true })
          .limit(1)
        if (cancelled) return
        const next = data?.[0]
        if (!next) { setPriorityContext(null); return }
        const d = new Date(next.date)
        const when = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        const parts = [
          next.title,
          next.venue,
          next.location,
          when,
        ].filter(Boolean).join(' · ')
        // Soft-append notes for extra flavour without over-stuffing the
        // caption prompt. Cap to a single line so the anchor stays compact.
        const notes = (next.notes || '').replace(/\s+/g, ' ').trim().slice(0, 140)
        const full = notes ? `${parts} — ${notes}` : parts
        setPriorityContext(full)
      } catch {
        if (!cancelled) setPriorityContext(null)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const gatedSend = useGatedSend()

  useEffect(() => {
    setLoading(true)
    setErr(null)
    generateCaptionVariants({ scan, refs, platform, fileName, imageDataUrl: thumbnail, context: mergedContext, priorityContext: priorityContext ?? undefined, userId: userId ?? undefined })
      .then((c) => {
        setCaptions({ long: c.long, safe: c.safe, loose: c.loose, raw: c.raw })
        setEdits({})
      })
      .catch((e: Error) => setErr(e.message || 'Caption generation failed'))
      .finally(() => setLoading(false))
  }, [scan, refs, platform, fileName, thumbnail, mergedContext, priorityContext, userId])

  // Autocomplete: fetch artist suggestions when the last token in the
  // focused field is a partial @handle. Debounced at 220ms so we don't
  // spam supabase on every keystroke.
  useEffect(() => {
    if (!suggestFor) return
    const raw = suggestFor === 'people' ? tagPeople : collabInput
    const tokens = raw.split(/[,\s]+/)
    const last = (tokens[tokens.length - 1] || '').replace(/^@+/, '').trim()
    if (last.length < 2) { setSuggestions([]); return }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tag-suggest?q=${encodeURIComponent(last)}`)
        const json = await res.json()
        setSuggestions(json.suggestions || [])
      } catch {
        setSuggestions([])
      }
    }, 220)
    return () => clearTimeout(t)
  }, [tagPeople, collabInput, suggestFor])

  // User edits win over AI output. Empty-string edit is intentional
  // (user cleared the field) so check for undefined explicitly.
  const aiCurrent = captions?.[variant] || ''
  const current = edits[variant] !== undefined ? edits[variant]! : aiCurrent
  const isEdited = edits[variant] !== undefined && edits[variant] !== aiCurrent
  const check = useMemo(() => runVoiceCheck(current), [current])
  const limit = PLATFORM_LIMITS[platform]
  const over = current.length > limit

  // Normalised tag payloads. Derived on every render (cheap — just string
  // splits). Empty arrays/strings when the user hasn't filled anything in.
  const tagPayload = useMemo(() => {
    const handles = tagPeople
      .split(/[,\s]+/)
      .map(h => h.trim().replace(/^@+/, ''))
      .filter(Boolean)
    // IG user_tags require x/y in 0-1. We default centre-centre because the
    // chain doesn't expose a tap-on-image UI yet; the user can reposition
    // later in IG if needed. Tags still go to the right people; the
    // location is cosmetic.
    const user_tags = handles.map(username => ({ username, x: 0.5, y: 0.5 }))
    const hashtags = hashtagsEnabled
      ? hashtagsText
          .split(/[,\s]+/)
          .map(h => h.trim().replace(/^#+/, ''))
          .filter(Boolean)
      : []
    const collaborators = collabInput
      .split(/[,\s]+/)
      .map(h => h.trim().replace(/^@+/, ''))
      .filter(Boolean)
    // first_comment = @handles on line 1, optional user line 2, hashtags on
    // line 3. IG strips empty lines so this reads clean.
    const handleLine = handles.length ? handles.map(h => `@${h}`).join(' ') : ''
    const hashLine = hashtags.length ? hashtags.map(h => `#${h}`).join(' ') : ''
    const firstCommentParts = [handleLine, firstCommentExtra.trim(), hashLine].filter(Boolean)
    const first_comment = firstCommentParts.join('\n\n') || undefined
    return {
      user_tags,
      hashtags,
      first_comment,
      location_name: locationName.trim() || undefined,
      handles,
      collaborators,
      alt_text: altText.trim() || undefined,
      share_to_feed: shareToFeed,
    }
  }, [tagPeople, hashtagsEnabled, hashtagsText, firstCommentExtra, locationName, collabInput, altText, shareToFeed])

  const tagBadge = useMemo(() => {
    const bits: string[] = []
    if (tagPayload.handles.length) bits.push(`${tagPayload.handles.length} tag${tagPayload.handles.length === 1 ? '' : 's'}`)
    if (tagPayload.collaborators.length) bits.push(`${tagPayload.collaborators.length} collab`)
    if (tagPayload.location_name) bits.push('loc')
    if (tagPayload.hashtags.length) bits.push(`${tagPayload.hashtags.length}#`)
    if (firstCommentExtra.trim()) bits.push('note')
    if (tagPayload.alt_text) bits.push('alt')
    return bits.join(' · ')
  }, [tagPayload, firstCommentExtra])

  // Live IG verification: for every fully-typed handle (after a comma or
  // space), ping the verify endpoint. Marks the handle green/red so the
  // user knows the tag will resolve on IG before publishing.
  useEffect(() => {
    const handles = [
      ...tagPayload.handles,
      ...tagPayload.collaborators,
    ]
    const unchecked = handles.filter(h => !(h.toLowerCase() in handleStatus))
    if (!unchecked.length) return
    setHandleStatus(prev => {
      const next = { ...prev }
      unchecked.forEach(h => { next[h.toLowerCase()] = 'pending' })
      return next
    })
    unchecked.forEach(async (h) => {
      try {
        const res = await fetch(`/api/tag-suggest?verify=${encodeURIComponent(h)}`)
        const json = await res.json()
        setHandleStatus(prev => ({
          ...prev,
          [h.toLowerCase()]: json.ok === true ? 'ok' : json.ok === null ? 'pending' : 'missing',
        }))
      } catch {
        setHandleStatus(prev => ({ ...prev, [h.toLowerCase()]: 'error' }))
      }
    })
  }, [tagPayload.handles, tagPayload.collaborators, handleStatus])

  // Human-readable voice blend label for the approval preview. The modal
  // already shows a numeric alignment score, but without the WHO the score
  // is floating. "You (NM 100) × Dot Major (80) × Burial (60)" tells the
  // user EXACTLY which voices and which weights shaped the caption — full
  // artist names (no shortName), because this is receipts, not chrome.
  const voiceBlendLabel = useMemo(() => {
    if (!refs.length) return 'no refs'
    return refs
      .slice()
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map(r => {
        const name = r.kind === 'self' ? 'You (NM)' : r.name
        return `${name} ${r.weight}`
      })
      .join(' × ')
  }, [refs])

  /**
   * Schedule = same approve-before-send gate as publish (HARD RULE:
   * feedback_approve_before_send). Routes through `useGatedSend` so the
   * user sees the full rendered preview (caption + media + scheduled
   * time + voice score) and has to explicitly confirm before the row
   * ever hits `scheduled_posts`. The cron
   * `/api/crons/publish-scheduled` picks it up when the timestamp fires.
   *
   * `preview_approved_at` is NOT self-stamped here — the backend stamps
   * it only after `confirmed: true` clears `requireConfirmed`.
   */
  async function handleSchedule() {
    if (!current || over || !check.overall) return
    if (!scheduleAt) return
    const when = new Date(scheduleAt)
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
      setScheduledMsg('pick a time in the future')
      return
    }
    setScheduling(true)
    setScheduledMsg(null)
    try {
      const prettyWhen = when.toLocaleString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit',
      })
      const scheduleMeta = [
        { label: 'Format', value: isVideo ? 'Reel / Video' : 'Image' },
        { label: 'Voice aligned', value: `${alignmentScore}/100` },
        { label: 'Written through', value: voiceBlendLabel },
        { label: 'Variant', value: variant.toUpperCase() },
      ]

      await gatedSend({
        endpoint: '/api/schedule',
        skipServerPreview: true,
        previewBody: {
          platform,
          caption: current,
          format: isVideo ? 'reel' : 'post',
          scheduled_at: when.toISOString(),
          status: 'scheduled',
          media_url: thumbnail || null,
          user_tags: tagPayload.user_tags.length ? tagPayload.user_tags : null,
          first_comment: tagPayload.first_comment || null,
          hashtags: tagPayload.hashtags.length ? tagPayload.hashtags : null,
          location_name: tagPayload.location_name || null,
          collaborators: tagPayload.collaborators.length ? tagPayload.collaborators : null,
          alt_text: tagPayload.alt_text || null,
          share_to_feed: tagPayload.share_to_feed,
        },
        buildConfig: () => ({
          // GateKind only knows 'post' — scheduled-vs-now is conveyed in
          // the summary line + the "Scheduled for" meta row.
          kind: 'post',
          platform,
          summary: `Schedule for ${PLATFORM_LABEL[platform]} · ${prettyWhen}`,
          text: current,
          media: thumbnail ? [thumbnail] : [],
          meta: scheduleMeta,
          scheduledFor: prettyWhen,
          firstComment: tagPayload.first_comment,
          locationName: tagPayload.location_name,
          tags: tagPayload.handles,
          collaborators: tagPayload.collaborators,
          altText: tagPayload.alt_text,
          shareToFeed: tagPayload.share_to_feed,
          mediaAspect: isVideo ? 'story' : 'square',
        }),
        onSent: () => {
          setScheduledMsg(`scheduled for ${prettyWhen}`)
          setScheduleOpen(false)
        },
        onError: (e) => {
          setScheduledMsg(e instanceof Error ? e.message : 'schedule failed')
        },
      })
    } finally {
      setScheduling(false)
    }
  }

  async function handlePublish() {
    if (!current || over || !check.overall) return
    setSending(true)
    try {
      // Threads shares IG Graph's cross-post flow; point it at IG post for now.
      const endpoint =
        platform === 'instagram' ? '/api/social/instagram/post'
        : platform === 'tiktok' ? '/api/social/tiktok/post'
        : platform === 'threads' ? '/api/social/instagram/post'
        : '/api/social/twitter/post'

      const publishMeta = [
        { label: 'Format', value: isVideo ? 'Reel / Video' : 'Image' },
        { label: 'Voice aligned', value: `${alignmentScore}/100` },
        { label: 'Written through', value: voiceBlendLabel },
        { label: 'Variant', value: variant.toUpperCase() },
      ]

      const isInstagram = platform === 'instagram' || platform === 'threads'

      // MUST upload the blob to R2 before sending to Meta — Graph API only
      // accepts public HTTPS URLs. Previously we passed `thumbnail` (a data
      // URL from canvas extraction) which Meta rejected, and for video posts
      // we never set `video_url` at all. Result: publish silently broke.
      // Session-restored flow has no blob — gate on reattach.
      if (isInstagram && !file) {
        setErr('reattach media to publish — session was restored')
        return
      }

      let mediaUrl: string | null = null
      if (isInstagram && file) {
        setErr(null)
        const fd = new FormData()
        fd.append('file', file)
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd })
        if (!uploadRes.ok) {
          const txt = await uploadRes.text().catch(() => '')
          throw new Error(`upload failed (${uploadRes.status}): ${txt.slice(0, 120)}`)
        }
        const uploaded = await uploadRes.json() as { url?: string }
        if (!uploaded.url) throw new Error('upload returned no url')
        mediaUrl = uploaded.url
      }

      // IG post endpoint takes image_url + user_tags + first_comment +
      // hashtags + location_id + collaborators + alt_text + share_to_feed.
      // Other platforms ignore the IG-only fields.
      const publishBody: Record<string, unknown> = { caption: current, platform }
      if (isInstagram && mediaUrl) {
        if (isVideo) publishBody.video_url = mediaUrl
        else publishBody.image_url = mediaUrl
      }
      if (isInstagram && tagPayload.user_tags.length) publishBody.user_tags = tagPayload.user_tags
      if (isInstagram && tagPayload.first_comment) publishBody.first_comment = tagPayload.first_comment
      if (isInstagram && tagPayload.hashtags.length) publishBody.hashtags = tagPayload.hashtags
      if (isInstagram && tagPayload.collaborators.length) publishBody.collaborators = tagPayload.collaborators
      if (isInstagram && tagPayload.alt_text) publishBody.alt_text = tagPayload.alt_text
      if (isInstagram && isVideo) publishBody.share_to_feed = tagPayload.share_to_feed
      if (isInstagram && isVideo && coverOffsetMs != null) publishBody.thumb_offset = coverOffsetMs

      await gatedSend({
        endpoint,
        skipServerPreview: true,
        previewBody: publishBody,
        buildConfig: () => ({
          kind: 'post',
          platform,
          summary: `Publish to ${PLATFORM_LABEL[platform]}`,
          text: current,
          media: thumbnail ? [thumbnail] : [],
          meta: publishMeta,
          firstComment: tagPayload.first_comment,
          locationName: tagPayload.location_name,
          tags: tagPayload.handles,
          collaborators: tagPayload.collaborators,
          altText: tagPayload.alt_text,
          shareToFeed: tagPayload.share_to_feed,
          mediaAspect: isVideo ? 'story' : 'square',
        }),
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'publish failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12, minHeight: 0 }}>
      {/* Main: caption */}
      <div
        style={{
          background: BRT.ticket,
          border: `1px solid ${BRT.red}`,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          minWidth: 0,
          minHeight: 0,
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.3em', color: BRT.red, fontWeight: 700, textTransform: 'uppercase' }}>
              ◉ Voice · Your aligned tone
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1, marginTop: 6, color: BRT.ink }}>
              Caption written for this clip
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {VARIANTS.map(v => (
              <button
                key={v}
                onClick={() => setVariant(v)}
                style={{
                  padding: '7px 12px',
                  background: variant === v ? 'rgba(255,42,26,0.04)' : 'transparent',
                  border: `1px solid ${variant === v ? BRT.red : BRT.borderBright}`,
                  color: variant === v ? BRT.red : '#9a9a9a',
                  fontSize: 10,
                  letterSpacing: '0.22em',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Voice blend banner — always visible, including during generation.
            The user sees WHO is shaping the caption before they see the
            caption itself. Intelligence up front, not hidden in a sidebar.
            Full names (no shortening) so the artist reads the alignment
            clearly, not a truncated label. Evidence strip below each ref
            shows what deep-dive data actually reached the prompt — so the
            artist can see that style_rules / chips / lowercase_pct are
            loaded, not invented. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '10px 14px',
            background: BRT.ticketLo,
            border: `1px solid ${BRT.borderBright}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase', flexWrap: 'wrap' }}>
            <span style={{ color: BRT.red }}>◉ Writing through</span>
            {refs.slice(0, 5).map((r, i) => (
              <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <span style={{ color: BRT.dimmest }}>×</span>}
                <span style={{ color: i === 0 ? BRT.ink : '#d0d0d0' }}>
                  {r.kind === 'self' ? 'You · NM' : r.name}
                </span>
                <span style={{ color: BRT.red, fontSize: 9 }}>{r.weight}</span>
              </span>
            ))}
            <button
              onClick={onOpenRefs}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                color: BRT.red,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 10,
                letterSpacing: '0.22em',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: 0,
              }}
            >
              manage →
            </button>
          </div>
          {/* Evidence strip — what's actually loaded per ref. If a ref has
              no deep-dive profile, say so (and tell the user how to fix it)
              rather than letting them assume it's blending on real data. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {refs.slice(0, 5).map(r => {
              const bits = evidenceBits(r)
              return (
                <span
                  key={`ev-${r.id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 8px',
                    background: bits.length ? 'transparent' : 'rgba(255,42,26,0.06)',
                    border: `1px solid ${bits.length ? BRT.borderBright : BRT.red}`,
                    color: bits.length ? '#c0c0c0' : BRT.red,
                    fontSize: 9,
                    letterSpacing: '0.18em',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  <span style={{ color: bits.length ? BRT.red : BRT.red }}>
                    {r.kind === 'self' ? 'You' : shortName(r.name)}
                  </span>
                  <span style={{ color: BRT.dimmest }}>·</span>
                  {bits.length ? (
                    <span>{bits.join(' · ')}</span>
                  ) : (
                    <span>no deep-dive yet</span>
                  )}
                </span>
              )
            })}
            {refs.length === 1 && refs[0].kind === 'self' && (
              <button
                onClick={onOpenRefs}
                style={{
                  padding: '3px 8px',
                  background: 'transparent',
                  border: `1px dashed ${BRT.red}`,
                  color: BRT.red,
                  fontSize: 9,
                  letterSpacing: '0.22em',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                + add an influence
              </button>
            )}
          </div>
        </div>

        {/* Priority anchor banner — shows the upcoming gig/release the
            caption gen is quietly threading into craft-flavoured posts. Makes
            the north star visible so the artist can see it's being applied
            (and swap it by editing the gig in Signal Lab — DB is source of
            truth, no hardcodes). */}
        {priorityContext && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              background: BRT.ticketLo,
              border: `1px solid ${BRT.borderBright}`,
            }}
          >
            <span style={{ color: BRT.red, fontSize: 10, letterSpacing: '0.26em', fontWeight: 700, textTransform: 'uppercase' }}>
              ▲ Anchoring
            </span>
            <span style={{ color: BRT.ink, fontSize: 11, letterSpacing: '0.02em', lineHeight: 1.4, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {priorityContext}
            </span>
            <span style={{ color: BRT.dimmest, fontSize: 9, letterSpacing: '0.22em', fontWeight: 700, textTransform: 'uppercase' }}>
              next show
            </span>
          </div>
        )}

        {/* Context — the single highest-leverage input for caption quality.
            Without it, Claude has no angle and falls back to description.
            Intent chips below prefill the common cases in one tap so users
            aren't forced to type on every post. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, letterSpacing: '0.26em', color: '#9a9a9a', fontWeight: 700, textTransform: 'uppercase' }}>
            <span style={{ color: BRT.red }}>◉ Context</span>
            <span style={{ color: BRT.dimmest, letterSpacing: '0.18em' }}>what is this post for?</span>
          </div>
          <input
            value={context}
            onChange={(e) => setContext(e.target.value)}
            onBlur={() => {
              if (context.trim() !== committedContext) setCommittedContext(context.trim())
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (context.trim() !== committedContext) setCommittedContext(context.trim())
              }
            }}
            placeholder="dot + nm press shots for the album. no date yet."
            style={{
              width: '100%',
              padding: '12px 14px',
              background: BRT.ticketLo,
              border: `1px solid ${BRT.borderBright}`,
              color: BRT.ink,
              fontSize: 13,
              fontFamily: 'inherit',
              letterSpacing: '-0.005em',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
            {INTENT_CHIPS.map(c => {
              const active = activeIntent === c.key
              return (
                <button
                  key={c.key}
                  onClick={() => setActiveIntent(active ? null : c.key)}
                  aria-pressed={active}
                  title={active ? `Remove ${c.label} intent` : `Apply ${c.label} intent`}
                  style={{
                    padding: '5px 9px',
                    background: active ? BRT.red : 'transparent',
                    border: `1px solid ${active ? BRT.red : BRT.borderBright}`,
                    color: active ? BRT.ink : '#9a9a9a',
                    fontSize: 9,
                    letterSpacing: '0.24em',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, flexShrink: 0 }}>
          {/* Editable caption surface. While the AI regen is in flight we
              show a "writing through…" preview state; once the variants land
              the textarea takes over so the user can tweak without leaving
              the chain. Edits persist per-variant until the next regen. */}
          {loading ? (
            <div
              style={{
                padding: 18,
                background: BRT.ticketLo,
                border: `1px solid ${BRT.red}`,
                fontSize: 18,
                lineHeight: 1.5,
                letterSpacing: '-0.008em',
                color: BRT.ink,
                fontWeight: 500,
                minHeight: 140,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                fontSize: 10,
                letterSpacing: '0.22em',
                color: BRT.red,
                textTransform: 'uppercase',
                fontWeight: 700,
              }}>
                ● composing <span className="brt-dots" />
              </div>
              <span style={{ color: '#9a9a9a', fontSize: 15 }}>
                Writing through{' '}
                {refs.slice(0, 4).map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && <span style={{ color: BRT.dimmest }}> × </span>}
                    <span style={{ color: BRT.ink, fontWeight: 600 }}>{r.kind === 'self' ? 'You' : shortName(r.name)}</span>
                  </span>
                ))}
              </span>
              <span style={{ color: BRT.dimmest, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace' }}>
                Sonnet drafts · Opus polishes · ~4s
              </span>
              <style jsx>{`
                .brt-dots::after {
                  content: '';
                  display: inline-block;
                  width: 1em;
                  text-align: left;
                  animation: brt-dots 1.2s steps(4, end) infinite;
                }
                @keyframes brt-dots {
                  0%   { content: ''; }
                  25%  { content: '.'; }
                  50%  { content: '..'; }
                  75%  { content: '...'; }
                  100% { content: ''; }
                }
              `}</style>
            </div>
          ) : err ? (
            <div
              style={{
                padding: 18,
                background: BRT.ticketLo,
                border: `1px solid ${BRT.red}`,
                color: BRT.red,
                minHeight: 140,
                flexShrink: 0,
              }}
            >
              {err}
            </div>
          ) : (
            <textarea
              value={current}
              onChange={(e) => setEdits(prev => ({ ...prev, [variant]: e.target.value }))}
              spellCheck={false}
              placeholder={aiCurrent || 'Caption will appear here…'}
              style={{
                padding: 18,
                background: BRT.ticketLo,
                border: `1px solid ${over ? BRT.red : isEdited ? BRT.red : BRT.borderBright}`,
                fontSize: 18,
                lineHeight: 1.5,
                letterSpacing: '-0.008em',
                color: BRT.ink,
                fontWeight: 500,
                minHeight: 140,
                maxHeight: '34vh',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                flexShrink: 0,
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
          )}
          <div
            style={{
              display: 'flex',
              gap: 16,
              fontSize: 10,
              letterSpacing: '0.22em',
              color: '#9a9a9a',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            <span>{PLATFORM_LABEL[platform]} · {isVideo ? 'Reel · 9:16' : 'Post · 1:1'}</span>
            <span>·</span>
            <span style={{ color: over ? BRT.red : BRT.ink }}>{current.length}</span>
            <span>/ {limit}</span>
            <span>·</span>
            <span>{readTimeLabel(current)}</span>
            {!check.overall && !loading && !err && (
              <>
                <span>·</span>
                <span style={{ color: BRT.red }}>● drifted · regenerate</span>
              </>
            )}
          </div>

        </div>


        {/* Tag & details — collapsible. Closed by default; the badge on the
            header shows the user what's configured without opening. Tags
            and hashtags live in the first comment (HARD RULE
            feedback_no_tags_in_captions) — caption stays clean. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: `1px solid ${tagsOpen ? BRT.red : BRT.borderBright}`, background: tagsOpen ? 'rgba(255,42,26,0.03)' : 'transparent', flexShrink: 0 }}>
          <button
            onClick={() => setTagsOpen(v => !v)}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              color: tagsOpen ? BRT.red : BRT.ink,
              fontSize: 10,
              letterSpacing: '0.28em',
              fontWeight: 700,
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textAlign: 'left',
            }}
          >
            <span style={{ color: BRT.red }}>{tagsOpen ? '▾' : '▸'}</span>
            Tag &amp; details
            {platform === 'instagram' && (
              <span style={{ color: BRT.dimmest, letterSpacing: '0.18em', fontWeight: 700 }}>
                people · location · first comment · hashtags
              </span>
            )}
            {tagBadge && (
              <span
                style={{
                  marginLeft: 'auto',
                  padding: '2px 8px',
                  background: BRT.red,
                  color: BRT.bg,
                  fontSize: 9,
                  letterSpacing: '0.24em',
                  fontWeight: 800,
                }}
              >
                {tagBadge}
              </span>
            )}
          </button>
          {tagsOpen && (
            <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12, borderTop: `1px solid ${BRT.borderBright}` }}>
              {platform !== 'instagram' && platform !== 'threads' && (
                <div style={{ fontSize: 10, letterSpacing: '0.2em', color: BRT.dimmest, textTransform: 'uppercase' }}>
                  Tagging fields apply to Instagram / Threads. Ignored on {PLATFORM_LABEL[platform]}.
                </div>
              )}
              <TagFieldWithSearch
                label="Tag people"
                hint="@handles tagged on the image · first-comment + user_tags"
                value={tagPeople}
                onChange={setTagPeople}
                onFocusSearch={() => setSuggestFor('people')}
                suggestions={suggestFor === 'people' ? suggestions : []}
                statusMap={handleStatus}
                placeholder="@photographer, @venue, @collaborator"
              />
              <TagFieldWithSearch
                label="Collaborators"
                hint="IG Collab · both accounts co-author the post · they must accept the invite"
                value={collabInput}
                onChange={setCollabInput}
                onFocusSearch={() => setSuggestFor('collab')}
                suggestions={suggestFor === 'collab' ? suggestions : []}
                statusMap={handleStatus}
                placeholder="@dot_major"
                warn="NM collab posts are hit-and-miss. Default to single-account + story shares unless the collab earns reach."
              />
              <TagField
                label="Location"
                hint="shown under the post · plain name is fine"
                value={locationName}
                onChange={setLocationName}
                placeholder="warehouse 9, london"
              />
              <TagField
                label="Alt text"
                hint="accessibility + IG search · 1–2 sentence description"
                value={altText}
                onChange={setAltText}
                placeholder="dot + nm, shadowed blue lighting, studio"
                multiline
              />
              {isVideo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={() => setShareToFeed(v => !v)}
                    style={{
                      padding: '6px 12px',
                      background: shareToFeed ? BRT.red : 'transparent',
                      border: `1px solid ${shareToFeed ? BRT.red : BRT.borderBright}`,
                      color: shareToFeed ? BRT.bg : '#9a9a9a',
                      fontSize: 9,
                      letterSpacing: '0.26em',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {shareToFeed ? '● share to feed' : '○ reels only'}
                  </button>
                  <span style={{ fontSize: 10, letterSpacing: '0.18em', color: BRT.dimmest, textTransform: 'uppercase' }}>
                    reel-only = tab-only, no grid
                  </span>
                </div>
              )}
              <TagField
                label="First comment — extra"
                hint="optional note between tags and hashtags"
                value={firstCommentExtra}
                onChange={setFirstCommentExtra}
                placeholder="thank you for the photos"
                multiline
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, letterSpacing: '0.24em', color: '#9a9a9a', fontWeight: 700, textTransform: 'uppercase' }}>
                  <button
                    onClick={() => setHashtagsEnabled(v => !v)}
                    style={{
                      padding: '4px 10px',
                      background: hashtagsEnabled ? BRT.red : 'transparent',
                      border: `1px solid ${hashtagsEnabled ? BRT.red : BRT.borderBright}`,
                      color: hashtagsEnabled ? BRT.bg : '#9a9a9a',
                      fontSize: 9,
                      letterSpacing: '0.26em',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {hashtagsEnabled ? '● hashtags on' : '○ hashtags off'}
                  </button>
                  <span style={{ color: BRT.dimmest, letterSpacing: '0.18em' }}>
                    NM posts 92% without hashtags. keep off unless it earns reach.
                  </span>
                </div>
                {hashtagsEnabled && (
                  <TagField
                    label="Hashtags"
                    hint="comma-separated · # optional · added to first comment"
                    value={hashtagsText}
                    onChange={setHashtagsText}
                    placeholder="livemusic, warehouse, london"
                  />
                )}
              </div>
              {(tagPayload.handles.length > 0 || tagPayload.hashtags.length > 0 || firstCommentExtra.trim()) && (
                <div
                  style={{
                    padding: '10px 12px',
                    background: BRT.ticketLo,
                    border: `1px dashed ${BRT.borderBright}`,
                    fontSize: 11,
                    lineHeight: 1.55,
                    color: '#c0c0c0',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}
                >
                  <div style={{ fontSize: 9, letterSpacing: '0.28em', color: BRT.red, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                    ◉ First comment preview
                  </div>
                  {tagPayload.first_comment || '(empty)'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cover picker — IG-style every-frame scrubber. Before this shipped,
            Signal Lab couldn't override Meta's auto-chosen cover — cover
            selector "went missing" on 2026-04-21 (it was never there).
            Live video preview seeks as the artist drags; filmstrip under
            the slider gives visual orientation; the selected moment's time
            (ms) is sent as `thumb_offset` on the REELS container. */}
        {isVideo && videoUrl && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: '12px 14px',
              background: BRT.ticketLo,
              border: `1px solid ${BRT.borderBright}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, letterSpacing: '0.26em', fontWeight: 700, textTransform: 'uppercase' }}>
              <span style={{ color: BRT.red }}>◉ Cover</span>
              <span style={{ color: '#9a9a9a', letterSpacing: '0.18em' }}>scrub to any frame</span>
              <span style={{ marginLeft: 'auto', color: BRT.ink, letterSpacing: '0.18em' }}>
                {coverTime.toFixed(2)}s{videoDuration ? ` / ${videoDuration.toFixed(2)}s` : ''}
              </span>
            </div>

            {/* Live preview — the actual video element seeks as the slider
                moves. Muted + playsInline so Safari/iOS don't trigger audio
                or fullscreen on seek. Portrait-friendly max-height so the
                preview doesn't dominate the column on wide videos. */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <video
                ref={coverVideoRef}
                src={videoUrl}
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget
                  setVideoDuration(Number.isFinite(v.duration) ? v.duration : 0)
                  // Seed the scrubber at the scanner's best moment so the
                  // default cover = the frame the AI already picked as peak.
                  // Artist can drag anywhere; this is just a strong default.
                  const seed = Math.max(0, Math.min(v.duration || 0, scan?.best_moment?.timestamp ?? 0))
                  v.currentTime = seed
                  setCoverTime(seed)
                }}
                style={{
                  maxHeight: 320,
                  maxWidth: '100%',
                  background: '#000',
                  display: 'block',
                  border: `1px solid ${BRT.borderBright}`,
                }}
              />
            </div>

            {/* Scrubber — continuous timeline. Range input drives
                video.currentTime which updates the preview above + coverTime
                for the thumb_offset calc. Custom track styling via
                ::-webkit-slider-*. */}
            <div style={{ position: 'relative', padding: '2px 0' }}>
              {/* Filmstrip background — 12 waypoints, behind the slider so
                  the thumb sits on top of the strip. Purely visual. */}
              {coverFrames.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 2,
                    bottom: 2,
                    display: 'flex',
                    gap: 1,
                    pointerEvents: 'none',
                    opacity: 0.72,
                  }}
                >
                  {coverFrames.map((f, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={f.dataUrl}
                      alt=""
                      style={{ flex: 1, minWidth: 0, height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ))}
                </div>
              )}
              <input
                type="range"
                min={0}
                max={videoDuration || 0}
                step={0.01}
                value={coverTime}
                onChange={(e) => {
                  const t = Number(e.target.value)
                  setCoverTime(t)
                  const v = coverVideoRef.current
                  if (v && Number.isFinite(t)) {
                    try { v.currentTime = t } catch { /* browsers can throw on rapid seek */ }
                  }
                }}
                aria-label="Select cover frame"
                style={{
                  position: 'relative',
                  width: '100%',
                  height: 48,
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  margin: 0,
                  zIndex: 1,
                }}
              />
              <style jsx>{`
                input[type='range']::-webkit-slider-runnable-track {
                  height: 48px;
                  background: transparent;
                  border: 1px solid ${BRT.borderBright};
                }
                input[type='range']::-webkit-slider-thumb {
                  appearance: none;
                  -webkit-appearance: none;
                  width: 4px;
                  height: 52px;
                  margin-top: -2px;
                  background: ${BRT.red};
                  border: 1px solid ${BRT.ink};
                  box-shadow: 0 0 0 1px ${BRT.red};
                  cursor: ew-resize;
                  border-radius: 0;
                }
                input[type='range']::-moz-range-track {
                  height: 48px;
                  background: transparent;
                  border: 1px solid ${BRT.borderBright};
                }
                input[type='range']::-moz-range-thumb {
                  width: 4px;
                  height: 52px;
                  background: ${BRT.red};
                  border: 1px solid ${BRT.ink};
                  box-shadow: 0 0 0 1px ${BRT.red};
                  cursor: ew-resize;
                  border-radius: 0;
                }
              `}</style>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 9, letterSpacing: '0.22em', color: BRT.dimmest, fontWeight: 700, textTransform: 'uppercase' }}>
              <span>0:00</span>
              <span style={{ flex: 1 }} />
              <span>{videoDuration ? `${videoDuration.toFixed(2)}s` : '–'}</span>
            </div>
          </div>
        )}

        <BrainVerdictCard
          output={current}
          task={
            platform === 'tiktok'
              ? 'caption.tiktok'
              : platform === 'threads'
              ? 'caption.threads'
              : 'caption.instagram'
          }
          visible={!!current && !loading}
          onVerdict={(v) => {
            if (!v) {
              setBrainBlocked(false)
              setBrainOverride(false)
              return
            }
            const hardFails = (v.invariants || []).some(
              (i: any) => !i.passed && i.severity === 'hard_block'
            )
            const shouldBlock = v.abstain || hardFails
            setBrainBlocked(shouldBlock)
            if (!shouldBlock) setBrainOverride(false)
          }}
        />

        {brainBlocked ? (
          <label
            style={{
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              color: BRT.red,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={brainOverride}
              onChange={(e) => setBrainOverride(e.target.checked)}
              style={{ accentColor: BRT.red }}
            />
            Override brain verdict and publish anyway (I've reviewed the flags)
          </label>
        ) : null}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            paddingTop: 12,
            borderTop: `1px solid ${BRT.divide}`,
          }}
        >
          <button
            onClick={onOpenRefs}
            style={{
              background: 'transparent',
              border: 'none',
              color: BRT.red,
              fontSize: 11,
              letterSpacing: '0.22em',
              fontWeight: 700,
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: 0,
            }}
          >
            ◉ {alignmentScore}/100 aligned · manage →
          </button>
          <button
            onClick={() => {
              setLoading(true)
              generateCaptionVariants({ scan, refs, platform, fileName, imageDataUrl: thumbnail, context: mergedContext, priorityContext: priorityContext ?? undefined, userId: userId ?? undefined })
                .then((c) => {
                  setCaptions({ long: c.long, safe: c.safe, loose: c.loose, raw: c.raw })
                  setEdits({})
                })
                .catch((e: Error) => setErr(e.message))
                .finally(() => setLoading(false))
            }}
            disabled={loading}
            style={{
              marginLeft: 'auto',
              padding: '14px 18px',
              background: 'transparent',
              border: `1px solid ${BRT.borderBright}`,
              color: '#9a9a9a',
              fontSize: 11,
              letterSpacing: '0.22em',
              fontWeight: 700,
              textTransform: 'uppercase',
              cursor: loading ? 'default' : 'pointer',
              fontFamily: 'inherit',
              opacity: loading ? 0.5 : 1,
            }}
          >
            ↻ Regenerate
          </button>
          <button
            onClick={() => setScheduleOpen(v => !v)}
            disabled={loading || !!err || !current || over || !check.overall || (brainBlocked && !brainOverride)}
            style={{
              padding: '14px 18px',
              background: scheduleOpen ? 'rgba(255,42,26,0.06)' : 'transparent',
              border: `1px solid ${scheduleOpen ? BRT.red : BRT.borderBright}`,
              color: loading || !!err || !current || over || !check.overall || (brainBlocked && !brainOverride) ? BRT.dimmest : (scheduleOpen ? BRT.red : BRT.ink),
              fontSize: 11,
              letterSpacing: '0.22em',
              fontWeight: 700,
              textTransform: 'uppercase',
              cursor: loading || !!err || !current || over || !check.overall || (brainBlocked && !brainOverride) ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ⧗ Schedule
          </button>
          <button
            onClick={handlePublish}
            disabled={sending || loading || !!err || !current || over || !check.overall || (brainBlocked && !brainOverride)}
            style={{
              padding: '14px 22px',
              background: sending || loading || !!err || !current || over || !check.overall || (brainBlocked && !brainOverride) ? BRT.dimmest : BRT.red,
              border: 'none',
              color: BRT.bg,
              fontSize: 12,
              letterSpacing: '0.24em',
              fontWeight: 800,
              textTransform: 'uppercase',
              cursor: sending || loading || !!err || !current || over || !check.overall || (brainBlocked && !brainOverride) ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {sending ? 'Opening preview…' : 'Preview + Approve'}
          </button>
        </div>

        {/* Inline schedule picker — slides down below the CTA row. Preset chips
            (tonight 6pm, tomorrow 6pm, next sat 6pm) cover 90% of posting
            windows. Fine-grained datetime input sits next to them. */}
        {scheduleOpen && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: '12px 14px',
              background: BRT.ticketLo,
              border: `1px solid ${BRT.red}`,
            }}
          >
            <div style={{ fontSize: 10, letterSpacing: '0.26em', color: BRT.red, fontWeight: 700, textTransform: 'uppercase' }}>
              ◉ Schedule for later
              <span style={{ color: BRT.dimmest, marginLeft: 10, letterSpacing: '0.18em' }}>
                peak for NM is 18:00–19:00 BST (Posts &gt; Reels)
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {SCHEDULE_PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setScheduleAt(p.compute())}
                  style={{
                    padding: '6px 10px',
                    background: 'transparent',
                    border: `1px solid ${BRT.borderBright}`,
                    color: '#9a9a9a',
                    fontSize: 9,
                    letterSpacing: '0.22em',
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
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                style={{
                  padding: '10px 12px',
                  background: BRT.ticket,
                  border: `1px solid ${BRT.borderBright}`,
                  color: BRT.ink,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  outline: 'none',
                  colorScheme: 'dark',
                }}
              />
              <button
                onClick={handleSchedule}
                disabled={scheduling}
                style={{
                  padding: '10px 16px',
                  background: scheduling ? BRT.dimmest : BRT.red,
                  border: 'none',
                  color: BRT.bg,
                  fontSize: 11,
                  letterSpacing: '0.22em',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  cursor: scheduling ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {scheduling ? 'Saving…' : 'Confirm schedule'}
              </button>
              {scheduledMsg && (
                <span style={{ fontSize: 11, letterSpacing: '0.18em', color: BRT.red, fontWeight: 700 }}>
                  {scheduledMsg}
                </span>
              )}
            </div>
          </div>
        )}
        {scheduledMsg && !scheduleOpen && (
          <div style={{ fontSize: 11, letterSpacing: '0.2em', color: BRT.red, fontWeight: 700, textTransform: 'uppercase' }}>
            ◉ {scheduledMsg}
          </div>
        )}
      </div>

      {/* Sidebar: platform + refs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, minHeight: 0 }}>
        <div
          style={{
            background: BRT.ticket,
            border: `1px solid ${BRT.borderBright}`,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 9, letterSpacing: '0.28em', color: '#9a9a9a', fontWeight: 700, textTransform: 'uppercase' }}>
            ◉ Target
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {(Object.keys(PLATFORM_LABEL) as Platform[]).map(p => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                style={{
                  padding: 8,
                  background: platform === p ? BRT.red : 'transparent',
                  border: `1px solid ${platform === p ? BRT.red : BRT.borderBright}`,
                  color: platform === p ? BRT.bg : '#9a9a9a',
                  fontSize: 10,
                  letterSpacing: '0.22em',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        <div
          style={{
            background: BRT.ticket,
            border: `1px solid ${BRT.borderBright}`,
            padding: 14,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              fontSize: 9,
              letterSpacing: '0.28em',
              color: '#9a9a9a',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            ◉ Refs in play
            <button
              onClick={onOpenRefs}
              style={{
                background: 'transparent',
                border: 'none',
                color: BRT.red,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 9,
                letterSpacing: '0.28em',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: 0,
              }}
            >
              manage →
            </button>
          </div>
          {refs.length === 0 && (
            <div style={{ fontSize: 11, color: BRT.dimmest }}>No references yet. Click manage → to add.</div>
          )}
          {refs.map(r => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '6px 8px',
                background: BRT.ticketLo,
                fontSize: 11,
              }}
            >
              <span style={{ fontWeight: 700, color: BRT.ink }}>
                {r.kind === 'self' ? 'You · NM' : r.name}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {onRemoveRef && r.kind !== 'self' && (
                  <button
                    type="button"
                    onClick={() => onRemoveRef(r.id)}
                    aria-label={`Remove ${r.name}`}
                    title="Remove reference"
                    style={{
                      background: 'transparent',
                      border: `1px solid ${BRT.red}`,
                      color: BRT.red,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 13,
                      fontWeight: 700,
                      lineHeight: 1,
                      width: 20,
                      height: 20,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 0,
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                )}
                <span style={{ fontSize: 9, letterSpacing: '0.22em', color: BRT.red, fontWeight: 700, minWidth: 32, textAlign: 'right' }}>
                  {r.weight}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Tag input with artist-search autocomplete + per-handle IG verification
 * dots. Suggestions come from /api/tag-suggest (artist_profiles); verify
 * status is pre-fetched by PhaseVoice and passed in via `statusMap`.
 * Clicking a suggestion replaces the active (trailing) token.
 */
function TagFieldWithSearch({
  label,
  hint,
  value,
  onChange,
  onFocusSearch,
  suggestions,
  statusMap,
  placeholder,
  warn,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  onFocusSearch: () => void
  suggestions: { handle: string; name: string }[]
  statusMap: Record<string, 'pending' | 'ok' | 'missing' | 'error'>
  placeholder?: string
  warn?: string
}) {
  const [focused, setFocused] = useState(false)
  const handles = value
    .split(/[,\s]+/)
    .map(h => h.trim().replace(/^@+/, ''))
    .filter(Boolean)

  function pickSuggestion(handle: string) {
    // Replace the trailing partial token with the picked handle + a comma
    // so the user can keep typing the next one.
    const tokens = value.split(/[,\s]+/)
    tokens[tokens.length - 1] = `@${handle}`
    onChange(tokens.filter(Boolean).join(', ') + ', ')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 10, letterSpacing: '0.26em', color: '#9a9a9a', fontWeight: 700, textTransform: 'uppercase' }}>
        <span style={{ color: BRT.red }}>◉ {label}</span>
        {hint && <span style={{ color: BRT.dimmest, letterSpacing: '0.16em', fontSize: 9 }}>{hint}</span>}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { setFocused(true); onFocusSearch() }}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: BRT.ticketLo,
          border: `1px solid ${BRT.borderBright}`,
          color: BRT.ink,
          fontSize: 12,
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />
      {/* Per-handle verification pills — shown under the input */}
      {handles.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {handles.map(h => {
            const s = statusMap[h.toLowerCase()]
            const dot =
              s === 'ok' ? { color: '#4eff9f', label: 'resolves on IG' }
              : s === 'missing' ? { color: BRT.red, label: 'not found on IG' }
              : s === 'error' ? { color: '#ffb020', label: 'verify failed' }
              : { color: '#6a6a6a', label: 'checking…' }
            return (
              <span
                key={h}
                title={dot.label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  background: 'transparent',
                  border: `1px solid ${BRT.borderBright}`,
                  color: BRT.ink,
                  fontSize: 10,
                  letterSpacing: '0.16em',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot.color }} />
                @{h}
              </span>
            )
          })}
        </div>
      )}
      {warn && (
        <div style={{ fontSize: 9, letterSpacing: '0.2em', color: '#ffb020', textTransform: 'uppercase' }}>
          ⚠ {warn}
        </div>
      )}
      {focused && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 2,
            background: BRT.ticket,
            border: `1px solid ${BRT.red}`,
            zIndex: 5,
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {suggestions.map(s => (
            <button
              key={s.handle}
              onClick={() => pickSuggestion(s.handle)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: `1px solid ${BRT.borderBright}`,
                color: BRT.ink,
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{ color: BRT.red, fontSize: 11, fontWeight: 700 }}>@{s.handle}</span>
              {s.name && <span style={{ color: '#9a9a9a', fontSize: 11 }}>· {s.name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Inline labelled input used by the Tag & details panel. Single-line by
 * default, `multiline` switches to a textarea for the first-comment note.
 * Kept inside this file — zero reuse outside the Voice phase.
 */
function TagField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 10, letterSpacing: '0.26em', color: '#9a9a9a', fontWeight: 700, textTransform: 'uppercase' }}>
        <span style={{ color: BRT.red }}>◉ {label}</span>
        {hint && <span style={{ color: BRT.dimmest, letterSpacing: '0.16em', fontSize: 9 }}>{hint}</span>}
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: BRT.ticketLo,
            border: `1px solid ${BRT.borderBright}`,
            color: BRT.ink,
            fontSize: 12,
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
          }}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: BRT.ticketLo,
            border: `1px solid ${BRT.borderBright}`,
            color: BRT.ink,
            fontSize: 12,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      )}
    </div>
  )
}

/**
 * Summarise WHAT deep-dive data is loaded on a given ref. This is receipts
 * shown next to the "Writing through" banner so the artist can SEE that
 * chains / style rules / lowercase % / peak content are actually reaching
 * the caption prompt, not invented. Returns an empty array when the ref
 * has no profile (user has not run a deep-dive on them yet).
 */
function evidenceBits(r: VoiceRef): string[] {
  const p = r.profile
  if (!p) return []
  const bits: string[] = []
  if (p.chips && p.chips.length) bits.push(`${p.chips.length} chips`)
  if (p.style_rules) bits.push('style rules')
  if (typeof p.lowercase_pct === 'number') bits.push(`${p.lowercase_pct}% lower`)
  if (typeof p.short_caption_pct === 'number') bits.push(`${p.short_caption_pct}% short`)
  if (typeof p.no_hashtags_pct === 'number') bits.push(`${p.no_hashtags_pct}% no #`)
  if (p.visual_aesthetic?.mood) bits.push('aesthetic')
  if (p.content_performance?.peak_content) bits.push('peak post')
  if (p.brand_positioning) bits.push('positioning')
  return bits.slice(0, 4)
}

/** Trim long ref display names for the inline voice-blend strip. */
function shortName(name: string): string {
  // "You · NM" stays; strip a trailing "· something" if present, then cap.
  const base = name.split(' · ')[0]
  return base.length > 14 ? base.slice(0, 13) + '…' : base
}

/** Rough read-time label. ~220 words/min average. Never shown as "0s". */
function readTimeLabel(text: string): string {
  if (!text) return '—'
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const seconds = Math.max(1, Math.round((words / 220) * 60))
  return `${seconds}s read`
}

/** datetime-local format: "YYYY-MM-DDTHH:mm" in LOCAL time. Date.toISOString
 *  is UTC so we build it by hand to avoid timezone-off-by-one. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Default schedule = tonight at 18:00 local if it's still before 18:00,
 *  otherwise tomorrow 18:00. NM's validated peak is 18:00–19:00 BST per
 *  reference_ig_posting_times.md. */
function defaultScheduleISO(): string {
  const now = new Date()
  const target = new Date(now)
  target.setHours(18, 0, 0, 0)
  if (target.getTime() <= now.getTime() + 15 * 60 * 1000) {
    target.setDate(target.getDate() + 1)
  }
  return toLocalInputValue(target)
}

/** Schedule presets — anchor to NM's peak window (18:00) so the happy path
 *  is "tap tonight / tomorrow / next saturday, confirm, done." */
const SCHEDULE_PRESETS: { key: string; label: string; compute: () => string }[] = [
  {
    key: 'tonight',
    label: 'Tonight 18:00',
    compute: () => {
      const d = new Date()
      d.setHours(18, 0, 0, 0)
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
      return toLocalInputValue(d)
    },
  },
  {
    key: 'tomorrow',
    label: 'Tomorrow 18:00',
    compute: () => {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(18, 0, 0, 0)
      return toLocalInputValue(d)
    },
  },
  {
    key: 'saturday',
    label: 'Next Saturday 18:00',
    compute: () => {
      const d = new Date()
      const daysTo = (6 - d.getDay() + 7) % 7 || 7
      d.setDate(d.getDate() + daysTo)
      d.setHours(18, 0, 0, 0)
      return toLocalInputValue(d)
    },
  },
]
