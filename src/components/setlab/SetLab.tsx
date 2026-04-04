'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { analyseAudioFile } from '@/lib/audioAnalysis'
import { ScanPulse } from '@/components/ui/ScanPulse'

async function callClaude(system: string, userPrompt: string, maxTokens = 800): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, max_tokens: maxTokens, messages: [{ role: 'user', content: userPrompt }] }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `API error ${res.status}`)
  }
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

// ── Track Intelligence Types ─────────────────────────────────────────────
interface Track {
  id: string
  title: string
  artist: string
  bpm: number
  key: string
  camelot: string
  energy: number          // 1-10
  genre: string
  duration: string
  notes: string
  analysed: boolean
  // Intelligence fields
  moment_type: string     // opener, builder, peak, breakdown, closer
  position_score: string  // warm-up, build, peak, cool-down
  mix_in: string          // how to bring this track in
  mix_out: string         // how to transition out
  crowd_reaction: string  // expected crowd response
  similar_to: string      // similar tracks in library
  producer_style: string  // "Four Tet-esque organic textures" etc
  crowd_hits?: number     // times tagged as standout in post-gig debrief
  source?: string
  discovered_via?: any
  spotify_url?: string
  album_art?: string
}

interface SetTrack extends Track {
  position: number
  transition_note: string
  compatibility: number
  flow_score: number      // 0-100, overall flow quality with previous track
}

// ── Camelot Wheel ────────────────────────────────────────────────────────
const CAMELOT_WHEEL: Record<string, string[]> = {
  '1A': ['1A', '2A', '12A', '1B'], '2A': ['2A', '3A', '1A', '2B'], '3A': ['3A', '4A', '2A', '3B'],
  '4A': ['4A', '5A', '3A', '4B'], '5A': ['5A', '6A', '4A', '5B'], '6A': ['6A', '7A', '5A', '6B'],
  '7A': ['7A', '8A', '6A', '7B'], '8A': ['8A', '9A', '7A', '8B'], '9A': ['9A', '10A', '8A', '9B'],
  '10A': ['10A', '11A', '9A', '10B'], '11A': ['11A', '12A', '10A', '11B'], '12A': ['12A', '1A', '11A', '12B'],
  '1B': ['1B', '2B', '12B', '1A'], '2B': ['2B', '3B', '1B', '2A'], '3B': ['3B', '4B', '2B', '3A'],
  '4B': ['4B', '5B', '3B', '4A'], '5B': ['5B', '6B', '4B', '5A'], '6B': ['6B', '7B', '5B', '6A'],
  '7B': ['7B', '8B', '6B', '7A'], '8B': ['8B', '9B', '7B', '8A'], '9B': ['9B', '10B', '8B', '9A'],
  '10B': ['10B', '11B', '9B', '10A'], '11B': ['11B', '12B', '10B', '11A'], '12B': ['12B', '1B', '11B', '12A'],
}

function getCompatibility(a: string, b: string): number {
  if (a === b) return 100
  const compatible = CAMELOT_WHEEL[a] || []
  if (compatible.includes(b)) return 85
  const aNum = parseInt(a), bNum = parseInt(b)
  if (!isNaN(aNum) && !isNaN(bNum) && Math.abs(aNum - bNum) <= 2) return 60
  return 30
}

function getFlowScore(prev: Track, next: Track): number {
  const keyCompat = getCompatibility(prev.camelot, next.camelot)
  const bpmDiff = Math.abs(prev.bpm - next.bpm)
  const bpmScore = bpmDiff <= 2 ? 100 : bpmDiff <= 4 ? 85 : bpmDiff <= 8 ? 60 : bpmDiff <= 12 ? 40 : 20
  const energyDiff = Math.abs(prev.energy - next.energy)
  const energyScore = energyDiff <= 1 ? 100 : energyDiff <= 2 ? 80 : energyDiff <= 3 ? 55 : 30
  return Math.round(keyCompat * 0.45 + bpmScore * 0.30 + energyScore * 0.25)
}

function getCompatibilityColor(score: number): string {
  if (score >= 80) return '#3d6b4a'
  if (score >= 60) return '#b08d57'
  return '#9a6a5a'
}

function getMomentColor(type: string): string {
  switch (type) {
    case 'opener': return '#6a7a9a'
    case 'builder': return '#3d6b4a'
    case 'peak': return '#b08d57'
    case 'breakdown': return '#7a5a8a'
    case 'closer': return '#6a7a9a'
    default: return '#52504c'
  }
}

// ── Sample Library ───────────────────────────────────────────────────────
const SAMPLE_LIBRARY: Track[] = [
  { id: '1', title: 'Glue', artist: 'Bicep', bpm: 122, key: 'F minor', camelot: '4A', energy: 7, genre: 'Electronic', duration: '5:42', notes: 'Perfect opener — builds slowly', analysed: true, moment_type: 'opener', position_score: 'warm-up', mix_in: 'Long blend from 16 bars out, filter sweep up', mix_out: 'Let breakdown play, bring next track under pads', crowd_reaction: 'Recognition — heads nodding, smiles', similar_to: 'Atlas by Bicep, Opal by Bicep', producer_style: 'Bicep signature: euphoric pads over broken beat' },
  { id: '2', title: 'For', artist: 'Four Tet', bpm: 128, key: 'A minor', camelot: '8A', energy: 6, genre: 'Electronic', duration: '6:15', notes: '', analysed: true, moment_type: 'builder', position_score: 'build', mix_in: 'Cut bass, layer percussion, swap low end at phrase', mix_out: 'Ride the hats, pull back, blend with next kick', crowd_reaction: 'Hypnotic — locked in, eyes closed', similar_to: 'Baby by Four Tet, Two Thousand and Seventeen', producer_style: 'Four Tet: organic textures over precise rhythms' },
  { id: '3', title: 'Strands', artist: 'Floating Points', bpm: 130, key: 'D minor', camelot: '7A', energy: 8, genre: 'Electronic', duration: '7:20', notes: 'Crowd always reacts to the drop', analysed: true, moment_type: 'peak', position_score: 'peak', mix_in: 'Build tension with EQ, drop both kicks together', mix_out: 'Use the breakdown, swap under the pad wash', crowd_reaction: 'Hands up at the drop, full energy', similar_to: 'LNR by Floating Points, Nuits Sonores', producer_style: 'Floating Points: jazz-influenced electronic with live feel' },
  { id: '4', title: 'Marea', artist: 'Fred again..', bpm: 132, key: 'C major', camelot: '8B', energy: 9, genre: 'Electronic', duration: '4:55', notes: 'Peak time only', analysed: true, moment_type: 'peak', position_score: 'peak', mix_in: 'Hard swap after breakdown, instant energy', mix_out: 'Let vocal ring, quick cut to next', crowd_reaction: 'Eruption — arms up, singing along', similar_to: 'Jungle by Fred again, Turn On The Lights', producer_style: 'Fred again: vocal sampling, emotional build, UK rave energy' },
  { id: '5', title: 'Kexp', artist: 'Bicep', bpm: 126, key: 'Bb minor', camelot: '2A', energy: 8, genre: 'Electronic', duration: '6:30', notes: '', analysed: true, moment_type: 'peak', position_score: 'peak', mix_in: 'Build from percussion, introduce melody gradually', mix_out: 'Extended mix, ride the synths out', crowd_reaction: 'Arms in the air — feels like the main moment', similar_to: 'Glue by Bicep, Apricots by Bicep', producer_style: 'Bicep signature: rave nostalgia meets modern production' },
  { id: '6', title: 'Baby', artist: 'Four Tet', bpm: 124, key: 'G major', camelot: '9B', energy: 5, genre: 'Electronic', duration: '5:10', notes: 'Great for early set or cool-down', analysed: true, moment_type: 'closer', position_score: 'cool-down', mix_in: 'Gentle EQ blend, let it breathe', mix_out: 'Fade naturally, no rush', crowd_reaction: 'Swaying, gentle energy, reflective', similar_to: 'For by Four Tet, Planet by Four Tet', producer_style: 'Four Tet: delicate, textural, emotionally layered' },
  { id: '7', title: 'LNR', artist: 'Floating Points', bpm: 134, key: 'E minor', camelot: '9A', energy: 9, genre: 'Techno', duration: '8:05', notes: '', analysed: true, moment_type: 'peak', position_score: 'peak', mix_in: 'Loop intro, build with hats, drop together', mix_out: 'Ride breakdown, long 32 bar blend out', crowd_reaction: 'Deep commitment — the dancefloor is locked', similar_to: 'Strands by Floating Points, Ratio', producer_style: 'Floating Points: hypnotic repetition with micro-variations' },
  { id: '8', title: 'Jungle', artist: 'Drake feat. Tems', bpm: 120, key: 'G minor', camelot: '6A', energy: 7, genre: 'Afrobeats', duration: '3:45', notes: 'Crowd pleaser — use sparingly', analysed: true, moment_type: 'builder', position_score: 'build', mix_in: 'Acappella over outgoing track, then drop', mix_out: 'Cut during verse, blend next track percussion', crowd_reaction: 'Instant recognition — phones out, singing', similar_to: '', producer_style: 'Smooth Afrobeats production, vocal-driven' },
]


