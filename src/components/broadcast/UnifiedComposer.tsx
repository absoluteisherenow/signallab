'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabaseBrowser'
import { SKILLS_CAPTION_GEN, SKILLS_MEDIA_SCANNER } from '@/lib/skillPromptsClient'

// ── Types ────────────────────────────────────────────────────────────────────

interface CaptionVariant { text: string; reasoning: string; score: number }
interface Captions { safe: CaptionVariant; loose: CaptionVariant; raw: CaptionVariant }
interface ArtistProfile {
  name: string; handle: string; genre: string
  lowercase_pct: number; short_caption_pct: number; no_hashtags_pct: number
  chips: string[]; highlight_chips?: string[]
  style_rules?: string; follower_count?: number
  content_performance?: { best_type: string; engagement_rate: number; posting_frequency?: string; peak_content?: string }
  visual_aesthetic?: { mood: string; palette?: string; subjects?: string; signature_visual?: string }
  brand_positioning?: string; content_strategy_notes?: string
  profile_pic_url?: string; last_scanned?: string
}

interface Trend { id: number; platform: string; name: string; fit: number; hot: boolean; context: string; evidence?: string }
interface Repurposed { reel_script: string; carousel_slides: string[]; static_post: string }

type Platform = 'instagram' | 'tiktok' | 'threads' | 'twitter'
type Format = 'post' | 'reel' | 'story' | 'carousel'
type Step = 'compose' | 'preview'

// ── Intelligence functions ──────────────────────────────────────────────────

function calcVoiceAlignment(artists: ArtistProfile[]): { value: string; score: number; desc: string } {
  if (artists.length < 2) return { value: '—', score: 0, desc: `Scan ${2 - artists.length} more artist${artists.length === 0 ? 's' : ''} to calculate` }
  const metrics: (keyof ArtistProfile)[] = ['lowercase_pct', 'short_caption_pct', 'no_hashtags_pct']
  const cvs = metrics.map(m => {
    const values = artists.map(a => a[m] as number)
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    if (mean === 0) return 0
    const stdDev = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length)
    return (stdDev / mean) * 100
  })
  const avgCV = cvs.reduce((s, v) => s + v, 0) / cvs.length
  const score = Math.max(5, Math.min(99, Math.round(100 - avgCV * 0.8)))
  const label = score >= 82 ? 'Strong' : score >= 65 ? 'Moderate' : score >= 45 ? 'Mixed' : 'Divergent'
  return { value: label, score, desc: `${score}% alignment across ${artists.length} artists` }
}

function calcToneRegister(artists: ArtistProfile[]): { value: string; score: number; desc: string } {
  if (artists.length === 0) return { value: '—', score: 0, desc: 'Add artists to detect tone register' }
  const avg = (key: keyof ArtistProfile) => Math.round(artists.reduce((s, a) => s + (a[key] as number), 0) / artists.length)
  const lower = avg('lowercase_pct'), short = avg('short_caption_pct'), noHash = avg('no_hashtags_pct')
  if (lower > 68 && short > 52 && noHash > 62) return { value: 'Raw', score: Math.round((lower + short + noHash) / 3), desc: `${lower}% lower · ${short}% short · ${noHash}% no hashtags` }
  if (lower > 58 && noHash > 60) return { value: 'Dry', score: Math.round((lower + noHash) / 2), desc: `${lower}% lower · ${noHash}% no hashtags` }
  if (short < 35 && lower < 55) return { value: 'Verbose', score: Math.round(100 - short), desc: `${short}% short, longer-form lane` }
  if (noHash < 45) return { value: 'Discovery', score: Math.round(100 - noHash), desc: `${100 - noHash}% use hashtags, reach-focused` }
  return { value: 'Balanced', score: 62, desc: `${lower}% lower · ${short}% short · ${noHash}% no hashtags` }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function callClaude(system: string, userPrompt: string, maxTokens = 600, imageUrls: string[] = []): Promise<string> {
  const content: any[] = []
  for (const url of imageUrls) {
    if (url.match(/\.(mp4|mov|webm)/i)) continue
    content.push({ type: 'image', source: { type: 'url', url } })
  }
  content.push({ type: 'text', text: userPrompt })
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', system, max_tokens: maxTokens, nocache: imageUrls.length > 0, messages: [{ role: 'user', content }] }),
  })
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

