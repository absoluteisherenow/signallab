'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface ArtistProfile {
  name: string
  handle: string
  genre: string
  lowercase_pct: number
  short_caption_pct: number
  no_hashtags_pct: number
  chips: string[]
  highlight_chips: number[]
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

const DEFAULT_ARTISTS: ArtistProfile[] = [
  { name: 'Bicep', handle: '@bicepmusic', genre: 'Electronic / Dance', lowercase_pct: 96, short_caption_pct: 82, no_hashtags_pct: 91, chips: ['Observational', 'Sparse', 'No CTA', 'Lowercase'], highlight_chips: [0, 1] },
  { name: 'Floating Points', handle: '@floatingpoints', genre: 'Electronic', lowercase_pct: 88, short_caption_pct: 74, no_hashtags_pct: 97, chips: ['Minimal', 'Almost nothing', 'Archive feel'], highlight_chips: [0, 1] },
  { name: 'fred again..', handle: '@fredagainagain', genre: 'Electronic', lowercase_pct: 99, short_caption_pct: 65, no_hashtags_pct: 72, chips: ['Fragments', 'Personal', 'Raw', 'Emotional'], highlight_chips: [0, 2] },
  { name: 'Four Tet', handle: '@kiearnshaw', genre: 'Electronic', lowercase_pct: 87, short_caption_pct: 71, no_hashtags_pct: 89, chips: ['Deadpan', 'Dry humour', 'Brief'], highlight_chips: [0, 2] },
]

const TRENDS = [
  { id: 1, platform: 'TikTok · Electronic', name: 'Silent crowd clip — raw sound, no music overlay', fit: 94, hot: true, context: 'Silent crowd clip from a show — raw venue sound, no music overdub' },
  { id: 2, platform: 'Instagram · Electronic', name: 'One-word caption on a blurry show photo', fit: 89, hot: true, context: 'Blurry crowd photo from last show — single word or very short caption only' },
  { id: 3, platform: 'TikTok · Electronic / DJ', name: 'Behind the decks — uncut, full song playing', fit: 81, hot: false, context: 'Behind the decks clip — uncut, full track playing, no cuts' },
  { id: 4, platform: 'Instagram · Music general', name: 'Studio loop snippet — zero context caption', fit: 76, hot: false, context: 'Studio loop snippet — no context, no explanation, just the sound' },
  { id: 5, platform: 'X · Electronic', name: 'Process note — how long it actually took', fit: 68, hot: false, context: 'Process note about how long a track or project took — no explanation of why' },
]