export function SetLab() {
  const [activeTab, setActiveTab] = useState<'library' | 'builder' | 'history' | 'discover' | 'scanner' | 'intelligence'>('library')
  const [library, setLibrary] = useState<Track[]>([])
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [editingTrack, setEditingTrack] = useState<Track | null>(null)
  const [reanalysing, setReanalysing] = useState<string | null>(null)
  const [set, setSet] = useState<SetTrack[]>([])
  const [setName, setSetName] = useState('New Set')
  const [venue, setVenue] = useState('')
  const [slotType, setSlotType] = useState('Club — peak time')
  const [setLength, setSetLength] = useState('60')
  const [narrative, setNarrative] = useState('')
  const [generatingNarrative, setGeneratingNarrative] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [addingTrack, setAddingTrack] = useState(false)
  const [newTrack, setNewTrack] = useState({ title: '', artist: '' })
  const [analysingTrack, setAnalysingTrack] = useState(false)
  const [expandedTrack, setExpandedTrack] = useState<string | null>(null)
  const [suggestingNext, setSuggestingNext] = useState(false)
  const [suggestions, setSuggestions] = useState<{ id: string; reason: string }[]>([])
  const [toast, setToast] = useState<{ msg: string; tag: string } | null>(null)
  const [pastSets, setPastSets] = useState<any[]>([])
  const [audioUploading, setAudioUploading] = useState(false)
  const [audioProgress, setAudioProgress] = useState('')
  const [dragOver, setDragOver] = useState(false)
  // ── Discover state ──────────────────────────────────────────────────────
  const [discoverResults, setDiscoverResults] = useState<any[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [discoverError, setDiscoverError] = useState('')
  const [maxPopularity, setMaxPopularity] = useState(35)
  const [discoverMeta, setDiscoverMeta] = useState<{ targetCamelot: string; targetBpm: number; debug?: any } | null>(null)
  const [discoverCallCount, setDiscoverCallCount] = useState(0)
  const [raChartedCount, setRaChartedCount] = useState(0)
  const [raOnlyFilter, setRaOnlyFilter] = useState(false)
  // RA rich index: key → attribution
  const raRichMapRef = useRef<Map<string, { charted_by: string; chart_title: string }>>(new Map())
  // ── Crate Dig state ────────────────────────────────────────────────────
  const [discoverMode, setDiscoverMode] = useState<'beatport' | 'crate'>('beatport')
  const [discoverSource, setDiscoverSource] = useState<string>('current-set') // 'current-set', 'library', 'playlist:Name', 'set:id'
  const [crateDigTrack, setCrateDigTrack] = useState<Track | null>(null)
  const [crateDigAxis, setCrateDigAxis] = useState<'label' | 'artist' | 'style' | 'credit'>('label')
  const [crateDigResults, setCrateDigResults] = useState<any[]>([])
  const [crateDigLoading, setCrateDigLoading] = useState(false)
  const [crateDigError, setCrateDigError] = useState('')
  const [crateDigMeta, setCrateDigMeta] = useState<{ label_name?: string; artist_name?: string; style?: string; year_range?: string; credits?: any[]; release_title?: string } | null>(null)
  const crateDigResolveCache = useRef<Map<string, any>>(new Map())
  const [crateTrackSearch, setCrateTrackSearch] = useState('')
  const [crateTrackDropdown, setCrateTrackDropdown] = useState(false)
  // ── Wantlist state ─────────────────────────────────────────────────────
  const [wantlist, setWantlist] = useState<any[]>([])
  const [wantlistLoading, setWantlistLoading] = useState(false)
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set())
  const [playingTrack, setPlayingTrack] = useState<{ id: string; title: string; artist: string; spotify_url: string; album_art?: string } | null>(null)
  // libraryMode removed — Library tab now shows all sections
  const audioInputRef = useRef<HTMLInputElement>(null)
  const screenshotInputRef = useRef<HTMLInputElement>(null)
  const [screenshotImporting, setScreenshotImporting] = useState(false)
  const [screenshotImportDrag, setScreenshotImportDrag] = useState(false)
  const [screenshotImportProgress, setScreenshotImportProgress] = useState('')
  const toastTimer = useRef<NodeJS.Timeout | null>(null)
  // ── Mix Scanner state ───────────────────────────────────────────────────
  const [scannerTracklist, setScannerTracklist] = useState('')
  const [scannerContext, setScannerContext] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState('')
  const [scanResult, setScanResult] = useState<any>(null)
  const [scanError, setScanError] = useState('')
  const [scanPhase, setScanPhase] = useState<'upload' | 'review' | 'analysing'>('upload')
  const [detectedTracks, setDetectedTracks] = useState<Array<{time_in: string, title: string, artist: string, confidence: number, found: boolean, source?: string}>>([])
  const [screenshotDragging, setScreenshotDragging] = useState(false)
  const [parsingScreenshot, setParsing] = useState(false)
  const [currentScanId, setCurrentScanId] = useState<string | null>(null)
  const [recentScans, setRecentScans] = useState<any[]>([])
  const [loadingScans, setLoadingScans] = useState(false)
  // RA cross-reference for scanner
  const [scannerRaMap, setScannerRaMap] = useState<Map<string, { charted_by: string; chart_title: string }>>(new Map())
  const [scannerRaLoading, setScannerRaLoading] = useState(false)
  const scannerRaFetched = useRef(false)
  // ── History Screenshot Import state ─────────────────────────────────────
  const [historyScreenshotDragging, setHistoryScreenshotDragging] = useState(false)
  const [historyImportPhase, setHistoryImportPhase] = useState<'idle' | 'uploading' | 'extracting' | 'matching' | 'preview' | 'saving'>('idle')
  const [historyExtractedTracks, setHistoryExtractedTracks] = useState<Array<{ title: string; artist: string; bpm?: number | null; key?: string | null; position: number }>>([])
  const [historyMatches, setHistoryMatches] = useState<Array<{ extracted: any; library_match: any; confidence: 'exact' | 'partial' | 'none' }>>([])
  const [historyImageUrl, setHistoryImageUrl] = useState<string | null>(null)
  const [historyImportError, setHistoryImportError] = useState('')
  const [historySetName, setHistorySetName] = useState('')
  // ── Gig context ──────────────────────────────────────────────────────────
  const [gigs, setGigs] = useState<any[]>([])
  const [upcomingGig, setUpcomingGig] = useState<{ id: string; title: string; venue: string; date: string; slot_time?: string; status: string } | null>(null)
  const [currentSetId, setCurrentSetId] = useState<string | null>(null)
  const [currentSetGigId, setCurrentSetGigId] = useState<string | null>(null)
  const [gigBannerOpen, setGigBannerOpen] = useState(true)
  const [linkingGig, setLinkingGig] = useState(false)

  const showToast = (msg: string, tag = 'Info') => {
    setToast({ msg, tag })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3400)
  }

  // ── Audio File Analysis ─────────────────────────────────────────────────
  async function handleAudioFiles(files: FileList | File[]) {
    const audioFiles = Array.from(files).filter(f =>
      /\.(mp3|wav|flac|aac|m4a|ogg|aiff?)$/i.test(f.name)
    )
    if (audioFiles.length === 0) { showToast('No audio files found — drop MP3, WAV, or FLAC', 'Error'); return }

    setAudioUploading(true)
    let processed = 0

    for (const file of audioFiles) {
      try {
        setAudioProgress(`Analysing ${file.name} (${processed + 1}/${audioFiles.length})...`)

        // Step 1: Extract BPM and duration from audio
        const analysis = await analyseAudioFile(file)

        setAudioProgress(`Enriching ${analysis.title || file.name}...`)

        // Step 2: Spotify lookup for verified key/energy (BPM already from audio)
        let spotify: any = null
        if (analysis.title && analysis.artist) {
          try {
            const spRes = await fetch('/api/spotify/lookup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ artist: analysis.artist, title: analysis.title }),
            })
            const spData = await spRes.json()
            if (spData.found) spotify = spData
          } catch (e) { /* Spotify unavailable */ }
        }

        // Step 3: Claude for SUBJECTIVE intelligence only
        let intelligence: any = {}
        if (analysis.title && analysis.artist) {
          try {
            const intRaw = await callClaude(
              'You are a DJ music intelligence expert. NEVER guess or fabricate BPM, key, or energy values. Only provide subjective set positioning advice.',
              `Provide DJ intelligence for this track. Do NOT include bpm, key, camelot, or energy.

Track: ${analysis.artist} — ${analysis.title}
Detected BPM: ${analysis.bpm}

If you genuinely know this track, return JSON:
{
  "moment_type": "opener|builder|peak|breakdown|closer",
  "position_score": "warm-up|build|peak|cool-down",
  "mix_in": "specific DJ mix-in technique for this track",
  "mix_out": "specific mix-out technique",
  "crowd_reaction": "expected crowd response in 5-8 words",
  "producer_style": "one sentence about production style",
  "notes": "when/how to use in a set"
}

If you do NOT know this track well enough, return: {"unknown": true}
Return ONLY valid JSON, no markdown.`, 300)
            const parsed = JSON.parse(intRaw.replace(/```json|```/g, '').trim())
            if (!parsed.unknown) intelligence = parsed
          } catch (e) { /* skip intelligence */ }
        }

        const track: Track = {
          id: Date.now().toString() + Math.random(),
          title: analysis.title || 'Unknown',
          artist: analysis.artist || 'Unknown',
          bpm: analysis.bpm || spotify?.bpm || 0,
          key: spotify?.key || '',
          camelot: spotify?.camelot || '',
          energy: spotify?.energy || 0,
          genre: '',
          duration: analysis.duration,
          notes: intelligence.notes || '',
          analysed: true,
          moment_type: intelligence.moment_type || '',
          position_score: intelligence.position_score || '',
          mix_in: intelligence.mix_in || '',
          mix_out: intelligence.mix_out || '',
          crowd_reaction: intelligence.crowd_reaction || '',
          similar_to: '',
          producer_style: intelligence.producer_style || '',
        }

        setLibrary(prev => [...prev, track])
        processed++
        showToast(`${track.title} — ${track.bpm}BPM, ${track.camelot}, energy ${track.energy}`, 'Analysed')
      } catch (err: any) {
        showToast(`Failed to analyse ${file.name}: ${err.message}`, 'Error')
        processed++
      }
    }

    setAudioUploading(false)
    setAudioProgress('')
    if (processed > 1) showToast(`${processed} tracks analysed and added to library`, 'Done')
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) handleAudioFiles(e.dataTransfer.files)
  }, [])

  // ── Screenshot Import → Extract tracks via vision → Add to library ─────
  async function importTracksFromScreenshot(file: File) {
    if (!file.type.startsWith('image/')) {
      showToast('Please drop an image file (PNG, JPG, etc.)', 'Error')
      return
    }
    setScreenshotImporting(true)
    setScreenshotImportProgress('Reading screenshot...')
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      setScreenshotImportProgress('Extracting tracks from image...')
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          system: 'You are a tracklist extraction assistant for DJs. Return ONLY valid JSON, no markdown.',
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } },
              { type: 'text', text: 'Extract every track visible in this screenshot (from Traktor, Rekordbox, CDJ screen, or any DJ software). Return ONLY a JSON array:\n[{"title": "track title", "artist": "artist name", "bpm": number or null, "key": "key or null"}]\n\nRules:\n- Include BPM and key if visible in the screenshot, otherwise null\n- If artist is unknown use "Unknown"\n- No markdown, just the JSON array' }
            ]
          }]
        })
      })
      const data = await res.json()
      const raw = data.content?.[0]?.text || '[]'
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('No tracks found')
      const extracted: { title: string; artist: string; bpm?: number | null; key?: string | null }[] = JSON.parse(jsonMatch[0])
      if (extracted.length === 0) throw new Error('No tracks found')

      setScreenshotImportProgress(`Looking up ${extracted.length} tracks...`)
      let added = 0
      for (const ext of extracted) {
        try {
          setScreenshotImportProgress(`Looking up ${ext.title} (${added + 1}/${extracted.length})...`)

          // Step 1: Spotify lookup for VERIFIED BPM/key/energy
          let spotify: any = null
          try {
            const spRes = await fetch('/api/spotify/lookup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ artist: ext.artist, title: ext.title }),
            })
            const spData = await spRes.json()
            if (spData.found) spotify = spData
          } catch (e) { /* Spotify unavailable — leave fields blank */ }

          // Step 2: Claude for SUBJECTIVE intelligence only (no BPM/key/energy guessing)
          let intelligence: any = {}
          try {
            const intRaw = await callClaude(
              'You are a DJ music intelligence expert. NEVER guess or fabricate BPM, key, or energy values. Only provide subjective set positioning advice.',
              `Provide DJ intelligence for this track. Do NOT include bpm, key, camelot, or energy — those come from verified sources only.

Track: ${ext.artist} — ${ext.title}

If you genuinely know this track, return JSON:
{
  "moment_type": "opener|builder|peak|breakdown|closer",
  "position_score": "warm-up|build|peak|cool-down",
  "mix_in": "specific DJ mix-in technique for this track",
  "mix_out": "specific mix-out technique",
  "crowd_reaction": "expected crowd response in 5-8 words",
  "producer_style": "one sentence about production style",
  "notes": "when/how to use in a set"
}

If you do NOT know this track well enough, return: {"unknown": true}
Return ONLY valid JSON, no markdown.`, 300)
            const parsed = JSON.parse(intRaw.replace(/```json|```/g, '').trim())
            if (!parsed.unknown) intelligence = parsed
          } catch (e) { /* Claude unavailable — skip intelligence */ }

          // Only use key data from Spotify (verified) — never trust Claude-guessed keys
          const verifiedKey = spotify?.audio_features_available ? spotify.key : null
          const verifiedCamelot = spotify?.audio_features_available ? spotify.camelot : null
          const verifiedBpm = spotify?.bpm || ext.bpm || 0
          const verifiedEnergy = spotify?.audio_features_available ? (spotify?.energy || 0) : 0

          const track: Track = {
            id: Date.now().toString() + Math.random(),
            title: ext.title,
            artist: ext.artist,
            bpm: verifiedBpm,
            key: verifiedKey || '',
            camelot: verifiedCamelot || '',
            energy: verifiedEnergy,
            genre: '',
            duration: spotify?.duration_ms ? `${Math.floor(spotify.duration_ms / 60000)}:${String(Math.floor((spotify.duration_ms % 60000) / 1000)).padStart(2, '0')}` : '',
            notes: intelligence.notes || '',
            analysed: !!(spotify?.audio_features_available),
            moment_type: intelligence.moment_type || '',
            position_score: intelligence.position_score || '',
            mix_in: intelligence.mix_in || '',
            mix_out: intelligence.mix_out || '',
            crowd_reaction: intelligence.crowd_reaction || '',
            similar_to: '',
            producer_style: intelligence.producer_style || '',
            spotify_url: spotify?.spotify_url || '',
            album_art: spotify?.album_art || '',
          }

          await fetch('/api/tracks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tracks: [track] }),
          })
          setLibrary(prev => [...prev, track])
          added++
        } catch {
          showToast(`Could not import ${ext.title}`, 'Error')
        }
      }
      showToast(`${added} track${added !== 1 ? 's' : ''} imported from screenshot`, 'Done')
    } catch {
      showToast('Could not read screenshot — try a clearer image', 'Error')
    } finally {
      setScreenshotImporting(false)
      setScreenshotImportProgress('')
    }
  }

  const mobileSources = ['shazam', 'snap', 'screenshot']
  const curatedLibrary = library.filter(t => !mobileSources.includes(t.source || ''))
  const discoveries = library.filter(t => t.source === 'shazam' || t.source === 'snap')
  const playlistTracks = library.filter(t => t.source === 'screenshot')
  const playlistGroups = playlistTracks.reduce<Record<string, Track[]>>((acc, t) => {
    const name = t.discovered_via?.playlist || 'Untitled'
    if (!acc[name]) acc[name] = []
    acc[name].push(t)
    return acc
  }, {})

  const searchFn = (t: Track) =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.genre.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.moment_type.toLowerCase().includes(searchQuery.toLowerCase())

  const filteredLibrary = curatedLibrary.filter(searchFn)

  function addToSet(track: Track, switchTab = false) {
    const prev = set[set.length - 1]
    const compatibility = prev ? getCompatibility(prev.camelot, track.camelot) : 100
    const flow_score = prev ? getFlowScore(prev, track) : 100
    const setTrack: SetTrack = { ...track, position: set.length + 1, transition_note: '', compatibility, flow_score }
    setSet(s => [...s, setTrack])
    setSuggestions([])
    showToast(`${track.title} added to set (${set.length + 1} tracks)`, 'Set')
    if (switchTab) setActiveTab('builder')
  }

  function toggleTrackSelection(id: string) {
    setSelectedTracks(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function addSelectedToSet() {
    const tracks = filteredLibrary.filter(t => selectedTracks.has(t.id))
    if (tracks.length === 0) return
    setSet(prev => {
      const newTracks = tracks.map((track, i) => {
        const prevTrack = i === 0 ? prev[prev.length - 1] : undefined
        const prevInBatch = i > 0 ? tracks[i - 1] : undefined
        const ref = prevTrack || prevInBatch
        return {
          ...track,
          position: prev.length + i + 1,
          transition_note: '',
          compatibility: ref ? getCompatibility(ref.camelot, track.camelot) : 100,
          flow_score: ref ? getFlowScore(ref as any, track) : 100,
        }
      })
      return [...prev, ...newTracks]
    })
    setSuggestions([])
    showToast(`${tracks.length} tracks added to set`, 'Set')
    setSelectedTracks(new Set())
    setActiveTab('builder')
  }

  function removeFromSet(id: string) {
    setSet(s => {
      const filtered = s.filter(t => t.id !== id)
      return filtered.map((t, i) => {
        const prev = filtered[i - 1]
        return {
          ...t,
          position: i + 1,
          compatibility: prev ? getCompatibility(prev.camelot, t.camelot) : 100,
          flow_score: prev ? getFlowScore(prev, t) : 100,
        }
      })
    })
  }

  function moveTrack(from: number, to: number) {
    setSet(s => {
      const newSet = [...s]
      const [moved] = newSet.splice(from, 1)
      newSet.splice(to, 0, moved)
      return newSet.map((t, i) => {
        const prev = newSet[i - 1]
        return {
          ...t,
          position: i + 1,
          compatibility: prev ? getCompatibility(prev.camelot, t.camelot) : 100,
          flow_score: prev ? getFlowScore(prev, t) : 100,
        }
      })
    })
  }

  // ── Smart Suggest Next Track ───────────────────────────────────────────
  async function suggestNextTrack() {
    if (set.length === 0) { showToast('Add a track first', 'Error'); return }
    setSuggestingNext(true)
    const lastTrack = set[set.length - 1]
    const usedIds = new Set(set.map(t => t.id))
    const available = library.filter(t => !usedIds.has(t.id))

    // Score each available track — crowd_hits from past gigs add a 10% boost
    const scored = available.map(t => ({
      ...t,
      score: Math.min(100, getFlowScore(lastTrack, t) * (t.crowd_hits && t.crowd_hits > 0 ? 1.10 : 1)),
    })).sort((a, b) => b.score - a.score)

    // Get top 5 and ask Claude for reasoning
    const top5 = scored.slice(0, 5)
    try {
      const gigContext = upcomingGig
        ? `Context: This is a ${deriveSlotType(upcomingGig)} set for ${upcomingGig.venue} on ${new Date(upcomingGig.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. Suggest tracks appropriate for this moment in a ${deriveSlotType(upcomingGig)} set.\n\n`
        : ''
      const raw = await callClaude(
        'You are a DJ set construction expert. Return ONLY valid JSON array, no markdown.',
        `${gigContext}I just played: ${lastTrack.artist} — ${lastTrack.title} (${lastTrack.bpm}BPM, ${lastTrack.camelot}, energy ${lastTrack.energy}/10, ${lastTrack.moment_type})

Slot: ${slotType}, Set position: track ${set.length} of ~${Math.round(parseInt(setLength) / 5)} tracks

These are my best options for next track (ranked by key/BPM/energy compatibility):
${top5.map((t, i) => `${i + 1}. ${t.artist} — ${t.title} (${t.bpm}BPM, ${t.camelot}, energy ${t.energy}, ${t.moment_type})`).join('\n')}

Return JSON array of objects: [{"id": "track_id", "reason": "one sentence why this works next"}]
Use these IDs: ${top5.map(t => t.id).join(', ')}`, 300)

      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      setSuggestions(parsed.map((p: any) => ({ id: p.id || top5[0]?.id, reason: p.reason || 'Good flow' })))
    } catch {
      // Fallback to score-only suggestions
      setSuggestions(top5.slice(0, 3).map(t => ({
        id: t.id,
        reason: `${t.score}% flow — ${t.camelot} key, ${t.bpm}BPM, energy ${t.energy}`
      })))
    }
    setSuggestingNext(false)
  }

  // ── AI Track Analysis ──────────────────────────────────────────────────
  async function analyseAndAddTrack() {
    if (!newTrack.title || !newTrack.artist) { showToast('Title and artist required', 'Error'); return }
    setAnalysingTrack(true)
    try {
      const raw = await callClaude(
        'You are a music intelligence expert for DJs. Return ONLY valid JSON, no markdown.',
        `Analyse this track for a DJ's library. Return comprehensive intelligence:
Track: ${newTrack.artist} — ${newTrack.title}

Return JSON:
{
  "bpm": number,
  "key": "musical key (e.g. F minor)",
  "camelot": "Camelot code (e.g. 4A)",
  "energy": number 1-10 (how much it lifts a room),
  "genre": "genre",
  "duration": "M:SS",
  "moment_type": "opener|builder|peak|breakdown|closer",
  "position_score": "warm-up|build|peak|cool-down",
  "mix_in": "specific DJ technique to bring this track in (mention EQ, effects, timing)",
  "mix_out": "specific technique to transition out",
  "crowd_reaction": "expected crowd response in 5-8 words",
  "producer_style": "one sentence about the production style/approach",
  "notes": "one sentence about when/how to use this in a set"
}`, 400)
      const d = JSON.parse(raw.replace(/```json|```/g, '').trim())
      const track: Track = {
        id: Date.now().toString(),
        title: newTrack.title,
        artist: newTrack.artist,
        bpm: d.bpm || 128,
        key: d.key || '',
        camelot: d.camelot || '',
        energy: d.energy || 5,
        genre: d.genre || 'Electronic',
        duration: d.duration || '5:00',
        notes: d.notes || '',
        analysed: true,
        moment_type: d.moment_type || 'builder',
        position_score: d.position_score || 'build',
        mix_in: d.mix_in || '',
        mix_out: d.mix_out || '',
        crowd_reaction: d.crowd_reaction || '',
        similar_to: '',
        producer_style: d.producer_style || '',
      }
      setLibrary(prev => [...prev, track])
      setNewTrack({ title: '', artist: '' })
      setAddingTrack(false)
      showToast(`${track.title} analysed — ${track.moment_type} track, energy ${track.energy}/10`, 'Intelligence')
    } catch (err: any) {
      showToast('Analysis failed: ' + err.message, 'Error')
    } finally {
      setAnalysingTrack(false)
    }
  }

  // ── Rekordbox Export ──────────────────────────────────────────────────
  // Exports TWO files:
  // 1. Pioneer XML — metadata + playlist structure. Rekordbox imports this.
  //    IMPORTANT: Rekordbox links entries to audio by file path. If you haven't
  //    analyzed these tracks in Rekordbox yet, they'll show as File Missing.
  //    The XML still creates the playlist order correctly for tracks already in your library.
  // 2. Set sheet TXT — plain reference (artist · title · BPM · key · Camelot)
  //    Useful even without Rekordbox — print it, paste it in notes, share with promoter.
  function exportToRekordbox() {
    const tracks = set.length > 0 ? set : library
    if (tracks.length === 0) { showToast('No tracks to export', 'Error'); return }

    const playlistName = set.length > 0 ? (setName || 'Set Lab Export') : 'Set Lab Library'
    const safeName = playlistName.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')

    // Camelot → Rekordbox key
    const camelotToKey: Record<string, string> = {
      '8A': 'Am', '9A': 'Em', '10A': 'Bm', '11A': 'F#m', '12A': 'Dbm', '1A': 'Abm',
      '2A': 'Ebm', '3A': 'Bbm', '4A': 'Fm', '5A': 'Cm', '6A': 'Gm', '7A': 'Dm',
      '8B': 'C', '9B': 'G', '10B': 'D', '11B': 'A', '12B': 'E', '1B': 'B',
      '2B': 'F#', '3B': 'Db', '4B': 'Ab', '5B': 'Eb', '6B': 'Bb', '7B': 'F',
    }

    // ── 1. Pioneer XML ──
    const trackXml = tracks.map((t, i) => {
      const tonality = camelotToKey[t.camelot] || t.key || ''
      const dur = t.duration ? t.duration.split(':').reduce((acc, v, j) => acc + parseInt(v) * (j === 0 ? 60 : 1), 0) : 300
      const rating = Math.min(Math.round(t.energy / 2), 5) * 51
      // No Location attr — tracks must already exist in Rekordbox library for linking
      return `    <TRACK TrackID="${i + 1}" Name="${escXml(t.title)}" Artist="${escXml(t.artist)}" TotalTime="${dur}" BPM="${t.bpm.toFixed(2)}" Tonality="${tonality}" Rating="${rating}" Genre="${escXml(t.genre || '')}" Comment="${escXml(t.notes || '')}" />`
    }).join('\n')

    const playlistTracks = tracks.map((_, i) => `      <TRACK Key="${i + 1}" />`).join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by Artist OS Set Lab -->
<!-- Import: Rekordbox → File → Import Playlist → rekordbox xml -->
<!-- Note: tracks must already be analyzed in Rekordbox to link correctly -->
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="Artist OS" Version="1.0" Company="Artist OS" />
  <COLLECTION Entries="${tracks.length}">
${trackXml}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="${escXml(playlistName)}" Type="1" KeyType="0" Entries="${tracks.length}">
${playlistTracks}
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>`

    const xmlBlob = new Blob([xml], { type: 'application/xml' })
    const xmlUrl = URL.createObjectURL(xmlBlob)
    const xmlA = document.createElement('a')
    xmlA.href = xmlUrl; xmlA.download = `${safeName}.xml`; xmlA.click()
    URL.revokeObjectURL(xmlUrl)

    // ── 2. Plain set sheet ──
    const sheet = [
      `SET: ${playlistName}`,
      `Exported: ${new Date().toLocaleDateString('en-GB')}`,
      `Tracks: ${tracks.length}`,
      '',
      tracks.map((t, i) => {
        const timeStr = t.duration ? ` [${t.duration}]` : ''
        return `${(i + 1).toString().padStart(2, ' ')}. ${t.artist} — ${t.title}${timeStr}\n    BPM: ${t.bpm}  Key: ${t.key}  Camelot: ${t.camelot}  Energy: ${t.energy}/10${t.notes ? `\n    Note: ${t.notes}` : ''}`
      }).join('\n\n'),
    ].join('\n')

    setTimeout(() => {
      const txtBlob = new Blob([sheet], { type: 'text/plain' })
      const txtUrl = URL.createObjectURL(txtBlob)
      const txtA = document.createElement('a')
      txtA.href = txtUrl; txtA.download = `${safeName}_setsheet.txt`; txtA.click()
      URL.revokeObjectURL(txtUrl)
    }, 300)

    showToast(`Exported ${tracks.length} tracks — XML + set sheet`, 'Export')
  }

  function escXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  // ── Set Narrative ──────────────────────────────────────────────────────
  async function generateSetNarrative() {
    if (set.length < 3) { showToast('Add at least 3 tracks first', 'Error'); return }
    setGeneratingNarrative(true)
    setNarrative('')
    try {
      const trackList = set.map((t, i) => `${i + 1}. ${t.artist} — ${t.title} (${t.bpm}BPM, ${t.camelot}, Energy: ${t.energy}/10, Type: ${t.moment_type}, Flow: ${t.flow_score}%)`).join('\n')
      const raw = await callClaude(
        'You are an expert DJ coach. Give specific, actionable feedback. Be direct and honest about what works and what does not.',
        `Analyse this DJ set:

Venue/Slot: ${slotType}
Set length: ${setLength} minutes
${venue ? 'Venue: ' + venue : ''}

Tracklist:
${trackList}

Provide:
1. OVERALL ARC — does this set tell a story? Rate the flow 1-10
2. TRANSITION ANALYSIS — which transitions are strong/weak. For weak ones, suggest fixes (different order, bridge track, EQ technique)
3. ENERGY CURVE — is the pacing right for ${slotType}? Where should energy peak?
4. HARMONIC JOURNEY — rate the key progression. Any harsh key clashes?
5. THREE SPECIFIC IMPROVEMENTS — concrete changes (reorder track X, add a bridge between Y and Z, remove W)
6. SET NARRATIVE — the emotional story of this set in 2-3 sentences`, 700)
      setNarrative(raw)
    } catch (err: any) {
      showToast('Failed: ' + err.message, 'Error')
    } finally {
      setGeneratingNarrative(false)
    }
  }

  async function saveSet() {
    if (!set.length) { showToast('Nothing to save', 'Error'); return }
    const setData = { name: setName, venue, slot_type: slotType, tracks: JSON.stringify(set), narrative, gig_id: currentSetGigId, created_at: new Date().toISOString() }
    try {
      const { data } = await supabase.from('dj_sets').insert(setData).select().single()
      if (data?.id) setCurrentSetId(data.id)
      showToast('Set saved', 'Done')
      loadPastSets()
    } catch {
      showToast('Saved locally', 'Done')
      setPastSets(p => [...p, setData])
    }
  }

  async function fetchUpcomingGig() {
    try {
      const res = await fetch('/api/gigs')
      const data = await res.json()
      const allGigs = data.gigs || []
      setGigs(allGigs)
      const today = new Date().toISOString().split('T')[0]
      const upcoming = allGigs.find((g: any) =>
        g.date >= today && (g.status === 'confirmed' || g.status === 'pending')
      )
      setUpcomingGig(upcoming || null)
    } catch {}
  }

  async function linkSetToGig(gigId: string) {
    if (!currentSetId) { showToast('Save your set first, then link it', 'Info'); return }
    setLinkingGig(true)
    try {
      await supabase.from('dj_sets').update({ gig_id: gigId }).eq('id', currentSetId)
      setCurrentSetGigId(gigId)
      showToast('Set linked to gig', 'Set Lab')
    } catch { showToast('Could not link set', 'Error') }
    finally { setLinkingGig(false) }
  }

  function deriveSlotType(gig: { slot_time?: string }): string {
    const t = (gig.slot_time || '').toLowerCase()
    if (t.includes('warm')) return 'warm-up'
    if (t.includes('clos')) return 'late/closing'
    if (t.includes('headline') || t.includes('peak')) return 'peak/headline'
    const hourMatch = t.match(/(\d{1,2})[:h]/)
    if (hourMatch) {
      const h = parseInt(hourMatch[1])
      if (h >= 1 && h <= 5) return 'late/closing'
      if (h >= 18 && h <= 21) return 'warm-up'
    }
    return 'peak/headline'
  }

  function loadSetIntoBuilder(ps: any) {
    const tracks = JSON.parse(ps.tracks || '[]')
    setSet(tracks)
    setSetName(ps.name || 'Unnamed set')
    setVenue(ps.venue || '')
    setSlotType(ps.slot_type || 'Club — peak time')
    setActiveTab('builder')
    showToast(`"${ps.name || 'Set'}" loaded into Set Builder`, 'Set Lab')
  }

  async function loadPastSets() {
    try {
      const { data } = await supabase.from('dj_sets').select('*').order('created_at', { ascending: false }).limit(10)
      if (data) setPastSets(data)
    } catch {}
  }

  async function loadLibrary() {
    setLibraryLoading(true)
    try {
      const res = await fetch('/api/tracks')
      const data = await res.json()
      if (data.tracks && data.tracks.length > 0) {
        setLibrary(data.tracks.map((t: any) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          bpm: t.bpm || 0,
          key: t.key || '',
          camelot: t.camelot || '',
          energy: t.energy || 0,
          genre: t.genre || '',
          duration: t.duration || '',
          notes: t.notes || '',
          analysed: t.enriched || false,
          moment_type: t.moment_type || '',
          position_score: t.position_score || '',
          mix_in: t.mix_in || '',
          mix_out: t.mix_out || '',
          crowd_reaction: t.crowd_reaction || '',
          similar_to: t.similar_to || '',
          producer_style: t.producer_style || '',
          crowd_hits: t.crowd_hits || 0,
          source: t.source || 'manual',
          discovered_via: t.discovered_via || null,
        })))
      } else {
        setLibrary([])
      }
    } catch {
      setLibrary([])
    } finally {
      setLibraryLoading(false)
    }
  }

  async function deleteTrack(id: string) {
    await fetch('/api/tracks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setLibrary(prev => prev.filter(t => t.id !== id))
    showToast('Track removed', 'Done')
  }

  async function deleteSelectedTracks() {
    const ids = Array.from(selectedTracks)
    if (!confirm(`Delete ${ids.length} track${ids.length !== 1 ? 's' : ''} from library?`)) return
    await Promise.all(ids.map(id => fetch('/api/tracks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })))
    setLibrary(prev => prev.filter(t => !selectedTracks.has(t.id)))
    showToast(`${ids.length} tracks deleted`, 'Done')
    setSelectedTracks(new Set())
  }

  async function reanalyseTrack(track: Track) {
    setReanalysing(track.id)
    try {
      // Step 1: Spotify lookup for verified BPM/key/energy
      let spotify: any = null
      try {
        const spRes = await fetch('/api/spotify/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artist: track.artist, title: track.title }),
        })
        const spData = await spRes.json()
        if (spData.found) spotify = spData
      } catch (e) { /* Spotify unavailable */ }

      // Step 2: Claude for subjective intelligence only
      let intelligence: any = {}
      try {
        const intRaw = await callClaude(
          'You are a DJ music intelligence expert. NEVER guess or fabricate BPM, key, or energy values.',
          `Provide DJ intelligence for this track. Do NOT include bpm, key, camelot, or energy.

Track: ${track.artist} — ${track.title}
${spotify ? `Verified BPM: ${spotify.bpm}, Key: ${spotify.key}` : `Current BPM: ${track.bpm}, Key: ${track.key}`}

If you genuinely know this track, return JSON:
{
  "moment_type": "opener|builder|peak|breakdown|closer",
  "position_score": "warm-up|build|peak|cool-down",
  "mix_in": "specific mix-in technique for this track",
  "mix_out": "specific mix-out technique",
  "crowd_reaction": "expected crowd response in 5-8 words",
  "producer_style": "one sentence about production style",
  "notes": "when/how to use in a set"
}

If you do NOT know this track well enough, return: {"unknown": true}
Return ONLY valid JSON, no markdown.`, 300)
        const parsed = JSON.parse(intRaw.replace(/```json|```/g, '').trim())
        if (!parsed.unknown) intelligence = parsed
      } catch (e) { /* skip intelligence */ }

      const updates: any = { ...intelligence }
      const corrections: string[] = []

      if (spotify) {
        // Correct artist and title from Spotify — the authoritative source
        if (spotify.artist && spotify.artist !== track.artist) { updates.artist = spotify.artist; corrections.push(`Artist → ${spotify.artist}`) }
        if (spotify.title && spotify.title !== track.title) { updates.title = spotify.title; corrections.push(`Title → ${spotify.title}`) }
        if (spotify.bpm && spotify.bpm !== track.bpm) { updates.bpm = spotify.bpm; corrections.push(`BPM → ${spotify.bpm}`) }
        if (spotify.key && spotify.key !== track.key) { updates.key = spotify.key; corrections.push(`Key → ${spotify.key}`) }
        if (spotify.camelot) updates.camelot = spotify.camelot
        if (spotify.energy) updates.energy = spotify.energy
        if (spotify.spotify_url) updates.spotify_url = spotify.spotify_url
        if (spotify.album_art) updates.album_art = spotify.album_art
        updates.enriched = true
      }

      const updated = { ...track, ...updates }

      await fetch('/api/tracks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: track.id, ...updates }),
      })

      setLibrary(prev => prev.map(t => t.id === track.id ? updated : t))
      showToast(
        spotify
          ? corrections.length ? `Verified: ${corrections.join(', ')}` : 'Verified against Spotify — data correct'
          : 'Track not found on Spotify — could not verify',
        'Intelligence'
      )
    } catch (err: any) {
      showToast('Re-analyse failed: ' + err.message, 'Error')
    } finally {
      setReanalysing(null)
    }
  }

  async function saveTrackEdit(updated: Track) {
    await fetch('/api/tracks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: updated.id, bpm: updated.bpm, key: updated.key, camelot: updated.camelot, energy: updated.energy, notes: updated.notes }),
    })
    setLibrary(prev => prev.map(t => t.id === updated.id ? updated : t))
    setEditingTrack(null)
    showToast('Track updated', 'Done')
  }

  // ── Mix Scanner — Screenshot-only flow ────────────────────────────────────
  const [tracklistImgParsing, setTracklistImgParsing] = useState(false)
  const tracklistImgRef = useRef<HTMLInputElement>(null)

  // ── Mix Scanner — Tracklist Screenshot Parser ────────────────────────────
  async function parseTracklistImage(file: File) {
    setTracklistImgParsing(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      const base64 = dataUrl.split(',')[1]
      const mediaType = (file.type || 'image/jpeg') as any
      try {
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1500,
            system: 'You are a tracklist extraction assistant. Return ONLY plain text, no markdown, no numbering.',
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
                { type: 'text', text: `Extract every track visible in this screenshot. Return one track per line in this exact format:\nARTIST - TITLE\n\nRules:\n- No numbering or timestamps\n- No blank lines\n- Skip anything that isn't a clear artist/title pair` },
              ],
            }],
          }),
        })
        const data = await res.json()
        const text = data.content?.[0]?.text || ''
        if (text.trim()) {
          setScannerTracklist(text.trim())
          showToast('Tracklist extracted from screenshot', 'Set Lab')
        } else {
          showToast('No tracks found in screenshot', 'Error')
        }
      } catch {
        showToast('Could not read screenshot', 'Error')
      } finally {
        setTracklistImgParsing(false)
      }
    }
    reader.readAsDataURL(file)
  }

  // ── Mix Scanner — Screenshot OCR → detectedTracks ───────────────────────
  async function parseTracklistScreenshot(file: File) {
    setParsing(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } },
              { type: 'text', text: 'Extract the tracklist from this image. Return ONLY a JSON array of objects: [{"title": "...", "artist": "..."}, ...]. If artist is unknown use "Unknown". No markdown, just the JSON array.' }
            ]
          }]
        })
      })
      const data = await res.json()
      const raw = data.content?.[0]?.text || '[]'
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('No tracks found')
      const tracks: { title: string; artist: string }[] = JSON.parse(jsonMatch[0])
      if (tracks.length === 0) throw new Error('No tracks found')
      const formatted = tracks.map((t, i) => ({
        time_in: `${String(i).padStart(2, '0')}:00`,
        title: t.title,
        artist: t.artist,
        confidence: 1,
        found: true,
        source: 'screenshot' as string,
      }))
      setDetectedTracks(formatted)
      setScanPhase('review')
      showToast(`${tracks.length} tracks imported from screenshot`, 'Done')
      // Cross-reference with RA charts in background
      fetchRaForScanner(formatted)

      // Persist screenshot-imported scan to Supabase
      const autoTracklist = formatted.map((t, i) =>
        `${i + 1}. ${t.artist ? t.artist + ' — ' : ''}${t.title}`
      ).join('\n')
      try {
        const saveResp = await fetch('/api/mix-scans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'Screenshot import',
            duration_seconds: 0,
            tracklist: autoTracklist,
            detected_tracks: formatted,
            context: scannerContext.trim() || null,
            status: 'detected',
          }),
        })
        const saveData = await saveResp.json()
        if (saveData.success && saveData.scan?.id) {
          setCurrentScanId(saveData.scan.id)
        }
      } catch {}
    } catch {
      showToast('Could not read screenshot — try a clearer image', 'Error')
    } finally {
      setParsing(false)
    }
  }

  // ── Mix Scanner — RA Cross-Reference ────────────────────────────────────
  async function fetchRaForScanner(tracks: Array<{title: string, artist: string, found: boolean}>) {
    if (scannerRaFetched.current) return // already fetched this session
    setScannerRaLoading(true)
    try {
      const resp = await fetch('/api/ra-charts')
      const raData = await resp.json()
      if (!raData?.tracks) return

      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
      const raTrackSet: Set<string> = new Set(
        Array.isArray(raData.tracks) ? raData.tracks as string[] : []
      )
      const newMap = new Map<string, { charted_by: string; chart_title: string }>()
      if (Array.isArray(raData.rich)) {
        for (const entry of raData.rich as Array<{ key: string; charted_by: string; chart_title: string }>) {
          newMap.set(entry.key, { charted_by: entry.charted_by, chart_title: entry.chart_title })
        }
      }

      // Match detected tracks against RA charts
      const matchMap = new Map<string, { charted_by: string; chart_title: string }>()
      for (const t of tracks) {
        if (!t.found || !t.artist || !t.title) continue
        const key = `${normalize(t.artist)}::${normalize(t.title)}`
        // Exact match
        if (newMap.has(key)) {
          matchMap.set(key, newMap.get(key)!)
          continue
        }
        // Partial match (remixes etc)
        const normArtist = normalize(t.artist)
        const normTitle = normalize(t.title)
        for (const entry of raTrackSet) {
          if (entry.includes(normArtist) && entry.includes(normTitle)) {
            const attr = newMap.get(entry)
            if (attr) matchMap.set(key, attr)
            break
          }
        }
      }

      setScannerRaMap(matchMap)
      scannerRaFetched.current = true
    } catch {
      // Non-blocking — RA data is a bonus
    } finally {
      setScannerRaLoading(false)
    }
  }

  // Helper to look up RA charting for a track
  function getTrackRaInfo(artist: string, title: string): { charted_by: string; chart_title: string } | null {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
    const key = `${normalize(artist)}::${normalize(title)}`
    return scannerRaMap.get(key) || null
  }

  // ── Mix Scanner — Phase 2: Claude Analysis ──────────────────────────────
  async function runClaudeAnalysis() {
    // Always build tracklist from detected tracks if available (they may have been edited)
    const tracklistText = detectedTracks.length > 0
      ? detectedTracks.filter(t => t.title.trim() || t.artist.trim()).map((t, i) => `${i + 1}. ${t.artist ? t.artist + ' — ' : ''}${t.title}`).join('\n')
      : scannerTracklist.trim()

    if (!tracklistText) {
      showToast('Add a tracklist first — paste it or import from a screenshot', 'Error')
      return
    }
    setScanPhase('analysing')
    setScanning(true)
    setScanProgress('Analysing mix…')
    try {
      const resp = await fetch('/api/mix-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracklist: tracklistText || undefined,
          context:   scannerContext.trim()   || undefined,
        }),
      })
      const data = await resp.json()
      if (!resp.ok || data.error) throw new Error(data.error || 'Analysis failed')
      setScanResult(data.result)
      setScanPhase('upload') // reset for next scan

      // Persist analysis result to Supabase
      if (currentScanId) {
        try {
          await fetch(`/api/mix-scans/${currentScanId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result: data.result, status: 'analysed' }),
          })
        } catch {
          // Non-blocking
        }
      }
    } catch (err: any) {
      setScanError(err.message || 'Analysis failed')
      setScanPhase('review') // go back to review so they can retry
    } finally {
      setScanning(false)
      setScanProgress('')
    }
  }

  function getDiscoverSeeds(): Track[] {
    if (discoverSource === 'current-set') return set
    if (discoverSource === 'library') return curatedLibrary
    if (discoverSource.startsWith('playlist:')) {
      const name = discoverSource.slice(9)
      return playlistTracks.filter(t => (t.discovered_via?.playlist || 'Untitled') === name)
    }
    if (discoverSource.startsWith('set:')) {
      const setId = discoverSource.slice(4)
      const ps = pastSets.find((p: any) => p.id === setId)
      if (ps?.tracks) return ps.tracks
    }
    return set.length > 0 ? set : curatedLibrary
  }

  async function discoverTracks(pop = maxPopularity) {
    const seedTracks = getDiscoverSeeds()
    if (seedTracks.length === 0) { setDiscoverError('Select a source with tracks first'); return }
    setDiscoverLoading(true)
    setDiscoverError('')
    setDiscoverResults([])

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
    const raKey = (artist: string, title: string) => `${normalize(artist)}::${normalize(title)}`

    try {
      const [beatportSettled, raSettled] = await Promise.allSettled([
        fetch('/api/beatport', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracks: seedTracks.slice(0, 12), maxPopularity: pop, limit: 20 }),
        }).then(r => r.json()),
        fetch('/api/ra-charts').then(r => r.json()),
      ])

      const data = beatportSettled.status === 'fulfilled' ? beatportSettled.value : null
      if (!data || data.error) throw new Error(data?.error || 'Beatport fetch failed')

      // Build RA track set + rich attribution map
      const raData = raSettled.status === 'fulfilled' ? raSettled.value : null
      const raTrackSet: Set<string> = new Set(
        Array.isArray(raData?.tracks) ? raData.tracks as string[] : []
      )
      // Store rich attribution for DJ/chart name display
      const newRaMap = new Map<string, { charted_by: string; chart_title: string }>()
      if (Array.isArray(raData?.rich)) {
        for (const entry of raData.rich as Array<{ key: string; charted_by: string; chart_title: string }>) {
          newRaMap.set(entry.key, { charted_by: entry.charted_by, chart_title: entry.chart_title })
        }
      }
      raRichMapRef.current = newRaMap

      const results: any[] = (data.tracks || []).map((track: any) => {
        const key = raKey(track.artist || '', track.title || '')
        // Exact match
        let ra_charted = raTrackSet.has(key)
        let ra_charted_by = newRaMap.get(key)?.charted_by || ''
        let ra_chart_title = newRaMap.get(key)?.chart_title || ''

        // Partial / substring match for remixes etc.
        if (!ra_charted && raTrackSet.size > 0) {
          const normArtist = normalize(track.artist || '')
          const normTitle  = normalize(track.title || '')
          for (const entry of raTrackSet) {
            if (entry.includes(normArtist) && entry.includes(normTitle)) {
              ra_charted = true
              const attr = newRaMap.get(entry)
              if (attr) { ra_charted_by = attr.charted_by; ra_chart_title = attr.chart_title }
              break
            }
          }
        }

        return { ...track, ra_charted, ra_charted_by, ra_chart_title }
      })

      // Sort: RA-charted first within each popularity tier, then by release date
      results.sort((a, b) => {
        const tierA = a.popularity < 20 ? 0 : a.popularity < 40 ? 1 : a.popularity < 65 ? 2 : 3
        const tierB = b.popularity < 20 ? 0 : b.popularity < 40 ? 1 : b.popularity < 65 ? 2 : 3
        if (tierA !== tierB) return tierA - tierB
        if (a.ra_charted !== b.ra_charted) return a.ra_charted ? -1 : 1
        return (b.release_date || '').localeCompare(a.release_date || '')
      })

      setDiscoverResults(results)
      setDiscoverMeta({ targetCamelot: data.targetCamelot, targetBpm: data.targetBpm })
      setRaChartedCount(results.filter((t: any) => t.ra_charted).length)
      setDiscoverCallCount(c => c + 1)
    } catch (err: any) {
      setDiscoverError(err.message)
    } finally {
      setDiscoverLoading(false)
    }
  }

  // ── Crate Dig function ──────────────────────────────────────────────────
  async function crateDigFrom(track: Track, axis: 'label' | 'artist' | 'style' | 'credit') {
    setCrateDigLoading(true)
    setCrateDigError('')
    setCrateDigResults([])
    setCrateDigMeta(null)

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()

    try {
      // Step 1: Resolve the track on Discogs (cached client-side)
      const resolveKey = `${normalize(track.artist)}::${normalize(track.title)}`
      let resolved = crateDigResolveCache.current.get(resolveKey)

      if (!resolved) {
        const resolveRes = await fetch('/api/discogs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resolve', artist: track.artist, title: track.title }),
        })
        resolved = await resolveRes.json()
        if (resolved.error) throw new Error(resolved.error)
        crateDigResolveCache.current.set(resolveKey, resolved)
      }

      if (!resolved.resolved) {
        setCrateDigError(`Could not find "${track.artist} - ${track.title}" on Discogs`)
        setCrateDigLoading(false)
        return
      }

      // Step 2: Dig based on axis
      let digResult: any
      switch (axis) {
        case 'label': {
          if (!resolved.label_id) { setCrateDigError('No label found for this release'); setCrateDigLoading(false); return }
          const res = await fetch('/api/discogs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'label-dig', label_id: resolved.label_id, label_name: resolved.label_name }),
          })
          digResult = await res.json()
          if (digResult.error) throw new Error(digResult.error)
          setCrateDigMeta({ label_name: digResult.label_name })
          break
        }
        case 'artist': {
          const res = await fetch('/api/discogs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'artist-dig', artist: track.artist }),
          })
          digResult = await res.json()
          if (digResult.error) throw new Error(digResult.error)
          setCrateDigMeta({ artist_name: digResult.artist_name })
          break
        }
        case 'style': {
          const style = resolved.styles?.[0]
          if (!style) { setCrateDigError('No style data found for this release'); setCrateDigLoading(false); return }
          const res = await fetch('/api/discogs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'style-dig', style, year: resolved.year || 2020 }),
          })
          digResult = await res.json()
          if (digResult.error) throw new Error(digResult.error)
          setCrateDigMeta({ style: digResult.style, year_range: digResult.year_range })
          break
        }
        case 'credit': {
          if (!resolved.release_id) { setCrateDigError('No release found to search credits'); setCrateDigLoading(false); return }
          const res = await fetch('/api/discogs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'credit-dig', release_id: resolved.release_id }),
          })
          digResult = await res.json()
          if (digResult.error) throw new Error(digResult.error)
          setCrateDigMeta({ credits: digResult.credits, release_title: digResult.release_title })
          break
        }
      }

      // Step 3: Filter out tracks already in library
      const releases = (digResult.releases || []).filter((r: any) => {
        const rArtist = normalize(r.artist || '')
        const rTitle = normalize(r.title || '')
        return !library.some(t => normalize(t.artist) === rArtist && normalize(t.title) === rTitle)
      })

      setCrateDigResults(releases)
    } catch (err: any) {
      setCrateDigError(err.message)
    } finally {
      setCrateDigLoading(false)
    }
  }

  // ── Wantlist functions ─────────────────────────────────────────────────
  async function loadWantlist() {
    setWantlistLoading(true)
    try {
      const res = await fetch('/api/discogs/wantlist')
      const data = await res.json()
      setWantlist(data.items || [])
    } catch (e) { /* silent */ }
    setWantlistLoading(false)
  }

  async function addToWantlist(item: any, digType: string, sourceTrackId: string) {
    await fetch('/api/discogs/wantlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discogs_release_id: String(item.id),
        title: item.title,
        artist: item.artist,
        label_name: item.label_name || '',
        year: item.year || null,
        thumb: item.thumb || '',
        discogs_url: item.discogs_url || '',
        dig_type: digType,
        source_track_id: sourceTrackId,
      }),
    })
    setWantlist(prev => [{ ...item, discogs_release_id: String(item.id), dig_type: digType, source_track_id: sourceTrackId, created_at: new Date().toISOString() }, ...prev])
    showToast(`${item.title} added to wantlist`, 'Saved')
  }

  async function removeFromWantlist(discogsReleaseId: string) {
    await fetch('/api/discogs/wantlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discogs_release_id: discogsReleaseId }),
    })
    setWantlist(prev => prev.filter(w => w.discogs_release_id !== discogsReleaseId))
    showToast('Removed from wantlist', 'Removed')
  }

  useEffect(() => { loadLibrary(); loadPastSets(); fetchUpcomingGig(); loadWantlist() }, [])

  // ── Persist scanner state across navigation ──────────────────────────────
  const SCANNER_KEY = 'setlab_scanner_v1'

  // Restore on mount — try Supabase first, fall back to localStorage
  useEffect(() => {
    async function loadRecentScans() {
      try {
        setLoadingScans(true)
        const resp = await fetch('/api/mix-scans')
        const data = await resp.json()
        if (data.success && data.scans?.length > 0) {
          setRecentScans(data.scans)
          // Auto-restore the most recent scan
          const latest = data.scans[0]
          if (latest.detected_tracks?.length > 0) {
            const tracks = latest.detected_tracks
            setDetectedTracks(tracks)
            setScannerTracklist(latest.tracklist || '')
            setScannerContext(latest.context || '')
            setCurrentScanId(latest.id)
            fetchRaForScanner(tracks) // RA cross-ref in background
            if (latest.result) {
              setScanResult(latest.result)
              setScanPhase('upload') // show result
            } else {
              setScanPhase('review')
            }
            return // Supabase had data, skip localStorage
          }
        }
      } catch {
        // Supabase unavailable — fall back to localStorage
      } finally {
        setLoadingScans(false)
      }
      // Fallback: restore from localStorage
      try {
        const saved = localStorage.getItem(SCANNER_KEY)
        if (!saved) return
        const state = JSON.parse(saved)
        if (state.detectedTracks?.length > 0) {
          setDetectedTracks(state.detectedTracks)
          setScannerTracklist(state.scannerTracklist || '')
          setScannerContext(state.scannerContext || '')
          if (state.scanResult) {
            setScanResult(state.scanResult)
            setScanPhase('upload') // show result
          } else {
            setScanPhase('review')
          }
        }
      } catch {}
    }
    loadRecentScans()
  }, [])

  // Save whenever scanner state changes
  useEffect(() => {
    if (scanPhase === 'upload') return
    try {
      localStorage.setItem(SCANNER_KEY, JSON.stringify({
        detectedTracks,
        scannerTracklist,
        scannerContext,
        scanResult: scanResult || null,
      }))
    } catch {}
  }, [scanPhase, detectedTracks, scannerTracklist, scannerContext, scanResult])

  // ── History Screenshot Import Functions ──────────────────────────────────
  async function handleHistoryScreenshot(file: File) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please drop an image file', 'Error')
      return
    }
    setHistoryImportPhase('uploading')
    setHistoryImportError('')
    setHistoryExtractedTracks([])
    setHistoryMatches([])
    setHistoryImageUrl(null)
    setHistorySetName('')

    try {
      // Step 1: Upload + extract via Claude Vision
      setHistoryImportPhase('extracting')
      const formData = new FormData()
      formData.append('file', file)

      const extractRes = await fetch('/api/sets/from-screenshot', {
        method: 'POST',
        body: formData,
      })
      const extractData = await extractRes.json()

      if (extractData.error || !extractData.tracks?.length) {
        throw new Error(extractData.error || 'No tracks found in this image')
      }

      setHistoryExtractedTracks(extractData.tracks)
      setHistoryImageUrl(extractData.imageUrl)

      // Step 2: Match against library
      setHistoryImportPhase('matching')
      const matchRes = await fetch('/api/sets/from-screenshot/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: extractData.tracks }),
      })
      const matchData = await matchRes.json()

      if (matchData.error) {
        // Non-fatal: show tracks without match data
        setHistoryMatches(extractData.tracks.map((t: any) => ({
          extracted: t,
          library_match: null,
          confidence: 'none' as const,
        })))
      } else {
        setHistoryMatches(matchData.matches)
      }

      setHistoryImportPhase('preview')
      showToast(`${extractData.tracks.length} tracks extracted`, 'Set Lab')
    } catch (err: any) {
      setHistoryImportError(err.message || 'Failed to process screenshot')
      setHistoryImportPhase('idle')
      showToast(err.message || 'Could not read screenshot', 'Error')
    }
  }

  async function saveHistoryScreenshotSet() {
    if (historyMatches.length === 0) return
    setHistoryImportPhase('saving')

    try {
      const tracksToSave = historyMatches.map(m => ({
        title: m.extracted.title,
        artist: m.extracted.artist,
        bpm: m.extracted.bpm || null,
        key: m.extracted.key || null,
        library_match_id: m.library_match?.id || null,
      }))

      const res = await fetch('/api/sets/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: historySetName || `Screenshot import — ${new Date().toLocaleDateString('en-GB')}`,
          tracks: tracksToSave,
          imageUrl: historyImageUrl,
          source: 'screenshot-import',
        }),
      })
      const data = await res.json()

      if (data.error) throw new Error(data.error)

      showToast('Set saved to history', 'Set Lab')
      setHistoryImportPhase('idle')
      setHistoryExtractedTracks([])
      setHistoryMatches([])
      setHistoryImageUrl(null)
      setHistorySetName('')
      loadPastSets()
    } catch (err: any) {
      showToast(err.message || 'Failed to save set', 'Error')
      setHistoryImportPhase('preview')
    }
  }

  function cancelHistoryImport() {
    setHistoryImportPhase('idle')
    setHistoryExtractedTracks([])
    setHistoryMatches([])
    setHistoryImageUrl(null)
    setHistorySetName('')
    setHistoryImportError('')
  }

  function clearScannerState() {
    try { localStorage.removeItem(SCANNER_KEY) } catch {}
    setCurrentScanId(null)
    setScannerRaMap(new Map())
    scannerRaFetched.current = false
  }

  // ── Styles ─────────────────────────────────────────────────────────────
  const s = {
    bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)', borderBright: 'var(--border)',
    gold: 'var(--gold)', goldDim: 'var(--gold-dim)', text: 'var(--text)', textDim: 'var(--text-dim)', textDimmer: 'var(--text-dimmer)',
    black: 'var(--bg)', setlab: 'var(--red-brown)', font: 'var(--font-mono)',
  }

  const btn = (color = s.gold, bg = s.panel) => ({
    fontFamily: s.font, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase' as const,
    padding: '10px 22px', background: bg, border: `1px solid ${color}`, color, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '8px',
  })

  return (
    <div style={{ minHeight: '100vh', background: s.bg, color: s.text, fontFamily: s.font }}>

      {/* HEADER */}
      <div style={{ padding: '40px 48px 0', borderBottom: `1px solid ${s.border}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.setlab, textTransform: 'uppercase', marginBottom: '12px' }}>Set Lab</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1, color: s.text }}>
              Your sets
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '4px' }}>
            <div style={{ fontSize: '12px', color: s.textDimmer, marginRight: '8px' }}>
              {library.length} tracks · {set.length} in set · {setLength}min
            </div>
            <button onClick={saveSet} className="btn-secondary" style={{ fontSize: '10px', height: '36px', padding: '0 18px' }}>Save set</button>
            <button onClick={exportToRekordbox} className="btn-primary" style={{ fontSize: '10px', height: '36px', padding: '0 18px' }}>
              Export →
            </button>
          </div>
        </div>

        {/* Tabs — underline style */}
        <div style={{ display: 'flex', gap: '0' }}>
          {(['library', 'builder', 'history', 'discover', 'scanner', 'intelligence'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? `2px solid ${s.gold}` : '2px solid transparent',
              color: activeTab === tab ? s.text : s.textDimmer,
              fontFamily: s.font,
              fontSize: '11px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              padding: '0 20px 10px',
              cursor: 'pointer',
              transition: 'color 0.15s',
              marginBottom: '-1px',
            }}>{{ builder: 'set builder', discover: 'discover', library: 'library', history: 'history', scanner: 'scanner', intelligence: 'intelligence' }[tab]}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 48px' }}>

        {/* ═══ LIBRARY TAB ═══ */}
        {activeTab === 'library' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* ── LIBRARY SECTION ── */}
            <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: s.setlab, textTransform: 'uppercase', borderBottom: `1px solid ${s.border}`, paddingBottom: '8px' }}>
              Library ({curatedLibrary.length})
            </div>

            {/* Search + Add + Filter */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tracks, artists, genres, moment types..."
                style={{ flex: 1, background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '13px', padding: '12px 16px', outline: 'none' }} />
            </div>

            {/* Moment type filter pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['all', 'opener', 'builder', 'peak', 'breakdown', 'closer'].map(type => (
                <button key={type} onClick={() => setSearchQuery(type === 'all' ? '' : type)}
                  style={{
                    fontFamily: s.font, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase',
                    padding: '6px 14px', cursor: 'pointer',
                    background: (type === 'all' && !searchQuery) || searchQuery === type ? getMomentColor(type) : 'transparent',
                    border: `1px solid ${(type === 'all' && !searchQuery) || searchQuery === type ? getMomentColor(type) : s.border}`,
                    color: (type === 'all' && !searchQuery) || searchQuery === type ? s.bg : s.textDimmer,
                  }}>{type}</button>
              ))}
            </div>

            {/* Audio drop zone — drag MP3/WAV/FLAC to add tracks */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !audioUploading && audioInputRef.current?.click()}
              style={{
                border: `1px dashed ${dragOver ? s.setlab : s.border}`,
                background: dragOver ? 'rgba(154,106,90,0.08)' : s.panel,
                padding: audioUploading ? '16px 24px' : '24px',
                textAlign: 'center',
                cursor: audioUploading ? 'default' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <input ref={audioInputRef} type="file" accept=".mp3,.wav,.flac,.aac,.m4a,.ogg,.aif,.aiff" multiple
                style={{ display: 'none' }}
                onChange={e => e.target.files && handleAudioFiles(e.target.files)} />

              {audioUploading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ScanPulse size="sm" color={s.setlab} />
                  <div style={{ fontSize: '12px', color: s.setlab }}>{audioProgress}</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '13px', color: dragOver ? s.setlab : s.textDim, marginBottom: '4px' }}>
                    {dragOver ? 'Drop audio files here' : 'Drop MP3, WAV, or FLAC files here — or click to browse'}
                  </div>
                  <div style={{ fontSize: '10px', color: s.textDimmer }}>
                    Extracts BPM from audio waveform · adds key, energy, mix techniques, crowd reaction
                  </div>
                </div>
              )}
            </div>

            {/* Screenshot import zone — snap a photo of Traktor/Rekordbox tracklist */}
            <div
              onDragOver={e => { e.preventDefault(); setScreenshotImportDrag(true) }}
              onDragLeave={() => setScreenshotImportDrag(false)}
              onDrop={e => {
                e.preventDefault()
                setScreenshotImportDrag(false)
                const file = e.dataTransfer.files[0]
                if (file) importTracksFromScreenshot(file)
              }}
              onClick={() => !screenshotImporting && screenshotInputRef.current?.click()}
              style={{
                border: `1px dashed ${screenshotImportDrag ? s.setlab : s.border}`,
                background: screenshotImportDrag ? 'rgba(154,106,90,0.06)' : s.panel,
                padding: screenshotImporting ? '16px 24px' : '20px 24px',
                textAlign: 'center',
                cursor: screenshotImporting ? 'default' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <input ref={screenshotInputRef} type="file" accept="image/*"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) importTracksFromScreenshot(f); e.target.value = '' }} />

              {screenshotImporting ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ScanPulse size="sm" color={s.setlab} />
                  <div style={{ fontSize: '12px', color: s.setlab }}>{screenshotImportProgress}</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: screenshotImportDrag ? s.setlab : s.textDim, marginBottom: '4px' }}>
                    {screenshotImportDrag ? 'Drop screenshot here' : 'Import from screenshot'}
                  </div>
                  <div style={{ fontSize: '10px', color: s.textDimmer }}>
                    Drop a photo of your tracklist (Traktor, Rekordbox, CDJ screen) — tracks extracted and added to library
                  </div>
                </div>
              )}
            </div>

            {/* Track library with expandable intelligence */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: '28px 36px 2fr 1.2fr 65px 65px 65px 55px 90px 80px', gap: '0', padding: '12px 20px', borderBottom: `1px solid ${s.border}`, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <input type="checkbox" checked={selectedTracks.size > 0 && filteredLibrary.every(t => selectedTracks.has(t.id))}
                    onChange={() => {
                      if (filteredLibrary.every(t => selectedTracks.has(t.id))) setSelectedTracks(new Set())
                      else setSelectedTracks(new Set(filteredLibrary.map(t => t.id)))
                    }}
                    style={{ cursor: 'pointer', accentColor: s.gold }} />
                </div>
                <div />
                {['Track', 'Artist', 'BPM', 'Key', 'Camelot', 'Energy', 'Moment', ''].map(h => (
                  <div key={h} style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.textDimmer, textTransform: 'uppercase' }}>{h}</div>
                ))}
              </div>
              {!libraryLoading && filteredLibrary.length === 0 && (
                <div style={{ padding: '56px 40px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '16px' }}>Library empty</div>
                  <div style={{ fontSize: '14px', color: s.textDim, marginBottom: '8px' }}>Add your first track to start building sets.</div>
                  <div style={{ fontSize: '12px', color: s.textDimmer }}>Type a track name in the search above, or use the Track Lookup tab in Sonix Lab.</div>
                </div>
              )}
              {filteredLibrary.map(track => (
                <div key={track.id}>
                  <div style={{ display: 'grid', gridTemplateColumns: '28px 36px 2fr 1.2fr 65px 65px 65px 55px 90px 80px', gap: '0', padding: '14px 20px', borderBottom: `1px solid ${s.border}`, transition: 'background 0.15s', cursor: 'pointer', background: selectedTracks.has(track.id) ? `${s.gold}08` : 'transparent' }}
                    onClick={() => setExpandedTrack(expandedTrack === track.id ? null : track.id)}
                    onMouseEnter={e => { if (!selectedTracks.has(track.id)) e.currentTarget.style.background = s.bg }}
                    onMouseLeave={e => { e.currentTarget.style.background = selectedTracks.has(track.id) ? `${s.gold}08` : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { e.stopPropagation(); toggleTrackSelection(track.id) }}>
                      <input type="checkbox" checked={selectedTracks.has(track.id)} readOnly
                        style={{ cursor: 'pointer', accentColor: s.gold }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }} onClick={e => {
                      e.stopPropagation()
                      if (track.spotify_url) {
                        const spotifyId = track.spotify_url.match(/track\/([a-zA-Z0-9]+)/)?.[1]
                        if (spotifyId) setPlayingTrack(playingTrack?.id === track.id ? null : { id: track.id, title: track.title, artist: track.artist, spotify_url: `https://open.spotify.com/embed/track/${spotifyId}?utm_source=generator&theme=0`, album_art: track.album_art })
                      }
                    }}>
                      {track.album_art ? (
                        <div style={{ width: '32px', height: '32px', position: 'relative', cursor: track.spotify_url ? 'pointer' : 'default' }}>
                          <img src={track.album_art} alt="" style={{ width: '32px', height: '32px', objectFit: 'cover', opacity: playingTrack?.id === track.id ? 0.4 : 1, transition: 'opacity 0.15s' }} />
                          {track.spotify_url && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#fff', opacity: playingTrack?.id === track.id ? 1 : 0, transition: 'opacity 0.15s' }}>{playingTrack?.id === track.id ? '■' : '▶'}</div>}
                        </div>
                      ) : (
                        <div style={{ width: '32px', height: '32px', background: s.border, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: track.spotify_url ? 'pointer' : 'default' }}>
                          <span style={{ fontSize: track.spotify_url ? '12px' : '10px', color: track.spotify_url ? s.gold : s.textDimmer }}>{track.spotify_url ? (playingTrack?.id === track.id ? '■' : '▶') : '♪'}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', letterSpacing: '0.05em', color: s.text }}>
                        {track.spotify_url ? (
                          <a href={track.spotify_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: s.text, textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.color = s.gold)} onMouseLeave={e => (e.currentTarget.style.color = s.text)}>{track.title}</a>
                        ) : track.title}
                      </div>
                      {track.notes && <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '2px' }}>{track.notes}</div>}
                    </div>
                    <div style={{ fontSize: '12px', color: s.textDim, display: 'flex', alignItems: 'center' }}>{track.artist}</div>
                    <div style={{ fontSize: '12px', color: s.textDim, display: 'flex', alignItems: 'center' }}>{track.bpm}</div>
                    <div style={{ fontSize: '11px', color: s.textDim, display: 'flex', alignItems: 'center' }}>{track.key}</div>
                    <div style={{ fontSize: '12px', color: s.gold, fontWeight: 400, display: 'flex', alignItems: 'center' }}>{track.camelot}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ flex: 1, height: '3px', background: s.border, position: 'relative' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, height: '3px', width: `${track.energy * 10}%`, background: track.energy > 7 ? s.gold : track.energy > 4 ? '#3d6b4a' : '#52504c' }} />
                      </div>
                      <span style={{ fontSize: '10px', color: s.textDimmer }}>{track.energy}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          const types = ['opener', 'builder', 'peak', 'breakdown', 'closer']
                          const idx = types.indexOf(track.moment_type)
                          const next = types[(idx + 1) % types.length]
                          setLibrary(prev => prev.map(t => t.id === track.id ? { ...t, moment_type: next } : t))
                          fetch('/api/tracks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: track.id, moment_type: next }) })
                        }}
                        title="Click to change"
                        style={{ fontSize: '10px', padding: '3px 8px', background: getMomentColor(track.moment_type) + '20', border: `1px solid ${getMomentColor(track.moment_type)}40`, color: getMomentColor(track.moment_type), letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s' }}>
                        {track.moment_type || '—'}
                      </span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); addToSet(track, true) }} style={{ ...btn(s.gold), fontSize: '10px', padding: '6px 12px' }}>→ Set</button>
                  </div>

                  {/* ── Expanded Track Intelligence Card ── */}
                  {expandedTrack === track.id && (
                    <div style={{ background: s.bg, borderBottom: `1px solid ${s.border}`, padding: '20px 24px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>

                        {/* Mix Techniques */}
                        <div>
                          <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '10px' }}>Mix techniques</div>
                          <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '10px', color: s.textDimmer, marginBottom: '4px' }}>MIX IN</div>
                            <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.5' }}>{track.mix_in || 'Not yet analysed'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: s.textDimmer, marginBottom: '4px' }}>MIX OUT</div>
                            <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.5' }}>{track.mix_out || 'Not yet analysed'}</div>
                          </div>
                        </div>

                        {/* Crowd & Positioning */}
                        <div>
                          <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '10px' }}>Intelligence</div>
                          {[
                            { label: 'Crowd reaction', val: track.crowd_reaction },
                            { label: 'Best position', val: track.position_score },
                            { label: 'Moment type', val: track.moment_type },
                            { label: 'Duration', val: track.duration },
                          ].map(item => (
                            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${s.border}` }}>
                              <span style={{ fontSize: '10px', color: s.textDimmer }}>{item.label}</span>
                              <span style={{ fontSize: '11px', color: s.text }}>{item.val || '—'}</span>
                            </div>
                          ))}
                        </div>

                        {/* Production Style & Similar */}
                        <div>
                          <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '10px' }}>Production</div>
                          {track.producer_style && (
                            <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.5', marginBottom: '12px' }}>
                              {track.producer_style}
                            </div>
                          )}
                          {track.similar_to && (
                            <div>
                              <div style={{ fontSize: '10px', color: s.textDimmer, marginBottom: '4px' }}>SIMILAR IN YOUR LIBRARY</div>
                              <div style={{ fontSize: '11px', color: s.gold }}>{track.similar_to}</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions row */}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${s.border}` }}>
                        {track.spotify_url && (
                          <a href={track.spotify_url} target="_blank" rel="noopener noreferrer"
                            style={{ ...btn('#1DB954', 'transparent'), fontSize: '10px', padding: '6px 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                            ▶ Listen on Spotify
                          </a>
                        )}
                        <button
                          onClick={() => reanalyseTrack(track)}
                          disabled={reanalysing === track.id}
                          style={{ ...btn(s.gold, 'transparent'), fontSize: '10px', padding: '6px 14px', opacity: reanalysing === track.id ? 0.5 : 1 }}>
                          {reanalysing === track.id ? 'Cross-referencing...' : '↻ Verify & correct'}
                        </button>
                        <button
                          onClick={() => setEditingTrack({ ...track })}
                          style={{ ...btn(s.textDim, 'transparent'), fontSize: '10px', padding: '6px 14px' }}>
                          Edit
                        </button>
                        <button
                          onClick={() => { if (confirm(`Remove "${track.title}"?`)) deleteTrack(track.id) }}
                          style={{ ...btn('#9a6a5a', 'transparent'), fontSize: '10px', padding: '6px 14px', marginLeft: 'auto' }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── FLOATING SELECTION BAR ── */}
            {selectedTracks.size > 0 && (
              <div style={{
                position: 'sticky', bottom: '24px', zIndex: 50,
                background: s.black, border: `1px solid ${s.gold}40`,
                padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: `0 8px 32px rgba(0,0,0,0.6)`,
              }}>
                <div style={{ fontSize: '12px', color: s.text, letterSpacing: '0.06em' }}>
                  {selectedTracks.size} track{selectedTracks.size !== 1 ? 's' : ''} selected
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setSelectedTracks(new Set())} style={{ ...btn(s.border), fontSize: '10px', padding: '8px 16px', color: s.textDim }}>Clear</button>
                  <button onClick={deleteSelectedTracks} style={{ ...btn('#ff4444'), fontSize: '10px', padding: '8px 16px' }}>Delete</button>
                  <button onClick={addSelectedToSet} style={{ ...btn(s.gold), fontSize: '10px', padding: '8px 20px' }}>Add {selectedTracks.size} to Set →</button>
                </div>
              </div>
            )}

            {/* ── DISCOVERIES SECTION ── */}
            <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: s.gold, textTransform: 'uppercase', borderBottom: `1px solid ${s.border}`, paddingBottom: '8px', marginTop: '32px' }}>
              Discoveries ({discoveries.length})
            </div>
            {discoveries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 24px' }}>
                <div style={{ fontSize: '12px', color: s.textDimmer }}>Tracks identified on mobile appear here</div>
              </div>
            ) : (
              <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
                {discoveries.map(track => (
                  <div key={track.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 20px', borderBottom: `1px solid ${s.border}`, transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = s.bg)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', color: s.text, letterSpacing: '0.04em' }}>{track.title}</div>
                      <div style={{ fontSize: '11px', color: s.textDim, marginTop: '2px' }}>{track.artist}</div>
                    </div>
                    <div style={{ fontSize: '9px', padding: '3px 7px', background: `${s.gold}15`, border: `1px solid ${s.gold}40`, color: s.gold, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>
                      {track.source}
                    </div>
                    <button onClick={() => addToSet(track, true)} style={{ ...btn(s.gold), fontSize: '10px', padding: '6px 12px', flexShrink: 0 }}>→ Set</button>
                  </div>
                ))}
              </div>
            )}

            {/* ── PLAYLISTS SECTION ── */}
            <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: s.gold, textTransform: 'uppercase', borderBottom: `1px solid ${s.border}`, paddingBottom: '8px', marginTop: '32px' }}>
              Playlists ({Object.keys(playlistGroups).length})
            </div>
            {Object.keys(playlistGroups).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 24px' }}>
                <div style={{ fontSize: '12px', color: s.textDimmer }}>Tracklists captured from screenshots appear here</div>
              </div>
            ) : (
              Object.entries(playlistGroups).map(([name, tracks]) => (
                <div key={name} style={{ background: s.panel, border: `1px solid ${s.border}`, marginBottom: '8px' }}>
                  <div style={{ padding: '12px 20px', borderBottom: `1px solid ${s.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '12px', color: s.text, letterSpacing: '0.06em' }}>{name}</div>
                    <div style={{ fontSize: '10px', color: s.textDimmer }}>{tracks.length} tracks</div>
                  </div>
                  {tracks.map(track => (
                    <div key={track.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 20px', borderBottom: `1px solid ${s.border}`, transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = s.bg)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', color: s.text }}>{track.title}</div>
                        <div style={{ fontSize: '11px', color: s.textDim, marginTop: '1px' }}>{track.artist}</div>
                      </div>
                      <button onClick={() => addToSet(track, true)} style={{ ...btn(s.gold), fontSize: '10px', padding: '6px 12px', flexShrink: 0 }}>→ Set</button>
                    </div>
                  ))}
                </div>
              ))
            )}

            {/* ── WANTLIST SECTION ── */}
            <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: s.gold, textTransform: 'uppercase', borderBottom: `1px solid ${s.border}`, paddingBottom: '8px', marginTop: '32px' }}>
              Wantlist ({wantlist.length})
            </div>
            {wantlistLoading && (
              <div style={{ padding: '40px', textAlign: 'center' }}><ScanPulse size="sm" color={s.gold} /></div>
            )}
            {!wantlistLoading && wantlist.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 24px' }}>
                <div style={{ fontSize: '12px', color: s.textDimmer }}>Save releases from Crate Dig to build your wantlist</div>
              </div>
            )}
            {wantlist.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {wantlist.map((item: any) => (
                  <div key={item.discogs_release_id} style={{ background: s.panel, border: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 18px', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = s.borderBright)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = s.border)}>
                    {item.thumb
                      ? <img src={item.thumb} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: '48px', height: '48px', background: s.bg, border: `1px solid ${s.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: s.textDimmer }}>&#9835;</div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', color: s.text, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                      <div style={{ fontSize: '11px', color: s.textDim, marginTop: '2px' }}>{item.artist}</div>
                      {item.label_name && <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '2px' }}>{item.label_name}{item.year ? ` · ${item.year}` : ''}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                      {item.dig_type && (
                        <div style={{ fontSize: '9px', padding: '3px 7px', background: `${s.setlab}15`, border: `1px solid ${s.setlab}40`, color: s.setlab, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                          {item.dig_type}
                        </div>
                      )}
                      {item.discogs_url && (
                        <a href={item.discogs_url} target="_blank" rel="noreferrer"
                          style={{ fontSize: '10px', color: s.setlab, textDecoration: 'none', letterSpacing: '0.1em', border: `1px solid ${s.setlab}40`, padding: '5px 10px', whiteSpace: 'nowrap' }}>
                          Discogs ↗
                        </a>
                      )}
                      <button onClick={async () => {
                        const t: Track = { id: `discogs-${item.discogs_release_id}`, title: item.title, artist: item.artist, bpm: 0, key: '', camelot: '', energy: 5,
                          genre: 'Electronic', duration: '', notes: '', analysed: false, moment_type: '', position_score: '', mix_in: '', mix_out: '', crowd_reaction: '', similar_to: '', producer_style: '' }
                        await fetch('/api/tracks', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ tracks: [{ ...t, source: 'discogs', discovered_via: { discogs_release_id: item.discogs_release_id, dig_type: item.dig_type, source_track_id: item.source_track_id } }] }) })
                        setLibrary(prev => [...prev, t])
                        removeFromWantlist(item.discogs_release_id)
                        showToast(`${item.title} moved to library`, 'Added')
                      }} style={{ ...btn(s.setlab, 'transparent'), fontSize: '10px', padding: '6px 10px', flexShrink: 0 }}>
                        + Library
                      </button>
                      <button onClick={() => removeFromWantlist(item.discogs_release_id)}
                        style={{ ...btn('#9a6a5a', 'transparent'), fontSize: '10px', padding: '6px 10px', flexShrink: 0 }}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* ═══ SET BUILDER TAB ═══ */}
        {activeTab === 'builder' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* ── Gig Context Banner ── */}
          {upcomingGig && (
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, borderLeft: `3px solid ${s.gold}` }}>
              <div
                onClick={() => setGigBannerOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase' }}>Next gig</span>
                  <span style={{ fontSize: '12px', color: s.text }}>{upcomingGig.venue}</span>
                  <span style={{ fontSize: '11px', color: s.textDim }}>
                    {new Date(upcomingGig.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {upcomingGig.slot_time ? ` · ${upcomingGig.slot_time}` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {currentSetGigId === upcomingGig.id ? (
                    <span style={{ fontSize: '10px', color: '#4d9970', letterSpacing: '0.1em' }}>Set linked ✓</span>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); linkSetToGig(upcomingGig.id) }}
                      disabled={linkingGig}
                      style={{ background: 'transparent', border: `1px solid ${s.gold}`, color: s.gold, fontFamily: s.font, fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '5px 12px', cursor: 'pointer', opacity: linkingGig ? 0.5 : 1 }}
                    >
                      {linkingGig ? 'Linking…' : 'Link this set'}
                    </button>
                  )}
                  <span style={{ fontSize: '10px', color: s.textDimmer }}>{gigBannerOpen ? '▲' : '▼'}</span>
                </div>
              </div>
              {gigBannerOpen && (
                <div style={{ padding: '0 16px 10px', fontSize: '11px', color: s.textDim }}>
                  Slot detected: <span style={{ color: s.gold }}>{deriveSlotType(upcomingGig)}</span>
                  {' · '}Track suggestions will be tailored to this slot.
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Set config */}
              <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '12px' }}>
                  {[
                    { label: 'Set name', value: setName, onChange: setSetName, placeholder: 'My Set' },
                    { label: 'Venue', value: venue, onChange: setVenue, placeholder: 'Fabric, London' },
                  ].map(f => (
                    <div key={f.label}>
                      <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '6px' }}>{f.label}</div>
                      <input value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder}
                        style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '8px 12px', outline: 'none' }} />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '6px' }}>Slot type</div>
                    <select value={slotType} onChange={e => setSlotType(e.target.value)}
                      style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '8px 12px', outline: 'none' }}>
                      {['Club — peak time', 'Club — warm up', 'Club — closing', 'Festival — main stage', 'Festival — second stage', 'Festival — opening', 'Private event', 'Livestream'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '6px' }}>Length</div>
                    <select value={setLength} onChange={e => setSetLength(e.target.value)}
                      style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '8px 12px', outline: 'none' }}>
                      {['30', '45', '60', '90', '120', '180'].map(o => <option key={o}>{o} min</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '6px' }}>Link to gig</div>
                    <select
                      value={currentSetGigId || ''}
                      onChange={e => { if (e.target.value) linkSetToGig(e.target.value) }}
                      disabled={linkingGig}
                      style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: currentSetGigId ? s.gold : s.textDim, fontFamily: s.font, fontSize: '12px', padding: '8px 12px', outline: 'none', opacity: linkingGig ? 0.5 : 1 }}
                    >
                      <option value=''>No gig linked</option>
                      {gigs.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.title} · {new Date(g.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </option>
                      ))}
                    </select>
                    {currentSetGigId && (
                      <div style={{ fontSize: '10px', color: '#4d9970', marginTop: '5px', letterSpacing: '0.05em' }}>
                        Linked: {gigs.find(g => g.id === currentSetGigId)?.title || 'Gig'}
                      </div>
                    )}
                    {!currentSetGigId && (
                      <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '5px' }}>No gig linked</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Energy arc */}
              {set.length > 1 && (
                <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '16px 24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase' }}>Energy arc</div>
                    <div style={{ fontSize: '10px', color: s.textDimmer }}>
                      Avg flow: {Math.round(set.reduce((a, t) => a + t.flow_score, 0) / set.length)}%
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '60px' }}>
                    {set.map((t, i) => (
                      <div key={t.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <div style={{
                          width: '100%', height: `${(t.energy / 10) * 52}px`,
                          background: t.energy > 7 ? s.gold : t.energy > 4 ? '#3d6b4a' : '#52504c',
                          border: '1px solid rgba(201,164,110,0.15)', transition: 'height 0.4s ease',
                        }} />
                        <div style={{ fontSize: '10px', color: s.textDimmer }}>{i + 1}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Track list */}
              <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
                {set.length === 0 ? (
                  <div style={{ padding: '48px', textAlign: 'center', color: s.textDimmer, fontSize: '12px', letterSpacing: '0.1em' }}>
                    Add tracks from the Library tab to build your set
                  </div>
                ) : (
                  set.map((track, i) => {
                    const next = set[i + 1]
                    const nextFlow = next ? getFlowScore(track, next) : null
                    return (
                      <div key={track.id}>
                        <div style={{ display: 'grid', gridTemplateColumns: '28px 2fr 1fr 60px 60px 55px 55px 55px auto', gap: '0', padding: '14px 16px', borderBottom: `1px solid ${s.border}` }}>
                          <div style={{ fontSize: '12px', color: s.textDimmer, display: 'flex', alignItems: 'center' }}>{i + 1}</div>
                          <div>
                            <div style={{ fontSize: '13px', color: s.text }}>{track.title}</div>
                            <div style={{ fontSize: '11px', color: s.textDim, marginTop: '2px' }}>{track.artist}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span style={{ fontSize: '10px', padding: '2px 6px', background: getMomentColor(track.moment_type) + '20', color: getMomentColor(track.moment_type) }}>{track.moment_type}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: s.textDim, display: 'flex', alignItems: 'center' }}>{track.bpm}</div>
                          <div style={{ fontSize: '12px', color: s.gold, display: 'flex', alignItems: 'center' }}>{track.camelot}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <div style={{ width: '24px', height: '3px', background: s.border, position: 'relative' }}>
                              <div style={{ position: 'absolute', top: 0, left: 0, height: '3px', width: `${track.energy * 10}%`, background: track.energy > 7 ? s.gold : '#3d6b4a' }} />
                            </div>
                            <span style={{ fontSize: '10px', color: s.textDimmer }}>{track.energy}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {track.flow_score < 100 && (
                              <div style={{ fontSize: '10px', color: getCompatibilityColor(track.flow_score), letterSpacing: '0.1em' }}>{track.flow_score}%</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {i > 0 && <button onClick={() => moveTrack(i, i - 1)} style={{ background: 'none', border: 'none', color: s.textDimmer, cursor: 'pointer', fontSize: '11px', padding: '0 2px' }}>↑</button>}
                            {i < set.length - 1 && <button onClick={() => moveTrack(i, i + 1)} style={{ background: 'none', border: 'none', color: s.textDimmer, cursor: 'pointer', fontSize: '11px', padding: '0 2px' }}>↓</button>}
                            <button onClick={() => removeFromSet(track.id)} style={{ background: 'none', border: 'none', color: s.textDimmer, cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}>×</button>
                          </div>
                        </div>
                        {/* Flow warning */}
                        {nextFlow !== null && nextFlow < 65 && (
                          <div style={{ padding: '6px 16px 6px 44px', background: 'rgba(154,106,90,0.1)', borderBottom: `1px solid ${s.border}`, fontSize: '10px', color: '#9a6a5a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>⚠</span>
                            {track.title} → {next?.title}: {nextFlow}% flow ({track.camelot}→{next?.camelot}, {Math.abs(track.bpm - next!.bpm)}BPM gap, energy {track.energy}→{next!.energy})
                            {nextFlow < 45 && ' — consider reordering or adding a bridge track'}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Suggest Next button */}
              {set.length > 0 && (
                <div>
                  <button onClick={suggestNextTrack} disabled={suggestingNext} style={{ ...btn(s.setlab), width: '100%', justifyContent: 'center' }}>
                    {suggestingNext && <ScanPulse size="sm" color={s.setlab} />}
                    {suggestingNext ? 'Finding best next track...' : 'Suggest next track →'}
                  </button>

                  {/* Suggestions */}
                  {suggestions.length > 0 && (
                    <div style={{ background: s.panel, border: `1px solid ${s.setlab}40`, marginTop: '8px' }}>
                      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${s.border}`, fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase' }}>Recommended next</div>
                      {suggestions.map(sug => {
                        const track = library.find(t => t.id === sug.id)
                        if (!track) return null
                        const lastTrack = set[set.length - 1]
                        const flow = getFlowScore(lastTrack, track)
                        return (
                          <div key={sug.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '13px', color: s.text }}>{track.title}</span>
                                <span style={{ fontSize: '11px', color: s.textDim }}>{track.artist}</span>
                                <span style={{ fontSize: '10px', color: getCompatibilityColor(flow) }}>{flow}% flow</span>
                              </div>
                              <div style={{ fontSize: '10px', color: s.textDim, marginTop: '4px' }}>{sug.reason}</div>
                            </div>
                            <button onClick={() => addToSet(track)} style={{ ...btn(s.setlab), fontSize: '10px', padding: '6px 12px' }}>Add →</button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* AI NARRATIVE + STATS PANEL */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '16px' }}>Set intelligence</div>
                <button onClick={generateSetNarrative} disabled={generatingNarrative || set.length < 3} style={{ ...btn(s.gold), width: '100%', justifyContent: 'center', opacity: set.length < 3 ? 0.4 : 1 }}>
                  {generatingNarrative && <ScanPulse size="sm" />}
                  {generatingNarrative ? 'Analysing set...' : 'Analyse my set'}
                </button>
                {set.length < 3 && <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '8px', textAlign: 'center' }}>Add {3 - set.length} more track{3 - set.length > 1 ? 's' : ''}</div>}

                {narrative && (
                  <div style={{ marginTop: '16px', borderTop: `1px solid ${s.border}`, paddingTop: '16px' }}>
                    <div style={{ fontSize: '11px', lineHeight: '1.8', color: s.textDim, whiteSpace: 'pre-wrap', letterSpacing: '0.04em' }}>{narrative}</div>
                  </div>
                )}
              </div>

              {/* Set stats */}
              {set.length > 0 && (
                <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '16px' }}>Set stats</div>
                  {[
                    { label: 'Tracks', val: set.length },
                    { label: 'Avg BPM', val: Math.round(set.reduce((a, t) => a + t.bpm, 0) / set.length) },
                    { label: 'BPM range', val: `${Math.min(...set.map(t => t.bpm))}–${Math.max(...set.map(t => t.bpm))}` },
                    { label: 'Avg energy', val: (set.reduce((a, t) => a + t.energy, 0) / set.length).toFixed(1) + '/10' },
                    { label: 'Peak energy', val: Math.max(...set.map(t => t.energy)) + '/10' },
                    { label: 'Avg flow', val: Math.round(set.reduce((a, t) => a + t.flow_score, 0) / set.length) + '%' },
                    { label: 'Weak flows', val: set.filter(t => t.flow_score < 60).length },
                    { label: 'Moment mix', val: [...new Set(set.map(t => t.moment_type))].join(', ') },
                  ].map(stat => (
                    <div key={stat.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${s.border}`, fontSize: '12px' }}>
                      <span style={{ color: s.textDimmer }}>{stat.label}</span>
                      <span style={{ color: s.text }}>{stat.val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          </div>
        )}

        {/* ═══ HISTORY TAB ═══ */}
        {activeTab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* ── Screenshot Import Zone ── */}
            {historyImportPhase === 'idle' && (
              <div
                onDragOver={e => { e.preventDefault(); setHistoryScreenshotDragging(true) }}
                onDragLeave={() => setHistoryScreenshotDragging(false)}
                onDrop={async e => {
                  e.preventDefault()
                  setHistoryScreenshotDragging(false)
                  const file = e.dataTransfer.files[0]
                  if (file) await handleHistoryScreenshot(file)
                }}
                onClick={() => {
                  const inp = document.createElement('input')
                  inp.type = 'file'; inp.accept = 'image/*'
                  inp.onchange = async (ev) => {
                    const f = (ev.target as HTMLInputElement).files?.[0]
                    if (f) await handleHistoryScreenshot(f)
                  }
                  inp.click()
                }}
                style={{
                  border: `1px dashed ${historyScreenshotDragging ? s.setlab : s.border}`,
                  background: historyScreenshotDragging ? 'rgba(154,106,90,0.06)' : s.panel,
                  padding: '40px 32px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontSize: '24px', marginBottom: '14px', opacity: 0.25 }}>&#9678;</div>
                <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: s.text, textTransform: 'uppercase', marginBottom: '6px' }}>
                  Drop a screenshot of your set history
                </div>
                <div style={{ fontSize: '10px', color: s.textDimmer }}>
                  Rekordbox history, Traktor, CDJ screen, or any tracklist image
                </div>
              </div>
            )}

            {/* ── Loading States ── */}
            {(historyImportPhase === 'uploading' || historyImportPhase === 'extracting' || historyImportPhase === 'matching') && (
              <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '48px 32px', textAlign: 'center' }}>
                <ScanPulse size="sm" color={s.setlab} />
                <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: s.setlab, textTransform: 'uppercase', marginTop: '16px' }}>
                  {historyImportPhase === 'uploading' && 'Uploading image...'}
                  {historyImportPhase === 'extracting' && 'Reading your tracklist...'}
                  {historyImportPhase === 'matching' && 'Matching against your library...'}
                </div>
              </div>
            )}

            {/* ── Error State ── */}
            {historyImportError && historyImportPhase === 'idle' && (
              <div style={{ background: 'rgba(154,106,90,0.08)', border: '1px solid rgba(154,106,90,0.3)', padding: '14px 18px', fontSize: '11px', color: '#9a6a5a' }}>
                {historyImportError}
              </div>
            )}

            {/* ── Preview Extracted Tracks ── */}
            {(historyImportPhase === 'preview' || historyImportPhase === 'saving') && historyMatches.length > 0 && (
              <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase' }}>
                    {historyMatches.length} tracks extracted
                  </div>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '10px' }}>
                    {(() => {
                      const exact = historyMatches.filter(m => m.confidence === 'exact').length
                      const partial = historyMatches.filter(m => m.confidence === 'partial').length
                      const none = historyMatches.filter(m => m.confidence === 'none').length
                      return (
                        <>
                          {exact > 0 && <span style={{ color: '#3d6b4a' }}>{exact} in library</span>}
                          {partial > 0 && <span style={{ color: s.gold }}>{partial} partial</span>}
                          {none > 0 && <span style={{ color: s.textDimmer }}>{none} new</span>}
                        </>
                      )
                    })()}
                  </div>
                </div>

                {/* Set name input */}
                <input
                  value={historySetName}
                  onChange={e => setHistorySetName(e.target.value)}
                  placeholder="Set name (optional)"
                  style={{
                    width: '100%', background: s.black, border: `1px solid ${s.border}`,
                    color: s.text, fontFamily: s.font, fontSize: '12px', padding: '10px 14px',
                    outline: 'none', boxSizing: 'border-box', marginBottom: '16px',
                  }}
                />

                {/* Track list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '20px' }}>
                  {historyMatches.map((match, i) => {
                    const dotColor = match.confidence === 'exact' ? '#3d6b4a' : match.confidence === 'partial' ? '#b08d57' : '#52504c'
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '10px 14px', background: s.black, border: `1px solid ${s.border}`,
                      }}>
                        {/* Position */}
                        <div style={{ fontSize: '10px', color: s.textDimmer, minWidth: '20px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {match.extracted.position || i + 1}
                        </div>

                        {/* Match indicator dot */}
                        <div style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          background: dotColor, flexShrink: 0,
                        }} />

                        {/* Track info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '12px', color: s.text, letterSpacing: '0.03em',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {match.extracted.title}
                            <span style={{ color: s.textDim }}> — {match.extracted.artist}</span>
                          </div>
                        </div>

                        {/* BPM / Key */}
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                          {match.extracted.bpm && (
                            <div style={{ fontSize: '10px', color: s.textDimmer }}>{match.extracted.bpm}</div>
                          )}
                          {match.extracted.key && (
                            <div style={{ fontSize: '10px', color: s.gold }}>{match.extracted.key}</div>
                          )}
                        </div>

                        {/* Match label */}
                        <div style={{
                          fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase',
                          color: dotColor, flexShrink: 0,
                        }}>
                          {match.confidence === 'exact' ? 'In library' : match.confidence === 'partial' ? 'Partial' : 'New'}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={saveHistoryScreenshotSet}
                    style={{ ...btn(s.setlab), flex: 1, justifyContent: 'center', fontSize: '11px', padding: '13px' }}
                  >
                    {historyImportPhase === 'saving' ? (
                      <><ScanPulse size="sm" color={s.setlab} /> Saving...</>
                    ) : (
                      'Save set'
                    )}
                  </button>
                  <button
                    onClick={cancelHistoryImport}
                    style={{ ...btn(s.textDim, 'transparent'), fontSize: '11px', padding: '13px 22px' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── Past Sets List ── */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '16px' }}>Past sets</div>
              {pastSets.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: s.textDimmer, fontSize: '12px' }}>
                  No past sets yet — save your first set in the Set Builder tab
                </div>
              ) : (
                pastSets.map((ps, i) => (
                  <div key={i} style={{ padding: '16px', border: `1px solid ${s.border}`, marginBottom: '8px', background: s.black }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontSize: '13px', color: s.text }}>{ps.name || 'Unnamed set'}</div>
                        {ps.venue && <div style={{ fontSize: '11px', color: s.textDim, marginTop: '3px' }}>{ps.venue} · {ps.slot_type}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                        <div style={{ fontSize: '10px', color: s.textDimmer }}>{new Date(ps.created_at).toLocaleDateString('en-GB')}</div>
                        <button
                          onClick={() => loadSetIntoBuilder(ps)}
                          style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.setlab, border: `1px solid ${s.setlab}33`, padding: '4px 10px', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          onMouseEnter={e => { (e.target as HTMLElement).style.background = `${s.setlab}15` }}
                          onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent' }}
                        >
                          Load →
                        </button>
                      </div>
                    </div>
                    {ps.narrative && <div style={{ fontSize: '10px', color: s.textDimmer, lineHeight: '1.5', marginTop: '8px' }}>{ps.narrative.slice(0, 200)}...</div>}
                    {ps.tracks && (() => { try { const t = JSON.parse(ps.tracks); return t.length > 0 ? <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '4px' }}>{t.length} track{t.length !== 1 ? 's' : ''}</div> : null } catch { return null } })()}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ═══ DISCOVER TAB ═══ */}
        {activeTab === 'discover' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Discover source selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.textDimmer, flexShrink: 0 }}>Discover from</div>
              <select value={discoverSource} onChange={e => setDiscoverSource(e.target.value)}
                style={{ flex: 1, background: s.panel, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px 12px', outline: 'none', cursor: 'pointer' }}>
                <option value="current-set">Current set ({set.length} tracks)</option>
                <option value="library">Full library ({curatedLibrary.length} tracks)</option>
                {Object.entries(playlistGroups).map(([name, tracks]) => (
                  <option key={`pl:${name}`} value={`playlist:${name}`}>{name} ({tracks.length} tracks)</option>
                ))}
                {pastSets.map((ps: any) => (
                  <option key={`set:${ps.id}`} value={`set:${ps.id}`}>{ps.name || 'Untitled set'} ({ps.tracks?.length || 0} tracks)</option>
                ))}
              </select>
            </div>

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: '0' }}>
              {(['beatport', 'crate'] as const).map(mode => (
                <button key={mode} onClick={() => setDiscoverMode(mode)} style={{
                  fontFamily: s.font, fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase',
                  padding: '10px 24px', cursor: 'pointer', border: `1px solid ${s.border}`,
                  background: discoverMode === mode ? s.panel : 'transparent',
                  color: discoverMode === mode ? s.text : s.textDimmer,
                  borderBottom: discoverMode === mode ? `2px solid ${s.setlab}` : `1px solid ${s.border}`,
                }}>
                  {mode === 'beatport' ? 'Beatport x RA' : 'Crate Dig'}
                </button>
              ))}
            </div>

            {/* ── BEATPORT MODE ── */}
            {discoverMode === 'beatport' && (
              <>
                <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px 28px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div>
                      <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '13px', fontWeight: 300, letterSpacing: '0.2em', color: s.setlab, marginBottom: '6px' }}>DISCOVER</div>
                      <div style={{ fontSize: '11px', color: s.textDimmer, letterSpacing: '0.05em', lineHeight: '1.6' }}>
                        Real tracks from Beatport x RA charts — filtered to your key, BPM, and underground depth.<br/>
                        {discoverMeta && <span style={{ color: s.goldDim }}>Matching {discoverMeta.targetCamelot} · ~{discoverMeta.targetBpm} BPM</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: '10px', color: s.textDimmer, textAlign: 'right', lineHeight: '1.7' }}>
                      <div style={{ color: '#f7a500', opacity: 0.7 }}>Beatport catalogue</div>
                      <div style={{ color: '#dc2626', opacity: 0.7 }}>RA charts cross-ref</div>
                      <div>Camelot + BPM filtered</div>
                    </div>
                  </div>

                  {/* Underground slider */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.textDimmer }}>
                        Underground depth
                      </div>
                      <div style={{ fontSize: '11px', color: maxPopularity < 25 ? '#9a6a5a' : maxPopularity < 50 ? s.gold : s.textDim, letterSpacing: '0.1em' }}>
                        {maxPopularity < 25 ? 'Rare gems' : maxPopularity < 50 ? 'Underground' : maxPopularity < 70 ? 'Known tracks' : 'Popular'}&nbsp;
                        <span style={{ color: s.textDimmer }}>/ max popularity {maxPopularity}</span>
                      </div>
                    </div>
                    <div style={{ position: 'relative', height: '4px', background: s.border, cursor: 'pointer' }}
                      onClick={e => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setMaxPopularity(Math.round(((e.clientX - rect.left) / rect.width) * 100))
                      }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, height: '4px', width: `${maxPopularity}%`, background: maxPopularity < 25 ? '#9a6a5a' : maxPopularity < 50 ? s.gold : '#3d6b4a', transition: 'width 0.15s' }} />
                      <div style={{ position: 'absolute', top: '50%', left: `${maxPopularity}%`, transform: 'translate(-50%, -50%)', width: '14px', height: '14px', background: s.panel, border: `2px solid ${maxPopularity < 25 ? '#9a6a5a' : maxPopularity < 50 ? s.gold : '#3d6b4a'}`, borderRadius: '50%', cursor: 'grab' }} />
                    </div>
                    <input type="range" min={5} max={100} value={maxPopularity}
                      onChange={e => setMaxPopularity(Number(e.target.value))}
                      style={{ position: 'absolute', opacity: 0, width: '1px', height: '1px', pointerEvents: 'none' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '10px', color: s.textDimmer }}>
                      <span>Rare</span><span>Underground</span><span>Known</span><span>Popular</span>
                    </div>
                  </div>

                  {/* RA-only filter toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <button onClick={() => setRaOnlyFilter(f => !f)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <div style={{ width: '32px', height: '18px', borderRadius: '9px', background: raOnlyFilter ? 'rgba(220,38,38,0.3)' : s.border, border: `1px solid ${raOnlyFilter ? '#dc2626' : s.borderBright}`, position: 'relative', transition: 'all 0.2s' }}>
                        <div style={{ position: 'absolute', top: '2px', left: raOnlyFilter ? '14px' : '2px', width: '12px', height: '12px', borderRadius: '50%', background: raOnlyFilter ? '#dc2626' : s.textDimmer, transition: 'left 0.2s' }} />
                      </div>
                      <span style={{ fontSize: '10px', letterSpacing: '0.15em', color: raOnlyFilter ? '#dc2626' : s.textDimmer, fontFamily: s.font, textTransform: 'uppercase' }}>RA charted only</span>
                    </button>
                    {raOnlyFilter && raChartedCount > 0 && (
                      <span style={{ fontSize: '10px', color: s.textDimmer }}>— {raChartedCount} tracks from last search</span>
                    )}
                  </div>

                  <button onClick={() => discoverTracks(maxPopularity)} disabled={discoverLoading}
                    style={{ ...btn(s.setlab), justifyContent: 'center', width: '100%', fontSize: '11px', padding: '13px' }}>
                    {discoverLoading ? <><ScanPulse size="sm" color={s.setlab} /> Finding rare gems...</> : 'Find rare gems →'}
                  </button>

                  {discoverCallCount >= 8 && (
                    <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(154,106,90,0.1)', border: '1px solid rgba(154,106,90,0.3)', fontSize: '10px', color: '#9a6a5a' }}>
                      {discoverCallCount} searches this session — go easy to keep results fresh
                    </div>
                  )}
                  {discoverError && (
                    <div style={{ marginTop: '12px', fontSize: '11px', color: '#9a6a5a', padding: '10px 14px', background: 'rgba(154,106,90,0.1)', border: '1px solid rgba(154,106,90,0.3)' }}>
                      {discoverError}
                    </div>
                  )}
                </div>

                {/* Beatport results grid */}
                {discoverResults.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: `1px solid ${s.border}` }}>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase' }}>
                        {raOnlyFilter
                          ? `${discoverResults.filter((t: any) => t.ra_charted).length} RA charted tracks`
                          : `${discoverResults.length} matches${raChartedCount > 0 ? ` — ${raChartedCount} RA charted` : ''} — sorted rarest first`}
                      </div>
                      {discoverMeta && (
                        <div style={{ fontSize: '10px', color: s.textDimmer }}>
                          Compatible with {discoverMeta.targetCamelot} · ~{discoverMeta.targetBpm} BPM
                        </div>
                      )}
                    </div>
                    {discoverResults.filter((t: any) => !raOnlyFilter || t.ra_charted).map((track: any) => {
                      const popLabel = track.popularity < 20 ? 'Rare' : track.popularity < 40 ? 'Underground' : track.popularity < 65 ? 'Known' : 'Popular'
                      const popColor = track.popularity < 20 ? '#9a6a5a' : track.popularity < 40 ? s.gold : track.popularity < 65 ? '#3d6b4a' : s.textDimmer
                      const alreadyInLib = library.some(t => t.title.toLowerCase() === track.title.toLowerCase() && t.artist.toLowerCase() === track.artist.toLowerCase())
                      return (
                        <div key={track.id} style={{ background: s.panel, border: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 18px', transition: 'border-color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = s.borderBright)}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = s.border)}>
                          {track.album_art
                            ? <img src={track.album_art} alt="" style={{ width: '52px', height: '52px', objectFit: 'cover', flexShrink: 0 }} />
                            : <div style={{ width: '52px', height: '52px', background: s.bg, border: `1px solid ${s.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: s.textDimmer }}>&#9835;</div>}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', color: s.text, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
                            <div style={{ fontSize: '11px', color: s.textDim, marginTop: '2px' }}>{track.artist}</div>
                            {track.reason && <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '3px' }}>{track.reason}</div>}
                            {track.release_year && <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '2px' }}>{track.album} · {track.release_year}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                            <div style={{ fontSize: '10px', padding: '3px 8px', background: `${popColor}20`, border: `1px solid ${popColor}50`, color: popColor, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{popLabel}</div>
                            {track.ra_charted && (
                              <div title={track.ra_charted_by ? `Charted by ${track.ra_charted_by}` : 'RA charted'} style={{
                                fontSize: '9px', padding: '3px 7px', background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.35)', color: '#dc2626',
                                letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, cursor: 'default', display: 'flex', alignItems: 'center', gap: '4px',
                              }}>
                                RA
                                {track.ra_charted_by && <span style={{ fontWeight: 400, letterSpacing: '0.08em', color: 'rgba(220,38,38,0.8)', fontSize: '8px' }}>{track.ra_charted_by.split(' ')[0]}</span>}
                              </div>
                            )}
                            {track.camelot && <div style={{ fontSize: '11px', color: s.gold, minWidth: '32px', textAlign: 'center' }}>{track.camelot}</div>}
                            {track.bpm && <div style={{ fontSize: '11px', color: s.textDim, minWidth: '36px', textAlign: 'center' }}>{track.bpm}</div>}
                            {track.label && <div style={{ fontSize: '9px', color: s.textDimmer, letterSpacing: '0.08em', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.label}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                            {track.beatport_url && (
                              <a href={track.beatport_url} target="_blank" rel="noreferrer"
                                style={{ fontSize: '10px', color: s.setlab, textDecoration: 'none', letterSpacing: '0.1em', border: `1px solid ${s.setlab}40`, padding: '5px 10px', whiteSpace: 'nowrap' }}>
                                Beatport ↗
                              </a>
                            )}
                          </div>
                          <button onClick={async () => {
                            const t: Track = { id: alreadyInLib ? library.find(l => l.title.toLowerCase() === track.title.toLowerCase() && l.artist.toLowerCase() === track.artist.toLowerCase())!.id : track.id, title: track.title, artist: track.artist, bpm: track.bpm, key: '', camelot: track.camelot, energy: track.energy || 0,
                              genre: '', duration: '', notes: '', analysed: false, moment_type: '', position_score: '', mix_in: '', mix_out: '', crowd_reaction: '', similar_to: '', producer_style: '' }
                            if (!alreadyInLib) {
                              await fetch('/api/tracks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tracks: [t] }) })
                              setLibrary(prev => [...prev, t])
                            }
                            addToSet(t)
                          }} style={{ ...btn(s.setlab, 'transparent'), fontSize: '10px', padding: '6px 12px', flexShrink: 0 }}>
                            Add →
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                {!discoverLoading && discoverResults.length === 0 && !discoverError && (
                  <div style={{ textAlign: 'center', padding: '60px 32px', color: s.textDimmer }}>
                    <div style={{ fontSize: '32px', marginBottom: '16px', opacity: 0.3 }}>&#9678;</div>
                    <div style={{ fontSize: '12px', letterSpacing: '0.15em', marginBottom: '8px' }}>Set the underground depth and search</div>
                    <div style={{ fontSize: '11px', color: s.textDimmer }}>Uses your library as seeds · Camelot-compatible only · Sorted rarest first</div>
                  </div>
                )}
              </>
            )}

            {/* ── CRATE DIG MODE ── */}
            {discoverMode === 'crate' && (
              <>
                <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px 28px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div>
                      <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '13px', fontWeight: 300, letterSpacing: '0.2em', color: s.setlab, marginBottom: '6px' }}>CRATE DIG</div>
                      <div style={{ fontSize: '11px', color: s.textDimmer, letterSpacing: '0.05em', lineHeight: '1.6' }}>
                        Pick a track from your library and dig through Discogs — by label, artist, style, or credits.
                      </div>
                    </div>
                    <div style={{ fontSize: '10px', color: s.textDimmer, textAlign: 'right', lineHeight: '1.7' }}>
                      <div>Discogs catalogue</div>
                      <div>Want/have ranked</div>
                      <div>Library deduped</div>
                    </div>
                  </div>

                  {/* Track selector */}
                  <div style={{ marginBottom: '20px', position: 'relative' }}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.textDimmer, marginBottom: '8px' }}>
                      Dig from track
                    </div>
                    {crateDigTrack ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: s.bg, border: `1px solid ${s.setlab}40` }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', color: s.text }}>{crateDigTrack.title}</div>
                          <div style={{ fontSize: '11px', color: s.textDim, marginTop: '2px' }}>{crateDigTrack.artist}</div>
                        </div>
                        <button onClick={() => { setCrateDigTrack(null); setCrateDigResults([]); setCrateDigMeta(null); setCrateDigError('') }}
                          style={{ ...btn(s.textDim, 'transparent'), fontSize: '10px', padding: '4px 10px' }}>Change</button>
                      </div>
                    ) : (
                      <div>
                        <input value={crateTrackSearch} onChange={e => { setCrateTrackSearch(e.target.value); setCrateTrackDropdown(true) }}
                          onFocus={() => setCrateTrackDropdown(true)}
                          placeholder="Search your library..."
                          style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }} />
                        {crateTrackDropdown && (
                          <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 10, background: s.panel, border: `1px solid ${s.border}`, maxHeight: '240px', overflowY: 'auto' }}>
                            {getDiscoverSeeds()
                              .filter(t => !crateTrackSearch || `${t.title} ${t.artist}`.toLowerCase().includes(crateTrackSearch.toLowerCase()))
                              .slice(0, 15)
                              .map(t => (
                                <div key={t.id} onClick={() => { setCrateDigTrack(t); setCrateTrackDropdown(false); setCrateTrackSearch(''); setCrateDigResults([]); setCrateDigMeta(null); setCrateDigError('') }}
                                  style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: `1px solid ${s.border}`, transition: 'background 0.1s' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = s.bg)}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                  <div style={{ fontSize: '12px', color: s.text }}>{t.title}</div>
                                  <div style={{ fontSize: '10px', color: s.textDim, marginTop: '1px' }}>{t.artist}</div>
                                </div>
                              ))}
                            {getDiscoverSeeds().filter(t => !crateTrackSearch || `${t.title} ${t.artist}`.toLowerCase().includes(crateTrackSearch.toLowerCase())).length === 0 && (
                              <div style={{ padding: '12px 14px', fontSize: '11px', color: s.textDimmer }}>No tracks match</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Dig axis pills */}
                  {crateDigTrack && (
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.textDimmer, marginBottom: '8px' }}>
                        Discovery axis
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {([
                          { key: 'label' as const, label: 'Label' },
                          { key: 'artist' as const, label: 'Artist' },
                          { key: 'style' as const, label: 'Style' },
                          { key: 'credit' as const, label: 'Credits' },
                        ]).map(ax => (
                          <button key={ax.key} onClick={() => setCrateDigAxis(ax.key)}
                            style={{
                              fontFamily: s.font, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase',
                              padding: '8px 18px', cursor: 'pointer',
                              background: crateDigAxis === ax.key ? `${s.setlab}20` : 'transparent',
                              border: `1px solid ${crateDigAxis === ax.key ? s.setlab : s.border}`,
                              color: crateDigAxis === ax.key ? s.setlab : s.textDimmer,
                              transition: 'all 0.15s',
                            }}>
                            {ax.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dig button */}
                  {crateDigTrack && (
                    <button onClick={() => crateDigFrom(crateDigTrack, crateDigAxis)} disabled={crateDigLoading}
                      style={{ ...btn(s.setlab), justifyContent: 'center', width: '100%', fontSize: '11px', padding: '13px' }}>
                      {crateDigLoading ? <><ScanPulse size="sm" color={s.setlab} /> Digging...</> : 'Dig deeper →'}
                    </button>
                  )}

                  {!crateDigTrack && library.length === 0 && (
                    <div style={{ padding: '16px', fontSize: '11px', color: s.textDimmer, textAlign: 'center' }}>
                      Add tracks to your library first to start crate digging.
                    </div>
                  )}

                  {crateDigError && (
                    <div style={{ marginTop: '12px', fontSize: '11px', color: '#9a6a5a', padding: '10px 14px', background: 'rgba(154,106,90,0.1)', border: '1px solid rgba(154,106,90,0.3)' }}>
                      {crateDigError}
                    </div>
                  )}
                </div>

                {/* Crate Dig results */}
                {crateDigResults.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Context header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: `1px solid ${s.border}` }}>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase' }}>
                        {crateDigAxis === 'label' && crateDigMeta?.label_name && `Other releases on ${crateDigMeta.label_name}`}
                        {crateDigAxis === 'artist' && crateDigMeta?.artist_name && `${crateDigMeta.artist_name}'s releases`}
                        {crateDigAxis === 'style' && crateDigMeta?.style && `${crateDigMeta.style} · ${crateDigMeta.year_range}`}
                        {crateDigAxis === 'credit' && crateDigMeta?.release_title && `Credits from ${crateDigMeta.release_title}`}
                      </div>
                      <div style={{ fontSize: '10px', color: s.textDimmer }}>
                        {crateDigResults.length} releases — sorted by demand
                      </div>
                    </div>

                    {crateDigResults.map((release: any, idx: number) => {
                      const alreadyInLib = library.some(t => t.title.toLowerCase() === (release.title || '').toLowerCase() && t.artist.toLowerCase() === (release.artist || '').toLowerCase())
                      const alreadyInWantlist = wantlist.some(w => w.discogs_release_id === String(release.id))
                      const wantHaveLabel = release.want_have_ratio > 2 ? 'High demand' : release.want_have_ratio > 0.5 ? 'Sought after' : ''
                      const wantHaveColor = release.want_have_ratio > 2 ? s.gold : release.want_have_ratio > 0.5 ? s.textDim : s.textDimmer
                      const axisLabel = crateDigAxis === 'label' ? 'Same label' : crateDigAxis === 'artist' ? (release.role === 'Main' ? 'Main' : release.role || 'Release') : crateDigAxis === 'style' ? 'Same style' : (release.credit_name || 'Credits')

                      return (
                        <div key={`${release.id}-${idx}`} style={{ background: s.panel, border: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 18px', transition: 'border-color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = s.borderBright)}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = s.border)}>

                          {/* Thumbnail */}
                          {release.thumb
                            ? <img src={release.thumb} alt="" style={{ width: '52px', height: '52px', objectFit: 'cover', flexShrink: 0 }} />
                            : <div style={{ width: '52px', height: '52px', background: s.bg, border: `1px solid ${s.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: s.textDimmer }}>&#9835;</div>}

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', color: s.text, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{release.title}</div>
                            <div style={{ fontSize: '11px', color: s.textDim, marginTop: '2px' }}>{release.artist}</div>
                            {release.label_name && <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '2px' }}>{release.label_name}{release.year ? ` · ${release.year}` : ''}</div>}
                          </div>

                          {/* Tags */}
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                            <div style={{ fontSize: '9px', padding: '3px 7px', background: `${s.setlab}15`, border: `1px solid ${s.setlab}40`, color: s.setlab, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{axisLabel}</div>
                            {wantHaveLabel && (
                              <div style={{ fontSize: '9px', padding: '3px 7px', background: `${wantHaveColor}15`, border: `1px solid ${wantHaveColor}40`, color: wantHaveColor, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{wantHaveLabel}</div>
                            )}
                            {release.year && <div style={{ fontSize: '11px', color: s.textDimmer, minWidth: '36px', textAlign: 'center' }}>{release.year}</div>}
                          </div>

                          {/* Links + Actions */}
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                            {release.discogs_url && (
                              <a href={release.discogs_url} target="_blank" rel="noreferrer"
                                style={{ fontSize: '10px', color: s.setlab, textDecoration: 'none', letterSpacing: '0.1em', border: `1px solid ${s.setlab}40`, padding: '5px 10px', whiteSpace: 'nowrap' }}>
                                Discogs ↗
                              </a>
                            )}
                            <button onClick={async () => {
                              const t: Track = { id: alreadyInLib ? library.find(l => l.title.toLowerCase() === (release.title || '').toLowerCase() && l.artist.toLowerCase() === (release.artist || '').toLowerCase())?.id || `discogs-${release.id}` : `discogs-${release.id}`, title: release.title, artist: release.artist, bpm: 0, key: '', camelot: '', energy: 0,
                                genre: '', duration: '', notes: '', analysed: false, moment_type: '', position_score: '', mix_in: '', mix_out: '', crowd_reaction: '', similar_to: '', producer_style: '' }
                              if (!alreadyInLib) {
                                await fetch('/api/tracks', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ tracks: [{ ...t, source: 'discogs', discovered_via: { discogs_release_id: release.id, dig_type: crateDigAxis, source_track_id: crateDigTrack?.id } }] }) })
                                setLibrary(prev => [...prev, t])
                              }
                              addToSet(t)
                            }} style={{ ...btn(s.setlab, 'transparent'), fontSize: '10px', padding: '6px 10px', flexShrink: 0 }}>
                              Add →
                            </button>
                            <button disabled={alreadyInWantlist} onClick={() => {
                              if (alreadyInWantlist) return
                              addToWantlist(release, crateDigAxis, crateDigTrack?.id || '')
                            }} style={{ ...btn(alreadyInWantlist ? s.textDimmer : s.gold, 'transparent'), fontSize: '10px', padding: '6px 10px', flexShrink: 0,
                              opacity: alreadyInWantlist ? 0.4 : 1, cursor: alreadyInWantlist ? 'default' : 'pointer' }}>
                              {alreadyInWantlist ? '✓ Want' : '+ Want'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Crate Dig empty state */}
                {!crateDigLoading && crateDigResults.length === 0 && !crateDigError && crateDigTrack && (
                  <div style={{ textAlign: 'center', padding: '60px 32px', color: s.textDimmer }}>
                    <div style={{ fontSize: '32px', marginBottom: '16px', opacity: 0.3 }}>&#9678;</div>
                    <div style={{ fontSize: '12px', letterSpacing: '0.15em', marginBottom: '8px' }}>Pick an axis and dig</div>
                    <div style={{ fontSize: '11px', color: s.textDimmer }}>Explore by label, artist, style, or production credits</div>
                  </div>
                )}
                {!crateDigLoading && !crateDigTrack && library.length > 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 32px', color: s.textDimmer }}>
                    <div style={{ fontSize: '32px', marginBottom: '16px', opacity: 0.3 }}>&#9678;</div>
                    <div style={{ fontSize: '12px', letterSpacing: '0.15em', marginBottom: '8px' }}>Select a track to dig from</div>
                    <div style={{ fontSize: '11px', color: s.textDimmer }}>Search your library above to start crate digging</div>
                  </div>
                )}
              </>
            )}

          </div>
        )}

        {/* ═══ MIX SCANNER TAB ═══ */}
        {activeTab === 'scanner' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '860px' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '13px', fontWeight: 300, letterSpacing: '0.25em', color: s.setlab, marginBottom: '6px' }}>MIX SCANNER</div>
                <div style={{ fontSize: '11px', color: s.textDimmer, letterSpacing: '0.05em', lineHeight: '1.6' }}>
                  Upload a screenshot of your tracklist · Track-by-track feedback, curation analysis · Rated out of 10
                </div>
              </div>
              {scanResult && (
                <button onClick={() => { setScanResult(null); setScanError(''); setScanPhase('upload'); setDetectedTracks([]); setScannerTracklist(''); clearScannerState() }}
                  style={{ ...btn(s.textDim, 'transparent'), fontSize: '10px', padding: '8px 14px' }}>
                  Scan another mix
                </button>
              )}
            </div>

            {/* Screenshot import — primary upload zone */}
            {!scanResult && scanPhase === 'upload' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Screenshot drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setScreenshotDragging(true) }}
                  onDragLeave={() => setScreenshotDragging(false)}
                  onDrop={async e => {
                    e.preventDefault()
                    setScreenshotDragging(false)
                    const file = e.dataTransfer.files[0]
                    if (!file || !file.type.startsWith('image/')) return
                    await parseTracklistScreenshot(file)
                  }}
                  style={{
                    border: `2px dashed ${screenshotDragging ? s.setlab : s.border}`,
                    background: screenshotDragging ? 'rgba(154,106,90,0.06)' : s.panel,
                    padding: '64px 32px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onClick={() => {
                    const inp = document.createElement('input')
                    inp.type = 'file'; inp.accept = 'image/*'
                    inp.onchange = async (ev) => {
                      const f = (ev.target as HTMLInputElement).files?.[0]
                      if (f) await parseTracklistScreenshot(f)
                    }
                    inp.click()
                  }}
                >
                  {parsingScreenshot ? (
                    <span style={{ fontSize: '11px', color: s.setlab, letterSpacing: '0.1em' }}>READING SCREENSHOT...</span>
                  ) : (
                    <>
                      <div style={{ fontSize: '28px', marginBottom: '16px', opacity: 0.3 }}>◎</div>
                      <div style={{ fontSize: '12px', letterSpacing: '0.18em', color: s.text, textTransform: 'uppercase', marginBottom: '8px' }}>
                        Drop tracklist screenshot or click to browse
                      </div>
                      <div style={{ fontSize: '10px', color: s.textDimmer }}>
                        Traktor history · Rekordbox · CDJ screen · Any tracklist image
                      </div>
                    </>
                  )}
                </div>

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ flex: 1, height: '1px', background: s.border }} />
                  <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.textDimmer, textTransform: 'uppercase' }}>Or paste manually</div>
                  <div style={{ flex: 1, height: '1px', background: s.border }} />
                </div>

                {/* Manual paste section */}
                <div>
                  <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>
                    Set context <span style={{ opacity: 0.5 }}>(optional)</span>
                  </div>
                  <input
                    value={scannerContext}
                    onChange={e => setScannerContext(e.target.value)}
                    placeholder="e.g. 2hr techno set, club warm-up, festival peak time..."
                    style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.gold, textTransform: 'uppercase' }}>
                      Tracklist
                    </div>
                    <button
                      onClick={() => tracklistImgRef.current?.click()}
                      disabled={tracklistImgParsing}
                      style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: s.setlab, background: 'transparent', border: `1px solid ${s.setlab}50`, padding: '4px 10px', cursor: tracklistImgParsing ? 'wait' : 'pointer', fontFamily: s.font, opacity: tracklistImgParsing ? 0.5 : 1 }}
                    >
                      {tracklistImgParsing ? 'Reading...' : '↑ Screenshot'}
                    </button>
                    <input ref={tracklistImgRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) parseTracklistImage(f) }} style={{ display: 'none' }} />
                  </div>
                  <textarea
                    value={scannerTracklist}
                    onChange={e => setScannerTracklist(e.target.value)}
                    placeholder={'1. Artist - Title\n2. Artist - Title\n3. Artist - Title\n...'}
                    rows={6}
                    style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '10px 14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.6' }}
                  />
                </div>

                {/* Analyse button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    onClick={() => {
                      // Parse the pasted tracklist into detectedTracks for review
                      const lines = scannerTracklist.trim().split('\n').filter(l => l.trim().length > 3)
                      if (lines.length === 0) return
                      const parsed = lines.map((line, i) => {
                        const cleaned = line.replace(/^\d+[\.\)\-\s]+/, '').trim()
                        const parts = cleaned.split(/\s*[-–—]\s*/)
                        const artist = parts.length > 1 ? parts[0].trim() : ''
                        const title = parts.length > 1 ? parts.slice(1).join(' — ').trim() : cleaned
                        return {
                          time_in: `${String(i).padStart(2, '0')}:00`,
                          title,
                          artist,
                          confidence: 1,
                          found: true,
                          source: 'manual',
                        }
                      })
                      setDetectedTracks(parsed)
                      setScanPhase('review')
                      fetchRaForScanner(parsed)
                    }}
                    disabled={scanning || !scannerTracklist.trim()}
                    style={{
                      ...btn(s.setlab),
                      fontSize: '11px', padding: '14px 32px',
                      opacity: (scanning || !scannerTracklist.trim()) ? 0.5 : 1,
                      cursor: (scanning || !scannerTracklist.trim()) ? 'default' : 'pointer',
                    }}>
                    Review tracklist →
                  </button>
                </div>

                {scanError && (
                  <div style={{ background: 'rgba(192,64,64,0.1)', border: '1px solid rgba(192,64,64,0.3)', padding: '14px 18px', fontSize: '12px', color: '#c04040' }}>
                    {scanError}
                  </div>
                )}
              </div>
            )}

            {/* Scanning progress — shown during analysing phase */}
            {scanPhase === 'analysing' && (
              <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '48px 32px', textAlign: 'center' }}>

                {/* Animated pulse emblem */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                  <ScanPulse size="lg" />
                </div>

                <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.setlab, textTransform: 'uppercase', marginBottom: '12px' }}>
                  Generating analysis
                </div>
                <div style={{ fontSize: '12px', color: s.textDim, marginBottom: '4px' }}>
                  Reading your tracklist and building feedback...
                </div>
                <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '6px', letterSpacing: '0.08em' }}>
                  This takes 15-30 seconds
                </div>

              </div>
            )}

            {/* ── Review phase: detected tracklist ── */}
            {scanPhase === 'review' && !scanResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Detected tracks list */}
                <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '4px' }}>
                        Detected tracklist — {detectedTracks.filter(t => t.found).length} of {detectedTracks.length} identified
                      </div>
                      <div style={{ fontSize: '10px', color: s.textDimmer }}>
                        {detectedTracks.filter(t => !t.found).length > 0
                          ? 'Unknown tracks are likely white labels or unreleased — edit any corrections below'
                          : 'Review and correct any track IDs before analysis'}
                      </div>
                    </div>
                    <button onClick={() => { setScanPhase('upload'); setDetectedTracks([]); setScannerTracklist(''); clearScannerState() }}
                      style={{ ...btn(s.textDim, 'transparent'), fontSize: '10px', padding: '6px 12px' }}>
                      Start over
                    </button>
                  </div>

                  {/* RA summary banner */}
                  {scannerRaMap.size > 0 && (
                    <div style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <div style={{ fontSize: '9px', letterSpacing: '0.12em', padding: '2px 6px', background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', textTransform: 'uppercase', fontWeight: 600, flexShrink: 0 }}>RA</div>
                      <div style={{ fontSize: '11px', color: s.text }}>
                        {scannerRaMap.size} track{scannerRaMap.size !== 1 ? 's' : ''} charted on Resident Advisor
                        <span style={{ color: s.textDimmer }}> — {[...new Set([...scannerRaMap.values()].map(v => v.charted_by))].slice(0, 3).join(', ')}{[...new Set([...scannerRaMap.values()].map(v => v.charted_by))].length > 3 ? ' + more' : ''}</span>
                      </div>
                    </div>
                  )}
                  {scannerRaLoading && (
                    <div style={{ fontSize: '10px', color: s.textDimmer, marginBottom: '8px', letterSpacing: '0.1em' }}>Checking RA charts…</div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '400px', overflowY: 'auto' }}>
                    {detectedTracks.map((t, i) => {
                      const raInfo = t.found ? getTrackRaInfo(t.artist, t.title) : null
                      return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: s.black, border: `1px solid ${raInfo ? 'rgba(220,38,38,0.2)' : t.found ? 'rgba(78,203,113,0.15)' : s.border}` }}>
                        <div style={{ fontSize: '10px', color: s.textDimmer, width: '20px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</div>
                        <input
                          value={t.artist}
                          onChange={e => {
                            const updated = [...detectedTracks]
                            updated[i] = { ...updated[i], artist: e.target.value, found: true }
                            setDetectedTracks(updated)
                          }}
                          placeholder="Artist"
                          style={{ width: '140px', background: 'transparent', border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '5px 8px', outline: 'none', flexShrink: 0 }}
                        />
                        <span style={{ color: s.textDimmer, fontSize: '11px', flexShrink: 0 }}>—</span>
                        <input
                          value={t.title}
                          onChange={e => {
                            const updated = [...detectedTracks]
                            updated[i] = { ...updated[i], title: e.target.value, found: true }
                            setDetectedTracks(updated)
                          }}
                          placeholder="Track title"
                          style={{ flex: 1, background: 'transparent', border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '5px 8px', outline: 'none', minWidth: 0 }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                          {raInfo && (
                            <div style={{ fontSize: '8px', letterSpacing: '0.1em', padding: '2px 5px', background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', textTransform: 'uppercase', fontWeight: 600 }}>RA</div>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetectedTracks(prev => prev.filter((_, idx) => idx !== i)) }}
                            style={{ background: 'none', border: 'none', color: s.textDimmer, cursor: 'pointer', fontSize: '11px', padding: '2px 4px', opacity: 0.4 }}
                            title="Remove track"
                          >×</button>
                        </div>
                      </div>
                    )})}
                  </div>

                  {/* Add track button */}
                  <button
                    onClick={() => setDetectedTracks(prev => [...prev, { time_in: `${String(prev.length).padStart(2, '0')}:00`, title: '', artist: '', confidence: 1, found: true, source: 'manual' }])}
                    style={{ fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.textDimmer, background: 'none', border: `1px dashed ${s.border}`, padding: '8px', cursor: 'pointer', fontFamily: s.font, width: '100%', marginTop: '4px' }}
                  >
                    + Add track
                  </button>
                </div>

                {/* Add more tracks from screenshot */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => tracklistImgRef.current?.click()}
                    disabled={tracklistImgParsing}
                    style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: s.setlab, background: 'transparent', border: `1px solid ${s.setlab}50`, padding: '6px 12px', cursor: tracklistImgParsing ? 'wait' : 'pointer', fontFamily: s.font, opacity: tracklistImgParsing ? 0.5 : 1 }}
                  >
                    {tracklistImgParsing ? 'Reading...' : '↑ Add from screenshot'}
                  </button>
                  <input ref={tracklistImgRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) parseTracklistImage(f) }} style={{ display: 'none' }} />
                </div>

                {/* Context + Analyse */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>
                      Set context <span style={{ opacity: 0.5 }}>(optional)</span>
                    </div>
                    <input
                      value={scannerContext}
                      onChange={e => setScannerContext(e.target.value)}
                      placeholder="e.g. 2hr techno set, club warm-up, festival peak time…"
                      style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' as const }}
                    />
                  </div>
                  <button
                    onClick={async () => {
                      const found = detectedTracks.filter(t => t.found)
                      if (found.length === 0) { showToast('No identified tracks to save', 'Error'); return }
                      let added = 0
                      for (const dt of found) {
                        const alreadyExists = library.some(l => l.title.toLowerCase() === dt.title.toLowerCase() && l.artist.toLowerCase() === dt.artist.toLowerCase())
                        if (alreadyExists) continue
                        const t: Track = {
                          id: crypto.randomUUID(),
                          title: dt.title,
                          artist: dt.artist,
                          bpm: 0,
                          key: '',
                          camelot: '',
                          energy: 5,
                          genre: 'Electronic',
                          duration: '',
                          notes: '',
                          analysed: false,
                          moment_type: '',
                          position_score: '',
                          mix_in: '',
                          mix_out: '',
                          crowd_reaction: '',
                          similar_to: '',
                          producer_style: '',
                        }
                        await fetch('/api/tracks', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ tracks: [t] }),
                        })
                        setLibrary(prev => [...prev, t])
                        added++
                      }
                      showToast(added > 0 ? `${added} track${added !== 1 ? 's' : ''} saved to library` : 'All tracks already in library', added > 0 ? 'Done' : 'Info')
                    }}
                    disabled={scanning || detectedTracks.filter(t => t.found).length === 0}
                    style={{ ...btn(s.setlab, 'transparent'), fontSize: '11px', padding: '14px 20px', flexShrink: 0, opacity: detectedTracks.filter(t => t.found).length === 0 ? 0.4 : 1 }}>
                    Save to library
                  </button>
                  <button
                    onClick={runClaudeAnalysis}
                    disabled={scanning}
                    style={{ ...btn(s.setlab), fontSize: '11px', padding: '14px 28px', flexShrink: 0 }}>
                    {scanning ? (scanProgress || 'Analysing…') : 'Analyse mix →'}
                  </button>
                </div>

                {scanError && (
                  <div style={{ background: 'rgba(192,64,64,0.1)', border: '1px solid rgba(192,64,64,0.3)', padding: '14px 18px', fontSize: '12px', color: '#c04040' }}>
                    {scanError}
                  </div>
                )}
              </div>
            )}

            {/* Results */}
            {scanResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Data quality banner */}
                {scanResult.data_quality === 'amplitude-only' && (
                  <div style={{ background: 'rgba(176,141,87,0.06)', border: `1px solid rgba(176,141,87,0.2)`, padding: '12px 16px', fontSize: '11px', color: s.textDim, lineHeight: '1.6' }}>
                    No tracklist provided — for track-by-track feedback, key mixing analysis and curation scoring, re-run with your tracklist filled in.
                  </div>
                )}

                {/* Score hero */}
                <div style={{ background: s.panel, border: `1px solid ${s.borderBright}`, padding: '32px 36px', display: 'flex', alignItems: 'center', gap: '48px' }}>
                  {/* Big score */}
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{
                      fontFamily: "'Unbounded', sans-serif",
                      fontSize: '64px', fontWeight: 300, letterSpacing: '-0.02em',
                      color: scanResult.overall_score >= 8 ? '#4ecb71' : scanResult.overall_score >= 6 ? s.gold : scanResult.overall_score >= 4 ? '#c09030' : '#c04040',
                      lineHeight: 1,
                    }}>
                      {scanResult.overall_score?.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '11px', color: s.textDimmer, letterSpacing: '0.15em', marginTop: '8px' }}>OUT OF 10</div>
                    {scanResult.grade && (
                      <div style={{ fontSize: '20px', color: s.gold, marginTop: '8px', fontFamily: "'Unbounded', sans-serif", fontWeight: 300 }}>
                        {scanResult.grade}
                      </div>
                    )}
                  </div>

                  {/* Headline + summary */}
                  <div style={{ flex: 1 }}>
                    {scanResult.headline && (
                      <div style={{ fontSize: '15px', color: s.text, lineHeight: '1.5', marginBottom: '12px' }}>
                        "{scanResult.headline}"
                      </div>
                    )}
                    {scanResult.summary && (
                      <div style={{ fontSize: '12px', color: s.textDim, lineHeight: '1.7' }}>
                        {scanResult.summary}
                      </div>
                    )}
                    {/* Quick stats row */}
                    <div style={{ display: 'flex', gap: '24px', marginTop: '16px' }}>
                      {scanResult.transition_quality && (
                        <div>
                          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '3px' }}>Transitions</div>
                          <div style={{ fontSize: '11px', color: s.setlab, textTransform: 'capitalize' }}>{scanResult.transition_quality}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Two-column: strengths + improvements */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {scanResult.strengths?.length > 0 && (
                    <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#4ecb71', textTransform: 'uppercase', marginBottom: '14px' }}>What works</div>
                      {scanResult.strengths.map((s2: string, i: number) => (
                        <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'flex-start' }}>
                          <div style={{ color: '#4ecb71', fontSize: '10px', marginTop: '2px', flexShrink: 0 }}>+</div>
                          <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.5' }}>{s2}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {scanResult.improvements?.length > 0 && (
                    <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#c09030', textTransform: 'uppercase', marginBottom: '14px' }}>Improvements</div>
                      {scanResult.improvements.map((imp: string, i: number) => (
                        <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'flex-start' }}>
                          <div style={{ color: '#c09030', fontSize: '10px', marginTop: '2px', flexShrink: 0 }}>→</div>
                          <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.5' }}>{imp}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Technical + Structure analysis */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {scanResult.structure_analysis && (
                    <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '12px' }}>Set structure</div>
                      <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.7' }}>{scanResult.structure_analysis}</div>
                    </div>
                  )}
                  {scanResult.technical_assessment && (
                    <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '12px' }}>Technical assessment</div>
                      <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.7' }}>{scanResult.technical_assessment}</div>
                    </div>
                  )}
                </div>

                {/* Energy arc */}
                {scanResult.energy_arc && (
                  <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '12px' }}>Energy arc</div>
                    <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.7' }}>{scanResult.energy_arc}</div>
                    {/* Transition notes inline */}
                    {scanResult.transition_notes && (
                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${s.border}` }}>
                        <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Transition notes</div>
                        <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.7' }}>{scanResult.transition_notes}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Track-by-track (if tracklist was provided) */}
                {scanResult.tracks?.length > 0 && (
                  <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase' }}>Track-by-track</div>
                      {scannerRaMap.size > 0 && (
                        <div style={{ fontSize: '9px', color: '#dc2626', letterSpacing: '0.1em' }}>
                          {scannerRaMap.size} RA-charted
                        </div>
                      )}
                    </div>
                    {scanResult.tracks.map((t: any, i: number) => {
                      const raInfo = t.artist && t.title ? getTrackRaInfo(t.artist, t.title) : null
                      return (
                      <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', paddingBottom: '12px', marginBottom: '12px', borderBottom: i < scanResult.tracks.length - 1 ? `1px solid ${s.border}` : 'none' }}>
                        <div style={{ fontSize: '10px', color: s.textDimmer, flexShrink: 0, paddingTop: '2px', width: '20px', textAlign: 'right' }}>{t.position}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: t.issue || raInfo ? '6px' : 0 }}>
                            <div style={{ fontSize: '12px', color: s.text }}>{t.artist} — {t.title}</div>
                            {t.estimated_time && <div style={{ fontSize: '10px', color: s.textDimmer }}>{t.estimated_time}</div>}
                            {raInfo && (
                              <div style={{ fontSize: '8px', letterSpacing: '0.1em', padding: '2px 6px', background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', textTransform: 'uppercase', fontWeight: 600 }}>
                                RA — {raInfo.charted_by}
                              </div>
                            )}
                            {t.mix_quality && (
                              <div style={{
                                fontSize: '9px', letterSpacing: '0.1em', padding: '2px 8px',
                                background: t.mix_quality === 'smooth' ? 'rgba(78,203,113,0.12)' : t.mix_quality === 'rough' ? 'rgba(192,144,48,0.12)' : 'rgba(192,64,64,0.12)',
                                color: t.mix_quality === 'smooth' ? '#4ecb71' : t.mix_quality === 'rough' ? '#c09030' : '#c04040',
                                textTransform: 'uppercase',
                              }}>{t.mix_quality}</div>
                            )}
                          </div>
                          {t.issue && <div style={{ fontSize: '10px', color: s.textDimmer, lineHeight: '1.5' }}>⚠ {t.issue}</div>}
                          {t.fix && <div style={{ fontSize: '10px', color: s.setlab, marginTop: '3px', lineHeight: '1.5' }}>→ {t.fix}</div>}
                        </div>
                      </div>
                    )})}
                  </div>
                )}

                {/* Key moments */}
                {scanResult.key_moments?.length > 0 && (
                  <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '14px' }}>Key moments</div>
                    {scanResult.key_moments.map((m: string, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'flex-start' }}>
                        <div style={{ color: s.gold, fontSize: '10px', marginTop: '2px', flexShrink: 0 }}>◎</div>
                        <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.5' }}>{m}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Final verdict */}
                {scanResult.overall_verdict && (
                  <div style={{ background: s.panel, border: `1px solid ${s.borderBright}`, padding: '24px 28px' }}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Verdict</div>
                    <div style={{ fontSize: '13px', color: s.text, lineHeight: '1.8' }}>
                      {scanResult.overall_verdict}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* ── Recent Scans ──────────────────────────────────────────── */}
            {recentScans.length > 0 && scanPhase === 'upload' && !scanResult && (
              <div style={{ marginTop: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.22em', textTransform: 'uppercase', color: s.gold, fontFamily: s.font }}>
                    Recent scans
                  </div>
                  <button
                    onClick={async () => {
                      for (const scan of recentScans) {
                        try { await fetch(`/api/mix-scans/${scan.id}`, { method: 'DELETE' }) } catch {}
                      }
                      setRecentScans([])
                      clearScannerState()
                    }}
                    style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: s.textDimmer, background: 'none', border: `1px solid ${s.border}`, padding: '4px 10px', cursor: 'pointer', fontFamily: s.font }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(192,64,64,0.4)'; e.currentTarget.style.color = '#c04040' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = s.border; e.currentTarget.style.color = s.textDimmer }}
                  >
                    Clear all
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {recentScans.slice(0, 8).map((scan: any) => (
                    <div
                      key={scan.id}
                      onClick={() => {
                        const tracks = scan.detected_tracks || []
                        setDetectedTracks(tracks)
                        setScannerTracklist(scan.tracklist || '')
                        setScannerContext(scan.context || '')
                        setCurrentScanId(scan.id)
                        scannerRaFetched.current = false
                        fetchRaForScanner(tracks) // Cross-ref with RA
                        if (scan.result) {
                          setScanResult(scan.result)
                          setScanPhase('upload')
                        } else {
                          setScanPhase('review')
                        }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', background: s.panel, border: `1px solid ${s.border}`,
                        cursor: 'pointer', transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = s.borderBright)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = s.border)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ fontSize: '11px', color: s.text }}>{scan.filename}</div>
                        <div style={{ fontSize: '9px', color: s.textDimmer }}>
                          {(scan.detected_tracks || []).filter((t: any) => t.found).length} tracks
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {scan.result?.overall_score && (
                          <div style={{
                            fontSize: '11px', fontWeight: 600,
                            color: scan.result.overall_score >= 8 ? '#4ecb71' : scan.result.overall_score >= 6 ? s.gold : '#c09030',
                          }}>
                            {scan.result.overall_score.toFixed(1)}
                          </div>
                        )}
                        {scan.status === 'analysed' && (
                          <div style={{ fontSize: '8px', letterSpacing: '0.1em', padding: '2px 6px', background: 'rgba(78,203,113,0.08)', border: '1px solid rgba(78,203,113,0.2)', color: '#4ecb71', textTransform: 'uppercase' }}>
                            Analysed
                          </div>
                        )}
                        <div style={{ fontSize: '9px', color: s.textDimmer }}>
                          {new Date(scan.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            try {
                              await fetch(`/api/mix-scans/${scan.id}`, { method: 'DELETE' })
                              setRecentScans(prev => prev.filter((s: any) => s.id !== scan.id))
                            } catch {}
                          }}
                          style={{ background: 'none', border: 'none', color: s.textDimmer, cursor: 'pointer', fontSize: '11px', padding: '2px 4px', opacity: 0.5 }}
                          title="Delete scan"
                        >
                          x
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ═══ INTELLIGENCE TAB ═══ */}
        {activeTab === 'intelligence' && (() => {
          const openers = library
            .filter(t => t.moment_type === 'opener')
            .sort((a, b) => (b.crowd_hits || 0) - (a.crowd_hits || 0))

          const crowdFavourites = [...library]
            .sort((a, b) => (b.crowd_hits || 0) - (a.crowd_hits || 0))
            .filter(t => (t.crowd_hits || 0) > 0)
            .slice(0, 10)

          const keyCounts: Record<string, number> = {}
          library.forEach(t => { if (t.camelot) keyCounts[t.camelot] = (keyCounts[t.camelot] || 0) + 1 })
          const keyDist = Object.entries(keyCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)

          const bpms = library.filter(t => t.bpm > 0).map(t => t.bpm)
          const bpmMin = bpms.length ? Math.min(...bpms) : 0
          const bpmMax = bpms.length ? Math.max(...bpms) : 0
          const bpmAvg = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : 0

          const underplayed = library.filter(t => t.energy >= 7 && (!t.crowd_hits || t.crowd_hits === 0))

          const cardStyle: React.CSSProperties = {
            background: s.panel, border: `1px solid ${s.border}`,
            padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '8px',
          }
          const labelStyle: React.CSSProperties = {
            fontSize: '9px', letterSpacing: '0.22em', textTransform: 'uppercase',
            color: s.gold, fontFamily: s.font,
          }
          const bigNumStyle: React.CSSProperties = {
            fontFamily: "'Unbounded', sans-serif", fontSize: '40px',
            fontWeight: 300, letterSpacing: '-0.02em', color: s.text, lineHeight: 1,
          }
          const descStyle: React.CSSProperties = {
            fontSize: '11px', color: s.textDimmer, lineHeight: 1.5, fontFamily: s.font,
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.22em', textTransform: 'uppercase', color: s.textDimmer, fontFamily: s.font }}>
                Computed from {library.length} track{library.length !== 1 ? 's' : ''} in your library
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>

                {/* Your Openers */}
                <div style={cardStyle}>
                  <div style={labelStyle}>Your Openers</div>
                  <div style={bigNumStyle}>{openers.length}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minHeight: '48px' }}>
                    {openers.slice(0, 4).map(t => (
                      <div key={t.id} style={{ fontSize: '11px', color: s.textDim, fontFamily: s.font, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.artist} — {t.title}</span>
                        {(t.crowd_hits || 0) > 0 && <span style={{ color: s.gold, marginLeft: '8px', flexShrink: 0 }}>{t.crowd_hits}×</span>}
                      </div>
                    ))}
                    {openers.length === 0 && <div style={descStyle}>No opener-tagged tracks yet</div>}
                  </div>
                  <div style={descStyle}>Tracks tagged as openers, ranked by crowd hits</div>
                </div>

                {/* Crowd Favourites */}
                <div style={cardStyle}>
                  <div style={labelStyle}>Crowd Favourites</div>
                  <div style={bigNumStyle}>{crowdFavourites.length}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minHeight: '48px' }}>
                    {crowdFavourites.slice(0, 4).map(t => (
                      <div key={t.id} style={{ fontSize: '11px', color: s.textDim, fontFamily: s.font, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.artist} — {t.title}</span>
                        <span style={{ color: s.gold, marginLeft: '8px', flexShrink: 0 }}>{t.crowd_hits}×</span>
                      </div>
                    ))}
                    {crowdFavourites.length === 0 && <div style={descStyle}>No gig debriefs logged yet</div>}
                  </div>
                  <div style={descStyle}>Top 10 tracks by crowd hit count across all gigs</div>
                </div>

                {/* BPM Range */}
                <div style={cardStyle}>
                  <div style={labelStyle}>BPM Range</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <div style={bigNumStyle}>{bpmMin || '—'}</div>
                    {bpmMin > 0 && <div style={{ fontSize: '20px', color: s.textDimmer, fontFamily: "'Unbounded', sans-serif", fontWeight: 300 }}>– {bpmMax}</div>}
                  </div>
                  {bpmAvg > 0 && <div style={{ fontSize: '12px', color: s.gold, fontFamily: s.font }}>avg {bpmAvg} BPM</div>}
                  <div style={descStyle}>Min / max / average BPM across your library</div>
                </div>

                {/* Keys You Gravitate Toward — spans 2 cols */}
                <div style={{ ...cardStyle, gridColumn: 'span 2' }}>
                  <div style={labelStyle}>Keys You Gravitate Toward</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '48px', alignItems: 'flex-start', paddingTop: '4px' }}>
                    {keyDist.map(([key, count]) => {
                      const maxCount = keyDist[0]?.[1] || 1
                      const intensity = Math.min(0.05 + (count / maxCount) * 0.25, 0.3)
                      return (
                        <div key={key} style={{
                          background: `rgba(176,141,87,${intensity})`,
                          border: `1px solid rgba(176,141,87,${Math.min(intensity * 2.5, 0.7)})`,
                          padding: '6px 14px', display: 'flex', alignItems: 'baseline', gap: '6px',
                        }}>
                          <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '13px', fontWeight: 300, color: s.gold }}>{key}</span>
                          <span style={{ fontSize: '11px', color: s.textDim, fontFamily: s.font }}>{count}</span>
                        </div>
                      )
                    })}
                    {keyDist.length === 0 && <div style={descStyle}>Analyse your tracks to see key distribution</div>}
                  </div>
                  <div style={descStyle}>Camelot key distribution — size reflects track count</div>
                </div>

                {/* Underplayed Gems */}
                <div style={cardStyle}>
                  <div style={labelStyle}>Underplayed Gems</div>
                  <div style={bigNumStyle}>{underplayed.length}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minHeight: '48px' }}>
                    {underplayed.slice(0, 3).map(t => (
                      <div key={t.id} style={{ fontSize: '11px', color: s.textDim, fontFamily: s.font, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.artist} — {t.title}</span>
                        <span style={{ color: s.textDimmer, marginLeft: '8px', flexShrink: 0 }}>e{t.energy}</span>
                      </div>
                    ))}
                    {underplayed.length === 0 && <div style={descStyle}>Everything's been tested — nice</div>}
                  </div>
                  <div style={descStyle}>High energy (7+) tracks never tested on a crowd</div>
                </div>

              </div>

              {/* Energy Arc bar chart */}
              {library.length >= 3 && (() => {
                const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null
                const arc = [
                  { label: 'Opener', value: avg(library.filter(t => t.moment_type === 'opener' || t.position_score === 'warm-up').map(t => t.energy)) },
                  { label: 'Build',  value: avg(library.filter(t => t.moment_type === 'builder' || t.position_score === 'build').map(t => t.energy)) },
                  { label: 'Peak',   value: avg(library.filter(t => t.moment_type === 'peak' || t.position_score === 'peak').map(t => t.energy)) },
                  { label: 'Close',  value: avg(library.filter(t => t.moment_type === 'closer' || t.position_score === 'cool-down').map(t => t.energy)) },
                ].filter(a => a.value !== null) as { label: string; value: number }[]

                if (arc.length < 2) return null
                return (
                  <div style={cardStyle}>
                    <div style={labelStyle}>Your Energy Arc</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '80px', marginTop: '8px' }}>
                      {arc.map(({ label, value }) => (
                        <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                          <div style={{ fontSize: '10px', color: s.gold, fontFamily: s.font }}>{value}</div>
                          <div style={{ width: '100%', background: 'rgba(176,141,87,0.75)', height: `${(value / 10) * 60}px`, minHeight: '4px' }} />
                          <div style={{ fontSize: '9px', color: s.textDimmer, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: s.font }}>{label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={descStyle}>Average energy by moment type across your library</div>
                  </div>
                )
              })()}

            </div>
          )
        })()}

      </div>

      {/* ── Edit Track Modal ── */}
      {editingTrack && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={() => setEditingTrack(null)}>
          <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '32px', width: '420px', maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '16px' }}>Edit track</div>
            <div style={{ fontSize: '14px', color: s.text, marginBottom: '20px' }}>{editingTrack.artist} — {editingTrack.title}</div>
            {[
              { label: 'BPM', key: 'bpm', type: 'number' },
              { label: 'Key', key: 'key', type: 'text' },
              { label: 'Camelot', key: 'camelot', type: 'text' },
              { label: 'Energy (1–10)', key: 'energy', type: 'number' },
              { label: 'Notes', key: 'notes', type: 'text' },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '6px' }}>{field.label}</div>
                <input
                  type={field.type}
                  value={(editingTrack as any)[field.key] || ''}
                  onChange={e => setEditingTrack(prev => prev ? { ...prev, [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value } : null)}
                  style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '8px 12px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => saveTrackEdit(editingTrack)} style={{ ...btn(s.setlab), flex: 1, fontSize: '10px', padding: '10px' }}>Save</button>
              <button onClick={() => setEditingTrack(null)} style={{ ...btn(s.textDim, 'transparent'), fontSize: '10px', padding: '10px 16px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── SPOTIFY MINI-PLAYER ── */}
      {playingTrack && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          background: s.black, borderTop: `1px solid ${s.border}`,
          display: 'flex', alignItems: 'center', height: '80px',
        }}>
          <iframe
            src={playingTrack.spotify_url}
            width="100%"
            height="80"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            style={{ border: 'none' }}
          />
          <button onClick={() => setPlayingTrack(null)} style={{
            position: 'absolute', top: '8px', right: '12px', background: 'rgba(0,0,0,0.7)',
            border: 'none', color: s.textDim, fontSize: '16px', cursor: 'pointer', padding: '4px 8px', zIndex: 101,
          }}>✕</button>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: playingTrack ? '90px' : '90px', right: '28px', background: 'rgba(20,16,8,0.96)', border: `1px solid ${s.border}`, padding: '14px 20px', fontSize: '12px', letterSpacing: '0.07em', color: s.text, zIndex: 50, maxWidth: '300px', lineHeight: '1.55', backdropFilter: 'blur(12px)' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: s.setlab, marginBottom: '4px' }}>{toast.tag}</div>
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } select option { background: #1a1208; }`}</style>
    </div>
  )
}
