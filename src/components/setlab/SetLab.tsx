'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { analyseAudioFile, type AudioAnalysisResult } from '@/lib/audioAnalysis'

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

// ── WAV snippet encoder — for ACRCloud fingerprinting ─────────────────────
// ACRCloud recommends 8000 Hz mono 16-bit PCM for best recognition
const ACR_SAMPLE_RATE = 8000

function encodeWAVSnippet(mono: Float32Array, sampleRate: number, startSample: number, numSamples: number): Blob {
  const srcCount = Math.min(numSamples, Math.max(0, mono.length - startSample))
  if (srcCount === 0) return new Blob([], { type: 'audio/wav' })

  // Downsample to ACR_SAMPLE_RATE using simple linear interpolation
  const ratio      = sampleRate / ACR_SAMPLE_RATE
  const outCount   = Math.floor(srcCount / ratio)
  const resampled  = new Float32Array(outCount)
  for (let i = 0; i < outCount; i++) {
    const srcIdx = i * ratio
    const lo     = Math.floor(srcIdx)
    const hi     = Math.min(lo + 1, srcCount - 1)
    const frac   = srcIdx - lo
    resampled[i] = mono[startSample + lo] * (1 - frac) + mono[startSample + hi] * frac
  }

  const count = outCount
  const buf   = new ArrayBuffer(44 + count * 2)
  const v     = new DataView(buf)
  const ws    = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
  ws(0, 'RIFF'); v.setUint32(4, 36 + count * 2, true); ws(8, 'WAVE')
  ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, ACR_SAMPLE_RATE, true); v.setUint32(28, ACR_SAMPLE_RATE * 2, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  ws(36, 'data'); v.setUint32(40, count * 2, true)
  let off = 44
  for (let i = 0; i < count; i++) {
    const s = Math.max(-1, Math.min(1, resampled[i]))
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    off += 2
  }
  return new Blob([buf], { type: 'audio/wav' })
}

