'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { aiCache } from '@/lib/aiCache'
import { SignalLabHeader } from './SignalLabHeader'
import { MediaPicker } from '@/components/ui/MediaPicker'
import { SKILLS_CAPTION_GEN, SKILL_ADS_MANAGER } from '@/lib/skillPromptsClient'

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

async function callClaude(system: string, userPrompt: string, maxTokens = 600): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      system,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: userPrompt }],
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
      <div className="absolute top-0 left-0 h-px transition-all duration-1000" style={{ width: `${width}%`, background: teal ? '#2a6b5a' : '#b08d57' }} />
    </div>
  )
}

export function BroadcastLab() {
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
  const [platform, setPlatform] = useState('Instagram')
  const [context, setContext] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const title = params.get('title')
      const venue = params.get('venue')
      const location = params.get('location')
      const date = params.get('date')
      if (title && venue) {
        const dateStr = date ? new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : ''
        setContext(title + ' at ' + venue + ', ' + location + (dateStr ? ' — ' + dateStr : ''))
      }
    }
  }, [])
  const [media, setMedia] = useState('Crowd clip (video)')
  const [captions, setCaptions] = useState<Captions | null>((_cache.captions as Captions) || null)
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
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  const [activeTab, setActiveTab] = useState<'content' | 'ads'>('content')
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [refreshingInsights, setRefreshingInsights] = useState(false)
  const [trendsSource, setTrendsSource] = useState<{ postsAnalysed?: number; artistsIncluded?: string[] } | null>((_cache.trendsSource as any) || null)
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
  const [signalData, setSignalData] = useState<{ posts: { caption: string; format_type: string | null; engagement_score: number; posted_at: string }[] } | null>(null)
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
    if (!cache.captions) {
      setTimeout(() => generateCaptions(), 1200)
    }
  }, [])

  useEffect(() => {
    if (addingArtist) setTimeout(() => addInputRef.current?.focus(), 50)
  }, [addingArtist])

  const getArtistNames = () => artists.map(a => a.name)

  async function scanArtist(name: string, manualCaptionList?: string[]) {
    const existing = artists.find(a => a.name.toLowerCase() === name.toLowerCase())
    if (!manualCaptionList && existing?.last_scanned) {
      const daysAgo = daysSince(existing.last_scanned)
      if (daysAgo < 30) {
        showToast(`${name} — scanned ${daysAgo} days ago. Refresh available in ${30 - daysAgo} days.`, 'Cooldown')
        return
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
        ? `Content Intelligence Report ready — ${artist.post_count_analysed} posts, images + engagement analysed`
        : artist.data_source === 'manual'
        ? `${artist.post_count_analysed} captions analysed`
        : `${artist.post_count_analysed} posts analysed`
      showToast(`${name} — ${sourceMsg}`, 'Signal Scan')
      setPastingFor(null)
      setPastedCaptions('')
      // Auto-expand artists section to show the result
      setExpandedSections(prev => ({ ...prev, artists: true }))
    } catch (err: any) {
      clearInterval(stageInterval)
      showToast(`Could not scan ${name} — ${err.message || 'try again'}`, 'Error')
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
      showToast('Paste at least 3 captions — one per line', 'Error')
      return
    }
    await scanArtist(name, lines)
  }

  async function loadTrends(): Promise<Trend[]> {
    try {
      const res = await fetch('/api/trends')
      const data = await res.json()
      if (data.source === 'real_data' && Array.isArray(data.trends) && data.trends.length > 0) {
        setTrends(data.trends)
        setTrendsSource({ postsAnalysed: data.postsAnalysed, artistsIncluded: data.artistsIncluded })
        writeCache({ trends: data.trends, trendsSource: { postsAnalysed: data.postsAnalysed, artistsIncluded: data.artistsIncluded } })
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
        showToast(data.error || 'Sync failed', 'Error')
      } else {
        setIgSyncResult({ synced: data.synced })
        showToast(`${data.synced} posts synced — running deep dive...`, 'Signal Lab')
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

  async function generateCaptions() {
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

      const raw = await callClaude(
        `You write social media captions for ${artistName}, an ${artistCountry} electronic music artist.
${memberContext ? `\n${memberContext}\n` : ''}

${laneStats}

DEEP DIVE PROFILES — real data from scanning their Instagram (captions + images + engagement):
${profilesText || artists.map(a => a.name).join(', ')}
${gigContext}

YOUR RULES:
— All lowercase, always
— No hashtags on Instagram and X. TikTok: max 2 genre-specific tags only
— No exclamation marks, no emojis
— Never describe or explain the photo or video
— Feels like a private thought shared, not a caption written for an audience
— CRITICAL: NEVER invent or guess location names, city names, venue names, or dates. Only use real event data from the REAL UPCOMING EVENTS list above. If no matching event exists, write the caption without any location or date specifics.
— On-brand = sounds natural, slightly complete sentence, stays close to the artist's established voice. Conversational = fragment, unresolved — no closure, no CTA, feels like overheard thought. Minimal = shortest possible — minimum viable thought, often 2-3 words
— Score each variant 800–2500 based on the REAL engagement patterns from the deep dive data above

REASONING RULES — each "reasoning" field MUST:
1. Reference a SPECIFIC artist from the profiles above by name (e.g. "Matches Overmono's fragment style")
2. Cite a REAL data point (e.g. "lowercase posts in this lane average 2.1K saves")
3. Explain WHY this specific format triggers saves/engagement based on the deep dive data
4. Be 2-3 sentences max, written in lowercase, no fluff

${SKILLS_CAPTION_GEN}

Respond ONLY with valid JSON, no markdown.`,
        `Context: ${context}\nPlatform: ${platform}\nMedia: ${media}\nReturn: {"safe":{"text":"...","reasoning":"...","score":number},"loose":{"text":"...","reasoning":"...","score":number},"raw":{"text":"...","reasoning":"...","score":number}}`,
        700
      )
      const d = JSON.parse(raw.replace(/\`\`\`json|\`\`\`/g, '').trim())
      setCaptions(d)
      writeCache({ captions: d })
    } catch (err: any) {
      setCaptionError(`Generation failed: ${err.message}`)
      showToast('Caption generation failed', 'Error')
    } finally {
      setGeneratingCaptions(false)
    }
  }

  async function scheduleToBuffer(text: string, selectedPlatform: string, media?: string[]) {
    if (!text) { showToast('No caption to schedule', 'Error'); return }
    const channelMap: Record<string, string> = {
      'Instagram': 'instagram',
      'TikTok': 'tiktok',
      'X / Twitter': 'threads',
    }
    const channel = channelMap[selectedPlatform] || 'instagram'
    try {
      const res = await fetch('/api/buffer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, channels: [channel], post_format: postFormat, ...(media?.length && { media_urls: media }) }),
      })
      const data = await res.json()
      if (data.error) throw new Error(JSON.stringify(data.error))

      const bufferPostId = data.posts?.[0]?.id || null
      await supabase.from('scheduled_posts').insert({
        platform: selectedPlatform,
        caption: text,
        format: postFormat,
        scheduled_at: new Date().toISOString(),
        status: 'scheduled',
        buffer_post_id: bufferPostId,
      })

      showToast('Queued in Buffer for ' + selectedPlatform, 'Scheduled')
    } catch (err: any) {
      showToast('Buffer: ' + err.message, 'Error')
    }
  }

  // Smart publish — direct if connected, Buffer fallback if not
  async function publish(text: string, selectedPlatform: string, media?: string[]) {
    if (!text) { showToast('No caption to publish', 'Error'); return }
    setPublishing(true)
    if (hasDirectConnection(selectedPlatform)) {
      await publishDirect(text, selectedPlatform, media)
    } else {
      await scheduleToBuffer(text, selectedPlatform, media)
    }
    setPublishing(false)
  }

  async function loadSignalData() {
    setSignalLoading(true)
    try {
      const { data } = await supabase
        .from('scheduled_posts')
        .select('caption, format_type, engagement_score, posted_at')
        .eq('status', 'posted')
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
    try {
      const body: Record<string, unknown> = { caption: text, post_format: postFormat }
      if (platform === 'instagram' && mediaUrl) body.image_url = mediaUrl
      if (platform === 'tiktok' && mediaUrl) body.video_url = mediaUrl
      if (platform === 'twitter') body.text = text

      const res = await fetch(`/api/social/${platform}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Publish failed')

      await supabase.from('social_posts').insert({
        platform,
        caption: text,
        media_urls: mediaUrl ? [mediaUrl] : [],
        posted_at: new Date().toISOString(),
        status: 'posted',
      })

      showToast('Published to ' + selectedPlatform, 'Posted')
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
      const nowLondon = new Date(new Date().toLocaleString('en-GB', { timeZone: getUserTimezone() }))
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
      showToast('Week ready — review before saving', 'Broadcast Lab')
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
      const nowLondon = new Date(new Date().toLocaleString('en-GB', { timeZone: getUserTimezone() }))
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

  function useTrend(trendContext: string) {
    setContext(trendContext)
    setTimeout(generateCaptions, 300)
    showToast('Trend applied — generating captions', 'Broadcast Lab')
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

  return (
    <div className="min-h-screen bg-[#070706] text-[#f0ebe2] font-mono flex flex-col">

      <SignalLabHeader />

      <div className="flex flex-col gap-5 p-8">

      {/* CONTENT INTELLIGENCE — the sell */}
      {artists.length > 0 && (() => {
        const tr = calcToneRegister(artists)
        const va = calcVoiceAlignment(artists)
        const totalPosts = artists.reduce((s, a) => s + (a.post_count_analysed || 0), 0)
        const hasDeepDive = artists.some(a => a.visual_aesthetic)
        const visualArtist = artists.find(a => a.visual_aesthetic)
        const perfArtist = artists.find(a => a.content_performance)
        const lower = Math.round(artists.reduce((s, a) => s + a.lowercase_pct, 0) / artists.length)
        const short = Math.round(artists.reduce((s, a) => s + a.short_caption_pct, 0) / artists.length)
        const noHash = Math.round(artists.reduce((s, a) => s + a.no_hashtags_pct, 0) / artists.length)
        // Build style descriptor
        const styleWords = [lower > 55 ? 'lowercase' : null, short > 45 ? 'punchy' : 'long-form', noHash > 55 ? 'no hashtags' : null].filter(Boolean)
        // Collect all chips
        const allChips = [...new Set(artists.flatMap(a => a.chips || []))].slice(0, 8)

        return (
        <div className="bg-[#0e0d0b] border border-white/7">
          {/* Top bar — confidence + artists */}
          <div className="flex items-center justify-between p-5 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="text-[10px] tracking-[.22em] uppercase text-[#b08d57]">Content Intelligence</div>
              <div className="text-[10px] text-[#52504c]">·</div>
              <div className="text-[10px] text-[#52504c]">{artists.length} artists · {totalPosts} posts analysed</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[20px] font-light text-[#b08d57]">{va.score}%</div>
              <div className="text-[9px] tracking-[.1em] uppercase text-[#52504c]">confidence</div>
            </div>
          </div>

          {/* Intelligence grid */}
          <div className="grid grid-cols-4 gap-px bg-white/5">
            {/* Voice */}
            <div className="bg-[#0e0d0b] p-5">
              <div className="text-[8px] tracking-[.2em] uppercase text-[#52504c] mb-2">Voice</div>
              <div className="text-[16px] font-light text-[#f0ebe2] mb-1">{tr.value}</div>
              <div className="text-[10px] text-[#8a8780] leading-relaxed">{styleWords.join(', ')}</div>
            </div>
            {/* Visual */}
            <div className="bg-[#0e0d0b] p-5">
              <div className="text-[8px] tracking-[.2em] uppercase text-[#52504c] mb-2">Visual</div>
              <div className="text-[16px] font-light text-[#f0ebe2] mb-1">{visualArtist?.visual_aesthetic?.mood || 'Scan to reveal'}</div>
              <div className="text-[10px] text-[#8a8780] leading-relaxed">{visualArtist?.visual_aesthetic?.palette || 'Run a Signal Scan with images'}</div>
            </div>
            {/* Best format */}
            <div className="bg-[#0e0d0b] p-5">
              <div className="text-[8px] tracking-[.2em] uppercase text-[#52504c] mb-2">Best format</div>
              <div className="text-[16px] font-light text-[#f0ebe2] mb-1">{perfArtist?.content_performance?.best_type || 'Photo'}</div>
              <div className="text-[10px] text-[#8a8780] leading-relaxed">{perfArtist?.content_performance?.peak_content || 'Based on lane engagement patterns'}</div>
            </div>
            {/* What gets saved */}
            <div className="bg-[#0e0d0b] p-5">
              <div className="text-[8px] tracking-[.2em] uppercase text-[#52504c] mb-2">What gets saved</div>
              <div className="text-[16px] font-light text-[#f0ebe2] mb-1">{short > 55 ? 'Short fragments' : 'Longer captions'}</div>
              <div className="text-[10px] text-[#8a8780] leading-relaxed">{lower > 60 && noHash > 60 ? 'Lowercase, no hashtags — let the image do the work' : `${lower}% lowercase · ${noHash}% skip hashtags`}</div>
            </div>
          </div>

          {/* Lane DNA chips + artists */}
          <div className="p-5 border-t border-white/5">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                {allChips.map(chip => (
                  <span key={chip} className="text-[9px] tracking-[.1em] uppercase text-[#b08d57] border border-[#b08d57]/25 px-2 py-0.5 bg-[#b08d57]/5">{chip}</span>
                ))}
              </div>
              <div className="w-px h-4 bg-white/10" />
              <div className="flex items-center gap-2 flex-wrap">
                {artists.map(a => (
                  <div key={a.name} className="flex items-center gap-1.5">
                    {a.profile_pic_url ? (
                      <img src={a.profile_pic_url} alt="" className="w-5 h-5 rounded-full object-cover border border-white/10" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-[#b08d57]/10 border border-white/10 flex items-center justify-center text-[7px] text-[#b08d57]">{a.name.charAt(0)}</div>
                    )}
                    <span className="text-[9px] text-[#52504c]">{a.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* CAPTION GENERATOR — compact */}
      <div className="bg-[#0e0d0b] border border-white/7 p-5 caption-panel">
        {/* Row 1: context input + generate button */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <input value={context} onChange={e => setContext(e.target.value)} placeholder="What happened — show, studio, flight, release..."
              onKeyDown={e => { if (e.key === 'Enter' && context.trim()) generateCaptions() }}
              className="w-full bg-[#1a1917] border border-white/7 text-[#f0ebe2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#b08d57] transition-colors placeholder-[#2e2c29]" />
          </div>
          <select value={media} onChange={e => setMedia(e.target.value)} className="bg-[#1a1917] border border-white/7 text-[#f0ebe2] font-mono text-[10px] px-2 py-2.5 outline-none focus:border-[#b08d57] transition-colors w-[140px]">
            {['Crowd clip','Show photo','Behind decks','Studio photo','Travel','No media'].map(m => <option key={m}>{m}</option>)}
          </select>
          <button onClick={generateCaptions} disabled={generatingCaptions || !context.trim()}
            className="text-[10px] tracking-[.16em] uppercase bg-[#b08d57] text-[#070706] px-5 py-2.5 hover:bg-[#c9a46e] transition-colors disabled:opacity-40 flex items-center gap-2 whitespace-nowrap">
            {generatingCaptions && <div className="w-2 h-2 border border-[#070706] border-t-transparent rounded-full animate-spin" />}
            {generatingCaptions ? 'Generating...' : 'Generate →'}
          </button>
        </div>

        {/* Row 2: format + attach + platform + sync */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['post','carousel','story','reel'] as const).map(f => (
            <button key={f} onClick={() => setPostFormat(f)}
              className={`text-[9px] tracking-[.14em] uppercase px-3 py-1 border transition-colors ${postFormat===f ? 'border-[#b08d57] text-[#b08d57]' : 'border-white/10 text-[#52504c] hover:border-white/20'}`}>
              {f}
            </button>
          ))}
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button onClick={() => setMediaPickerOpen(true)}
            className="text-[9px] tracking-[.14em] uppercase border border-white/10 text-[#52504c] px-3 py-1 hover:border-[#b08d57] hover:text-[#b08d57] transition-colors flex items-center gap-1.5">
            {mediaUrls.length > 0 ? (
              <><div className="w-4 h-4 bg-[#1a1917] border border-white/10 overflow-hidden flex-shrink-0"><img src={mediaUrls[0]} className="w-full h-full object-cover" alt="" /></div>{mediaUrls.length} attached</>
            ) : 'Attach media'}
          </button>
          {mediaUrls.length > 0 && (
            <button onClick={() => setMediaUrls([])} className="text-[9px] text-[#52504c] hover:text-red-400 transition-colors">×</button>
          )}
          <div className="w-px h-4 bg-white/10 mx-1" />
          {['Instagram','TikTok','X / Twitter'].map(p => (
            <button key={p} onClick={() => setPlatform(p)}
              className={`text-[9px] tracking-[.14em] uppercase px-3 py-1 border transition-colors ${platform===p?'border-[#b08d57] text-[#b08d57]':'border-white/10 text-[#52504c] hover:border-white/20'}`}>
              {p}
              {hasDirectConnection(p) && <span className="ml-1 inline-block w-1 h-1 rounded-full bg-[#6aaa7a] align-middle" />}
            </button>
          ))}
          <button onClick={syncInstagram} disabled={syncingIG}
            className="ml-auto text-[9px] tracking-[.12em] uppercase text-[#3a3830] hover:text-[#b08d57] transition-colors disabled:opacity-40">
            {syncingIG ? 'Syncing...' : igSyncResult?.synced != null ? `${igSyncResult.synced} synced` : 'Sync IG'}
          </button>
        </div>

        {/* Loading indicator */}
        {generatingCaptions && (
          <div className="flex items-center gap-2 text-[10px] tracking-[.1em] uppercase text-[#8a8780] mt-4">
            <div className="w-1 h-1 rounded-full bg-[#b08d57] animate-pulse" /><div className="w-1 h-1 rounded-full bg-[#b08d57] animate-pulse" style={{animationDelay:'.2s'}} /><div className="w-1 h-1 rounded-full bg-[#b08d57] animate-pulse" style={{animationDelay:'.4s'}} />
            <span>Reading your tone profile...</span>
          </div>
        )}

        {/* Caption variants — only show when we have results */}
        {(captions || generatingCaptions) && (
        <div className="grid grid-cols-3 gap-3 mt-4">
          {variantKeys.map(key => {
            const v = captions?.[key]
            const label = variantLabels[key]
            const best = captions ? variantKeys.reduce((a, b) => (captions[a]?.score || 0) >= (captions[b]?.score || 0) ? a : b) : null
            const isBest = key === best
            return (
              <div key={key} onClick={() => setSelectedVariant(key)}
                className={`bg-[#1a1917] border p-4 cursor-pointer transition-all relative ${selectedVariant===key?'border-[#b08d57]':'border-white/7 hover:border-white/13'}`}>
                {generatingCaptions ? (
                  <div className="space-y-2">
                    <div className="h-3 w-20 bg-white/5 animate-pulse rounded" />
                    <div className="h-8 bg-white/5 animate-pulse rounded" />
                    <div className="h-3 w-full bg-white/3 animate-pulse rounded" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[9px] tracking-[.18em] uppercase text-[#8a8780]">{label}</span>
                      <div className="flex items-center gap-1.5">
                        {isBest && <span className="text-[7px] tracking-[.14em] uppercase text-[#b08d57] border border-[#b08d57]/30 px-1.5 py-0.5">Top pick</span>}
                        <span className="text-[13px] font-light text-[#b08d57]">{v?formatScore(v.score):''}</span>
                        <span className="text-[8px] text-[#52504c]">reach</span>
                      </div>
                    </div>
                    <div className="text-[13px] tracking-[.03em] leading-relaxed text-[#f0ebe2] mb-3">{v?.text||''}</div>
                    {v?.reasoning && (
                      <div className="text-[9px] tracking-[.05em] text-[#52504c] leading-relaxed mb-3 italic">{v.reasoning}</div>
                    )}
                    <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                      <button onClick={e => { e.stopPropagation(); copyToClipboard(v?.text||'', label) }}
                        className="text-[9px] tracking-[.14em] uppercase text-[#8a8780] hover:text-[#b08d57] transition-colors">
                        Copy
                      </button>
                      <button onClick={e=>{e.stopPropagation();publish(v?.text||'',platform,mediaUrls)}}
                        className="text-[9px] tracking-[.14em] uppercase text-[#b08d57]">
                        {hasDirectConnection(platform) ? 'Publish' : 'Schedule'}
                      </button>
                      <a href={`/broadcast/ads?caption=${encodeURIComponent(v?.text||'')}`}
                        className="text-[9px] tracking-[.14em] uppercase text-[#3a3830] hover:text-[#b08d57] transition-colors"
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
        {captionError && <div className="bg-red-900/20 border border-red-800/40 text-red-300 text-[10px] px-4 py-3 mt-3">{captionError}</div>}

        {/* REELS TEXT OVERLAY + REPURPOSE ACTIONS */}
        {captions && (
          <div className="flex gap-2 mb-5">
            <button onClick={generateReelsOverlay} disabled={generatingOverlay}
              className="text-[10px] tracking-[.14em] uppercase border border-white/13 text-[#8a8780] px-4 py-2 hover:border-[#b08d57] hover:text-[#b08d57] transition-colors disabled:opacity-40 flex items-center gap-2">
              {generatingOverlay && <div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />}
              {generatingOverlay ? 'Generating...' : 'Reels text overlay'}
            </button>
            <button onClick={generateRepurpose} disabled={generatingRepurpose}
              className="text-[10px] tracking-[.14em] uppercase border border-white/13 text-[#8a8780] px-4 py-2 hover:border-[#b08d57] hover:text-[#b08d57] transition-colors disabled:opacity-40 flex items-center gap-2">
              {generatingRepurpose && <div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />}
              {generatingRepurpose ? 'Repurposing...' : 'Repurpose → 3 formats'}
            </button>
          </div>
        )}

        {/* REELS TEXT OVERLAY OUTPUT */}
        {reelsOverlay && (
          <div className="mb-5 bg-[#0e0d0b] border border-white/7 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10px] tracking-[.22em] uppercase text-[#b08d57]">Reels text overlay — word by word</div>
              <button onClick={() => {
                const text = reelsOverlay.lines.map(l => `[${l.timing}] ${l.text}`).join('\n')
                navigator.clipboard.writeText(text).then(() => showToast('Overlay copied', 'Copied'))
              }} className="text-[10px] tracking-[.14em] uppercase text-[#8a8780] hover:text-[#b08d57] transition-colors">Copy all</button>
            </div>
            <div className="flex flex-col gap-2 mb-4">
              {reelsOverlay.lines.map((line, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="text-[9px] tracking-[.1em] text-[#52504c] w-12 flex-shrink-0 text-right">{line.timing}</div>
                  <div className="text-[14px] tracking-[.06em] text-[#f0ebe2] font-light">{line.text}</div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-[#52504c] italic">{reelsOverlay.style}</div>
          </div>
        )}

        {/* REPURPOSE OUTPUT */}
        {repurposed && (
          <div className="mb-5 bg-[#0e0d0b] border border-white/7 p-5">
            <div className="flex items-center gap-2 mb-4 text-[10px] tracking-[.22em] uppercase text-[#b08d57]">
              Repurposed — 3 formats<div className="flex-1 h-px bg-white/10" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {/* Reel script */}
              <div className="bg-[#1a1917] border border-white/7 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] tracking-[.18em] uppercase text-[#8a8780]">Reel script</div>
                  <button onClick={() => navigator.clipboard.writeText(repurposed.reel_script).then(() => showToast('Reel script copied', 'Copied'))}
                    className="text-[10px] tracking-[.14em] uppercase text-[#8a8780] hover:text-[#b08d57] transition-colors">Copy</button>
                </div>
                <div className="text-[11px] leading-relaxed text-[#f0ebe2] whitespace-pre-wrap">{repurposed.reel_script}</div>
              </div>
              {/* Carousel */}
              <div className="bg-[#1a1917] border border-white/7 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] tracking-[.18em] uppercase text-[#8a8780]">Carousel — {repurposed.carousel_slides.length} slides</div>
                  <button onClick={() => navigator.clipboard.writeText(repurposed.carousel_slides.map((s, i) => `[${i+1}] ${s}`).join('\n')).then(() => showToast('Carousel copied', 'Copied'))}
                    className="text-[10px] tracking-[.14em] uppercase text-[#8a8780] hover:text-[#b08d57] transition-colors">Copy</button>
                </div>
                <div className="flex flex-col gap-2">
                  {repurposed.carousel_slides.map((slide, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-[10px] text-[#52504c] flex-shrink-0 mt-0.5">{i+1}.</span>
                      <span className="text-[11px] leading-relaxed text-[#f0ebe2]">{slide}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Static post */}
              <div className="bg-[#1a1917] border border-white/7 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] tracking-[.18em] uppercase text-[#8a8780]">Static post</div>
                  <button onClick={() => navigator.clipboard.writeText(repurposed.static_post).then(() => showToast('Static post copied', 'Copied'))}
                    className="text-[10px] tracking-[.14em] uppercase text-[#8a8780] hover:text-[#b08d57] transition-colors">Copy</button>
                </div>
                <div className="text-[13px] leading-relaxed text-[#f0ebe2] min-h-[60px] flex items-center">{repurposed.static_post}</div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* SIGNAL SCAN PROGRESS */}
      {scanningArtist && scanStage && (
        <div className="bg-[#0e0d0b] border border-[#b08d57]/30 p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#b08d57]/20">
            <div className="h-full bg-[#b08d57] animate-pulse" style={{ width: '100%' }} />
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-[#b08d57]/40 flex items-center justify-center flex-shrink-0">
              <div className="w-6 h-6 border-2 border-[#b08d57] border-t-transparent rounded-full animate-spin" />
            </div>
            <div>
              <div className="text-[10px] tracking-[.22em] uppercase text-[#b08d57] mb-1">Signal Scan — {scanningArtist}</div>
              <div className="text-[13px] text-[#f0ebe2] font-light">{scanStage}</div>
              <div className="text-[9px] text-[#52504c] mt-1">Building your Content Intelligence Report</div>
            </div>
          </div>
        </div>
      )}

      {/* REFERENCE ARTISTS */}
      <div className="bg-[#0e0d0b] border border-white/7">
        <button onClick={() => toggleSection('artists')} className="w-full flex items-center gap-2 p-5 text-[10px] tracking-[.22em] uppercase text-[#b08d57] hover:bg-white/[0.02] transition-colors text-left">
          Signal Scan — your lane
          <div className="flex-1 h-px bg-white/10" />
          {!expandedSections.artists && artists.length > 0 && (
            <span className="text-[10px] tracking-[.1em] normal-case text-[#52504c]">{artists.length} artist{artists.length !== 1 ? 's' : ''} profiled</span>
          )}
          <span className="text-[#52504c] text-xs ml-1">{expandedSections.artists ? '▾' : '▸'}</span>
        </button>
        {expandedSections.artists && <div className="grid grid-cols-2 gap-3 px-5 pb-5">
          {artists.map(artist => (
            <div key={artist.name} className="bg-[#0e0d0b] border border-white/7 relative group hover:border-white/13 transition-colors">
              {scanningArtist === artist.name && <div className="absolute top-0 left-0 right-0 h-px bg-[#b08d57] animate-pulse" />}
              <button onClick={() => { setArtists(prev => prev.filter(a => a.name !== artist.name)); removeArtistFromDb(artist.name); showToast(`${artist.name} removed`, 'Research') }}
                className="absolute top-3 right-3 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none z-10">x</button>
              {/* Header — pic + name + follower count */}
              <div className="flex items-center gap-3 p-4 pb-3">
                {artist.profile_pic_url ? (
                  <img src={artist.profile_pic_url} alt="" className="w-9 h-9 rounded-full object-cover border border-[#b08d57]/30 flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#b08d57]/10 border border-[#b08d57]/30 flex items-center justify-center text-[11px] text-[#b08d57] flex-shrink-0">{artist.name.charAt(0)}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between">
                    <div className="text-[13px] tracking-[.06em]">{artist.name}</div>
                    {artist.follower_count ? (
                      <span className="text-[10px] text-[#b08d57]">{artist.follower_count > 1000000 ? `${(artist.follower_count/1000000).toFixed(1)}M` : artist.follower_count > 1000 ? `${Math.round(artist.follower_count/1000)}K` : artist.follower_count} followers</span>
                    ) : null}
                  </div>
                  <div className="text-[10px] text-[#52504c]">{artist.handle} · {artist.genre}</div>
                </div>
              </div>
              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-px bg-white/5 mx-4 mb-3 border border-white/5">
                <div className="bg-[#0e0d0b] p-2.5 text-center">
                  <div className="text-[15px] font-light text-[#f0ebe2]">{artist.lowercase_pct}%</div>
                  <div className="text-[7px] tracking-[.16em] uppercase text-[#52504c] mt-0.5">Lowercase</div>
                </div>
                <div className="bg-[#0e0d0b] p-2.5 text-center">
                  <div className="text-[15px] font-light text-[#f0ebe2]">{artist.short_caption_pct}%</div>
                  <div className="text-[7px] tracking-[.16em] uppercase text-[#52504c] mt-0.5">Short</div>
                </div>
                <div className="bg-[#0e0d0b] p-2.5 text-center">
                  <div className="text-[15px] font-light text-[#f0ebe2]">{artist.no_hashtags_pct}%</div>
                  <div className="text-[7px] tracking-[.16em] uppercase text-[#52504c] mt-0.5">No tags</div>
                </div>
                <div className="bg-[#0e0d0b] p-2.5 text-center">
                  <div className="text-[15px] font-light text-[#b08d57]">{artist.content_performance?.engagement_rate || `${artist.post_count_analysed}`}</div>
                  <div className="text-[7px] tracking-[.16em] uppercase text-[#52504c] mt-0.5">{artist.content_performance?.engagement_rate ? 'Eng. rate' : 'Posts'}</div>
                </div>
              </div>
              {/* Deep dive row — visual + best format + peak content */}
              {artist.visual_aesthetic && (
                <div className="grid grid-cols-3 gap-3 mx-4 mb-3">
                  <div>
                    <div className="text-[7px] tracking-[.16em] uppercase text-[#52504c] mb-1">Visual mood</div>
                    <div className="text-[11px] text-[#b08d57] leading-snug">{artist.visual_aesthetic.mood}</div>
                  </div>
                  <div>
                    <div className="text-[7px] tracking-[.16em] uppercase text-[#52504c] mb-1">Best format</div>
                    <div className="text-[11px] text-[#f0ebe2] leading-snug">{artist.content_performance?.best_type || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[7px] tracking-[.16em] uppercase text-[#52504c] mb-1">Peak content</div>
                    <div className="text-[11px] text-[#f0ebe2] leading-snug">{artist.content_performance?.peak_content ? (artist.content_performance.peak_content.length > 60 ? artist.content_performance.peak_content.slice(0, 60) + '...' : artist.content_performance.peak_content) : '—'}</div>
                  </div>
                </div>
              )}
              {/* Voice summary — trimmed to 2 lines */}
              {artist.style_rules && (
                <div className="mx-4 mb-3 text-[10px] leading-relaxed text-[#8a8780] border-l-2 border-[#b08d57]/20 pl-3 line-clamp-2">
                  {artist.style_rules}
                </div>
              )}
              {/* Chips */}
              <div className="flex flex-wrap gap-1 px-4 pb-4">
                {artist.chips.map((chip, i) => (
                  <span key={chip} className={`text-[8px] tracking-[.1em] uppercase px-1.5 py-0.5 border ${artist.highlight_chips.includes(i) ? 'border-[#b08d57]/35 text-[#b08d57]' : 'border-white/10 text-[#52504c]'}`}>{chip}</span>
                ))}
              </div>
            </div>
          ))}
          {/* Paste panel — shown when scan is blocked */}
          {pastingFor && (
            <div className="bg-[#0e0d0b] border border-[#b08d57]/40 p-5 flex flex-col gap-3 col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] tracking-[.1em] text-[#b08d57] uppercase mb-0.5">Paste captions — {pastingFor}</div>
                  <div className="text-[10px] text-[#8a8780]">Go to their Instagram, copy captions one per line</div>
                </div>
                <button onClick={() => { setPastingFor(null); setPastedCaptions('') }}
                  className="text-[#8a8780] hover:text-[#f0ebe2] text-lg leading-none transition-colors">×</button>
              </div>
              <textarea
                autoFocus
                value={pastedCaptions}
                onChange={e => setPastedCaptions(e.target.value)}
                placeholder={"caption one\ncaption two\ncaption three\n..."}
                rows={6}
                className="w-full bg-[#1a1917] border border-white/10 text-[#f0ebe2] font-mono text-[11px] px-3 py-2 outline-none placeholder-[#2e2c29] resize-none focus:border-[#b08d57]/50 transition-colors"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={() => submitManualCaptions(pastingFor)}
                  disabled={!!scanningArtist}
                  className="text-[10px] tracking-[.18em] uppercase bg-[#b08d57] text-[#070706] px-5 py-2.5 hover:bg-[#c9a46e] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {scanningArtist ? <><div className="w-2 h-2 border border-[#070706] border-t-transparent rounded-full animate-spin" />Analysing...</> : 'Analyse captions'}
                </button>
                <span className="text-[10px] text-[#2e2c29]">{pastedCaptions.split('\n').filter(l => l.trim().length > 5).length} captions ready</span>
              </div>
            </div>
          )}

          <div onClick={() => !addingArtist && !pastingFor && setAddingArtist(true)}
            className={`bg-[#0e0d0b] border border-dashed border-white/13 p-5 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[#b08d57] hover:bg-[#141310] transition-colors min-h-[176px] ${pastingFor ? 'opacity-40 pointer-events-none' : ''}`}>
            {!addingArtist ? (
              <><div className="text-2xl text-[#2e2c29]">+</div><div className="text-[10px] tracking-[.15em] uppercase text-[#b08d57]">Run Signal Scan</div><div className="text-[9px] text-[#52504c] mt-1">Add an artist to your lane</div></>
            ) : (
              <div className="w-full flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                <input ref={addInputRef} value={newArtistName} onChange={e => setNewArtistName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newArtistName.trim()) { scanArtist(newArtistName.trim()); setNewArtistName(''); setAddingArtist(false) }
                    if (e.key === 'Escape') { setAddingArtist(false); setNewArtistName('') }
                  }}
                  placeholder="Artist name or @handle — press Enter to scan"
                  className="w-full bg-[#1a1917] border border-[#b08d57] text-[#f0ebe2] font-mono text-[11px] px-3 py-2 outline-none placeholder-[#2e2c29]" />
                <div className="text-[10px] tracking-[.1em] text-[#52504c] text-center">Enter to run Signal Scan · Escape to cancel</div>
              </div>
            )}
          </div>
        </div>}
      </div>

      {/* TONE PROFILE */}
      <div className="bg-[#0e0d0b] border border-white/7">
        <button onClick={() => toggleSection('tone')} className="w-full flex items-center gap-2 p-5 text-[10px] tracking-[.22em] uppercase text-[#b08d57] hover:bg-white/[0.02] transition-colors text-left">
          Live tone profile — NIGHT manoeuvres<div className="flex-1 h-px bg-white/10" />
          {!expandedSections.tone && artists.length >= 2 && (
            <span className="text-[10px] tracking-[.1em] normal-case text-[#52504c]">{calcVoiceAlignment(artists).score}% confidence · {calcToneRegister(artists).value}</span>
          )}
          <span className="text-[#52504c] text-xs ml-1">{expandedSections.tone ? '▾' : '▸'}</span>
        </button>
        {expandedSections.tone && <div className="px-5 pb-5">
        <div className="grid grid-cols-3 gap-6 mb-7">
          {(() => {
            const va = calcVoiceAlignment(artists)
            const tr = calcToneRegister(artists)
            const totalPosts = artists.reduce((s, a) => s + (a.post_count_analysed || 0), 0)
            const realArtists = artists.filter(a => a.data_source === 'apify' || a.data_source === 'manual' || a.data_source === 'hikerapi')
            const lower = Math.round(artists.reduce((a, b) => a + b.lowercase_pct, 0) / (artists.length || 1))
            const short = Math.round(artists.reduce((a, b) => a + b.short_caption_pct, 0) / (artists.length || 1))
            const noHash = Math.round(artists.reduce((a, b) => a + b.no_hashtags_pct, 0) / (artists.length || 1))
            const styleDesc = [lower > 55 ? 'Lowercase' : null, short > 45 ? 'Punchy' : 'Long-form', noHash > 55 ? 'No hashtags' : null].filter(Boolean).join(', ') || 'Mixed'
            const lastScanned = artists.filter(a => a.last_scanned).sort((a, b) => new Date(b.last_scanned!).getTime() - new Date(a.last_scanned!).getTime())[0]?.last_scanned
            const lastUpdated = lastScanned ? `${daysSince(lastScanned)}d ago` : '—'
            return [
              {l:'Voice confidence',v:`${va.score}%`,p:va.score,s:va.desc},
              {l:'Tone',v:tr.value,p:tr.score,s:tr.desc,t:true},
              {l:'Style',v:styleDesc,p:Math.round((lower + noHash) / 2),s:`${lower}% lowercase · ${short}% short · ${noHash}% no hashtags`},
              {l:'Artists profiled',v:`${artists.length}`,p:Math.min(artists.length*20,100),s:realArtists.length > 0 ? `${realArtists.length} from real captions` : 'Add artists to build your lane'},
              {l:'Posts analysed',v:totalPosts > 0 ? `${totalPosts}` : '—',p:Math.min(totalPosts, 100),s:totalPosts > 0 ? 'Real captions powering your voice model' : 'Scan artists to analyse posts',t:true},
              {l:'Last updated',v:lastUpdated,p:lastScanned ? Math.max(5, 100 - daysSince(lastScanned) * 5) : 0,s:lastScanned ? 'Keep scanning to stay current' : 'No scans yet'},
            ]
          })().map(m => (
            <div key={m.l}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[11px] tracking-[.1em] text-[#8a8780]">{m.l}</span>
                <span className="text-xl font-light text-[#b08d57]">{m.v}</span>
              </div>
              <Bar value={m.p} teal={m.t} />
              <div className="text-[11px] tracking-[.08em] text-[#2e2c29] mt-1">{m.s}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-white/7 pt-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] tracking-[.15em] uppercase text-[#2e2c29]">Lane insights</div>
            <button onClick={refreshLaneInsights} disabled={refreshingInsights}
              className="text-[10px] tracking-[.12em] uppercase text-[#8a8780] hover:text-[#b08d57] transition-colors disabled:opacity-40 flex items-center gap-1">
              {refreshingInsights && <div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />}
              {refreshingInsights ? 'Refreshing...' : 'Refresh →'}
            </button>
          </div>
          {laneInsights.map((ins, i) => (
            <div key={i} className="flex gap-3 py-3 border-b border-white/7 last:border-0 text-[12px] tracking-[.07em] text-[#8a8780] leading-relaxed hover:text-white/60 hover:pl-1 transition-all cursor-default">
              <span className="text-[#b08d57] opacity-70 flex-shrink-0">→</span>{ins}
            </div>
          ))}
        </div>
        </div>}
      </div>

      {/* TREND ENGINE */}
      <div className="bg-[#0e0d0b] border border-white/7">
        <button onClick={() => toggleSection('trends')} className="w-full flex items-center gap-2 p-5 text-[10px] tracking-[.22em] uppercase text-[#b08d57] hover:bg-white/[0.02] transition-colors text-left">
          Trend engine — filtered for your lane<div className="flex-1 h-px bg-white/10" />
          {!expandedSections.trends && trends.length > 0 && (
            <span className="text-[10px] tracking-[.1em] normal-case text-[#52504c]">{trends.length} trend{trends.length !== 1 ? 's' : ''} · {trends.filter(t => t.hot).length} hot</span>
          )}
          <span className="text-[#52504c] text-xs ml-1">{expandedSections.trends ? '▾' : '▸'}</span>
        </button>
        {expandedSections.trends && <div className="px-5 pb-5">
        {trendsSource ? (
          <div className="text-[10px] tracking-[.07em] text-[#3d6b4a] mb-5 flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-[#3d6b4a]" />
            {trendsSource.postsAnalysed} real posts analysed · {trendsSource.artistsIncluded?.join(', ')}
          </div>
        ) : (
          <div className="text-[10px] tracking-[.07em] text-[#8a8780] mb-5 italic">Based on real engagement data from your reference artists</div>
        )}
        {loadingTrends && (
          <div className="flex items-center gap-2 text-[10px] tracking-[.1em] uppercase text-[#8a8780] mb-4">
            <div className="w-1 h-1 rounded-full bg-[#b08d57] animate-pulse" /><div className="w-1 h-1 rounded-full bg-[#b08d57] animate-pulse" style={{animationDelay:'.2s'}} /><div className="w-1 h-1 rounded-full bg-[#b08d57] animate-pulse" style={{animationDelay:'.4s'}} />
            <span>Analysing trend fit...</span>
          </div>
        )}
        {trends.length === 0 && !loadingTrends ? (
          <div className="border border-dashed border-white/13 p-8 text-center">
            <div className="text-[11px] tracking-[.1em] text-[#8a8780] mb-2">No trend data yet</div>
            <div className="text-[10px] tracking-[.07em] text-[#2e2c29]">Scan reference artists above — trends are derived from their real engagement data</div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {trends.map(trend => (
              <div key={trend.id} className={`bg-[#1a1917] border p-4 relative hover:bg-[#141310] transition-colors ${trend.hot ? 'border-[#b08d57]/30' : 'border-white/7'}`}>
                {trend.hot && <div className="absolute top-2.5 right-2.5 text-[7px] tracking-[.16em] text-[#b08d57] bg-[#b08d57]/10 px-1.5 py-0.5">HOT</div>}
                <div className="text-[10px] tracking-[.15em] uppercase text-[#8a8780] mb-2">{trend.platform}</div>
                <div className="text-[11px] tracking-[.06em] mb-2 leading-snug">{trend.name}</div>
                <div className="text-[10px] text-[#8a8780] leading-relaxed mb-3 italic min-h-[32px]">{trend.context}</div>
                {trend.evidence && (
                  <div className="text-[10px] text-[#3d6b4a] mb-2 flex items-start gap-1">
                    <div className="w-1 h-1 rounded-full bg-[#3d6b4a] mt-1 flex-shrink-0" />
                    {trend.evidence}
                  </div>
                )}
                {trend.posts_supporting != null && trendsSource?.postsAnalysed && (
                  <div className="text-[9px] tracking-[.08em] text-[#3a3830] mb-3">
                    Based on {trend.posts_supporting} of {trendsSource.postsAnalysed} posts
                  </div>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] tracking-[.1em] text-[#8a8780]">Lane fit</span>
                  <div className="flex-1 h-px bg-white/10 relative"><div className="absolute top-0 left-0 h-px bg-[#b08d57]" style={{width:`${trend.fit}%`}} /></div>
                  <span className="text-[10px] text-[#b08d57]">{trend.fit}%</span>
                </div>
                {trendCaptions[trend.id] && (
                  <div className="mb-3 pt-3 border-t border-white/7">
                    <div className="text-[9px] tracking-[.14em] uppercase text-[#52504c] mb-1.5">Suggested caption</div>
                    <div className="text-[11px] text-[#8a8780] leading-relaxed italic">{trendCaptions[trend.id]}</div>
                    <button onClick={() => navigator.clipboard.writeText(trendCaptions[trend.id]).then(() => showToast('Caption copied', 'Done'))}
                      className="mt-2 text-[9px] tracking-[.14em] uppercase text-[#52504c] hover:text-[#8a8780] transition-colors">
                      Copy →
                    </button>
                  </div>
                )}
                <button onClick={() => useTrend(trend.context)} className="w-full text-[10px] tracking-[.15em] uppercase border border-white/13 text-[#8a8780] py-2 hover:border-[#b08d57] hover:text-[#b08d57] transition-colors">Use this trend →</button>
              </div>
            ))}
            <div className="bg-[#1a1917] border border-dashed border-white/13 flex flex-col items-center justify-center gap-2 min-h-[160px]">
              <button onClick={() => { setLoadingTrends(true); loadTrends().then(loaded => { if (loaded.length > 0) loadTrendCaptions(loaded) }).finally(() => setLoadingTrends(false)) }} className="text-[10px] tracking-[.14em] uppercase border border-white/13 text-[#8a8780] px-3 py-1.5 hover:border-[#b08d57] hover:text-[#b08d57] transition-colors">Refresh trends</button>
            </div>
          </div>
        )}
        </div>}
      </div>

      {/* SIGNAL PANEL */}
      {signalData && signalData.posts.length > 0 && (() => {
        const posts = signalData.posts
        const now = Date.now()
        const thirtyDays = 30 * 24 * 60 * 60 * 1000
        const recent = posts.filter(p => now - new Date(p.posted_at).getTime() < thirtyDays)
        const prior = posts.filter(p => {
          const age = now - new Date(p.posted_at).getTime()
          return age >= thirtyDays && age < thirtyDays * 2
        })
        const avg = (arr: typeof posts) => arr.length ? arr.reduce((s, p) => s + (p.engagement_score || 0), 0) / arr.length : 0
        const recentAvg = avg(recent)
        const priorAvg = avg(prior)
        const trend = priorAvg > 0 ? Math.round(((recentAvg - priorAvg) / priorAvg) * 100) : null

        const styleGroups: Record<string, number[]> = {}
        for (const p of posts) {
          const k = p.format_type || 'untagged'
          if (!styleGroups[k]) styleGroups[k] = []
          styleGroups[k].push(p.engagement_score || 0)
        }
        const styleStats = Object.entries(styleGroups)
          .map(([label, scores]) => ({ label, avg: scores.reduce((s, v) => s + v, 0) / scores.length, count: scores.length }))
          .sort((a, b) => b.avg - a.avg)
        const maxStyleAvg = styleStats[0]?.avg || 1

        const top3 = [...posts].sort((a, b) => (b.engagement_score || 0) - (a.engagement_score || 0)).slice(0, 3)

        const best = styleStats[0]
        const insight = best
          ? `${best.label.charAt(0).toUpperCase() + best.label.slice(1)} tone posts average ${Math.round(best.avg)} engagement — your strongest format.`
          : 'Post more to unlock format insights.'

        return (
          <div className="mt-8 border border-white/8 bg-[#0a0908]">
            <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
              <div className="text-[10px] tracking-[.2em] uppercase text-[#b08d57]">Signal</div>
              {trend !== null && (
                <div className={`text-[11px] tracking-[.06em] ${trend >= 0 ? 'text-[#b08d57]' : 'text-[#f0ebe2]/40'}`}>
                  {trend >= 0 ? '+' : ''}{trend}% vs prior 30d
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 divide-x divide-white/8">
              {/* Trend */}
              <div className="px-5 py-4">
                <div className="text-[10px] tracking-[.16em] uppercase text-[#f0ebe2]/40 mb-3">Engagement trend</div>
                {trend !== null ? (
                  <div className={`text-2xl font-light tracking-tight ${trend >= 0 ? 'text-[#b08d57]' : 'text-[#f0ebe2]/60'}`}>
                    {trend >= 0 ? '+' : ''}{trend}%
                  </div>
                ) : (
                  <div className="text-[#f0ebe2]/30 text-[11px]">Need 60d of data</div>
                )}
                <div className="text-[10px] text-[#f0ebe2]/30 mt-1">{recent.length} posts this month</div>
              </div>

              {/* Format breakdown */}
              <div className="px-5 py-4">
                <div className="text-[10px] tracking-[.16em] uppercase text-[#f0ebe2]/40 mb-3">By format</div>
                <div className="space-y-2">
                  {styleStats.slice(0, 4).map(s => (
                    <div key={s.label}>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-[#f0ebe2]/60 capitalize">{s.label}</span>
                        <span className="text-[#f0ebe2]/40">{Math.round(s.avg)}</span>
                      </div>
                      <div className="h-0.5 bg-white/8 rounded-full overflow-hidden">
                        <div className="h-full bg-[#b08d57]" style={{ width: `${(s.avg / maxStyleAvg) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top posts */}
              <div className="px-5 py-4">
                <div className="text-[10px] tracking-[.16em] uppercase text-[#f0ebe2]/40 mb-3">Top posts</div>
                <div className="space-y-2.5">
                  {top3.map((p, i) => (
                    <div key={i} className="text-[10px]">
                      <div className="text-[#f0ebe2]/60 truncate leading-tight">{p.caption.slice(0, 60)}{p.caption.length > 60 ? '…' : ''}</div>
                      <div className="text-[#b08d57]/70 mt-0.5">{p.engagement_score} pts · {p.format_type || 'untagged'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-3 border-t border-white/8 text-[10px] text-[#f0ebe2]/35 tracking-[.04em]">{insight}</div>
          </div>
        )
      })()}

      {/* TOAST */}
      <MediaPicker
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={urls => { setMediaUrls(prev => [...prev, ...urls]); if (urls.length > 1) setPostFormat('carousel') }}
      />

      {toast && (
        <div className="fixed bottom-7 right-7 bg-[#0e0d0b]/96 border border-white/13 px-5 py-3.5 text-[11px] tracking-[.07em] text-[#f0ebe2] z-50 max-w-xs leading-relaxed backdrop-blur-md">
          <div className="text-[10px] tracking-[.2em] uppercase text-[#b08d57] mb-1">{toast.tag}</div>
          {toast.msg}
        </div>
      )}

      </div>{/* end inner p-8 */}
    </div>
  )
}
