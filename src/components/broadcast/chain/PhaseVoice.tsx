'use client'

import { useEffect, useMemo, useState } from 'react'
import { BRT } from '@/lib/design/brt'
import { useGatedSend } from '@/lib/outbound'
import { generateCaptionVariants } from '@/lib/chainCaptionGen'
import { runVoiceCheck } from '@/lib/voiceCheck'
import type { ChainScanResult } from '@/lib/chainScan'
import type { VoiceRef, Platform, CaptionVariant } from './types'
import { PLATFORM_LABEL, PLATFORM_LIMITS } from './types'

interface Props {
  scan: ChainScanResult
  fileName: string
  isVideo: boolean
  thumbnail: string | null
  refs: VoiceRef[]
  alignmentScore: number
  onOpenRefs: () => void
}

const VARIANTS: CaptionVariant[] = ['safe', 'loose', 'raw']

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
  fileName,
  isVideo,
  thumbnail,
  refs,
  alignmentScore,
  onOpenRefs,
}: Props) {
  const [captions, setCaptions] = useState<Record<CaptionVariant, string> | null>(null)
  // Receipts — one-sentence rationale the model returns alongside the three
  // variants. Shown in the approval preview + as a small subtitle under the
  // caption editor so the artist sees WHY Claude wrote what it wrote (which
  // context nouns got surfaced, whose cadence dominated, tradeoffs).
  const [rationale, setRationale] = useState<string>('')
  // Per-variant user edits. Overrides the AI output. Wiped when a fresh
  // regen lands so the user's local tweaks don't shadow better generations.
  const [edits, setEdits] = useState<Partial<Record<CaptionVariant, string>>>({})
  const [variant, setVariant] = useState<CaptionVariant>('loose')
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
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
  const [context, setContext] = useState('')
  // Debounced context that actually triggers regen — so typing doesn't
  // fire a Claude call on every keystroke.
  const [committedContext, setCommittedContext] = useState('')

  const gatedSend = useGatedSend()

  useEffect(() => {
    setLoading(true)
    setErr(null)
    generateCaptionVariants({ scan, refs, platform, fileName, imageDataUrl: thumbnail, context: committedContext })
      .then((c) => {
        setCaptions({ safe: c.safe, loose: c.loose, raw: c.raw })
        setRationale(c.rationale)
        setEdits({})
      })
      .catch((e: Error) => setErr(e.message || 'Caption generation failed'))
      .finally(() => setLoading(false))
  }, [scan, refs, platform, fileName, thumbnail, committedContext])

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
        ...(rationale ? [{ label: 'Why this caption', value: rationale }] : []),
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
        ...(rationale ? [{ label: 'Why this caption', value: rationale }] : []),
      ]

      // IG post endpoint takes image_url + user_tags + first_comment +
      // hashtags + location_id + collaborators + alt_text + share_to_feed.
      // Other platforms ignore the IG-only fields.
      const isInstagram = platform === 'instagram' || platform === 'threads'
      const publishBody: Record<string, unknown> = { caption: current, platform }
      if (isInstagram && thumbnail) publishBody.image_url = thumbnail
      if (isInstagram && tagPayload.user_tags.length) publishBody.user_tags = tagPayload.user_tags
      if (isInstagram && tagPayload.first_comment) publishBody.first_comment = tagPayload.first_comment
      if (isInstagram && tagPayload.hashtags.length) publishBody.hashtags = tagPayload.hashtags
      if (isInstagram && tagPayload.collaborators.length) publishBody.collaborators = tagPayload.collaborators
      if (isInstagram && tagPayload.alt_text) publishBody.alt_text = tagPayload.alt_text
      if (isInstagram && isVideo) publishBody.share_to_feed = tagPayload.share_to_feed

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
            caption itself. Intelligence up front, not hidden in a sidebar. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            background: BRT.ticketLo,
            border: `1px solid ${BRT.borderBright}`,
            fontSize: 11,
            letterSpacing: '0.18em',
            fontWeight: 700,
            textTransform: 'uppercase',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: BRT.red }}>◉ Writing through</span>
          {refs.slice(0, 5).map((r, i) => (
            <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && <span style={{ color: BRT.dimmest }}>×</span>}
              <span style={{ color: i === 0 ? BRT.ink : '#d0d0d0' }}>
                {r.kind === 'self' ? 'You' : shortName(r.name)}
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
            {INTENT_CHIPS.map(c => (
              <button
                key={c.key}
                onClick={() => {
                  setContext(c.prefill)
                  setCommittedContext(c.prefill)
                }}
                style={{
                  padding: '5px 9px',
                  background: 'transparent',
                  border: `1px solid ${BRT.borderBright}`,
                  color: '#9a9a9a',
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
            ))}
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
                border: `1px solid ${BRT.borderBright}`,
                fontSize: 18,
                lineHeight: 1.5,
                letterSpacing: '-0.008em',
                color: BRT.ink,
                fontWeight: 500,
                minHeight: 140,
                flexShrink: 0,
              }}
            >
              <span style={{ color: BRT.dimmest }}>
                Writing through{' '}
                {refs.slice(0, 4).map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && <span style={{ color: BRT.dimmest }}> × </span>}
                    <span style={{ color: '#9a9a9a' }}>{r.kind === 'self' ? 'You' : shortName(r.name)}</span>
                  </span>
                ))}
                …
              </span>
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
                <span style={{ color: BRT.red }}>● drifted · re-roll</span>
              </>
            )}
          </div>

          {/* Receipts — Claude's one-sentence rationale for why it wrote
              this. Sits right under the caption so the artist sees the
              WHY without opening the approval modal. Quiet-styled so it
              reads as commentary, not chrome. */}
          {rationale && !loading && !err && (
            <div
              style={{
                display: 'flex',
                gap: 10,
                padding: '8px 12px',
                background: BRT.ticketLo,
                border: `1px dashed ${BRT.borderBright}`,
                fontSize: 11,
                lineHeight: 1.45,
                color: '#c0c0c0',
                fontStyle: 'italic',
                flexShrink: 0,
              }}
            >
              <span style={{ color: BRT.red, fontStyle: 'normal', fontWeight: 700, letterSpacing: '0.22em', fontSize: 9, textTransform: 'uppercase', whiteSpace: 'nowrap', paddingTop: 1 }}>
                ◉ Why
              </span>
              <span>{rationale}</span>
            </div>
          )}
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
              generateCaptionVariants({ scan, refs, platform, fileName, imageDataUrl: thumbnail, context: committedContext })
                .then((c) => {
                  setCaptions({ safe: c.safe, loose: c.loose, raw: c.raw })
                  setRationale(c.rationale)
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
            ↻ Re-roll
          </button>
          <button
            onClick={() => setScheduleOpen(v => !v)}
            disabled={loading || !!err || !current || over || !check.overall}
            style={{
              padding: '14px 18px',
              background: scheduleOpen ? 'rgba(255,42,26,0.06)' : 'transparent',
              border: `1px solid ${scheduleOpen ? BRT.red : BRT.borderBright}`,
              color: loading || !!err || !current || over || !check.overall ? BRT.dimmest : (scheduleOpen ? BRT.red : BRT.ink),
              fontSize: 11,
              letterSpacing: '0.22em',
              fontWeight: 700,
              textTransform: 'uppercase',
              cursor: loading || !!err || !current || over || !check.overall ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ⧗ Schedule
          </button>
          <button
            onClick={handlePublish}
            disabled={sending || loading || !!err || !current || over || !check.overall}
            style={{
              padding: '14px 22px',
              background: sending || loading || !!err || !current || over || !check.overall ? BRT.dimmest : BRT.red,
              border: 'none',
              color: BRT.bg,
              fontSize: 12,
              letterSpacing: '0.24em',
              fontWeight: 800,
              textTransform: 'uppercase',
              cursor: sending || loading || !!err || !current || over || !check.overall ? 'default' : 'pointer',
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
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
              <span style={{ fontSize: 9, letterSpacing: '0.22em', color: BRT.red, fontWeight: 700 }}>
                {r.weight}
              </span>
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