export function SetLab() {
  const [activeTab, setActiveTab] = useState<'library' | 'builder' | 'history' | 'discover' | 'scanner'>('library')
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
  const audioInputRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<NodeJS.Timeout | null>(null)
  // ── Mix Scanner state ───────────────────────────────────────────────────
  const [scannerFile, setScannerFile] = useState<File | null>(null)
  const [scannerDragOver, setScannerDragOver] = useState(false)
  const [scannerTracklist, setScannerTracklist] = useState('')
  const [scannerContext, setScannerContext] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState('')
  const [scanResult, setScanResult] = useState<any>(null)
  const [scanError, setScanError] = useState('')
  const scannerFileRef = useRef<HTMLInputElement>(null)
  const [scanPhase, setScanPhase] = useState<'upload' | 'detecting' | 'fingerprinting' | 'review' | 'analysing'>('upload')
  const [detectedTracks, setDetectedTracks] = useState<Array<{time_in: string, title: string, artist: string, confidence: number, found: boolean, acrCode?: number, acrMsg?: string}>>([])
  const scanAudioRef = useRef<any>(null)

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

        // Step 2: Claude enriches with key, energy, mix techniques etc
        const raw = await callClaude(
          'You are a music intelligence expert for DJs. Return ONLY valid JSON, no markdown.',
          `I have an audio file with these detected properties:
Title: ${analysis.title || 'Unknown'}
Artist: ${analysis.artist || 'Unknown'}
Detected BPM: ${analysis.bpm} (confidence: ${analysis.confidence})
Duration: ${analysis.duration}
Filename: ${analysis.fileName}

${analysis.confidence === 'low' ? 'BPM detection confidence is low — please verify/correct the BPM based on your knowledge of this track.' : ''}

Return JSON:
{
  "title": "correct track title",
  "artist": "correct artist name",
  "bpm": ${analysis.confidence === 'high' ? analysis.bpm : 'corrected BPM as number'},
  "key": "musical key (e.g. F minor)",
  "camelot": "Camelot code (e.g. 4A)",
  "energy": number 1-10,
  "genre": "genre",
  "moment_type": "opener|builder|peak|breakdown|closer",
  "position_score": "warm-up|build|peak|cool-down",
  "mix_in": "specific DJ mix-in technique",
  "mix_out": "specific mix-out technique",
  "crowd_reaction": "expected crowd response in 5-8 words",
  "producer_style": "one sentence about production style",
  "notes": "when/how to use in a set"
}`, 400)

        const d = JSON.parse(raw.replace(/```json|```/g, '').trim())
        const track: Track = {
          id: Date.now().toString() + Math.random(),
          title: d.title || analysis.title || 'Unknown',
          artist: d.artist || analysis.artist || 'Unknown',
          bpm: d.bpm || analysis.bpm || 128,
          key: d.key || '',
          camelot: d.camelot || '',
          energy: d.energy || 5,
          genre: d.genre || 'Electronic',
          duration: analysis.duration,
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

  const filteredLibrary = library.filter(t =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.genre.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.moment_type.toLowerCase().includes(searchQuery.toLowerCase())
  )

  function addToSet(track: Track) {
    const prev = set[set.length - 1]
    const compatibility = prev ? getCompatibility(prev.camelot, track.camelot) : 100
    const flow_score = prev ? getFlowScore(prev, track) : 100
    const setTrack: SetTrack = { ...track, position: set.length + 1, transition_note: '', compatibility, flow_score }
    setSet(s => [...s, setTrack])
    setSuggestions([])
    showToast(`${track.title} added to set`, 'Set')
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

    // Score each available track
    const scored = available.map(t => ({
      ...t,
      score: getFlowScore(lastTrack, t),
    })).sort((a, b) => b.score - a.score)

    // Get top 5 and ask Claude for reasoning
    const top5 = scored.slice(0, 5)
    try {
      const raw = await callClaude(
        'You are a DJ set construction expert. Return ONLY valid JSON array, no markdown.',
        `I just played: ${lastTrack.artist} — ${lastTrack.title} (${lastTrack.bpm}BPM, ${lastTrack.camelot}, energy ${lastTrack.energy}/10, ${lastTrack.moment_type})

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

  // ── Rekordbox XML Export ──────────────────────────────────────────────
  function exportToRekordbox() {
    const tracks = set.length > 0 ? set : library
    if (tracks.length === 0) { showToast('No tracks to export', 'Error'); return }

    // Reverse Camelot → Rekordbox key mapping
    const camelotToKey: Record<string, string> = {
      '8A': 'Am', '9A': 'Em', '10A': 'Bm', '11A': 'F#m', '12A': 'Dbm', '1A': 'Abm',
      '2A': 'Ebm', '3A': 'Bbm', '4A': 'Fm', '5A': 'Cm', '6A': 'Gm', '7A': 'Dm',
      '8B': 'C', '9B': 'G', '10B': 'D', '11B': 'A', '12B': 'E', '1B': 'B',
      '2B': 'F#', '3B': 'Db', '4B': 'Ab', '5B': 'Eb', '6B': 'Bb', '7B': 'F',
    }

    const trackXml = tracks.map((t, i) => {
      const tonality = camelotToKey[t.camelot] || t.key || ''
      const dur = t.duration ? t.duration.split(':').reduce((acc, v, j) => acc + parseInt(v) * (j === 0 ? 60 : 1), 0) : 300
      return `    <TRACK TrackID="${i + 1}" Name="${escXml(t.title)}" Artist="${escXml(t.artist)}" TotalTime="${dur}" BPM="${t.bpm.toFixed(2)}" Tonality="${tonality}" Rating="${Math.min(Math.round(t.energy / 2), 5) * 51}" />`
    }).join('\n')

    const playlistTracks = tracks.map((_, i) => `      <TRACK Key="${i + 1}" />`).join('\n')
    const playlistName = set.length > 0 ? (setName || 'Set Lab Export') : 'Set Lab Library'

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="Artist OS — Set Lab" Version="1.0" />
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

    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${playlistName.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')}.xml`
    a.click()
    URL.revokeObjectURL(url)
    showToast(`Exported ${tracks.length} tracks as Rekordbox XML`, 'Export')
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
    const setData = { name: setName, venue, slot_type: slotType, tracks: JSON.stringify(set), narrative, created_at: new Date().toISOString() }
    try {
      await supabase.from('dj_sets').insert(setData)
      showToast('Set saved', 'Done')
      loadPastSets()
    } catch {
      showToast('Saved locally', 'Done')
      setPastSets(p => [...p, setData])
    }
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
        })))
      } else {
        setLibrary(SAMPLE_LIBRARY)
      }
    } catch {
      setLibrary(SAMPLE_LIBRARY)
    } finally {
      setLibraryLoading(false)
    }
  }

  async function deleteTrack(id: string) {
    await fetch('/api/tracks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setLibrary(prev => prev.filter(t => t.id !== id))
    showToast('Track removed', 'Done')
  }

  async function reanalyseTrack(track: Track) {
    setReanalysing(track.id)
    try {
      const raw = await callClaude(
        'You are a DJ music intelligence expert. Cross-reference this track with your knowledge and correct any errors. Return ONLY valid JSON, no markdown.',
        `Cross-reference and correct this track data. The BPM and key may be wrong from Rekordbox analysis — use your knowledge to verify.

Track: ${track.artist} — ${track.title}
Rekordbox BPM: ${track.bpm}
Rekordbox Key: ${track.key} / Camelot: ${track.camelot}

Return corrected JSON:
{
  "bpm": corrected BPM as number,
  "key": "corrected key e.g. F minor",
  "camelot": "corrected Camelot code e.g. 4A",
  "energy": number 1-10,
  "moment_type": "opener|builder|peak|breakdown|closer",
  "position_score": "warm-up|build|peak|cool-down",
  "mix_in": "specific mix-in technique",
  "mix_out": "specific mix-out technique",
  "crowd_reaction": "expected crowd response in 5-8 words",
  "producer_style": "one sentence about production style",
  "notes": "when/how to use in a set",
  "bpm_corrected": true or false,
  "key_corrected": true or false
}`, 500)

      const d = JSON.parse(raw.replace(/```json|```/g, '').trim())
      const updated = { ...track, ...d }

      await fetch('/api/tracks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: track.id, ...d }),
      })

      setLibrary(prev => prev.map(t => t.id === track.id ? updated : t))
      const corrections = [d.bpm_corrected && `BPM → ${d.bpm}`, d.key_corrected && `Key → ${d.key}`].filter(Boolean)
      showToast(corrections.length ? `Corrected: ${corrections.join(', ')}` : 'Analysis verified — no corrections needed', 'Intelligence')
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

  // ── Mix Scanner — Phase 1: Decode + Detect + Fingerprint ───────────────
  async function analyseMix() {
    if (!scannerFile) { showToast('No mix file loaded', 'Error'); return }
    setScanPhase('detecting')
    setScanning(true)
    setScanResult(null)
    setScanError('')
    setDetectedTracks([])

    try {
      // 1. Decode audio
      setScanProgress('Decoding audio…')
      const arrayBuffer = await scannerFile.arrayBuffer()
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      const audioCtx = new AudioCtx()
      let decoded: AudioBuffer
      try {
        decoded = await audioCtx.decodeAudioData(arrayBuffer)
      } catch {
        throw new Error('Could not decode audio — try MP3, WAV, or FLAC')
      }
      audioCtx.close()

      const duration   = decoded.duration
      const sampleRate = decoded.sampleRate

      // Mix down to mono
      setScanProgress('Analysing energy envelope…')
      const mono = new Float32Array(decoded.length)
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        const ch = decoded.getChannelData(c)
        for (let i = 0; i < decoded.length; i++) mono[i] += ch[i] / decoded.numberOfChannels
      }

      // RMS in 1-second windows
      const windowSize   = sampleRate
      const energyWindows: number[] = []
      for (let i = 0; i < mono.length; i += windowSize) {
        let sum = 0; const end = Math.min(i + windowSize, mono.length)
        for (let j = i; j < end; j++) sum += mono[j] * mono[j]
        energyWindows.push(Math.sqrt(sum / (end - i)))
      }
      const maxEnergy  = Math.max(...energyWindows) || 1
      const normEnergy = energyWindows.map(e => e / maxEnergy)
      const avgEnergy  = normEnergy.reduce((a, b) => a + b, 0) / normEnergy.length
      const peakEnergy = Math.max(...normEnergy)

      // Smooth + detect transitions
      setScanProgress('Finding tracks…')
      const smoothWindow = 4
      const smoothed: number[] = []
      for (let i = 0; i < normEnergy.length; i++) {
        let sum = 0, count = 0
        for (let j = Math.max(0, i - smoothWindow); j <= Math.min(normEnergy.length - 1, i + smoothWindow); j++) {
          sum += normEnergy[j]; count++
        }
        smoothed.push(sum / count)
      }
      const transitions: { time_seconds: number; energy_before: number; energy_after: number; energy_dip: number }[] = []
      let lastAt = -60
      for (let i = smoothWindow; i < smoothed.length - smoothWindow; i++) {
        const before = smoothed.slice(Math.max(0, i - 8), i).reduce((a, b) => a + b, 0) / 8
        const after  = smoothed.slice(i + 1, Math.min(smoothed.length, i + 9)).reduce((a, b) => a + b, 0) / 8
        const here   = smoothed[i]
        const dip    = ((before + after) / 2) - here
        const isMin  = smoothed[i - 1] >= here && smoothed[i + 1] >= here
        if (isMin && dip > 0.05 && (i - lastAt) >= 60) {
          transitions.push({ time_seconds: i, energy_before: before, energy_after: after, energy_dip: dip })
          lastAt = i
        }
      }
      const topTransitions = transitions.sort((a, b) => b.energy_dip - a.energy_dip).slice(0, 25).sort((a, b) => a.time_seconds - b.time_seconds)

      // BPM estimate
      let bpmEstimate: number | null = null
      if (duration < 7200) {
        const midStart  = Math.floor((mono.length / 2) - sampleRate * 30)
        const snippet   = mono.slice(Math.max(0, midStart), midStart + sampleRate * 60)
        const hopSize   = Math.round(sampleRate / 20)
        const onsets: number[] = []
        for (let i = hopSize; i < snippet.length; i += hopSize) {
          let s = 0; for (let j = 0; j < hopSize; j++) s += snippet[i + j] * snippet[i + j]
          onsets.push(Math.sqrt(s / hopSize))
        }
        let bestBpm = 128, bestScore = -1
        for (let bpm = 90; bpm <= 180; bpm++) {
          const period = (60 / bpm) * 20; let score = 0
          for (let i = 0; i < onsets.length; i++) {
            const j = Math.round(i + period) % onsets.length; score += onsets[i] * onsets[j]
          }
          if (score > bestScore) { bestScore = score; bestBpm = bpm }
        }
        bpmEstimate = bestBpm
      }

      // Store audio analysis data for later Claude call
      scanAudioRef.current = {
        filename:          scannerFile.name,
        duration_seconds:  Math.round(duration),
        avg_energy:        parseFloat(avgEnergy.toFixed(3)),
        peak_energy:       parseFloat(peakEnergy.toFixed(3)),
        transition_points: topTransitions,
        bpm_estimate:      bpmEstimate,
      }

      // 2. Fingerprint each segment
      setScanPhase('fingerprinting')
      const segmentStarts = [0, ...topTransitions.map(t => t.time_seconds)]
      const segments = segmentStarts.map((startTime, i) => ({
        startTime,
        endTime: i < segmentStarts.length - 1 ? segmentStarts[i + 1] : duration,
      })).slice(0, 30) // cap at 30 tracks

      const results: Array<{ time_in: string; title: string; artist: string; confidence: number; found: boolean }> = []

      for (let i = 0; i < segments.length; i++) {
        setScanProgress(`Identifying track ${i + 1} of ${segments.length}…`)
        const seg      = segments[i]
        const segLen   = seg.endTime - seg.startTime
        // Sample from 8 seconds after segment start (skip blend zone), for 15 seconds
        const sampleStartSec = seg.startTime + Math.min(8, segLen * 0.25)
        const sampleDurSec   = Math.min(15, segLen - (sampleStartSec - seg.startTime))

        const mm = Math.floor(seg.startTime / 60).toString().padStart(2, '0')
        const ss = Math.floor(seg.startTime % 60).toString().padStart(2, '0')
        const timeIn = `${mm}:${ss}`

        if (sampleDurSec < 5) {
          results.push({ time_in: timeIn, title: 'Unknown', artist: '', confidence: 0, found: false })
          continue
        }

        try {
          const startSample = Math.floor(sampleStartSec * sampleRate)
          const numSamples  = Math.floor(sampleDurSec * sampleRate)
          const wavBlob     = encodeWAVSnippet(mono, sampleRate, startSample, numSamples)

          const fd = new FormData()
          fd.append('audio', wavBlob, 'snippet.wav')
          const resp = await fetch('/api/fingerprint', { method: 'POST', body: fd })
          const data = await resp.json()

          console.log(`[ACR] T${i + 1} @ ${timeIn}:`, data)
          if (data.found) {
            results.push({ time_in: timeIn, title: data.title, artist: data.artist, confidence: data.confidence, found: true })
          } else {
            results.push({ time_in: timeIn, title: 'Unknown / White label', artist: '', confidence: 0, found: false, acrCode: data.code, acrMsg: data.msg })
          }
        } catch {
          results.push({ time_in: timeIn, title: 'Unknown', artist: '', confidence: 0, found: false })
        }
      }

      setDetectedTracks(results)

      // Auto-populate the tracklist textarea
      const autoTracklist = results.map((t, i) =>
        `${i + 1}. ${t.time_in}  ${t.found ? `${t.artist} - ${t.title}` : 'Unknown / White label'}`
      ).join('\n')
      setScannerTracklist(autoTracklist)

      setScanPhase('review')
      setScanning(false)
      setScanProgress('')

    } catch (err: any) {
      setScanError(err.message || 'Analysis failed')
      setScanning(false)
      setScanProgress('')
      setScanPhase('upload')
    }
  }

  // ── Mix Scanner — Phase 2: Claude Analysis ──────────────────────────────
  async function runClaudeAnalysis() {
    if (!scanAudioRef.current) { showToast('No scan data — re-upload the mix', 'Error'); return }
    setScanPhase('analysing')
    setScanning(true)
    setScanProgress('Getting AI analysis…')
    try {
      const resp = await fetch('/api/mix-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...scanAudioRef.current,
          tracklist: scannerTracklist.trim() || undefined,
          context:   scannerContext.trim()   || undefined,
        }),
      })
      const data = await resp.json()
      if (!resp.ok || data.error) throw new Error(data.error || 'Analysis failed')
      setScanResult(data.result)
      setScanPhase('upload') // reset for next scan
    } catch (err: any) {
      setScanError(err.message || 'Analysis failed')
      setScanPhase('review') // go back to review so they can retry
    } finally {
      setScanning(false)
      setScanProgress('')
    }
  }

  async function discoverTracks(pop = maxPopularity) {
    const seedTracks = library.length > 0 ? library : set
    if (seedTracks.length === 0) { setDiscoverError('Add some tracks to your library first'); return }
    setDiscoverLoading(true)
    setDiscoverError('')
    setDiscoverResults([])
    try {
      const res = await fetch('/api/spotify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: seedTracks.slice(0, 8), maxPopularity: pop, limit: 20 }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setDiscoverResults(data.tracks || [])
      setDiscoverMeta({ targetCamelot: data.targetCamelot, targetBpm: data.targetBpm, debug: data.debug })
      setDiscoverCallCount(c => c + 1)
    } catch (err: any) {
      setDiscoverError(err.message)
    } finally {
      setDiscoverLoading(false)
    }
  }

  useEffect(() => { loadLibrary(); loadPastSets() }, [])

  // ── Styles ─────────────────────────────────────────────────────────────
  const s = {
    bg: '#070706', panel: '#0e0d0b', border: '#1a1917', borderBright: '#2e2c29',
    gold: '#b08d57', goldDim: '#6a4e28', text: '#f0ebe2', textDim: '#8a8780', textDimmer: '#52504c',
    black: '#070706', setlab: '#9a6a5a', font: "'DM Mono', monospace",
  }

  const btn = (color = s.gold, bg = s.panel) => ({
    fontFamily: s.font, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase' as const,
    padding: '10px 22px', background: bg, border: `1px solid ${color}`, color, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '8px',
  })

  return (
    <div style={{ minHeight: '100vh', background: s.bg, color: s.text, fontFamily: s.font }}>

      {/* HEADER */}
      <div style={{ background: s.panel, borderBottom: `2px solid ${s.borderBright}`, padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ background: s.panel, border: `1px solid ${s.borderBright}`, padding: '10px 20px' }}>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '18px', fontWeight: 300, letterSpacing: '0.2em', color: s.setlab, textShadow: `0 0 20px rgba(154,106,90,0.2)` }}>SET<span style={{ color: s.goldDim }}>LAB</span></div>
            <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.goldDim, marginTop: '2px' }}>INTELLIGENT DJ COMPANION</div>
          </div>
          <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: s.textDimmer }}>
            {library.length} tracks · {set.length} in set · {setLength}min slot
          </div>
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          {(['library', 'builder', 'history', 'discover', 'scanner'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              ...btn(activeTab === tab ? s.setlab : s.goldDim, activeTab === tab ? s.setlab : 'transparent'),
              fontSize: '10px', padding: '8px 18px',
              color: activeTab === tab ? s.bg : s.setlab,
            }}>{tab}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={saveSet} style={btn(s.gold)}>Save set</button>
          <button onClick={exportToRekordbox} style={btn('#3d6b4a', s.panel)}>
            Export to rekordbox →
          </button>
        </div>
      </div>

      <div style={{ padding: '28px 32px' }}>

        {/* ═══ LIBRARY TAB ═══ */}
        {activeTab === 'library' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

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
                  <div style={{ width: '12px', height: '12px', border: `2px solid ${s.setlab}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <div style={{ fontSize: '12px', color: s.setlab }}>{audioProgress}</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '13px', color: dragOver ? s.setlab : s.textDim, marginBottom: '4px' }}>
                    {dragOver ? 'Drop audio files here' : 'Drop MP3, WAV, or FLAC files here — or click to browse'}
                  </div>
                  <div style={{ fontSize: '10px', color: s.textDimmer }}>
                    Extracts BPM from audio waveform · Claude adds key, energy, mix techniques, crowd reaction
                  </div>
                </div>
              )}
            </div>

            {/* Track library with expandable intelligence */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 65px 65px 65px 55px 90px 80px', gap: '0', padding: '12px 20px', borderBottom: `1px solid ${s.border}` }}>
                {['Track', 'Artist', 'BPM', 'Key', 'Camelot', 'Energy', 'Moment', ''].map(h => (
                  <div key={h} style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.textDimmer, textTransform: 'uppercase' }}>{h}</div>
                ))}
              </div>
              {filteredLibrary.map(track => (
                <div key={track.id}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 65px 65px 65px 55px 90px 80px', gap: '0', padding: '14px 20px', borderBottom: `1px solid ${s.border}`, transition: 'background 0.15s', cursor: 'pointer' }}
                    onClick={() => setExpandedTrack(expandedTrack === track.id ? null : track.id)}
                    onMouseEnter={e => (e.currentTarget.style.background = s.bg)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div>
                      <div style={{ fontSize: '13px', letterSpacing: '0.05em', color: s.text }}>{track.title}</div>
                      {track.notes && <div style={{ fontSize: '10px', color: s.textDimmer, fontStyle: 'italic', fontFamily: 'Georgia, serif', marginTop: '2px' }}>{track.notes}</div>}
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
                      <span style={{ fontSize: '10px', padding: '3px 8px', background: getMomentColor(track.moment_type) + '20', border: `1px solid ${getMomentColor(track.moment_type)}40`, color: getMomentColor(track.moment_type), letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        {track.moment_type}
                      </span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); addToSet(track) }} style={{ ...btn(s.gold), fontSize: '10px', padding: '6px 12px' }}>Add →</button>
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
                            <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.5', marginBottom: '12px', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
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
          </div>
        )}

        {/* ═══ SET BUILDER TAB ═══ */}
        {activeTab === 'builder' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Set config */}
              <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
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
                    {suggestingNext && <div style={{ width: '10px', height: '10px', border: `1px solid ${s.setlab}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
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
                              <div style={{ fontSize: '10px', color: s.textDim, marginTop: '4px', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{sug.reason}</div>
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
                  {generatingNarrative && <div style={{ width: '10px', height: '10px', border: `1px solid ${s.gold}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
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
        )}

        {/* ═══ HISTORY TAB ═══ */}
        {activeTab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '16px' }}>Past sets</div>
              {pastSets.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: s.textDimmer, fontSize: '12px' }}>
                  No past sets yet — save your first set in the Builder tab
                </div>
              ) : (
                pastSets.map((ps, i) => (
                  <div key={i} style={{ padding: '16px', border: `1px solid ${s.border}`, marginBottom: '8px', background: s.black }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ fontSize: '13px', color: s.text }}>{ps.name || 'Unnamed set'}</div>
                      <div style={{ fontSize: '10px', color: s.textDimmer }}>{new Date(ps.created_at).toLocaleDateString('en-GB')}</div>
                    </div>
                    {ps.venue && <div style={{ fontSize: '11px', color: s.textDim, marginBottom: '4px' }}>{ps.venue} · {ps.slot_type}</div>}
                    {ps.narrative && <div style={{ fontSize: '10px', color: s.textDimmer, fontStyle: 'italic', fontFamily: 'Georgia, serif', lineHeight: '1.5', marginTop: '8px' }}>{ps.narrative.slice(0, 200)}...</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ═══ DISCOVER TAB ═══ */}
        {activeTab === 'discover' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Header + controls */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '13px', fontWeight: 300, letterSpacing: '0.2em', color: s.setlab, marginBottom: '6px' }}>DISCOVER</div>
                  <div style={{ fontSize: '11px', color: s.textDimmer, letterSpacing: '0.05em', lineHeight: '1.6' }}>
                    Finds tracks that fit your set's key, BPM, and sound — ranked rarest first.<br/>
                    {discoverMeta && <span style={{ color: s.goldDim }}>Seeded from {discoverMeta.targetCamelot} · {discoverMeta.targetBpm} BPM</span>}
                  </div>
                </div>
                <div style={{ fontSize: '10px', color: s.textDimmer, textAlign: 'right', lineHeight: '1.7' }}>
                  <div>Spotify-powered</div>
                  <div>Camelot-filtered</div>
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
                  {/* Track fill */}
                  <div style={{ position: 'absolute', top: 0, left: 0, height: '4px', width: `${maxPopularity}%`, background: maxPopularity < 25 ? '#9a6a5a' : maxPopularity < 50 ? s.gold : '#3d6b4a', transition: 'width 0.15s' }} />
                  {/* Thumb */}
                  <div style={{ position: 'absolute', top: '50%', left: `${maxPopularity}%`, transform: 'translate(-50%, -50%)', width: '14px', height: '14px', background: s.panel, border: `2px solid ${maxPopularity < 25 ? '#9a6a5a' : maxPopularity < 50 ? s.gold : '#3d6b4a'}`, borderRadius: '50%', cursor: 'grab' }} />
                </div>
                <input type="range" min={5} max={100} value={maxPopularity}
                  onChange={e => setMaxPopularity(Number(e.target.value))}
                  style={{ position: 'absolute', opacity: 0, width: '1px', height: '1px', pointerEvents: 'none' }} />
                {/* Labels */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '10px', color: s.textDimmer }}>
                  <span>Rare</span>
                  <span>Underground</span>
                  <span>Known</span>
                  <span>Popular</span>
                </div>
              </div>

              <button
                onClick={() => discoverTracks(maxPopularity)}
                disabled={discoverLoading}
                style={{ ...btn(s.setlab), justifyContent: 'center', width: '100%', fontSize: '11px', padding: '13px' }}>
                {discoverLoading
                  ? <><div style={{ width: '10px', height: '10px', border: `1px solid ${s.setlab}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Finding rare gems...</>
                  : 'Find rare gems →'}
              </button>

              {/* API usage counter */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', padding: '8px 12px', background: discoverCallCount >= 8 ? 'rgba(154,106,90,0.15)' : 'transparent', border: `1px solid ${discoverCallCount >= 8 ? 'rgba(154,106,90,0.4)' : s.border}` }}>
                <div style={{ fontSize: '10px', color: discoverCallCount >= 8 ? '#9a6a5a' : s.textDimmer }}>
                  {discoverCallCount >= 8 ? '⚠ ' : ''}{discoverCallCount} discover {discoverCallCount === 1 ? 'search' : 'searches'} this session
                  {discoverCallCount >= 8 && ' — each search calls Claude + Last.fm + Spotify'}
                </div>
                <div style={{ fontSize: '10px', color: s.textDimmer }}>
                  ~£{(discoverCallCount * 0.001).toFixed(3)} Claude cost
                </div>
              </div>

              {/* Debug: seeds used */}
              {discoverMeta?.debug && (
                <div style={{ marginTop: '8px', padding: '8px 12px', background: s.bg, border: `1px solid ${s.border}`, fontSize: '10px', color: s.textDimmer, lineHeight: '1.7' }}>
                  <div style={{ color: s.textDim, marginBottom: '4px' }}>Last search — seeds used:</div>
                  {discoverMeta.debug.lastFmSeeds?.map((seed: string, i: number) => (
                    <div key={i}>Last.fm seed {i + 1}: {seed}</div>
                  ))}
                  <div style={{ marginTop: '4px', color: s.textDimmer }}>
                    Claude: {discoverMeta.debug.claudeCount} suggestions · Last.fm: {discoverMeta.debug.lastFmCount} similar · {discoverMeta.debug.mergedBeforeFilter} merged → {discoverMeta.debug.afterPopularityFilter} after popularity filter
                  </div>
                </div>
              )}

              {discoverError && (
                <div style={{ marginTop: '12px', fontSize: '11px', color: '#9a6a5a', padding: '10px 14px', background: 'rgba(154,106,90,0.1)', border: '1px solid rgba(154,106,90,0.3)' }}>
                  {discoverError}
                </div>
              )}
            </div>

            {/* Results grid */}
            {discoverResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: `1px solid ${s.border}` }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase' }}>
                    {discoverResults.length} matches — sorted rarest first
                  </div>
                  {discoverMeta && (
                    <div style={{ fontSize: '10px', color: s.textDimmer }}>
                      Compatible with {discoverMeta.targetCamelot} · ~{discoverMeta.targetBpm} BPM
                    </div>
                  )}
                </div>

                {discoverResults.map((track: any) => {
                  const popLabel = track.popularity < 20 ? 'Rare' : track.popularity < 40 ? 'Underground' : track.popularity < 65 ? 'Known' : 'Popular'
                  const popColor = track.popularity < 20 ? '#9a6a5a' : track.popularity < 40 ? s.gold : track.popularity < 65 ? '#3d6b4a' : s.textDimmer
                  const alreadyInLib = library.some(t => t.title.toLowerCase() === track.title.toLowerCase() && t.artist.toLowerCase() === track.artist.toLowerCase())

                  return (
                    <div key={track.id} style={{ background: s.panel, border: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 18px', transition: 'border-color 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = s.borderBright)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = s.border)}>

                      {/* Album art */}
                      {track.album_art
                        ? <img src={track.album_art} alt="" style={{ width: '52px', height: '52px', objectFit: 'cover', flexShrink: 0 }} />
                        : <div style={{ width: '52px', height: '52px', background: s.bg, border: `1px solid ${s.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: s.textDimmer }}>♫</div>
                      }

                      {/* Track info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', color: s.text, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
                        <div style={{ fontSize: '11px', color: s.textDim, marginTop: '2px' }}>{track.artist}</div>
                        {track.reason && <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '3px', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{track.reason}</div>}
                        {track.release_year && <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '2px' }}>{track.album} · {track.release_year}</div>}
                      </div>

                      {/* Tags */}
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: '10px', padding: '3px 8px', background: `${popColor}20`, border: `1px solid ${popColor}50`, color: popColor, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{popLabel}</div>
                        {track.camelot && <div style={{ fontSize: '11px', color: s.gold, minWidth: '32px', textAlign: 'center' }}>{track.camelot}</div>}
                        {track.bpm && <div style={{ fontSize: '11px', color: s.textDim, minWidth: '36px', textAlign: 'center' }}>{track.bpm}</div>}
                        <div style={{ fontSize: '9px', color: s.textDimmer, letterSpacing: '0.1em' }}>{track.source === 'lastfm' ? 'LAST.FM' : 'AI'}</div>
                      </div>

                      {/* Preview + links */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                        {track.preview_url && (
                          <audio controls src={track.preview_url}
                            style={{ height: '28px', width: '160px', filter: 'invert(0.8) sepia(0.4) hue-rotate(10deg)' }} />
                        )}
                        {track.spotify_url && (
                          <a href={track.spotify_url} target="_blank" rel="noreferrer"
                            style={{ fontSize: '10px', color: '#1DB954', textDecoration: 'none', letterSpacing: '0.1em', border: '1px solid #1DB95440', padding: '4px 8px' }}>
                            Open ↗
                          </a>
                        )}
                      </div>

                      {/* Add to library */}
                      <button
                        disabled={alreadyInLib}
                        onClick={async () => {
                          if (alreadyInLib) return
                          const t: Track = {
                            id: track.id,
                            title: track.title,
                            artist: track.artist,
                            bpm: track.bpm,
                            key: '',
                            camelot: track.camelot,
                            energy: track.energy || 5,
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
                          // Save to DB
                          await fetch('/api/tracks', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ tracks: [t] }),
                          })
                          setLibrary(prev => [...prev, t])
                          showToast(`${track.title} added to library`, 'Added')
                        }}
                        style={{
                          ...btn(alreadyInLib ? s.textDimmer : s.setlab, 'transparent'),
                          fontSize: '10px', padding: '6px 12px', flexShrink: 0,
                          opacity: alreadyInLib ? 0.4 : 1, cursor: alreadyInLib ? 'default' : 'pointer',
                        }}>
                        {alreadyInLib ? '✓ In library' : '+ Add'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Empty state */}
            {!discoverLoading && discoverResults.length === 0 && !discoverError && (
              <div style={{ textAlign: 'center', padding: '60px 32px', color: s.textDimmer }}>
                <div style={{ fontSize: '32px', marginBottom: '16px', opacity: 0.3 }}>◎</div>
                <div style={{ fontSize: '12px', letterSpacing: '0.15em', marginBottom: '8px' }}>Set the underground depth and search</div>
                <div style={{ fontSize: '11px', color: s.textDimmer }}>
                  Uses your library as seeds · Camelot-compatible only · Sorted rarest first
                </div>
              </div>
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
                  Upload a recorded DJ mix · AI analyses energy, transitions, flow and technique · Rated out of 10
                </div>
              </div>
              {scanResult && (
                <button onClick={() => { setScanResult(null); setScannerFile(null); setScanError(''); setScanPhase('upload'); setDetectedTracks([]) }}
                  style={{ ...btn(s.textDim, 'transparent'), fontSize: '10px', padding: '8px 14px' }}>
                  Scan another mix
                </button>
              )}
            </div>

            {/* Upload zone — only shown when no file and no result */}
            {!scannerFile && !scanResult && scanPhase === 'upload' && (
              <div
                onDragOver={e => { e.preventDefault(); setScannerDragOver(true) }}
                onDragLeave={() => setScannerDragOver(false)}
                onDrop={e => {
                  e.preventDefault(); setScannerDragOver(false)
                  const f = e.dataTransfer.files[0]
                  if (f && /\.(mp3|wav|flac|aac|m4a|ogg|aiff?)$/i.test(f.name)) setScannerFile(f)
                  else showToast('Drop an audio file — MP3, WAV, or FLAC', 'Error')
                }}
                onClick={() => scannerFileRef.current?.click()}
                style={{
                  border: `2px dashed ${scannerDragOver ? s.setlab : s.border}`,
                  background: scannerDragOver ? 'rgba(154,106,90,0.06)' : s.panel,
                  padding: '64px 32px', textAlign: 'center', cursor: 'pointer',
                  transition: 'all 0.2s',
                }}>
                <input ref={scannerFileRef} type="file" accept=".mp3,.wav,.flac,.aac,.m4a,.ogg,.aif,.aiff"
                  style={{ display: 'none' }} onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) setScannerFile(f)
                  }} />
                <div style={{ fontSize: '28px', marginBottom: '16px', opacity: 0.3 }}>◎</div>
                <div style={{ fontSize: '12px', letterSpacing: '0.18em', color: s.text, textTransform: 'uppercase', marginBottom: '8px' }}>
                  Drop mix file here or click to browse
                </div>
                <div style={{ fontSize: '10px', color: s.textDimmer }}>
                  MP3 · WAV · FLAC · M4A · up to 2 hours
                </div>
              </div>
            )}

            {/* Scanning progress — shown during detect + fingerprint phases */}
            {(scanPhase === 'detecting' || scanPhase === 'fingerprinting') && (
              <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '40px 32px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '16px' }}>
                  {scanPhase === 'detecting' ? 'Analysing mix' : 'Identifying tracks'}
                </div>
                <div style={{ fontSize: '12px', color: s.textDim, marginBottom: '8px' }}>{scanProgress}</div>
                {scanPhase === 'fingerprinting' && (
                  <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '8px' }}>
                    Using ACRCloud audio fingerprinting · {detectedTracks.length} tracks found so far
                  </div>
                )}
              </div>
            )}

            {/* File loaded — ready to analyse */}
            {scannerFile && !scanResult && scanPhase === 'upload' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* File info bar */}
                <div style={{ background: s.panel, border: `1px solid ${s.borderBright}`, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.setlab, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '12px', color: s.text, letterSpacing: '0.05em' }}>{scannerFile.name}</div>
                      <div style={{ fontSize: '10px', color: s.textDimmer, marginTop: '2px' }}>
                        {(scannerFile.size / 1024 / 1024).toFixed(1)} MB
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setScannerFile(null)}
                    style={{ ...btn(s.textDim, 'transparent'), fontSize: '10px', padding: '6px 12px' }}>
                    Remove
                  </button>
                </div>

                {/* Tracklist note */}
                <div style={{ background: 'rgba(176,141,87,0.06)', border: `1px solid rgba(176,141,87,0.2)`, padding: '12px 16px', fontSize: '11px', color: s.textDim, lineHeight: '1.6' }}>
                  <span style={{ color: s.gold }}>For accurate analysis, add your tracklist below.</span>{' '}
                  Without it, the scanner can only read loudness and timing — it cannot assess track selection, key mixing, or set narrative.
                </div>

                {/* Optional context */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
                    <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.gold, textTransform: 'uppercase', marginBottom: '8px' }}>
                      Tracklist <span style={{ color: s.textDimmer }}>— recommended for real analysis</span>
                    </div>
                    <textarea
                      value={scannerTracklist}
                      onChange={e => setScannerTracklist(e.target.value)}
                      placeholder={'1. Artist - Title\n2. Artist - Title\n3. Artist - Title\n...'}
                      rows={4}
                      style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '10px 14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.6' }}
                    />
                  </div>
                </div>

                {/* Analyse button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <button
                    onClick={analyseMix}
                    disabled={scanning}
                    style={{
                      ...btn(s.setlab),
                      fontSize: '11px', padding: '14px 32px',
                      opacity: scanning ? 0.5 : 1, cursor: scanning ? 'wait' : 'pointer',
                    }}>
                    {scanning ? scanProgress || 'Analysing...' : 'Analyse mix →'}
                  </button>
                  {scanning && (
                    <div style={{ fontSize: '10px', color: s.textDimmer, letterSpacing: '0.1em' }}>
                      This takes 30–60 seconds for a long mix
                    </div>
                  )}
                </div>

                {scanError && (
                  <div style={{ background: 'rgba(192,64,64,0.1)', border: '1px solid rgba(192,64,64,0.3)', padding: '14px 18px', fontSize: '12px', color: '#c04040' }}>
                    {scanError}
                  </div>
                )}
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
                        Unknown tracks are likely white labels or unreleased — edit any corrections below
                      </div>
                      {detectedTracks.length > 0 && detectedTracks.filter(t => !t.found && t.acrCode !== undefined && t.acrCode !== 1001).length > 0 && (
                        <div style={{ marginTop: '6px', fontSize: '10px', color: '#c04040' }}>
                          ACRCloud errors detected — codes: {[...new Set(detectedTracks.filter(t => t.acrCode !== undefined && t.acrCode !== 1001).map(t => `${t.acrCode} ${t.acrMsg || ''}`))].join(', ')}
                        </div>
                      )}
                      {detectedTracks.length > 0 && detectedTracks.filter(t => !t.found && t.acrCode === undefined).length > 0 && (
                        <div style={{ marginTop: '6px', fontSize: '10px', color: '#b08d57' }}>
                          {detectedTracks.filter(t => !t.found && t.acrCode === undefined).length} network errors — check console for details
                        </div>
                      )}
                    </div>
                    <button onClick={() => { setScanPhase('upload'); setScannerFile(null); setDetectedTracks([]) }}
                      style={{ ...btn(s.textDim, 'transparent'), fontSize: '10px', padding: '6px 12px' }}>
                      Re-upload
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
                    {detectedTracks.map((t, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 10px', background: s.black, border: `1px solid ${t.found ? 'rgba(78,203,113,0.15)' : s.border}` }}>
                        <div style={{ fontSize: '10px', color: s.textDimmer, width: '24px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</div>
                        <div style={{ fontSize: '10px', color: s.textDimmer, width: '36px', flexShrink: 0, fontFamily: 'monospace' }}>{t.time_in}</div>
                        <div style={{ flex: 1, fontSize: '11px', color: t.found ? s.text : s.textDimmer }}>
                          {t.found ? `${t.artist} — ${t.title}` : 'Unknown / White label'}
                        </div>
                        {t.found && (
                          <div style={{ fontSize: '9px', color: '#4ecb71', letterSpacing: '0.08em', flexShrink: 0 }}>{t.confidence}%</div>
                        )}
                        {!t.found && (
                          <div style={{ fontSize: '9px', color: s.textDimmer, flexShrink: 0 }}>?</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Editable tracklist */}
                <div>
                  <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>
                    Edit tracklist <span style={{ opacity: 0.5 }}>— correct any wrong IDs before analysis</span>
                  </div>
                  <textarea
                    value={scannerTracklist}
                    onChange={e => setScannerTracklist(e.target.value)}
                    rows={6}
                    style={{ width: '100%', background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '10px 14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' as const, lineHeight: '1.6' }}
                  />
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
                    onClick={runClaudeAnalysis}
                    disabled={scanning}
                    style={{ ...btn(s.setlab), fontSize: '11px', padding: '14px 28px', flexShrink: 0 }}>
                    {scanning ? (scanProgress || 'Analysing…') : 'Analyse with Claude →'}
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
                    <span style={{ color: s.gold, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '9px' }}>Amplitude-only analysis</span>
                    <br />
                    This scan had no tracklist — results are based on loudness data only. For track-by-track feedback, key mixing analysis, and curation scoring, re-run with your tracklist added.
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
                      <div style={{ fontSize: '15px', color: s.text, lineHeight: '1.5', marginBottom: '12px', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
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
                      {scannerFile && (
                        <div>
                          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '3px' }}>Duration</div>
                          <div style={{ fontSize: '11px', color: s.textDim }}>{Math.round(scannerFile.size / 1024 / 1024)} MB</div>
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
                    <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.setlab, textTransform: 'uppercase', marginBottom: '16px' }}>Track-by-track</div>
                    {scanResult.tracks.map((t: any, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', paddingBottom: '12px', marginBottom: '12px', borderBottom: i < scanResult.tracks.length - 1 ? `1px solid ${s.border}` : 'none' }}>
                        <div style={{ fontSize: '10px', color: s.textDimmer, flexShrink: 0, paddingTop: '2px', width: '20px', textAlign: 'right' }}>{t.position}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: t.issue ? '6px' : 0 }}>
                            <div style={{ fontSize: '12px', color: s.text }}>{t.artist} — {t.title}</div>
                            {t.estimated_time && <div style={{ fontSize: '10px', color: s.textDimmer }}>{t.estimated_time}</div>}
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
                    ))}
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
                    <div style={{ fontSize: '13px', color: s.text, lineHeight: '1.8', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
                      {scanResult.overall_verdict}
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>
        )}

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

      {toast && (
        <div style={{ position: 'fixed', bottom: '28px', right: '28px', background: 'rgba(20,16,8,0.96)', border: `1px solid ${s.border}`, padding: '14px 20px', fontSize: '12px', letterSpacing: '0.07em', color: s.text, zIndex: 50, maxWidth: '300px', lineHeight: '1.55', backdropFilter: 'blur(12px)' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: s.setlab, marginBottom: '4px' }}>{toast.tag}</div>
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } select option { background: #1a1208; }`}</style>
    </div>
  )
}
