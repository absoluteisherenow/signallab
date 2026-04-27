'use client'

/**
 * @deprecated Replaced by `BroadcastChain` (Apr 2026). The chain flow runs
 * Drop → Scan → Voice → Approve as a single narrative on one page, replacing
 * the tab-heavy lab. Kept here temporarily for salvage during chain bedding-in
 * (intelligence sidebar shapes, artist-profile loader). Delete in the next
 * cleanup pass once chain is verified stable in prod.
 */

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseBrowser'
import { aiCache } from '@/lib/aiCache'
import { SignalLabHeader } from './SignalLabHeader'
import { MediaPicker } from '@/components/ui/MediaPicker'
import { SKILLS_CAPTION_GEN, SKILL_ADS_MANAGER } from '@/lib/skillPromptsClient'
import { PulseLoader } from '@/components/ui/PulseLoader'
import { useGatedSend } from '@/lib/outbound'

// IG CDN profile pics expire + CORB-block — stream through our proxy so they never break
const proxied = (url?: string | null) => url ? `/api/image-proxy?url=${encodeURIComponent(url)}` : ''

interface ArtistProfile {
  name: string
  handle: string
  genre: string
  lowercase_pct: number
  short_caption_pct: number
  no_hashtags_pct: number
  chips: string[]
  highlight_chips: number[]
  style_rules?: string
  data_source?: 'apify' | 'hikerapi' | 'manual' | 'claude'
  post_count_analysed?: number
  last_scanned?: string
  profile_pic_url?: string
  follower_count?: number
  biography?: string
  visual_aesthetic?: {
    mood: string
    palette: string
    subjects: string[]
    signature_visual: string
    avoid: string
  }
  content_performance?: {
    best_type: string
    best_subject: string
    engagement_rate: string
    posting_frequency: string
    peak_content: string
  }
  brand_positioning?: string
  collaboration_network?: string
  content_strategy_notes?: string
}

interface CaptionVariant {
  text: string
  reasoning: string
  score: number
}

interface Captions {
  safe: CaptionVariant
  loose: CaptionVariant
  raw: CaptionVariant
}

interface AdPlan {
  campaign_type: string
  platforms: { name: string; budget_split: string; why: string }[]
  audiences: { layer: string; targeting: string; size: string }[]
  creative: string[]
  schedule: string
  budget_breakdown: string
  red_flags: string[]
  green_flags: string[]
}

interface Trend {
  id: number
  platform: string
  name: string
  fit: number
  hot: boolean
  context: string
  evidence?: string
  posts_supporting?: number
}

// ── Real calculated stats from artist data ────────────────────────────────────
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
  const artistWord = artists.length === 1 ? 'artist' : 'artists'
  const explanation = score >= 82
    ? `Your reference artists write in a very similar style — consistency makes your lane voice feel intentional`
    : score >= 65
    ? `Some variation across your reference artists — a defined lane voice is emerging`
    : score >= 45
    ? `Your reference artists write quite differently from each other — the lane voice is mixed`
    : `Your reference artists have very different styles — hard to extract a clear lane voice`
  return { value: label, score, desc: `${explanation} (${score}% across ${artists.length} ${artistWord})` }
}

function calcToneRegister(artists: ArtistProfile[]): { value: string; score: number; desc: string } {
  if (artists.length === 0) return { value: '—', score: 0, desc: 'Add artists to detect tone register' }
  const avg = (key: keyof ArtistProfile) => Math.round(artists.reduce((s, a) => s + (a[key] as number), 0) / artists.length)
  const lower = avg('lowercase_pct')
  const short = avg('short_caption_pct')
  const noHash = avg('no_hashtags_pct')
  if (lower > 68 && short > 52 && noHash > 62) return { value: 'Raw', score: Math.round((lower + short + noHash) / 3), desc: `${lower}% lowercase + ${short}% short + ${noHash}% no hashtags — minimal, detached register. Captions feel like thoughts, not marketing.` }
  if (lower > 58 && noHash > 60) return { value: 'Dry', score: Math.round((lower + noHash) / 2), desc: `${lower}% lowercase, ${noHash}% no hashtags — clean and understated. Lets the music speak without promotional noise.` }
  if (short < 35 && lower < 55) return { value: 'Verbose', score: Math.round(100 - short), desc: `Only ${short}% short captions in this lane — longer-form writing is the norm. More context, more story.` }
  if (noHash < 45) return { value: 'Discovery', score: Math.round(100 - noHash), desc: `${100 - noHash}% of posts use hashtags — this lane prioritises reach over tone. Helps new listeners find the music.` }
  return { value: 'Balanced', score: 62, desc: `${lower}% lowercase · ${short}% short · ${noHash}% no hashtags — a mixed lane with no single dominant style.` }
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

// Use the browser's actual timezone instead of hardcoded Europe/London
function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'Europe/London'
  }
}

// Detect if a URL points to a video
function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(url)
}

// Extract N frames from a video URL as base64 PNG (client-side via <video> + canvas)
async function extractVideoFrames(url: string, count = 3, maxWidth = 768): Promise<Array<{ mediaType: string; data: string }>> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = url
    const frames: Array<{ mediaType: string; data: string }> = []
    video.addEventListener('loadedmetadata', async () => {
      try {
        const duration = video.duration || 1
        const timestamps = Array.from({ length: count }, (_, i) => duration * ((i + 1) / (count + 1)))
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth))
        canvas.width = Math.round((video.videoWidth || maxWidth) * scale)
        canvas.height = Math.round((video.videoHeight || maxWidth) * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('No canvas context'))
        for (const t of timestamps) {
          await new Promise<void>((res, rej) => {
            const onSeeked = () => { video.removeEventListener('seeked', onSeeked); res() }
            video.addEventListener('seeked', onSeeked)
            video.currentTime = Math.min(t, duration - 0.05)
            setTimeout(() => { video.removeEventListener('seeked', onSeeked); res() }, 3000)
          })
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
          const base64 = dataUrl.split(',')[1]
          frames.push({ mediaType: 'image/jpeg', data: base64 })
        }
        resolve(frames)
      } catch (e) { reject(e) }
    })
    video.addEventListener('error', () => reject(new Error('Video load failed')))
  })
}

async function buildVisionBlocks(urls: string[]): Promise<any[]> {
  const blocks: any[] = []
  for (const url of urls.slice(0, 4)) {
    if (isVideoUrl(url)) {
      try {
        const frames = await extractVideoFrames(url, 3)
        for (const f of frames) {
          blocks.push({
            type: 'image',
            source: { type: 'base64', media_type: f.mediaType, data: f.data },
          })
        }
      } catch (e) {
        console.warn('[vision] video frame extraction failed', e)
      }
    } else {
      blocks.push({ type: 'image', source: { type: 'url', url } })
    }
  }
  return blocks
}

async function callClaude(system: string, userPrompt: string, maxTokens = 600, imageUrls: string[] = []): Promise<string> {
  // If media is attached, build vision blocks (extracting frames from videos)
  const visionBlocks = imageUrls.length > 0 ? await buildVisionBlocks(imageUrls) : []
  const content: any = visionBlocks.length > 0
    ? [...visionBlocks, { type: 'text', text: userPrompt }]
    : userPrompt
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      system,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
      nocache: imageUrls.length > 0, // never cache vision requests
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `API error ${res.status}`)
  }
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

function Bar({ value, teal = false }: { value: number; teal?: boolean }) {
  const [width, setWidth] = useState(0)
  useEffect(() => { const t = setTimeout(() => setWidth(value), 400); return () => clearTimeout(t) }, [value])
  return (
    <div className="h-px bg-white/10 relative mt-1">
      <div className="absolute top-0 left-0 h-px transition-all duration-1000" style={{ width: `${width}%`, background: teal ? '#f2f2f2' : '#ff2a1a' }} />
    </div>
  )
}