function suggestNextBestSlot(platform: string, format: string): { date: string; time: string } {
  const now = new Date()
  const allowedDays: Record<string, number[]> = { reel: [4, 6], carousel: [2, 3], post: [2, 3, 4], story: [1, 2, 3, 4, 5, 6, 0] }
  const times: Record<string, string> = { reel: '19:00', carousel: '19:00', post: '20:00', story: '18:00' }
  const days = allowedDays[format] || [2, 3, 4]
  const time = times[format] || '19:00'
  const [h, m] = time.split(':').map(Number)
  for (let offset = 0; offset <= 14; offset++) {
    const c = new Date(now); c.setDate(c.getDate() + offset)
    if (!days.includes(c.getDay())) continue
    c.setHours(h, m, 0, 0)
    if (c.getTime() <= now.getTime() + 5 * 60 * 1000) continue
    return { date: c.toISOString().slice(0, 10), time }
  }
  const fb = new Date(now); fb.setDate(fb.getDate() + 1)
  return { date: fb.toISOString().slice(0, 10), time }
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = {
  font: "var(--font-mono, 'Helvetica Neue', monospace)",
  gold: 'var(--gold, #ff2a1a)',
  dim: 'var(--text-dimmer, rgba(240,235,226,0.4))',
  dimmest: 'var(--text-dimmest, rgba(240,235,226,0.2))',
  panel: 'var(--panel, #0e0e0e)',
  border: 'var(--border, rgba(255,255,255,0.08))',
  borderBright: 'var(--border-bright, rgba(255,255,255,0.2))',
}

// ── Component ────────────────────────────────────────────────────────────────

export function UnifiedComposer() {
  const [step, setStep] = useState<Step>('compose')

  // Media
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Content
  const [context, setContext] = useState('')
  const [caption, setCaption] = useState('')
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [format, setFormat] = useState<Format>('post')

  // Captions
  const [captions, setCaptions] = useState<Captions | null>(null)
  const [generating, setGenerating] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<'safe' | 'loose' | 'raw' | null>(null)

  // Preview fields
  const [firstComment, setFirstComment] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [userTags, setUserTags] = useState('')
  const [collaborators, setCollaborators] = useState<string[]>([])
  const [locationName, setLocationName] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')

  // Comment → DM automation
  const [dmEnabled, setDmEnabled] = useState(false)
  const [dmKeyword, setDmKeyword] = useState('')
  const [dmRewardType, setDmRewardType] = useState('download')
  const [dmRewardUrl, setDmRewardUrl] = useState('')
  const [dmMessage, setDmMessage] = useState('')
  const [dmFollowRequired, setDmFollowRequired] = useState(false)

  // Cover frame picker
  const coverVideoRef = useRef<HTMLVideoElement>(null)
  const [coverTime, setCoverTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)

  // Intelligence
  const [artistName, setArtistName] = useState('')
  const [artists, setArtists] = useState<ArtistProfile[]>([])
  const [trends, setTrends] = useState<Trend[]>([])
  const [trendCaptions, setTrendCaptions] = useState<Record<number, string>>({})
  const [repurposed, setRepurposed] = useState<Repurposed | null>(null)
  const [repurposing, setRepurposing] = useState(false)

  // Media scan
  const [mediaScan, setMediaScan] = useState<{
    score: number
    verdict: string
    format_rec: string
    tags: string[]
    post_rec: string
  } | null>(null)
  const [scanningMedia, setScanningMedia] = useState(false)

  // State
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')

  // ── Load data on mount ────────────────────────────────────────────────────

  useEffect(() => {
    // Query params
    const params = new URLSearchParams(window.location.search)
    const title = params.get('title'), venue = params.get('venue'), loc = params.get('location'), date = params.get('date')
    if (title && venue) {
      const dateStr = date ? new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : ''
      setContext(`${title} at ${venue}${loc ? ', ' + loc : ''}${dateStr ? ' · ' + dateStr : ''}`)
    }
    const rawUrls = params.get('mediaUrls')
    if (rawUrls) setMediaUrls(rawUrls.split(',').filter(Boolean))
    const formatParam = params.get('format') as Format | null
    if (formatParam) setFormat(formatParam)
    const gigId = params.get('gig_id')
    if (gigId) {
      fetch(`/api/gigs?id=${gigId}`).then(r => r.json()).then(d => {
        const g = d.gig || d.gigs?.[0]
        if (g) setContext(`${g.title || g.artist} at ${g.venue}${g.location ? ', ' + g.location : ''}`)
      }).catch(() => {})
    }
    // Restore draft
    const draft = localStorage.getItem('signallab.composer.draft')
    if (draft && !title && !gigId) {
      try {
        const d = JSON.parse(draft)
        if (d.context) setContext(d.context); if (d.caption) setCaption(d.caption)
        if (d.mediaUrls?.length) setMediaUrls(d.mediaUrls)
        if (d.platform) setPlatform(d.platform); if (d.format) setFormat(d.format)
      } catch {}
    }
  }, [])

  // Load voice profiles + trends
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => { if (d.settings?.name) setArtistName(d.settings.name) }).catch(() => {})
    supabase.from('artist_profiles').select('*').then(({ data }) => { if (data) setArtists(data) })
    fetch('/api/trends').then(r => r.json()).then(d => { if (d.trends) setTrends(d.trends.slice(0, 5)) }).catch(() => {})
  }, [])

  // Auto-save draft
  useEffect(() => {
    const timer = setTimeout(() => {
      if (context || caption || mediaUrls.length) {
        localStorage.setItem('signallab.composer.draft', JSON.stringify({ context, caption, mediaUrls, platform, format }))
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [context, caption, mediaUrls, platform, format])

  // ── Media upload ──────────────────────────────────────────────────────────

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setUploading(true)
    const uploaded: string[] = []
    for (const file of Array.from(files)) {
      const formData = new FormData(); formData.append('file', file)
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (data.url) uploaded.push(data.url)
      } catch {}
    }
    setMediaUrls(prev => [...prev, ...uploaded])
    setUploading(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  // ── Auto-scan media on upload ─────────────────────────────────────────────

  const scanMedia = useCallback(async (urls: string[]) => {
    if (urls.length === 0) return
    setScanningMedia(true)
    try {
      const raw = await callClaude(
        `You are a content strategist for underground electronic music artists. Analyse this media using the full scoring framework below.\n\n${SKILLS_MEDIA_SCANNER}\n\nAfter your analysis, return ONLY a compact JSON summary. No markdown, no explanation outside the JSON.`,
        `Analyse this media for an electronic music artist's social feed.

Use your full scoring framework (reach, authenticity, culture, visual identity, shareable core) to assess, then return a single JSON object:
{"score":<0-100 composite>,"summary":"<one sentence: what works, what to fix, or why to post/skip>","format_rec":"post|carousel|reel|story"}`,
        300,
        urls.slice(0, 4)
      )
      const start = raw.indexOf('{'), end = raw.lastIndexOf('}')
      if (start !== -1 && end !== -1) {
        const result = JSON.parse(raw.slice(start, end + 1))
        setMediaScan({ ...result, verdict: result.score >= 75 ? 'POST IT' : result.score >= 60 ? 'TWEAK' : result.score >= 45 ? 'RECONSIDER' : 'SKIP', tags: [], post_rec: result.summary || '' })
        if (result.format_rec && ['post', 'carousel', 'reel', 'story'].includes(result.format_rec)) {
          setFormat(result.format_rec as Format)
        }
      }
    } catch (err) {
      console.warn('Media scan failed:', err)
    } finally {
      setScanningMedia(false)
    }
  }, [])

  useEffect(() => {
    if (mediaUrls.length > 0) {
      setMediaScan(null)
      scanMedia(mediaUrls)
    } else {
      setMediaScan(null)
    }
  }, [mediaUrls, scanMedia])

  // ── Caption generation (with full deep dive intelligence) ─────────────────

  const generateCaptions = async () => {
    setGenerating(true); setCaptions(null); setSelectedVariant(null)

    const ownProfile = artists.find(a => a.name?.toLowerCase() === artistName?.toLowerCase())

    // Lane stats
    const laneAvg = (key: keyof ArtistProfile) => artists.length ? Math.round(artists.reduce((s, a) => s + (a[key] as number), 0) / artists.length) : 0
    const laneStats = `Lane averages: ${laneAvg('lowercase_pct')}% lowercase, ${laneAvg('short_caption_pct')}% short captions, ${laneAvg('no_hashtags_pct')}% no hashtags`
    const alignment = calcVoiceAlignment(artists)
    const tone = calcToneRegister(artists)

    // Deep dive profiles
    const profilesText = artists.filter(a => a.style_rules).map(a =>
      `--- ${a.name} (@${a.handle}, ${a.follower_count?.toLocaleString() || '?'} followers) ---
Voice: ${a.style_rules}
${a.visual_aesthetic?.mood ? 'Visual mood: ' + a.visual_aesthetic.mood : ''}
${a.content_performance?.best_type ? 'Best format: ' + a.content_performance.best_type : ''}
${a.content_performance?.engagement_rate ? 'Engagement: ' + a.content_performance.engagement_rate + '%' : ''}
${a.brand_positioning || ''}
${a.content_strategy_notes || ''}`
    ).join('\n\n')

    // Real events
    let gigContext = ''
    try {
      const [gigsRes, releasesRes] = await Promise.allSettled([fetch('/api/gigs'), fetch('/api/releases')])
      const gigs = gigsRes.status === 'fulfilled' ? (await gigsRes.value.json()).gigs : []
      const releases = releasesRes.status === 'fulfilled' ? (await releasesRes.value.json()).releases : []
      const now = new Date(), soon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
      const ug = gigs?.filter((g: any) => new Date(g.date) >= now && new Date(g.date) <= soon) || []
      const ur = releases?.filter((r: any) => new Date(r.release_date) >= now && new Date(r.release_date) <= soon) || []
      if (ug.length) gigContext += '\nUpcoming gigs:\n' + ug.map((g: any) => `- ${g.title} at ${g.venue}, ${g.location} (${new Date(g.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })})`).join('\n')
      if (ur.length) gigContext += '\nUpcoming releases:\n' + ur.map((r: any) => `- ${r.title} (${new Date(r.release_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})`).join('\n')
    } catch {}

    // Voice directives from own profile
    let voiceDirectives = ''
    if (ownProfile) {
      const lc = ownProfile.lowercase_pct || 0
      if (lc > 85) voiceDirectives += '\nCASING: ALL CAPS — this artist writes almost entirely in capitals.'
      else if (lc > 60) voiceDirectives += '\nCASING: Default to all-lowercase. ~70% of captions are lowercase.'
      else if (lc < 20) voiceDirectives += '\nCASING: Standard capitalisation — this artist rarely uses lowercase.'
      const sc = ownProfile.short_caption_pct || 0
      if (sc > 50) voiceDirectives += '\nLENGTH: Keep captions SHORT (1-15 words). This artist uses fragment-style bursts.'
      else if (sc < 25) voiceDirectives += '\nLENGTH: This artist writes longer, more reflective captions.'
      if (ownProfile.style_rules) voiceDirectives += '\nARTIST VOICE RULES:\n' + ownProfile.style_rules
    }

    const system = `${SKILLS_CAPTION_GEN}

REFERENCE ARTIST VOICE PROFILES:
${profilesText || '(no artists scanned yet)'}

LANE DATA:
${laneStats}
Voice alignment: ${alignment.value} (${alignment.score}%)
Tone register: ${tone.value}
${gigContext ? '\nREAL UPCOMING DATA (use exact dates/names, never invent):' + gigContext : ''}
${voiceDirectives}

You are writing captions for ${artistName || 'an underground electronic music artist'}.

CRITICAL RULES:
- NO hashtags in Instagram or X captions
- NO exclamation marks
- NO engagement bait ("thoughts?", "what do you think?")
- Do NOT narrate or describe attached images — the audience can see them
- NEVER fabricate dates, venues, names — only reference real data above
- Captions should cite specific reference artists and their real engagement patterns in reasoning

Return ONLY valid JSON:
{"safe":{"text":"...","reasoning":"why, citing specific artist data","score":1400},"loose":{"text":"...","reasoning":"...","score":1600},"raw":{"text":"...","reasoning":"...","score":1200}}

safe = on-brand, reliable. loose = personality-forward, edgier. raw = stripped back, minimal, cryptic.
Score 800-2500 based on predicted engagement from real data.`

    const scanContext = mediaScan ? `\nMedia scan: score ${mediaScan.score}/100 (${mediaScan.verdict}). Tags: ${mediaScan.tags.join(', ')}. ${mediaScan.post_rec}` : ''
    const userPrompt = `Context: ${context || 'general post'}\nPlatform: ${platform}\nFormat: ${format}${scanContext}`

    try {
      const raw = await callClaude(system, userPrompt, 900, mediaUrls)
      const start = raw.indexOf('{'), end = raw.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error('No JSON')
      setCaptions(JSON.parse(raw.slice(start, end + 1)) as Captions)
    } catch (err) { console.error('Caption generation failed:', err) }
    setGenerating(false)
  }

  // ── Repurpose ─────────────────────────────────────────────────────────────

  const generateRepurpose = async () => {
    if (!caption) return
    setRepurposing(true)
    const profilesText = artists.filter(a => a.style_rules).map(a => `${a.name}: ${a.style_rules}`).join('\n')
    const raw = await callClaude(
      `You repurpose content for electronic music artists across three formats. One input becomes three pieces of content — each native to its format.

VOICE: ${profilesText || 'underground electronic, all lowercase, minimal'}

FORMAT RULES:
1. REEL SCRIPT (15-30s): Hook 0.5s then 3-part (hook, story, payoff). On-screen text cues with timing. Dark, minimal.
2. CAROUSEL (5 slides): Slide 1 = hook. 2-4 = substance. 5 = payoff or quiet CTA. 1-2 sentences max per slide.
3. STATIC POST: 1-15 words. Cryptic, reflective, or direct. Gets screenshotted.

RULES: all lowercase, no exclamation marks, no emojis, no engagement bait, each format native not adapted, underground electronic tone.
Respond ONLY with valid JSON.`,
      `Context: ${context || ''}\nExisting caption: ${caption}\nPlatform: ${platform}\n\nReturn: {"reel_script":"script with timing","carousel_slides":["s1","s2","s3","s4","s5"],"static_post":"caption"}`,
      800
    )
    try {
      const start = raw.indexOf('{'), end = raw.lastIndexOf('}')
      if (start >= 0 && end > start) setRepurposed(JSON.parse(raw.slice(start, end + 1)))
    } catch {}
    setRepurposing(false)
  }

  // ── Select variant ────────────────────────────────────────────────────────

  const selectVariant = (key: 'safe' | 'loose' | 'raw') => {
    if (!captions) return
    setSelectedVariant(key); setCaption(captions[key].text)
  }

  const goToPreview = () => {
    if (!caption.trim()) return
    const slot = suggestNextBestSlot(platform, format)
    setScheduleDate(slot.date); setScheduleTime(slot.time)
    setStep('preview')
  }

  // ── Save / Post ───────────────────────────────────────────────────────────

  const savePost = async (status: 'draft' | 'scheduled' | 'approved') => {
    setSaving(true)
    const scheduledAt = scheduleDate && scheduleTime ? new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString() : new Date().toISOString()
    const hashtagsArr = hashtags.trim() ? hashtags.split(/[,\s]+/).map(h => h.startsWith('#') ? h : '#' + h).filter(Boolean) : null
    const res = await fetch('/api/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform, caption, format, scheduled_at: scheduledAt, status,
        media_urls: mediaUrls.length ? mediaUrls : null,
        first_comment: firstComment || null, hashtags: hashtagsArr,
        location_name: locationName || null,
        user_tags: userTags.trim() ? userTags.split(/[,\s]+/).filter(Boolean) : null,
        collaborators: collaborators.length > 0 ? collaborators : null,
        thumb_offset: coverTime > 0 ? Math.round(coverTime * 1000) : null,
        dm_enabled: dmEnabled,
        dm_keyword: dmEnabled ? dmKeyword : null,
        dm_reward_type: dmEnabled ? dmRewardType : null,
        dm_reward_url: dmEnabled ? dmRewardUrl : null,
        dm_message: dmEnabled ? dmMessage : null,
        dm_follow_required: dmEnabled ? dmFollowRequired : false,
      }),
    })
    const data = await res.json()
    if (data.success) {
      localStorage.removeItem('signallab.composer.draft')
      setSavedMessage(status === 'approved' ? 'Approved · posting at ' + scheduleTime : status === 'scheduled' ? 'Scheduled' : 'Saved as draft')
      setTimeout(() => { setStep('compose'); setCaption(''); setContext(''); setMediaUrls([]); setCaptions(null); setSelectedVariant(null); setFirstComment(''); setHashtags(''); setUserTags(''); setCollaborators([]); setLocationName(''); setSavedMessage(''); setRepurposed(null); setDmEnabled(false); setDmKeyword(''); setDmRewardType('download'); setDmRewardUrl(''); setDmMessage(''); setDmFollowRequired(false) }, 2500)
    }
    setSaving(false)
  }

  const postNow = async () => {
    setSaving(true)
    const endpoint = platform === 'twitter' ? '/api/social/twitter/post' : platform === 'tiktok' ? '/api/social/tiktok/post' : platform === 'threads' ? '/api/buffer' : '/api/social/instagram/post'
    const body = platform === 'twitter' ? { text: caption } : platform === 'threads' ? { text: caption, media_urls: mediaUrls, channels: ['threads'], post_format: format } : platform === 'tiktok' ? { caption, video_url: mediaUrls[0] } : { caption, image_url: mediaUrls[0] }
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (data.success || data.post_id || data.tweet_id || data.publish_id) {
      localStorage.removeItem('signallab.composer.draft')
      setSavedMessage('Posted')
      setTimeout(() => { setStep('compose'); setCaption(''); setContext(''); setMediaUrls([]); setCaptions(null); setSavedMessage('') }, 2500)
    } else { setSavedMessage('Failed: ' + (data.error || 'unknown error')) }
    setSaving(false)
  }

  // ── Derived intelligence ──────────────────────────────────────────────────

  const alignment = calcVoiceAlignment(artists)
  const toneReg = calcToneRegister(artists)
  const ownProfile = artists.find(a => a.name?.toLowerCase() === artistName?.toLowerCase())

  // ── Render ────────────────────────────────────────────────────────────────

  if (savedMessage) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '120px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, letterSpacing: '0.15em', textTransform: 'uppercase', color: s.gold }}>{savedMessage}</div>
      </div>
    )
  }

  if (step === 'preview') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 120px' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.3em', textTransform: 'uppercase', color: s.dimmest, marginBottom: 32 }}>Review & Approve</div>

        {mediaUrls.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            {mediaUrls[0].match(/\.(mp4|mov|webm)/i) ? (
              <div>
                <video
                  ref={coverVideoRef}
                  src={mediaUrls[0]}
                  style={{ width: '100%', maxHeight: 500, objectFit: 'contain', background: '#000', borderRadius: 4, border: `1px solid ${s.border}` }}
                  muted
                  onLoadedMetadata={e => {
                    const v = e.currentTarget
                    setVideoDuration(v.duration)
                  }}
                />
                {/* Cover frame picker */}
                {videoDuration > 0 && (
                  <div style={{ marginTop: 12, padding: '14px 16px', background: s.panel, border: `1px solid ${s.border}`, borderRadius: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Label>Cover frame</Label>
                      <span style={{ fontSize: 12, color: s.dim, fontFamily: s.font }}>
                        {coverTime.toFixed(1)}s / {videoDuration.toFixed(1)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={videoDuration}
                      step={0.1}
                      value={coverTime}
                      onChange={e => {
                        const t = parseFloat(e.target.value)
                        setCoverTime(t)
                        if (coverVideoRef.current) {
                          coverVideoRef.current.currentTime = t
                        }
                      }}
                      style={{ width: '100%', accentColor: s.gold, cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: s.dimmest }}>Drag to pick your cover frame</span>
                      <button
                        onClick={() => {
                          if (coverVideoRef.current) {
                            coverVideoRef.current.play()
                            setTimeout(() => coverVideoRef.current?.pause(), 3000)
                          }
                        }}
                        style={{ fontSize: 11, color: s.gold, background: 'none', border: 'none', cursor: 'pointer', fontFamily: s.font, textTransform: 'uppercase', letterSpacing: '0.1em' }}
                      >
                        Preview 3s
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <img src={mediaUrls[0]} alt="" style={{ width: '100%', maxHeight: 500, objectFit: 'contain', background: '#000', borderRadius: 4, border: `1px solid ${s.border}` }} />
            )}
            {mediaUrls.length > 1 && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>{mediaUrls.slice(1).map((url, i) => <img key={i} src={url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, border: `1px solid ${s.border}` }} />)}</div>}
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <Label>Caption</Label>
          <div style={{ padding: 16, background: s.panel, borderRadius: 4, border: `1px solid ${s.border}`, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{caption}</div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <Tag>{platform === 'twitter' ? 'X' : platform}</Tag>
          <Tag>{format}</Tag>
        </div>

        <div style={{ borderTop: `1px solid ${s.border}`, margin: '24px 0' }} />

        <Field label="First comment" value={firstComment} onChange={setFirstComment} placeholder="Tags go here, not in caption" />
        <Field label="Hashtags" value={hashtags} onChange={setHashtags} placeholder="#underground #techno" />
        {/* Collaborators - IG Collab post */}
        <div style={{ marginBottom: 20 }}>
          <Label>Collaborators</Label>
          {collaborators.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {collaborators.map((c, i) => (
                <span key={i} style={{ background: 'rgba(61,107,74,0.18)', border: '1px solid #3d6b4a', color: '#3d6b4a', fontFamily: s.font, fontSize: 11, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  @{c}
                  <button onClick={() => setCollaborators(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#3d6b4a', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>x</button>
                </span>
              ))}
            </div>
          )}
          {collaborators.length < 3 && (
            <CollabSearch existing={collaborators} onAdd={(u) => setCollaborators(prev => [...prev, u])} />
          )}
          <div style={{ fontSize: 11, color: s.dimmest, marginTop: 4 }}>Up to 3. They get a notification + co-author byline.</div>
        </div>

        <Field label="Tag people" value={userTags} onChange={setUserTags} placeholder="@handle1, @handle2 (tagged in media)" />
        <Field label="Location" value={locationName} onChange={setLocationName} placeholder="Venue or city" />

        {/* Comment → DM automation */}
        <div style={{ borderTop: `1px solid ${s.border}`, paddingTop: 20, marginTop: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: dmEnabled ? 12 : 0 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: dmEnabled ? s.gold : s.dimmest, fontWeight: 700 }}>Comment &rarr; DM</div>
            <button
              onClick={() => setDmEnabled(!dmEnabled)}
              style={{ width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative', background: dmEnabled ? s.gold : s.border, transition: 'background 0.2s' }}
            >
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: dmEnabled ? 18 : 2, transition: 'left 0.2s' }} />
            </button>
          </div>
          {!dmEnabled && <div style={{ fontSize: 12, color: s.dimmest, marginTop: 4 }}>Off</div>}
          {dmEnabled && (
            <>
              <div style={{ fontSize: 12, color: s.dimmest, marginBottom: 12, lineHeight: 1.5 }}>
                When someone comments your keyword, they automatically get a DM with your link. Activates when this post publishes.
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <Label>Trigger word</Label>
                  <input type="text" placeholder="LINK" value={dmKeyword} onChange={e => setDmKeyword(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Reward type</Label>
                  <select value={dmRewardType} onChange={e => setDmRewardType(e.target.value)} style={{ ...inputStyle, appearance: 'none' as const }}>
                    {['download', 'stream', 'buy', 'tickets', 'presave', 'discount', 'other'].map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <Label>Reward URL</Label>
                <input type="text" placeholder="https://..." value={dmRewardUrl} onChange={e => setDmRewardUrl(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <Label>DM message</Label>
                <textarea placeholder="Here you go, link inside" value={dmMessage} onChange={e => setDmMessage(e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' as const }} />
              </div>
              <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={dmFollowRequired} onChange={e => setDmFollowRequired(e.target.checked)} />
                Require follow before sending DM
              </label>
            </>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${s.border}`, margin: '24px 0' }} />

        <Label>Schedule for</Label>
        <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
          <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={inputStyle} />
          <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={{ ...inputStyle, width: 120 }} />
        </div>

        <ActionBar>
          <Btn onClick={() => setStep('compose')}>&larr; Edit</Btn>
          <Btn onClick={() => savePost('draft')} disabled={saving}>Save draft</Btn>
          <Btn primary onClick={() => savePost('approved')} disabled={saving}>{saving ? 'Saving...' : 'Approve & Schedule'}</Btn>
        </ActionBar>
      </div>
    )
  }

  // ── Compose step ──────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: s.font, color: 'var(--text)' }}>
      {/* ── Main content area ── */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 120px' }}>

        {/* ── Context input ── */}
        <div style={{ marginBottom: 24 }}>
          <input
            type="text" value={context} onChange={e => setContext(e.target.value)}
            placeholder="What happened... show, studio, drop"
            style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: `1px solid ${s.border}`, color: 'var(--text)', fontSize: 18, outline: 'none', padding: '16px 0', fontFamily: s.font }}
          />
        </div>

        {/* ── Format + Platform row ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['post', 'carousel', 'story', 'reel'] as Format[]).map(f => (
              <button key={f} onClick={() => setFormat(f)} style={pillStyle(format === f)}>{f}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 28, background: s.border }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {(['instagram', 'tiktok', 'threads', 'twitter'] as Platform[]).map(p => (
              <button key={p} onClick={() => setPlatform(p)} style={pillStyle(platform === p)}>{p === 'twitter' ? 'X' : p === 'instagram' ? 'IG' : p === 'threads' ? 'THR' : 'TT'}</button>
            ))}
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={e => e.target.files && handleFiles(e.target.files)} />

        {/* ── Composer body ── */}
        <div style={{ minWidth: 0 }}>

          {/* Voice intelligence strip */}
          {artists.length > 0 && (
            <div style={{ display: 'flex', gap: 24, marginBottom: 24, padding: '12px 16px', background: s.panel, border: `1px solid ${s.border}` }}>
              <Stat label="Voice Alignment" value={alignment.value} sub={`${alignment.score}%`} />
              <Stat label="Tone Register" value={toneReg.value} sub={toneReg.desc} />
              {ownProfile && <Stat label="Your Voice" value={ownProfile.style_rules?.slice(0, 60) + '...' || 'Set up voice'} />}
            </div>
          )}

          {/* Media thumbs */}
          {mediaUrls.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {mediaUrls.map((url, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  {url.match(/\.(mp4|mov|webm)/i) ? <video src={url} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 4, border: `1px solid ${s.border}` }} muted /> : <img src={url} alt="" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 4, border: `1px solid ${s.border}` }} />}
                  <button onClick={() => setMediaUrls(prev => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: s.gold, color: '#050505', border: 'none', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>&times;</button>
                </div>
              ))}
            </div>
          )}

          {/* Media scan results */}
          {scanningMedia && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: s.panel, border: `1px solid ${s.border}`, marginBottom: 24, fontSize: 12, color: s.dim }}>
              <span style={{ width: 8, height: 8, background: s.gold, display: 'inline-block', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
              Scanning media...
            </div>
          )}
          {mediaScan && !scanningMedia && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: s.panel, border: `1px solid ${s.border}`, marginBottom: 24 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: mediaScan.score >= 75 ? '#44cc66' : mediaScan.score >= 60 ? s.gold : mediaScan.score >= 45 ? '#9a6a5a' : '#8a4a3a', lineHeight: 1 }}>{mediaScan.score}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: mediaScan.score >= 75 ? '#44cc66' : mediaScan.score >= 60 ? s.gold : '#9a6a5a', fontWeight: 700, marginBottom: 3 }}>{mediaScan.verdict}</div>
                <div style={{ fontSize: 13, color: 'var(--text-dimmer, rgba(240,235,226,0.5))', lineHeight: 1.4 }}>{mediaScan.post_rec}</div>
              </div>
            </div>
          )}

          {/* Drop zone when no media */}
          {mediaUrls.length === 0 && (
            <div
              style={{ border: `2px dashed ${dragOver ? s.gold : s.border}`, padding: '48px 32px', textAlign: 'center', cursor: 'pointer', color: dragOver ? s.gold : s.dim, fontSize: 14, marginBottom: 24, letterSpacing: '0.1em', textTransform: 'uppercase', transition: 'border-color 0.15s' }}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? 'Uploading...' : 'Drop media here or tap to add'}
            </div>
          )}

          {/* Trend chips */}
          {trends.length > 0 && !captions && (
            <div style={{ marginBottom: 20 }}>
              <Label>Trending in your lane</Label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {trends.map(t => (
                  <button key={t.id} onClick={() => setContext(t.name)} style={{ padding: '4px 12px', fontSize: 11, border: `1px solid ${s.border}`, background: 'transparent', color: s.dim, cursor: 'pointer', fontFamily: s.font, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {t.hot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.gold, display: 'inline-block' }} />}
                    {t.name}
                    <span style={{ fontSize: 11, color: s.dimmest }}>{t.fit}%</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Caption textarea */}
          <div style={{ marginBottom: 24 }}>
            <Label>Caption</Label>
            <textarea
              value={caption} onChange={e => setCaption(e.target.value)}
              placeholder="Write your caption or generate suggestions..."
              style={{ width: '100%', minHeight: 140, background: 'var(--bg)', border: `1px solid ${s.border}`, padding: '16px 18px', color: 'var(--text)', fontSize: 15, lineHeight: 1.6, fontFamily: s.font, resize: 'vertical', outline: 'none' }}
            />
          </div>

          {/* Caption variants */}
          {captions && (
            <div style={{ marginBottom: 24 }}>
              <Label>Suggestions</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(['safe', 'loose', 'raw'] as const).map(key => (
                  <div
                    key={key}
                    onClick={() => selectVariant(key)}
                    style={{ padding: '14px 16px', border: `1px solid ${selectedVariant === key ? s.gold : s.border}`, background: selectedVariant === key ? 'rgba(255,42,26,0.06)' : s.panel, cursor: 'pointer', transition: 'all 0.15s' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: selectedVariant === key ? s.gold : s.dimmest, fontWeight: 700 }}>{key}</span>
                      <span style={{ fontSize: 12, letterSpacing: '0.1em', color: s.gold }}>{captions[key].score}</span>
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}>{captions[key].text}</div>
                    <div style={{ fontSize: 11, color: s.dimmest, lineHeight: 1.5 }}>{captions[key].reasoning}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Action buttons ── */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
            <button onClick={() => fileInputRef.current?.click()} style={{ padding: '12px 20px', border: `1px solid ${s.border}`, background: 'transparent', color: 'var(--text-dimmer, rgba(240,235,226,0.4))', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 600, fontFamily: s.font }}>
              {mediaUrls.length > 0 ? `${mediaUrls.length} media` : 'Attach media'}
            </button>
            <button onClick={generateCaptions} disabled={generating} style={{ padding: '12px 24px', border: `1px solid ${s.border}`, background: 'transparent', color: 'var(--text)', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: generating ? 'default' : 'pointer', fontWeight: 700, fontFamily: s.font, opacity: generating ? 0.5 : 1 }}>
              {generating ? 'Generating...' : 'Generate captions'}
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={goToPreview} disabled={!caption.trim()} style={{ padding: '12px 32px', border: 'none', background: caption.trim() ? s.gold : `${s.gold}30`, color: caption.trim() ? '#050505' : 'var(--text-dimmer, rgba(240,235,226,0.3))', fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: caption.trim() ? 'pointer' : 'default', fontWeight: 700, fontFamily: s.font }}>
              {'Post \u2192'}
            </button>
          </div>

          {/* Repurpose */}
          {caption && (
            <div style={{ marginBottom: 24 }}>
              <button onClick={generateRepurpose} disabled={repurposing} style={{ ...btnStyle(false), fontSize: 11, padding: '10px 18px' }}>
                {repurposing ? 'Repurposing...' : repurposed ? 'Repurpose again' : 'Repurpose \u2192 3 formats'}
              </button>
              {repurposed && (
                <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                  <RepurposeCard title="Reel Script" content={repurposed.reel_script} />
                  <RepurposeCard title="Carousel" content={repurposed.carousel_slides.join('\n\n---\n\n')} />
                  <RepurposeCard title="Static Post" content={repurposed.static_post} />
                </div>
              )}
            </div>
          )}

          {/* ── Voice intelligence (inline) ── */}
          {artists.length === 0 && (
            <div style={{ padding: '24px 20px', border: `1px solid ${s.border}`, textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: s.dimmest, marginBottom: 10 }}>No voice profile yet</div>
              <a href="/broadcast" style={{ fontSize: 11, color: s.gold, textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>Set up in Artist Voice</a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Label({ children }: { children: string }) {
  return <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmest)', marginBottom: 8, fontWeight: 700 }}>{children}</div>
}

function Tag({ children }: { children: string }) {
  return <span style={{ fontSize: 11, color: 'var(--text-dimmer)', background: 'var(--panel)', padding: '3px 10px', display: 'inline-block', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</span>
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmest)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-dimmest)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function LaneStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span>{label}</span><span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Label>{label}</Label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </div>
  )
}

function RepurposeCard({ title, content }: { title: string; content: string }) {
  return (
    <div style={{ flex: 1, padding: '12px 14px', border: '1px solid var(--border)', fontSize: 12, lineHeight: 1.5 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmest)', marginBottom: 8, fontWeight: 700 }}>{title}</div>
      <div style={{ color: 'var(--text-dimmer)', whiteSpace: 'pre-wrap' }}>{content}</div>
      <button onClick={() => navigator.clipboard.writeText(content)} style={{ marginTop: 8, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dimmest)', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>Copy</button>
    </div>
  )
}

function ActionBar({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '16px 20px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12, zIndex: 50 }}>{children}</div>
}

function Btn({ children, onClick, disabled, primary }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: '10px 24px', border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--gold)' : 'transparent', color: primary ? '#050505' : 'var(--text)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: disabled ? 'default' : 'pointer', fontWeight: 700, opacity: disabled ? 0.3 : 1, fontFamily: 'var(--font-mono)' }}>
      {children}
    </button>
  )
}

// ── Shared styles ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', padding: '10px 14px', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none' }

function pillStyle(active: boolean): React.CSSProperties {
  return { padding: '8px 14px', border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`, background: active ? 'var(--gold)' : 'transparent', color: active ? '#050505' : 'var(--text-dimmer)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: active ? 700 : 500, fontFamily: 'var(--font-mono)' }
}

function btnStyle(primary: boolean): React.CSSProperties {
  return { padding: '6px 14px', border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--gold)' : 'transparent', color: primary ? '#050505' : 'var(--text)', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 700, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }
}

/** Live IG username search for collaborator field */
function CollabSearch({ onAdd, existing }: { onAdd: (username: string) => void; existing: string[] }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ username: string; full_name: string; profile_pic_url: string; followers: number; is_verified: boolean }>>([])
  const [searching, setSearching] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder="Search Instagram username..."
        value={query}
        onChange={e => {
          const v = e.target.value.replace(/^@/, '')
          setQuery(v)
          if (timer.current) clearTimeout(timer.current)
          if (v.length < 2) { setResults([]); setSearching(false); return }
          setSearching(true)
          timer.current = setTimeout(async () => {
            try {
              const res = await fetch(`/api/ig-lookup?q=${encodeURIComponent(v)}`)
              const data = await res.json()
              setResults(data.results || [])
            } catch { setResults([]) }
            setSearching(false)
          }, 600)
        }}
        style={inputStyle}
      />
      {searching && (
        <div style={{ position: 'absolute', right: 8, top: 10, fontSize: 12, color: 'var(--text-dimmest)' }}>searching...</div>
      )}
      {results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--panel)', border: '1px solid var(--border)', zIndex: 10 }}>
          {results.map((r, i) => {
            const already = existing.some(c => c.toLowerCase() === r.username.toLowerCase())
            return (
              <button
                key={i}
                onClick={() => { if (!already) onAdd(r.username); setQuery(''); setResults([]) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: already ? 'var(--text-dimmest)' : 'var(--text)', cursor: already ? 'default' : 'pointer', textAlign: 'left' }}
              >
                {r.profile_pic_url && (
                  <img src={r.profile_pic_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                )}
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>
                    @{r.username} {r.is_verified && <span style={{ color: 'var(--gold)' }}>&#10003;</span>}
                    {already && <span style={{ color: '#3d6b4a', marginLeft: 6, fontWeight: 400 }}>added</span>}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dimmest)' }}>
                    {r.full_name}{r.followers > 0 ? ` · ${r.followers >= 1000 ? `${(r.followers / 1000).toFixed(1)}k` : r.followers} followers` : ''}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
      {query.length >= 2 && !searching && results.length === 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--panel)', border: '1px solid var(--border)', padding: '10px 12px', zIndex: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dimmest)' }}>No business/creator account found for &ldquo;{query}&rdquo;</div>
          <div style={{ fontSize: 11, color: 'var(--text-dimmest)', marginTop: 2 }}>Only public business/creator profiles show up</div>
          <button
            onClick={() => { onAdd(query); setQuery(''); setResults([]) }}
            style={{ background: 'none', border: 'none', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer', padding: '4px 0', marginTop: 4 }}
          >
            + Add &ldquo;{query}&rdquo; anyway
          </button>
        </div>
      )}
    </div>
  )
}
