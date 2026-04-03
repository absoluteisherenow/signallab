'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { aiCache } from '@/lib/aiCache'
import { SignalLabHeader } from './SignalLabHeader'
import { SocialsMastermind } from './SocialsMastermind'
import { SKILLS_CAPTION_GEN } from '@/lib/skillPromptsClient'

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
  const [trends, setTrends] = useState<Trend[]>((_cache.trends as Trend[]) || [])
  const [refreshingInsights, setRefreshingInsights] = useState(false)
  const [trendsSource, setTrendsSource] = useState<{ postsAnalysed?: number; artistsIncluded?: string[] } | null>((_cache.trendsSource as any) || null)
  const [connectedSocials, setConnectedSocials] = useState<string[]>([]) // platform ids with direct connection
  const [publishing, setPublishing] = useState(false)

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
    showToast(manualCaptionList ? `Analysing ${name} captions...` : `Scanning ${name}...`, 'Research')
    try {
      const body: Record<string, unknown> = { name }
      if (manualCaptionList) body.manualCaptions = manualCaptionList
      const res = await fetch('/api/artist-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.success) {
        if (data.canPaste) {
          setScanningArtist(null)
          setPastingFor(name)
          setPastedCaptions('')
          return
        }
        throw new Error(data.error)
      }
      const artist = data.profile as ArtistProfile
      setArtists(prev => {
        const filtered = prev.filter(a => a.name.toLowerCase() !== name.toLowerCase())
        return [...filtered, artist]
      })
      saveArtist(artist)
      const sourceMsg = artist.data_source === 'apify'
        ? `${artist.post_count_analysed} real posts analysed`
        : artist.data_source === 'manual'
        ? `${artist.post_count_analysed} captions analysed`
        : 'Voice profile built'
      showToast(`${name} — ${sourceMsg}`, 'Done')
      setPastingFor(null)
      setPastedCaptions('')
    } catch (err: any) {
      showToast(`Could not scan ${name} — ${err.message || 'try again'}`, 'Error')
    } finally {
      setScanningArtist(null)
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

  async function generateCaptions() {
    setGeneratingCaptions(true)
    setCaptionError('')
    try {
      const profilesText = artists
        .filter(a => a.style_rules)
        .map(a => `${a.name}: ${a.style_rules}`)
        .join('\n\n')
      const raw = await callClaude(
        `You write social media captions for ${artistName}, an ${artistCountry} electronic music artist.
${memberContext ? `\n${memberContext}\n` : ''}
REFERENCE ARTISTS — studied voice profiles:
${profilesText || artists.map(a => a.name).join(', ')}

YOUR RULES:
— All lowercase, always
— No hashtags on Instagram and X. TikTok: max 2 genre-specific tags only
— No exclamation marks, no emojis
— Never describe or explain the photo or video
— Feels like a private thought shared, not a caption written for an audience
— Safe = sounds natural, slightly complete sentence. Loose = fragment, unresolved — no closure, no CTA. Raw = shortest possible — minimum viable thought, often 3 words or fewer
— Score each variant with estimated save rate 800–2500 based on electronic/dance lane behaviour and how strongly it triggers saves vs likes

${SKILLS_CAPTION_GEN}

Respond ONLY with valid JSON, no markdown.`,
        `Context: ${context}\nPlatform: ${platform}\nMedia: ${media}\nReturn: {"safe":{"text":"...","reasoning":"...","score":number},"loose":{"text":"...","reasoning":"...","score":number},"raw":{"text":"...","reasoning":"...","score":number}}`,
        500
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
      const body: Record<string, unknown> = { caption: text }
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

  function useTrend(trendContext: string) {
    setContext(trendContext)
    setTimeout(generateCaptions, 300)
    showToast('Trend applied — generating captions', 'Broadcast Lab')
  }

  function formatScore(score: number) {
    return score >= 1000 ? `${(score / 1000).toFixed(1)}k` : `${score}`
  }

  const variantKeys: ('safe' | 'loose' | 'raw')[] = ['safe', 'loose', 'raw']

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

      <SignalLabHeader right={
        <Link
          href="/broadcast/strategy"
          style={{
            display: 'inline-block',
            background: 'transparent',
            color: '#d4a843',
            border: '1px solid rgba(212,168,67,0.4)',
            padding: '7px 16px',
            borderRadius: '6px',
            fontSize: '10px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono)',
            fontWeight: 500,
            textDecoration: 'none',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.8)'; e.currentTarget.style.color = '#e8c97a' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)'; e.currentTarget.style.color = '#d4a843' }}
        >
          Create Content Strategy
        </Link>
      } />

      <div className="flex flex-col gap-7 p-8">

      {/* POST NOW — reactive quick triggers */}
      <div className="bg-[#0e0d0b] border border-white/7 p-7">
        <div className="flex items-center gap-2 mb-5 text-[10px] tracking-[.22em] uppercase text-[#b08d57]">
          Post now<div className="flex-1 h-px bg-white/10" />
          <span className="text-[#52504c] tracking-[.1em] normal-case text-[10px]">Pick a trigger — generate & copy</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Gig announced', context: 'gig just announced — upcoming show', desc: 'Announce a new show date' },
            { label: 'Track released', context: 'new track / release out now', desc: 'Release day post' },
            { label: 'Mix / recording live', context: 'new mix or recording just dropped', desc: 'Mix drop or recording post' },
          ].map(trigger => (
            <button
              key={trigger.label}
              onClick={() => {
                setContext(trigger.context)
                setTimeout(generateCaptions, 100)
                showToast(`Generating — ${trigger.label}`, 'Broadcast Lab')
                const el = document.querySelector('.caption-panel')
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="bg-[#1a1917] border border-white/7 p-5 text-left hover:border-[#b08d57]/50 hover:bg-[#141310] transition-colors group cursor-pointer"
            >
              <div className="text-[11px] tracking-[.12em] uppercase text-[#b08d57] mb-2 group-hover:text-[#c9a46e] transition-colors">{trigger.label}</div>
              <div className="text-[10px] tracking-[.06em] text-[#52504c]">{trigger.desc}</div>
              <div className="mt-3 text-[9px] tracking-[.16em] uppercase text-[#3a3830] group-hover:text-[#8a8780] transition-colors">Generate captions →</div>
            </button>
          ))}
        </div>
      </div>

      {/* REFERENCE ARTISTS */}
      <div>
        <div className="flex items-center gap-2 mb-4 text-[10px] tracking-[.22em] uppercase text-[#b08d57]">
          Reference artists — your lane
          <div className="flex-1 h-px bg-white/10" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {artists.map(artist => (
            <div key={artist.name} className="bg-[#0e0d0b] border border-white/7 p-5 relative group hover:border-white/13 transition-colors">
              {scanningArtist === artist.name && <div className="absolute top-0 left-0 right-0 h-px bg-[#b08d57] animate-pulse" />}
              <button onClick={() => { setArtists(prev => prev.filter(a => a.name !== artist.name)); removeArtistFromDb(artist.name); showToast(`${artist.name} removed`, 'Research') }}
                className="absolute top-3 right-3 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none">x</button>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-sm tracking-[.08em]">{artist.name}</div>
                  <div className="text-[10px] tracking-[.1em] text-[#8a8780] mt-1">{artist.handle} · {artist.genre}</div>
                </div>
                {artist.data_source === 'hikerapi' && artist.post_count_analysed ? (
                  <div className="text-[10px] tracking-[.1em] flex items-center gap-1.5 flex-shrink-0 text-[#3d6b4a]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#3d6b4a]" />
                    {artist.post_count_analysed} real posts
                  </div>
                ) : artist.data_source === 'apify' && artist.post_count_analysed ? (
                  <div className="text-[10px] tracking-[.1em] flex items-center gap-1.5 flex-shrink-0 text-[#3d6b4a]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#3d6b4a]" />
                    {artist.post_count_analysed} real posts
                  </div>
                ) : artist.data_source === 'manual' && artist.post_count_analysed ? (
                  <div className="text-[10px] tracking-[.1em] flex items-center gap-1.5 flex-shrink-0 text-[#b08d57]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#b08d57]" />
                    {artist.post_count_analysed} manual
                  </div>
                ) : (
                  <div className="text-[10px] tracking-[.1em] flex items-center gap-1.5 flex-shrink-0 text-[#9a6a5a]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#9a6a5a]" />
                    not verified
                  </div>
                )}
              </div>
              {artist.style_rules && (
                <div className="text-[11px] leading-relaxed text-[#8a8780] mb-4 border-l border-white/7 pl-3" style={{}}>
                  {artist.style_rules}
                </div>
              )}
              <div className="flex flex-col gap-2 mb-4">
                {[{l:'Lowercase',v:`${artist.lowercase_pct}%`,p:artist.lowercase_pct},{l:'Short captions',v:`${artist.short_caption_pct}%`,p:artist.short_caption_pct},{l:'No hashtags',v:`${artist.no_hashtags_pct}%`,p:artist.no_hashtags_pct,t:true}].map(b => (
                  <div key={b.l}>
                    <div className="flex justify-between">
                      <span className="text-[10px] tracking-[.08em] text-[#8a8780]">{b.l}</span>
                      <span className="text-[10px] tracking-[.08em]">{b.v}</span>
                    </div>
                    <Bar value={b.p} teal={b.t} />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {artist.chips.map((chip, i) => (
                  <span key={chip} className={`text-[10px] tracking-[.1em] uppercase px-2 py-1 border ${artist.highlight_chips.includes(i) ? 'border-[#b08d57]/35 text-[#b08d57]' : 'border-white/13 text-[#8a8780]'}`}>{chip}</span>
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
              <><div className="text-2xl text-[#2e2c29]">+</div><div className="text-[10px] tracking-[.15em] uppercase text-[#8a8780]">Add reference artist</div></>
            ) : (
              <div className="w-full flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                <input ref={addInputRef} value={newArtistName} onChange={e => setNewArtistName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newArtistName.trim()) { scanArtist(newArtistName.trim()); setNewArtistName(''); setAddingArtist(false) }
                    if (e.key === 'Escape') { setAddingArtist(false); setNewArtistName('') }
                  }}
                  placeholder="Artist name — press Enter"
                  className="w-full bg-[#1a1917] border border-[#b08d57] text-[#f0ebe2] font-mono text-[11px] px-3 py-2 outline-none placeholder-[#2e2c29]" />
                <div className="text-[10px] tracking-[.1em] text-[#2e2c29] text-center">Enter to scan · Escape to cancel</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TONE PROFILE */}
      <div className="bg-[#0e0d0b] border border-white/7 p-8">
        <div className="flex items-center gap-2 mb-6 text-[10px] tracking-[.22em] uppercase text-[#b08d57]">
          Live tone profile — NIGHT manoeuvres<div className="flex-1 h-px bg-white/10" />
        </div>
        <div className="grid grid-cols-3 gap-6 mb-7">
          {[
            {l:'Lowercase',v:`${Math.round(artists.reduce((a,b)=>a+b.lowercase_pct,0)/(artists.length||1))}%`,p:Math.round(artists.reduce((a,b)=>a+b.lowercase_pct,0)/(artists.length||1)),s:'Lane average across reference artists'},
            {l:'Under 10 words',v:`${Math.round(artists.reduce((a,b)=>a+b.short_caption_pct,0)/(artists.length||1))}%`,p:Math.round(artists.reduce((a,b)=>a+b.short_caption_pct,0)/(artists.length||1)),s:'Short captions in your lane'},
            {l:'No hashtags',v:`${Math.round(artists.reduce((a,b)=>a+b.no_hashtags_pct,0)/(artists.length||1))}%`,p:Math.round(artists.reduce((a,b)=>a+b.no_hashtags_pct,0)/(artists.length||1)),s:'Lane standard — hashtags hurt tone',t:true},
            {l:'Artists profiled',v:`${artists.length}`,p:Math.min(artists.length*20,100),s:artists.filter(a=>a.data_source==='apify'||a.data_source==='manual'||a.data_source==='hikerapi').length>0?`${artists.filter(a=>a.data_source==='apify'||a.data_source==='manual'||a.data_source==='hikerapi').length} from real captions`:'Add artists to build your lane'},
            {l:'Voice alignment',v:calcVoiceAlignment(artists).value,p:calcVoiceAlignment(artists).score,s:calcVoiceAlignment(artists).desc,t:true},
            {l:'Tone register',v:calcToneRegister(artists).value,p:calcToneRegister(artists).score,s:calcToneRegister(artists).desc},
          ].map(m => (
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
      </div>

      {/* TREND ENGINE */}
      <div className="bg-[#0e0d0b] border border-white/7 p-7">
        <div className="flex items-center gap-2 mb-2 text-[10px] tracking-[.22em] uppercase text-[#b08d57]">
          Trend engine — filtered for your lane<div className="flex-1 h-px bg-white/10" />
        </div>
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
      </div>

      {/* CAPTION GENERATOR */}
      <div className="bg-[#0e0d0b] border border-white/7 p-8 caption-panel">
        <div className="flex items-center gap-2 mb-5 text-[10px] tracking-[.22em] uppercase text-[#b08d57]">
          Caption generator — tuned to your voice<div className="flex-1 h-px bg-white/10" />
        </div>
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div>
            <label className="block text-[10px] tracking-[.18em] uppercase text-[#8a8780] mb-2">What happened</label>
            <input value={context} onChange={e => setContext(e.target.value)} placeholder="show, studio, flight..."
              className="w-full bg-[#1a1917] border border-white/7 text-[#f0ebe2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#b08d57] transition-colors placeholder-[#2e2c29]" />
          </div>
          <div>
            <label className="block text-[10px] tracking-[.18em] uppercase text-[#8a8780] mb-2">Platform</label>
            <select value={platform} onChange={e => setPlatform(e.target.value)} className="w-full bg-[#1a1917] border border-white/7 text-[#f0ebe2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#b08d57] transition-colors">
              {['Instagram','TikTok','X / Twitter'].map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] tracking-[.18em] uppercase text-[#8a8780] mb-2">Media type</label>
            <select value={media} onChange={e => setMedia(e.target.value)} className="w-full bg-[#1a1917] border border-white/7 text-[#f0ebe2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#b08d57] transition-colors">
              {['Crowd clip (video)','Show photo','Behind the decks','Studio photo','Travel / transit','No media'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mb-3">
          {(['post','carousel','story','reel'] as const).map(f => (
            <button key={f} onClick={() => setPostFormat(f)}
              className={`text-[10px] tracking-[.14em] uppercase px-3.5 py-1.5 border transition-colors ${postFormat===f ? 'border-[#b08d57] text-[#b08d57]' : 'border-white/13 text-[#8a8780] hover:border-white/20'}`}>
              {f}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mb-5">
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) uploadMedia(e.target.files) }} />
          <div className="flex items-center gap-3 mb-5 p-3 border border-white/7 bg-[#1a1917]">
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="text-[10px] tracking-[.14em] uppercase border border-white/13 text-[#8a8780] px-4 py-2 hover:border-[#b08d57] hover:text-[#b08d57] transition-colors disabled:opacity-40 flex items-center gap-2 flex-shrink-0">
              {uploading && <div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />}
              {uploading ? 'Uploading...' : 'Upload media'}
            </button>
            {mediaUrls.length > 0 ? (
              <div className="flex items-center gap-2 flex-1">
                <img src={mediaUrls[0]} className="w-10 h-10 object-cover" alt="preview" />
                <span className="text-[10px] tracking-[.1em] text-[#3d6b4a] flex-1 truncate">Media ready — will attach to post</span>
                <button onClick={() => setMediaUrls([])} className="text-[#8a8780] hover:text-red-400 text-xs">x</button>
              </div>
            ) : (
              <span className="text-[10px] tracking-[.08em] text-[#2e2c29] uppercase tracking-widest">No media — Instagram requires image or video</span>
            )}
          </div>

          {['Instagram','TikTok','X / Twitter'].map(p => (
            <button key={p} onClick={() => {setPlatform(p);setTimeout(generateCaptions,100)}}
              className={`text-[10px] tracking-[.14em] uppercase px-3.5 py-1.5 border transition-colors ${platform===p?'border-[#b08d57] text-[#b08d57]':'border-white/13 text-[#8a8780] hover:border-white/20'}`}>
              {p}
              {hasDirectConnection(p) && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[#6aaa7a] align-middle" title="Direct connection" />
              )}
            </button>
          ))}
          {/* Connection route indicator */}
          <div className="ml-auto text-[9px] tracking-[.12em] text-[#4a4845] uppercase flex items-center gap-1.5">
            {hasDirectConnection(platform) ? (
              <><span className="w-1.5 h-1.5 rounded-full bg-[#6aaa7a] inline-block" />Direct</>
            ) : (
              <><span className="w-1.5 h-1.5 rounded-full bg-[#b08d57] inline-block opacity-60" />Via Buffer</>
            )}
          </div>
        </div>
        {generatingCaptions && (
          <div className="flex items-center gap-2 text-[10px] tracking-[.1em] uppercase text-[#8a8780] mb-4">
            <div className="w-1 h-1 rounded-full bg-[#b08d57] animate-pulse" /><div className="w-1 h-1 rounded-full bg-[#b08d57] animate-pulse" style={{animationDelay:'.2s'}} /><div className="w-1 h-1 rounded-full bg-[#b08d57] animate-pulse" style={{animationDelay:'.4s'}} />
            <span>Generating captions — reading your tone profile...</span>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {variantKeys.map(key => {
            const v = captions?.[key]
            return (
              <div key={key} onClick={() => setSelectedVariant(key)}
                className={`bg-[#1a1917] border p-4 cursor-pointer transition-colors ${selectedVariant===key?'border-[#b08d57]':'border-white/7 hover:border-white/13'}`}>
                <div className="flex items-center gap-2 mb-2.5 text-[10px] tracking-[.18em] uppercase text-[#8a8780]">
                  {key.charAt(0).toUpperCase()+key.slice(1)}<div className="flex-1 h-px bg-white/10" />
                </div>
                {generatingCaptions ? <div className="h-16 bg-white/5 animate-pulse rounded" /> : (
                  <>
                    <div className="flex items-start gap-2 mb-2">
                      <div className="text-[12px] tracking-[.05em] leading-7 min-h-[72px] flex-1">{v?.text||''}</div>
                      <button onClick={e => { e.stopPropagation(); copyToClipboard(v?.text||'', key.charAt(0).toUpperCase()+key.slice(1)) }}
                        className="text-[10px] tracking-[.14em] uppercase text-[#8a8780] hover:text-[#b08d57] transition-colors flex-shrink-0 whitespace-nowrap mt-1">
                        Copy
                      </button>
                    </div>
                    <div className="text-[10px] text-[#8a8780] mt-1.5 leading-relaxed italic" style={{}}>{v?.reasoning||''}</div>
                    <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-white/7">
                      <button onClick={e=>{e.stopPropagation();publish(v?.text||'',platform,mediaUrls)}}
                        className="text-[10px] tracking-[.14em] uppercase text-[#b08d57] hover:opacity-100 transition-opacity">
                        {hasDirectConnection(platform) ? 'Publish →' : 'Schedule →'}
                      </button>
                      <div className="text-[10px] text-[#8a8780]">Est. <span className={v&&v.score>1600?'text-[#3d6b4a]':v&&v.score>1200?'text-[#b08d57]':'text-[#8a8780]'}>{v?formatScore(v.score):'...'}</span></div>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
        {captionError && <div className="bg-red-900/20 border border-red-800/40 text-red-300 text-[10px] px-4 py-3 mb-4">{captionError}</div>}
        <div className="flex items-center justify-between pt-4 border-t border-white/7">
          <div className="text-[9.5px] text-[#8a8780] italic flex-1 mr-4" style={{}}>
            Tuned to: {getArtistNames().join(' · ')} · your past posts
          </div>
          <div className="flex gap-2.5">
            <button onClick={generateCaptions} disabled={generatingCaptions}
              className="text-[10px] tracking-[.16em] uppercase border border-white/13 text-[#8a8780] px-5 py-2.5 hover:border-[#8a8780] hover:text-[#f0ebe2] transition-colors disabled:opacity-40 flex items-center gap-2">
              {generatingCaptions&&<div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />}
              {generatingCaptions?'Generating...':'Regenerate'}
            </button>
            <button onClick={() => publish(captions?.[selectedVariant]?.text||'', platform, mediaUrls)}
              disabled={publishing}
              className="text-[10px] tracking-[.16em] uppercase bg-[#b08d57] text-[#070706] px-5 py-2.5 hover:bg-[#c9a46e] transition-colors disabled:opacity-50">
              {publishing ? 'Posting...' : hasDirectConnection(platform) ? 'Publish →' : 'Schedule via Buffer →'}
            </button>
          </div>
        </div>
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
      {toast && (
        <div className="fixed bottom-7 right-7 bg-[#0e0d0b]/96 border border-white/13 px-5 py-3.5 text-[11px] tracking-[.07em] text-[#f0ebe2] z-50 max-w-xs leading-relaxed backdrop-blur-md">
          <div className="text-[10px] tracking-[.2em] uppercase text-[#b08d57] mb-1">{toast.tag}</div>
          {toast.msg}
        </div>
      )}

      </div>{/* end inner p-8 */}
      <SocialsMastermind />
    </div>
  )
}