export function BroadcastLab() {
  const gatedSend = useGatedSend()
  // ── aiCache — shared cache shared across modules, 12-hour TTL ──────────────
  // Prevents re-running Claude on every page visit (trends + captions are expensive)
  const NS = 'signallab'

  const readCache = () => aiCache.get(NS)
  const writeCache = (patch: Record<string, unknown>) => aiCache.patch(NS, patch)

  const _cache = typeof window !== 'undefined' ? readCache() : {}

  const [artistName, setArtistName] = useState('NIGHT manoeuvres')
  const [artistCountry, setArtistCountry] = useState('Australia')
  const [memberContext, setMemberContext] = useState('')
  const [artists, setArtists] = useState<ArtistProfile[]>([])
  const [addingArtist, setAddingArtist] = useState(false)
  const [newArtistName, setNewArtistName] = useState('')
  const [scanningArtist, setScanningArtist] = useState<string | null>(null)
  const [scanStage, setScanStage] = useState<string | null>(null)
  const [pastingFor, setPastingFor] = useState<string | null>(null)
  const [pastedCaptions, setPastedCaptions] = useState('')
  const [resolveCandidates, setResolveCandidates] = useState<Array<{ username: string; full_name: string; follower_count: number; profile_pic_url?: string; is_verified: boolean; is_private: boolean }> | null>(null)
  const [resolveOriginalQuery, setResolveOriginalQuery] = useState<string>('')
  const [platform, setPlatform] = useState('Instagram')
  const CONTEXT_DRAFT_KEY = 'signallab.composer.context.draft'
  const [context, setContext] = useState(() => {
    if (typeof window === 'undefined') return ''
    try { return localStorage.getItem(CONTEXT_DRAFT_KEY) || '' } catch { return '' }
  })

  // Persist composer context as the user types — survives reloads, modal closes
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (context) localStorage.setItem(CONTEXT_DRAFT_KEY, context)
      else localStorage.removeItem(CONTEXT_DRAFT_KEY)
    } catch {}
  }, [context])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const title = params.get('title')
      const venue = params.get('venue')
      const location = params.get('location')
      const date = params.get('date')
      if (title && venue) {
        const dateStr = date ? new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : ''
        // Gig-link from query string overrides any stale draft
        setContext(title + ' at ' + venue + ', ' + location + (dateStr ? ' · ' + dateStr : ''))
      }
      // Scanner → Broadcast: pre-load media URLs and format
      const rawUrls = params.get('mediaUrls')
      if (rawUrls) {
        const urls = rawUrls.split(',').filter(Boolean)
        if (urls.length > 0) {
          setMediaUrls(urls)
          setPostFormat(urls.length > 1 ? 'carousel' : 'post')
        }
      }
      const formatParam = params.get('format') as 'post' | 'carousel' | 'story' | 'reel' | null
      if (formatParam && ['post', 'carousel', 'story', 'reel'].includes(formatParam)) {
        setPostFormat(formatParam)
      }
    }
  }, [])
  const [media, setMedia] = useState('Crowd clip (video)')
  const [captions, setCaptions] = useState<Captions | null>((_cache.captions as Captions) || null)
  const [voiceModalOpen, setVoiceModalOpen] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<'safe' | 'loose' | 'raw'>('loose')
  const [generatingCaptions, setGeneratingCaptions] = useState(false)
  const [captionError, setCaptionError] = useState('')
  const [trendCaptions, setTrendCaptions] = useState<Record<number, string>>((_cache.trendCaptions as Record<number, string>) || {})
  const [loadingTrends, setLoadingTrends] = useState(false)
  const [generatingWeek, setGeneratingWeek] = useState(false)
  const [weekPreview, setWeekPreview] = useState<{ day: string; platform: string; caption: string; regenIdx?: number }[] | null>(null)
  const [savingWeek, setSavingWeek] = useState(false)
  const [regenIdx, setRegenIdx] = useState<number | null>(null)
  const [postFormat, setPostFormat] = useState<'post' | 'carousel' | 'story' | 'reel'>('post')
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [laneInsights, setLaneInsights] = useState<string[]>((_cache.laneInsights as string[]) || [])
  const [reelsOverlay, setReelsOverlay] = useState<{ lines: { text: string; timing: string }[]; style: string } | null>(null)
  const [generatingOverlay, setGeneratingOverlay] = useState(false)
  const [repurposed, setRepurposed] = useState<{ reel_script: string; carousel_slides: string[]; static_post: string } | null>(null)
  const [generatingRepurpose, setGeneratingRepurpose] = useState(false)
  const [adPlan, setAdPlan] = useState<AdPlan | null>(null)
  const [generatingAdPlan, setGeneratingAdPlan] = useState(false)
  const [adCampaignType, setAdCampaignType] = useState<'release' | 'gig' | 'always-on'>('release')
  const [adBudget, setAdBudget] = useState<'low' | 'mid' | 'high'>('low')
  const [trends, setTrends] = useState<Trend[]>((_cache.trends as Trend[]) || [])
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ artists: true, captions: true })
  const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))

  // Capture List — content suggestions from real engagement data
  const [captureSugg, setCaptureSugg] = useState<{
    your_buckets: any[]
    peer_buckets: any[]
    capture_list: any[]
    note?: string
  } | null>(null)
  const [loadingCapture, setLoadingCapture] = useState(false)
  async function loadCaptureSuggestions() {
    setLoadingCapture(true)
    try {
      const res = await fetch('/api/content/suggestions')
      if (res.ok) {
        const data = await res.json()
        setCaptureSugg(data)
      }
    } catch {} finally { setLoadingCapture(false) }
  }
  useEffect(() => { loadCaptureSuggestions() }, [])
  const [activeTab, setActiveTab] = useState<'content' | 'ads'>('content')
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [refreshingInsights, setRefreshingInsights] = useState(false)
  // Preview / approval modal — nothing posts without going through this
  const [previewModal, setPreviewModal] = useState<null | { text: string; platform: string; media: string[]; format: string }>(null)
  const [scheduleMode, setScheduleMode] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [trendsSource, setTrendsSource] = useState<{ postsAnalysed?: number; artistsIncluded?: string[]; cached_at?: string; from_cache?: boolean } | null>((_cache.trendsSource as any) || null)
  const [refreshingTrends, setRefreshingTrends] = useState(false)
  const [connectedSocials, setConnectedSocials] = useState<string[]>([]) // platform ids with direct connection
  const [publishing, setPublishing] = useState(false)
  const [syncingIG, setSyncingIG] = useState(false)
  const [igSyncResult, setIgSyncResult] = useState<{ synced?: number; error?: string } | null>(null)

  useEffect(() => {
    fetch('/api/social/connected')
      .then(r => r.json())
      .then(d => setConnectedSocials((d.accounts || []).map((a: {platform: string}) => a.platform)))
      .catch(() => {})
  }, [])

  // Load artist name + country from settings
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        const p = d.settings?.profile
        if (p?.name) setArtistName(p.name)
        if (p?.country) setArtistCountry(p.country)
        if (p?.member_context) setMemberContext(p.member_context)
      })
      .catch(() => {})
  }, [])

  const platformId = (label: string) =>
    ({ 'Instagram': 'instagram', 'X / Twitter': 'twitter', 'TikTok': 'tiktok' }[label] || '')

  const hasDirectConnection = (label: string) => connectedSocials.includes(platformId(label))

  async function refreshLaneInsights() {
    const profilesText = artists.filter(a => a.style_rules).map(a => `${a.name}: ${a.style_rules}`).join('\n\n')
    if (!profilesText) return
    setRefreshingInsights(true)
    try {
      const raw = await callClaude(
        'You are a social media analyst for electronic music artists. Respond ONLY with a valid JSON array of strings, no markdown.',
        `Based on these reference artist voice profiles:\n\n${profilesText}\n\nGenerate 5 specific, actionable insights about what content and caption patterns perform best in this lane. Be concrete — specific structural patterns, timing, content types that get saves. Each insight is one sentence. Return: ["insight1","insight2","insight3","insight4","insight5"]`,
        400
      )
      const insights = JSON.parse(raw.replace(/```json|```/g, '').trim())
      if (Array.isArray(insights) && insights.length > 0) setLaneInsights(insights)
    } catch {
      // keep existing
    } finally {
      setRefreshingInsights(false)
    }
  }

  async function uploadMedia(files: FileList | File[]) {
    setUploading(true)
    try {
      const uploaded = await Promise.all(Array.from(files).map(async file => {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/upload', { method: 'POST', body: form })
        const data = await res.json()
        if (!data.url) throw new Error(data.error || 'Upload failed')
        return data.url as string
      }))
      setMediaUrls(prev => [...prev, ...uploaded])
      if (uploaded.length > 1) setPostFormat('carousel')
      showToast(`${uploaded.length} file${uploaded.length>1?'s':''} uploaded`, 'Done')
    } catch (err: any) {
      showToast('Upload failed: ' + err.message, 'Error')
    } finally {
      setUploading(false)
    }
  }
  const [toast, setToast] = useState<{ msg: string; tag: string } | null>(null)
  const toastTimer = useRef<NodeJS.Timeout | null>(null)
  const [signalData, setSignalData] = useState<{ posts: { caption: string; media_type: string | null; likes: number; comments: number; saves: number; posted_at: string }[] } | null>(null)
  const [signalLoading, setSignalLoading] = useState(false)
  const addInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string, tag = 'Info') => {
    setToast({ msg, tag })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3400)
  }


  async function loadArtists() {
    const { data } = await supabase.from('artist_profiles').select('*')
    if (data && data.length > 0) {
      setArtists(data as ArtistProfile[])
      // Backfill missing profile pics from Instagram (lightweight handle lookup)
      ;(data as ArtistProfile[]).forEach(async (a) => {
        if (a.profile_pic_url) return
        const handle = (a.handle || a.name).replace(/^@/, '').trim()
        if (!handle) return
        try {
          const r = await fetch(`/api/instagram/profile-pic?handle=${encodeURIComponent(handle)}`)
          if (!r.ok) return
          const d = await r.json()
          if (d?.profile_pic_url) {
            const updated = { ...a, profile_pic_url: d.profile_pic_url }
            setArtists(prev => prev.map(x => x.name === a.name ? updated : x))
            await supabase.from('artist_profiles').update({ profile_pic_url: d.profile_pic_url }).eq('name', a.name)
          }
        } catch { /* ignore */ }
      })
    }
  }

  async function saveArtist(artist: ArtistProfile) {
    await supabase.from('artist_profiles').upsert(artist, { onConflict: 'name' })
    // New artist data — invalidate trend/caption cache so it regenerates fresh
    aiCache.invalidate(NS)
  }

  async function removeArtistFromDb(name: string) {
    await supabase.from('artist_profiles').delete().eq('name', name)
    // Artist removed — invalidate trend/caption cache so it regenerates fresh
    aiCache.invalidate(NS)
  }

  useEffect(() => {
    loadArtists()
    // Only hit Claude if cache is cold — avoids token spend on every navigation
    const cache = readCache()
    if (!cache.trends || (cache.trends as Trend[]).length === 0) {
      loadTrends().then(loaded => {
        if (loaded.length > 0) setTimeout(() => loadTrendCaptions(loaded), 800)
      })
    }
    // Don't auto-generate captions on mount — wait for the user to attach media
    // or type context and click GENERATE, so the output feels reactive to their input
  }, [])

  useEffect(() => {
    if (addingArtist) setTimeout(() => addInputRef.current?.focus(), 50)
  }, [addingArtist])

  const getArtistNames = () => artists.map(a => a.name)

  async function scanArtist(name: string, manualCaptionList?: string[], resolvedHandle?: string) {
    const existing = artists.find(a => a.name.toLowerCase() === name.toLowerCase())
    if (!manualCaptionList && existing?.last_scanned) {
      const daysAgo = daysSince(existing.last_scanned)
      if (daysAgo < 30) {
        showToast(`${name} · scanned ${daysAgo} days ago. Refresh available in ${30 - daysAgo} days.`, 'Cooldown')
        return
      }
    }

    // Handle resolution — search IG for candidates before scanning, so "Bicep" → feelmybicep works
    // Skip if we already have a resolved handle (from picker) or manual captions
    if (!manualCaptionList && !resolvedHandle) {
      try {
        setScanningArtist(name)
        setScanStage('Finding Instagram account...')
        const searchRes = await fetch('/api/artist-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: name }),
        })
        const searchData = await searchRes.json()
        if (searchData.success && searchData.candidates?.length > 0) {
          if (searchData.auto_resolve && searchData.top) {
            // Clear winner — proceed automatically using resolved handle
            return scanArtist(name, undefined, searchData.top.username)
          } else {
            // Show picker — user confirms which account
            setScanningArtist(null)
            setScanStage(null)
            setResolveOriginalQuery(name)
            setResolveCandidates(searchData.candidates)
            return
          }
        }
        // Fall through on search failure — let scan attempt with raw name
      } catch {
        // Ignore and continue to scan
      }
    }

    setScanningArtist(name)
    setScanStage('Connecting to Instagram...')

    // Progress theatre — timed stages that reflect what's actually happening
    const stages = manualCaptionList
      ? ['Analysing captions...', 'Building voice profile...', 'Generating report...']
      : ['Scraping recent posts...', 'Analysing visual aesthetic...', 'Reading engagement patterns...', 'Mapping voice + tone...', 'Building Content Intelligence Report...']
    let stageIdx = 0
    const stageInterval = setInterval(() => {
      stageIdx++
      if (stageIdx < stages.length) setScanStage(stages[stageIdx])
    }, manualCaptionList ? 3000 : 4000)

    try {
      const body: Record<string, unknown> = { name }
      if (manualCaptionList) body.manualCaptions = manualCaptionList
      if (resolvedHandle) body.handle = resolvedHandle
      const res = await fetch('/api/artist-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      clearInterval(stageInterval)
      const data = await res.json()
      if (!data.success) {
        if (data.canPaste) {
          setScanningArtist(null)
          setScanStage(null)
          setPastingFor(name)
          setPastedCaptions('')
          return
        }
        throw new Error(data.error)
      }
      setScanStage('Signal Scan complete')
      const artist = data.profile as ArtistProfile
      setArtists(prev => {
        const filtered = prev.filter(a => a.name.toLowerCase() !== name.toLowerCase())
        return [...filtered, artist]
      })
      saveArtist(artist)
      const hasDeepDive = !!artist.visual_aesthetic
      const sourceMsg = hasDeepDive
        ? `Content Intelligence Report ready · ${artist.post_count_analysed} posts, images + engagement analysed`
        : artist.data_source === 'manual'
        ? `${artist.post_count_analysed} captions analysed`
        : `${artist.post_count_analysed} posts analysed`
      showToast(`${name} · ${sourceMsg}`, 'Signal Scan')
      setPastingFor(null)
      setPastedCaptions('')
      // Artists section is now always visible
    } catch (err: any) {
      clearInterval(stageInterval)
      showToast(`Could not scan ${name} · ${err.message || 'try again'}`, 'Error')
    } finally {
      setScanningArtist(null)
      setTimeout(() => setScanStage(null), 2000)
    }
  }

  async function submitManualCaptions(name: string) {
    const lines = pastedCaptions
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 5)
    if (lines.length < 3) {
      showToast('Paste at least 3 captions, one per line', 'Error')
      return
    }
    await scanArtist(name, lines)
  }

  async function loadTrends(opts: { force?: boolean } = {}): Promise<Trend[]> {
    try {
      const res = await fetch('/api/trends' + (opts.force ? '?refresh=1' : ''))
      const data = await res.json()
      if (data.source === 'real_data' && Array.isArray(data.trends) && data.trends.length > 0) {
        setTrends(data.trends)
        const source = {
          postsAnalysed: data.postsAnalysed,
          artistsIncluded: data.artistsIncluded,
          cached_at: data.cached_at,
          from_cache: data.from_cache,
        }
        setTrendsSource(source)
        writeCache({ trends: data.trends, trendsSource: source })
        return data.trends
      }
      // No real data yet — trends stay empty, UI will prompt to scan artists
      setTrends([])
      setTrendsSource(null)
    } catch {
      // keep empty
    }
    return []
  }

  async function loadTrendCaptions(currentTrends?: Trend[]) {
    const trendList = currentTrends || trends
    if (trendList.length === 0) return
    setLoadingTrends(true)
    try {
      const topArtists = artists.filter(a => a.style_rules).slice(0, 3)
      const profilesText = topArtists.map(a => `${a.name}: ${a.style_rules}`).join('\n\n')
      const raw = await callClaude(
        `You write social media captions for an electronic music artist. Voice references:\n${profilesText || artists.map(a => a.name).join(', ')}\nAll lowercase, no hashtags, under 10 words. Respond ONLY with a JSON array.`,
        `Write one example caption for each format: ${trendList.map((t, i) => `${i + 1}. ${t.name}`).join(' | ')}. Return: ["cap1","cap2","cap3","cap4","cap5"]`,
        300
      )
      const caps = JSON.parse(raw.replace(/\`\`\`json|\`\`\`/g, '').trim())
      const map: Record<number, string> = {}
      trendList.forEach((t, i) => { if (caps[i]) map[t.id] = `"${caps[i]}"` })
      setTrendCaptions(map)
      writeCache({ trendCaptions: map })
    } catch {
      const fallback: Record<number, string> = {}
      trendList.forEach(t => { fallback[t.id] = 'caption loads with your profile' })
      setTrendCaptions(fallback)
    } finally {
      setLoadingTrends(false)
    }
  }

  async function syncInstagram() {
    setSyncingIG(true)
    setIgSyncResult(null)
    try {
      const res = await fetch('/api/instagram/sync', { method: 'POST' })
      const data = await res.json()
      if (!data.success) {
        setIgSyncResult({ error: data.error })
        // If no account connected or token expired, redirect to settings
        if (data.error && (data.error.includes('No Instagram') || data.error.includes('expired') || data.error.includes('Missing'))) {
          showToast('Redirecting to connect Instagram...', 'Signal Lab OS')
          setTimeout(() => { window.location.href = '/business/settings' }, 600)
        } else {
          showToast(data.error || 'Sync failed', 'Error')
        }
      } else {
        setIgSyncResult({ synced: data.synced })
        showToast(`${data.synced} posts synced · running deep dive...`, 'Signal Lab OS')
        // Auto-trigger deep dive on own account
        fetch('/api/instagram/deep-dive', { method: 'POST' })
          .then(r => r.json())
          .then(d => { if (d.success) showToast('Your voice profile is live', 'Deep dive') })
          .catch(() => {})
      }
    } catch (err: any) {
      setIgSyncResult({ error: err.message })
      showToast('Instagram sync failed', 'Error')
    } finally {
      setSyncingIG(false)
    }
  }

  async function generateCaptions(opts: { force?: boolean } = {}) {
    // Voice training is a soft prompt, not a hard gate. If the user has no own
    // profile but DOES have reference artists scanned, generation proceeds using
    // the lane voice. If they have nothing at all, we still need to nudge them
    // to scan first — otherwise the prompt has no anchor.
    const own = artists.find(a => a.name.toLowerCase() === artistName.toLowerCase())
    const hasReferenceVoices = artists.some(a => a.style_rules)
    if (!opts.force && !own?.style_rules && !hasReferenceVoices) {
      setVoiceModalOpen(true)
      return
    }
    setGeneratingCaptions(true)
    setCaptionError('')
    try {
      // Build rich profiles with deep dive data
      const profilesText = artists
        .filter(a => a.style_rules)
        .map(a => {
          const parts = [`${a.name} (${a.handle || 'unknown'}, ${(a.follower_count || 0).toLocaleString()} followers):`]
          parts.push(`Voice rules: ${a.style_rules}`)
          if (a.visual_aesthetic) parts.push(`Visual aesthetic: ${a.visual_aesthetic.mood}. ${a.visual_aesthetic.signature_visual}`)
          if (a.content_performance) {
            parts.push(`Best performing: ${a.content_performance.best_type} format. ${a.content_performance.peak_content}`)
            if (a.content_performance.engagement_rate) parts.push(`Engagement rate: ${a.content_performance.engagement_rate}`)
          }
          if (a.brand_positioning) parts.push(`Brand: ${a.brand_positioning}`)
          if (a.content_strategy_notes) parts.push(`Strategy insight: ${a.content_strategy_notes}`)
          return parts.join('\n')
        })
        .join('\n\n---\n\n')

      // Build lane stats summary
      const laneAvgLower = Math.round(artists.reduce((s, a) => s + a.lowercase_pct, 0) / (artists.length || 1))
      const laneAvgShort = Math.round(artists.reduce((s, a) => s + a.short_caption_pct, 0) / (artists.length || 1))
      const laneAvgNoHash = Math.round(artists.reduce((s, a) => s + a.no_hashtags_pct, 0) / (artists.length || 1))
      const laneStats = `LANE DATA (from ${artists.length} profiled artists, ${artists.reduce((s, a) => s + (a.post_count_analysed || 0), 0)} posts analysed):
— ${laneAvgLower}% use lowercase, ${laneAvgShort}% keep captions under 10 words, ${laneAvgNoHash}% skip hashtags
— Voice alignment: ${calcVoiceAlignment(artists).value} (${calcVoiceAlignment(artists).score}%)
— Tone register: ${calcToneRegister(artists).value}`

      // Fetch real gig + release data to prevent hallucination
      let gigContext = ''
      try {
        const nowLocal = new Date()
        const in60 = new Date(nowLocal); in60.setDate(nowLocal.getDate() + 60)
        const [gigsRes, releasesRes] = await Promise.allSettled([
          fetch('/api/gigs').then(r => r.json()),
          fetch('/api/releases').then(r => r.json()),
        ])
        const upcomingGigs = (gigsRes.status === 'fulfilled' ? gigsRes.value.gigs || [] : [])
          .filter((g: { date: string; status: string }) => {
            const d = new Date(g.date)
            return d >= nowLocal && d <= in60 && g.status !== 'cancelled'
          })
          .map((g: { date: string; title: string; venue: string; location: string }) =>
            `${new Date(g.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: ${g.venue}, ${g.location} — ${g.title}`
          )
        const upcomingReleases = (releasesRes.status === 'fulfilled' ? releasesRes.value.releases || [] : [])
          .filter((r: { release_date: string }) => {
            const d = new Date(r.release_date)
            return d >= nowLocal && d <= in60
          })
          .map((r: { release_date: string; title: string; type: string; label: string }) =>
            `${new Date(r.release_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: "${r.title}" ${r.type}${r.label ? ` on ${r.label}` : ''}`
          )
        const allEvents = [...upcomingGigs, ...upcomingReleases]
        gigContext = allEvents.length > 0
          ? `\nREAL UPCOMING EVENTS (use these if context mentions shows/releases — use NO other dates or locations):\n${allEvents.join('\n')}`
          : `\nNO UPCOMING EVENTS IN DB — if context mentions a show or release, write the caption without inventing any location, venue, city, or date.`
      } catch {
        gigContext = `\nNO UPCOMING EVENTS IN DB — if context mentions a show or release, write the caption without inventing any location, venue, city, or date.`
      }

      // --- Build artist-specific voice directive from real deep dive data ---
      // This is the #1 fix for generic captions — every rule is pulled from THEIR profile,
      // not a blanket assumption that worked for one reference artist.
      // If the user hasn't trained their own voice yet, fall back to the lane average
      // from their reference artists so we never generate from a 0-default.
      const ownLower = own?.lowercase_pct ?? laneAvgLower
      const ownShort = own?.short_caption_pct ?? laneAvgShort
      const ownRules = own?.style_rules || ''
      const rulesLower = ownRules.toLowerCase()

      // Detect explicit ALL-CAPS convention from style_rules text (Bicep pattern)
      const isAllCaps = /all caps|uppercase|capital letters/.test(rulesLower) && !/lowercase/.test(rulesLower)

      // Casing directive — profile-driven, specific percentage target
      let casingDirective: string
      if (isAllCaps) {
        casingDirective = `CASING — ${artistName} writes in ALL CAPS as a defining typographic signature. Every caption MUST be written entirely in uppercase. This is a non-negotiable voice marker.`
      } else if (ownLower >= 70) {
        casingDirective = `CASING — ${artistName} writes ${ownLower}% of captions entirely in lowercase. Default to all-lowercase. Capitals only for proper venue names or critical acronyms (e.g. "WHP", "Phonox"). Never use title case or sentence-start capitals.`
      } else if (ownLower >= 40) {
        casingDirective = `CASING — ${artistName} writes ${ownLower}% of captions in lowercase, the rest in sentence case. Lean lowercase for intimate/reflective moments, sentence case for announcements. Match the emotional register of the context.`
      } else if (ownLower >= 15) {
        casingDirective = `CASING — ${artistName} uses lowercase ${ownLower}% of the time — a minority register reserved for intimate, private-thought moments. Default to sentence case with normal capitalisation. Only switch to all-lowercase when the caption is deeply personal or quiet (e.g. grief, vulnerability, late-night reflection).`
      } else {
        casingDirective = `CASING — ${artistName} writes in sentence case with normal capitalisation. Only ${ownLower}% of their real captions use all-lowercase. Do NOT default to lowercase — that is not their voice. Write like a human writing a message: capital at the start of sentences, capital for names and places.`
      }

      // Length directive — profile-driven from real short_caption_pct
      let lengthDirective: string
      if (ownShort >= 50) {
        lengthDirective = `LENGTH — ${artistName}'s feed is ${ownShort}% short captions (under 10 words). Default to short bursts. Longer reflective captions are reserved for milestones and post-show emotional recaps only.`
      } else if (ownShort >= 25) {
        lengthDirective = `LENGTH — ${artistName} alternates between short bursts (${ownShort}% of captions) and longer reflective paragraphs. Never write medium-length filler — always go short OR long, never in between.`
      } else {
        lengthDirective = `LENGTH — ${artistName} tends toward longer reflective captions. Only ${ownShort}% of their captions are short. Favour 2–5 sentence reflections that name specific collaborators, venues, or moments.`
      }

      // Voice rules block — use their own style_rules verbatim
      const voiceDirective = ownRules
        ? `VOICE — these are ${artistName}'s own style rules derived from their real posts. Follow them literally:\n"${ownRules}"`
        : `VOICE — no style rules on file for ${artistName}. Match the deep dive profiles above conservatively.`

      // Reasoning casing should match the artist's casing preference so it feels consistent
      const reasoningCasing = isAllCaps
        ? 'WRITTEN IN ALL CAPS TO MATCH THE ARTIST VOICE'
        : ownLower >= 40
          ? 'written in lowercase to match the artist voice'
          : 'written in sentence case with normal capitalisation'

      const raw = await callClaude(
        `You write social media captions for ${artistName}, an ${artistCountry} electronic music artist.
${memberContext ? `\n${memberContext}\n` : ''}

${laneStats}

DEEP DIVE PROFILES — real data from scanning their Instagram (captions + images + engagement):
${profilesText || artists.map(a => a.name).join(', ')}
${gigContext}

── ARTIST-SPECIFIC VOICE (this is ${artistName}, not the lane average) ──
${casingDirective}

${lengthDirective}

${voiceDirective}

── UNIVERSAL RULES ──
— No hashtags on Instagram and X. TikTok: max 2 genre-specific tags only
— No exclamation marks
— Emojis: only if the artist's style rules above mention them; otherwise skip. Never hype emojis (🔥🚀💥)
— Never literally describe or explain the photo or video — instead READ the image (if one is attached) and write a caption that EMOTIONALLY FITS what you see: mood, light, energy, setting, atmosphere. The caption should feel connected to the image without narrating it.
— CRITICAL — NEVER FABRICATE (#1 product rule): NEVER invent, guess, or add ANY of the following unless they appear verbatim in the user's Context field or the REAL UPCOMING EVENTS list: location names, city names, venue names, dates, label names, release dates, catalogue numbers, collaborator names, track names, BPMs, genres. If the user wrote "visions ft sarah nimmo" — use ONLY that. Do not add a label, a date, a city, or anything else. When in doubt, leave it out.
— On-brand = sounds natural, slightly complete sentence, stays close to the artist's established voice. Conversational = fragment, unresolved — no closure, no CTA, feels like overheard thought. Minimal = shortest possible — minimum viable thought, often 2-3 words
— Score each variant 800–2500 based on the REAL engagement patterns from the deep dive data above

REASONING RULES — each "reasoning" field MUST:
1. Reference a SPECIFIC artist from the profiles above by name (e.g. "Matches Overmono's fragment style")
2. Cite a REAL data point (e.g. "milestone carousels in this lane average 2.1K saves")
3. Explain WHY this specific format triggers saves/engagement based on the deep dive data
4. Be 2-3 sentences max, ${reasoningCasing}, no fluff

${SKILLS_CAPTION_GEN}

OUTPUT FORMAT — CRITICAL:
You MUST respond with ONLY a single raw JSON object. No preamble, no explanation, no "Here are...", no markdown fences, no commentary before or after. Your entire response must start with { and end with }. Do not describe the image. Do not acknowledge the request. Just the JSON.`,
        `${mediaUrls.length > 0 ? `[Images/video frames attached above — read them for mood, light, energy. Do NOT describe them literally in the captions.]\n\n` : ''}Context: ${context.trim() || `(no context provided${mediaUrls.length > 0 ? ' — let what you see in the attached media drive the mood' : ` — write an open, ambient caption that fits the media type "${media}" and the artist voice, no specific event references`})`}\nPlatform: ${platform}\nMedia type: ${media}\n\nReturn ONLY this JSON structure, nothing else:\n{"safe":{"text":"...","reasoning":"...","score":1400},"loose":{"text":"...","reasoning":"...","score":1600},"raw":{"text":"...","reasoning":"...","score":1200}}`,
        900,
        mediaUrls,
      )
      // Robust JSON extraction — handles prose wrappers, markdown fences, etc.
      let jsonStr = raw.replace(/```json|```/g, '').trim()
      // If response starts with prose, find the first { and last }
      const firstBrace = jsonStr.indexOf('{')
      const lastBrace = jsonStr.lastIndexOf('}')
      if (firstBrace > 0 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
      }
      let d: any
      try {
        d = JSON.parse(jsonStr)
      } catch (parseErr) {
        console.error('[captions] raw response:', raw)
        throw new Error(`Claude returned non-JSON (starts: "${raw.slice(0, 60)}...")`)
      }
      setCaptions(d)
      writeCache({ captions: d })
    } catch (err: any) {
      setCaptionError(`Generation failed: ${err.message}`)
      setCaptions(null) // clear stale cards so user sees the error clearly
      showToast('Caption generation failed', 'Error')
    } finally {
      setGeneratingCaptions(false)
    }
  }

  async function scheduleToBuffer(text: string, selectedPlatform: string, media?: string[], scheduledAt?: string) {
    if (!text) { showToast('No caption to schedule', 'Error'); return }
    const channelMap: Record<string, string> = {
      'Instagram': 'instagram',
      'TikTok': 'tiktok',
      'X / Twitter': 'threads',
    }
    const channel = channelMap[selectedPlatform] || 'instagram'
    try {
      const result = await gatedSend<Record<string, unknown>, { posts?: Array<{ id?: string }>; error?: unknown }>({
        endpoint: '/api/buffer',
        skipServerPreview: true,
        previewBody: { text, channels: [channel], post_format: postFormat, ...(media?.length && { media_urls: media }), ...(scheduledAt && { scheduled_at: scheduledAt }) },
        buildConfig: () => ({
          kind: 'post',
          summary: scheduledAt
            ? `Schedule to ${selectedPlatform} · ${new Date(scheduledAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
            : `Queue on ${selectedPlatform} (Buffer)`,
          to: `@${channel}`,
          platform: channel,
          text,
          media,
          meta: [
            { label: 'Format', value: postFormat },
            { label: 'When', value: scheduledAt ? new Date(scheduledAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Next Buffer slot' },
          ],
        }),
      })
      if (!result.confirmed) {
        if (result.error) showToast('Buffer: ' + result.error, 'Error')
        return
      }
      if (result.data?.error) throw new Error(JSON.stringify(result.data.error))
      showToast(scheduledAt ? `Scheduled for ${new Date(scheduledAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Queued in Buffer for ' + selectedPlatform, 'Scheduled')
    } catch (err: any) {
      showToast('Buffer: ' + err.message, 'Error')
    }
  }

  // Smart "next best slot" — applies the IG posting times research from memory
  // (UK electronic music). Returns ISO local YYYY-MM-DD + HH:mm strings.
  function suggestNextBestSlot(selectedPlatform: string, format: string): { date: string; time: string } {
    const now = new Date()
    const isInstagram = /instagram/i.test(selectedPlatform)
    const isTikTok = /tiktok/i.test(selectedPlatform)
    const isReel = /reel|video/i.test(format)
    const isCarousel = /carousel/i.test(format)

    // Define the target slots per type (24h, local time)
    // Electronic music UK research:
    //   Reels      → Thu/Sat 19:00
    //   Carousels  → Tue/Wed 19:00
    //   Posts      → Tue/Wed/Thu 20:00
    //   Default    → next 19:00
    function pickHour(): number {
      if (isReel) return 19
      if (isCarousel) return 19
      return 20
    }
    function pickAllowedDays(): number[] {
      // 0=Sun ... 6=Sat
      if (isReel) return [4, 6] // Thu, Sat
      if (isCarousel) return [2, 3] // Tue, Wed
      return [2, 3, 4] // Tue, Wed, Thu
    }

    const allowed = pickAllowedDays()
    const targetHour = pickHour()
    const candidate = new Date(now)
    candidate.setSeconds(0, 0)
    candidate.setHours(targetHour, 0)

    // Walk forward day by day until we hit an allowed day AND the slot is still in the future
    for (let i = 0; i < 14; i++) {
      const day = candidate.getDay()
      const inFuture = candidate.getTime() > now.getTime() + 5 * 60 * 1000 // 5min buffer
      if (allowed.includes(day) && inFuture) break
      candidate.setDate(candidate.getDate() + 1)
      candidate.setHours(targetHour, 0, 0, 0)
    }

    const yyyy = candidate.getFullYear()
    const mm = String(candidate.getMonth() + 1).padStart(2, '0')
    const dd = String(candidate.getDate()).padStart(2, '0')
    const hh = String(candidate.getHours()).padStart(2, '0')
    const mi = String(candidate.getMinutes()).padStart(2, '0')
    return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` }
  }

  // Schedule a post for later — writes a real row to posts so the
  // publish-due cron picks it up and publishes at the right moment.
  // Status starts as 'scheduled' (awaiting calendar approval). The cron only
  // publishes rows with status='approved'.
  async function scheduleForLater(text: string, selectedPlatform: string, media: string[], scheduledAt: string) {
    if (!text) { showToast('No caption to schedule', 'Error'); return }
    if (new Date(scheduledAt).getTime() <= Date.now()) { showToast('Pick a future time', 'Error'); return }
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: selectedPlatform,
          caption: text,
          format: postFormat,
          scheduled_at: scheduledAt,
          status: 'scheduled',
          media_url: media[0] || null,
          // Carousel: send full array when 2+ items, picked up by publish route
          media_urls: media.length >= 2 ? media : null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Schedule failed')
      const when = new Date(scheduledAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      showToast(`Queued for ${when}`, 'Scheduled')
    } catch (err: any) {
      showToast(`Schedule failed: ${err.message}`, 'Error')
      throw err
    }
  }

  // Direct publish — no Buffer. If the platform isn't connected, route the
  // user to settings instead of silently sending to a third-party queue.
  async function publish(text: string, selectedPlatform: string, media?: string[]) {
    if (!text) { showToast('No caption to publish', 'Error'); return }
    if (!hasDirectConnection(selectedPlatform)) {
      showToast(`Connect ${selectedPlatform} in Settings first`, 'Not connected')
      return
    }
    setPublishing(true)
    await publishDirect(text, selectedPlatform, media)
    setPublishing(false)
  }

  async function loadSignalData() {
    setSignalLoading(true)
    try {
      const { data } = await supabase
        .from('scheduled_posts')
        .select('caption, media_type, likes, comments, saves, posted_at')
        .not('likes', 'is', null)
        .order('posted_at', { ascending: false })
        .limit(200)
      setSignalData({ posts: data || [] })
    } catch { } finally { setSignalLoading(false) }
  }

  useEffect(() => { loadSignalData() }, [])

  // Direct publish via Signal Lab OS connected accounts (no third-party)
  async function publishDirect(text: string, selectedPlatform: string, media?: string[]) {
    if (!text) { showToast('No caption to publish', 'Error'); return }

    const platformMap: Record<string, string> = {
      'Instagram': 'instagram',
      'X / Twitter': 'twitter',
      'TikTok': 'tiktok',
    }
    const platform = platformMap[selectedPlatform]
    if (!platform) { showToast('Platform not supported yet', 'Error'); return }

    const mediaUrl = media?.[0] || null
    const body: Record<string, unknown> = { caption: text, post_format: postFormat }
    if (platform === 'instagram' && mediaUrl) body.image_url = mediaUrl
    if (platform === 'tiktok' && mediaUrl) body.video_url = mediaUrl
    if (platform === 'twitter') body.text = text

    try {
      const result = await gatedSend<Record<string, unknown>, { error?: string }>({
        endpoint: `/api/social/${platform}/post`,
        previewBody: body,
        skipServerPreview: true,
        buildConfig: () => ({
          kind: 'post',
          summary: `Publish to ${selectedPlatform}`,
          platform: selectedPlatform,
          text,
          media: mediaUrl ? [mediaUrl] : [],
        }),
      })
      if (!result.confirmed) return
      if (result.error) throw new Error(result.error)

      await supabase.from('scheduled_posts').insert({
        platform,
        caption: text,
        media_urls: mediaUrl ? [mediaUrl] : [],
        posted_at: new Date().toISOString(),
        status: 'posted',
      })

      showToast('Published to ' + selectedPlatform, 'Posted')
      // Clear the persisted composer draft after a successful publish
      try { localStorage.removeItem(CONTEXT_DRAFT_KEY) } catch {}
    } catch (err: any) {
      showToast(err.message, 'Error')
    }
  }

  async function generateFullWeek() {
    setGeneratingWeek(true)
    try {
      const profilesText = artists
        .filter(a => a.style_rules)
        .map(a => `${a.name}: ${a.style_rules}`)
        .join('\n\n')

      // Pull in gigs + releases happening this week or next 30 days for context
      const nowLondon = new Date(new Date().toLocaleString('en-US', { timeZone: getUserTimezone() }))
      const in30 = new Date(nowLondon); in30.setDate(nowLondon.getDate() + 30)

      const [gigsRes, releasesRes] = await Promise.allSettled([
        fetch('/api/gigs').then(r => r.json()),
        fetch('/api/releases').then(r => r.json()),
      ])
      const upcomingGigs = (gigsRes.status === 'fulfilled' ? gigsRes.value.gigs || [] : [])
        .filter((g: { date: string; status: string; title: string; venue: string; location: string }) => {
          const d = new Date(g.date)
          return d >= nowLondon && d <= in30 && g.status !== 'cancelled'
        })
        .map((g: { date: string; title: string; venue: string; location: string }) =>
          `${new Date(g.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: playing ${g.venue}, ${g.location} (${g.title})`
        )
      const upcomingReleases = (releasesRes.status === 'fulfilled' ? releasesRes.value.releases || [] : [])
        .filter((r: { release_date: string }) => {
          const d = new Date(r.release_date)
          return d >= nowLondon && d <= in30
        })
        .map((r: { release_date: string; title: string; type: string; label: string }) =>
          `${new Date(r.release_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: "${r.title}" ${r.type} out${r.label ? ` on ${r.label}` : ''}`
        )

      const calendarContext = [...upcomingGigs, ...upcomingReleases].join('\n')

      const raw = await callClaude(
        'You are a social media strategist for electronic music artists. Respond ONLY with a valid JSON array, no markdown.',
        `Generate a 5-post week for ${artistName}, an ${artistCountry} electronic music artist.
${memberContext ? `\n${memberContext}\n` : ''}
Voice references:
${profilesText || artists.map(a => a.name).join(', ')}
${calendarContext ? `\nCalendar this week / next 30 days:\n${calendarContext}\n\nWeave these naturally into the week — don't announce them directly, treat them as context the captions can feel around (anticipation before a show, reflection after, quiet excitement before a release). Not every post needs to reference them.` : ''}
Rules: all lowercase, no hashtags (Instagram/X), no exclamation marks, no emojis, never explain the photo, feels like a private thought not a caption. Vary the emotional register across the week.

Return JSON array only: [{"day":"Mon","platform":"Instagram","caption":"..."},{"day":"Tue","platform":"Instagram","caption":"..."},{"day":"Wed","platform":"TikTok","caption":"..."},{"day":"Thu","platform":"Instagram","caption":"..."},{"day":"Fri","platform":"Instagram","caption":"..."}]`,
        900
      )

      const posts: { day: string; platform: string; caption: string }[] = JSON.parse(raw.replace(/```json|```/g, '').trim())
      setWeekPreview(posts)
      showToast('Week ready · review before saving', 'Broadcast Lab')
    } catch (err: any) {
      showToast(`Failed: ${err.message}`, 'Error')
    } finally {
      setGeneratingWeek(false)
    }
  }

  async function regenSinglePost(idx: number) {
    if (!weekPreview) return
    setRegenIdx(idx)
    const post = weekPreview[idx]
    const profilesText = artists.filter(a => a.style_rules).map(a => `${a.name}: ${a.style_rules}`).join('\n\n')
    try {
      const raw = await callClaude(
        'You are a social media strategist for electronic music artists. Respond ONLY with the caption text, no JSON, no explanation.',
        `Write one ${post.platform} caption for ${post.day} for ${artistName}.
${memberContext ? `\n${memberContext}\n` : ''}
Voice references:
${profilesText || artists.map(a => a.name).join(', ')}

Rules: all lowercase, no hashtags, no exclamation marks, no emojis, never explain the photo, feels like a private thought not a caption.`,
        300
      )
      const updated = [...weekPreview]
      updated[idx] = { ...post, caption: raw.trim() }
      setWeekPreview(updated)
    } catch (err: any) {
      showToast(`Failed to regenerate: ${err.message}`, 'Error')
    } finally {
      setRegenIdx(null)
    }
  }

  async function saveWeekToCalendar() {
    if (!weekPreview) return
    setSavingWeek(true)
    try {
      const nowLondon = new Date(new Date().toLocaleString('en-US', { timeZone: getUserTimezone() }))
      const dayOfWeek = nowLondon.getDay()
      const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7
      const monday = new Date(nowLondon)
      monday.setDate(nowLondon.getDate() + daysUntilMonday)
      monday.setHours(12, 0, 0, 0)
      const dayOffset: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

      let saved = 0
      for (let i = 0; i < weekPreview.length; i++) {
        const post = weekPreview[i]
        const offset = dayOffset[post.day] ?? i
        const date = new Date(monday)
        date.setDate(monday.getDate() + offset)
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: post.platform || 'Instagram',
            caption: post.caption,
            format: 'post',
            scheduled_at: date.toISOString(),
            status: 'scheduled',
          }),
        })
        if (res.ok) saved++
      }
      setWeekPreview(null)
      showToast(`${saved} posts saved to calendar`, 'Done')
    } catch (err: any) {
      showToast(`Failed: ${err.message}`, 'Error')
    } finally {
      setSavingWeek(false)
    }
  }

  async function generateReelsOverlay() {
    const caption = captions?.[selectedVariant]?.text
    if (!caption && !context) { showToast('Add context or generate a caption first', 'Error'); return }
    setGeneratingOverlay(true)
    try {
      const profilesText = artists.filter(a => a.style_rules).map(a => `${a.name}: ${a.style_rules}`).join('\n\n')
      const raw = await callClaude(
        `You create on-screen text overlays for Instagram Reels and TikTok videos for electronic music artists.

STYLE: Kinetic typography — one word or short phrase appears at a time as the viewer watches. Each line is timed to land with impact.

RULES:
- All lowercase unless a specific word needs emphasis (then ALL CAPS for that one word)
- Maximum 5-7 lines. Each line is 1-4 words maximum
- Lines should build tension or tell a micro-story
- The sequence should hold attention and create a reason to rewatch
- Never generic ("check this out", "new music"). Every word earns its place
- Underground electronic music tone — cryptic > obvious, evocative > descriptive
- Think: text that makes someone screenshot or send to a friend

REFERENCE VOICE:
${profilesText || 'Underground electronic music artist — minimal, dark, evocative'}

Respond ONLY with valid JSON, no markdown.`,
        `Context: ${context || ''}\nCaption (for tone reference): ${caption || ''}\nPlatform: ${platform}\nFormat: Reel / short-form video\n\nGenerate on-screen text overlay lines. Return: {"lines":[{"text":"word or phrase","timing":"0-2s"},{"text":"next","timing":"2-4s"}],"style":"description of visual treatment e.g. centre-screen, fade in/out, white on dark"}`,
        400
      )
      const d = JSON.parse(raw.replace(/```json|```/g, '').trim())
      setReelsOverlay(d)
      showToast('Overlay generated', 'Broadcast Lab')
    } catch (err: any) {
      showToast('Overlay generation failed: ' + err.message, 'Error')
    } finally {
      setGeneratingOverlay(false)
    }
  }

  async function generateRepurpose() {
    const caption = captions?.[selectedVariant]?.text
    if (!caption && !context) { showToast('Add context or generate a caption first', 'Error'); return }
    setGeneratingRepurpose(true)
    try {
      const profilesText = artists.filter(a => a.style_rules).map(a => `${a.name}: ${a.style_rules}`).join('\n\n')
      const raw = await callClaude(
        `You repurpose content for electronic music artists across three formats. One input becomes three pieces of content — each native to its format.

VOICE:
${profilesText || 'Underground electronic music artist — minimal, dark, evocative'}

FORMAT RULES:
1. REEL SCRIPT (15-30s): Hook in first 0.5s. 3-part structure: hook → story → payoff. Include on-screen text cues and timing. No "hey guys" energy. Dark, cinematic, minimal.
2. CAROUSEL (5 slides): Slide 1 = scroll-stop hook. Slides 2-4 = substance (one idea per slide, short sentences). Slide 5 = payoff or quiet CTA. Underground aesthetic — no bullet-point-guru energy. Each slide is 1-2 short sentences max.
3. STATIC POST: One powerful caption — could be cryptic, reflective, or direct. 1-15 words. The kind that gets screenshotted.

RULES:
- All lowercase
- No exclamation marks, no emojis
- No engagement bait
- Each format should feel native, not adapted
- Underground electronic music tone throughout

Respond ONLY with valid JSON, no markdown.`,
        `Context: ${context || ''}\nExisting caption: ${caption || ''}\nPlatform: ${platform}\n\nRepurpose this into three formats. Return: {"reel_script":"full script with timing and text overlay cues","carousel_slides":["slide 1 text","slide 2","slide 3","slide 4","slide 5"],"static_post":"caption text"}`,
        800
      )
      const d = JSON.parse(raw.replace(/```json|```/g, '').trim())
      setRepurposed(d)
      showToast('Content repurposed into 3 formats', 'Broadcast Lab')
    } catch (err: any) {
      showToast('Repurpose failed: ' + err.message, 'Error')
    } finally {
      setGeneratingRepurpose(false)
    }
  }

  async function generateAdPlan(boostCaption?: string) {
    setGeneratingAdPlan(true)
    try {
      const budgetMap = { low: '£100-300/month', mid: '£300-800/month', high: '£800+/month' }
      const caption = boostCaption || captions?.[selectedVariant]?.text || ''

      let gigContext = ''
      try {
        const [gigsRes, releasesRes] = await Promise.allSettled([
          fetch('/api/gigs').then(r => r.json()),
          fetch('/api/releases').then(r => r.json()),
        ])
        const gigs = (gigsRes.status === 'fulfilled' ? gigsRes.value.gigs || [] : []).slice(0, 5)
        const releases = (releasesRes.status === 'fulfilled' ? releasesRes.value.releases || [] : []).slice(0, 3)
        if (gigs.length) gigContext += '\nUPCOMING GIGS:\n' + gigs.map((g: any) => `${g.date}: ${g.venue}, ${g.location}`).join('\n')
        if (releases.length) gigContext += '\nUPCOMING RELEASES:\n' + releases.map((r: any) => `${r.release_date}: "${r.title}" on ${r.label || 'TBC'}`).join('\n')
      } catch {}

      const raw = await callClaude(
        `You are a paid advertising strategist for underground electronic music artists. You build ad campaigns that feel organic — never salesy.

${SKILL_ADS_MANAGER}

Respond ONLY with valid JSON, no markdown.`,
        `Artist: ${artistName}
Campaign type: ${adCampaignType}
Budget tier: ${budgetMap[adBudget]}
${caption ? `Caption: "${caption}"` : ''}
${context ? `Context: ${context}` : ''}
Content format: ${postFormat} (${media})
${mediaUrls.length > 0 ? `Media attached: ${mediaUrls.length} file(s) — plan ad creative around this existing content` : 'No media attached — recommend what content to create for the ad'}
Platform selected: ${platform}
${gigContext}

Generate a complete ad plan tailored to this specific content and format. Return:
{"campaign_type":"${adCampaignType}","platforms":[{"name":"platform","budget_split":"percentage","why":"reason"}],"audiences":[{"layer":"Warm/Expansion/Cold","targeting":"specific targeting","size":"estimated reach"}],"creative":["creative recommendation 1","2","3"],"schedule":"timeline with phases","budget_breakdown":"how to split the spend","red_flags":["what to watch for"],"green_flags":["signals to scale"]}`,
        900
      )
      const d = JSON.parse(raw.replace(/```json|```/g, '').trim())
      setAdPlan(d)
      showToast('Ad plan generated', 'Broadcast Lab')
    } catch (err: any) {
      showToast('Ad plan failed: ' + err.message, 'Error')
    } finally {
      setGeneratingAdPlan(false)
    }
  }

  function freshnessLabel(iso?: string): string {
    if (!iso) return ''
    const ageMs = Date.now() - new Date(iso).getTime()
    const mins = Math.round(ageMs / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.round(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.round(hrs / 24)
    return `${days}d ago`
  }

  async function refreshTrendsManually() {
    setRefreshingTrends(true)
    setLoadingTrends(true)
    try {
      const loaded = await loadTrends({ force: true })
      if (loaded.length > 0) await loadTrendCaptions(loaded)
      showToast('Trends refreshed', 'Trends')
    } catch {
      showToast('Refresh failed', 'Error')
    } finally {
      setRefreshingTrends(false)
      setLoadingTrends(false)
    }
  }

  function useTrend(trendContext: string) {
    setContext(trendContext)
    setTimeout(generateCaptions, 300)
    showToast('Trend applied · generating captions', 'Broadcast Lab')
  }

  function formatScore(score: number) {
    return score >= 1000 ? `${(score / 1000).toFixed(1)}k` : `${score}`
  }

  const variantKeys: ('safe' | 'loose' | 'raw')[] = ['safe', 'loose', 'raw']
  const variantLabels: Record<string, string> = { safe: 'On-brand', loose: 'Conversational', raw: 'Minimal' }

  async function copyToClipboard(text: string, variantName: string) {
    try {
      await navigator.clipboard.writeText(text)
      showToast(`${variantName} caption copied`, 'Copied')
    } catch {
      showToast('Copy failed', 'Error')
    }
  }


  // ── Derive artist groupings ──
  const ownArtist = artists.find(a => a.name.toLowerCase() === artistName.toLowerCase())
  const refArtists = artists.filter(a => a !== ownArtist)
  const featuredRefs = refArtists.slice(0, 4)
  const otherRefs = refArtists.slice(4)

  function getArtistFindings(a: ArtistProfile): string[] {
    const f: string[] = []
    // Lead with the most interesting / differentiating insights
    if (a.content_performance?.peak_content) f.push(a.content_performance.peak_content)
    if (a.visual_aesthetic?.mood) f.push(`Visual mood: ${a.visual_aesthetic.mood}`)
    if (a.content_performance?.best_type) f.push(`${a.content_performance.best_type} is their strongest format`)
    if (a.visual_aesthetic?.signature_visual) f.push(a.visual_aesthetic.signature_visual)
    if (a.content_performance?.engagement_rate) f.push(`${a.content_performance.engagement_rate} engagement rate`)
    if (a.content_performance?.posting_frequency) f.push(`Posts ${a.content_performance.posting_frequency}`)
    if (a.content_performance?.best_subject) f.push(`Top subject: ${a.content_performance.best_subject}`)
    if (a.visual_aesthetic?.palette) f.push(`Palette: ${a.visual_aesthetic.palette}`)
    if (a.brand_positioning) f.push(a.brand_positioning.length > 80 ? a.brand_positioning.slice(0, 77) + '…' : a.brand_positioning)
    if (a.lowercase_pct > 65) f.push(`${a.lowercase_pct}% lowercase — raw, detached register`)
    if (a.no_hashtags_pct > 60) f.push(`Skips hashtags ${a.no_hashtags_pct}% of the time`)
    return f.slice(0, 4)
  }

  // Scrolling preview content — real data when available, capability hints when not
  const captionPreview = captions
    ? [captions.safe.text, captions.loose.text, captions.raw.text].filter(Boolean)
    : ['generate captions in your voice', '3 variants scored by predicted reach', 'one-click publish to any platform', 'reels overlays and repurpose to 3 formats']

  const trendPreview = trends.length > 0
    ? trends.map(t => `${t.name} — ${t.fit}% lane fit${t.hot ? ' · HOT' : ''}`)
    : ['trends derived from real engagement data', 'lane-specific content patterns', 'auto-generated captions for each trend']

  const va = artists.length >= 2 ? calcVoiceAlignment(artists) : null
  const totalPosts = artists.reduce((s, a) => s + (a.post_count_analysed || 0), 0)

  return (
    <div className="min-h-screen bg-[#050505] text-[#f2f2f2] font-mono flex flex-col">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .marquee-track { display: flex; white-space: nowrap; animation: marquee 30s linear infinite; }
        .marquee-track:hover { animation-play-state: paused; }
      ` }} />

      <SignalLabHeader right={
        !scanningArtist && !pastingFor && (
          !addingArtist ? (
            <button onClick={() => setAddingArtist(true)} className="flex items-center gap-1.5 text-[12px] tracking-[.14em] uppercase text-[#c0bdb5] hover:text-[#ff2a1a] transition-colors font-mono">
              <span className="text-sm leading-none">+</span> Signal Scan
            </button>
          ) : (
            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
              <input ref={addInputRef} value={newArtistName} onChange={e => setNewArtistName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newArtistName.trim()) { scanArtist(newArtistName.trim()); setNewArtistName(''); setAddingArtist(false) }
                  if (e.key === 'Escape') { setAddingArtist(false); setNewArtistName('') }
                }}
                placeholder="Artist name or @handle"
                className="bg-[#1d1d1d] border border-[#ff2a1a] text-[#f2f2f2] font-mono text-[11px] px-3 py-1.5 outline-none placeholder-[#8a8782] w-[220px]" />
              <button onClick={() => { setAddingArtist(false); setNewArtistName('') }} className="text-[11px] text-[#c0bdb5] hover:text-[#f2f2f2] font-mono">Esc</button>
            </div>
          )
        )
      } />

      <div className="flex flex-col gap-4 p-6">

      {/* ── SLIM COMPOSER — top of page, just the input + buttons, no cards ── */}
      <div className="bg-[#0e0e0e] border border-[#ff2a1a]/25 px-5 py-4 sticky top-0 z-30 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[12px] tracking-[.22em] uppercase text-[#ff2a1a]">Artist Voice</div>
          {!ownArtist?.style_rules && artists.some(a => a.style_rules) && (
            <button onClick={syncInstagram} disabled={syncingIG}
              className="text-[11px] tracking-[.16em] uppercase text-[#c0bdb5] hover:text-[#ff2a1a] transition-colors disabled:opacity-40 flex items-center gap-1.5">
              {syncingIG && <div className="w-1.5 h-1.5 border border-current border-t-transparent rounded-full animate-spin" />}
              {syncingIG ? 'Syncing your voice…' : 'Sync your Instagram for personalised captions →'}
            </button>
          )}
        </div>
        {/* Row 1: input + media select + generate + post */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <input value={context} onChange={e => setContext(e.target.value)} placeholder="What happened... show, studio, flight, release"
              onKeyDown={e => { if (e.key === 'Enter') { generateCaptions() } }}
              className="w-full bg-[#1d1d1d] border border-white/7 text-[#f2f2f2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#ff2a1a] transition-colors placeholder-[#8a8782]" />
          </div>
          <select value={media} onChange={e => setMedia(e.target.value)} className="bg-[#1d1d1d] border border-white/7 text-[#f2f2f2] font-mono text-[12px] px-2 py-2.5 outline-none focus:border-[#ff2a1a] transition-colors w-[140px]">
            {['Crowd clip','Show photo','Behind decks','Studio photo','Travel','No media'].map(m => <option key={m}>{m}</option>)}
          </select>
          <button onClick={() => { generateCaptions() }} disabled={generatingCaptions}
            className="text-[12px] tracking-[.16em] uppercase border border-[#ff2a1a] text-[#ff2a1a] px-4 py-2.5 hover:bg-[#ff2a1a] hover:text-[#050505] transition-colors disabled:opacity-40 flex items-center gap-2 whitespace-nowrap">
            {generatingCaptions && <div className="w-2 h-2 border border-[#ff2a1a] border-t-transparent rounded-none animate-spin" />}
            {generatingCaptions ? 'Generating...' : 'Generate →'}
          </button>
          <button
            onClick={() => {
              if (!context.trim()) { showToast('Type a caption first', 'Error'); return }
              if (mediaUrls.length === 0) { showToast('Attach media first', 'Error'); return }
              setScheduleMode(false)
              setPreviewModal({ text: context.trim(), platform, media: mediaUrls, format: postFormat })
            }}
            title="Preview before posting"
            className="text-[12px] tracking-[.16em] uppercase bg-[#ff2a1a] text-[#050505] px-5 py-2.5 hover:bg-[#ff5040] transition-colors flex items-center gap-2 whitespace-nowrap">
            Post →
          </button>
        </div>
        {/* Row 2: format pills + attach + platform pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['post','carousel','story','reel'] as const).map(f => (
            <button key={f} onClick={() => setPostFormat(f)}
              className={`text-[11px] font-medium tracking-[.12em] uppercase px-3 py-1 border transition-colors ${postFormat===f ? 'border-[#ff2a1a] text-[#ff2a1a]' : 'border-white/10 text-[#c0bdb5] hover:border-white/20'}`}>
              {f}
            </button>
          ))}
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button onClick={() => setMediaPickerOpen(true)}
            className="text-[11px] font-medium tracking-[.12em] uppercase border border-white/10 text-[#c0bdb5] px-3 py-1 hover:border-[#ff2a1a] hover:text-[#ff2a1a] transition-colors flex items-center gap-1.5">
            {mediaUrls.length > 0 ? (
              <><div className="w-4 h-4 bg-[#1d1d1d] border border-white/10 overflow-hidden flex-shrink-0"><img src={mediaUrls[0]} className="w-full h-full object-cover" alt="" /></div>{mediaUrls.length} attached</>
            ) : 'Attach media'}
          </button>
          {mediaUrls.length > 0 && (
            <button onClick={() => setMediaUrls([])} className="text-[11px] text-[#c0bdb5] hover:text-red-400 transition-colors">×</button>
          )}
          <div className="w-px h-4 bg-white/10 mx-1" />
          {['Instagram','TikTok','X / Twitter'].map(p => (
            <button key={p} onClick={() => setPlatform(p)}
              className={`text-[11px] font-medium tracking-[.12em] uppercase px-3 py-1 border transition-colors ${platform===p?'border-[#ff2a1a] text-[#ff2a1a]':'border-white/10 text-[#c0bdb5] hover:border-white/20'}`}>
              {p}
              {hasDirectConnection(p) && <span className="ml-1 inline-block w-1 h-1 rounded-none bg-[#f2f2f2] align-middle" />}
            </button>
          ))}
        </div>

        {/* Caption variants render inline below the artist row (single source of truth — no popover) */}
      </div>

      {/* ── YOUR ARTIST — compact single-row profile ── */}
      {ownArtist ? (
        <div className="bg-[#0e0e0e] border border-white/7 p-4">
          <div className="flex items-start gap-4">
            {/* LEFT: avatar + name + voice + visual */}
            <div className="flex items-start gap-4 flex-1 min-w-0">
              {ownArtist.profile_pic_url ? (
                <img src={proxied(ownArtist.profile_pic_url)} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} className="w-10 h-10 rounded-none object-cover border-2 border-[#ff2a1a]/40 flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-none bg-[#ff2a1a]/10 border-2 border-[#ff2a1a]/40 flex items-center justify-center text-sm text-[#ff2a1a] flex-shrink-0">{ownArtist.name.charAt(0)}</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium tracking-tight text-[#f2f2f2]">{ownArtist.name}</div>
                <div className="text-[11px] text-[#c0bdb5] mb-3">
                  {ownArtist.handle}
                  {ownArtist.follower_count ? ` · ${ownArtist.follower_count > 1000 ? `${Math.round(ownArtist.follower_count/1000)}K` : ownArtist.follower_count} followers` : ''}
                  {ownArtist.genre ? ` · ${ownArtist.genre}` : ''}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="border-l border-[#ff2a1a]/25 pl-2.5">
                    <div className="text-[11px] font-medium tracking-[.16em] uppercase text-[#ff2a1a] mb-1">Voice</div>
                    {ownArtist.style_rules ? (
                      <div className="text-[11px] leading-[1.5] text-[#d4d0c7] line-clamp-2">{ownArtist.style_rules}</div>
                    ) : (
                      <div className="text-[11px] text-[#c0bdb5] italic">Sync Instagram to build voice profile</div>
                    )}
                  </div>
                  <div className="border-l border-[#ff2a1a]/25 pl-2.5">
                    <div className="text-[11px] font-medium tracking-[.16em] uppercase text-[#ff2a1a] mb-1">Visual</div>
                    {ownArtist.visual_aesthetic ? (
                      <div className="text-[11px] leading-[1.5] text-[#d4d0c7] line-clamp-2">{ownArtist.visual_aesthetic.mood}</div>
                    ) : (
                      <div className="text-[11px] text-[#c0bdb5] italic">Deep dive scan needed</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {/* RIGHT: stats row + performance underneath — right-aligned column */}
            <div className="flex-shrink-0 flex flex-col items-end gap-3">
              <div className="flex items-center gap-5">
                <div className="text-center">
                  <div className="text-[15px] font-medium text-[#f2f2f2]">{ownArtist.content_performance?.engagement_rate || '—'}</div>
                  <div className="text-[11px] font-medium tracking-[.12em] uppercase text-[#c0bdb5]">Engagement</div>
                </div>
                <div className="text-center">
                  <div className="text-[15px] font-medium text-[#f2f2f2]">{ownArtist.content_performance?.best_type || '—'}</div>
                  <div className="text-[11px] font-medium tracking-[.12em] uppercase text-[#c0bdb5]">Best format</div>
                </div>
                <div className="text-center">
                  <div className="text-[15px] font-medium text-[#f2f2f2]">{ownArtist.follower_count ? (ownArtist.follower_count >= 1000 ? `${(ownArtist.follower_count / 1000).toFixed(1).replace(/\.0$/, '')}K` : ownArtist.follower_count) : '—'}</div>
                  <div className="text-[11px] font-medium tracking-[.12em] uppercase text-[#c0bdb5]">Followers</div>
                </div>
                {va && va.score > 0 && (
                  <div className="text-center pl-3 border-l border-white/8">
                    <div className="text-[22px] font-medium text-[#ff2a1a] leading-none">{va.score}%</div>
                    <div className="text-[11px] font-medium tracking-[.12em] uppercase text-[#c0bdb5] mt-1">Voice</div>
                  </div>
                )}
              </div>
              {/* Performance aligned directly under the stats */}
              <div className="text-right border-t border-white/8 pt-2 w-full">
                <div className="text-[11px] font-medium tracking-[.16em] uppercase text-[#ff2a1a] mb-1">Performance</div>
                {ownArtist.content_performance ? (
                  <div className="text-[11px] leading-[1.5] text-[#d4d0c7]">
                    <span className="text-[#f2f2f2] font-medium">{ownArtist.content_performance.best_type}</span> strongest · {ownArtist.content_performance.posting_frequency || ''}
                  </div>
                ) : (
                  <div className="text-[11px] text-[#c0bdb5] italic">Post data needed</div>
                )}
              </div>
            </div>
          </div>
          {(ownArtist.brand_positioning || ownArtist.content_strategy_notes) && (
            <div className="mt-2 pt-2 border-t border-white/5 text-[12px] leading-[1.5] text-[#c0bdb5] line-clamp-1">
              {ownArtist.brand_positioning}{ownArtist.content_strategy_notes ? ` · ${ownArtist.content_strategy_notes}` : ''}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[#0e0e0e] border border-[#ff2a1a]/20 p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12px] tracking-[.22em] uppercase text-[#ff2a1a] mb-1">Your profile</div>
              <div className="text-[13px] text-[#a5a29a]">Sync your Instagram to build your deep dive profile</div>
            </div>
            <div className="flex gap-2">
              <button onClick={syncInstagram} disabled={syncingIG}
                className="text-[12px] tracking-[.16em] uppercase bg-[#ff2a1a] text-[#050505] px-5 py-2.5 hover:bg-[#ff5040] transition-colors disabled:opacity-40 flex items-center gap-2">
                {syncingIG && <div className="w-2 h-2 border border-[#050505] border-t-transparent rounded-none animate-spin" />}
                {syncingIG ? 'Syncing...' : 'Sync Instagram'}
              </button>
              <button onClick={() => {
                const name = window.prompt('Enter your artist name or @handle to scan manually:', artistName || '')
                if (name && name.trim()) scanArtist(name.trim())
              }}
                className="text-[12px] tracking-[.16em] uppercase border border-white/13 text-[#a5a29a] px-4 py-2.5 hover:border-[#ff2a1a] hover:text-[#ff2a1a] transition-colors">
                Scan manually
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REFERENCE ARTISTS — compact cards ── */}
      {featuredRefs.length > 0 && (
        <div className={`grid gap-3 ${featuredRefs.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>
          {featuredRefs.map(artist => (
            <div key={artist.name} className="bg-[#0e0e0e] border border-white/7 p-5 relative group">
              <button onClick={() => {
                if (!window.confirm(`Remove ${artist.name} from reference artists?`)) return
                setArtists(prev => prev.filter(a => a.name !== artist.name))
                removeArtistFromDb(artist.name)
                showToast(`${artist.name} removed`, 'Research')
              }}
                className="absolute top-2 right-2 text-white/15 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none">×</button>
              <div className="flex items-center gap-3 mb-3">
                {artist.profile_pic_url ? (
                  <img src={proxied(artist.profile_pic_url)} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} className="w-10 h-10 rounded-none object-cover border border-[#ff2a1a]/25 flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-none bg-[#ff2a1a]/10 border border-[#ff2a1a]/25 flex items-center justify-center text-sm text-[#ff2a1a] flex-shrink-0">{artist.name.charAt(0)}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] tracking-[.04em] text-[#f2f2f2]">{artist.name}</div>
                  <div className="text-[11px] text-[#c0bdb5]">{artist.handle}{artist.follower_count ? ` · ${artist.follower_count > 1000 ? `${Math.round(artist.follower_count/1000)}K` : artist.follower_count}` : ''}</div>
                </div>
              </div>
              <div className="space-y-1.5 mb-3">
                {getArtistFindings(artist).slice(0, 4).map((finding, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px] leading-[1.5] text-[#a5a29a]">
                    <div className="w-1 h-1 rounded-none bg-[#ff2a1a]/40 mt-1.5 flex-shrink-0" />
                    <span className="line-clamp-2">{finding}</span>
                  </div>
                ))}
              </div>
              <div className="overflow-hidden relative h-5">
                <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-[#0e0e0e] to-transparent z-10" />
                <div className="absolute inset-y-0 right-0 w-3 bg-gradient-to-l from-[#0e0e0e] to-transparent z-10" />
                <div className="marquee-track" style={{ animationDuration: `${Math.max(12, artist.chips.length * 4)}s` }}>
                  {[...artist.chips, ...artist.chips].map((chip, i) => (
                    <span key={i} className={`text-[11px] font-medium tracking-[.08em] uppercase px-1.5 py-0.5 border mx-0.5 inline-block flex-shrink-0 ${artist.highlight_chips.includes(i % artist.chips.length) ? 'border-[#ff2a1a]/30 text-[#ff2a1a]' : 'border-white/8 text-[#c0bdb5]'}`}>{chip}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── OTHER SCANNED ARTISTS — clear names row ── */}
      {otherRefs.length > 0 && (
        <div className="bg-[#0e0e0e] border border-white/7 px-5 py-3 flex items-center gap-4 flex-wrap">
          <div className="text-[11px] font-medium tracking-[.14em] uppercase text-[#c0bdb5] flex-shrink-0">Also scanned</div>
          {otherRefs.map(a => (
            <div key={a.name} className="flex items-center gap-1.5 group">
              {a.profile_pic_url ? (
                <img src={proxied(a.profile_pic_url)} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} className="w-5 h-5 rounded-none object-cover border border-white/10" />
              ) : (
                <div className="w-5 h-5 rounded-none bg-[#ff2a1a]/8 border border-white/8 flex items-center justify-center text-[11px] font-medium text-[#ff2a1a]">{a.name.charAt(0)}</div>
              )}
              <span className="text-[11px] text-[#a5a29a]">{a.name}</span>
              <button onClick={() => { setArtists(prev => prev.filter(x => x.name !== a.name)); removeArtistFromDb(a.name) }}
                className="text-white/10 hover:text-red-400 opacity-0 group-hover:opacity-100 text-[11px] leading-none transition-opacity">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Scanning progress */}
      {scanningArtist && scanStage && (
        <div className="bg-[#0e0e0e] border border-[#ff2a1a]/30 p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#ff2a1a]/20"><div className="h-full bg-[#ff2a1a] animate-pulse" style={{ width: '100%' }} /></div>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-none border-2 border-[#ff2a1a]/40 flex items-center justify-center flex-shrink-0">
              <div className="w-5 h-5 border-2 border-[#ff2a1a] border-t-transparent rounded-none animate-spin" />
            </div>
            <div>
              <div className="text-[12px] tracking-[.18em] uppercase text-[#ff2a1a] mb-0.5">Signal Scan · {scanningArtist}</div>
              <div className="text-[13px] text-[#f2f2f2] font-light">{scanStage}</div>
            </div>
          </div>
        </div>
      )}

      {/* Handle resolution picker — shown when an artist name has multiple IG matches */}
      {resolveCandidates && resolveCandidates.length > 0 && (
        <div className="bg-[#0e0e0e] border border-[#ff2a1a]/30 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[12px] tracking-[.18em] uppercase text-[#ff2a1a] mb-0.5">Confirm Instagram account</div>
              <div className="text-[12px] text-[#c0bdb5]">Which "{resolveOriginalQuery}" do you mean?</div>
            </div>
            <button onClick={() => { setResolveCandidates(null); setResolveOriginalQuery('') }} className="text-[#a5a29a] hover:text-[#f2f2f2] text-sm leading-none">×</button>
          </div>
          <div className="space-y-2">
            {resolveCandidates.map(c => (
              <button
                key={c.username}
                onClick={() => {
                  const candidates = resolveCandidates
                  setResolveCandidates(null)
                  setResolveOriginalQuery('')
                  scanArtist(resolveOriginalQuery, undefined, c.username)
                }}
                disabled={c.is_private}
                className="w-full flex items-center gap-3 p-3 bg-[#1d1d1d] border border-white/7 hover:border-[#ff2a1a]/40 hover:bg-[#1f1d1a] transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {c.profile_pic_url ? (
                  <img src={proxied(c.profile_pic_url)} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} className="w-10 h-10 rounded-none object-cover border border-[#ff2a1a]/25 flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-none bg-[#ff2a1a]/10 border border-[#ff2a1a]/25 flex items-center justify-center text-sm text-[#ff2a1a] flex-shrink-0">{(c.full_name || c.username).charAt(0).toUpperCase()}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] text-[#f2f2f2] truncate">{c.full_name || c.username}</span>
                    {c.is_verified && <span className="text-[12px] text-[#ff2a1a]" title="Verified">✓</span>}
                    {c.is_private && <span className="text-[12px] text-[#a5a29a] uppercase tracking-[.12em]">private</span>}
                  </div>
                  <div className="text-[11px] text-[#c0bdb5]">
                    @{c.username}
                    {c.follower_count ? ` · ${c.follower_count >= 1_000_000 ? `${(c.follower_count / 1_000_000).toFixed(1)}M` : c.follower_count >= 1000 ? `${Math.round(c.follower_count / 1000)}K` : c.follower_count} followers` : ''}
                  </div>
                </div>
                <div className="text-[12px] tracking-[.14em] uppercase text-[#ff2a1a] opacity-0 group-hover:opacity-100">Scan →</div>
              </button>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
            <div className="text-[12px] text-[#a5a29a]">Not seeing the right one?</div>
            <button
              onClick={() => {
                const manual = window.prompt(`Enter the exact Instagram handle for ${resolveOriginalQuery} (no @):`, '')
                if (manual && manual.trim()) {
                  const q = resolveOriginalQuery
                  setResolveCandidates(null)
                  setResolveOriginalQuery('')
                  scanArtist(q, undefined, manual.trim().replace(/^@/, ''))
                }
              }}
              className="text-[12px] tracking-[.16em] uppercase border border-white/13 text-[#a5a29a] px-3 py-1.5 hover:border-[#ff2a1a] hover:text-[#ff2a1a] transition-colors"
            >
              Enter handle manually
            </button>
          </div>
        </div>
      )}

      {/* Paste captions modal */}
      {pastingFor && (
        <div className="bg-[#0e0e0e] border border-white/7 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[12px] tracking-[.1em] text-[#ff2a1a] uppercase">Paste captions · {pastingFor}</div>
            <button onClick={() => { setPastingFor(null); setPastedCaptions('') }} className="text-[#a5a29a] hover:text-[#f2f2f2] text-sm leading-none">×</button>
          </div>
          <textarea autoFocus value={pastedCaptions} onChange={e => setPastedCaptions(e.target.value)} placeholder={"caption one\ncaption two\ncaption three"} rows={4}
            className="w-full bg-[#1d1d1d] border border-white/10 text-[#f2f2f2] font-mono text-[11px] px-3 py-2 outline-none placeholder-[#8a8782] resize-none focus:border-[#ff2a1a]/50 mb-2" />
          <button onClick={() => submitManualCaptions(pastingFor)} disabled={!!scanningArtist}
            className="text-[12px] tracking-[.16em] uppercase bg-[#ff2a1a] text-[#050505] px-4 py-2 hover:bg-[#ff5040] disabled:opacity-50">
            {scanningArtist ? 'Analysing...' : 'Analyse'}
          </button>
        </div>
      )}

      {/* ── CAPTION GENERATOR — original location, cards reveal here after generate ── */}
      <div className="bg-[#0e0e0e] border border-white/7 overflow-hidden caption-panel">
        <button onClick={() => toggleSection('captions')} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors text-left">
          <div className="text-[12px] tracking-[.22em] uppercase text-[#ff2a1a] flex-shrink-0">Artist Voice</div>
          {!expandedSections.captions ? (
            <div className="flex-1 overflow-hidden relative h-4 mx-2">
              <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#0e0e0e] to-transparent z-10" />
              <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#0e0e0e] to-transparent z-10" />
              <div className="marquee-track">
                {[...captionPreview, ...captionPreview].map((item, i) => (
                  <span key={i} className="text-[12px] tracking-[.04em] text-[#c0bdb5] mx-6 italic">{item}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 h-px bg-white/10" />
          )}
          <span className="text-[#c0bdb5] text-xs flex-shrink-0">{expandedSections.captions ? '▾' : '▸'}</span>
        </button>
        {expandedSections.captions && <div className="px-5 pb-5">
        {/* Composer rows removed — duplicate of slim sticky composer at top of page. Results still render below. */}

        {/* Loading indicator */}
        {generatingCaptions && (
          <div className="flex items-center gap-2 text-[12px] tracking-[.1em] uppercase text-[#a5a29a] mt-4">
            <div className="w-1 h-1 rounded-none bg-[#ff2a1a] animate-pulse" /><div className="w-1 h-1 rounded-none bg-[#ff2a1a] animate-pulse" style={{animationDelay:'.2s'}} /><div className="w-1 h-1 rounded-none bg-[#ff2a1a] animate-pulse" style={{animationDelay:'.4s'}} />
            <span>Reading your tone profile...</span>
          </div>
        )}

        {/* Voice not trained yet — replace cards with a single CTA */}
        {!ownArtist?.style_rules && !generatingCaptions && (
          <div className="mt-4 border border-dashed border-white/10 bg-[#1d1d1d] px-5 py-6 text-center">
            <div className="text-[12px] tracking-[.16em] uppercase text-[#a5a29a] mb-2">Voice not trained</div>
            <div className="text-[12px] text-[#c0bdb5] mb-3 leading-relaxed">Captions will feel generic until your voice is profiled. Train it once, it sticks.</div>
            <button onClick={() => setVoiceModalOpen(true)}
              className="text-[12px] tracking-[.16em] uppercase border border-[#ff2a1a] text-[#ff2a1a] px-4 py-2 hover:bg-[#ff2a1a] hover:text-[#050505] transition-colors">
              Train your voice →
            </button>
          </div>
        )}

        {/* Caption variants — render inline as soon as generation starts so the user can compare in place */}
        {(captions || generatingCaptions) && (
        <div className="grid grid-cols-3 gap-3 mt-4">
          {variantKeys.map(key => {
            const v = captions?.[key]
            const label = variantLabels[key]
            const best = captions ? variantKeys.reduce((a, b) => (captions[a]?.score || 0) >= (captions[b]?.score || 0) ? a : b) : null
            const isBest = key === best
            return (
              <div key={key} onClick={() => setSelectedVariant(key)}
                className={`bg-[#1d1d1d] border p-4 cursor-pointer transition-all relative ${selectedVariant===key?'border-[#ff2a1a]':'border-white/7 hover:border-white/13'}`}>
                {generatingCaptions ? (
                  <div className="space-y-2">
                    <div className="h-3 w-20 bg-white/5 animate-pulse rounded" />
                    <div className="h-8 bg-white/5 animate-pulse rounded" />
                    <div className="h-3 w-full bg-white/3 animate-pulse rounded" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-medium tracking-[.16em] uppercase text-[#a5a29a]">{label}</span>
                      <div className="flex items-center gap-1.5">
                        {isBest && <span className="text-[11px] font-medium tracking-[.14em] uppercase text-[#ff2a1a] border border-[#ff2a1a]/30 px-1.5 py-0.5">Top pick</span>}
                        <span className="text-[13px] font-light text-[#ff2a1a]">{v?formatScore(v.score):''}</span>
                        <span className="text-[11px] text-[#c0bdb5]">reach</span>
                      </div>
                    </div>
                    <div className="text-[13px] tracking-[.03em] leading-relaxed text-[#f2f2f2] mb-3">{v?.text||''}</div>
                    {v?.reasoning && (
                      <div className="text-[12px] tracking-[.05em] text-[#a5a29a] leading-relaxed mb-3 italic">{v.reasoning}</div>
                    )}
                    <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                      <button onClick={e => { e.stopPropagation(); copyToClipboard(v?.text||'', label) }}
                        className="text-[11px] font-medium tracking-[.12em] uppercase text-[#a5a29a] hover:text-[#ff2a1a] transition-colors">
                        Copy
                      </button>
                      <button onClick={e=>{
                        e.stopPropagation()
                        if (mediaUrls.length === 0) { showToast('Attach media first', 'Error'); return }
                        setPreviewModal({ text: v?.text||'', platform, media: mediaUrls, format: postFormat })
                      }}
                        className="text-[11px] font-medium tracking-[.12em] uppercase text-[#ff2a1a]">
                        Schedule →
                      </button>
                      <a href={`/broadcast/ads?caption=${encodeURIComponent(v?.text||'')}`}
                        className="text-[11px] font-medium tracking-[.12em] uppercase text-[#c0bdb5] hover:text-[#ff2a1a] transition-colors"
                        onClick={e => e.stopPropagation()}>
                        Boost
                      </a>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
        )}
        {captionError && <div className="bg-red-900/20 border border-red-800/40 text-red-300 text-[12px] px-4 py-3 mt-3">{captionError}</div>}

        {/* Train-your-voice modal — pops when generate is clicked without a profiled voice */}
        {voiceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setVoiceModalOpen(false)}>
            <div onClick={e => e.stopPropagation()} className="bg-[#0e0e0e] border border-[#ff2a1a]/30 max-w-md w-full mx-4 p-6 relative">
              <button onClick={() => setVoiceModalOpen(false)} className="absolute top-3 right-4 text-[#c0bdb5] hover:text-[#f2f2f2] text-[18px] leading-none">×</button>
              <div className="text-[12px] tracking-[.22em] uppercase text-[#ff2a1a] mb-2">Train your voice first</div>
              <div className="text-[12px] text-[#c0bdb5] leading-relaxed mb-5">Captions need your real voice to land. Pick how to feed it. One minute, one time.</div>
              <div className="space-y-2">
                <button
                  onClick={() => { setVoiceModalOpen(false); syncInstagram() }}
                  disabled={syncingIG}
                  className="w-full text-left bg-[#1d1d1d] border border-white/10 hover:border-[#ff2a1a] p-3 transition-colors disabled:opacity-40">
                  <div className="text-[12px] tracking-[.16em] uppercase text-[#ff2a1a] mb-1">Sync Instagram</div>
                  <div className="text-[11px] text-[#c0bdb5] leading-relaxed">Pulls your recent posts and runs the deep dive. Fastest path if your IG is connected.</div>
                </button>
                <button
                  onClick={() => { setVoiceModalOpen(false); setPastingFor(artistName) }}
                  className="w-full text-left bg-[#1d1d1d] border border-white/10 hover:border-[#ff2a1a] p-3 transition-colors">
                  <div className="text-[12px] tracking-[.16em] uppercase text-[#ff2a1a] mb-1">Paste captions</div>
                  <div className="text-[11px] text-[#c0bdb5] leading-relaxed">Drop 5–10 of your real captions. Trains the voice in seconds.</div>
                </button>
                <button
                  onClick={() => { setVoiceModalOpen(false); generateCaptions({ force: true }) }}
                  className="w-full text-left bg-[#1d1d1d] border border-white/5 hover:border-white/20 p-3 transition-colors">
                  <div className="text-[12px] tracking-[.16em] uppercase text-[#a5a29a] mb-1">Generate anyway</div>
                  <div className="text-[11px] text-[#8a8782] leading-relaxed">Falls back to lane defaults. Will feel generic, use only as a one-off.</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* REELS TEXT OVERLAY + REPURPOSE ACTIONS */}
        {captions && ownArtist?.style_rules && (
          <div className="flex gap-2 mb-5">
            <button onClick={generateReelsOverlay} disabled={generatingOverlay}
              className="text-[12px] tracking-[.14em] uppercase border border-white/13 text-[#a5a29a] px-4 py-2 hover:border-[#ff2a1a] hover:text-[#ff2a1a] transition-colors disabled:opacity-40 flex items-center gap-2">
              {generatingOverlay && <div className="w-2 h-2 border border-current border-t-transparent rounded-none animate-spin" />}
              {generatingOverlay ? 'Generating...' : 'Reels text overlay'}
            </button>
            <button onClick={generateRepurpose} disabled={generatingRepurpose}
              className="text-[12px] tracking-[.14em] uppercase border border-white/13 text-[#a5a29a] px-4 py-2 hover:border-[#ff2a1a] hover:text-[#ff2a1a] transition-colors disabled:opacity-40 flex items-center gap-2">
              {generatingRepurpose && <div className="w-2 h-2 border border-current border-t-transparent rounded-none animate-spin" />}
              {generatingRepurpose ? 'Repurposing...' : 'Repurpose → 3 formats'}
            </button>
          </div>
        )}

        {/* REELS TEXT OVERLAY OUTPUT */}
        {reelsOverlay && (
          <div className="mb-5 bg-[#0e0e0e] border border-white/7 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[12px] tracking-[.22em] uppercase text-[#ff2a1a]">Reels text overlay · word by word</div>
              <button onClick={() => {
                const text = reelsOverlay.lines.map(l => `[${l.timing}] ${l.text}`).join('\n')
                navigator.clipboard.writeText(text).then(() => showToast('Overlay copied', 'Copied'))
              }} className="text-[12px] tracking-[.14em] uppercase text-[#a5a29a] hover:text-[#ff2a1a] transition-colors">Copy all</button>
            </div>
            <div className="flex flex-col gap-2 mb-4">
              {reelsOverlay.lines.map((line, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="text-[11px] tracking-[.1em] text-[#c0bdb5] w-12 flex-shrink-0 text-right">{line.timing}</div>
                  <div className="text-[14px] tracking-[.06em] text-[#f2f2f2] font-light">{line.text}</div>
                </div>
              ))}
            </div>
            <div className="text-[12px] text-[#c0bdb5] italic">{reelsOverlay.style}</div>
          </div>
        )}

        {/* REPURPOSE OUTPUT */}
        {repurposed && (
          <div className="mb-5 bg-[#0e0e0e] border border-white/7 p-5">
            <div className="flex items-center gap-2 mb-4 text-[12px] tracking-[.22em] uppercase text-[#ff2a1a]">
              Repurposed · 3 formats<div className="flex-1 h-px bg-white/10" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {/* Reel script */}
              <div className="bg-[#1d1d1d] border border-white/7 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[12px] tracking-[.18em] uppercase text-[#a5a29a]">Reel script</div>
                  <button onClick={() => navigator.clipboard.writeText(repurposed.reel_script).then(() => showToast('Reel script copied', 'Copied'))}
                    className="text-[12px] tracking-[.14em] uppercase text-[#a5a29a] hover:text-[#ff2a1a] transition-colors">Copy</button>
                </div>
                <div className="text-[11px] leading-relaxed text-[#f2f2f2] whitespace-pre-wrap">{repurposed.reel_script}</div>
              </div>
              {/* Carousel */}
              <div className="bg-[#1d1d1d] border border-white/7 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[12px] tracking-[.18em] uppercase text-[#a5a29a]">Carousel · {repurposed.carousel_slides.length} slides</div>
                  <button onClick={() => navigator.clipboard.writeText(repurposed.carousel_slides.map((s, i) => `[${i+1}] ${s}`).join('\n')).then(() => showToast('Carousel copied', 'Copied'))}
                    className="text-[12px] tracking-[.14em] uppercase text-[#a5a29a] hover:text-[#ff2a1a] transition-colors">Copy</button>
                </div>
                <div className="flex flex-col gap-2">
                  {repurposed.carousel_slides.map((slide, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-[12px] text-[#c0bdb5] flex-shrink-0 mt-0.5">{i+1}.</span>
                      <span className="text-[11px] leading-relaxed text-[#f2f2f2]">{slide}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Static post */}
              <div className="bg-[#1d1d1d] border border-white/7 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[12px] tracking-[.18em] uppercase text-[#a5a29a]">Static post</div>
                  <button onClick={() => navigator.clipboard.writeText(repurposed.static_post).then(() => showToast('Static post copied', 'Copied'))}
                    className="text-[12px] tracking-[.14em] uppercase text-[#a5a29a] hover:text-[#ff2a1a] transition-colors">Copy</button>
                </div>
                <div className="text-[13px] leading-relaxed text-[#f2f2f2] min-h-[60px] flex items-center">{repurposed.static_post}</div>
              </div>
            </div>
          </div>
        )}

      </div>}
      </div>

      {/* ── TREND ENGINE — scrolling intelligence preview ── */}
      <div className="bg-[#0e0e0e] border border-white/7 overflow-hidden">
        <button onClick={() => toggleSection('trends')} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors text-left">
          <div className="text-[12px] tracking-[.22em] uppercase text-[#ff2a1a] flex-shrink-0">Trend Engine</div>
          {!expandedSections.trends ? (
            <div className="flex-1 overflow-hidden relative h-4 mx-2">
              <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#0e0e0e] to-transparent z-10" />
              <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#0e0e0e] to-transparent z-10" />
              <div className="marquee-track">
                {[...trendPreview, ...trendPreview].map((item, i) => (
                  <span key={i} className="text-[12px] tracking-[.04em] text-[#c0bdb5] mx-6">{item}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 h-px bg-white/10" />
          )}
          <span className="text-[#c0bdb5] text-xs flex-shrink-0">{expandedSections.trends ? '▾' : '▸'}</span>
        </button>
        {expandedSections.trends && <div className="px-5 pb-5">
        {trendsSource ? (
          <div className="text-[12px] tracking-[.07em] text-[#f2f2f2] mb-5 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-none bg-[#f2f2f2]" />
              {trendsSource.postsAnalysed} real posts analysed · {trendsSource.artistsIncluded?.join(', ')}
            </div>
            {trendsSource.cached_at && (
              <div className="flex items-center gap-2 text-[#a5a29a]">
                <span className="text-[#3a3830]">·</span>
                <span>updated {freshnessLabel(trendsSource.cached_at)}</span>
                <button
                  onClick={refreshTrendsManually}
                  disabled={refreshingTrends}
                  className="text-[11px] tracking-[.16em] uppercase border border-white/13 text-[#a5a29a] px-2 py-0.5 hover:border-[#ff2a1a] hover:text-[#ff2a1a] transition-colors disabled:opacity-40"
                >
                  {refreshingTrends ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-[12px] tracking-[.07em] text-[#a5a29a] mb-5 italic">Based on real engagement data from your reference artists</div>
        )}
        {loadingTrends && (
          <div className="flex justify-center mb-4 py-6">
            <PulseLoader size="md" label="Reading your signals" />
          </div>
        )}
        {trends.length === 0 && !loadingTrends ? (
          <div className="border border-dashed border-white/13 p-8 text-center">
            <div className="text-[11px] tracking-[.1em] text-[#a5a29a] mb-2">No trend data yet</div>
            <div className="text-[12px] tracking-[.07em] text-[#c0bdb5]">Scan reference artists above. Trends are derived from their real engagement data.</div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {trends.map(trend => (
              <div key={trend.id} className={`bg-[#1d1d1d] border p-4 relative hover:bg-[#141310] transition-colors ${trend.hot ? 'border-[#ff2a1a]/30' : 'border-white/7'}`}>
                {trend.hot && <div className="absolute top-2.5 right-2.5 text-[11px] font-medium tracking-[.16em] text-[#ff2a1a] bg-[#ff2a1a]/10 px-1.5 py-0.5">HOT</div>}
                <div className="text-[12px] tracking-[.15em] uppercase text-[#a5a29a] mb-2">{trend.platform}</div>
                <div className="text-[11px] tracking-[.06em] mb-2 leading-snug">{trend.name}</div>
                <div className="text-[12px] text-[#a5a29a] leading-relaxed mb-3 italic min-h-[32px]">{trend.context}</div>
                {trend.evidence && (
                  <div className="text-[12px] text-[#f2f2f2] mb-2 flex items-start gap-1">
                    <div className="w-1 h-1 rounded-none bg-[#f2f2f2] mt-1 flex-shrink-0" />
                    {trend.evidence}
                  </div>
                )}
                {trend.posts_supporting != null && trendsSource?.postsAnalysed && (
                  <div className="text-[11px] tracking-[.08em] text-[#c0bdb5] mb-3">
                    Based on {trend.posts_supporting} of {trendsSource.postsAnalysed} posts
                  </div>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[12px] tracking-[.1em] text-[#a5a29a]">Lane fit</span>
                  <div className="flex-1 h-px bg-white/10 relative"><div className="absolute top-0 left-0 h-px bg-[#ff2a1a]" style={{width:`${trend.fit}%`}} /></div>
                  <span className="text-[12px] text-[#ff2a1a]">{trend.fit}%</span>
                </div>
                {trendCaptions[trend.id] && (
                  <div className="mb-3 pt-3 border-t border-white/7">
                    <div className="text-[11px] font-medium tracking-[.12em] uppercase text-[#c0bdb5] mb-1.5">Suggested caption</div>
                    <div className="text-[11px] text-[#a5a29a] leading-relaxed italic">{trendCaptions[trend.id]}</div>
                    <button onClick={() => navigator.clipboard.writeText(trendCaptions[trend.id]).then(() => showToast('Caption copied', 'Done'))}
                      className="mt-2 text-[11px] font-medium tracking-[.12em] uppercase text-[#c0bdb5] hover:text-[#a5a29a] transition-colors">
                      Copy →
                    </button>
                  </div>
                )}
                <button onClick={() => useTrend(trend.context)} className="w-full text-[12px] tracking-[.15em] uppercase border border-white/13 text-[#a5a29a] py-2 hover:border-[#ff2a1a] hover:text-[#ff2a1a] transition-colors">Use this trend →</button>
              </div>
            ))}
            <div className="bg-[#1d1d1d] border border-dashed border-white/13 flex flex-col items-center justify-center gap-2 min-h-[160px]">
              <button onClick={refreshTrendsManually} disabled={refreshingTrends} className="text-[12px] tracking-[.14em] uppercase border border-white/13 text-[#a5a29a] px-3 py-1.5 hover:border-[#ff2a1a] hover:text-[#ff2a1a] transition-colors disabled:opacity-40">{refreshingTrends ? 'Refreshing…' : 'Refresh trends'}</button>
            </div>
          </div>
        )}
        </div>}
      </div>

      {/* ── CAPTURE LIST — content suggestions from real engagement data ── */}
      <div className="bg-[#0e0e0e] border border-white/7 overflow-hidden">
        <button onClick={() => toggleSection('capture')} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors text-left">
          <div className="text-[12px] tracking-[.22em] uppercase text-[#ff2a1a] flex-shrink-0">Capture List</div>
          {!expandedSections.capture ? (
            <div className="flex-1 text-[12px] tracking-[.06em] text-[#c0bdb5] truncate">
              {captureSugg && captureSugg.capture_list.length > 0
                ? captureSugg.capture_list.slice(0, 3).map((c: any) => c.label).join(' · ')
                : 'What to film at the next gig, based on what\'s working'}
            </div>
          ) : (
            <div className="flex-1 h-px bg-white/10" />
          )}
          <span className="text-[#c0bdb5] text-xs flex-shrink-0">{expandedSections.capture ? '▾' : '▸'}</span>
        </button>
        {expandedSections.capture && <div className="px-5 pb-5">
          {loadingCapture && (
            <div className="flex justify-center py-6">
              <PulseLoader size="md" label="Reading your engagement data" />
            </div>
          )}
          {!loadingCapture && (!captureSugg || (captureSugg.capture_list.length === 0 && captureSugg.your_buckets.length === 0 && captureSugg.peer_buckets.length === 0)) && (
            <div className="border border-dashed border-white/13 p-8 text-center">
              <div className="text-[11px] tracking-[.1em] text-[#a5a29a] mb-2">No capture suggestions yet</div>
              <div className="text-[12px] tracking-[.07em] text-[#c0bdb5] mb-1">{captureSugg?.note || 'Connect Instagram and scan reference artists in Signal Lab to populate this.'}</div>
              <div className="text-[11px] tracking-[.06em] text-[#5a5852] mt-3 italic">Each suggestion needs at least 3 supporting posts. No guesses, ever.</div>
            </div>
          )}

          {!loadingCapture && captureSugg && captureSugg.capture_list.length > 0 && (
            <div className="mb-6">
              <div className="text-[12px] tracking-[.16em] uppercase text-[#ff2a1a] mb-3">◇ Capture this at your next gig</div>
              <div className="grid grid-cols-2 gap-3">
                {captureSugg.capture_list.map((item: any, i: number) => (
                  <div key={i} className="bg-[#1d1d1d] border border-[#ff2a1a]/30 border-l-2 border-l-[#ff2a1a] p-4">
                    <div className="text-[11px] tracking-[.06em] text-[#f2f2f2] mb-1.5 font-medium">{item.label}</div>
                    <div className="text-[12px] text-[#c0bdb5] leading-relaxed mb-2.5">{item.description}</div>
                    <div className="text-[12px] text-[#ff2a1a] mb-2 leading-relaxed">{item.reason}</div>
                    {item.top_permalinks.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-white/7">
                        <span className="text-[11px] tracking-[.1em] uppercase text-[#5a5852]">Evidence:</span>
                        {item.top_permalinks.map((url: string, j: number) => (
                          <a key={j} href={url} target="_blank" rel="noreferrer" className="text-[11px] tracking-[.06em] text-[#a5a29a] hover:text-[#ff2a1a] underline">
                            post {j + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loadingCapture && captureSugg && captureSugg.your_buckets.length > 0 && (
            <div className="mb-6">
              <div className="text-[12px] tracking-[.16em] uppercase text-[#c0bdb5] mb-3">What's working · for you</div>
              <div className="grid grid-cols-3 gap-3">
                {captureSugg.your_buckets.map((b: any) => (
                  <div key={b.id} className="bg-[#1d1d1d] border border-white/7 p-3">
                    <div className="text-[11px] text-[#f2f2f2] mb-1">{b.label}</div>
                    <div className="text-[12px] text-[#ff2a1a] mb-1.5">{b.multiple_vs_median}× your median</div>
                    <div className="text-[11px] text-[#5a5852]">{b.posts_supporting} of your posts</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loadingCapture && captureSugg && captureSugg.peer_buckets.length > 0 && (
            <div>
              <div className="text-[12px] tracking-[.16em] uppercase text-[#c0bdb5] mb-3">What's working · for your peers</div>
              <div className="grid grid-cols-3 gap-3">
                {captureSugg.peer_buckets.map((b: any) => (
                  <div key={b.id} className="bg-[#1d1d1d] border border-white/7 p-3">
                    <div className="text-[11px] text-[#f2f2f2] mb-1">{b.label}</div>
                    <div className="text-[12px] text-[#c0bdb5] mb-1.5 leading-snug">{b.observation}</div>
                    {b.source_artists && b.source_artists.length > 0 && (
                      <div className="text-[11px] text-[#5a5852] truncate" title={b.source_artists.join(', ')}>
                        {b.source_artists.slice(0, 2).join(', ')}{b.source_artists.length > 2 ? ` +${b.source_artists.length - 2}` : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="text-[10px] tracking-[.06em] text-[#5a5852] italic mt-2">Qualitative patterns from peer profiles. Numerical peer engagement coming in a later release.</div>
            </div>
          )}

          {!loadingCapture && captureSugg && (captureSugg.your_buckets.length > 0 || captureSugg.peer_buckets.length > 0) && (
            <div className="text-[11px] tracking-[.06em] text-[#5a5852] italic mt-4 pt-3 border-t border-white/7">
              Every suggestion is from real posts in your engagement data. Buckets with fewer than 3 supporting posts are hidden.
            </div>
          )}
        </div>}
      </div>

      {/* SIGNAL PANEL — avg engagement per format, save rate, best day, rising format */}
      {signalData && signalData.posts.length > 0 && (() => {
        const posts = signalData.posts
        const now = Date.now()
        const thirtyDays = 30 * 24 * 60 * 60 * 1000

        const recent = posts.filter(p => now - new Date(p.posted_at).getTime() < thirtyDays)
        const prior = posts.filter(p => {
          const age = now - new Date(p.posted_at).getTime()
          return age >= thirtyDays && age < thirtyDays * 2
        })

        const eng = (p: typeof posts[0]) => (p.likes || 0) + (p.comments || 0) + (p.saves || 0)
        const avg = (arr: typeof posts) => arr.length ? arr.reduce((s, p) => s + eng(p), 0) / arr.length : 0
        const recentAvg = avg(recent)
        const priorAvg = avg(prior)
        const trend = priorAvg > 0 ? Math.round(((recentAvg - priorAvg) / priorAvg) * 100) : null

        // Pretty-print format names — CAROUSEL_ALBUM → Carousel, VIDEO → Reel, IMAGE → Image
        const prettyFormat = (k: string): string => {
          const v = (k || '').toUpperCase()
          if (v === 'CAROUSEL_ALBUM' || v === 'CAROUSEL') return 'Carousel'
          if (v === 'VIDEO' || v === 'REELS' || v === 'REEL') return 'Reel'
          if (v === 'IMAGE' || v === 'PHOTO') return 'Image'
          return k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()
        }

        // Format stats: avg engagement per format, across all + recent window for trend arrow
        const groupAvg = (arr: typeof posts) => {
          const g: Record<string, number[]> = {}
          for (const p of arr) {
            const k = prettyFormat(p.media_type || 'Other')
            if (!g[k]) g[k] = []
            g[k].push(eng(p))
          }
          return Object.fromEntries(
            Object.entries(g).map(([k, vs]) => [k, vs.reduce((s, v) => s + v, 0) / vs.length])
          )
        }
        const allAvg = groupAvg(posts)
        const recentFmtAvg = groupAvg(recent)
        const priorFmtAvg = groupAvg(prior)

        const formatStats = Object.entries(allAvg)
          .map(([label, a]) => {
            const r = recentFmtAvg[label]
            const p = priorFmtAvg[label]
            const dir = (r != null && p != null && p > 0)
              ? (r > p * 1.1 ? 'up' : r < p * 0.9 ? 'down' : 'flat')
              : null
            return { label, avg: a, dir }
          })
          .sort((x, y) => y.avg - x.avg)
          .slice(0, 3)

        // Save rate — saves as % of reach across recent window (fallback: of engagement if no reach)
        const recentReach = recent.reduce((s, p) => s + ((p as any).reach || 0), 0)
        const recentSaves = recent.reduce((s, p) => s + (p.saves || 0), 0)
        const saveRate = recentReach > 0
          ? (recentSaves / recentReach) * 100
          : null

        // Best posting day — methodology rebuilt to be honest, not naive
        // - median (not mean) → outlier-resistant
        // - n≥4 minimum → no "best day" off 2 lucky posts
        // - variance check → flag hit-and-miss days even if median is high
        // - sample size shown in UI so user can judge confidence
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const dayGroups: Record<number, number[]> = {}
        for (const p of posts) {
          const d = new Date(p.posted_at).getDay()
          if (!dayGroups[d]) dayGroups[d] = []
          dayGroups[d].push(eng(p))
        }
        const median = (xs: number[]) => {
          const s = [...xs].sort((a, b) => a - b)
          const mid = Math.floor(s.length / 2)
          return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
        }
        const dayStats = Object.entries(dayGroups)
          .map(([d, scores]) => {
            const med = median(scores)
            const mean = scores.reduce((s, v) => s + v, 0) / scores.length
            // Coefficient of variation — high CV means inconsistent / hit-and-miss
            const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length
            const std = Math.sqrt(variance)
            const cv = mean > 0 ? std / mean : 0
            return {
              day: dayNames[parseInt(d)],
              median: med,
              mean,
              count: scores.length,
              cv, // > 0.6 = hit-and-miss
              hitAndMiss: cv > 0.6,
            }
          })
          .filter(s => s.count >= 4) // n≥4 minimum — no "best day" off 2 lucky posts
          .sort((a, b) => b.median - a.median)
        const bestDay = dayStats[0]

        // Top post — prefer one with caption, show format + clean caption
        const topPost = [...posts].sort((a, b) => eng(b) - eng(a))[0]
        const topCleanCaption = topPost?.caption
          ? topPost.caption.replace(/\s+/g, ' ').trim().slice(0, 50) + (topPost.caption.length > 50 ? '…' : '')
          : ''
        const topFormat = topPost ? prettyFormat(topPost.media_type || '') : ''

        return (
          <div className="mt-4 border border-white/8 bg-[#0a0908]">
            {/* Row 1: trend + formats */}
            <div className="px-5 py-3 flex items-center gap-6 flex-wrap border-b border-white/5">
              <div className="text-[11px] tracking-[.2em] uppercase text-[#ff2a1a] font-medium">Signal</div>
              {trend !== null && (
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-[15px] font-medium tracking-tight ${trend >= 0 ? 'text-[#ff2a1a]' : 'text-[#f2f2f2]/80'}`}>
                    {trend >= 0 ? '+' : ''}{trend}%
                  </span>
                  <span className="text-[11px] text-[#c0bdb5]">vs prior 30d</span>
                </div>
              )}
              {formatStats.length > 0 && (
                <div className="text-[11px] text-[#f2f2f2]/80 flex items-center gap-3">
                  {formatStats.map((f, i) => (
                    <span key={f.label} className="flex items-baseline gap-1">
                      <span className={i === 0 ? 'text-[#ff2a1a]' : 'text-[#c0bdb5]'}>{f.label}</span>
                      <span className="text-[#f2f2f2]/90">{Math.round(f.avg)}</span>
                      {f.dir === 'up' && <span className="text-[#ff2a1a] text-[11px]">↑</span>}
                      {f.dir === 'down' && <span className="text-[#a5a29a] text-[11px]">↓</span>}
                    </span>
                  ))}
                  <span className="text-[12px] text-[#8a8782] tracking-[.12em] uppercase">avg eng</span>
                </div>
              )}
            </div>
            {/* Row 2: save rate + best day + top post */}
            <div className="px-5 py-3 flex items-center gap-6 flex-wrap">
              {saveRate !== null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[13px] font-medium text-[#f2f2f2]">{saveRate.toFixed(1)}%</span>
                  <span className="text-[12px] text-[#c0bdb5] tracking-[.12em] uppercase">save rate</span>
                </div>
              )}
              {bestDay ? (
                <div className="flex items-baseline gap-1.5" title={`Median engagement ${Math.round(bestDay.median)} across ${bestDay.count} posts${bestDay.hitAndMiss ? ' — high variance, results inconsistent' : ''}`}>
                  <span className="text-[13px] font-medium text-[#f2f2f2]">{bestDay.day}</span>
                  <span className="text-[12px] text-[#c0bdb5] tracking-[.12em] uppercase">best day</span>
                  <span className="text-[11px] text-[#8a8782] tracking-[.1em]">n={bestDay.count} · med {Math.round(bestDay.median)}</span>
                  {bestDay.hitAndMiss && (
                    <span className="text-[11px] text-[#ff2a1a] tracking-[.12em] uppercase ml-1" title="Coefficient of variation > 0.6 — performance is inconsistent">hit-and-miss</span>
                  )}
                </div>
              ) : (
                <div className="flex items-baseline gap-1.5" title="Need at least 4 posts on a single day-of-week to call it">
                  <span className="text-[12px] text-[#8a8782] tracking-[.12em] uppercase">best day · insufficient data</span>
                </div>
              )}
              {topPost && (
                <div className="text-[11px] text-[#f2f2f2]/80 flex-1 min-w-0 truncate">
                  <span className="text-[12px] text-[#c0bdb5] tracking-[.12em] uppercase mr-2">top</span>
                  <span className="text-[#ff2a1a]">{eng(topPost)} eng</span>
                  {topFormat && <span className="text-[#8a8782] mx-1.5">·</span>}
                  {topFormat && <span className="text-[#c0bdb5]">{topFormat}</span>}
                  {topCleanCaption && <span className="text-[#8a8782] mx-1.5">·</span>}
                  {topCleanCaption && <span>{topCleanCaption}</span>}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* TOAST */}
      <MediaPicker
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={urls => { setMediaUrls(prev => [...prev, ...urls]); if (urls.length > 1) setPostFormat('carousel') }}
      />

      {/* PREVIEW + APPROVE MODAL — nothing posts without going through this */}
      {previewModal && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setPreviewModal(null)}>
          <div className="bg-[#0a0a0a] border border-[#ff2a1a]/40 max-w-[480px] w-full" onClick={e => e.stopPropagation()}>
            {/* header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
              <div className="text-[12px] tracking-[.22em] uppercase text-[#ff2a1a] font-bold">Preview · Approve · Post</div>
              <button onClick={() => setPreviewModal(null)} className="text-[#c0bdb5] hover:text-white text-sm">×</button>
            </div>

            {/* media preview */}
            {previewModal.media[0] && (
              <div className="bg-[#050505] border-b border-white/10 max-h-[280px] flex items-center justify-center overflow-hidden">
                {/\.(mp4|mov|webm)$/i.test(previewModal.media[0]) ? (
                  <video src={previewModal.media[0]} className="max-h-[280px] max-w-full" controls muted playsInline />
                ) : (
                  <img src={previewModal.media[0]} className="max-h-[280px] max-w-full object-contain" alt="" />
                )}
              </div>
            )}

            {/* caption + meta */}
            <div className="px-5 py-4 space-y-3">
              <div>
                <div className="text-[11px] tracking-[.22em] uppercase text-[#a5a29a] mb-1.5">Caption</div>
                <div className="text-[13px] text-[#f2f2f2] font-mono leading-relaxed whitespace-pre-wrap">{previewModal.text}</div>
              </div>
              <div className="flex gap-4 text-[11px] tracking-[.18em] uppercase">
                <div><span className="text-[#a5a29a]">Platform · </span><span className="text-[#ff2a1a] font-bold">{previewModal.platform}</span></div>
                <div><span className="text-[#a5a29a]">Format · </span><span className="text-[#f2f2f2] font-bold">{previewModal.format}</span></div>
              </div>

              {/* schedule picker */}
              {scheduleMode && (
                <div className="border-t border-white/10 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] tracking-[.22em] uppercase text-[#a5a29a]">Schedule for</div>
                    <div className="text-[11px] tracking-[.16em] uppercase text-[#ff2a1a]">◇ Suggested · best slot</div>
                  </div>
                  <div className="flex gap-2">
                    <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} min={new Date().toISOString().slice(0, 10)}
                      className="flex-1 bg-[#1d1d1d] border border-white/10 text-[#f2f2f2] font-mono text-[11px] px-3 py-2 outline-none focus:border-[#ff2a1a]" />
                    <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                      className="bg-[#1d1d1d] border border-white/10 text-[#f2f2f2] font-mono text-[11px] px-3 py-2 outline-none focus:border-[#ff2a1a]" />
                  </div>
                  <div className="text-[11px] text-[#a5a29a] leading-relaxed">
                    Auto-picked from your audience peak times. Adjust if needed. Review and approve in Calendar before it goes live.
                  </div>
                </div>
              )}
            </div>

            {/* actions */}
            <div className="border-t border-white/10 px-5 py-3 flex items-center gap-2">
              <button onClick={() => setPreviewModal(null)}
                className="text-[12px] tracking-[.16em] uppercase text-[#c0bdb5] hover:text-white px-3 py-2">
                ← Edit
              </button>
              <div className="flex-1" />
              {!scheduleMode ? (
                <>
                  <button onClick={() => {
                    // Pre-fill with smart "next best slot" from posting times research
                    const slot = suggestNextBestSlot(previewModal.platform, previewModal.format)
                    setScheduleDate(slot.date)
                    setScheduleTime(slot.time)
                    setScheduleMode(true)
                  }}
                    className="text-[12px] tracking-[.16em] uppercase border border-white/20 text-[#f2f2f2] hover:border-[#ff2a1a] hover:text-[#ff2a1a] px-4 py-2 transition-colors">
                    Schedule
                  </button>
                  <button onClick={async () => {
                    const m = previewModal
                    setPreviewModal(null)
                    await publish(m.text, m.platform, m.media)
                  }}
                    disabled={publishing}
                    className="text-[12px] tracking-[.16em] uppercase bg-[#ff2a1a] text-[#050505] hover:bg-[#ff5040] px-4 py-2 disabled:opacity-40">
                    {publishing ? 'Posting...' : 'Post Now →'}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setScheduleMode(false)}
                    className="text-[12px] tracking-[.16em] uppercase text-[#c0bdb5] hover:text-white px-3 py-2">
                    Cancel
                  </button>
                  <button onClick={async () => {
                    if (!scheduleDate || !scheduleTime) { showToast('Pick a date and time', 'Error'); return }
                    const isoLocal = `${scheduleDate}T${scheduleTime}:00`
                    const scheduledAt = new Date(isoLocal).toISOString()
                    if (new Date(scheduledAt) <= new Date()) { showToast('Schedule must be in the future', 'Error'); return }
                    const m = previewModal
                    try {
                      await scheduleForLater(m.text, m.platform, m.media, scheduledAt)
                      setPreviewModal(null)
                      setScheduleMode(false)
                    } catch { /* error toast already shown by scheduleForLater */ }
                  }}
                    className="text-[12px] tracking-[.16em] uppercase bg-[#ff2a1a] text-[#050505] hover:bg-[#ff5040] px-4 py-2">
                    Confirm Schedule → Calendar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-7 right-7 bg-[#0e0e0e]/96 border border-white/13 px-5 py-3.5 text-[11px] tracking-[.07em] text-[#f2f2f2] z-50 max-w-xs leading-relaxed backdrop-blur-md">
          <div className="text-[12px] tracking-[.2em] uppercase text-[#ff2a1a] mb-1">{toast.tag}</div>
          {toast.msg}
        </div>
      )}

      </div>{/* end inner p-8 */}
    </div>
  )
}