async function callClaude(system: string, userPrompt: string, maxTokens = 600): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
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
  const [artists, setArtists] = useState<ArtistProfile[]>(DEFAULT_ARTISTS)
  const [addingArtist, setAddingArtist] = useState(false)
  const [newArtistName, setNewArtistName] = useState('')
  const [scanningArtist, setScanningArtist] = useState<string | null>(null)
  const [platform, setPlatform] = useState('Instagram')
  const [context, setContext] = useState('Pitch Festival — Saturday night show in Melbourne')

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
  const [captions, setCaptions] = useState<Captions | null>({
    safe: { text: 'pitch festival. still not sure what happened to saturday night.', reasoning: 'Observational, lowercase, slightly unresolved — matches lane tone.', score: 1400 },
    loose: { text: "something about that room felt different. can't explain it.", reasoning: 'Fragment structure, withholds explanation — strong save trigger.', score: 1700 },
    raw: { text: 'still processing last night tbh', reasoning: 'Feels like a personal note — highest save rate in this lane.', score: 1900 },
  })
  const [selectedVariant, setSelectedVariant] = useState<'safe' | 'loose' | 'raw'>('loose')
  const [generatingCaptions, setGeneratingCaptions] = useState(false)
  const [captionError, setCaptionError] = useState('')
  const [trendCaptions, setTrendCaptions] = useState<Record<number, string>>({})
  const [loadingTrends, setLoadingTrends] = useState(false)
  const [generatingWeek, setGeneratingWeek] = useState(false)
  const [postFormat, setPostFormat] = useState<'post' | 'carousel' | 'story' | 'reel'>('post')
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    } else {
      await Promise.all(DEFAULT_ARTISTS.map(a => saveArtist(a)))
    }
  }

  async function saveArtist(artist: ArtistProfile) {
    await supabase.from('artist_profiles').upsert(artist, { onConflict: 'name' })
  }

  async function removeArtistFromDb(name: string) {
    await supabase.from('artist_profiles').delete().eq('name', name)
  }

  useEffect(() => {
    loadArtists()
    setTimeout(() => loadTrendCaptions(), 800)
    setTimeout(() => generateCaptions(), 1200)
  }, [])

  useEffect(() => {
    if (addingArtist) setTimeout(() => addInputRef.current?.focus(), 50)
  }, [addingArtist])

  const getArtistNames = () => artists.map(a => a.name)

  async function scanArtist(name: string) {
    setScanningArtist(name)
    showToast(`Scanning ${name}...`, 'Research')
    try {
      const raw = await callClaude(
        'You are a social media tone analyst. Respond ONLY with valid JSON, no markdown.',
        `Analyse the social media posting style of music artist "${name}". Return JSON: {"handle":"@handle","genre":"genre","lowercase_pct":number,"short_caption_pct":number,"no_hashtags_pct":number,"chips":["tag1","tag2","tag3"],"highlight_chips":[0,1]}`,
        200
      )
      const d = JSON.parse(raw.replace(/\`\`\`json|\`\`\`/g, '').trim())
      setArtists(prev => [...prev, { name, ...d } as ArtistProfile]); saveArtist({ name, ...d } as ArtistProfile)
      showToast(`${name} added — tone profile updated`, 'Done')
    } catch {
      const a2 = { name, handle: `@${name.toLowerCase().replace(/\s/g, '')}`, genre: 'Electronic', lowercase_pct: 84, short_caption_pct: 69, no_hashtags_pct: 77, chips: ['Added', 'Analysed'], highlight_chips: [0] } as ArtistProfile
      setArtists(prev => [...prev, a2])
      saveArtist(a2)
      showToast(`${name} added to your lane`, 'Done')
    } finally {
      setScanningArtist(null)
    }
  }

  async function loadTrendCaptions() {
    setLoadingTrends(true)
    try {
      const names = getArtistNames().slice(0, 3).join(', ')
      const raw = await callClaude(
        `You write social captions for electronic music artists in the style of ${names}. Lowercase, no hashtags, under 10 words. Respond ONLY with a JSON array.`,
        `Write one example caption for each format: ${TRENDS.map((t, i) => `${i + 1}. ${t.name}`).join(' | ')}. Return: ["cap1","cap2","cap3","cap4","cap5"]`,
        250
      )
      const caps = JSON.parse(raw.replace(/\`\`\`json|\`\`\`/g, '').trim())
      const map: Record<number, string> = {}
      TRENDS.forEach((t, i) => { if (caps[i]) map[t.id] = `"${caps[i]}"` })
      setTrendCaptions(map)
    } catch {
      const fallback: Record<number, string> = {}
      TRENDS.forEach(t => { fallback[t.id] = 'caption loads with your profile' })
      setTrendCaptions(fallback)
    } finally {
      setLoadingTrends(false)
    }
  }

  async function generateCaptions() {
    setGeneratingCaptions(true)
    setCaptionError('')
    try {
      const names = getArtistNames().join(', ')
      const raw = await callClaude(
        `You write social media captions for NIGHT manoeuvres, an Australian electronic artist. Tone reference: ${names}. Rules: all lowercase, no hashtags (Instagram/X), no exclamation marks, never explain the photo, feels like a personal text. Safe = human but slightly complete. Loose = fragment, unresolved, no CTA. Raw = as short as possible. TikTok only: max 2 genre hashtags ok. Respond ONLY with valid JSON, no markdown.`,
        `Context: ${context}\nPlatform: ${platform}\nMedia: ${media}\nReturn: {"safe":{"text":"...","reasoning":"...","score":number},"loose":{"text":"...","reasoning":"...","score":number},"raw":{"text":"...","reasoning":"...","score":number}} Scores 800-2500.`,
        400
      )
      const d = JSON.parse(raw.replace(/\`\`\`json|\`\`\`/g, '').trim())
      setCaptions(d)
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
      
      // Save to Supabase scheduled_posts table
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

  async function generateFullWeek() {
    setGeneratingWeek(true)
    try {
      const names = getArtistNames().join(', ')
      await callClaude(
        'You are a social media strategist for electronic music artists. Respond ONLY with valid JSON.',
        `Generate a 5-post week for NIGHT manoeuvres. Tone: ${names}. Rules: lowercase, no hashtags (IG/X), minimal. Return: [{"day":"Mon","platform":"Instagram","caption":"...","media":"...","effort":"1/10"}]`,
        600
      )
      showToast('Week generated — 5 posts ready. Review in Calendar.', 'Done')
    } catch (err: any) {
      showToast(`Failed: ${err.message}`, 'Error')
    } finally {
      setGeneratingWeek(false)
    }
  }

  function useTrend(trendContext: string) {
    setContext(trendContext)
    setTimeout(generateCaptions, 300)
    showToast('Trend applied — generating captions', 'AI')
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
    <div className="min-h-screen bg-[#070706] text-[#f0ebe2] font-mono p-8 flex flex-col gap-7">

      {/* HEADER */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[9px] tracking-[.3em] uppercase text-[#b08d57] flex items-center gap-3 mb-3">
            <span className="block w-7 h-px bg-[#b08d57]" />
            Broadcast Lab — Tone Intelligence
          </div>
          <div className="text-3xl tracking-[.04em] font-light">
            Tone <span className="italic text-[#b08d57]" style={{fontFamily:'Georgia,serif'}}>intelligence</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-[9px] tracking-[.13em] uppercase text-[#8a8780] leading-7 mr-4">
            <div>Last scan — 2 hours ago</div>
            <div>Profile confidence — <span className="text-[#b08d57]">High</span></div>
          </div>
          <button onClick={generateFullWeek} disabled={generatingWeek}
            className="text-[9px] tracking-[.18em] uppercase bg-[#b08d57] text-[#070706] px-5 py-2.5 hover:bg-[#c9a46e] transition-colors disabled:opacity-50 flex items-center gap-2">
            {generatingWeek && <div className="w-2 h-2 border border-[#070706] border-t-transparent rounded-full animate-spin" />}
            {generatingWeek ? 'Generating...' : 'Generate week'}
          </button>
        </div>
      </div>

      {/* REFERENCE ARTISTS */}
      <div>
        <div className="flex items-center gap-2 mb-4 text-[8.5px] tracking-[.22em] uppercase text-[#b08d57]">
          Reference artists — your lane
          <div className="flex-1 h-px bg-white/10" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {artists.map(artist => (
            <div key={artist.name} className="bg-[#0e0d0b] border border-white/7 p-5 relative group hover:border-white/13 transition-colors">
              {scanningArtist === artist.name && <div className="absolute top-0 left-0 right-0 h-px bg-[#b08d57] animate-pulse" />}
              <button onClick={() => { setArtists(prev => prev.filter(a => a.name !== artist.name)); removeArtistFromDb(artist.name); showToast(`${artist.name} removed`, 'Research') }}
                className="absolute top-3 right-3 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none">x</button>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-sm tracking-[.08em]">{artist.name}</div>
                  <div className="text-[9px] tracking-[.1em] text-[#8a8780] mt-1">{artist.handle} · {artist.genre}</div>
                </div>
                <div className="text-[8px] tracking-[.12em] uppercase text-[#3d6b4a] flex items-center gap-1 flex-shrink-0">
                  <div className="w-1 h-1 rounded-full bg-[#3d6b4a]" />Scanned
                </div>
              </div>
              <div className="flex flex-col gap-2 mb-4">
                {[{l:'Lowercase',v:`${artist.lowercase_pct}%`,p:artist.lowercase_pct},{l:'Short captions',v:`${artist.short_caption_pct}%`,p:artist.short_caption_pct},{l:'No hashtags',v:`${artist.no_hashtags_pct}%`,p:artist.no_hashtags_pct,t:true}].map(b => (
                  <div key={b.l}>
                    <div className="flex justify-between">
                      <span className="text-[9px] tracking-[.08em] text-[#8a8780]">{b.l}</span>
                      <span className="text-[9px] tracking-[.08em]">{b.v}</span>
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
          <div onClick={() => !addingArtist && setAddingArtist(true)}
            className="bg-[#0e0d0b] border border-dashed border-white/13 p-5 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[#b08d57] hover:bg-[#141310] transition-colors min-h-[176px]">
            {!addingArtist ? (
              <><div className="text-2xl text-[#2e2c29]">+</div><div className="text-[9px] tracking-[.15em] uppercase text-[#8a8780]">Add reference artist</div></>
            ) : (
              <div className="w-full flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                <input ref={addInputRef} value={newArtistName} onChange={e => setNewArtistName(e.target.value)}
                  onKeyDown={e => { if(e.key==='Enter'&&newArtistName.trim()){scanArtist(newArtistName.trim());setNewArtistName('');setAddingArtist(false)} if(e.key==='Escape'){setAddingArtist(false);setNewArtistName('')} }}
                  placeholder="Artist name — press Enter"
                  className="w-full bg-[#1a1917] border border-[#b08d57] text-[#f0ebe2] font-mono text-[11px] px-3 py-2 outline-none placeholder-[#2e2c29]" />
                <div className="text-[8.5px] tracking-[.1em] text-[#2e2c29] text-center">Enter to scan · Escape to cancel</div>
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
          {[{l:'Lowercase',v:'92%',p:92,s:'Lane avg: 93%'},{l:'Under 8 words',v:'74%',p:74,s:'Lane avg: 77%'},{l:'No hashtags',v:'83%',p:83,s:'Lane avg: 91% — reduce yours',t:true},{l:'Video over photo',v:'2.3x',p:65,s:'Lane avg: 2.6x'},{l:'No caption explanation',v:'88%',p:88,s:'Caption never explains photo',t:true},{l:'Tone register',v:'Raw',p:79,s:'Detached · observational'}].map(m => (
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
          {['Clips with no talking perform 38% better than talking-to-camera in this lane','Posts within 6 hours of a show outperform studio posts by 2.1x on saves','Captions under 8 words get 34% more saves across all reference artists','Tuesday and Thursday 10pm are peak windows — Sunday underperforms consistently','Your hashtag use is above your lane average — reducing will improve tone alignment'].map((ins,i) => (
            <div key={i} className="flex gap-3 py-3 border-b border-white/7 last:border-0 text-[12px] tracking-[.07em] text-[#8a8780] leading-relaxed hover:text-white/60 hover:pl-1 transition-all cursor-default">
              <span className="text-[#b08d57] opacity-70 flex-shrink-0">-&gt;</span>{ins}
            </div>
          ))}
        </div>
      </div>

      {/* TREND ENGINE */}
      <div className="bg-[#0e0d0b] border border-white/7 p-7">
        <div className="flex items-center gap-2 mb-2 text-[8.5px] tracking-[.22em] uppercase text-[#b08d57]">
          Trend engine — filtered for your lane<div className="flex-1 h-px bg-white/10" />
        </div>
        <div className="text-[10px] tracking-[.07em] text-[#8a8780] mb-5 italic" style={{fontFamily:'Georgia,serif'}}>Only trends already moving in electronic / dance. Never mainstream pop.</div>
        {loadingTrends && (
          <div className="flex items-center gap-2 text-[9px] tracking-[.1em] uppercase text-[#8a8780] mb-4">
            <div className="w-1 h-1 rounded-full bg-[#b08d57] animate-pulse" /><div className="w-1 h-1 rounded-full bg-[#b08d57] animate-pulse" style={{animationDelay:'.2s'}} /><div className="w-1 h-1 rounded-full bg-[#b08d57] animate-pulse" style={{animationDelay:'.4s'}} />
            <span>Analysing trend fit...</span>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          {TRENDS.map(trend => (
            <div key={trend.id} className={`bg-[#1a1917] border p-4 relative hover:bg-[#141310] transition-colors ${trend.hot ? 'border-[#b08d57]/30' : 'border-white/7'}`}>
              {trend.hot && <div className="absolute top-2.5 right-2.5 text-[7px] tracking-[.16em] text-[#b08d57] bg-[#b08d57]/10 px-1.5 py-0.5">HOT</div>}
              <div className="text-[8px] tracking-[.15em] uppercase text-[#8a8780] mb-2">{trend.platform}</div>
              <div className="text-[11px] tracking-[.06em] mb-2 leading-snug">{trend.name}</div>
              <div className="text-[10px] text-[#8a8780] leading-relaxed mb-3 italic min-h-[32px]" style={{fontFamily:'Georgia,serif'}}>{trendCaptions[trend.id] || 'Loading...'}</div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[8.5px] tracking-[.1em] text-[#8a8780]">Lane fit</span>
                <div className="flex-1 h-px bg-white/10 relative"><div className="absolute top-0 left-0 h-px bg-[#b08d57]" style={{width:`${trend.fit}%`}} /></div>
                <span className="text-[9px] text-[#b08d57]">{trend.fit}%</span>
              </div>
              <button onClick={() => useTrend(trend.context)} className="w-full text-[8px] tracking-[.15em] uppercase border border-white/13 text-[#8a8780] py-2 hover:border-[#b08d57] hover:text-[#b08d57] transition-colors">Use this trend -&gt;</button>
            </div>
          ))}
          <div className="bg-[#1a1917] border border-dashed border-white/13 flex flex-col items-center justify-center gap-2 min-h-[160px]">
            <div className="text-[9px] tracking-[.15em] uppercase text-[#2e2c29]">Next scan</div>
            <div className="text-xl font-light text-[#8a8780]">6h 42m</div>
            <button onClick={() => {loadTrendCaptions();showToast('Refreshing trends...','Trends')}} className="text-[8px] tracking-[.14em] uppercase border border-white/13 text-[#8a8780] px-3 py-1.5 mt-1 hover:border-[#b08d57] hover:text-[#b08d57] transition-colors">Refresh now</button>
          </div>
        </div>
      </div>

      {/* CAPTION GENERATOR */}
      <div className="bg-[#0e0d0b] border border-white/7 p-8 caption-panel">
        <div className="flex items-center gap-2 mb-5 text-[8.5px] tracking-[.22em] uppercase text-[#b08d57]">
          Caption generator — real AI, tuned to your voice<div className="flex-1 h-px bg-white/10" />
        </div>
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div>
            <label className="block text-[8px] tracking-[.18em] uppercase text-[#8a8780] mb-2">What happened</label>
            <input value={context} onChange={e => setContext(e.target.value)} placeholder="show, studio, flight..."
              className="w-full bg-[#1a1917] border border-white/7 text-[#f0ebe2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#b08d57] transition-colors placeholder-[#2e2c29]" />
          </div>
          <div>
            <label className="block text-[8px] tracking-[.18em] uppercase text-[#8a8780] mb-2">Platform</label>
            <select value={platform} onChange={e => setPlatform(e.target.value)} className="w-full bg-[#1a1917] border border-white/7 text-[#f0ebe2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#b08d57] transition-colors">
              {['Instagram','TikTok','X / Twitter'].map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[8px] tracking-[.18em] uppercase text-[#8a8780] mb-2">Media type</label>
            <select value={media} onChange={e => setMedia(e.target.value)} className="w-full bg-[#1a1917] border border-white/7 text-[#f0ebe2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#b08d57] transition-colors">
              {['Crowd clip (video)','Show photo','Behind the decks','Studio photo','Travel / transit','No media'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mb-3">
          {(['post','carousel','story','reel'] as const).map(f => (
            <button key={f} onClick={() => setPostFormat(f)}
              className={`text-[8.5px] tracking-[.14em] uppercase px-3.5 py-1.5 border transition-colors ${postFormat===f ? 'border-[#b08d57] text-[#b08d57]' : 'border-white/13 text-[#8a8780] hover:border-white/20'}`}>
              {f}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mb-5">
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) uploadMedia(e.target.files) }} />
          <div className="flex items-center gap-3 mb-5 p-3 border border-white/7 bg-[#1a1917]">
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="text-[8.5px] tracking-[.14em] uppercase border border-white/13 text-[#8a8780] px-4 py-2 hover:border-[#b08d57] hover:text-[#b08d57] transition-colors disabled:opacity-40 flex items-center gap-2 flex-shrink-0">
              {uploading && <div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />}
              {uploading ? 'Uploading...' : 'Upload media'}
            </button>
            {mediaUrls.length > 0 ? (
              <div className="flex items-center gap-2 flex-1">
                <img src={mediaUrls[0]} className="w-10 h-10 object-cover" alt="preview" />
                <span className="text-[9px] tracking-[.1em] text-[#3d6b4a] flex-1 truncate">Media ready — will attach to post</span>
                <button onClick={() => setMediaUrls([])} className="text-[#8a8780] hover:text-red-400 text-xs">x</button>
              </div>
            ) : (
              <span className="text-[9px] tracking-[.08em] text-[#2e2c29] uppercase tracking-widest">No media — Instagram requires image or video</span>
            )}
          </div>

          {['Instagram','TikTok','X / Twitter'].map(p => (
            <button key={p} onClick={() => {setPlatform(p);setTimeout(generateCaptions,100)}}
              className={`text-[8.5px] tracking-[.14em] uppercase px-3.5 py-1.5 border transition-colors ${platform===p?'border-[#b08d57] text-[#b08d57]':'border-white/13 text-[#8a8780] hover:border-white/20'}`}>{p}</button>
          ))}
        </div>
        {generatingCaptions && (
          <div className="flex items-center gap-2 text-[9px] tracking-[.1em] uppercase text-[#8a8780] mb-4">
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
                <div className="flex items-center gap-2 mb-2.5 text-[8px] tracking-[.18em] uppercase text-[#8a8780]">
                  {key.charAt(0).toUpperCase()+key.slice(1)}<div className="flex-1 h-px bg-white/10" />
                </div>
                {generatingCaptions ? <div className="h-16 bg-white/5 animate-pulse rounded" /> : (
                  <>
                    <div className="flex items-start gap-2 mb-2">
                      <div className="text-[12px] tracking-[.05em] leading-7 min-h-[72px] flex-1">{v?.text||''}</div>
                      <button onClick={e => { e.stopPropagation(); copyToClipboard(v?.text||'', key.charAt(0).toUpperCase()+key.slice(1)) }}
                        className="text-[8.5px] tracking-[.14em] uppercase text-[#8a8780] hover:text-[#b08d57] transition-colors flex-shrink-0 whitespace-nowrap mt-1">
                        Copy
                      </button>
                    </div>
                    <div className="text-[9px] text-[#8a8780] mt-1.5 leading-relaxed italic" style={{fontFamily:'Georgia,serif'}}>{v?.reasoning||''}</div>
                    <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-white/7">
                      <button onClick={e=>{e.stopPropagation();scheduleToBuffer(v?.text||'',platform,mediaUrls)}}
                        className="text-[8.5px] tracking-[.14em] uppercase text-[#b08d57] hover:opacity-100 transition-opacity">Schedule -&gt;</button>
                      <div className="text-[9px] text-[#8a8780]">Est. <span className={v&&v.score>1600?'text-[#3d6b4a]':v&&v.score>1200?'text-[#b08d57]':'text-[#8a8780]'}>{v?formatScore(v.score):'...'}</span></div>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
        {captionError && <div className="bg-red-900/20 border border-red-800/40 text-red-300 text-[10px] px-4 py-3 mb-4">{captionError}</div>}
        <div className="flex items-center justify-between pt-4 border-t border-white/7">
          <div className="text-[9.5px] text-[#8a8780] italic flex-1 mr-4" style={{fontFamily:'Georgia,serif'}}>
            Tuned to: {getArtistNames().join(' · ')} · your past posts
          </div>
          <div className="flex gap-2.5">
            <button onClick={generateCaptions} disabled={generatingCaptions}
              className="text-[9px] tracking-[.16em] uppercase border border-white/13 text-[#8a8780] px-5 py-2.5 hover:border-[#8a8780] hover:text-[#f0ebe2] transition-colors disabled:opacity-40 flex items-center gap-2">
              {generatingCaptions&&<div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />}
              {generatingCaptions?'Generating...':'Regenerate'}
            </button>
            <button onClick={() => scheduleToBuffer(captions?.[selectedVariant]?.text||'', platform, mediaUrls)}
              className="text-[9px] tracking-[.16em] uppercase bg-[#b08d57] text-[#070706] px-5 py-2.5 hover:bg-[#c9a46e] transition-colors">
              Schedule best -&gt;
            </button>
          </div>
        </div>
      </div>

      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-7 right-7 bg-[#0e0d0b]/96 border border-white/13 px-5 py-3.5 text-[11px] tracking-[.07em] text-[#f0ebe2] z-50 max-w-xs leading-relaxed backdrop-blur-md">
          <div className="text-[8px] tracking-[.2em] uppercase text-[#b08d57] mb-1">{toast.tag}</div>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
